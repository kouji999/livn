import { db } from "@/lib/db";
import { errors } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import { assertOwned } from "@/lib/auth/ownership";
import { parseCalendarDay } from "@/lib/date";
import {
  milestoneCreateSchema,
  milestoneUpdateSchema,
  projectCreateSchema,
  projectUpdateSchema,
} from "./schemas";
import type { Milestone, Prisma, Project } from "@/generated/prisma/client";

/**
 * Project and milestone service.
 *
 * Projects are *finite* work toward a goal. Their completion percentage is
 * derived from milestones when the project has any, and from tasks otherwise:
 * counting both would double-count the same work, since tasks roll up into
 * milestones.
 */

export type ProjectProgress = {
  projectId: string;
  totalMilestones: number;
  completedMilestones: number;
  totalTasks: number;
  completedTasks: number;
  /** 0..1. Milestone-based when milestones exist, task-based otherwise. */
  ratio: number;
  percentage: number;
  /** `null` when the project has neither milestones nor tasks. */
  basis: "milestones" | "tasks" | null;
  isOverdue: boolean;
};

export type ProjectWithContext = Project & {
  area: { id: string; name: string; colorToken: string; iconName: string | null } | null;
  goal: { id: string; title: string } | null;
  _count: { tasks: true | number; milestones: true | number };
};

const PROJECT_CONTEXT_SELECT = {
  area: { select: { id: true, name: true, colorToken: true, iconName: true } },
  goal: { select: { id: true, title: true } },
  _count: { select: { tasks: true, milestones: true } },
} as const;

export async function listProjects(
  userId: string,
  filters: {
    status?: Project["status"][];
    areaId?: string;
    goalId?: string;
    search?: string;
    includeArchived?: boolean;
    limit?: number;
  } = {},
): Promise<ProjectWithContext[]> {
  const where: Prisma.ProjectWhereInput = { userId };

  if (filters.status?.length) where.status = { in: filters.status };
  else if (!filters.includeArchived) where.status = { not: "ARCHIVED" };

  if (filters.areaId) where.areaId = filters.areaId;
  if (filters.goalId) where.goalId = filters.goalId;

  if (filters.search?.trim()) {
    const term = filters.search.trim();
    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
    ];
  }

  const projects = await db.project.findMany({
    where,
    include: PROJECT_CONTEXT_SELECT,
    orderBy: [
      { status: "asc" },
      { targetDate: "asc" },
      { createdAt: "desc" },
    ],
    take: filters.limit ?? 200,
  });

  return projects as ProjectWithContext[];
}

export async function getProject(
  userId: string,
  projectId: string,
): Promise<ProjectWithContext> {
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
    include: PROJECT_CONTEXT_SELECT,
  });
  if (!project) throw errors.notFound("Proyek");
  return project as ProjectWithContext;
}

export async function createProject(userId: string, input: unknown): Promise<Project> {
  const data = parseOrThrow(projectCreateSchema, input, "Periksa kembali data proyek.");

  const [areaId, goalId] = await Promise.all([
    data.areaId ? assertOwned("area", data.areaId, userId) : null,
    data.goalId ? assertOwned("goal", data.goalId, userId) : null,
  ]);

  return db.project.create({
    data: {
      userId,
      areaId,
      goalId,
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      startDate: data.startDate ? parseCalendarDay(data.startDate) : null,
      targetDate: data.targetDate ? parseCalendarDay(data.targetDate) : null,
      completedAt: data.status === "COMPLETED" ? new Date() : null,
    },
  });
}

export async function updateProject(
  userId: string,
  projectId: string,
  input: unknown,
): Promise<Project> {
  await assertOwned("project", projectId, userId, "Proyek");
  const data = parseOrThrow(projectUpdateSchema, input, "Periksa kembali data proyek.");

  const patch: Prisma.ProjectUpdateInput = {};

  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description ?? null;

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
  if (data.goalId !== undefined) {
    patch.goal = data.goalId
      ? { connect: { id: await assertOwned("goal", data.goalId, userId) } }
      : { disconnect: true };
  }

  if (data.status !== undefined) {
    patch.status = data.status;
    // The completion instant is only stamped on the transition into
    // COMPLETED, so re-saving a finished project does not move its date.
    if (data.status === "COMPLETED") {
      const current = await db.project.findUnique({
        where: { id: projectId },
        select: { completedAt: true },
      });
      patch.completedAt = current?.completedAt ?? new Date();
    } else {
      patch.completedAt = null;
    }
    if (data.status === "ARCHIVED") patch.archivedAt = new Date();
  }

  return db.project.update({ where: { id: projectId }, data: patch });
}

/**
 * Derived progress for many projects at once.
 *
 * Two grouped aggregate queries total, regardless of how many projects are
 * shown — the same pattern the goal engine uses.
 */
export async function computeProjectProgress(
  userId: string,
  projects: Array<{
    id: string;
    targetDate: Date | null;
    status: Project["status"];
  }>,
  referenceDay: Date,
): Promise<Map<string, ProjectProgress>> {
  const result = new Map<string, ProjectProgress>();
  if (projects.length === 0) return result;

  const ids = projects.map((p) => p.id);

  const [milestoneCounts, milestoneDone, taskCounts, taskDone] = await Promise.all([
    db.milestone.groupBy({
      by: ["projectId"],
      where: { userId, projectId: { in: ids } },
      _count: { _all: true },
    }),
    db.milestone.groupBy({
      by: ["projectId"],
      where: { userId, projectId: { in: ids }, completedAt: { not: null } },
      _count: { _all: true },
    }),
    db.task.groupBy({
      by: ["projectId"],
      where: { userId, projectId: { in: ids }, status: { not: "ARCHIVED" } },
      _count: { _all: true },
    }),
    db.task.groupBy({
      by: ["projectId"],
      where: { userId, projectId: { in: ids }, status: "COMPLETED" },
      _count: { _all: true },
    }),
  ]);

  const toMap = (rows: Array<{ projectId: string | null; _count: { _all: number } }>) => {
    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.projectId) map.set(row.projectId, row._count._all);
    }
    return map;
  };

  const milestonesByProject = toMap(milestoneCounts);
  const milestonesDoneByProject = toMap(milestoneDone);
  const tasksByProject = toMap(taskCounts);
  const tasksDoneByProject = toMap(taskDone);

  for (const project of projects) {
    const totalMilestones = milestonesByProject.get(project.id) ?? 0;
    const completedMilestones = milestonesDoneByProject.get(project.id) ?? 0;
    const totalTasks = tasksByProject.get(project.id) ?? 0;
    const completedTasks = tasksDoneByProject.get(project.id) ?? 0;

    // Milestones take precedence: they are the coarser, more meaningful unit.
    let ratio = 0;
    let basis: ProjectProgress["basis"] = null;

    if (totalMilestones > 0) {
      ratio = completedMilestones / totalMilestones;
      basis = "milestones";
    } else if (totalTasks > 0) {
      ratio = completedTasks / totalTasks;
      basis = "tasks";
    }

    const isOverdue =
      project.status !== "COMPLETED" &&
      project.status !== "ARCHIVED" &&
      project.targetDate !== null &&
      project.targetDate.getTime() < referenceDay.getTime();

    result.set(project.id, {
      projectId: project.id,
      totalMilestones,
      completedMilestones,
      totalTasks,
      completedTasks,
      ratio,
      percentage: Math.round(ratio * 1000) / 10,
      basis,
      isOverdue,
    });
  }

  return result;
}

/** Milestones for a project, ordered and with their task progress. */
export async function listMilestones(userId: string, projectId: string) {
  await assertOwned("project", projectId, userId, "Proyek");

  return db.milestone.findMany({
    where: { userId, projectId },
    include: {
      _count: { select: { tasks: true } },
      tasks: {
        where: { status: "COMPLETED" },
        select: { id: true },
      },
    },
    orderBy: [{ position: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
  });
}

export async function createMilestone(userId: string, input: unknown): Promise<Milestone> {
  const data = parseOrThrow(milestoneCreateSchema, input, "Periksa kembali data milestone.");
  await assertOwned("project", data.projectId, userId, "Proyek");

  const last = await db.milestone.findFirst({
    where: { projectId: data.projectId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  return db.milestone.create({
    data: {
      userId,
      projectId: data.projectId,
      title: data.title,
      description: data.description ?? null,
      dueDate: data.dueDate ? parseCalendarDay(data.dueDate) : null,
      position: (last?.position ?? -1) + 1,
    },
  });
}

export async function updateMilestone(
  userId: string,
  milestoneId: string,
  input: unknown,
): Promise<Milestone> {
  await assertOwned("milestone", milestoneId, userId, "Milestone");
  const data = parseOrThrow(milestoneUpdateSchema, input, "Periksa kembali data milestone.");

  const patch: Prisma.MilestoneUpdateInput = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description ?? null;
  if (data.dueDate !== undefined) {
    patch.dueDate = data.dueDate ? parseCalendarDay(data.dueDate) : null;
  }
  if (data.completed !== undefined) {
    patch.completedAt = data.completed ? new Date() : null;
  }

  return db.milestone.update({ where: { id: milestoneId }, data: patch });
}

export async function deleteMilestone(userId: string, milestoneId: string): Promise<void> {
  await assertOwned("milestone", milestoneId, userId, "Milestone");
  // Tasks survive their milestone: the milestone was an organisational
  // grouping, not the work itself, so the task keeps its project link.
  await db.$transaction([
    db.task.updateMany({ where: { milestoneId }, data: { milestoneId: null } }),
    db.milestone.delete({ where: { id: milestoneId } }),
  ]);
}

export async function archiveProject(userId: string, projectId: string): Promise<Project> {
  await assertOwned("project", projectId, userId, "Proyek");

  const openTasks = await db.task.count({
    where: { projectId, status: { in: ["INBOX", "PLANNED", "TODAY"] } },
  });
  if (openTasks > 0) {
    throw errors.conflict(
      `Proyek ini masih punya ${openTasks} tugas terbuka. Selesaikan atau pindahkan dulu.`,
    );
  }

  return db.project.update({
    where: { id: projectId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
}

export async function deleteProject(userId: string, projectId: string): Promise<void> {
  await assertOwned("project", projectId, userId, "Proyek");

  const taskCount = await db.task.count({ where: { projectId } });
  if (taskCount > 0) {
    throw errors.conflict(
      `Proyek ini masih punya ${taskCount} tugas. Hapus atau pindahkan tugasnya dulu.`,
    );
  }

  // Milestones cascade with the project; the guard above already ensured no
  // task would be orphaned.
  await db.project.delete({ where: { id: projectId } });
}
