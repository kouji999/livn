import { AppError, isAppError, serializeError, type SerializedError } from "@/lib/errors";

/**
 * Action result envelope.
 *
 * Server actions never throw across the network boundary — Next.js would
 * convert an exception into an opaque digest and the UI would have nothing
 * useful to render. Instead every action returns one of these, so success and
 * failure are both explicitly typed and the client can always show a real
 * message.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: SerializedError };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: unknown): ActionResult<never> {
  if (isAppError(error)) {
    // Expected, actionable failures are not logged; they are part of the flow.
    return { ok: false, error: serializeError(error) };
  }

  // Anything else is a bug and must be visible in the server log.
  console.error("[livn] unexpected action failure:", error);
  return { ok: false, error: serializeError(error) };
}

/**
 * Wraps a server action body so it can never reject.
 *
 *   export const createTask = defineAction(async (input) => { ... })
 *
 * The handler throws `AppError` for expected failures and returns plain data
 * for success. Unexpected exceptions are logged and reduced to a safe message.
 */
export function defineAction<Input, Output>(
  handler: (input: Input) => Promise<Output>,
): (input: Input) => Promise<ActionResult<Output>> {
  return async (input: Input) => {
    try {
      return ok(await handler(input));
    } catch (error) {
      return fail(error);
    }
  };
}

/**
 * Unwraps an action result in client code, throwing a typed error so existing
 * try/catch and `useTransition` patterns keep working.
 */
export function unwrap<T>(result: ActionResult<T>): T {
  if (result.ok) return result.data;
  throw new AppError(
    result.error.code,
    result.error.message,
    { fieldErrors: result.error.fieldErrors },
  );
}
