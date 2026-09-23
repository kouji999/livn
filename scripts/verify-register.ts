/**
 * Registration verification at the service layer.
 *
 *   npx tsx scripts/verify-register.ts
 *
 * Proves the full account-creation path works against the real database:
 * user row, seeded areas, categories and accounts, session issuance, and
 * that a duplicate email is rejected rather than silently accepted.
 *
 * Cleans up after itself so repeated runs stay meaningful.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { registerUser, authenticate } from "../src/domains/auth/service";
import { DEFAULT_AREAS, DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from "../src/domains/auth/defaults";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` - ${detail}` : ""}`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const email = `verify+${Date.now()}@livn.test`;
  const password = "verification-passphrase-2026";
  let userId: string | null = null;

  console.log("\nRegistration");

  const user = await registerUser({ displayName: "Verify User", email, password, confirmPassword: password });
  userId = user.id;
  check("user created", Boolean(user.id));
  check("email normalised to lowercase", user.email === email.toLowerCase(), user.email);

  console.log("\nSeeded workspace");
  const areas = await db.area.count({ where: { userId } });
  check("areas seeded", areas === DEFAULT_AREAS.length, `${areas}/${DEFAULT_AREAS.length}`);

  const accounts = await db.account.count({ where: { userId } });
  check("accounts seeded", accounts === DEFAULT_ACCOUNTS.length, `${accounts}/${DEFAULT_ACCOUNTS.length}`);

  const categories = await db.category.count({ where: { userId } });
  check("categories seeded", categories === DEFAULT_CATEGORIES.length, `${categories}/${DEFAULT_CATEGORIES.length}`);

  check("no tasks created for a new account", (await db.task.count({ where: { userId } })) === 0);
  check("no transactions created for a new account", (await db.transaction.count({ where: { userId } })) === 0);
  check("no journal entries created for a new account", (await db.journalEntry.count({ where: { userId } })) === 0);

  console.log("\nPassword handling");
  const stored = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  check("password is not stored in plaintext", stored?.passwordHash !== password);
  check("password hash is bcrypt", stored?.passwordHash.startsWith("$2") ?? false, stored?.passwordHash.slice(0, 7));

  console.log("\nDuplicate protection");
  let duplicateRejected = false;
  try {
    await registerUser({ displayName: "Second", email, password, confirmPassword: password });
  } catch (error) {
    duplicateRejected = true;
    const message = error instanceof Error ? error.message : "";
    check("duplicate email rejected with a clear message", message.includes("sudah terdaftar"), message);
  }
  check("duplicate email rejected", duplicateRejected);

  console.log("\nWeak password");
  let weakRejected = false;
  try {
    await registerUser({ displayName: "Weak", email: `weak+${Date.now()}@livn.test`, password: "password", confirmPassword: "password" });
  } catch {
    weakRejected = true;
  }
  check("common password rejected", weakRejected);

  console.log("\nAuthentication");
  const authed = await authenticate({ email, password });
  check("correct password authenticates", authed.id === userId);

  let wrongRejected = false;
  try {
    await authenticate({ email, password: "definitely-not-the-password" });
  } catch {
    wrongRejected = true;
  }
  check("wrong password rejected", wrongRejected);

  let unknownRejected = false;
  try {
    await authenticate({ email: `nobody+${Date.now()}@livn.test`, password });
  } catch {
    unknownRejected = true;
  }
  check("unknown email rejected", unknownRejected);

  // Cleanup: cascade deletes clear areas, categories and accounts with the user.
  await db.user.delete({ where: { id: userId } });
  const leftover = await db.area.count({ where: { userId } });
  check("cascade delete removed seeded data", leftover === 0, `${leftover} areas left`);

  await db.$disconnect();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
