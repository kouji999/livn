import { db } from "@/lib/db";
import { errors } from "@/lib/errors";

/**
 * Rate limiting.
 *
 * Counted in the database rather than in memory, because the in-memory version
 * is wrong in two ways that both matter:
 *
 *   • A restart clears every counter, so an attacker who can trigger a deploy
 *     (or just wait) gets a fresh allowance.
 *   • With more than one process, each holds its own count, so the effective
 *     limit multiplies by the number of instances.
 *
 * The ledger is appends-only: every attempt is a row, and the count is a query
 * over a time window. There is no counter to increment, so nothing can drift.
 *
 * Scope is a string the caller composes, e.g. `login:email:a@b.c` or
 * `login:ip:1.2.3.4`. Two dimensions are checked independently, so neither a
 * single address hammering many accounts nor many addresses hammering one
 * account slips through.
 */

export type RateLimitRule = {
  /** Distinguishes this rule's rows from others in the same table. */
  scope: string;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Allowed attempts inside the window. */
  max: number;
};

const MINUTE = 60;

/** Per-dimension limits for the sign-in flow. */
export const RATE_LIMITS = {
  /**
   * One account. Tight — a legitimate person does not mistype a password ten
   * times in fifteen minutes, and 10 gives room for a forgotten password plus a
   * few false starts.
   */
  loginEmail: { windowSeconds: 15 * MINUTE, max: 10 } satisfies Partial<RateLimitRule>,

  /**
   * One address across every account. Looser, because a shared network (office,
   * cafe, campus) puts many legitimate people behind one address.
   */
  loginIp: { windowSeconds: 15 * MINUTE, max: 30 } satisfies Partial<RateLimitRule>,

  /** Account creation. Bounded so the table cannot be filled by a script. */
  registerIp: { windowSeconds: 60 * MINUTE, max: 5 } satisfies Partial<RateLimitRule>,

  /** Password change. Authenticated already, so this guards against automation. */
  passwordChange: { windowSeconds: 60 * MINUTE, max: 5 } satisfies Partial<RateLimitRule>,
} as const;

type RateLimitKey = keyof typeof RATE_LIMITS;

/**
 * Records an attempt and reports whether it is allowed.
 *
 * The check happens after the insert, so the current attempt counts toward its
 * own window. Counting it afterwards would let the limit be exceeded by one on
 * every burst.
 */
export async function consumeRateLimit(
  key: RateLimitKey,
  scope: string,
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  const rule = RATE_LIMITS[key];
  const since = new Date(Date.now() - rule.windowSeconds * 1000);
  const fullScope = `${key}:${scope}`;

  await db.rateLimitAttempt.create({ data: { scope: fullScope } });

  const count = await db.rateLimitAttempt.count({
    where: { scope: fullScope, createdAt: { gte: since } },
  });

  if (count <= rule.max) {
    return {
      allowed: true,
      remaining: rule.max - count,
      retryAfterSeconds: 0,
    };
  }

  // The oldest row inside the window is the one whose expiry frees a slot.
  const oldest = await db.rateLimitAttempt.findFirst({
    where: { scope: fullScope, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  const retryAfterSeconds = oldest
    ? Math.max(1, Math.ceil((oldest.createdAt.getTime() + rule.windowSeconds * 1000 - Date.now()) / 1000))
    : rule.windowSeconds;

  return { allowed: false, remaining: 0, retryAfterSeconds };
}

/**
 * Enforces a rule, throwing a user-facing error when it is exceeded.
 *
 * The message does not say how many attempts remain. Telling an attacker their
 * exact budget turns a rate limit into a pacing guide.
 */
export async function enforceRateLimit(key: RateLimitKey, scope: string): Promise<void> {
  const result = await consumeRateLimit(key, scope);

  if (result.allowed) return;

  const minutes = Math.ceil(result.retryAfterSeconds / 60);
  throw errors.validation(
    `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`,
  );
}

/**
 * Deletes attempts older than any window.
 *
 * The longest window is an hour, so anything beyond that can never affect a
 * decision. Called opportunistically from the sign-in flow rather than on a
 * schedule, which keeps the table bounded without needing a cron job.
 */
export async function pruneRateLimits(): Promise<number> {
  const longestWindowMs =
    Math.max(...Object.values(RATE_LIMITS).map((rule) => rule.windowSeconds)) * 1000;

  const result = await db.rateLimitAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - longestWindowMs) } },
  });

  return result.count;
}

/**
 * Extracts the caller's address.
 *
 * `x-forwarded-for` is a list where the first entry is the original client and
 * the rest are proxies. It is only trustworthy when a proxy the deployment
 * controls sets it; behind a Cloudflare tunnel that is the case.
 *
 * A missing header falls back to a constant rather than to `null`, so an
 * unidentifiable caller is rate limited as one bucket instead of escaping the
 * limit entirely.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return headers.get("x-real-ip")?.trim() || "unknown";
}
