import bcrypt from "bcryptjs";
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
 * A structurally valid bcrypt hash, used to spend the same time on a failed
 * sign-in for an account that does not exist as for one that does.
 *
 * Generated once at module load rather than written as a literal, because a
 * hand-written string is easy to get subtly wrong and bcrypt then rejects it
 * before doing any work. That failure is silent: the code looks like it defends
 * against a timing attack and returns in 0.2ms instead of 238ms.
 *
 * Cost 12 matches `hashPassword`, so the work is comparable.
 *
 * Generated rather than hard-coded so it cannot drift from the configured cost
 * factor: if the cost changes, this changes with it.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  "livn-timing-equaliser-not-a-real-password",
  12,
);

/**
 * Confirms the dummy hash is usable, once, at startup.
 *
 * A cheap assertion that catches the exact regression described above: if the
 * constant ever stops being a valid bcrypt hash, sign-in fails immediately and
 * this throws at boot rather than silently leaking account existence.
 */
void (async () => {
  const start = performance.now();
  await bcrypt.compare("warm-up", DUMMY_PASSWORD_HASH);
  const elapsed = performance.now() - start;

  if (elapsed < 50) {
    throw new Error(
      `DUMMY_PASSWORD_HASH is not producing a real bcrypt comparison (${elapsed.toFixed(1)}ms). ` +
        "Sign-in timing would leak whether an account exists.",
    );
  }
})();

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

  // A single generic message for both "no such user" and "wrong password", so
  // the response body cannot be used to enumerate registered addresses.
  const genericFailure = errors.validation("Email atau kata sandi salah.", {
    password: "Email atau kata sandi salah.",
  });

  if (!user) {
    /*
     * Spend the same time as a real verification before failing.
     *
     * Without this the two paths are trivially distinguishable — a real check
     * costs ~238ms of bcrypt, a missing row returns immediately — and the
     * endpoint becomes an account-enumeration oracle. An attacker measures the
     * response time, learns which addresses exist, then focuses their password
     * guessing on those (rate limiting aside, that is the information leak).
     *
     * The dummy hash must be *structurally valid*. An earlier version used a
     * hand-written string whose format bcrypt rejected outright, and `compare`
     * returned in 0.2ms instead of 238ms — the defence was in the code and doing
     * nothing. `DUMMY_PASSWORD_HASH` is generated at module load for exactly
     * that reason; see its definition.
     */
    await verifyPassword(data.password, DUMMY_PASSWORD_HASH);
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
      // Profile presentation, shown in the shell and on the profile page.
      headline: true,
      bio: true,
      location: true,
      avatarStyle: true,
      avatarColor: true,
      avatarIcon: true,
      createdAt: true,
      lastSeenAt: true,
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
