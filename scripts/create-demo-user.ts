/**
 * Create the demo account.
 *
 *   npx tsx scripts/create-demo-user.ts
 *
 * Separate from the seeder so the account exists before history is written into
 * it, and so the credentials are stated in one place.
 *
 * Idempotent: running it against an existing account leaves the account alone
 * rather than resetting its password, which would be a surprising side effect.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { registerUser } from "../src/domains/auth/service";

const EMAIL = "demo@livn.test";
const PASSWORD = "lihat-livn-2026";
const NAME = "Pengguna Demo";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const existing = await db.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, displayName: true, createdAt: true },
  });

  if (existing) {
    console.log(`\nDemo account already exists.`);
    console.log(`  email:    ${EMAIL}`);
    console.log(`  password: ${PASSWORD}`);
    console.log(`  name:     ${existing.displayName}`);
    console.log(`\nLeave the password unchanged; the seeder writes history into this account.`);

    const counts = await Promise.all([
      db.task.count({ where: { userId: existing.id } }),
      db.transaction.count({ where: { userId: existing.id } }),
      db.habitLog.count({ where: { userId: existing.id } }),
    ]);
    console.log(
      `\nCurrent data: ${counts[0]} tasks, ${counts[1]} transactions, ${counts[2]} habit sessions.`,
    );

    await db.$disconnect();
    return;
  }

  const user = await registerUser({
    displayName: NAME,
    email: EMAIL,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    timeZone: "Asia/Jakarta",
  });

  // Mark onboarding complete so the account lands straight on Today.
  await db.user.update({
    where: { id: user.id },
    data: { onboardingCompleted: true },
  });

  console.log(`\nDemo account created.`);
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
  console.log(`\nNext: npx tsx scripts/seed-demo.ts ${EMAIL}`);

  await db.$disconnect();
}

main().catch((error) => {
  console.error("\nFailed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
