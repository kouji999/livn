import { db } from "@/lib/db";
import {
  addCalendarDays,
  daysBetween,
  daysInPeriod,
  monthPeriod,
  weekPeriod,
  yearPeriod,
  type CalendarDay,
  type Period,
} from "@/lib/date";
import { errors } from "@/lib/errors";

/**
 * Analytics.
 *
 * The single place cross-domain metrics are computed. No screen calculates its
 * own version of "completion rate" or "habit consistency" — a figure shown on
 * Progress and the same figure quoted in a review come from these functions, so
 * they cannot disagree.
 *
 * Design notes that matter:
 *
 *   • Every aggregate is one grouped query per metric. A per-day loop would be
 *     thirty round trips for a chart nobody scrolls.
 *   • A period is always half-open: `[start, endExclusive)`. Mixing inclusive
 *     and exclusive bounds is the classic source of off-by-one-day totals.
 *   • Deltas compare like with like. Where a period is only partly elapsed, the
 *     previous period is truncated to the same number of days, otherwise a
 *     half-finished month always looks worse than a complete one.
 */

/** Scope for any metric request. */
export type MetricRange = {
  period: Period;
  /** The calendar day the request is being made on, for prorating. */
  reference: CalendarDay;
};

export function rangeFor(kind: "day" | "week" | "month" | "year", day: CalendarDay, weekStartsOn = 1): MetricRange {
  switch (kind) {
    case "day":
      return { period: { start: day, endExclusive: addCalendarDays(day, 1) }, reference: day };
    case "week":
      return { period: weekPeriod(day, weekStartsOn), reference: day };
    case "month":
      return { period: monthPeriod(day), reference: day };
    case "year":
      return { period: yearPeriod(day), reference: day };
  }
}

/** A custom range given as inclusive calendar days. */
export function customRange(from: CalendarDay, to: CalendarDay): MetricRange {
  if (daysBetween(from, to) < 0) {
    throw errors.validation("Rentang tanggal terbalik.", { from: "Tanggal mulai setelah tanggal akhir." });
  }
  return { period: { start: from, endExclusive: addCalendarDays(to, 1) }, reference: to };
}

// ─────────────────────────────────────────────────────────────────── tasks ──

export type TaskMetrics = {
  /** Tasks scheduled inside the period, excluding archived. */
  planned: number;
  completed: number;
  skipped: number;
  stillOpen: number;
  /** Completed / planned, 0..1. Denominator excludes skipped. */
  completionRate: number;
  /** Completed tasks per day of the period, whether or not the day has passed. */
  perDay: number;
  /** Tasks scheduled before the period that were still open when it began. */
  carriedOver: number;
};

/**
 * Task metrics for a period.
 *
 * Completion rate is measured against tasks *scheduled* in the period rather
 * than tasks completed in it. Those differ: a task completed today but planned
 * last week belongs to last week's denominator, and counting it in both would
 * let a single completion appear in two periods.
 *
 * Skipped tasks stay in the denominator. They were scheduled work the user
 * chose not to do, and removing them would make a week where half the plan was
 * abandoned look like a perfect week — the one reading that would actively
 * mislead. They are reported separately so the decision is still visible.
 */
export async function getTaskMetrics(userId: string, range: MetricRange): Promise<TaskMetrics> {
  const { period } = range;

  const [scheduled, completedInPeriod, carriedOver] = await Promise.all([
    db.task.groupBy({
      by: ["status"],
      where: {
        userId,
        scheduledFor: { gte: period.start, lt: period.endExclusive },
        status: { not: "ARCHIVED" },
      },
      _count: { _all: true },
    }),
    db.task.count({
      where: {
        userId,
        status: "COMPLETED",
        completedAt: { gte: period.start, lt: period.endExclusive },
      },
    }),
    db.task.count({
      where: {
        userId,
        scheduledFor: { lt: period.start },
        OR: [
          { status: { in: ["PLANNED", "TODAY"] } },
          { status: "COMPLETED", completedAt: { gte: period.start } },
        ],
      },
    }),
  ]);

  const byStatus = new Map(scheduled.map((row) => [row.status, row._count._all]));

  const plannedStatuses = (byStatus.get("PLANNED") ?? 0) + (byStatus.get("TODAY") ?? 0);
  const completedFromScheduled = byStatus.get("COMPLETED") ?? 0;
  const skipped = byStatus.get("SKIPPED") ?? 0;
  const inbox = byStatus.get("INBOX") ?? 0;

  // Everything the user committed to for the period: done, pending, or
  // deliberately declined.
  const planned = plannedStatuses + completedFromScheduled + skipped;

  return {
    planned,
    completed: completedFromScheduled,
    skipped,
    stillOpen: plannedStatuses + inbox,
    completionRate: planned > 0 ? completedFromScheduled / planned : 0,
    perDay: daysInPeriod(period) > 0 ? completedInPeriod / daysInPeriod(period) : 0,
    carriedOver,
  };
}

// ────────────────────────────────────────────────────────────────── habits ──

export type HabitMetricsSummary = {
  habitsTracked: number;
  /** Mean of every habit's consistency over the period. */
  averageConsistency: number;
  /** Completions recorded inside the period. */
  sessions: number;
  /** Sessions that counted toward a habit's target, capped per habit. */
  achievedSessions: number;
  /** Opportunities the habits asked for inside the period. */
  dueOpportunities: number;
  /** Habits whose rate reached 80% or better. */
  strongHabits: number;
  weakest: Array<{ habitId: string; name: string; rate: number }>;
  strongest: Array<{ habitId: string; name: string; rate: number }>;
};

/**
 * Habit consistency across a period.
 *
 * The per-habit arithmetic lives in the habits domain, which already owns the
 * definition of a streak and a due opportunity. This function aggregates those
 * results rather than reimplementing the rules, so a fix in one place reaches
 * every screen.
 */
export async function getHabitMetrics(
  userId: string,
  range: MetricRange,
  weekStartsOn = 1,
): Promise<HabitMetricsSummary> {
  const { period } = range;

  const habits = await db.habit.findMany({
    where: {
      userId,
      archivedAt: null,
      startDate: { lt: period.endExclusive },
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      frequency: true,
      targetCount: true,
      scheduleDays: true,
      trackingMethod: true,
    },
  });

  if (habits.length === 0) {
    return {
      habitsTracked: 0,
      averageConsistency: 0,
      sessions: 0,
      achievedSessions: 0,
      dueOpportunities: 0,
      strongHabits: 0,
      weakest: [],
      strongest: [],
    };
  }

  const logs = await db.habitLog.findMany({
    where: {
      userId,
      habitId: { in: habits.map((h) => h.id) },
      completed: true,
      date: { gte: period.start, lt: period.endExclusive },
    },
    select: { habitId: true, date: true },
  });

  const sessionsByHabit = new Map<string, number>();
  for (const log of logs) {
    sessionsByHabit.set(log.habitId, (sessionsByHabit.get(log.habitId) ?? 0) + 1);
  }

  // Days the period actually covers, clipped to the reference day so a period
  // still in progress is not scored as though it had ended.
  const elapsedEnd =
    period.endExclusive > addCalendarDays(range.reference, 1)
      ? addCalendarDays(range.reference, 1)
      : period.endExclusive;

  const perHabit: Array<{ habitId: string; name: string; rate: number; due: number }> = [];
  let totalDue = 0;
  let totalDone = 0;

  for (const habit of habits) {
    // The window a habit is judged over: the period, clipped to when the habit
    // existed at all. A habit created yesterday should not be scored on the
    // week before it began.
    const activeStart = habit.startDate > period.start ? habit.startDate : period.start;
    const activeEnd =
      habit.endDate && habit.endDate < elapsedEnd ? addCalendarDays(habit.endDate, 1) : elapsedEnd;

    if (activeStart >= activeEnd) continue;

    const days = daysBetween(activeStart, addCalendarDays(activeEnd, -1)) + 1;
    if (days <= 0) continue;

    const eligibleDays =
      habit.scheduleDays.length === 0
        ? days
        : countEligibleDays(activeStart, days, habit.scheduleDays);

    if (eligibleDays === 0) continue;

    // A weekly habit evaluated over seven days is due `targetCount` times, not
    // seven: the frequency, not the day, is the unit. Dividing by the day count
    // would make a perfectly-kept 4x/week habit read as 57%.
    const periodsInWindow =
      habit.frequency === "WEEKLY"
        ? eligibleDays / 7
        : habit.frequency === "MONTHLY"
          ? eligibleDays / 30
          : eligibleDays;

    const due = Math.round(periodsInWindow * habit.targetCount);
    if (due <= 0) continue;

    const done = sessionsByHabit.get(habit.id) ?? 0;
    const rate = Math.min(1, done / due);

    perHabit.push({ habitId: habit.id, name: habit.name, rate, due });
    totalDue += due;
    totalDone += Math.min(done, due);
  }

  perHabit.sort((a, b) => a.rate - b.rate);

  return {
    habitsTracked: perHabit.length,
    averageConsistency:
      perHabit.length > 0
        ? perHabit.reduce((sum, h) => sum + h.rate, 0) / perHabit.length
        : 0,
    sessions: logs.length,
    achievedSessions: totalDone,
    dueOpportunities: totalDue,
    strongHabits: perHabit.filter((h) => h.rate >= 0.8).length,
    weakest: perHabit.slice(0, 3).map(({ habitId, name, rate }) => ({ habitId, name, rate })),
    strongest: perHabit
      .slice(-3)
      .reverse()
      .map(({ habitId, name, rate }) => ({ habitId, name, rate })),
  };
}

function countEligibleDays(start: CalendarDay, length: number, scheduleDays: number[]): number {
  if (scheduleDays.length === 0) return length;
  let count = 0;
  for (let i = 0; i < length; i++) {
    const day = addCalendarDays(start, i);
    if (scheduleDays.includes(day.getUTCDay())) count++;
  }
  return count;
}

// ─────────────────────────────────────────────────────────────────── money ──

export type MoneyMetrics = {
  income: bigint;
  expense: bigint;
  net: bigint;
  /** Net / income, 0..1. `null` when there was no income to divide by. */
  savingsRate: number | null;
  /** Number of days in the period with any income or expense. */
  activeDays: number;
  /** Mean expense per active day. */
  averageDailyExpense: bigint;
  /** Largest single expense in the period. */
  largestExpense: bigint;
  /** Largest single income in the period. */
  largestIncome: bigint;
  /** Categories ranked by spend, with their share of total expense. */
  topCategories: Array<{
    categoryId: string | null;
    name: string;
    colorToken: string;
    iconName: string | null;
    total: bigint;
    share: number;
  }>;
};

/**
 * Money metrics for a period.
 *
 * Uses the same exclusion rules as the finance summaries: transfers are not
 * income or expense, adjustments are neither, and a transaction cancelled by a
 * reversal is removed from the period it fell in. Sharing those rules is why a
 * figure here matches the figure on the Money screen for the same window.
 */
export async function getMoneyMetrics(userId: string, range: MetricRange): Promise<MoneyMetrics> {
  const { period } = range;
  const where = { gte: period.start, lt: period.endExclusive };

  // A reversal leaves the original row in place, so the ids it cancels are
  // collected first and filtered out of every figure below. Without this a
  // corrected transaction would still count as spending for its period.
  const [reversedForPeriod, categoryRows] = await Promise.all([
    db.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        reversesTransactionId: { not: null },
        occurredOn: where,
      },
      select: { reversesTransactionId: true },
    }),
    db.transaction.groupBy({
      by: ["categoryId"],
      where: {
        userId,
        deletedAt: null,
        reversesTransactionId: null,
        occurredOn: where,
        type: "EXPENSE",
        categoryId: { not: null },
      },
      _sum: { amount: true },
    }),
  ]);

  const cancelledIds = reversedForPeriod
    .map((row) => row.reversesTransactionId)
    .filter((id): id is string => id !== null);

  // One pass over the rows drives every scalar, so income, expense, the
  // extremes and the active-day count cannot disagree about which rows count.
  const [detail, activeDayRows] = await Promise.all([
    db.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        reversesTransactionId: null,
        occurredOn: where,
        type: { in: ["INCOME", "EXPENSE"] },
        id: { notIn: cancelledIds },
      },
      select: { type: true, amount: true },
    }),
    db.transaction.groupBy({
      by: ["occurredOn"],
      where: {
        userId,
        deletedAt: null,
        reversesTransactionId: null,
        occurredOn: where,
        type: { in: ["INCOME", "EXPENSE"] },
        id: { notIn: cancelledIds },
      },
      _count: { _all: true },
    }),
  ]);

  let income = 0n;
  let expense = 0n;
  let largestIncome = 0n;
  let largestExpense = 0n;

  for (const row of detail) {
    if (row.type === "INCOME") {
      income += row.amount;
      if (row.amount > largestIncome) largestIncome = row.amount;
    } else {
      expense += row.amount;
      if (row.amount > largestExpense) largestExpense = row.amount;
    }
  }

  const activeDays = activeDayRows.length;
  const net = income - expense;

  // Category names in one query rather than per row.
  const categoryIds = categoryRows
    .map((row) => row.categoryId)
    .filter((id): id is string => id !== null);

  const categories =
    categoryIds.length > 0
      ? await db.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true, colorToken: true, iconName: true },
        })
      : [];

  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const topCategories = categoryRows
    .map((row) => {
      const category = row.categoryId ? categoryById.get(row.categoryId) : null;
      const total = row._sum.amount ?? 0n;
      return {
        categoryId: row.categoryId,
        name: category?.name ?? "Tanpa kategori",
        colorToken: category?.colorToken ?? "neutral",
        iconName: category?.iconName ?? null,
        total,
        share: expense > 0n ? Number(total) / Number(expense) : 0,
      };
    })
    .sort((a, b) => (b.total > a.total ? 1 : -1))
    .slice(0, 8);

  return {
    income,
    expense,
    net,
    savingsRate: income > 0n ? Number(net) / Number(income) : null,
    activeDays,
    averageDailyExpense: activeDays > 0 ? expense / BigInt(activeDays) : 0n,
    largestExpense,
    largestIncome,
    topCategories,
  };
}

// ─────────────────────────────────────────────────────────────────── goals ──

export type GoalMetrics = {
  active: number;
  achievedInPeriod: number;
  /** Mean progress across goals that have a measurable target. */
  averageProgress: number;
  /** Goals whose current pace will miss their target date. */
  offTrack: Array<{ goalId: string; title: string; requiredPerDay: number; velocityPerDay: number }>;
  /** Goals whose target date falls inside the period. */
  dueInPeriod: number;
};

/**
 * Goal metrics.
 *
 * Per-goal progress comes from the goal service, which owns the derivation
 * rules. This aggregates the result rather than recomputing percentages, so a
 * goal cannot show one number on its own page and another here.
 */
export async function getGoalMetrics(
  userId: string,
  range: MetricRange,
  progress: Map<string, { percentage: number | null; isOffTrack: boolean; requiredPerDay: number | null; velocityPerDay: number | null }>,
  goals: Array<{ id: string; title: string; status: string; targetDate: Date | null }>,
): Promise<GoalMetrics> {
  const { period } = range;

  const measurable = goals
    .map((goal) => progress.get(goal.id)?.percentage)
    .filter((value): value is number => typeof value === "number");

  const offTrack = goals
    .map((goal) => {
      const entry = progress.get(goal.id);
      if (!entry?.isOffTrack) return null;
      return {
        goalId: goal.id,
        title: goal.title,
        requiredPerDay: entry.requiredPerDay ?? 0,
        velocityPerDay: entry.velocityPerDay ?? 0,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const achievedInPeriod = await db.goal.count({
    where: {
      userId,
      status: "ACHIEVED",
      completedAt: { gte: period.start, lt: period.endExclusive },
    },
  });

  return {
    active: goals.filter((g) => g.status === "ACTIVE" || g.status === "PLANNED").length,
    achievedInPeriod,
    averageProgress:
      measurable.length > 0
        ? measurable.reduce((a, b) => a + b, 0) / measurable.length
        : 0,
    offTrack,
    dueInPeriod: goals.filter(
      (goal) =>
        goal.targetDate !== null &&
        goal.targetDate >= period.start &&
        goal.targetDate < period.endExclusive,
    ).length,
  };
}

// ────────────────────────────────────────────────────────────────── journal ──

export type JournalMetrics = {
  entries: number;
  /** Entries per day of the period. */
  perDay: number;
  averageMood: number | null;
  averageEnergy: number | null;
  averageFocus: number | null;
  /** Entries that carried a mood, so an average is not read as universal. */
  withMood: number;
  /** Most used tags in the period. */
  topTags: Array<{ name: string; count: number }>;
};

export async function getJournalMetrics(
  userId: string,
  range: MetricRange,
): Promise<JournalMetrics> {
  const { period } = range;

  const entries = await db.journalEntry.findMany({
    where: {
      userId,
      deletedAt: null,
      date: { gte: period.start, lt: period.endExclusive },
    },
    select: { mood: true, energy: true, focus: true, id: true },
  });

  const average = (values: Array<number | null>) => {
    const present = values.filter((v): v is number => v !== null);
    if (present.length === 0) return null;
    return Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 10) / 10;
  };

  const tagRows =
    entries.length > 0
      ? await db.journalTag.groupBy({
          by: ["tagId"],
          where: { journalEntryId: { in: entries.map((e) => e.id) } },
          _count: { _all: true },
        })
      : [];

  const tagIds = tagRows.map((row) => row.tagId);
  const tagNames =
    tagIds.length > 0
      ? await db.tag.findMany({
          where: { id: { in: tagIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = new Map(tagNames.map((t) => [t.id, t.name]));

  const topTags = tagRows
    .map((row) => ({ name: nameById.get(row.tagId) ?? "?", count: row._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const periodDays = daysInPeriod(period);

  return {
    entries: entries.length,
    perDay: periodDays > 0 ? entries.length / periodDays : 0,
    averageMood: average(entries.map((e) => e.mood)),
    averageEnergy: average(entries.map((e) => e.energy)),
    averageFocus: average(entries.map((e) => e.focus)),
    withMood: entries.filter((e) => e.mood !== null).length,
    topTags,
  };
}

// ────────────────────────────────────────────────────────── time series ──

export type SeriesPoint = {
  date: string;
  tasksCompleted: number;
  habitSessions: number;
  income: bigint;
  expense: bigint;
  journaled: boolean;
};

/**
 * Day-by-day series across every domain, for charts.
 *
 * Four grouped queries total, then a dense array with zero-filled gaps. A chart
 * needs a value for every day in the window, and an absent day is genuinely zero
 * activity rather than missing data.
 *
 * The window is capped so an accidental multi-year span cannot allocate a
 * huge array or time out.
 */
export async function getSeries(
  userId: string,
  from: CalendarDay,
  to: CalendarDay,
  maxDays = 400,
): Promise<SeriesPoint[]> {
  const span = daysBetween(from, to) + 1;
  if (span <= 0) return [];
  if (span > maxDays) {
    throw errors.validation(
      `Rentang terlalu panjang. Maksimal ${maxDays} hari.`,
      { from: `Pilih rentang maksimal ${maxDays} hari.` },
    );
  }

  const endExclusive = addCalendarDays(to, 1);

  const [taskCompletions, habitLogs, money, journals, cancellations] = await Promise.all([
    // The raw instants rather than a groupBy: `completedAt` has millisecond
    // precision, so grouping by it would create one group per distinct
    // timestamp and collapse same-day completions into each other.
    db.task.findMany({
      where: {
        userId,
        status: "COMPLETED",
        completedAt: { gte: from, lt: endExclusive },
      },
      select: { completedAt: true },
    }),
    db.habitLog.groupBy({
      by: ["date"],
      where: { userId, completed: true, date: { gte: from, lte: to } },
      _count: { _all: true },
    }),
    db.transaction.groupBy({
      by: ["occurredOn", "type"],
      where: {
        userId,
        deletedAt: null,
        reversesTransactionId: null,
        occurredOn: { gte: from, lte: to },
        type: { in: ["INCOME", "EXPENSE"] },
      },
      _sum: { amount: true },
    }),
    db.journalEntry.findMany({
      where: { userId, deletedAt: null, date: { gte: from, lte: to } },
      select: { date: true },
    }),
    db.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        reversesTransactionId: { not: null },
        occurredOn: { gte: from, lte: to },
      },
      select: { reversesTransactionId: true },
    }),
  ]);

  const cancelled = new Set(
    cancellations
      .map((row) => row.reversesTransactionId)
      .filter((id): id is string => id !== null),
  );

  // Transactions cancelled by a reversal must not be counted as that day's
  // activity, so their amounts are subtracted back out.
  const cancelledRows =
    cancelled.size > 0
      ? await db.transaction.findMany({
          where: { id: { in: [...cancelled] } },
          select: { occurredOn: true, type: true, amount: true },
        })
      : [];

  const key = (date: Date) => date.toISOString().slice(0, 10);

  const tasksByDay = new Map<string, number>();
  for (const row of taskCompletions) {
    if (!row.completedAt) continue;
    // Bucketed by calendar day, incrementing rather than assigning so several
    // completions on the same day accumulate instead of overwriting.
    const day = key(row.completedAt);
    tasksByDay.set(day, (tasksByDay.get(day) ?? 0) + 1);
  }

  const habitsByDay = new Map<string, number>();
  for (const row of habitLogs) {
    habitsByDay.set(key(row.date), row._count._all);
  }

  const moneyByDay = new Map<string, { income: bigint; expense: bigint }>();
  for (const row of money) {
    const day = key(row.occurredOn);
    const bucket = moneyByDay.get(day) ?? { income: 0n, expense: 0n };
    const amount = row._sum.amount ?? 0n;
    if (row.type === "INCOME") bucket.income += amount;
    else bucket.expense += amount;
    moneyByDay.set(day, bucket);
  }

  for (const row of cancelledRows) {
    const day = key(row.occurredOn);
    const bucket = moneyByDay.get(day);
    if (!bucket) continue;
    if (row.type === "INCOME") bucket.income -= row.amount;
    else bucket.expense -= row.amount;
  }

  const journalDays = new Set(journals.map((entry) => key(entry.date)));

  const out: SeriesPoint[] = [];
  for (let i = 0; i < span; i++) {
    const day = addCalendarDays(from, i);
    const dayKey = key(day);
    const money2 = moneyByDay.get(dayKey) ?? { income: 0n, expense: 0n };
    out.push({
      date: dayKey,
      tasksCompleted: tasksByDay.get(dayKey) ?? 0,
      habitSessions: habitsByDay.get(dayKey) ?? 0,
      income: money2.income,
      expense: money2.expense,
      journaled: journalDays.has(dayKey),
    });
  }

  return out;
}

// ────────────────────────────────────────────────────────────────── summary ──

export type PeriodSummary = {
  label: string;
  range: MetricRange;
  tasks: TaskMetrics;
  habits: HabitMetricsSummary;
  money: MoneyMetrics;
  journal: JournalMetrics;
  /** Mean of task completion and habit consistency, for a single headline. */
  executionScore: number;
};

/**
 * Everything a Progress screen or a review needs, in one call.
 *
 * Kept as a composition rather than a new set of queries, so the headline
 * "execution score" is provably the same arithmetic the individual sections
 * show — it is their mean, not a separate formula that could drift.
 *
 * The label distinguishes measured from calculated: nothing here is projected,
 * and the review screens state that explicitly.
 */
export async function getPeriodSummary(
  userId: string,
  range: MetricRange,
  options: { weekStartsOn?: number } = {},
): Promise<PeriodSummary> {
  const [tasks, habits, money, journal] = await Promise.all([
    getTaskMetrics(userId, range),
    getHabitMetrics(userId, range, options.weekStartsOn ?? 1),
    getMoneyMetrics(userId, range),
    getJournalMetrics(userId, range),
  ]);

  // Task completion and habit consistency are each 0..1 and each answer "did I
  // do what I said I would". Averaging them is the only defensible single
  // number; life is multidimensional, so it is labelled as exactly that and no
  // further claim is made about it.
  const parts = [tasks.completionRate, habits.habitsTracked > 0 ? habits.averageConsistency : null].filter(
    (value): value is number => value !== null,
  );

  return {
    label: dayLabel(range),
    range,
    tasks,
    habits,
    money,
    journal,
    executionScore: parts.length > 0 ? parts.reduce((a, b) => a + b, 0) / parts.length : 0,
  };
}

function dayLabel(range: MetricRange): string {
  const days = daysInPeriod(range.period);
  if (days === 1) return "Hari";
  if (days === 7) return "Minggu";
  if (days >= 28 && days <= 31) return "Bulan";
  if (days >= 365) return "Tahun";
  return `${days} hari`;
}

// ──────────────────────────────────────────────────────────────── comparison ──

export type Comparison<T> = {
  current: T;
  previous: T;
  /** Change in the headline scalar, for a delta indicator. */
  delta: number;
};

/**
 * Runs a metric for a period and for the equivalent period immediately before.
 *
 * The previous window is the same *length* as the current one, anchored to end
 * where the current one starts. Comparing a part-elapsed month against a full
 * previous month would show a decline that is an artefact of the calendar, so
 * the two windows are always the same size.
 */
export async function comparePeriods<T>(
  range: MetricRange,
  compute: (range: MetricRange) => Promise<T>,
  pick: (value: T) => number,
): Promise<Comparison<T>> {
  const { period } = range;
  const length = daysInPeriod(period);

  const previousPeriod: Period = {
    start: addCalendarDays(period.start, -length),
    endExclusive: period.start,
  };

  const previousReference = addCalendarDays(period.start, -1);

  const [current, previous] = await Promise.all([
    compute(range),
    compute({ period: previousPeriod, reference: previousReference }),
  ]);

  return { current, previous, delta: pick(current) - pick(previous) };
}
