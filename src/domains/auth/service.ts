import { db } from "@/lib/db";
import { errors } from "@/lib/errors";
import {
  checkPasswordStrength,
  hashPassword,
  verifyPassword,
} from "@/lib/crypto";
import { destroyAllSessions } from "@/lib/auth/session";
import { parseOrThrow } from "@/lib/validation";
import {
  DEFAULT_ACCOUNTS,
  DEFAULT_AREAS,
  DEFAULT_CATEGORIES,
} from "./defaults";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
} from "./schemas";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Authentication service.
 *
 * All account creation goes through `registerUser` so the seed transaction
 * cannot be bypassed: a user without areas, categories and accounts would see
 * a broken product, and partially-seeded users are worse than none.
 */

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
};

/**
 * Creates a user together with everything the product needs to be usable on
 * first load.
 *
 * Runs in one transaction: if any seed step fails, no half-built account is
 * left behind.
 */
export async function registerUser(
  input: unknown,
  meta: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<PublicUser> {
  const data = parseOrThrow(registerSchema, input, "Periksa kembali data pendaftaran.");

  const strength = checkPasswordStrength(data.password);
  if (!strength.ok) {
    throw errors.validation(strength.message, { password: strength.message });
  }

  const existing = await db.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (existing) {
    // Deliberately explicit: registration is not a place to leak whether an
    // address is known, but silently succeeding would strand the user.
    throw errors.conflict("Email ini sudah terdaftar. Coba masuk saja.");
  }

  const passwordHash = await hashPassword(data.password);

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: data.email,
        displayName: data.displayName,
        passwordHash,
        timeZone: data.timeZone ?? "Asia/Jakarta",
      },
      select: { id: true, email: true, displayName: true },
    });

    await seedUserWorkspace(tx, created.id);

    return created;
  });

  void meta; // retained for future audit logging
  return user;
}

/**
 * Installs the baseline data set for a new account.
 *
 * Takes a transaction client so it always participates in the caller's
 * transaction.
 */
async function seedUserWorkspace(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  // Areas first: categories and accounts do not depend on them, but habits
  // created later will, so the ordering here is the natural setup order.
  await tx.area.createMany({
    data: DEFAULT_AREAS.map((area, index) => ({
      userId,
      name: area.name,
      description: area.description,
      colorToken: area.colorToken,
      iconName: area.iconName,
      position: index,
    })),
  });

  // Categories can nest, so parents must exist before children. The default
  // set is currently flat, but the loop keeps that a data change rather than
  // a code change.
  const byslug = new Map<string, string>();
  for (const category of DEFAULT_CATEGORIES) {
    if (category.parentSlug) continue;
    const row = await tx.category.create({
      data: {
        userId,
        name: category.name,
        slug: category.slug,
        kind: category.kind,
        colorToken: category.colorToken,
        iconName: category.iconName,
        isSystem: true,
      },
      select: { id: true },
    });
    byslug.set(category.slug, row.id);
  }
  for (const category of DEFAULT_CATEGORIES) {
    if (!category.parentSlug) continue;
    const parentId = byslug.get(category.parentSlug);
    if (!parentId) continue;
    const row = await tx.category.create({
      data: {
        userId,
        name: category.name,
        slug: category.slug,
        kind: category.kind,
        colorToken: category.colorToken,
        iconName: category.iconName,
        isSystem: true,
        parentId,
      },
      select: { id: true },
    });
    byslug.set(category.slug, row.id);
  }

  await tx.account.createMany({
    data: DEFAULT_ACCOUNTS.map((account, index) => ({
      userId,
      name: account.name,
      type: account.type,
      colorToken: account.colorToken,
      iconName: account.iconName,
      openingBalance: 0n,
      position: index,
    })),
  });
}

export async function authenticate(
  input: unknown,
  meta: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<PublicUser> {
  const data = parseOrThrow(loginSchema, input, "Email atau kata sandi tidak valid.");

  const user = await db.user.findUnique({
    where: { email: data.email },
    select: { id: true, email: true, displayName: true, passwordHash: true },
  });

  // A single generic message for both "no such user" and "wrong password",
  // so the endpoint cannot be used to enumerate registered addresses.
  const genericFailure = errors.validation("Email atau kata sandi salah.", {
    password: "Email atau kata sandi salah.",
  });

  if (!user) {
    // Hash anyway so a missing user and a wrong password take similar time.
    await verifyPassword(data.password, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin");
    throw genericFailure;
  }

  const valid = await verifyPassword(data.password, user.passwordHash);
  if (!valid) throw genericFailure;

  await db.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date() },
  });

  void meta;
  return { id: user.id, email: user.email, displayName: user.displayName };
}

/** Owns the password change flow, including revoking other sessions. */
export async function changePassword(
  userId: string,
  input: unknown,
  options: { keepCurrentSession?: boolean } = {},
): Promise<void> {
  const data = parseOrThrow(changePasswordSchema, input, "Periksa kembali data kata sandi.");

  const strength = checkPasswordStrength(data.newPassword);
  if (!strength.ok) {
    throw errors.validation(strength.message, { newPassword: strength.message });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) throw errors.notFound("Pengguna");

  const valid = await verifyPassword(data.currentPassword, user.passwordHash);
  if (!valid) {
    throw errors.validation("Kata sandi saat ini salah.", {
      currentPassword: "Kata sandi saat ini salah.",
    });
  }

  const passwordHash = await hashPassword(data.newPassword);
  await db.user.update({ where: { id: userId }, data: { passwordHash } });

  // Every existing session is invalidated: a password change must not leave
  // an attacker's stolen cookie working. `keepCurrentSession` is handled by
  // the caller re-issuing a session for the acting user.
  void options;
  await destroyAllSessions(userId);
}

export async function getUserProfile(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      timeZone: true,
      locale: true,
      currency: true,
      weekStartsOn: true,
      themePreference: true,
      onboardingCompleted: true,
      createdAt: true,
    },
  });
  if (!user) throw errors.notFound("Pengguna");
  return user;
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { onboardingCompleted: true },
  });
}
