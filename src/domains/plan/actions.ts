"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/action-result";
import { errors } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { parseCalendarDay, today } from "@/lib/date";
import * as areas from "./areas";
import * as goals from "./goals";
import * as projects from "./projects";
import * as tasks from "./tasks";

/**
 * Plan domain server actions.
 *
 * Thin by design: each action authenticates, delegates to a service, then
 * revalidates the routes whose data it changed. No business logic lives here,
 * so the same rules apply whether a write arrives from the UI, a script or a
 * test.
 */

/** Every surface that can display plan data. Revalidated together because a
 *  single task edit can change Today, Plan and Progress at once. */
function revalidatePlan() {
  revalidatePath("/today");
  revalidatePath("/plan");
  revalidatePath("/plan/tasks");
  revalidatePath("/plan/goals");
  revalidatePath("/plan/projects");
  revalidatePath("/progress");
}

// ─────────────────────────────────────────────────────────────────── areas ──

export const createAreaAction = defineAction(async (input: unknown) => {
  const user = await requireUser();
  const area = await areas.createArea(user.id, input);
  revalidatePlan();
  return area;
});

export const updateAreaAction = defineAction(
  async (input: { id: string } & Record<string, unknown>) => {
    const user = await requireUser();
    const { id, ...rest } = input;
    const area = await areas.updateArea(user.id, id, rest);
    revalidatePlan();
    return area;
  },
);

export const archiveAreaAction = defineAction(async (input: { id: string }) => {
  const user = await requireUser();
  const area = await areas.archiveArea(user.id, input.id);
  revalidatePlan();
  return area;
});

export const restoreAreaAction = defineAction(async (input: { id: string }) => {
  const user = await requireUser();
  const area = await areas.restoreArea(user.id, input.id);
  revalidatePlan();
  return area;
});

// ─────────────────────────────────────────────────────────────────── goals ──

export const createGoalAction = defineAction(async (input: unknown) => {
  const user = await requireUser();
  const goal = await goals.createGoal(user.id, input);
  revalidatePlan();
  return goal;
});

export const updateGoalAction = defineAction(
  async (input: { id: string } & Record<string, unknown>) => {
    const user = await requireUser();
    const { id, ...rest } = input;
    const goal = await goals.updateGoal(user.id, id, rest);
    revalidatePlan();
    return goal;
  },
);

export const archiveGoalAction = defineAction(async (input: { id: string }) => {
  const user = await requireUser();
  const goal = await goals.archiveGoal(user.id, input.id);
  revalidatePlan();
  return goal;
});

export const deleteGoalAction = defineAction(async (input: { id: string }) => {
  const user = await requireUser();
  await goals.deleteGoal(user.id, input.id);
  revalidatePlan();
  return { id: input.id };
});

/** Recomputes every derived goal. Safe to call repeatedly. */
export const refreshGoalsAction = defineAction(async () => {
  const user = await requireUser();
  const updated = await goals.refreshDerivedGoals(user.id, user.timeZone);
  revalidatePlan();
  return { updated };
});

// ──────────────────────────────────────────────────────────────── projects ──

export const createProjectAction = defineAction(async (input: unknown) => {
  const user = await requireUser();
  const project = await projects.createProject(user.id, input);
  revalidatePlan();
  return project;
});

export const updateProjectAction = defineAction(
  async (input: { id: string } & Record<string, unknown>) => {
    const user = await requireUser();
    const { id, ...rest } = input;
    const project = await projects.updateProject(user.id, id, rest);
    revalidatePlan();
    return project;
  },
);

export const archiveProjectAction = defineAction(async (input: { id: string }) => {
  const user = await requireUser();
  const project = await projects.archiveProject(user.id, input.id);
  revalidatePlan();
  return project;
});

export const deleteProjectAction = defineAction(async (input: { id: string }) => {
  const user = await requireUser();
  await projects.deleteProject(user.id, input.id);
  revalidatePlan();
  return { id: input.id };
});

// ────────────────────────────────────────────────────────────── milestones ──

export const createMilestoneAction = defineAction(async (input: unknown) => {
  const user = await requireUser();
  const milestone = await projects.createMilestone(user.id, input);
  revalidatePlan();
  return milestone;
});

export const updateMilestoneAction = defineAction(
  async (input: { id: string } & Record<string, unknown>) => {
    const user = await requireUser();
    const { id, ...rest } = input;
    const milestone = await projects.updateMilestone(user.id, id, rest);
    revalidatePlan();
    return milestone;
  },
);

export const deleteMilestoneAction = defineAction(async (input: { id: string }) => {
  const user = await requireUser();
  await projects.deleteMilestone(user.id, input.id);
  revalidatePlan();
  return { id: input.id };
});

// ─────────────────────────────────────────────────────────────────── tasks ──

export const createTaskAction = defineAction(async (input: unknown) => {
  const user = await requireUser();
  const task = await tasks.createTask(user.id, input);

  // A task created from Quick Add with no status becomes a commitment for
  // today by default — that is the intent behind adding it from Today.
  if (task.status === "INBOX" && !task.scheduledFor) {
    await tasks.scheduleTask(user.id, task.id, today(user.timeZone));
  }

  revalidatePlan();
  return task;
});

export const updateTaskAction = defineAction(
  async (input: { id: string } & Record<string, unknown>) => {
    const user = await requireUser();
    const { id, ...rest } = input;
    const task = await tasks.updateTask(user.id, id, rest);
    revalidatePlan();
    return task;
  },
);

export const toggleTaskAction = defineAction(async (input: { id: string }) => {
  const user = await requireUser();
  const task = await tasks.toggleTaskCompletion(user.id, input.id);
  revalidatePlan();
  return task;
});

/** Schedules a task onto a calendar day. Accepts `YYYY-MM-DD` or "today". */
export const scheduleTaskAction = defineAction(
  async (input: { id: string; day: string }) => {
    const user = await requireUser();

    const day =
      input.day === "today"
        ? today(user.timeZone)
        : input.day === "tomorrow"
          ? new Date(today(user.timeZone).getTime() + 86_400_000)
          : parseCalendarDay(input.day);

    if (!day) throw errors.validation("Tanggal tidak valid.", { day: "Format: YYYY-MM-DD." });

    const task = await tasks.scheduleTask(user.id, input.id, day);
    revalidatePlan();
    return task;
  },
);

export const archiveTaskAction = defineAction(async (input: { id: string }) => {
  const user = await requireUser();
  await tasks.deleteTask(user.id, input.id);
  revalidatePlan();
  return { id: input.id };
});

export const deleteTaskAction = defineAction(async (input: { id: string }) => {
  const user = await requireUser();
  await tasks.deleteTaskPermanently(user.id, input.id);
  revalidatePlan();
  return { id: input.id };
});
