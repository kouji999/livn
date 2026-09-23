/**
 * Journal and timeline verification.
 *
 *   npx tsx scripts/verify-journal.ts
 *
 * The claims worth proving: one entry per day is enforced rather than hoped
 * for, mood is genuinely optional, the timeline merges every domain without
 * duplicating or dropping rows, and a reversed transaction does not appear in
 * the timeline as income or expense.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { registerUser } from "../src/domains/auth/service";
import * as journal from "../src/domains/journal/service";
import * as tasks from "../src/domains/plan/tasks";
import * as finance from "../src/domains/finance/service";
import { parseCalendarDay, formatCalendarDay, addCalendarDays } from "../src/lib/date";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` - ${detail}` : ""}`);
}

async function expectRejection(label: string, fn: () => Promise<unknown>, fragment?: string) {
  try {
    await fn();
    check(label, false, "expected a rejection but it succeeded");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fieldErrors =
      typeof error === "object" && error !== null && "fieldErrors" in error
        ? JSON.stringify((error as { fieldErrors?: unknown }).fieldErrors ?? {})
        : "";
    const haystack = `${message} ${fieldErrors}`;
    if (fragment) check(label, haystack.includes(fragment), message.slice(0, 70));
    else check(label, true, message.slice(0, 70));
  }
}

const TZ = "Asia/Jakarta";
const DAY = parseCalendarDay("2026-09-23")!;
const DAY_KEY = formatCalendarDay(DAY);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const email = `journal-verify+${Date.now()}@livn.test`;
  const password = "verification-passphrase-2026";
  const user = await registerUser({
    displayName: "Journal Verify",
    email,
    password,
    confirmPassword: password,
  });
  const userId = user.id;

  try {
    console.log("\nWriting an entry");
    const saved = await journal.saveJournalEntry(userId, {
      date: DAY_KEY,
      title: "Hari yang produktif",
      body: "Pagi lari, siang kerja, malam belajar. Hari ini terasa seimbang.",
      mood: 8,
      energy: 6,
      focus: 7,
      tags: ["olahraga", "kerja"],
    });
    check("entry created", Boolean(saved.id));
    check("tags returned", saved.tags.length === 2, saved.tags.join(", "));

    console.log("\nBody is the only required field");
    const minimal = await journal.saveJournalEntry(userId, {
      date: "2026-09-22",
      body: "Singkat saja.",
    });
    check("entry without mood saves", minimal.mood === null);
    check("entry without title saves", minimal.title === null);
    check("entry without tags saves", minimal.tags.length === 0);

    await expectRejection(
      "empty body rejected",
      () => journal.saveJournalEntry(userId, { date: DAY_KEY, body: "   " }),
      "tidak boleh kosong",
    );
    await expectRejection(
      "impossible date rejected",
      () => journal.saveJournalEntry(userId, { date: "2026-02-31", body: "x" }),
      "tidak ada di kalender",
    );
    await expectRejection(
      "mood above 10 rejected",
      () => journal.saveJournalEntry(userId, { date: "2026-09-21", body: "x", mood: 11 }),
      "maksimal 10",
    );
    await expectRejection(
      "mood of 0 rejected",
      () => journal.saveJournalEntry(userId, { date: "2026-09-21", body: "x", mood: 0 }),
      "minimal 1",
    );

    console.log("\nOne entry per day");
    await journal.saveJournalEntry(userId, {
      date: DAY_KEY,
      body: "Diedit: ternyata harinya lebih baik dari yang kukira.",
      mood: 9,
      energy: 7,
      focus: 8,
      tags: ["kerja"],
    });
    const count = await db.journalEntry.count({ where: { userId, date: DAY } });
    check("saving twice updates rather than duplicating", count === 1, `${count} rows`);

    const reread = await journal.getJournalEntry(userId, DAY_KEY);
    check("the update took effect", reread?.body.includes("Diedit") === true, reread?.body.slice(0, 30));
    check("mood updated to 9", reread?.mood === 9, `${reread?.mood}`);

    // The editor submits the whole form, so a field absent from the payload is
    // a field the user cleared. Confirm that is what "omitted" means.
    await journal.saveJournalEntry(userId, {
      date: DAY_KEY,
      body: "Diedit lagi, kali ini tanpa skala.",
      tags: ["kerja"],
    });
    const cleared = await journal.getJournalEntry(userId, DAY_KEY);
    check(
      "omitting a scale clears it, matching what the form submits",
      cleared?.mood === null && cleared?.energy === null && cleared?.focus === null,
      `mood=${cleared?.mood} energy=${cleared?.energy} focus=${cleared?.focus}`,
    );

    // Restore a mood so the statistics assertions below have something to read.
    await journal.saveJournalEntry(userId, {
      date: DAY_KEY,
      body: "Diedit lagi, dengan mood.",
      mood: 9,
      tags: ["kerja"],
    });

    console.log("\nTags are per-user and reusable");
    // Two entries asking for the same tag must share one tag row.
    await journal.saveJournalEntry(userId, {
      date: "2026-09-20",
      body: "Hari lain.",
      tags: ["olahraga", "istirahat"],
    });
    await journal.saveJournalEntry(userId, {
      date: "2026-09-19",
      body: "Hari sebelumnya.",
      tags: ["olahraga"],
    });

    const tags = await journal.listTags(userId);
    check("three distinct tags exist", tags.length === 3, tags.map((t) => t.name).join(", "));
    const workout = tags.find((t) => t.name === "olahraga");
    check(
      "the same tag used by two entries is one row",
      workout?._count.journalEntries === 2,
      `${workout?._count.journalEntries} entries`,
    );

    console.log("\nTag replacement is wholesale");
    // Replacing the tag set on a day must detach the tags it no longer lists.
    await journal.saveJournalEntry(userId, {
      date: DAY_KEY,
      body: "Diedit lagi dengan tag baru.",
      mood: 9,
      tags: ["kerja", "fokus"],
    });
    const afterReplace = await journal.getJournalEntry(userId, DAY_KEY);
    check(
      "new tags are attached",
      afterReplace?.tags.length === 2 &&
        afterReplace.tags.some((t) => t.tag.name === "fokus"),
      afterReplace?.tags.map((t) => t.tag.name).join(", "),
    );
    check(
      "replacing a tag set leaves the tag row itself intact",
      (await journal.listTags(userId)).some((t) => t.name === "kerja"),
      "kerja still exists for other entries",
    );

    console.log("\nJournal statistics");
    const stats = await journal.getJournalStats(userId, TZ);
    check("counts every entry", stats.totalEntries === 4, `${stats.totalEntries}`);
    check("average mood ignores entries without one", stats.averageMood === 9, `${stats.averageMood}`);
    check("reports how many entries carry a mood", stats.moodEntryCount === 1, `${stats.moodEntryCount}`);
    check(
      "average energy is null when no entry recorded it",
      stats.averageEnergy === null,
      `${stats.averageEnergy}`,
    );

    // Two consecutive days ending yesterday gives a streak of 2 from today's
    // perspective, since today is still counted while the day is running.
    check("streak computed from consecutive days", stats.currentStreak >= 2, `${stats.currentStreak}`);
    check("best streak recorded", stats.bestStreak >= 2, `${stats.bestStreak}`);

    console.log("\nLife events");
    const event = await journal.createLifeEvent(userId, {
      title: "Mulai rutin berenang",
      date: "2026-09-20",
      category: "HEALTH",
      isMilestone: false,
    });
    check("event created", Boolean(event.id));

    const milestone = await journal.createLifeEvent(userId, {
      title: "Menabung Rp10 juta",
      date: "2026-09-21",
      category: "MILESTONE",
      isMilestone: true,
    });
    check("milestone created", milestone.isMilestone === true);

    await expectRejection(
      "event with an empty title rejected",
      () => journal.createLifeEvent(userId, { title: "  ", date: DAY_KEY }),
      "wajib diisi",
    );

    const dayEvents = await journal.getEventsForDay(userId, parseCalendarDay("2026-09-20")!);
    check("events are retrievable by day", dayEvents.length === 1, `${dayEvents.length}`);

    const milestoneOnly = await journal.listLifeEvents(userId, { milestonesOnly: true });
    check("milestones can be filtered", milestoneOnly.events.length === 1, `${milestoneOnly.events.length}`);

    console.log("\nTimeline merges every domain");
    // A completed task and a transaction, so the merge has all five kinds.
    const task = await tasks.createTask(userId, { title: "Selesaikan laporan" });
    await tasks.toggleTaskCompletion(userId, task.id);

    const cash = (await finance.listAccounts(userId)).find((a) => a.type === "CASH")!;
    const earned = await finance.createTransaction(userId, {
      type: "INCOME",
      amount: "500000",
      accountId: cash.id,
      occurredOn: DAY_KEY,
      description: "Bayaran freelance",
    });
    await finance.createTransaction(userId, {
      type: "EXPENSE",
      amount: "85000",
      accountId: cash.id,
      occurredOn: DAY_KEY,
      description: "Makan siang",
    });

    const timeline = await journal.getTimeline(userId, {
      from: addCalendarDays(DAY, -7),
      to: DAY,
      limit: 100,
    });

    const kinds = new Set(timeline.map((item) => item.kind));
    check("contains journal entries", kinds.has("journal"));
    check("contains life events", kinds.has("event"));
    check("contains completed tasks", kinds.has("task"));
    check("contains transactions", kinds.has("transaction"));

    check(
      "sorted newest first",
      timeline.every((item, i) => i === 0 || timeline[i - 1].date >= item.date),
    );

    const incomeEntry = timeline.find((item) => item.id === `transaction-${earned.id}`);
    check("income shows a plus sign", incomeEntry?.amount?.startsWith("+") ?? false, incomeEntry?.amount ?? "missing");

    console.log("\nTimeline excludes what should not be there");
    const transfer = await finance.createTransaction(userId, {
      type: "TRANSFER",
      amount: "100000",
      accountId: cash.id,
      toAccountId: (await finance.listAccounts(userId)).find((a) => a.type === "BANK")!.id,
      occurredOn: DAY_KEY,
      description: "Transfer internal",
    });
    const afterTransfer = await journal.getTimeline(userId, {
      from: DAY,
      to: DAY,
      limit: 100,
    });
    check(
      "internal transfers stay out of the timeline",
      !afterTransfer.some((item) => item.id === `transaction-${transfer.id}`),
    );

    // An open task is planned work, not something that happened.
    const openTask = await tasks.createTask(userId, { title: "Belum dikerjakan" });
    const afterOpen = await journal.getTimeline(userId, { from: DAY, to: DAY, limit: 100 });
    check(
      "incomplete tasks are not on the timeline",
      !afterOpen.some((item) => item.id === `task-${openTask.id}`),
    );

    console.log("\nA reversed expense leaves the timeline");
    const snack = await finance.createTransaction(userId, {
      type: "EXPENSE",
      amount: "20000",
      accountId: cash.id,
      occurredOn: DAY_KEY,
      description: "Salah catat",
    });
    const beforeReverse = await journal.getTimeline(userId, { from: DAY, to: DAY, limit: 100 });
    check("the expense is on the timeline before reversal", beforeReverse.some((i) => i.id === `transaction-${snack.id}`));

    await finance.reverseTransaction(userId, snack.id);
    const afterReverse = await journal.getTimeline(userId, { from: DAY, to: DAY, limit: 100 });
    check(
      "the reversed expense is gone from the timeline",
      !afterReverse.some((i) => i.id === `transaction-${snack.id}`),
    );

    console.log("\nTimeline summary");
    const summary = await journal.getTimelineSummary(userId, addCalendarDays(DAY, -7), DAY);
    check("counts events", summary.events === 2, `${summary.events}`);
    // Four entries fall in the last seven days: 23, 22, 20 and 19 September.
    check("counts journals in the window", summary.journals === 4, `${summary.journals}`);
    check("counts completed tasks", summary.tasks >= 1, `${summary.tasks}`);
    check("net money is income minus expense", summary.netMoney === 500_000n - 85_000n, `${summary.netMoney}`);

    console.log("\nDate range filtering");
    const narrow = await journal.getTimeline(userId, {
      from: parseCalendarDay("2026-09-22")!,
      to: parseCalendarDay("2026-09-22")!,
      limit: 100,
    });
    check(
      "a one-day window returns only that day",
      narrow.every((item) => item.date === "2026-09-22"),
      `${narrow.length} items`,
    );

    const kindFiltered = await journal.getTimeline(userId, {
      from: addCalendarDays(DAY, -7),
      to: DAY,
      kinds: ["journal"],
      limit: 100,
    });
    check(
      "kind filter returns only journals",
      kindFiltered.every((item) => item.kind === "journal"),
      `${kindFiltered.length} items`,
    );

    console.log("\nOwnership");
    const other = await registerUser({
      displayName: "Other", email: `other+${Date.now()}@livn.test`,
      password, confirmPassword: password,
    });

    const otherTimeline = await journal.getTimeline(other.id, {
      from: addCalendarDays(DAY, -30),
      to: DAY,
      limit: 100,
    });
    check("another user sees an empty timeline", otherTimeline.length === 0, `${otherTimeline.length} items`);

    await expectRejection(
      "cannot delete another user's journal entry",
      () => journal.deleteJournalEntry(other.id, saved.id),
      "tidak ditemukan",
    );
    await expectRejection(
      "cannot edit another user's life event",
      () => journal.updateLifeEvent(other.id, event.id, { title: "Hijacked" }),
      "tidak ditemukan",
    );

    console.log("\nLinked records must belong to the caller");
    // The goal is created up front so the assertion is about ownership rather
    // than about `await` placement inside the callback.
    const privateGoal = await db.goal.create({
      data: { userId, title: "Private goal", goalType: "BINARY" },
      select: { id: true },
    });

    await expectRejection(
      "cannot link a journal entry to another user's goal",
      () => journal.saveJournalEntry(other.id, {
        date: DAY_KEY,
        body: "Sneaky",
        tags: [],
        goalIds: [privateGoal.id],
        projectIds: [],
      }),
      "tidak ditemukan",
    );

    console.log("\nSoft delete");
    await journal.deleteJournalEntry(userId, saved.id);
    const visible = await journal.listJournalEntries(userId, { limit: 100 });
    check(
      "deleted entry leaves the list",
      !visible.entries.some((e) => e.id === saved.id),
    );
    const stillThere = await db.journalEntry.findUnique({
      where: { id: saved.id },
      select: { deletedAt: true },
    });
    check("the row is retained, not erased", stillThere?.deletedAt !== null);

    console.log("\nCleanup");
    await db.user.delete({ where: { id: other.id } });
    await db.user.delete({ where: { id: userId } });
    const remaining = await db.journalEntry.count({ where: { userId } });
    check("cascade removed all journal data", remaining === 0, `${remaining} left`);

    await db.$disconnect();
    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
    process.exit(failures === 0 ? 0 : 1);
  } catch (error) {
    console.error("\nVerification crashed:", error);
    await db.user.delete({ where: { id: userId } }).catch(() => undefined);
    await db.$disconnect();
    process.exit(1);
  }
}

main();
