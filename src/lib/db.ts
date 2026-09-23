import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env, isProduction } from "@/lib/env";

/**
 * A single Prisma client per process.
 *
 * Next.js reloads modules on every hot update in development, which would
 * otherwise open a new connection pool each time until PostgreSQL refuses
 * connections. The instance is parked on `globalThis` so reloads reuse it.
 *
 * Prisma 7 connects through a driver adapter (`@prisma/adapter-pg`), so the
 * connection string is supplied here rather than in `schema.prisma`.
 */

/**
 * The cached client, parked on the global object.
 *
 * Declared through `declare global` rather than a double assertion: the property
 * genuinely does not exist on the standard `globalThis` type, and stating that
 * once here keeps every use below fully typed instead of casting at each one.
 */
declare global {
  // eslint-disable-next-line no-var
  var __livnPrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.databaseUrl });

  return new PrismaClient({
    adapter,
    log: isProduction ? ["error"] : ["error", "warn"],
  });
}

export const db: PrismaClient = global.__livnPrisma ?? createClient();

if (!isProduction) {
  global.__livnPrisma = db;
}

export type Db = typeof db;
