import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { Card, CardHeader, SectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { RecordIcon } from "@/components/ui/record-icon";
import { ProgressBar } from "@/components/ui/indicator";
import { StatusBadge } from "@/components/ui/status";
import { Stat, StatStrip } from "@/components/layout/page";
import { db } from "@/lib/db";
import { today, formatFullDate, formatCalendarDay } from "@/lib/date";
import * as goals from "@/domains/plan/goals";
import * as projects from "@/domains/plan/projects";
import { formatMoneyOrNumber, formatShortDate } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const area = await db.area.findFirst({ where: { id, userId: user.id }, select: { name: true } });
  return { title: area?.name ?? "Area" };
}

/**
 * Area detail.
 *
 * Everything filed under one area of life, in one place: its goals with their
 * measured progress, its projects, and its open work. This is the view that
 * makes the area model worth having.
 */
export default async function AreaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const day = today(user.timeZone);
  const todayKey = formatCalendarDay(day);

  const area = await db.area
    .findFirst({ where: { id, userId: user.id } })
    .catch(() => null);

  if (!area) notFound();

  const [goalList, projectList, taskList, habitList] = await Promise.all([
    goals.listGoals(user.id, { areaId: area.id, limit: 100 }),
    projects.listProjects(user.id, { areaId: area.id, limit: 100 }),
    db.task.findMany({
      where: { userId: user.id, areaId: area.id, status: { notIn: ["ARCHIVED", "SKIPPED"] } },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        scheduledFor: true,
        projectId: true,
      },
      orderBy: [{ status: "asc" }, { scheduledFor: "asc" }],
      take: 200,
    }),
    db.habit.findMany({
      where: { userId: user.id, areaId: area.id, archivedAt: null },
      select: {
        id: true,
        name: true,
        frequency: true,
        targetCount: true,
        _count: { select: { logs: true } },
      },
    }),
  ]);

  const [goalProgressMap, projectProgressMap] = await Promise.all([
    goals.computeGoalProgress(
      user.id,
      goalList.map((g) => ({
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
      projectList.map((p) => ({ id: p.id, targetDate: p.targetDate, status: p.status })),
      day,
    ),
  ]);

  const openTasks = taskList.filter(
    (t) => t.status === "INBOX" || t.status === "PLANNED" || t.status === "TODAY",
  );
  const overdueTasks = openTasks.filter(
    (t) => t.scheduledFor && formatCalendarDay(t.scheduledFor) < todayKey,
  );

  return (
    <AppShell
      title={area.name}
      subtitle={area.description ?? `Area - ${formatFullDate(day, user.locale)}`}
      actions={
        <Link
          href="/plan/areas"
          className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-border-strong bg-surface px-2.5 text-xs font-medium text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
        >
          <ArrowLeft size={13} />
          Semua area
        </Link>
      }
    >
      <div className="space-y-5">
        <StatStrip>
          <Stat label="Tujuan" value={goalList.length} />
          <Stat label="Proyek" value={projectList.length} />
          <Stat label="Tugas terbuka" value={openTasks.length} />
          <Stat
            label="Terlewat"
            value={overdueTasks.length}
            tone={overdueTasks.length > 0 ? "negative" : "muted"}
          />
        </StatStrip>

        <Card>
          <CardHeader size="sm" title="Tujuan" />
          <div className="px-4 pb-4">
            {goalList.length === 0 ? (
              <EmptyState
                compact
                title="Belum ada tujuan"
                description={`Tujuan yang memakai area ini akan muncul di sini.`}
              />
            ) : (
              <ul className="space-y-0.5">
                {goalList.map((goal) => {
                  const progress = goalProgressMap.get(goal.id);
                  return (
                    <li key={goal.id}>
                      <Link
                        href={`/plan/goals/${goal.id}`}
                        className="group block rounded-md px-2 py-2.5 transition-colors duration-fast hover:bg-surface-sunken"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm text-ink">{goal.title}</span>
                          <span className="tabular shrink-0 text-xs text-ink-muted">
                            {progress?.percentage === null || progress?.percentage === undefined
                              ? "-"
                              : `${progress.percentage}%`}
                          </span>
                        </div>
                        {progress?.ratio !== null && progress?.ratio !== undefined && (
                          <ProgressBar
                            value={progress.ratio}
                            token={area.colorToken}
                            height={4}
                            className="mt-1.5"
                            label={`Progres ${goal.title}`}
                          />
                        )}
                        {progress?.target !== null && progress?.target !== undefined && (
                          <p className="tabular mt-1 text-micro text-ink-faint">
                            {formatMoneyOrNumber(progress.current, goal.goalType, goal.unit)} dari{" "}
                            {formatMoneyOrNumber(progress.target, goal.goalType, goal.unit)}
                          </p>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader size="sm" title="Proyek" />
          <div className="px-4 pb-4">
            {projectList.length === 0 ? (
              <EmptyState compact title="Belum ada proyek" />
            ) : (
              <ul className="space-y-0.5">
                {projectList.map((project) => {
                  const progress = projectProgressMap.get(project.id);
                  return (
                    <li key={project.id}>
                      <Link
                        href={`/plan/projects/${project.id}`}
                        className="flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors duration-fast hover:bg-surface-sunken"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">
                          {project.title}
                        </span>
                        <span className="tabular shrink-0 text-micro text-ink-faint">
                          {progress?.percentage ?? 0}%
                        </span>
                        <StatusBadge domain="project" value={project.status} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        {overdueTasks.length > 0 && (
          <Card>
            <CardHeader
              size="sm"
              title="Terlewat"
              description={`${overdueTasks.length} tugas melewati jadwalnya`}
            />
            <div className="px-4 pb-4">
              <ul className="space-y-0.5">
                {overdueTasks.map((task) => (
                  <li key={task.id}>
                    <Link
                      href={`/plan/tasks/${task.id}`}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors duration-fast hover:bg-surface-sunken"
                    >
                      <span className="min-w-0 truncate text-sm text-ink">{task.title}</span>
                      <span className="tabular shrink-0 text-micro text-negative">
                        {task.scheduledFor ? formatShortDate(formatCalendarDay(task.scheduledFor)) : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        )}

        {habitList.length > 0 && (
          <Card>
            <CardHeader size="sm" title="Kebiasaan" />
            <div className="px-4 pb-4">
              <ul className="space-y-0.5">
                {habitList.map((habit) => (
                  <li
                    key={habit.id}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-ink">{habit.name}</span>
                    <span className="tabular shrink-0 text-micro text-ink-faint">
                      {habit._count.logs} catatan
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        )}

        <div className="flex items-center gap-2 pt-1">
          <RecordIcon icon={area.iconName} token={area.colorToken} size="sm" />
          <p className="text-micro text-ink-faint">
            Area ini bisa diubah dari halaman{" "}
            <Link href="/plan/areas" className="text-accent underline-offset-4 hover:underline">
              Area
            </Link>
            .
          </p>
        </div>

        <SectionLabel>Total tugas tercatat</SectionLabel>
        <p className="tabular text-sm text-ink-muted">{taskList.length} tugas</p>
      </div>
    </AppShell>
  );
}
