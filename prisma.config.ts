import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 configuration.
 *
 * Prisma 7 no longer reads `.env` on its own, so it is loaded here before the
 * datasource URL is resolved. This keeps `DATABASE_URL` in a single place
 * (`.env`) shared by Prisma, the Next.js server and the test runner.
 */

const root = __dirname;
const envFile = path.join(root, ".env");

if (fs.existsSync(envFile)) {
  for (const rawLine of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    // Strip surrounding quotes, which are common in .env files.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Real environment variables always win over the file.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
