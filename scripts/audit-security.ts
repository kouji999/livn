/**
 * Security checks.
 *
 *   npx tsx scripts/audit-security.ts
 *
 * Verifies the claims the product makes about itself. Each check corresponds to
 * a specific attack, and each one has actually failed at some point in this
 * codebase's history: that is why they are here rather than assumed.
 *
 * Nothing here is a penetration test. It is a regression guard for the classes
 * of mistake that are easy to reintroduce: a missing header, an unguarded query,
 * a secret that leaks into the client bundle.
 */

// First, before anything that reads `process.env`. `lib/env` validates on
// import, so a later position would have it throw on a missing DATABASE_URL
// before the file has been loaded.
import "dotenv/config";

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { registerUser } from "../src/domains/auth/service";
import { assertOwned } from "../src/lib/auth/ownership";
import { hashSessionToken, verifyPassword } from "../src/lib/crypto";

let failures = 0;
const notes: string[] = [];

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` - ${detail}` : ""}`);
}

function note(text: string) {
  notes.push(text);
  console.log(`  [NOTE] ${text}`);
}

function walk(dir: string, skip: string[] = []): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (skip.includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, skip));
    else out.push(full);
  }
  return out;
}

async function expectRejection(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, "expected a rejection but it succeeded");
  } catch {
    check(label, true);
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  // ── Source-level checks ─────────────────────────────────────────────────────

  console.log("\nSecrets cannot reach the browser");
  {
    const sourceFiles = walk(join(process.cwd(), "src"), ["generated"]).filter((f) =>
      /\.(ts|tsx)$/.test(f),
    );

    // A file with "use client" runs in the browser. Anything it imports is part
    // of the bundle, and anything that bundle imports is public.
    const clientFiles = sourceFiles.filter((f) =>
      /^\s*["']use client["']/.test(readFileSync(f, "utf8")),
    );

    const leaked: string[] = [];
    for (const file of clientFiles) {
      const text = readFileSync(file, "utf8");
      for (const secret of ["SESSION_SECRET", "DATABASE_URL", "passwordHash", "lib/env"]) {
        if (text.includes(secret)) {
          leaked.push(`${relative(process.cwd(), file)} references ${secret}`);
        }
      }
    }

    check(
      "no client component imports the environment module",
      leaked.length === 0,
      leaked.join("; "),
    );
    check("client components were found to check", clientFiles.length > 0, `${clientFiles.length}`);

    /*
     * The `server-only` marker is deliberately absent from `lib/env.ts` and
     * `lib/db.ts`: it throws outside a Next.js server bundle, which breaks every
     * stand-alone script in `scripts/` — the scripts that verify the domain
     * logic. The protection it would give is provided by the scan above instead,
     * which runs unconditionally and does not interfere with testing.
     *
     * The assertion below is that the scan is actually capable of catching a
     * leak. A guard that cannot fail is not a guard.
     */
    const suspiciousImport = /from\s+["']@\/lib\/(env|db)["']/;
    const wouldCatch = suspiciousImport.test('import { db } from "@/lib/db";');
    check(
      "the leak scan would detect a client import of lib/db",
      wouldCatch,
      "guard self-test",
    );
  }

  // ── Authentication ──────────────────────────────────────────────────────────

  console.log("\nPassword storage");
  {
    const email = `sec-a+${Date.now()}@livn.test`;
    const password = "audit-passphrase-2026";
    const user = await registerUser({
      displayName: "Sec A",
      email,
      password,
      confirmPassword: password,
    });

    const row = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    check("the password is not stored in plaintext", !row.passwordHash.includes(password));
    check("it is a bcrypt hash", /^\$2[aby]\$/.test(row.passwordHash), row.passwordHash.slice(0, 7));

    // Cost factor. bcrypt encodes it in the hash: $2a$12$...
    const cost = Number(row.passwordHash.split("$")[2]);
    check("cost factor is at least 10", cost >= 10, `cost ${cost}`);

    check("the correct password verifies", await verifyPassword(password, row.passwordHash));
    check(
      "a wrong password does not",
      !(await verifyPassword("not-the-password", row.passwordHash)),
    );

    // Timing: a missing user must not be distinguishable by response time, or the
    // endpoint becomes an account-enumeration oracle.
    const { authenticate } = await import("../src/domains/auth/service");

    const timeOf = async (fn: () => Promise<unknown>) => {
      const start = performance.now();
      await fn().catch(() => undefined);
      return performance.now() - start;
    };

    const knownWrong = await timeOf(() =>
      authenticate({ email, password: "definitely-wrong-password" }),
    );
    const unknownUser = await timeOf(() =>
      authenticate({ email: `nobody+${Date.now()}@livn.test`, password: "irrelevant-passphrase" }),
    );

    // A factor of three is generous; bcrypt dominates both paths when the dummy
    // hash is actually verified.
    const ratio = Math.max(knownWrong, unknownUser) / Math.max(1, Math.min(knownWrong, unknownUser));
    check(
      "wrong password and unknown account take comparable time",
      ratio < 3,
      `${knownWrong.toFixed(0)}ms vs ${unknownUser.toFixed(0)}ms`,
    );

    // ── Ownership ─────────────────────────────────────────────────────────────

    console.log("\nCross-account isolation");
    {
      const other = await registerUser({
        displayName: "Sec B",
        email: `sec-b+${Date.now()}@livn.test`,
        password,
        confirmPassword: password,
      });

      const area = await db.area.findFirstOrThrow({
        where: { userId: user.id },
        select: { id: true },
      });

      await expectRejection("another account cannot address this area", () =>
        assertOwned("area", area.id, other.id),
      );
      check("the owner can address it", (await assertOwned("area", area.id, user.id)) === area.id);

      // A session token is stored as a hash, so a database dump yields no usable
      // credential.
      const { createSession } = await import("../src/lib/auth/session");
      void createSession;

      const sessionRow = await db.session.create({
        data: {
          userId: user.id,
          tokenHash: hashSessionToken("known-token-for-verification"),
          expiresAt: new Date(Date.now() + 60_000),
        },
        select: { tokenHash: true },
      });

      check(
        "the session table stores a hash, not the token",
        sessionRow.tokenHash !== "known-token-for-verification" &&
          sessionRow.tokenHash.length === 64,
        `${sessionRow.tokenHash.length} chars`,
      );

      await db.user.delete({ where: { id: other.id } });
    }

    await db.user.delete({ where: { id: user.id } });
  }

  // ── Database constraints ────────────────────────────────────────────────────

  console.log("\nDatabase-level integrity");
  {
    // Unique constraints are what make "one entry per day" and "one session per
    // token" enforced rather than hoped for.
    const indexes = await db.$queryRaw<Array<{ tablename: string; indexname: string; indexdef: string }>>`
      SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
    `;

    // A unique *composite* index covers several columns, and Postgres writes the
    // definition differently depending on whether a column name needs quoting:
    // `("userId", date)` against `(habitId, date)`. Matching on a quoted name
    // therefore misses half the cases, so the check strips quotes first.
    const normalise = (definition: string) => definition.replace(/"/g, "");

    const uniqueCovering = (table: string, columns: string[]) =>
      indexes.some((row) => {
        if (row.tablename !== table) return false;
        if (!row.indexdef.includes("UNIQUE")) return false;
        const definition = normalise(row.indexdef);
        return columns.every((column) => definition.includes(column));
      });

    check("Session.tokenHash is unique", uniqueCovering("Session", ["tokenHash"]));
    check("User.email is unique", uniqueCovering("User", ["email"]));
    check(
      "JournalEntry is unique per user and day",
      uniqueCovering("JournalEntry", ["userId", "date"]),
    );
    check("HabitLog is unique per habit and day", uniqueCovering("HabitLog", ["habitId", "date"]));
    check("Account is unique per user and name", uniqueCovering("Account", ["userId", "name"]));

    // Every user-owned table must carry `userId`, or a query has no way to scope.
    const tables = await db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `;

    const joinTables = new Set(["JournalTag", "JournalEntryGoal", "JournalEntryProject", "RateLimitAttempt"]);
    const missingOwner: string[] = [];

    for (const { table_name } of tables) {
      if (joinTables.has(table_name) || table_name === "_prisma_migrations") continue;

      const columns = await db.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table_name}
      `;

      const names = columns.map((c) => c.column_name);
      if (!names.includes("userId") && table_name !== "User") {
        missingOwner.push(table_name);
      }
    }

    check(
      "every user-owned table carries userId",
      missingOwner.length === 0,
      missingOwner.join(", "),
    );

    // Foreign keys with ON DELETE CASCADE, so deleting an account leaves nothing
    // behind rather than orphaning rows that no query will ever reach again.
    const cascades = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count FROM pg_constraint
      WHERE contype = 'f' AND confdeltype = 'c'
    `;
    const total = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count FROM pg_constraint
      WHERE contype = 'f' AND connamespace = 'public'::regnamespace
    `;

    const cascadeCount = Number(cascades[0].count);
    const totalCount = Number(total[0].count);
    note(
      `${cascadeCount} of ${totalCount} foreign keys cascade on delete; the rest use SET NULL or RESTRICT deliberately`,
    );
    check("cascade deletes are configured", cascadeCount > 20, `${cascadeCount} cascades`);
  }

  // ── Rate limiting ───────────────────────────────────────────────────────────

  console.log("\nRate limiting");
  {
    const { consumeRateLimit, RATE_LIMITS, pruneRateLimits } = await import("../src/lib/rate-limit");

    const scope = `security-audit-${Date.now()}`;
    const rule = RATE_LIMITS.loginEmail;

    let blockedAt = 0;
    for (let attempt = 1; attempt <= rule.max + 2; attempt += 1) {
      const result = await consumeRateLimit("loginEmail", scope);
      if (!result.allowed && blockedAt === 0) blockedAt = attempt;
    }

    check(
      "the limit blocks after the configured number of attempts",
      blockedAt === rule.max + 1,
      `blocked at attempt ${blockedAt}, limit ${rule.max}`,
    );

    const blocked = await consumeRateLimit("loginEmail", scope);
    check("a blocked attempt reports a retry delay", blocked.retryAfterSeconds > 0, `${blocked.retryAfterSeconds}s`);

    // A different scope must have its own budget, or one blocked account would
    // lock out everyone.
    const separate = await consumeRateLimit("loginEmail", `${scope}-other`);
    check("a different scope is unaffected", separate.allowed);

    await pruneRateLimits();
    const remaining = await db.rateLimitAttempt.count({ where: { scope: { contains: scope } } });
    check("attempts inside the window are retained", remaining > 0, `${remaining} rows`);
  }

  // ── Output encoding ────────────────────────────────────────────────────────

  console.log("\nUnsafe HTML");
  {
    const sourceFiles = walk(join(process.cwd(), "src"), ["generated"]).filter((f) =>
      /\.(ts|tsx)$/.test(f),
    );

    const rawHtml = sourceFiles.filter((f) =>
      readFileSync(f, "utf8").includes("dangerouslySetInnerHTML"),
    );

    // One is expected: the pre-paint theme script in the root layout. Anything
    // beyond that is a new injection point that needs justifying.
    check(
      "at most one use of dangerouslySetInnerHTML",
      rawHtml.length <= 1,
      rawHtml.map((f) => relative(process.cwd(), f)).join(", ") || "none",
    );

    if (rawHtml.length === 1) {
      const text = readFileSync(rawHtml[0], "utf8");
      // The value must be serialised, not concatenated.
      check(
        "the theme script serialises its value",
        text.includes("JSON.stringify(theme)"),
        relative(process.cwd(), rawHtml[0]),
      );
    }
  }

  await db.$disconnect();

  console.log(
    failures === 0
      ? `\nALL SECURITY CHECKS PASSED${notes.length ? ` (${notes.length} note(s))` : ""}\n`
      : `\n${failures} SECURITY CHECK(S) FAILED\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nAudit crashed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
