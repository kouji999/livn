/**
 * Error taxonomy.
 *
 * Every failure crossing a domain boundary is one of these. Utility functions
 * never throw raw database or validation errors at the caller, because the UI
 * needs a stable, human-readable shape and must never render a stack trace or
 * a Prisma error code.
 */

export type AppErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UNPROCESSABLE"
  | "INTERNAL";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UNPROCESSABLE: 422,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  /** Field-level messages keyed by form field, for inline validation UI. */
  readonly fieldErrors?: Record<string, string>;
  /** Structured context for logging. Never rendered to the user. */
  readonly context?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    message: string,
    options?: {
      fieldErrors?: Record<string, string>;
      context?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.fieldErrors = options?.fieldErrors;
    this.context = options?.context;
    if (options?.cause !== undefined) this.cause = options.cause;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      fieldErrors: this.fieldErrors,
    };
  }
}

export const errors = {
  validation: (message: string, fieldErrors?: Record<string, string>) =>
    new AppError("VALIDATION", message, { fieldErrors }),

  unauthenticated: (message = "Kamu perlu masuk dulu untuk melanjutkan.") =>
    new AppError("UNAUTHENTICATED", message),

  forbidden: (message = "Kamu tidak punya akses ke ini.") =>
    new AppError("FORBIDDEN", message),

  notFound: (what = "Data") => new AppError("NOT_FOUND", `${what} tidak ditemukan.`),

  conflict: (message: string) => new AppError("CONFLICT", message),

  internal: (message = "Terjadi kesalahan.", cause?: unknown) =>
    new AppError("INTERNAL", message, { cause }),
} as const;

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Reduces any thrown value to a safe, user-facing message.
 * Prisma and unexpected errors are logged but never surfaced verbatim.
 */
export function toUserMessage(error: unknown): string {
  if (isAppError(error)) return error.message;
  return "Terjadi kesalahan. Silakan coba lagi.";
}

/** Narrow shape used by clients to render a failure. */
export type SerializedError = {
  code: AppErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
};

export function serializeError(error: unknown): SerializedError {
  if (isAppError(error)) {
    return {
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
    };
  }
  return { code: "INTERNAL", message: toUserMessage(error) };
}
