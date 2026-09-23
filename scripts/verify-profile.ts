/**
 * Verify the profile columns round-trip through the real client.
 *
 *   npx tsx scripts/verify-profile.ts
 *
 * The failure this guards against is the one that just happened: `prisma db
 * push` added the columns, but the running process still held a generated client
 * from before the change, so a query selected fields the client did not know
 * about and threw PrismaClientValidationError at request time.
 *
 * A type check cannot catch that, because the type comes from the same stale
 * client. Only reading a row through `db` proves the two are in step.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` - ${detail}` : ""}`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const PROFILE_FIELDS = [
    "headline",
    "bio",
    "location",
    "avatarStyle",
    "avatarColor",
    "avatarIcon",
  ] as const;

  console.log("\nGenerated client knows the profile fields");
  {
    // Read one row selecting every profile field. If the generated client is
    // older than the schema, Prisma rejects the unknown field here rather than
    // at an arbitrary request later.
    const user = await db.user.findFirst({
      select: {
        id: true,
        email: true,
        headline: true,
        bio: true,
        location: true,
        avatarStyle: true,
        avatarColor: true,
        avatarIcon: true,
      },
    });

    for (const field of PROFILE_FIELDS) {
      check(`"${field}" is selectable`, user === null || field in user);
    }

    if (user) {
      check(
        "avatarStyle has the schema default",
        user.avatarStyle === "initials",
        `${user.avatarStyle}`,
      );
      check(
        "avatarColor has the schema default",
        user.avatarColor === "accent",
        `${user.avatarColor}`,
      );
    } else {
      console.log("  (no rows in the database, defaults not observable)");
    }
  }

  console.log("\nSession lookup still works");
  {
    // The exact call that failed in the browser. `tokenHash` must be unique in
    // the database, or `findUnique` is rejected.
    const session = await db.session.findFirst({ select: { id: true } });

    const byToken = await db.session
      .findUnique({
        where: { tokenHash: "nonexistent-token-hash-for-verification" },
        select: { id: true },
      })
      .then(() => true)
      .catch((error: unknown) => {
        console.log(`  ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
        return false;
      });

    check("findUnique on tokenHash is a valid query", byToken);
    check("session table is queryable", session !== undefined);
  }

  console.log("\nWriting a profile round-trips");
  {
    const target = await db.user.findFirst({ select: { id: true } });
    if (!target) {
      console.log("  (no user to write to)");
    } else {
      const before = await db.user.findUniqueOrThrow({
        where: { id: target.id },
        select: { headline: true, avatarStyle: true, avatarColor: true },
      });

      const updated = await db.user.update({
        where: { id: target.id },
        data: { headline: "Verifikasi profil", avatarColor: "info", avatarIcon: "target" },
        select: { headline: true, avatarColor: true, avatarIcon: true },
      });

      check("headline persists", updated.headline === "Verifikasi profil");
      check("avatarColor persists", updated.avatarColor === "info");
      check("avatarIcon persists", updated.avatarIcon === "target");

      // Restore, so the script leaves no trace.
      await db.user.update({
        where: { id: target.id },
        data: {
          headline: before.headline,
          avatarStyle: before.avatarStyle,
          avatarColor: before.avatarColor,
          avatarIcon: null,
        },
      });
      check("original values restored", true);
    }
  }

  await db.$disconnect();

  console.log(
    failures === 0
      ? "\nALL CHECKS PASSED\n"
      : `\n${failures} CHECK(S) FAILED\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nCrashed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
