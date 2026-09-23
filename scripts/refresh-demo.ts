/**
 * Refresh the demo account's history so it is relative to today.
 *
 *   npx tsx scripts/refresh-demo.ts
 *
 * The seeded history is built from "today" at the moment it runs, so a demo
 * account created last week shows a stale Today screen: every task is overdue
 * and the charts stop short of the current date. Rebuilding it keeps the
 * showcase meaningful.
 *
 * Refuses to run unless the target is the demo account, because the operation
 * deletes history.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { formatCalendarDay, today } from "../src/lib/date";
import { execFileSync } from "node:child_process";

const EMAIL = process.argv[2] ?? "demo@livn.test";
const TIME_ZONE = "Asia/Jakarta";

/**
 * Only the demo account may be wiped.
 *
 * An allow-list rather than a check for "not a real user", because the cost of
 * being wrong is deleting a person's history.
 */
const ALLOWED = new Set(["demo@livn.test", "reviewer@livn.test"]);

async function main() {
  if (!ALLOWED.has(EMAIL)) {
    throw new Error(
      `Refusing to rebuild the history for "${EMAIL}". Only demo accounts may be reset.`,
    );
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const user = await db.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, displayName: true },
  });
  if (!user) throw new Error(`No account for ${EMAIL}. Run scripts/create-demo-user.ts first.`);

  console.log(`\nRebuilding history for ${EMAIL} (${user.displayName})`);
  console.log(`Today is ${formatCalendarDay(today(TIME_ZONE))}\n`);

  // Delete in dependency order. Cascades handle the join tables, but the order
  // is explicit so a change to an onDelete rule cannot silently orphan a row.
  const removed = {
    habitLogs: (await db.habitLog.deleteMany({ where: { userId: user.id } })).count,
    tasks: (await db.task.deleteMany({ where: { userId: user.id } })).count,
    transactions: (await db.transaction.deleteMany({ where: { userId: user.id } })).count,
    journal: (await db.journalEntry.deleteMany({ where: { userId: user.id } })).count,
    events: (await db.lifeEvent.deleteMany({ where: { userId: user.id } })).count,
    milestones: (await db.milestone.deleteMany({ where: { userId: user.id } })).count,
    projects: (await db.project.deleteMany({ where: { userId: user.id } })).count,
    goals: (await db.goal.deleteMany({ where: { userId: user.id } })).count,
    habits: (await db.habit.deleteMany({ where: { userId: user.id } })).count,
    tags: (await db.tag.deleteMany({ where: { userId: user.id } })).count,
  };

  console.log("cleared:");
  for (const [label, count] of Object.entries(removed)) {
    if (count > 0) console.log(`  ${label.padEnd(14)} ${count}`);
  }

  // Reset balances so the rebuild starts from a known state.
  await db.account.updateMany({
    where: { userId: user.id },
    data: { openingBalance: 0n, closedAt: null },
  });

  await db.$disconnect();

  // The seeder owns the shape of the history; this script owns the reset. Keeping
  // them apart means the seeder can stay idempotent-hostile (it refuses to run
  // twice) without that guard blocking a deliberate rebuild.
  console.log("\nre-seeding...\n");
  execFileSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/seed-demo.ts", EMAIL],
    { stdio: "inherit", cwd: process.cwd() },
  );

  console.log("\nDemo history rebuilt.\n");
}

main().catch((error) => {
  console.error("\nFailed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
