import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { today, weekPeriod, addCalendarDays, formatFullDate } from "@/lib/date";
import * as tasks from "@/domains/plan/tasks";
import * as goals from "@/domains/plan/goals";
import * as projects from "@/domains/plan/projects";
import * as areas from "@/domains/plan/areas";
import { PlanOverview } from "./plan-overview";

export const metadata = { title: "Plan" };

/**
 * Plan.
 *
 * The hub for everything the user is *trying to accomplish*. It answers
 * "what am I working on" in one screen, and links outward to the four deeper
 * surfaces (areas, goals, projects, tasks).
 *
 * All figures come from the same services the detail pages use, so the hub can
 * never disagree with the page it links to.
 */
export default async function PlanPage() {
  const user = await requireUser();
  const day = today(user.timeZone);
  const week = weekPeriod(day, user.weekStartsOn);

  // Everything the hub needs, in parallel. Each call is scoped by userId.
  const [
    areaList,
    activeGoals,
    activeProjects,
    openTasks,
    overdueTasks,
    weekLoad,
  ] = await Promise.all([
    areas.listAreas(user.id),
    goals.listGoals(user.id, { status: ["ACTIVE", "PLANNED"] }),
    projects.listProjects(user.id, { status: ["ACTIVE", "PLANNED"] }),
    tasks.listTasks(user.id, { status: ["INBOX", "PLANNED", "TODAY"], limit: 500 }),
    tasks.listTasks(user.id, {
      status: ["PLANNED", "TODAY"],
      from: addCalendarDays(day, -90),
      to: addCalendarDays(day, -1),
      limit: 50,
    }),
    tasks.getTaskLoadByDay(user.id, week.start, addCalendarDays(week.endExclusive, -1)),
  ]);

  // Progress is computed in one batch per domain rather than per row.
  const [goalProgress, projectProgress] = await Promise.all([
    goals.computeGoalProgress(
      user.id,
      activeGoals.map((g) => ({
        id: g.id,
        goalType: g.goalType,
        targetValue: g.targetValue,
        currentValue: g.currentValue,
        isDerived: g.isDerived,
        derivationKey: g.derivationKey,
        startDate: g.startDate,
        targetDate: g.targetDate,
        status: g.status,
      })),
      user.timeZone,
    ),
    projects.computeProjectProgress(
      user.id,
      activeProjects.map((p) => ({
        id: p.id,
        targetDate: p.targetDate,
        status: p.status,
      })),
      day,
    ),
  ]);

  return (
    <AppShell
      title="Plan"
      subtitle={formatFullDate(day, user.locale)}
    >
      <PlanOverview
        areas={areaList.map((a) => ({
          id: a.id,
          name: a.name,
          colorToken: a.colorToken,
          iconName: a.iconName,
          goalCount: a._count.goals,
          projectCount: a._count.projects,
          taskCount: a._count.tasks,
        }))}
        goals={activeGoals.map((g) => {
          const progress = goalProgress.get(g.id);
          return {
            id: g.id,
            title: g.title,
            status: g.status,
            priority: g.priority,
            areaName: g.area?.name ?? null,
            areaToken: g.area?.colorToken ?? null,
            percentage: progress?.percentage ?? null,
            current: progress?.current ?? 0,
            target: progress?.target ?? null,
            unit: g.unit,
            goalType: g.goalType,
            daysRemaining: progress?.daysRemaining ?? null,
            isOffTrack: progress?.isOffTrack ?? false,
          };
        })}
        projects={activeProjects.map((p) => {
          const progress = projectProgress.get(p.id);
          return {
            id: p.id,
            title: p.title,
            status: p.status,
            areaName: p.area?.name ?? null,
            areaToken: p.area?.colorToken ?? null,
            goalTitle: p.goal?.title ?? null,
            percentage: progress?.percentage ?? 0,
            basis: progress?.basis ?? null,
            totalMilestones: progress?.totalMilestones ?? 0,
            completedMilestones: progress?.completedMilestones ?? 0,
            taskCount: Number(p._count.tasks),
            isOverdue: progress?.isOverdue ?? false,
          };
        })}
        counts={{
          openTasks: openTasks.total,
          overdueTasks: overdueTasks.total,
          activeGoals: activeGoals.length,
          activeProjects: activeProjects.length,
        }}
        weekLoad={weekLoad}
        weekStart={week.start.toISOString().slice(0, 10)}
      />
    </AppShell>
  );
}
