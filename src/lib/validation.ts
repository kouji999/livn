import { AppError } from "@/lib/errors";

/**
 * Zod error normalization.
 *
 * The UI consumes one shape for validation feedback: a message plus a map of
 * field name to message. Everything that validates input converts into this.
 */
export function fieldErrorsFromZod(
  error: { issues: Array<{ path: (string | number | symbol)[]; message: string }> },
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_form";
    // First message wins: the most specific rule should be the one shown.
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Wraps a Zod schema so parsing failures become `AppError("VALIDATION")`.
 * Keeps services free of try/catch noise around validation.
 */
export function parseOrThrow<T>(
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ path: (string | number | symbol)[]; message: string }> } } },
  input: unknown,
  message = "Please check the highlighted fields.",
): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new AppError("VALIDATION", message, {
    fieldErrors: fieldErrorsFromZod(result.error),
  });
}
