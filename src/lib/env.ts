/**
 * Server-only environment access.
 *
 * No `server-only` marker here. That marker throws outside a Next.js server
 * bundle, which would break every stand-alone script that needs a database URL —
 * and this module is imported by those scripts.
 *
 * The guard belongs on `lib/db.ts` instead, which is what genuinely must never
 * reach a browser. See the comment there.
 */

function required(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable "${key}". Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function optional(key: string, fallback: string): string {
  const value = process.env[key];
  return value && value.trim() !== "" ? value : fallback;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  databaseUrl: required("DATABASE_URL"),
  sessionSecret: required("SESSION_SECRET"),
  appUrl: optional("APP_URL", "http://localhost:3777"),

  storage: {
    driver: optional("STORAGE_DRIVER", "local"),
    localDir: optional("STORAGE_LOCAL_DIR", "./.data/uploads"),
  },
} as const;

export const isProduction = env.nodeEnv === "production";
export const isDevelopment = env.nodeEnv === "development";

/**
 * Fail at boot rather than at first request.
 *
 * A placeholder secret in production means every session cookie is signed with a
 * value that is in the repository. Refusing to start is the only safe response:
 * a warning would be missed, and the deployment would accept logins it should
 * not trust.
 */
if (isProduction) {
  if (env.sessionSecret.includes("do-not-use-in-production")) {
    throw new Error(
      "SESSION_SECRET is still the development placeholder. Generate a real secret before deploying.",
    );
  }
  if (env.sessionSecret.length < 32) {
    throw new Error(
      "SESSION_SECRET is shorter than 32 characters. Sessions signed with a weak secret can be forged.",
    );
  }
}
