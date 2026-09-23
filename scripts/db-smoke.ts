/**
 * Smoke test for the database layer.
 *
 * Run with:  npx tsx scripts/db-smoke.ts
 *
 * Verifies the connection, that every table exists, and that the money
 * helpers round-trip correctly. Deliberately dependency-free so it can run
 * before any test framework is configured.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  formatMoney,
  parseAmountInput,
  sumMinor,
} from "../src/lib/money";

const EXPECTED_TABLES = [
  "Account", "Area", "Attachment", "Budget", "Category", "Goal", "Habit",
  "HabitLog", "Insight", "JournalEntry", "JournalEntryGoal",
  "JournalEntryProject", "JournalTag", "LifeEvent", "Milestone", "MonthlyPlan",
  "MonthlyPlanTarget", "Project", "RecurringRule", "Review", "SavingsGoal",
  "Session", "Tag", "Task", "Transaction", "User",
];

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  const mark = condition ? "PASS" : "FAIL";
  if (!condition) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` - ${detail}` : ""}`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  console.log("\nDatabase connection");
  await db.$queryRaw`SELECT 1`;
  check("connects to PostgreSQL", true);

  const version = await db.$queryRaw<Array<{ v: string }>>`SELECT version() AS v`;
  check("server reachable", version.length === 1, version[0]?.v.split(",")[0]);

  console.log("\nSchema");
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const present = new Set(tables.map((t) => t.tablename));
  for (const table of EXPECTED_TABLES) {
    check(`table ${table}`, present.has(table));
  }

  const fks = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count FROM pg_constraint
    WHERE contype = 'f' AND connamespace = 'public'::regnamespace
  `;
  check("foreign keys exist", Number(fks[0].count) > 40, `${fks[0].count} constraints`);

  console.log("\nMoney arithmetic");
  check("IDR parse plain digits", parseAmountInput("1500000", "IDR") === 1500000n);
  check("IDR parse dot grouping", parseAmountInput("1.500.000", "IDR") === 1500000n);
  check("IDR parse comma grouping", parseAmountInput("1,500,000", "IDR") === 1500000n);
  check("IDR parse currency prefix", parseAmountInput("Rp 85.000", "IDR") === 85000n);
  check("USD parse decimals", parseAmountInput("12.50", "USD") === 1250n);
  check("negative amount", parseAmountInput("-85.000", "IDR") === -85000n);

  check("format IDR grouping", formatMoney(4815000n, "IDR") === "Rp 4.815.000");
  check("format USD decimals", formatMoney(1250n, "USD") === "$ 12,50");
  check("format negative", formatMoney(-85000n, "IDR") === "-Rp 85.000");
  check("sum is exact", sumMinor([10000n, 20000n, 5n]) === 30005n);

  // The classic float trap: 0.1 + 0.2 must not drift.
  const drifted = sumMinor([100n, 200n]) === 300n;
  check("no floating point drift", drifted);

  console.log("\nOwnership column coverage");
  const ownerTables = ["Area", "Goal", "Project", "Task", "Transaction", "Habit", "JournalEntry"];
  for (const table of ownerTables) {
    const cols = await db.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = 'userId'
    `;
    check(`${table}.userId`, cols.length === 1);
  }

  await db.$disconnect();

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nSmoke test crashed:", error);
  process.exit(1);
});
