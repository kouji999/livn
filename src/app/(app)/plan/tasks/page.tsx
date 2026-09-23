import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { db } from "@/lib/db";
import { today, addCalendarDays, formatFullDate, formatCalendarDay } from "@/lib/date";
import * as tasks from "@/domains/plan/tasks";
import * as areas from "@/domains/plan/areas";
import * as projects from "@/domains/plan/projects";
import * as goals from "@/domains/plan/goals";
import { TaskBoard } from "./task-board";
import type { TaskStatusFilter } from "./task-filters";

export const metadata = { title: "Tugas" };

/**
 * Tasks.
 *
 * The list view for execution. Filters live in the URL (`?status=`, `?area=`)
 * so a filtered view is shareable and survives a refresh, and so the server can
 * do the filtering rather than shipping every row to the client.
 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; area?: string; q?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const day = today(user.timeZone);

  const statusFilter = parseStatusFilter(params.status);
  const areaFilter = params.area?.trim() || undefined;
  const search = params.q?.trim() || undefined;

  const [result, areaList, projectList, goalList] = await Promise.all([
    tasks.listTasks(user.id, {
      status: statusFilter,
      areaId: areaFilter,
      search,
      includeArchived: false,
      limit: 400,
    }),
    areas.listAreas(user.id),
    projects.listProjects(user.id, { status: ["PLANNED", "ACTIVE", "PAUSED"] }),
    goals.listGoals(user.id, { status: ["PLANNED", "ACTIVE"] }),
  ]);

  const todayKey = formatCalendarDay(day);

  // Counts for the filter chips, computed from the unfiltered set so the
  // numbers do not change as the user filters.
  const allTasks = await tasks.listTasks(user.id, { limit: 1000 });
  const counts = {
    all: allTasks.tasks.filter((t) => t.status !== "ARCHIVED").length,
    open: allTasks.tasks.filter((t) => t.status === "INBOX" || t.status === "PLANNED" || t.status === "TODAY").length,
    today: allTasks.tasks.filter((t) => t.scheduledFor && formatCalendarDay(t.scheduledFor) === todayKey).length,
    overdue: allTasks.tasks.filter(
      (t) =>
        t.scheduledFor &&
        formatCalendarDay(t.scheduledFor) < todayKey &&
        (t.status === "PLANNED" || t.status === "TODAY"),
    ).length,
    completed: allTasks.tasks.filter((t) => t.status === "COMPLETED").length,
  };

  return (
    <AppShell
      title="Tugas"
      subtitle={`${result.total} tugas - ${formatFullDate(day, user.locale)}`}
    >
      <TaskBoard
        tasks={result.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          scheduledFor: task.scheduledFor ? formatCalendarDay(task.scheduledFor) : null,
          dueDate: task.dueDate ? formatCalendarDay(task.dueDate) : null,
          estimatedMinutes: task.estimatedMinutes,
          area: task.area,
          goal: task.goal ? { id: task.goal.id, title: task.goal.title } : null,
          project: task.project ?? null,
        }))}
        todayKey={todayKey}
        tomorrowKey={formatCalendarDay(addCalendarDays(day, 1))}
        counts={counts}
        activeAreaId={areaFilter ?? null}
        search={search ?? ""}
        areas={areaList.map((a) => ({
          id: a.id,
          name: a.name,
          colorToken: a.colorToken,
          iconName: a.iconName,
        }))}
        projects={projectList.map((p) => ({ id: p.id, title: p.title }))}
        goals={goalList.map((g) => ({ id: g.id, title: g.title }))}
      />
    </AppShell>
  );
}

/**
 * Maps the `status` query parameter to the set of statuses it represents.
 *
 * Named groups rather than raw enum values because "Terlewat" is a date
 * comparison, not a status the database knows about.
 */
function parseStatusFilter(value: string | undefined): TaskStatusFilter[] | undefined {
  switch (value) {
    case "open":
      return ["INBOX", "PLANNED", "TODAY"];
    case "today":
      return ["PLANNED", "TODAY"];
    case "completed":
      return ["COMPLETED"];
    case "inbox":
      return ["INBOX"];
    case "all":
      return undefined;
    default:
      return undefined;
  }
}

void db;
