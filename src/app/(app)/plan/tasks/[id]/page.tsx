import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { Card, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { today, formatCalendarDay } from "@/lib/date";
import * as areas from "@/domains/plan/areas";
import * as projects from "@/domains/plan/projects";
import * as goals from "@/domains/plan/goals";
import { TaskEditForm } from "./task-edit-form";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const task = await db.task.findFirst({ where: { id, userId: user.id }, select: { title: true } });
  return { title: task?.title ?? "Tugas" };
}

/**
 * Task detail.
 *
 * The place to change everything about a task. Kept separate from the list so
 * editing never reflows the surrounding rows.
 */
export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const day = today(user.timeZone);

  const task = await db.task
    .findFirst({
      where: { id, userId: user.id },
      include: {
        area: { select: { id: true, name: true, colorToken: true, iconName: true } },
        goal: { select: { id: true, title: true } },
        project: { select: { id: true, title: true, status: true } },
        milestone: { select: { id: true, title: true, projectId: true } },
      },
    })
    .catch(() => null);

  if (!task) notFound();

  const [areaList, projectList, goalList] = await Promise.all([
    areas.listAreas(user.id),
    projects.listProjects(user.id, { status: ["PLANNED", "ACTIVE", "PAUSED"] }),
    goals.listGoals(user.id, { status: ["PLANNED", "ACTIVE"] }),
  ]);

  return (
    <AppShell
      title={task.title}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {task.project && <span>{task.project.title}</span>}
          {task.milestone && <span>{task.milestone.title}</span>}
          {task.goal && <span>{task.goal.title}</span>}
          {task.area && <span>{task.area.name}</span>}
        </span>
      }
      actions={
        <Link
          href="/plan/tasks"
          className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-border-strong bg-surface px-2.5 text-xs font-medium text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
        >
          <ArrowLeft size={13} />
          Semua tugas
        </Link>
      }
    >
      <div className="space-y-5">
        <Card>
          <CardHeader size="sm" title="Detail tugas" />
          <div className="px-5 pb-5">
            <TaskEditForm
              task={{
                id: task.id,
                title: task.title,
                description: task.description ?? "",
                notes: task.notes ?? "",
                status: task.status,
                priority: task.priority,
                scheduledFor: task.scheduledFor ? formatCalendarDay(task.scheduledFor) : "",
                dueDate: task.dueDate ? formatCalendarDay(task.dueDate) : "",
                estimatedMinutes: task.estimatedMinutes === null ? "" : String(task.estimatedMinutes),
                areaId: task.areaId ?? "",
                goalId: task.goalId ?? "",
                projectId: task.projectId ?? "",
                milestoneId: task.milestoneId ?? "",
                completedAt: task.completedAt?.toISOString() ?? null,
                createdAt: task.createdAt.toISOString(),
              }}
              areas={areaList.map((a) => ({ id: a.id, name: a.name }))}
              projects={projectList.map((p) => ({ id: p.id, title: p.title }))}
              goals={goalList.map((g) => ({ id: g.id, title: g.title }))}
              todayKey={formatCalendarDay(day)}
            />
          </div>
        </Card>

        {/* Provenance: every task records when it was created and finished. */}
        <Card>
          <CardHeader size="sm" title="Riwayat" />
          <dl className="space-y-2 px-5 pb-5 text-xs">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-faint">Dibuat</dt>
              <dd className="tabular text-ink-muted">
                {new Intl.DateTimeFormat(user.locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: user.timeZone,
                }).format(task.createdAt)}
              </dd>
            </div>
            {task.completedAt && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-faint">Diselesaikan</dt>
                <dd className="tabular text-positive">
                  {new Intl.DateTimeFormat(user.locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: user.timeZone,
                  }).format(task.completedAt)}
                </dd>
              </div>
            )}
            {task.skippedAt && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-faint">Dilewati</dt>
                <dd className="tabular text-warning">
                  {new Intl.DateTimeFormat(user.locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: user.timeZone,
                  }).format(task.skippedAt)}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      </div>
    </AppShell>
  );
}
