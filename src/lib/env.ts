/**
 * Server-side environment access.
 *
 * Read once, validated once, at module load. A missing or malformed variable
 * must fail loudly at boot rather than surface as a confusing runtime error
 * deep inside a request.
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

if (isProduction && env.sessionSecret.includes("do-not-use-in-production")) {
  throw new Error(
    "SESSION_SECRET is still the development placeholder. Generate a real secret before deploying.",
  );
}
