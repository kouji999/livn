import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { today, formatFullDate } from "@/lib/date";
import * as projects from "@/domains/plan/projects";
import * as areas from "@/domains/plan/areas";
import * as goals from "@/domains/plan/goals";
import { ProjectList } from "./project-list";

export const metadata = { title: "Proyek" };

export default async function ProjectsPage() {
  const user = await requireUser();
  const day = today(user.timeZone);

  const [projectList, areaList, goalList] = await Promise.all([
    projects.listProjects(user.id, { limit: 300 }),
    areas.listAreas(user.id),
    goals.listGoals(user.id, { status: ["PLANNED", "ACTIVE"], limit: 100 }),
  ]);

  const progressMap = await projects.computeProjectProgress(
    user.id,
    projectList.map((p) => ({ id: p.id, targetDate: p.targetDate, status: p.status })),
    day,
  );

  return (
    <AppShell
      title="Proyek"
      subtitle={`${projectList.length} proyek - ${formatFullDate(day, user.locale)}`}
    >
      <ProjectList
        projects={projectList.map((p) => {
          const progress = progressMap.get(p.id);
          return {
            id: p.id,
            title: p.title,
            description: p.description,
            status: p.status,
            areaName: p.area?.name ?? null,
            areaToken: p.area?.colorToken ?? null,
            areaIcon: p.area?.iconName ?? null,
            goalId: p.goal?.id ?? null,
            goalTitle: p.goal?.title ?? null,
            percentage: progress?.percentage ?? 0,
            basis: progress?.basis ?? null,
            totalMilestones: progress?.totalMilestones ?? 0,
            completedMilestones: progress?.completedMilestones ?? 0,
            totalTasks: progress?.totalTasks ?? 0,
            completedTasks: progress?.completedTasks ?? 0,
            isOverdue: progress?.isOverdue ?? false,
            targetDate: p.targetDate ? p.targetDate.toISOString().slice(0, 10) : null,
          };
        })}
        areas={areaList.map((a) => ({ id: a.id, name: a.name, colorToken: a.colorToken }))}
        goals={goalList.map((g) => ({ id: g.id, title: g.title }))}
      />
    </AppShell>
  );
}
