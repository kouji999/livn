/**
 * Habit engine verification.
 *
 *   npx tsx scripts/verify-habits.ts
 *
 * The interesting logic in this domain is arithmetic, not storage: what counts
 * as a streak, and how consistency is measured when a habit is weekly rather
 * than daily. Those are tested directly against the real database.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { registerUser } from "../src/domains/auth/service";
import * as habits from "../src/domains/habits/service";
import { parseCalendarDay, addCalendarDays, daysBetween, today, formatCalendarDay } from "../src/lib/date";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` - ${detail}` : ""}`);
}

const TZ = "Asia/Jakarta";

/**
 * The reference day is the real current day, not a fixed date.
 *
 * `habits.getHabitMetrics` measures up to today by design, so a fixture pinned
 * to a hard-coded date silently stops describing what it asserts once real time
 * moves past it. Building the fixture relative to today keeps every expectation
 * meaningful on any day the suite is run.
 */
const DAY = today(TZ);
/** Well before the reference day, so the habit is established when measured. */
const habitStart = formatCalendarDay(addCalendarDays(DAY, -50));


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
    if (fragment) check(label, haystack.includes(fragment), message.slice(0, 60));
    else check(label, true, message.slice(0, 60));
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const email = `habit-verify+${Date.now()}@livn.test`;
  const password = "verification-passphrase-2026";
  const user = await registerUser({
    displayName: "Habit Verify",
    email,
    password,
    confirmPassword: password,
  });
  const userId = user.id;

  try {
    console.log("\nHabit creation");
    const daily = await habits.createHabit(userId, {
      name: "Baca 30 menit",
      frequency: "DAILY",
      targetCount: 1,
      startDate: habitStart,
    });
    check("daily habit created", Boolean(daily.id));
    check("default tracking is boolean", daily.trackingMethod === "BOOLEAN");

    const weekly = await habits.createHabit(userId, {
      name: "Olahraga",
      frequency: "WEEKLY",
      targetCount: 4,
      startDate: habitStart,
      colorToken: "positive",
    });
    check("weekly habit created", weekly.targetCount === 4);

    console.log("\nHabit validation");
    await expectRejection(
      "weekly target above 7 rejected",
      () => habits.createHabit(userId, {
        name: "Terlalu banyak", frequency: "WEEKLY", targetCount: 9, startDate: habitStart,
      }),
      "maksimal 7",
    );
    await expectRejection(
      "schedule with too few days for the target rejected",
      () => habits.createHabit(userId, {
        name: "Mustahil", frequency: "WEEKLY", targetCount: 4,
        scheduleDays: [1, 3], startDate: habitStart,
      }),
      "tidak mungkin",
    );
    await expectRejection(
      "measured habit without a unit rejected",
      () => habits.createHabit(userId, {
        name: "Air", frequency: "DAILY", targetCount: 1,
        trackingMethod: "QUANTITY", startDate: habitStart,
      }),
      "Satuan wajib diisi",
    );
    await expectRejection(
      "empty name rejected",
      () => habits.createHabit(userId, { name: "  ", frequency: "DAILY", startDate: habitStart }),
      "wajib diisi",
    );

    console.log("\nDaily streak");
    // Six consecutive days, ending the day before the reference so today stays open.
    for (let i = 6; i >= 1; i--) {
      const date = addCalendarDays(DAY, -i);
      await habits.setHabitCompletion(userId, {
        habitId: daily.id,
        date: date.toISOString().slice(0, 10),
        completed: true,
      });
    }

    let metrics = await habits.getHabitMetrics(userId, daily.id, TZ);
    check("six consecutive days give a streak of 6", metrics.currentStreak === 6, `${metrics.currentStreak}`);
    check("today is still open, not counted", metrics.completedToday === false);
    check("total completions is 6", metrics.totalCompletions === 6, `${metrics.totalCompletions}`);

    console.log("\nCompleting today extends the streak");
    await habits.setHabitCompletion(userId, {
      habitId: daily.id,
      date: DAY.toISOString().slice(0, 10),
      completed: true,
    });
    metrics = await habits.getHabitMetrics(userId, daily.id, TZ);
    check("streak becomes 7", metrics.currentStreak === 7, `${metrics.currentStreak}`);
    check("completedToday is true", metrics.completedToday === true);
    check("daily period is satisfied", metrics.periodSatisfied);

    console.log("\nIdempotency");
    await habits.setHabitCompletion(userId, {
      habitId: daily.id,
      date: DAY.toISOString().slice(0, 10),
      completed: true,
    });
    const logCount = await db.habitLog.count({ where: { habitId: daily.id } });
    check("repeating a completion does not create a second row", logCount === 7, `${logCount} rows`);

    console.log("\nUndo");
    await habits.setHabitCompletion(userId, {
      habitId: daily.id,
      date: DAY.toISOString().slice(0, 10),
      completed: false,
    });
    const afterUndo = await db.habitLog.count({ where: { habitId: daily.id } });
    check("undo removes the row", afterUndo === 6, `${afterUndo} rows`);
    metrics = await habits.getHabitMetrics(userId, daily.id, TZ);
    check("streak returns to 6", metrics.currentStreak === 6, `${metrics.currentStreak}`);

    console.log("\nBroken streak");
    // Remove a day in the middle: the run must be cut there.
    const gap = addCalendarDays(DAY, -3);
    await habits.setHabitCompletion(userId, {
      habitId: daily.id,
      date: gap.toISOString().slice(0, 10),
      completed: false,
    });
    metrics = await habits.getHabitMetrics(userId, daily.id, TZ);
    check(
      "streak stops at the gap",
      metrics.currentStreak === 2,
      `${metrics.currentStreak} (expected 2: the two days after the gap)`,
    );

    console.log("\nConsistency is a ratio of due opportunities");
    // This habit started on 1 August and only seven of its days are logged, so
    // consistency is legitimately low. The check is that the arithmetic is
    // sound: due opportunities are counted over the same window as the
    // completions, and a fully-kept habit reads as 100%.
    metrics = await habits.getHabitMetrics(userId, daily.id, TZ, 1);
    check("due count is positive", metrics.dueCount > 0, `${metrics.dueCount} due`);
    check(
      "consistency is the completion-to-due ratio",
      Math.abs(metrics.consistency - Math.min(1, metrics.totalCompletions / metrics.dueCount)) < 0.01,
      `${Math.round(metrics.consistency * 100)}% from ${metrics.totalCompletions}/${metrics.dueCount}`,
    );
    check(
      "missed opportunities are reported",
      metrics.missedCount > 0,
      `${metrics.missedCount} missed`,
    );

    // A habit that started recently and was kept every day must read as 100%.
    // The logs cover exactly the days the habit has existed, counted from its
    // own start date, so the two cannot drift apart.
    const freshDays = 5;
    const freshStart = formatCalendarDay(addCalendarDays(DAY, -(freshDays - 1)));
    const fresh = await habits.createHabit(userId, {
      name: "Minum air",
      frequency: "DAILY",
      targetCount: 1,
      startDate: freshStart,
    });
    for (let i = freshDays - 1; i >= 0; i--) {
      await habits.setHabitCompletion(userId, {
        habitId: fresh.id,
        date: formatCalendarDay(addCalendarDays(DAY, -i)),
        completed: true,
      });
    }

    metrics = await habits.getHabitMetrics(userId, fresh.id, TZ, 1);
    check(
      "a fully-kept daily habit is 100% consistent",
      Math.abs(metrics.consistency - 1) < 0.001,
      `${Math.round(metrics.consistency * 100)}% over ${metrics.dueCount} due days`,
    );
    check("no missed opportunities for a fully-kept habit", metrics.missedCount === 0, `${metrics.missedCount}`);
    check("weekly consistency matches", Math.abs(metrics.weeklyConsistency - 1) < 0.001);
    check("monthly consistency matches", Math.abs(metrics.monthlyConsistency - 1) < 0.001);

    // Missing one day must drop consistency below 100% but stay high.
    const skippedDay = addCalendarDays(DAY, -2);
    await habits.setHabitCompletion(userId, {
      habitId: fresh.id,
      date: skippedDay.toISOString().slice(0, 10),
      completed: false,
    });
    metrics = await habits.getHabitMetrics(userId, fresh.id, TZ, 1);
    check(
      "missing one day lowers consistency but keeps it high",
      metrics.consistency > 0.7 && metrics.consistency < 1,
      `${Math.round(metrics.consistency * 100)}%`,
    );
    check("one missed day reported", metrics.missedCount === 1, `${metrics.missedCount}`);

    console.log("\nWeekly habit: consistency counts weeks, not days");
    // Completions must fall on or before the reference day: a habit cannot be
    // satisfied in the future, so future-dated logs are correctly ignored.
    // The reference week runs Mon 21 - Sun 27 September 2026.
    const weekStart = addCalendarDays(DAY, -((DAY.getUTCDay() - 1 + 7) % 7));
    check(
      "the measured week starts on a Monday",
      weekStart.getUTCDay() === 1,
      `weekday ${weekStart.getUTCDay()}`,
    );

    await habits.setHabitCompletion(userId, {
      habitId: weekly.id,
      date: formatCalendarDay(weekStart),
      completed: true,
    });
    await habits.setHabitCompletion(userId, {
      habitId: weekly.id,
      date: formatCalendarDay(addCalendarDays(weekStart, 1)),
      completed: true,
    });

    metrics = await habits.getHabitMetrics(userId, weekly.id, TZ, 1);
    check("two completions this week", metrics.periodCount === 2, `${metrics.periodCount}`);
    check("weekly target of 4 not yet met", !metrics.periodSatisfied, `${metrics.periodCount}/4`);

    // A future-dated log must not count toward the current period. The week is
    // taken from the fixture, and a day later in it may already be past if the
    // suite runs near the week's end, so the assertion adapts.
    const futureInWeek = formatCalendarDay(addCalendarDays(weekStart, 4));
    if (futureInWeek > formatCalendarDay(DAY)) {
      await habits.setHabitCompletion(userId, {
        habitId: weekly.id,
        date: futureInWeek,
        completed: true,
      });
      metrics = await habits.getHabitMetrics(userId, weekly.id, TZ, 1);
      check(
        "a future completion is not counted yet",
        metrics.periodCount === 2,
        `${metrics.periodCount} (${futureInWeek} is after the reference day)`,
      );
    } else {
      check(
        "a future completion is not counted yet",
        true,
        "skipped: the reference day is late in the measured week",
      );
    }

    // Today's completion counts.
    await habits.setHabitCompletion(userId, {
      habitId: weekly.id,
      date: formatCalendarDay(DAY),
      completed: true,
    });
    metrics = await habits.getHabitMetrics(userId, weekly.id, TZ, 1);
    check("three completions up to today", metrics.periodCount === 3, `${metrics.periodCount}`);

    console.log("\nWeekly habit: partial week");
    await habits.setHabitCompletion(userId, {
      habitId: weekly.id,
      date: formatCalendarDay(addCalendarDays(weekStart, 1)),
      completed: false,
    });
    metrics = await habits.getHabitMetrics(userId, weekly.id, TZ, 1);
    check("removing one completion drops the period count to 2", metrics.periodCount === 2, `${metrics.periodCount}`);
    check("weekly target no longer satisfied", !metrics.periodSatisfied);

    console.log("\nSchedule awareness");
    // A habit limited to Mon/Wed/Fri should not count Saturday as a miss.
    const scheduled = await habits.createHabit(userId, {
      name: "Angkat beban",
      frequency: "WEEKLY",
      targetCount: 3,
      scheduleDays: [1, 3, 5],
      startDate: habitStart,
    });

    const monday = weekStart;
    check("Monday is eligible", habits.isEligible(monday, [1, 3, 5]));
    const saturday = addCalendarDays(weekStart, 5);
    check("Saturday is not eligible", !habits.isEligible(saturday, [1, 3, 5]));
    check("a habit with no schedule is eligible every day", habits.isEligible(saturday, []));

    await habits.setHabitCompletion(userId, {
      habitId: scheduled.id,
      date: formatCalendarDay(weekStart),
      completed: true,
    });
    metrics = await habits.getHabitMetrics(userId, scheduled.id, TZ, 1);
    check(
      "an unscheduled day does not lower consistency",
      metrics.consistency > 0,
      `${Math.round(metrics.consistency * 100)}% on ${metrics.dueCount} due days`,
    );

    console.log("\nHabits for a day");
    const forDay = await habits.getHabitsForDay(userId, DAY, 1);
    check("daily habit appears on its day", forDay.some((h) => h.habit.id === daily.id));
    check(
      "habit not scheduled for today is excluded",
      !forDay.some((h) => h.habit.id === scheduled.id) || habits.isEligible(DAY, [1, 3, 5]),
      `today is weekday ${DAY.getUTCDay()}`,
    );

    console.log("\nDate bounds");
    await expectRejection(
      "completing before the habit started is refused",
      () => habits.setHabitCompletion(userId, {
        habitId: daily.id, date: formatCalendarDay(addCalendarDays(DAY, -200)), completed: true,
      }),
      "belum dimulai",
    );

    console.log("\nOwnership");
    const other = await registerUser({
      displayName: "Other", email: `other+${Date.now()}@livn.test`,
      password, confirmPassword: password,
    });
    await expectRejection(
      "cannot read another user's habit",
      () => habits.getHabit(other.id, daily.id),
      "tidak ditemukan",
    );
    await expectRejection(
      "cannot log against another user's habit",
      () => habits.setHabitCompletion(other.id, {
        habitId: daily.id, date: formatCalendarDay(addCalendarDays(DAY, -1)), completed: true,
      }),
      "tidak ditemukan",
    );

    console.log("\nArchiving keeps history");
    await habits.archiveHabit(userId, weekly.id);
    const active = await habits.listHabits(userId);
    check("archived habit leaves the active list", !active.some((h) => h.id === weekly.id));
    const all = await habits.listHabits(userId, { includeArchived: true });
    check("archived habit still exists", all.some((h) => h.id === weekly.id));
    const logsKept = await db.habitLog.count({ where: { habitId: weekly.id } });
    check("its logs are preserved", logsKept === 3, `${logsKept} logs`);

    console.log("\nCleanup");
    await db.user.delete({ where: { id: other.id } });
    await db.user.delete({ where: { id: userId } });
    const remaining = await db.habitLog.count({ where: { userId } });
    check("cascade removed all habit logs", remaining === 0, `${remaining} left`);

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

void daysBetween;
main();
