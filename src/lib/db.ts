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
 *
 * On `server-only`: the marker is deliberately absent. It throws outside a
 * Next.js server bundle, which breaks every stand-alone script in `scripts/`
 * that needs a database — and those scripts are how the domain logic is
 * verified. The protection it would give is instead provided by a check that
 * runs at build time and does not interfere with anything: `audit-security.ts`
 * scans every `"use client"` file for an import of this module or of
 * `lib/env`, and fails if one is found.
 *
 * A build-time scan that always runs is worth more than a runtime marker that
 * would have to be removed to test the code.
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
