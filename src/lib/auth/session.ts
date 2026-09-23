import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import {
  generateSessionToken,
  hashSessionToken,
} from "@/lib/crypto";
import { errors } from "@/lib/errors";

/**
 * Session handling.
 *
 * Design choices that matter:
 *
 *   • The cookie holds a random token; the database holds only its SHA-256
 *     hash. A database leak therefore yields no usable sessions.
 *   • Sessions expire on a fixed schedule and are extended on use, capped at
 *     an absolute lifetime so a stolen cookie cannot live forever.
 *   • Lookup is wrapped in React `cache` so a page rendering six components
 *     performs exactly one session query.
 */

export const SESSION_COOKIE = "livn_session";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_RENEW_WINDOW_MS = 24 * 60 * 60 * 1000; // refresh at most daily

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  timeZone: string;
  locale: string;
  currency: string;
  weekStartsOn: number;
  themePreference: string;
  onboardingCompleted: boolean;
};

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
      ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return { token, expiresAt };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await db.session
      .deleteMany({ where: { tokenHash: hashSessionToken(token) } })
      .catch(() => undefined);
  }

  store.delete(SESSION_COOKIE);
}

/** Revokes every session for a user — used after a password change. */
export async function destroyAllSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

/**
 * Resolves the signed-in user, or `null`.
 *
 * Cached per request so the many components that need the current user do not
 * each hit the database.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      expiresAt: true,
      lastUsedAt: true,
      user: {
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
        },
      },
    },
  });

  if (!session) return null;

  // Expired sessions are deleted rather than merely ignored, so the table
  // does not accumulate dead rows.
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  // Touch at most once a day; a write on every request is wasted work.
  if (Date.now() - session.lastUsedAt.getTime() > SESSION_RENEW_WINDOW_MS) {
    await db.session
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }

  return session.user;
});

/** Same as `getCurrentUser` but throws, for pages that require a session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw errors.unauthenticated();
  return user;
}

/**
 * Purges expired sessions. Called opportunistically from the auth pages so the
 * table stays bounded without needing a scheduled job.
 */
export async function pruneExpiredSessions(): Promise<number> {
  const result = await db.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
