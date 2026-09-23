import { db } from "@/lib/db";
import { errors } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import { assertOwned } from "@/lib/auth/ownership";
import {
  addCalendarDays,
  type CalendarDay,
  parseCalendarDay,
} from "@/lib/date";
import { taskCreateSchema, taskUpdateSchema } from "./schemas";
import type { Prisma, Task } from "@/generated/prisma/client";

/**
 * Task service.
 *
 * Tasks are the unit of *doing*. The design keeps them deliberately simple:
 * one status, one priority, one optional day, and links upward into the plan
 * hierarchy. Everything the Today screen and the analytics engine need is
 * derivable from these rows and their timestamps.
 */

export type TaskListFilters = {
  status?: Task["status"][];
  priority?: Task["priority"][];
  areaId?: string;
  goalId?: string;
  projectId?: string;
  /** Inclusive calendar-day window on `scheduledFor`. */
  from?: CalendarDay;
  to?: CalendarDay;
  search?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
};

export type TaskWithContext = Task & {
  area: { id: string; name: string; colorToken: string } | null;
  goal: { id: string; title: string } | null;
  project: { id: string; title: string; status: string } | null;
  milestone: { id: string; title: string } | null;
};

/**
 * Builds the `where` clause for a task listing.
 *
 * Extracted so the list query and its count query always filter identically —
 * a paginated list whose total disagrees with its rows is a bug users notice.
 */
function buildTaskWhere(userId: string, filters: TaskListFilters): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { userId };

  if (filters.status && filters.status.length > 0) {
    where.status = { in: filters.status };
  } else if (!filters.includeArchived) {
    // Archived tasks are excluded unless explicitly requested, so they do not
    // silently inflate completion statistics.
    where.status = { not: "ARCHIVED" };
  }

  if (filters.priority?.length) where.priority = { in: filters.priority };
  if (filters.areaId) where.areaId = filters.areaId;
  if (filters.goalId) where.goalId = filters.goalId;
  if (filters.projectId) where.projectId = filters.projectId;

  if (filters.from || filters.to) {
    where.scheduledFor = {};
    if (filters.from) where.scheduledFor.gte = filters.from;
    if (filters.to) where.scheduledFor.lte = filters.to;
  }

  if (filters.search?.trim()) {
    const term = filters.search.trim();
    // Case-insensitive substring across the fields a user would remember.
    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { notes: { contains: term, mode: "insensitive" } },
    ];
  }

  return where;
}

const TASK_CONTEXT_SELECT = {
  area: { select: { id: true, name: true, colorToken: true } },
  goal: { select: { id: true, title: true } },
  project: { select: { id: true, title: true, status: true } },
  milestone: { select: { id: true, title: true } },
} as const;

export async function listTasks(
  userId: string,
  filters: TaskListFilters = {},
): Promise<{ tasks: TaskWithContext[]; total: number }> {
  const where = buildTaskWhere(userId, filters);

  const [tasks, total] = await Promise.all([
    db.task.findMany({
      where,
      select: {
        id: true,
        userId: true,
        title: true,
        description: true,
        notes: true,
        status: true,
        priority: true,
        dueDate: true,
        scheduledFor: true,
        estimatedMinutes: true,
        position: true,
        completedAt: true,
        skippedAt: true,
        archivedAt: true,
        areaId: true,
        goalId: true,
        projectId: true,
        milestoneId: true,
        recurrenceId: true,
        createdAt: true,
        updatedAt: true,
        ...TASK_CONTEXT_SELECT,
      },
      orderBy: [
        // Open work first, then by priority, then by the day it belongs to.
        // A completed task should fall to the bottom, not stay interleaved.
        { status: "asc" },
        { priority: "desc" },
        { scheduledFor: "asc" },
        { position: "asc" },
        { createdAt: "desc" },
      ],
      take: filters.limit ?? 200,
      skip: filters.offset ?? 0,
    }),
    db.task.count({ where }),
  ]);

  return { tasks: tasks as TaskWithContext[], total };
}

export async function getTask(userId: string, taskId: string): Promise<TaskWithContext> {
  const task = await db.task.findFirst({
    where: { id: taskId, userId },
    include: TASK_CONTEXT_SELECT,
  });
  if (!task) throw errors.notFound("Tugas");
  return task as TaskWithContext;
}

/**
 * Tasks scheduled for a specific day, plus anything overdue.
 *
 * Overdue is computed from `scheduledFor`, not `dueDate`: a task the user
 * planned for Tuesday is overdue on Wednesday regardless of whether it had a
 * deadline at all.
 */
export async function getTasksForDay(
  userId: string,
  day: CalendarDay,
): Promise<{ scheduled: TaskWithContext[]; overdue: TaskWithContext[] }> {
  const [scheduled, overdue] = await Promise.all([
    db.task.findMany({
      where: {
        userId,
        scheduledFor: day,
        status: { notIn: ["COMPLETED", "ARCHIVED"] },
      },
      include: TASK_CONTEXT_SELECT,
      orderBy: [{ priority: "desc" }, { position: "asc" }, { createdAt: "asc" }],
    }),
    db.task.findMany({
      where: {
        userId,
        scheduledFor: { lt: day },
        status: { notIn: ["COMPLETED", "SKIPPED", "ARCHIVED", "INBOX"] },
      },
      include: TASK_CONTEXT_SELECT,
      orderBy: [{ scheduledFor: "asc" }, { priority: "desc" }],
      take: 20,
    }),
  ]);

  return {
    scheduled: scheduled as TaskWithContext[],
    overdue: overdue as TaskWithContext[],
  };
}

export async function getCompletedTasksForDay(
  userId: string,
  day: CalendarDay,
): Promise<TaskWithContext[]> {
  // Completion is an instant, so the day boundary must be computed in the
  // user's zone rather than from the raw timestamp.
  const next = addCalendarDays(day, 1);
  const tasks = await db.task.findMany({
    where: {
      userId,
      status: "COMPLETED",
      completedAt: { gte: day, lt: next },
    },
    include: TASK_CONTEXT_SELECT,
    orderBy: { completedAt: "asc" },
  });
  return tasks as TaskWithContext[];
}

export async function createTask(userId: string, input: unknown): Promise<Task> {
  const data = parseOrThrow(taskCreateSchema, input, "Periksa kembali data tugas.");

  // An id that was supplied must resolve to a record the caller owns.
  // `findOwned` returns null for a missing *or* foreign id, which would let a
  // forged reference be silently dropped and still create the task; that reads
  // as the link having worked. `assertOwned` is used whenever the client sent
  // a value, so a bad reference is refused with a clear message.
  const [areaId, goalId, projectId, milestoneId] = await Promise.all([
    data.areaId ? assertOwned("area", data.areaId, userId) : null,
    data.goalId ? assertOwned("goal", data.goalId, userId) : null,
    data.projectId ? assertOwned("project", data.projectId, userId) : null,
    data.milestoneId ? assertOwned("milestone", data.milestoneId, userId) : null,
  ]);

  return db.task.create({
    data: {
      userId,
      title: data.title,
      description: data.description ?? null,
      notes: data.notes ?? null,
      status: data.status,
      priority: data.priority,
      scheduledFor: data.scheduledFor ? parseCalendarDay(data.scheduledFor) : null,
      dueDate: data.dueDate ? parseCalendarDay(data.dueDate) : null,
      estimatedMinutes: data.estimatedMinutes ?? null,
      areaId,
      goalId,
      projectId,
      milestoneId,
    },
  });
}

export async function updateTask(
  userId: string,
  taskId: string,
  input: unknown,
): Promise<Task> {
  await assertOwned("task", taskId, userId, "Tugas");
  const data = parseOrThrow(taskUpdateSchema, input, "Periksa kembali data tugas.");

  const patch: Prisma.TaskUpdateInput = {};

  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description ?? null;
  if (data.notes !== undefined) patch.notes = data.notes ?? null;
  if (data.priority !== undefined) patch.priority = data.priority;
  if (data.estimatedMinutes !== undefined) patch.estimatedMinutes = data.estimatedMinutes;

  if (data.scheduledFor !== undefined) {
    patch.scheduledFor = data.scheduledFor ? parseCalendarDay(data.scheduledFor) : null;
  }
  if (data.dueDate !== undefined) {
    patch.dueDate = data.dueDate ? parseCalendarDay(data.dueDate) : null;
  }

  // Relation changes need `connect`/`disconnect`, and each id must be verified
  // individually because `null` means "clear" rather than "unknown".
  if (data.areaId !== undefined) {
    patch.area = data.areaId ? { connect: { id: await assertOwned("area", data.areaId, userId) } } : { disconnect: true };
  }
  if (data.goalId !== undefined) {
    patch.goal = data.goalId ? { connect: { id: await assertOwned("goal", data.goalId, userId) } } : { disconnect: true };
  }
  if (data.projectId !== undefined) {
    patch.project = data.projectId ? { connect: { id: await assertOwned("project", data.projectId, userId) } } : { disconnect: true };
  }
  if (data.milestoneId !== undefined) {
    patch.milestone = data.milestoneId ? { connect: { id: await assertOwned("milestone", data.milestoneId, userId) } } : { disconnect: true };
  }

  // Status transitions own their timestamps. Setting `COMPLETED` twice must
  // not move the completion instant, or the analytics would double count it
  // across two days.
  if (data.status !== undefined) {
    patch.status = data.status;
    if (data.status === "COMPLETED") {
      patch.completedAt = new Date();
      patch.skippedAt = null;
    } else if (data.status === "SKIPPED") {
      patch.skippedAt = new Date();
      patch.completedAt = null;
    } else if (data.status === "ARCHIVED") {
      patch.archivedAt = new Date();
    } else {
      patch.completedAt = null;
      patch.skippedAt = null;
    }
  }

  return db.task.update({ where: { id: taskId }, data: patch });
}

/**
 * Toggles completion.
 *
 * Separate from `updateTask` because it is the single most frequent write in
 * the product and deserves an unambiguous, idempotent contract: completing an
 * already-complete task leaves it complete rather than re-stamping the time.
 */
export async function toggleTaskCompletion(
  userId: string,
  taskId: string,
): Promise<Task> {
  const current = await db.task.findFirst({
    where: { id: taskId, userId },
    select: { id: true, status: true, completedAt: true },
  });
  if (!current) throw errors.notFound("Tugas");

  if (current.status === "COMPLETED") {
    // Reverting returns the task to the day it was planned for.
    return db.task.update({
      where: { id: taskId },
      data: { status: "PLANNED", completedAt: null },
    });
  }

  return db.task.update({
    where: { id: taskId },
    data: {
      status: "COMPLETED",
      completedAt: current.completedAt ?? new Date(),
      skippedAt: null,
    },
  });
}

/**
 * Moves a task to a calendar day and marks it as deliberately planned.
 *
 * `INBOX` tasks are uncommitted; scheduling one is the act that turns it into
 * a commitment, so the status follows automatically. A `COMPLETED` or
 * `SKIPPED` task that is rescheduled is returned to the open state — leaving
 * it finished would place it in a day it can never appear in, which reads as
 * the task having vanished.
 */
export async function scheduleTask(
  userId: string,
  taskId: string,
  day: CalendarDay,
): Promise<Task> {
  const current = await db.task.findFirst({
    where: { id: taskId, userId },
    select: { id: true, status: true },
  });
  if (!current) throw errors.notFound("Tugas");

  const isFinished =
    current.status === "COMPLETED" ||
    current.status === "SKIPPED" ||
    current.status === "ARCHIVED";

  const status = isFinished ? "PLANNED" : current.status;

  return db.task.update({
    where: { id: taskId },
    data: {
      scheduledFor: day,
      status,
      // Reopening must clear the closing timestamp, otherwise the analytics
      // would still count a task that is no longer done.
      ...(isFinished ? { completedAt: null, skippedAt: null } : {}),
    },
  });
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  await assertOwned("task", taskId, userId, "Tugas");
  // Soft delete: a task that was completed is part of the historical record
  // and removing the row would rewrite past statistics.
  await db.task.update({
    where: { id: taskId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
}

export async function deleteTaskPermanently(userId: string, taskId: string): Promise<void> {
  await assertOwned("task", taskId, userId, "Tugas");
  await db.task.delete({ where: { id: taskId } });
}

/**
 * Counts open tasks per day for the plan calendar.
 *
 * Returns a map keyed by `YYYY-MM-DD` so the UI can render load without
 * issuing one query per cell.
 */
export async function getTaskLoadByDay(
  userId: string,
  from: CalendarDay,
  to: CalendarDay,
): Promise<Record<string, { open: number; done: number }>> {
  const rows = await db.task.groupBy({
    by: ["scheduledFor", "status"],
    where: {
      userId,
      scheduledFor: { gte: from, lte: to },
      status: { notIn: ["ARCHIVED"] },
    },
    _count: { _all: true },
  });

  const out: Record<string, { open: number; done: number }> = {};
  for (const row of rows) {
    if (!row.scheduledFor) continue;
    const key = row.scheduledFor.toISOString().slice(0, 10);
    const bucket = (out[key] ??= { open: 0, done: 0 });
    const count = row._count._all;
    if (row.status === "COMPLETED") bucket.done += count;
    else if (row.status !== "SKIPPED") bucket.open += count;
  }
  return out;
}
