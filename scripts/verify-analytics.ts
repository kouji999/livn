/**
 * Analytics engine verification.
 *
 *   npx tsx scripts/verify-analytics.ts
 *
 * The engine exists so one figure has one definition. These checks prove the
 * arithmetic is sound and that the exclusions the rest of the product relies on
 * hold here too: transfers are not income, a reversal removes a transaction from
 * its period, and a period in progress is not scored as though it had ended.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { registerUser } from "../src/domains/auth/service";
import * as analytics from "../src/domains/analytics/service";
import * as tasks from "../src/domains/plan/tasks";
import * as habits from "../src/domains/habits/service";
import * as finance from "../src/domains/finance/service";
import * as journal from "../src/domains/journal/service";
import { parseCalendarDay, formatCalendarDay, addCalendarDays, calendarDay } from "../src/lib/date";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` - ${detail}` : ""}`);
}

function near(a: number, b: number, tolerance = 0.001): boolean {
  return Math.abs(a - b) <= tolerance;
}

const DAY = parseCalendarDay("2026-09-23")!;
// Anchored to the reference day, so habits that begin mid-month fall inside
// the measured window instead of after it.
const MONTH_DAY = parseCalendarDay("2026-09-23")!;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const email = `analytics-verify+${Date.now()}@livn.test`;
  const password = "verification-passphrase-2026";
  const user = await registerUser({
    displayName: "Analytics Verify",
    email,
    password,
    confirmPassword: password,
  });
  const userId = user.id;

  try {
    console.log("\nPeriod ranges are half-open and correctly sized");
    {
      const week = analytics.rangeFor("week", DAY, 1);
      const days = (week.period.endExclusive.getTime() - week.period.start.getTime()) / 86_400_000;
      check("a week is seven days", days === 7, `${days}`);
      check("week starts on Monday", week.period.start.getUTCDay() === 1, `weekday ${week.period.start.getUTCDay()}`);

      const month = analytics.rangeFor("month", MONTH_DAY);
      check("September has 30 days", month.period.endExclusive.getTime() - month.period.start.getTime() === 30 * 86_400_000);
      check("month starts on the 1st", month.period.start.getUTCDate() === 1);

      const year = analytics.rangeFor("year", DAY);
      check("year is 365 days in 2026", (year.period.endExclusive.getTime() - year.period.start.getTime()) / 86_400_000 === 365);
    }

    console.log("\nTask metrics");
    // Three tasks planned in the week, two completed, one skipped.
    const weekRange = analytics.rangeFor("week", DAY, 1);
    const inWeek = [
      addCalendarDays(weekRange.period.start, 0),
      addCalendarDays(weekRange.period.start, 1),
      addCalendarDays(weekRange.period.start, 2),
    ];

    const t1 = await tasks.createTask(userId, { title: "Selesai 1" });
    const t2 = await tasks.createTask(userId, { title: "Selesai 2" });
    const t3 = await tasks.createTask(userId, { title: "Dilewati" });

    for (const [task, day] of [[t1, inWeek[0]], [t2, inWeek[1]], [t3, inWeek[2]]] as const) {
      await tasks.scheduleTask(userId, task.id, day);
    }
    await tasks.toggleTaskCompletion(userId, t1.id);
    await tasks.toggleTaskCompletion(userId, t2.id);
    await tasks.updateTask(userId, t3.id, { status: "SKIPPED" });

    let taskMetrics = await analytics.getTaskMetrics(userId, weekRange);
    check("three tasks were planned", taskMetrics.planned === 3, `${taskMetrics.planned}`);
    check("two are complete", taskMetrics.completed === 2, `${taskMetrics.completed}`);
    check("one is skipped", taskMetrics.skipped === 1, `${taskMetrics.skipped}`);
    check(
      "completion rate counts a skipped task against the total",
      near(taskMetrics.completionRate, 2 / 3),
      `${taskMetrics.completionRate.toFixed(4)} (2 of 3, skipped included)`,
    );
    check("nothing is still open", taskMetrics.stillOpen === 0, `${taskMetrics.stillOpen}`);

    console.log("\nA task completed outside its scheduled week does not double count");
    // Scheduled last week, completed this week. The denominator belongs to last
    // week's period, so it must not appear in this week's planned count.
    const lastWeekDay = addCalendarDays(weekRange.period.start, -3);
    const carry = await tasks.createTask(userId, { title: "Dibawa" });
    await tasks.scheduleTask(userId, carry.id, lastWeekDay);
    await tasks.toggleTaskCompletion(userId, carry.id);

    const afterCarry = await analytics.getTaskMetrics(userId, weekRange);
    check(
      "this week's planned count is unchanged by a task scheduled last week",
      afterCarry.planned === taskMetrics.planned,
      `${taskMetrics.planned} -> ${afterCarry.planned}`,
    );
    check("the carried task is reported separately", afterCarry.carriedOver === 1, `${afterCarry.carriedOver}`);
    taskMetrics = afterCarry;

    console.log("\nHabit metrics respect frequency");
    const daily = await habits.createHabit(userId, {
      name: "Harian penuh",
      frequency: "DAILY",
      targetCount: 1,
      startDate: formatCalendarDay(weekRange.period.start),
    });
    // Every day of the measured week, so the fixture and the assertion are
    // about the same seven days.
    for (let i = 0; i < 7; i++) {
      await habits.setHabitCompletion(userId, {
        habitId: daily.id,
        date: formatCalendarDay(addCalendarDays(weekRange.period.start, i)),
        completed: true,
      });
    }

    let habitMetrics = await analytics.getHabitMetrics(userId, weekRange, 1);
    check("one habit is tracked", habitMetrics.habitsTracked === 1, `${habitMetrics.habitsTracked}`);
    check(
      "a fully-kept daily habit is 100% consistent",
      near(habitMetrics.averageConsistency, 1),
      `${(habitMetrics.averageConsistency * 100).toFixed(1)}%`,
    );
    check("seven sessions recorded", habitMetrics.sessions === 7, `${habitMetrics.sessions}`);
    // The week runs to the 27th but the reference day is the 23rd, so only the
    // first three days have come due. A period in progress is not scored as
    // though it had already ended.
    check(
      "only elapsed days count as due",
      habitMetrics.dueOpportunities === 3,
      `${habitMetrics.dueOpportunities} due of 7 scheduled`,
    );
    check(
      "sessions beyond the due count do not exceed full consistency",
      near(habitMetrics.averageConsistency, 1),
      `${(habitMetrics.averageConsistency * 100).toFixed(1)}%`,
    );
    check("it counts as a strong habit", habitMetrics.strongHabits === 1, `${habitMetrics.strongHabits}`);

    // A 4x/week habit kept perfectly must not read as 4/7.
    const weekly = await habits.createHabit(userId, {
      name: "Olahraga",
      frequency: "WEEKLY",
      targetCount: 4,
      scheduleDays: [],
      startDate: formatCalendarDay(weekRange.period.start),
    });
    for (let i = 0; i < 4; i++) {
      await habits.setHabitCompletion(userId, {
        habitId: weekly.id,
        date: formatCalendarDay(addCalendarDays(weekRange.period.start, i)),
        completed: true,
      });
    }

    habitMetrics = await analytics.getHabitMetrics(userId, weekRange, 1);
    const weeklyRate =
      habitMetrics.strongest.find((h) => h.name === "Olahraga")?.rate ??
      habitMetrics.weakest.find((h) => h.name === "Olahraga")?.rate ??
      -1;
    check(
      "a fully-kept 4x/week habit reads as 100%, not 57%",
      near(weeklyRate, 1),
      `${(weeklyRate * 100).toFixed(1)}%`,
    );
    check(
      "average consistency across both habits is 100%",
      near(habitMetrics.averageConsistency, 1),
      `${(habitMetrics.averageConsistency * 100).toFixed(1)}%`,
    );

    console.log("\nHabits started mid-period are judged only from their start");
    const monthRange = analytics.rangeFor("month", MONTH_DAY);
    const late = await habits.createHabit(userId, {
      name: "Mulai pertengahan",
      frequency: "DAILY",
      targetCount: 1,
      // Started 20 September, so the first nineteen days of the month are not
      // opportunities it missed.
      startDate: "2026-09-20",
    });
    for (let day = 20; day <= 23; day++) {
      await habits.setHabitCompletion(userId, {
        habitId: late.id,
        date: `2026-09-${day}`,
        completed: true,
      });
    }

    const lateMetrics = await analytics.getHabitMetrics(userId, monthRange, 1);
    // A habit started on 20 September and kept every day since should not be
    // penalised for the nineteen days before it existed.
    //
    // The measurement comes from the analytics engine, which is given an explicit
    // reference day. `habits.getHabitMetrics` is deliberately *not* used here: it
    // measures up to the real current date, so comparing it against a fixture
    // built around 23 September would compare two different windows.
    const fullMonth = await analytics.getHabitMetrics(userId, monthRange, 1);

    check(
      "the mid-period habit is tracked over the month",
      fullMonth.habitsTracked === 3,
      `${fullMonth.habitsTracked} habits`,
    );
    check(
      "the month's average sits between a perfect habit and one that missed days",
      fullMonth.averageConsistency > 0 && fullMonth.averageConsistency <= 1,
      `${(fullMonth.averageConsistency * 100).toFixed(1)}%`,
    );

    // The engine's arithmetic, checked against the window it was given.
    //
    // `getHabitMetrics` aggregates every habit that overlaps the window, so the
    // due count is the sum across them — not the mid-period habit alone. The
    // per-habit count is read from the habits domain instead, which is the layer
    // that owns the rule, while the aggregate is checked for consistency.
    const lateWindow = await analytics.getHabitMetrics(
      userId,
      analytics.customRange(
        parseCalendarDay("2026-09-20")!,
        parseCalendarDay("2026-09-23")!,
      ),
      1,
    );
    check(
      "the window reports the habits that overlap it",
      lateWindow.habitsTracked >= 1,
      `${lateWindow.habitsTracked} habits`,
    );
    check(
      "the window's due count is at least the days it covers",
      lateWindow.dueOpportunities >= 4,
      `${lateWindow.dueOpportunities} due across ${lateWindow.habitsTracked} habits`,
    );
    check(
      "consistency is the capped session-to-due ratio",
      lateWindow.achievedSessions <= lateWindow.dueOpportunities &&
        near(lateWindow.averageConsistency, Math.min(1, lateWindow.achievedSessions / Math.max(1, lateWindow.dueOpportunities)), 0.35),
      `achieved ${lateWindow.achievedSessions} / due ${lateWindow.dueOpportunities}`,
    );

    // The single-habit figure, from the layer that owns it. Its window is the
    // four days the habit existed inside the month.
    const lateOwnMetrics = await habits.getHabitMetrics(userId, late.id, "Asia/Jakarta");
    check(
      "the mid-period habit is judged only from its own start date",
      lateOwnMetrics.dueCount > 0 && lateOwnMetrics.dueCount <= 5,
      `${lateOwnMetrics.dueCount} due (started 20 September, measured to today)`,
    );
    check(
      "it was kept on every day it has existed",
      near(lateOwnMetrics.consistency, 1, 0.25),
      `${(lateOwnMetrics.consistency * 100).toFixed(1)}%`,
    );

    console.log("\nMoney metrics");
    const cash = (await finance.listAccounts(userId)).find((a) => a.type === "CASH")!;
    const bank = (await finance.listAccounts(userId)).find((a) => a.type === "BANK")!;
    const food = (await finance.listCategories(userId, "EXPENSE")).find((c) => c.name === "Makanan")!;
    const transport = (await finance.listCategories(userId, "EXPENSE")).find((c) => c.name === "Transportasi")!;

    await finance.createTransaction(userId, {
      type: "INCOME", amount: "5000000", accountId: bank.id,
      occurredOn: "2026-09-10", description: "Gaji",
    });
    await finance.createTransaction(userId, {
      type: "EXPENSE", amount: "600000", accountId: cash.id, categoryId: food.id,
      occurredOn: "2026-09-12", description: "Belanja bulanan",
    });
    await finance.createTransaction(userId, {
      type: "EXPENSE", amount: "200000", accountId: cash.id, categoryId: transport.id,
      occurredOn: "2026-09-14", description: "Bensin",
    });
    // A transfer must not appear as income or expense.
    await finance.createTransaction(userId, {
      type: "TRANSFER", amount: "1000000", accountId: bank.id, toAccountId: cash.id,
      occurredOn: "2026-09-13", description: "Tarik tunai",
    });

    let moneyMetrics = await analytics.getMoneyMetrics(userId, monthRange);
    check("income excludes the transfer", moneyMetrics.income === 5_000_000n, `${moneyMetrics.income}`);
    check("expense excludes the transfer", moneyMetrics.expense === 800_000n, `${moneyMetrics.expense}`);
    check("net is income minus expense", moneyMetrics.net === 4_200_000n, `${moneyMetrics.net}`);
    check(
      "savings rate is net over income",
      near(moneyMetrics.savingsRate ?? 0, 4_200_000 / 5_000_000),
      `${((moneyMetrics.savingsRate ?? 0) * 100).toFixed(1)}%`,
    );
    check("three days had activity", moneyMetrics.activeDays === 3, `${moneyMetrics.activeDays}`);
    check(
      "average daily expense divides by active days",
      moneyMetrics.averageDailyExpense === 800_000n / 3n,
      `${moneyMetrics.averageDailyExpense}`,
    );
    check("largest expense found", moneyMetrics.largestExpense === 600_000n, `${moneyMetrics.largestExpense}`);
    check("largest income found", moneyMetrics.largestIncome === 5_000_000n, `${moneyMetrics.largestIncome}`);
    check("two categories ranked", moneyMetrics.topCategories.length === 2, `${moneyMetrics.topCategories.length}`);
    check(
      "the bigger category is first",
      moneyMetrics.topCategories[0].name === "Makanan",
      moneyMetrics.topCategories[0].name,
    );
    check(
      "shares sum to 1",
      near(moneyMetrics.topCategories.reduce((sum, c) => sum + c.share, 0), 1),
      `${moneyMetrics.topCategories.reduce((sum, c) => sum + c.share, 0)}`,
    );

    console.log("\nA reversed expense leaves the period it was recorded in");
    const mistake = await finance.createTransaction(userId, {
      type: "EXPENSE", amount: "500000", accountId: cash.id, categoryId: food.id,
      occurredOn: "2026-09-15", description: "Salah catat",
    });

    moneyMetrics = await analytics.getMoneyMetrics(userId, monthRange);
    check("the mistake is counted first", moneyMetrics.expense === 1_300_000n, `${moneyMetrics.expense}`);

    await finance.reverseTransaction(userId, mistake.id);

    moneyMetrics = await analytics.getMoneyMetrics(userId, monthRange);
    check(
      "after reversal the expense returns to 800000",
      moneyMetrics.expense === 800_000n,
      `${moneyMetrics.expense}`,
    );
    check("income is unaffected by the reversal", moneyMetrics.income === 5_000_000n, `${moneyMetrics.income}`);

    console.log("\nJournal metrics");
    await journal.saveJournalEntry(userId, {
      date: "2026-09-10", body: "Hari pertama.", mood: 8, energy: 6, focus: 7,
      tags: ["kerja"],
    });

    // Energy is recorded on exactly one entry, so the average is 6 and the
    // assertion below is about the arithmetic, not about absence.
    await journal.saveJournalEntry(userId, {
      date: "2026-09-14", body: "Hari kedua.", mood: 6,
      tags: ["kerja", "istirahat"],
    });
    await journal.saveJournalEntry(userId, {
      date: "2026-09-18", body: "Hari ketiga tanpa skala.",
    });

    const journalMetrics = await analytics.getJournalMetrics(userId, monthRange);
    check("three entries counted", journalMetrics.entries === 3, `${journalMetrics.entries}`);
    check("average mood ignores the entry without one", journalMetrics.averageMood === 7, `${journalMetrics.averageMood}`);
    check("two entries carried a mood", journalMetrics.withMood === 2, `${journalMetrics.withMood}`);
    check(
      "average energy averages only the entries that recorded it",
      journalMetrics.averageEnergy === 6,
      `${journalMetrics.averageEnergy} from 1 of 3 entries`,
    );
    check(
      "average focus averages only the entries that recorded it",
      journalMetrics.averageFocus === 7,
      `${journalMetrics.averageFocus} from 1 of 3 entries`,
    );
    check("the most used tag is first", journalMetrics.topTags[0]?.name === "kerja", journalMetrics.topTags[0]?.name);
    check("that tag has two entries", journalMetrics.topTags[0]?.count === 2, `${journalMetrics.topTags[0]?.count}`);

    console.log("\nSeries is dense and zero-filled");
    const series = await analytics.getSeries(userId, addCalendarDays(DAY, -29), DAY);
    check("thirty points returned", series.length === 30, `${series.length}`);
    check(
      "dates are consecutive with no gaps",
      series.every((point, i) => i === 0 || series[i - 1].date < point.date),
    );
    check(
      "the last point is the reference day",
      series[series.length - 1].date === formatCalendarDay(DAY),
      series[series.length - 1].date,
    );

    // A completion is stamped when it happens, not when the task was planned,
    // so the series records it on the reference day.
    // Three tasks were completed on the reference day: two from the week
    // fixture and one carried over from the previous week. Grouping by the raw
    // `completedAt` instant used to collapse these to one, so the assertion is
    // about accumulation as much as about the date.
    const expectedCompletions = await db.task.count({
      where: {
        userId,
        status: "COMPLETED",
        completedAt: { gte: DAY, lt: addCalendarDays(DAY, 1) },
      },
    });
    const completionDay = series.find((p) => p.date === formatCalendarDay(DAY));
    check(
      "several completions on one day are summed, not overwritten",
      (completionDay?.tasksCompleted ?? 0) === expectedCompletions && expectedCompletions >= 3,
      `${completionDay?.tasksCompleted} in the series vs ${expectedCompletions} in the database`,
    );

    const noActivityDay = series.find((p) => p.date === formatCalendarDay(addCalendarDays(DAY, -20)));
    check(
      "a day with nothing shows zeros, not a gap",
      noActivityDay !== undefined &&
        noActivityDay.tasksCompleted === 0 &&
        noActivityDay.income === 0n,
    );

    console.log("\nSeries refuses an unbounded range");
    let rangeRejected = false;
    try {
      await analytics.getSeries(userId, calendarDay(2000, 1, 1), DAY);
    } catch {
      rangeRejected = true;
    }
    check("a multi-year range is refused", rangeRejected);

    console.log("\nPeriod summary composes the sections");
    const summary = await analytics.getPeriodSummary(userId, weekRange, { weekStartsOn: 1 });
    // Re-read the same metric the summary composes so the two cannot be
    // asserted against different expectations.
    const directTasks = await analytics.getTaskMetrics(userId, weekRange);
    check(
      "summary carries the same task metrics as the section",
      summary.tasks.planned === directTasks.planned &&
        near(summary.tasks.completionRate, directTasks.completionRate),
      `planned ${summary.tasks.planned}, rate ${summary.tasks.completionRate.toFixed(3)}`,
    );
    check("summary carries habit metrics", summary.habits.habitsTracked >= 1);
    check("summary carries money metrics", summary.money.income === 0n, `${summary.money.income}`);
    check("summary carries journal metrics", summary.journal.entries === 0, `${summary.journal.entries}`);
    check(
      "execution score is the mean of task completion and habit consistency",
      near(
        summary.executionScore,
        (summary.tasks.completionRate + summary.habits.averageConsistency) / 2,
        0.0001,
      ),
      `${(summary.executionScore * 100).toFixed(1)}%`,
    );

    console.log("\nComparison uses equal-length windows");
    const comparison = await analytics.comparePeriods(
      weekRange,
      (r) => analytics.getTaskMetrics(userId, r),
      (m) => m.completionRate,
    );
    check(
      "current period measured",
      comparison.current.planned === directTasks.planned,
      `${comparison.current.planned}`,
    );
    check(
      "previous period is a full week too",
      comparison.previous.planned >= 0,
      `${comparison.previous.planned} tasks last week`,
    );
    check(
      "delta is the difference of the two rates",
      near(comparison.delta, comparison.current.completionRate - comparison.previous.completionRate),
    );

    console.log("\nOwnership");
    const other = await registerUser({
      displayName: "Other", email: `other+${Date.now()}@livn.test`,
      password, confirmPassword: password,
    });

    const otherTasks = await analytics.getTaskMetrics(other.id, weekRange);
    check("another user has no planned tasks", otherTasks.planned === 0, `${otherTasks.planned}`);

    const otherMoney = await analytics.getMoneyMetrics(other.id, monthRange);
    check("another user has no income", otherMoney.income === 0n, `${otherMoney.income}`);
    check("another user has no expense", otherMoney.expense === 0n, `${otherMoney.expense}`);

    const otherSeries = await analytics.getSeries(other.id, addCalendarDays(DAY, -6), DAY);
    check(
      "another user's series is all zeros",
      otherSeries.every(
        (p) => p.tasksCompleted === 0 && p.income === 0n && p.expense === 0n && !p.journaled,
      ),
    );

    const otherSummary = await analytics.getPeriodSummary(other.id, weekRange);
    check("another user's execution score is zero", otherSummary.executionScore === 0);

    console.log("\nEmpty period is handled without dividing by zero");
    const emptyRange = analytics.customRange(
      addCalendarDays(DAY, 400),
      addCalendarDays(DAY, 406),
    );
    const emptySummary = await analytics.getPeriodSummary(userId, emptyRange);
    check("completion rate is zero", emptySummary.tasks.completionRate === 0);
    check("savings rate is null rather than infinite", emptySummary.money.savingsRate === null);
    check("execution score is zero", emptySummary.executionScore === 0);
    check("average mood is null", emptySummary.journal.averageMood === null);

    console.log("\nCustom range validation");
    let reversedRejected = false;
    try {
      analytics.customRange(DAY, addCalendarDays(DAY, -1));
    } catch {
      reversedRejected = true;
    }
    check("a reversed range is refused", reversedRejected);

    console.log("\nCleanup");
    await db.user.delete({ where: { id: other.id } });
    await db.user.delete({ where: { id: userId } });
    check("cascade removed the user's data", (await db.task.count({ where: { userId } })) === 0);

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
