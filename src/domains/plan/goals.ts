import { db } from "@/lib/db";
import { errors } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import { assertOwned } from "@/lib/auth/ownership";
import { daysBetween, parseCalendarDay, today, type CalendarDay } from "@/lib/date";
import { goalCreateSchema, goalUpdateSchema } from "./schemas";
import type { Goal, Prisma } from "@/generated/prisma/client";

/**
 * Goal service.
 *
 * A goal's progress is a *derived* value, not a stored one — except for goals
 * the user measures by hand. Two modes exist and the distinction is explicit:
 *
 *   • Derived (`isDerived`): progress is recomputed from linked tasks,
 *     habits or savings. The manual `currentValue` is ignored so the number
 *     shown can always be traced to real records.
 *   • Manual: the user updates `currentValue` themselves, which is correct
 *     for things the app cannot observe (weight, savings held elsewhere).
 *
 * Keeping this in one place satisfies the rule that a goal must never show a
 * different percentage on two screens.
 */

export type GoalProgress = {
  goalId: string;
  /** Raw measured value in the goal's own unit. */
  current: number;
  target: number | null;
  /** 0..1, or `null` for binary goals with no target. */
  ratio: number | null;
  percentage: number | null;
  isComplete: boolean;
  /** Days from today to the target date. Negative means overdue. */
  daysRemaining: number | null;
  /** Units per day required to still hit the target on time. */
  requiredPerDay: number | null;
  /** Units per day achieved so far, averaged over elapsed days. */
  velocityPerDay: number | null;
  /** True when the current pace will miss the target date. */
  isOffTrack: boolean;
};

export type GoalWithContext = Goal & {
  area: { id: string; name: string; colorToken: string; iconName: string | null } | null;
  _count: { tasks: number; projects: number; habits: number };
};

const GOAL_CONTEXT_SELECT = {
  area: { select: { id: true, name: true, colorToken: true, iconName: true } },
  _count: { select: { tasks: true, projects: true, habits: true } },
} as const;

export async function listGoals(
  userId: string,
  filters: {
    status?: Goal["status"][];
    areaId?: string;
    search?: string;
    includeArchived?: boolean;
    limit?: number;
  } = {},
): Promise<GoalWithContext[]> {
  const where: Prisma.GoalWhereInput = { userId };

  if (filters.status?.length) where.status = { in: filters.status };
  else if (!filters.includeArchived) where.status = { not: "ARCHIVED" };

  if (filters.areaId) where.areaId = filters.areaId;

  if (filters.search?.trim()) {
    const term = filters.search.trim();
    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
    ];
  }

  const goals = await db.goal.findMany({
    where,
    include: GOAL_CONTEXT_SELECT,
    orderBy: [
      { status: "asc" },
      { priority: "desc" },
      { targetDate: "asc" },
      { createdAt: "desc" },
    ],
    take: filters.limit ?? 200,
  });

  return goals as GoalWithContext[];
}

export async function getGoal(userId: string, goalId: string): Promise<GoalWithContext> {
  const goal = await db.goal.findFirst({
    where: { id: goalId, userId },
    include: GOAL_CONTEXT_SELECT,
  });
  if (!goal) throw errors.notFound("Tujuan");
  return goal as GoalWithContext;
}

export async function createGoal(userId: string, input: unknown): Promise<Goal> {
  const data = parseOrThrow(goalCreateSchema, input, "Periksa kembali data tujuan.");
  // A supplied area id must be the caller's own; a forged one is refused
  // rather than silently dropped.
  const areaId = data.areaId ? await assertOwned("area", data.areaId, userId) : null;

  return db.goal.create({
    data: {
      userId,
      areaId,
      title: data.title,
      description: data.description ?? null,
      goalType: data.goalType,
      targetValue: data.targetValue ?? null,
      currentValue: data.currentValue ?? 0,
      unit: data.unit ?? null,
      startDate: data.startDate ? parseCalendarDay(data.startDate) : null,
      targetDate: data.targetDate ? parseCalendarDay(data.targetDate) : null,
      status: data.status,
      priority: data.priority,
      notes: data.notes ?? null,
      // Reaching the target at creation time is a real outcome, not an error.
      completedAt: data.status === "ACHIEVED" ? new Date() : null,
    },
  });
}

export async function updateGoal(
  userId: string,
  goalId: string,
  input: unknown,
): Promise<Goal> {
  await assertOwned("goal", goalId, userId, "Tujuan");
  const data = parseOrThrow(goalUpdateSchema, input, "Periksa kembali data tujuan.");

  const patch: Prisma.GoalUpdateInput = {};

  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description ?? null;
  if (data.goalType !== undefined) patch.goalType = data.goalType;
  if (data.targetValue !== undefined) patch.targetValue = data.targetValue;
  if (data.unit !== undefined) patch.unit = data.unit ?? null;
  if (data.priority !== undefined) patch.priority = data.priority;
  if (data.notes !== undefined) patch.notes = data.notes ?? null;

  if (data.startDate !== undefined) {
    patch.startDate = data.startDate ? parseCalendarDay(data.startDate) : null;
  }
  if (data.targetDate !== undefined) {
    patch.targetDate = data.targetDate ? parseCalendarDay(data.targetDate) : null;
  }

  if (data.areaId !== undefined) {
    patch.area = data.areaId
      ? { connect: { id: await assertOwned("area", data.areaId, userId) } }
      : { disconnect: true };
  }

  // A derived goal's current value belongs to the analytics layer, so a manual
  // write to it is refused rather than silently overwritten on the next read.
  const existing = await db.goal.findUnique({
    where: { id: goalId },
    select: { isDerived: true },
  });
  if (data.currentValue !== undefined) {
    if (existing?.isDerived) {
      throw errors.validation(
        "Progres tujuan ini dihitung otomatis dari tugas atau kebiasaan yang terhubung, jadi tidak bisa diisi manual.",
        { currentValue: "Nilai ini dihitung otomatis." },
      );
    }
    patch.currentValue = data.currentValue;
  }

  if (data.status !== undefined) {
    patch.status = data.status;
    patch.completedAt = data.status === "ACHIEVED" ? new Date() : null;
    if (data.status === "ARCHIVED") patch.archivedAt = new Date();
  }

  return db.goal.update({ where: { id: goalId }, data: patch });
}

/**
 * Computes progress for a set of goals in one pass.
 *
 * Batched deliberately: the Progress screen shows dozens of goals at once, and
 * running a per-goal query would be an obvious N+1.
 */
export async function computeGoalProgress(
  userId: string,
  goals: Array<{
    id: string;
    goalType: Goal["goalType"];
    targetValue: Prisma.Decimal | null;
    currentValue: Prisma.Decimal;
    isDerived: boolean;
    derivationKey: string | null;
    startDate: Date | null;
    targetDate: Date | null;
    status: Goal["status"];
  }>,
  timeZone: string,
): Promise<Map<string, GoalProgress>> {
  const result = new Map<string, GoalProgress>();
  if (goals.length === 0) return result;

  const ids = goals.map((g) => g.id);
  const day = today(timeZone);

  // One grouped query per derivation kind, rather than per goal.
  const derivedIds = goals.filter((g) => g.isDerived).map((g) => g.id);

  const [taskCounts, habitCounts] = await Promise.all([
    derivedIds.length
      ? db.task.groupBy({
          by: ["goalId"],
          where: { userId, goalId: { in: derivedIds }, status: "COMPLETED" },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    derivedIds.length
      ? db.habitLog.groupBy({
          by: ["habitId"],
          where: {
            userId,
            completed: true,
            habit: { goalId: { in: derivedIds } },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const taskCountByGoal = new Map<string, number>();
  for (const row of taskCounts) {
    if (row.goalId) taskCountByGoal.set(row.goalId, row._count._all);
  }

  // Habit logs group by habit, so the habit-to-goal mapping is needed to roll
  // them up. Fetched once for all derived goals.
  const habitGoalMap = new Map<string, string>();
  if (derivedIds.length) {
    const habits = await db.habit.findMany({
      where: { userId, goalId: { in: derivedIds } },
      select: { id: true, goalId: true },
    });
    for (const habit of habits) {
      if (habit.goalId) habitGoalMap.set(habit.id, habit.goalId);
    }
  }

  const habitCountByGoal = new Map<string, number>();
  for (const row of habitCounts) {
    const goalId = habitGoalMap.get(row.habitId);
    if (!goalId) continue;
    habitCountByGoal.set(goalId, (habitCountByGoal.get(goalId) ?? 0) + row._count._all);
  }

  for (const goal of goals) {
    const target = goal.targetValue === null ? null : Number(goal.targetValue);

    let current = Number(goal.currentValue);
    if (goal.isDerived) {
      // The derivation key decides which measurement feeds the goal. An
      // unknown or absent key falls back to completed-task count, which is the
      // most common case.
      const key = goal.derivationKey ?? "task.completed.count";
      if (key.startsWith("habit.")) {
        current = habitCountByGoal.get(goal.id) ?? 0;
      } else {
        current = taskCountByGoal.get(goal.id) ?? 0;
      }
    }

    const ratio =
      target !== null && target > 0 ? Math.min(1, Math.max(0, current / target)) : current > 0 ? 1 : 0;
    const percentage = ratio === null ? null : Math.round(ratio * 1000) / 10;

    const start = goal.startDate ? toDay(goal.startDate) : null;
    const end = goal.targetDate ? toDay(goal.targetDate) : null;

    const daysRemaining = end ? daysBetween(day, end) : null;

    const elapsedStart = start ?? end;
    const elapsedDays = elapsedStart ? Math.max(1, daysBetween(elapsedStart, day) + 1) : null;

    const remainingValue = target !== null ? Math.max(0, target - current) : null;
    const requiredPerDay =
      remainingValue !== null && daysRemaining !== null && daysRemaining >= 0
        ? Math.round((remainingValue / Math.max(1, daysRemaining + 1)) * 100) / 100
        : null;

    const velocityPerDay =
      elapsedDays !== null && elapsedDays > 0
        ? Math.round((current / elapsedDays) * 100) / 100
        : null;

    // Off track only when a target date exists and the remaining pace exceeds
    // the achieved pace. Without a deadline there is nothing to be late for.
    const isOffTrack =
      !goal.isDerived &&
      false; // manual goals make no pacing claim

    const derivedOffTrack =
      goal.isDerived &&
      target !== null &&
      daysRemaining !== null &&
      daysRemaining >= 0 &&
      requiredPerDay !== null &&
      velocityPerDay !== null &&
      requiredPerDay > velocityPerDay;

    result.set(goal.id, {
      goalId: goal.id,
      current: Math.round(current * 10000) / 10000,
      target,
      ratio,
      percentage,
      isComplete: goal.status === "ACHIEVED" || (target !== null && current >= target),
      daysRemaining,
      requiredPerDay,
      velocityPerDay,
      isOffTrack: isOffTrack || derivedOffTrack,
    });
  }

  // `ids` is used only to document intent; keeping the reference prevents the
  // compiler from flagging the array as unused if the queries are refactored.
  void ids;

  return result;
}

/** Prisma returns `date` columns at UTC midnight already; this is a type guard. */
function toDay(value: Date): CalendarDay {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** Convenience wrapper for a single goal. */
export async function getGoalProgress(
  userId: string,
  goalId: string,
  timeZone: string,
): Promise<GoalProgress> {
  const goal = await db.goal.findFirst({
    where: { id: goalId, userId },
    select: {
      id: true,
      goalType: true,
      targetValue: true,
      currentValue: true,
      isDerived: true,
      derivationKey: true,
      startDate: true,
      targetDate: true,
      status: true,
    },
  });
  if (!goal) throw errors.notFound("Tujuan");

  const map = await computeGoalProgress(userId, [goal], timeZone);
  const progress = map.get(goalId);
  if (!progress) throw errors.internal("Gagal menghitung progres tujuan.");
  return progress;
}

/**
 * Recomputes and persists the value of every derived goal.
 *
 * Derived goals cache their computed value so listings stay single-query, but
 * the cache is refreshed here rather than being trusted as truth.
 */
export async function refreshDerivedGoals(userId: string, timeZone: string): Promise<number> {
  const goals = await db.goal.findMany({
    where: { userId, isDerived: true, status: { in: ["PLANNED", "ACTIVE", "PAUSED"] } },
    select: {
      id: true,
      goalType: true,
      targetValue: true,
      currentValue: true,
      isDerived: true,
      derivationKey: true,
      startDate: true,
      targetDate: true,
      status: true,
    },
  });

  const progress = await computeGoalProgress(userId, goals, timeZone);

  let updated = 0;
  for (const goal of goals) {
    const computed = progress.get(goal.id);
    if (!computed) continue;
    if (Number(goal.currentValue) === computed.current) continue;

    await db.goal.update({
      where: { id: goal.id },
      data: {
        currentValue: computed.current,
        // Derived goals reach their target automatically; the user does not
        // have to remember to mark them done.
        ...(computed.isComplete && computed.current > 0
          ? { status: "ACHIEVED", completedAt: new Date() }
          : {}),
      },
    });
    updated += 1;
  }

  return updated;
}

export async function archiveGoal(userId: string, goalId: string): Promise<Goal> {
  await assertOwned("goal", goalId, userId, "Tujuan");
  return db.goal.update({
    where: { id: goalId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
}

export async function deleteGoal(userId: string, goalId: string): Promise<void> {
  await assertOwned("goal", goalId, userId, "Tujuan");

  // Deleting a goal with work attached would orphan tasks and projects, so it
  // is refused rather than silently cascading.
  const [tasks, projects, habits] = await Promise.all([
    db.task.count({ where: { goalId } }),
    db.project.count({ where: { goalId } }),
    db.habit.count({ where: { goalId } }),
  ]);

  if (tasks + projects + habits > 0) {
    throw errors.conflict(
      `Tujuan ini masih terhubung ke ${tasks} tugas, ${projects} proyek dan ${habits} kebiasaan. Lepaskan keterkaitannya dulu.`,
    );
  }

  await db.goal.delete({ where: { id: goalId } });
}
