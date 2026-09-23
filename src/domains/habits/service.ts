import { db } from "@/lib/db";
import { errors } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import { assertOwned } from "@/lib/auth/ownership";
import { parseCalendarDay, today, type CalendarDay } from "@/lib/date";
import { z } from "zod";
import type { Habit, Prisma } from "@/generated/prisma/client";

/**
 * Habit engine.
 *
 * A habit is a *frequency*, not a task. "Exercise 4 times a week" is satisfied
 * by any four days; it is not a checklist item that becomes overdue at midnight.
 * Everything here follows from that distinction:
 *
 *   • Progress is measured per period (week/month), not per day.
 *   • A missed day is only a miss if the period still has no room left.
 *   • Consistency, not streak, is the headline number. A streak rewards never
 *     missing; consistency measures how often the intention was kept, which is
 *     the thing a person can actually act on after a bad week.
 */

export const habitCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Nama kebiasaan wajib diisi.").max(80, "Maksimal 80 karakter."),
    description: z.string().trim().max(500).optional().or(z.literal("")),
    areaId: z.string().trim().min(1).optional().or(z.literal("")),
    goalId: z.string().trim().min(1).optional().or(z.literal("")),
    frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]).default("DAILY"),
    targetCount: z.coerce
      .number()
      .int("Target harus bilangan bulat.")
      .min(1, "Target minimal 1.")
      .max(31, "Target maksimal 31.")
      .default(1),
    // 0 = Sunday ... 6 = Saturday. Empty means "any day".
    scheduleDays: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
    trackingMethod: z.enum(["BOOLEAN", "COUNT", "DURATION", "QUANTITY"]).default("BOOLEAN"),
    unit: z.string().trim().max(16).optional().or(z.literal("")),
    colorToken: z.string().trim().max(24).default("accent"),
    iconName: z.string().trim().max(40).optional().or(z.literal("")),
    startDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD."),
  })
  .superRefine((data, ctx) => {
    // A weekly habit asking for more days than the week allows could never be
    // satisfied, so it is refused at the boundary.
    if (data.frequency === "WEEKLY") {
      if (data.targetCount > 7) {
        ctx.addIssue({
          code: "custom",
          path: ["targetCount"],
          message: "Kebiasaan mingguan maksimal 7 kali.",
        });
      }
      if (data.scheduleDays.length > 0 && data.targetCount > data.scheduleDays.length) {
        ctx.addIssue({
          code: "custom",
          path: ["targetCount"],
          message: `Target ${data.targetCount} kali tidak mungkin dengan ${data.scheduleDays.length} hari yang dipilih.`,
        });
      }
    }
    if (data.frequency === "MONTHLY" && data.targetCount > 31) {
      ctx.addIssue({
        code: "custom",
        path: ["targetCount"],
        message: "Kebiasaan bulanan maksimal 31 kali.",
      });
    }
    // A measured habit needs a unit for its number to mean anything.
    if (data.trackingMethod !== "BOOLEAN" && !data.unit) {
      ctx.addIssue({
        code: "custom",
        path: ["unit"],
        message: "Satuan wajib diisi untuk kebiasaan yang diukur.",
      });
    }
  });

export const habitUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  areaId: z.string().trim().min(1).nullable().optional(),
  goalId: z.string().trim().min(1).nullable().optional(),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]).optional(),
  targetCount: z.coerce.number().int().min(1).max(31).optional(),
  scheduleDays: z.array(z.coerce.number().int().min(0).max(6)).max(7).optional(),
  trackingMethod: z.enum(["BOOLEAN", "COUNT", "DURATION", "QUANTITY"]).optional(),
  unit: z.string().trim().max(16).nullable().optional(),
  colorToken: z.string().trim().max(24).optional(),
  iconName: z.string().trim().max(40).nullable().optional(),
  endDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const habitLogSchema = z.object({
  habitId: z.string().trim().min(1),
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD."),
  completed: z.boolean().default(true),
  value: z.coerce.number().finite().nonnegative().optional(),
  note: z.string().trim().max(300).optional(),
});

export type HabitCreateInput = z.infer<typeof habitCreateSchema>;
export type HabitUpdateInput = z.infer<typeof habitUpdateSchema>;

// ────────────────────────────────────────────────────────────────── periods ──

export type HabitPeriod = {
  start: CalendarDay;
  /** Exclusive. */
  endExclusive: CalendarDay;
  /** How many times the habit intends to happen in this period. */
  target: number;
  /** Days in the period on which the habit is allowed to happen. */
  eligibleDays: CalendarDay[];
};

/** The period containing `day`, sized to the habit's frequency. */
export function habitPeriod(habit: Pick<Habit, "frequency" | "targetCount" | "scheduleDays">, day: CalendarDay, weekStartsOn = 1): HabitPeriod {
  const MS_DAY = 86_400_000;

  if (habit.frequency === "WEEKLY") {
    const dow = day.getUTCDay();
    const delta = (dow - weekStartsOn + 7) % 7;
    const start = new Date(day.getTime() - delta * MS_DAY);
    const endExclusive = new Date(start.getTime() + 7 * MS_DAY);
    return {
      start,
      endExclusive,
      target: habit.targetCount,
      eligibleDays: eligibleDaysIn(start, 7, habit.scheduleDays),
    };
  }

  if (habit.frequency === "MONTHLY") {
    const year = day.getUTCFullYear();
    const month = day.getUTCMonth();
    const start = new Date(Date.UTC(year, month, 1));
    const endExclusive = new Date(Date.UTC(year, month + 1, 1));
    const length = Math.round((endExclusive.getTime() - start.getTime()) / MS_DAY);
    return {
      start,
      endExclusive,
      target: habit.targetCount,
      eligibleDays: eligibleDaysIn(start, length, habit.scheduleDays),
    };
  }

  // DAILY and CUSTOM both evaluate one day at a time; the target then acts as a
  // per-day count rather than a per-period total.
  return {
    start: day,
    endExclusive: new Date(day.getTime() + MS_DAY),
    target: habit.targetCount,
    eligibleDays: isEligible(day, habit.scheduleDays) ? [day] : [],
  };
}

function eligibleDaysIn(start: CalendarDay, length: number, scheduleDays: number[]): CalendarDay[] {
  const out: CalendarDay[] = [];
  for (let i = 0; i < length; i++) {
    const candidate = new Date(start.getTime() + i * 86_400_000);
    if (isEligible(candidate, scheduleDays)) out.push(candidate);
  }
  return out;
}

/** A day is eligible when it is on the schedule, or the schedule is open. */
export function isEligible(day: CalendarDay, scheduleDays: number[]): boolean {
  if (scheduleDays.length === 0) return true;
  return scheduleDays.includes(day.getUTCDay());
}

// ──────────────────────────────────────────────────────────────── metrics ──

export type HabitMetrics = {
  habitId: string;
  /** Completions inside the current period. */
  periodCount: number;
  periodTarget: number;
  periodRatio: number;
  /** True once the current period's target is met. */
  periodSatisfied: boolean;
  currentStreak: number;
  bestStreak: number;
  /** Completions over the measured window. */
  totalCompletions: number;
  /**
   * Share of *due* opportunities that were taken, 0..1.
   *
   * The denominator is days the habit asked for, not calendar days: a
   * four-times-a-week habit on a seven-day window should not read as 57%.
   */
  consistency: number;
  /**
   * Completions that had to happen by now, so an in-progress period is not
   * unfairly counted as failure.
   */
  dueCount: number;
  missedCount: number;
  weeklyConsistency: number;
  monthlyConsistency: number;
  lastCompletedOn: string | null;
  /** Whether the habit is expected on the reference day. */
  activeToday: boolean;
  completedToday: boolean;
};

/**
 * Computes metrics for a set of habits from a single fetch of their logs.
 *
 * Batched because the Today and Progress screens both render many habits, and a
 * per-habit query would be an N+1 that grows with the user's habit count.
 */
export async function computeHabitMetrics(
  userId: string,
  habits: Array<Pick<Habit, "id" | "frequency" | "targetCount" | "scheduleDays" | "trackingMethod" | "startDate">>,
  referenceDay: CalendarDay,
  options: { windowDays?: number; weekStartsOn?: number } = {},
): Promise<Map<string, HabitMetrics>> {
  const result = new Map<string, HabitMetrics>();
  if (habits.length === 0) return result;

  const windowDays = options.windowDays ?? 90;
  const weekStartsOn = options.weekStartsOn ?? 1;
  const MS_DAY = 86_400_000;

  const windowStart = new Date(referenceDay.getTime() - windowDays * MS_DAY);

  const logs = await db.habitLog.findMany({
    where: {
      userId,
      habitId: { in: habits.map((h) => h.id) },
      completed: true,
      date: { gte: windowStart, lte: referenceDay },
    },
    select: { habitId: true, date: true, value: true },
    orderBy: { date: "asc" },
  });

  const byHabit = new Map<string, Array<{ date: CalendarDay; value: number | null }>>();
  for (const log of logs) {
    const bucket = byHabit.get(log.habitId) ?? [];
    bucket.push({
      date: log.date,
      value: log.value === null ? null : Number(log.value),
    });
    byHabit.set(log.habitId, bucket);
  }

  for (const habit of habits) {
    const entries = byHabit.get(habit.id) ?? [];
    const completedDays = new Set(entries.map((e) => e.date.getTime()));

    // Per-day counts matter for habits that happen several times a day.
    const countPerDay = new Map<number, number>();
    for (const entry of entries) {
      const key = entry.date.getTime();
      countPerDay.set(key, (countPerDay.get(key) ?? 0) + 1);
    }

    const period = habitPeriod(habit, referenceDay, weekStartsOn);
    const periodCount = entries
      .filter((e) => e.date >= period.start && e.date < period.endExclusive)
      .reduce((sum, e) => sum + (countPerDay.get(e.date.getTime()) ?? 1), 0);

    // ── Streak ──
    // Walk back day by day. A day the habit was not scheduled for is neutral:
    // it neither breaks nor extends the run.
    let currentStreak = 0;
    let cursor = referenceDay;
    const earliest = habit.startDate;
    // A habit scheduled for specific days is evaluated on those days only.
    const dailyOnly = habit.frequency === "DAILY" || habit.frequency === "CUSTOM";
    let guard = 0;

    while (guard < windowDays + 30) {
      guard++;
      if (cursor < earliest) break;

      const eligible = isEligible(cursor, habit.scheduleDays);
      const done = completedDays.has(cursor.getTime());

      if (done) {
        currentStreak++;
      } else if (eligible) {
        // Today not yet done is not a broken streak — the day is still running.
        if (cursor.getTime() === referenceDay.getTime() && currentStreak === 0) {
          // fall through to see the run through yesterday
        } else if (cursor.getTime() === referenceDay.getTime()) {
          // Today is still open; do not break.
        } else {
          break;
        }
      }

      cursor = new Date(cursor.getTime() - MS_DAY);

      // For period-based habits a streak is measured in periods, but a
      // per-day run remains meaningful information, so the same walk is used.
      if (!dailyOnly && cursor < new Date(referenceDay.getTime() - windowDays * MS_DAY)) break;
    }

    // ── Best streak ──
    let bestStreak = 0;
    let running = 0;
    if (dailyOnly) {
      for (let i = windowDays; i >= 0; i--) {
        const day = new Date(referenceDay.getTime() - i * MS_DAY);
        if (day < earliest) continue;
        if (!isEligible(day, habit.scheduleDays)) continue;
        if (completedDays.has(day.getTime())) {
          running++;
          if (running > bestStreak) bestStreak = running;
        } else if (day.getTime() === referenceDay.getTime()) {
          // Today still open.
        } else {
          running = 0;
        }
      }
    }

    // ── Consistency ──
    // Numerator and denominator must be measured over the *same* window, or
    // the result is meaningless: counting completions over 90 days while
    // counting opportunities since the habit began reports a diligent habit as
    // 13% consistent. The window is therefore clamped to the habit's own start
    // date, and both sides are built from the same day list.
    const effectiveWindowStart =
      earliest > windowStart ? earliest : windowStart;

    const elapsedDays: CalendarDay[] = [];
    for (let i = windowDays - 1; i >= 0; i--) {
      const day = new Date(referenceDay.getTime() - i * MS_DAY);
      if (day < effectiveWindowStart) continue;
      if (isEligible(day, habit.scheduleDays)) elapsedDays.push(day);
    }

    const periodTarget = Math.max(1, period.target);

    /**
     * Opportunities the habit asked for, over an arbitrary day list.
     *
     * Period-based habits (WEEKLY, MONTHLY) are measured in whole periods:
     * a 4x/week habit evaluated over 7 days is due 4 times, not 7 times. That
     * is the whole point of a frequency habit and getting it wrong makes a
     * perfectly-kept habit look like a failure.
     *
     * Daily habits are measured per eligible day, scaled by `targetCount` so a
     * twice-a-day habit is due twice each day.
     */
    const isPeriodBased =
      habit.frequency === "WEEKLY" || habit.frequency === "MONTHLY";

    const dueOver = (days: CalendarDay[]): number => {
      if (days.length === 0) return 0;
      if (!isPeriodBased) {
        return days.length * habit.targetCount;
      }

      // Count how many complete-or-partial periods the day list covers, then
      // prorate the final period by how much of it has elapsed.
      let total = 0;
      let cursor = days[0];
      const last = days[days.length - 1];

      let guard = 0;
      while (cursor <= last && guard < 400) {
        guard++;
        const p = habitPeriod(habit, cursor, weekStartsOn);
        const elapsedInPeriod = days.filter(
          (d) => d >= p.start && d < p.endExclusive,
        ).length;
        const totalInPeriod = p.eligibleDays.length || 1;

        total += periodTarget * Math.min(1, elapsedInPeriod / totalInPeriod);

        cursor = p.endExclusive;
      }

      return total;
    };

    const completionsOn = (days: CalendarDay[]) =>
      days.reduce(
        (sum, day) => sum + Math.min(countPerDay.get(day.getTime()) ?? 0, periodTarget),
        0,
      );

    // Both sides are measured over the same clamped window, so the ratio is
    // meaningful even for a habit that started recently.
    const dueCount = Math.round(dueOver(elapsedDays) * 100) / 100;
    const actualCount = completionsOn(elapsedDays);

    const consistency = dueCount > 0 ? Math.min(1, actualCount / dueCount) : 0;
    const missedCount = Math.max(0, Math.ceil(dueCount - actualCount));

    // Rolling 7- and 30-day consistency, for the trend view. The same `dueOver`
    // is reused so a rolling figure means the same thing as the overall one.
    const windowConsistency = (days: number) => {
      const slice = elapsedDays.slice(-days);
      if (slice.length === 0) return 0;
      const due = dueOver(slice);
      if (due <= 0) return 1;
      return Math.min(1, completionsOn(slice) / due);
    };

    const lastCompleted = entries.length > 0 ? entries[entries.length - 1].date : null;

    result.set(habit.id, {
      habitId: habit.id,
      periodCount,
      periodTarget,
      periodRatio: Math.min(1, periodCount / periodTarget),
      periodSatisfied: periodCount >= periodTarget,
      currentStreak,
      bestStreak,
      totalCompletions: entries.length,
      consistency,
      dueCount,
      missedCount,
      weeklyConsistency: windowConsistency(7),
      monthlyConsistency: windowConsistency(30),
      lastCompletedOn: lastCompleted ? lastCompleted.toISOString().slice(0, 10) : null,
      activeToday: isEligible(referenceDay, habit.scheduleDays) && referenceDay >= earliest,
      completedToday: completedDays.has(referenceDay.getTime()),
    });
  }

  return result;
}

// ──────────────────────────────────────────────────────────────── queries ──

export async function listHabits(
  userId: string,
  options: { includeArchived?: boolean; areaId?: string; goalId?: string } = {},
) {
  const where: Prisma.HabitWhereInput = { userId };
  if (!options.includeArchived) where.archivedAt = null;
  if (options.areaId) where.areaId = options.areaId;
  if (options.goalId) where.goalId = options.goalId;

  return db.habit.findMany({
    where,
    include: {
      area: { select: { id: true, name: true, colorToken: true, iconName: true } },
      goal: { select: { id: true, title: true } },
      _count: { select: { logs: true } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function getHabit(userId: string, habitId: string) {
  const habit = await db.habit.findFirst({
    where: { id: habitId, userId },
    include: {
      area: { select: { id: true, name: true, colorToken: true, iconName: true } },
      goal: { select: { id: true, title: true } },
    },
  });
  if (!habit) throw errors.notFound("Kebiasaan");
  return habit;
}

export async function createHabit(userId: string, input: unknown): Promise<Habit> {
  const data = parseOrThrow(habitCreateSchema, input, "Periksa kembali data kebiasaan.");

  const [areaId, goalId] = await Promise.all([
    data.areaId ? assertOwned("area", data.areaId, userId) : null,
    data.goalId ? assertOwned("goal", data.goalId, userId) : null,
  ]);

  const startDate = parseCalendarDay(data.startDate);
  if (!startDate) {
    throw errors.validation("Tanggal mulai tidak valid.", { startDate: "Tanggal tidak valid." });
  }

  const last = await db.habit.findFirst({
    where: { userId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  return db.habit.create({
    data: {
      userId,
      areaId,
      goalId,
      name: data.name,
      description: data.description || null,
      frequency: data.frequency,
      targetCount: data.targetCount,
      scheduleDays: data.scheduleDays,
      trackingMethod: data.trackingMethod,
      unit: data.unit || null,
      colorToken: data.colorToken,
      iconName: data.iconName || null,
      startDate,
      position: (last?.position ?? -1) + 1,
    },
  });
}

export async function updateHabit(
  userId: string,
  habitId: string,
  input: unknown,
): Promise<Habit> {
  await assertOwned("habit", habitId, userId, "Kebiasaan");
  const data = parseOrThrow(habitUpdateSchema, input, "Periksa kembali data kebiasaan.");

  const patch: Prisma.HabitUpdateInput = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.description !== undefined) patch.description = data.description || null;
  if (data.frequency !== undefined) patch.frequency = data.frequency;
  if (data.targetCount !== undefined) patch.targetCount = data.targetCount;
  if (data.scheduleDays !== undefined) patch.scheduleDays = data.scheduleDays;
  if (data.trackingMethod !== undefined) patch.trackingMethod = data.trackingMethod;
  if (data.unit !== undefined) patch.unit = data.unit || null;
  if (data.colorToken !== undefined) patch.colorToken = data.colorToken;
  if (data.iconName !== undefined) patch.iconName = data.iconName || null;

  if (data.endDate !== undefined) {
    patch.endDate = data.endDate ? parseCalendarDay(data.endDate) : null;
  }

  if (data.areaId !== undefined) {
    patch.area = data.areaId
      ? { connect: { id: await assertOwned("area", data.areaId, userId) } }
      : { disconnect: true };
  }
  if (data.goalId !== undefined) {
    patch.goal = data.goalId
      ? { connect: { id: await assertOwned("goal", data.goalId, userId) } }
      : { disconnect: true };
  }

  return db.habit.update({ where: { id: habitId }, data: patch });
}

/**
 * Records or clears a habit for a calendar day.
 *
 * Idempotent by construction: the `@@unique([habitId, date])` constraint means
 * a repeated submission updates the existing row rather than creating a second
 * one, so a double tap cannot inflate the count.
 */
export async function setHabitCompletion(
  userId: string,
  input: unknown,
): Promise<{ habitId: string; date: string; completed: boolean }> {
  const data = parseOrThrow(habitLogSchema, input, "Periksa kembali data kebiasaan.");

  await assertOwned("habit", data.habitId, userId, "Kebiasaan");

  const date = parseCalendarDay(data.date);
  if (!date) {
    throw errors.validation("Tanggal tidak valid.", { date: "Tanggal tidak valid." });
  }

  // A day the habit had not started yet is not a valid completion.
  const habit = await db.habit.findFirst({
    where: { id: data.habitId, userId },
    select: { startDate: true, endDate: true },
  });
  if (!habit) throw errors.notFound("Kebiasaan");

  if (date < habit.startDate) {
    throw errors.validation("Kebiasaan ini belum dimulai pada tanggal itu.", {
      date: "Tanggal sebelum kebiasaan dimulai.",
    });
  }
  if (habit.endDate && date > habit.endDate) {
    throw errors.validation("Kebiasaan ini sudah berakhir pada tanggal itu.", {
      date: "Tanggal setelah kebiasaan berakhir.",
    });
  }

  if (!data.completed) {
    await db.habitLog.deleteMany({ where: { habitId: data.habitId, date } });
    return { habitId: data.habitId, date: data.date, completed: false };
  }

  await db.habitLog.upsert({
    where: { habitId_date: { habitId: data.habitId, date } },
    create: {
      userId,
      habitId: data.habitId,
      date,
      completed: true,
      value: data.value ?? null,
      note: data.note ?? null,
    },
    update: {
      completed: true,
      value: data.value ?? null,
      note: data.note ?? null,
    },
  });

  return { habitId: data.habitId, date: data.date, completed: true };
}

export async function archiveHabit(userId: string, habitId: string): Promise<Habit> {
  await assertOwned("habit", habitId, userId, "Kebiasaan");
  return db.habit.update({ where: { id: habitId }, data: { archivedAt: new Date() } });
}

export async function deleteHabit(userId: string, habitId: string): Promise<void> {
  await assertOwned("habit", habitId, userId, "Kebiasaan");
  // Logs cascade, which is correct: the history belongs to the habit.
  await db.habit.delete({ where: { id: habitId } });
}

/**
 * Habits expected on a given day, with their completion state.
 *
 * "Expected" means eligible by schedule and inside the active period; a habit
 * still counts as expected if it was already done, because the Today screen
 * needs to show it as completed rather than hide it.
 */
export async function getHabitsForDay(userId: string, day: CalendarDay, weekStartsOn = 1) {
  const habits = await listHabits(userId);

  const active = habits.filter(
    (habit) => day >= habit.startDate && (habit.endDate === null || day <= habit.endDate),
  );

  const metrics = await computeHabitMetrics(userId, active, day, { weekStartsOn });

  const due = active.filter((habit) => isEligible(day, habit.scheduleDays));

  return due.map((habit) => ({
    habit,
    metrics: metrics.get(habit.id)!,
  }));
}

/** Convenience wrapper for a single habit. */
export async function getHabitMetrics(
  userId: string,
  habitId: string,
  timeZone: string,
  weekStartsOn = 1,
): Promise<HabitMetrics> {
  const habit = await db.habit.findFirst({
    where: { id: habitId, userId },
    select: {
      id: true,
      frequency: true,
      targetCount: true,
      scheduleDays: true,
      trackingMethod: true,
      startDate: true,
    },
  });
  if (!habit) throw errors.notFound("Kebiasaan");

  const map = await computeHabitMetrics(userId, [habit], today(timeZone), { weekStartsOn });
  const metrics = map.get(habitId);
  if (!metrics) throw errors.internal("Gagal menghitung metrik kebiasaan.");
  return metrics;
}

/**
 * Completion state per habit for a recent window, keyed by `YYYY-MM-DD`.
 *
 * One query for every habit on screen, so a heat strip does not cost a request
 * per row. Days with no row are simply absent from the map, which is how the
 * UI distinguishes "not done" from "not scheduled".
 */
export async function recentCompletionMap(
  userId: string,
  habitIds: string[],
  from: CalendarDay,
  to: CalendarDay,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (habitIds.length === 0) return out;

  const logs = await db.habitLog.findMany({
    where: {
      userId,
      habitId: { in: habitIds },
      completed: true,
      date: { gte: from, lte: to },
    },
    select: { habitId: true, date: true },
    orderBy: { date: "asc" },
  });

  for (const log of logs) {
    const bucket = out.get(log.habitId) ?? [];
    bucket.push(log.date.toISOString().slice(0, 10));
    out.set(log.habitId, bucket);
  }

  return out;
}
