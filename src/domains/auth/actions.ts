"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { defineAction, fail, ok, type ActionResult } from "@/lib/action-result";
import { errors } from "@/lib/errors";
import { createSession, destroySession, getCurrentUser, pruneExpiredSessions } from "@/lib/auth/session";
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
 *   • `*Action` returns an `ActionResult` for client components that need to
 *     render a field error inline.
 *   • `*AndRedirect` is for progressive-enhancement form posts, where the
 *     browser follows a redirect and there is no component left to show state.
 */

async function requestMeta() {
  const headerList = await headers();
  return {
    userAgent: headerList.get("user-agent"),
    ipAddress:
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerList.get("x-real-ip"),
  };
}

export const registerAction = defineAction(async (input: unknown) => {
  const user = await registerUser(input, await requestMeta());
  await createSession(user.id, await requestMeta());
  return { userId: user.id, displayName: user.displayName };
});

export const loginAction = defineAction(async (input: unknown) => {
  const user = await authenticate(input, await requestMeta());
  await createSession(user.id, await requestMeta());
  return { userId: user.id, displayName: user.displayName };
});

export const logoutAction = defineAction(async () => {
  await destroySession();
  return { ok: true };
});

export const changePasswordAction = defineAction(async (input: unknown) => {
  const user = await getCurrentUser();
  if (!user) throw errors.unauthenticated();

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
 * Form-post variants. They return `void` and signal failure by redirecting
 * back with an `?error=` parameter, which is what a non-JS form submit needs.
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
