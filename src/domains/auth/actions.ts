"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { defineAction, fail, ok, type ActionResult } from "@/lib/action-result";
import { errors } from "@/lib/errors";
import {
  createSession,
  destroySession,
  getCurrentUser,
  pruneExpiredSessions,
} from "@/lib/auth/session";
import { clientAddress, enforceRateLimit, pruneRateLimits } from "@/lib/rate-limit";
import { loginSchema, registerSchema } from "./schemas";
import {
  authenticate,
  changePassword,
  markOnboardingComplete,
  registerUser,
} from "./service";

/**
 * Auth server actions.
 *
 * Two calling conventions live here on purpose:
 *
 *   - `*Action` returns an `ActionResult` for client components that need to
 *     render a field error inline.
 *   - `*AndRedirect` is for progressive-enhancement form posts, where the
 *     browser follows a redirect and there is no component left to show state.
 *
 * Rate limiting is applied here rather than inside the service, because it needs
 * the request headers. The service stays a pure function of its arguments, which
 * is what makes it testable without a request.
 */

async function requestMeta() {
  const headerList = await headers();
  return {
    userAgent: headerList.get("user-agent"),
    ipAddress: clientAddress(headerList),
  };
}

/**
 * Two independent limits for a sign-in attempt.
 *
 * Per-address stops one account being hammered. Per-client stops one client
 * spraying many accounts. Neither alone is sufficient: the first is bypassed by
 * rotating the target, the second by rotating the source.
 *
 * The address used in the scope is normalised to lower case so the same account
 * cannot be attacked through `A@b.c` and `a@b.c`.
 */
async function guardLogin(input: unknown): Promise<void> {
  const headerList = await headers();
  const ip = clientAddress(headerList);

  // The email is read leniently here. A malformed address still consumes the IP
  // budget, so an attacker cannot skip the limit by sending garbage.
  const parsed = loginSchema.safeParse(input);
  const emailKey = parsed.success ? parsed.data.email : "malformed";

  await enforceRateLimit("loginIp", ip);
  await enforceRateLimit("loginEmail", emailKey);
}

export const registerAction = defineAction(async (input: unknown) => {
  const headerList = await headers();
  await enforceRateLimit("registerIp", clientAddress(headerList));

  // Validate before creating anything, so a malformed payload does not consume
  // an account slot or leave a partial workspace behind.
  registerSchema.parse(input);

  const meta = await requestMeta();
  const user = await registerUser(input, meta);
  await createSession(user.id, meta);

  // Housekeeping, done where it costs nothing extra: the sign-in page is the one
  // place every unauthenticated visit passes through.
  void pruneExpiredSessions().catch(() => undefined);
  void pruneRateLimits().catch(() => undefined);

  return { userId: user.id, displayName: user.displayName };
});

export const loginAction = defineAction(async (input: unknown) => {
  await guardLogin(input);

  const meta = await requestMeta();
  const user = await authenticate(input, meta);

  // A fresh token is issued on every sign-in rather than reusing an existing
  // one, so a session identifier captured before authentication cannot be
  // promoted to an authenticated session.
  await createSession(user.id, meta);

  return { userId: user.id, displayName: user.displayName };
});

export const logoutAction = defineAction(async () => {
  await destroySession();
  return { ok: true };
});

export const changePasswordAction = defineAction(async (input: unknown) => {
  const user = await getCurrentUser();
  if (!user) throw errors.unauthenticated();

  // Authenticated already, so the address alone is enough. The point is to bound
  // automation, not to defend against a stranger.
  await enforceRateLimit("passwordChange", user.id);

  await changePassword(user.id, input);

  // `changePassword` revoked every session, including this one, so a fresh
  // session is issued to keep the acting user signed in.
  await createSession(user.id, await requestMeta());
  return { ok: true };
});

export const completeOnboardingAction = defineAction(async () => {
  const user = await getCurrentUser();
  if (!user) throw errors.unauthenticated();
  await markOnboardingComplete(user.id);
  return { ok: true };
});

/**
 * Form-post variants. They redirect on failure rather than returning a value,
 * because a non-JS submission has no component left to render an error into.
 */
export async function registerAndRedirect(formData: FormData): Promise<void> {
  const result = await registerAction({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!result.ok) {
    redirect(`/register?error=${encodeURIComponent(result.error.message)}`);
  }
  redirect("/today");
}

export async function loginAndRedirect(formData: FormData): Promise<void> {
  const result = await loginAction({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!result.ok) {
    redirect(`/login?error=${encodeURIComponent(result.error.message)}`);
  }
  redirect("/today");
}

export async function logoutAndRedirect(): Promise<void> {
  await destroySession();
  redirect("/login");
}

/** Runs opportunistically while auth pages render; never blocks the user. */
export async function pruneSessionsInBackground(): Promise<ActionResult<number>> {
  try {
    return ok(await pruneExpiredSessions());
  } catch (error) {
    return fail(error);
  }
}

