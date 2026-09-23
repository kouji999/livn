import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Circle } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status";
import { ProgressBar } from "@/components/ui/indicator";
import { Stat, StatStrip } from "@/components/layout/page";
import { db } from "@/lib/db";
import { today, formatDayAndMonth, formatCalendarDay } from "@/lib/date";
import * as projects from "@/domains/plan/projects";
import { formatShortDate } from "@/lib/format";
import { MilestoneList } from "./milestone-list";
import { ProjectEditForm } from "./project-edit-form";
import { TaskQuickAdd } from "./task-quick-add";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await db.project.findFirst({
    where: { id, userId: user.id },
    select: { title: true },
  });
  return { title: project?.title ?? "Proyek" };
}

/**
 * Project detail.
 *
 * Aimed at the one question a project page must answer: what is left to do.
 * Milestones come first because they are the coarser unit; tasks follow, with
 * anything overdue surfaced at the top.
 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const day = today(user.timeZone);
  const todayKey = formatCalendarDay(day);

  const project = await db.project
    .findFirst({
      where: { id, userId: user.id },
      include: {
        area: { select: { id: true, name: true, colorToken: true, iconName: true } },
        goal: { select: { id: true, title: true } },
      },
    })
    .catch(() => null);

  if (!project) notFound();

  const [progress, milestones, tasks, areaList, goalList] = await Promise.all([
    projects
      .computeProjectProgress(
        user.id,
        [{ id: project.id, targetDate: project.targetDate, status: project.status }],
        day,
      )
      .then((map) => map.get(project.id)),
    db.milestone.findMany({
      where: { userId: user.id, projectId: project.id },
      include: { _count: { select: { tasks: true } } },
      orderBy: [{ position: "asc" }, { dueDate: "asc" }],
    }),
    db.task.findMany({
      where: { userId: user.id, projectId: project.id, status: { not: "ARCHIVED" } },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        scheduledFor: true,
        milestoneId: true,
      },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { scheduledFor: "asc" }],
    }),
    db.area.findMany({
      where: { userId: user.id, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { position: "asc" },
    }),
    db.goal.findMany({
      where: { userId: user.id, status: { in: ["PLANNED", "ACTIVE"] } },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const overdue = tasks.filter(
    (t) =>
      t.scheduledFor &&
      formatCalendarDay(t.scheduledFor) < todayKey &&
      (t.status === "PLANNED" || t.status === "TODAY"),
  );
  const openTasks = tasks.filter(
    (t) => t.status === "INBOX" || t.status === "PLANNED" || t.status === "TODAY",
  );
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED");

  return (
    <AppShell
      title={project.title}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {project.goal && <span>untuk {project.goal.title}</span>}
          {project.area && <span>{project.area.name}</span>}
          {project.targetDate && <span>Target {formatDayAndMonth(project.targetDate, user.locale)}</span>}
        </span>
      }
      actions={
        <Link
          href="/plan/projects"
          className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-border-strong bg-surface px-2.5 text-xs font-medium text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
        >
          <ArrowLeft size={13} />
          Semua proyek
        </Link>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <StatusBadge domain="project" value={project.status} />
          {progress?.isOverdue && (
            <span className="text-xs font-medium text-negative">Melewati tenggat</span>
          )}
        </div>

        <StatStrip>
          <Stat label="Progres" value={`${progress?.percentage ?? 0}%`} />
          <Stat label="Milestone" value={`${progress?.completedMilestones ?? 0}/${progress?.totalMilestones ?? 0}`} />
          <Stat label="Tugas selesai" value={completedTasks.length} tone="positive" />
          <Stat
            label="Tugas terbuka"
            value={openTasks.length}
            tone={openTasks.length > 5 ? "negative" : "default"}
          />
        </StatStrip>

        <Card className="px-5 py-4">
          <div className="flex items-center gap-3">
            <ProgressBar
              value={(progress?.percentage ?? 0) / 100}
              token={project.area?.colorToken}
              height={8}
              className="flex-1"
              tone={progress?.percentage === 100 ? "positive" : "auto"}
              label={`Progres ${project.title}`}
            />
            <span className="tabular text-sm font-semibold text-ink">
              {progress?.percentage ?? 0}%
            </span>
          </div>
          <p className="mt-2 text-micro text-ink-faint">
            {progress?.basis === "milestones"
              ? "Dihitung dari milestone, karena proyek ini punya milestone."
              : progress?.basis === "tasks"
                ? "Dihitung dari tugas, karena belum ada milestone."
                : "Belum ada milestone atau tugas, jadi progres masih 0%."}
          </p>
        </Card>

        {project.description && (
          <Card className="px-5 py-4">
            <p className="text-sm leading-relaxed text-ink-muted">{project.description}</p>
          </Card>
        )}

        <Card>
          <CardHeader size="sm" title="Milestone" description="Tahapan besar menuju selesai" />
          <div className="px-4 pb-4">
            <MilestoneList
              projectId={project.id}
              milestones={milestones.map((m) => ({
                id: m.id,
                title: m.title,
                description: m.description,
                dueDate: m.dueDate ? formatCalendarDay(m.dueDate) : null,
                completedAt: m.completedAt?.toISOString() ?? null,
                taskCount: m._count.tasks,
              }))}
              todayKey={todayKey}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            size="sm"
            title="Tugas"
            description={
              overdue.length > 0
                ? `${overdue.length} terlewat dari ${openTasks.length} yang terbuka`
                : `${openTasks.length} terbuka, ${completedTasks.length} selesai`
            }
          />
          <div className="px-4 pb-4 space-y-3">
            <TaskQuickAdd projectId={project.id} />

            {tasks.length === 0 ? (
              <EmptyState
                compact
                title="Belum ada tugas"
                description="Progres proyek dihitung dari tugasku, jadi tambahkan langkah pertamanya."
              />
            ) : (
              <ul className="space-y-0.5">
                {/* Overdue first: the thing most likely to be forgotten. */}
                {[...overdue, ...openTasks.filter((t) => !overdue.includes(t)), ...completedTasks].map(
                  (task) => (
                    <li key={task.id}>
                      <Link
                        href={`/plan/tasks/${task.id}`}
                        className="group flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors duration-fast hover:bg-surface-sunken"
                      >
                        <span className="mt-0.5 shrink-0 text-ink-faint">
                          {task.status === "COMPLETED" ? (
                            <Check size={14} className="text-positive" strokeWidth={2.5} />
                          ) : (
                            <Circle size={14} strokeWidth={1.5} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={
                              task.status === "COMPLETED"
                                ? "block truncate text-sm text-ink-faint line-through"
                                : "block truncate text-sm text-ink"
                            }
                          >
                            {task.title}
                          </span>
                          {task.scheduledFor && task.status !== "COMPLETED" && (
                            <span
                              className={
                                formatCalendarDay(task.scheduledFor) < todayKey
                                  ? "mt-0.5 block text-micro text-negative"
                                  : "mt-0.5 block text-micro text-ink-faint"
                              }
                            >
                              {formatShortDate(formatCalendarDay(task.scheduledFor))}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader size="sm" title="Ubah proyek" />
          <div className="px-5 pb-5">
            <ProjectEditForm
              project={{
                id: project.id,
                title: project.title,
                description: project.description ?? "",
                status: project.status,
                areaId: project.areaId ?? "",
                goalId: project.goalId ?? "",
                startDate: project.startDate ? formatCalendarDay(project.startDate) : "",
                targetDate: project.targetDate ? formatCalendarDay(project.targetDate) : "",
              }}
              areas={areaList}
              goals={goalList}
            />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
