import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status";
import { RecordIcon } from "@/components/ui/record-icon";
import { ProgressBar } from "@/components/ui/indicator";
import { Stat, StatStrip } from "@/components/layout/page";
import { db } from "@/lib/db";
import { today, formatCalendarDay, formatDayAndMonth } from "@/lib/date";
import * as goals from "@/domains/plan/goals";
import { formatMoneyOrNumber, formatPlainNumber } from "@/lib/format";
import { GoalEditForm } from "./goal-edit-form";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const goal = await db.goal.findFirst({ where: { id, userId: user.id }, select: { title: true } });
  return { title: goal?.title ?? "Tujuan" };
}

/**
 * Goal detail.
 *
 * Shows one goal's measured reality: where it stands, what pace is required,
 * and exactly which records feed it. For a derived goal the contributing
 * tasks and habit logs are listed, so the number is never unexplained.
 */
export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const day = today(user.timeZone);

  const goal = await db.goal
    .findFirst({
      where: { id, userId: user.id },
      include: {
        area: { select: { id: true, name: true, colorToken: true, iconName: true } },
        projects: {
          select: { id: true, title: true, status: true, targetDate: true },
          orderBy: { createdAt: "desc" },
        },
      },
    })
    .catch(() => null);

  if (!goal) notFound();

  const [progress, linkedTasks, linkedHabits, areaOptions] = await Promise.all([
    goals.getGoalProgress(user.id, goal.id, user.timeZone),
    db.task.findMany({
      where: { userId: user.id, goalId: goal.id },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        scheduledFor: true,
        completedAt: true,
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 50,
    }),
    db.habit.findMany({
      where: { userId: user.id, goalId: goal.id, archivedAt: null },
      select: {
        id: true,
        name: true,
        frequency: true,
        targetCount: true,
        _count: { select: { logs: true } },
      },
    }),
    db.area.findMany({
      where: { userId: user.id, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { position: "asc" },
    }),
  ]);

  const completedTasks = linkedTasks.filter((t) => t.status === "COMPLETED").length;
  const openTasks = linkedTasks.filter(
    (t) => t.status === "INBOX" || t.status === "PLANNED" || t.status === "TODAY",
  ).length;

  return (
    <AppShell
      title={goal.title}
      subtitle={
        <span className="flex items-center gap-2">
          {goal.area && (
            <span className="inline-flex items-center gap-1">
              <RecordIcon icon={goal.area.iconName} token={goal.area.colorToken} size="sm" className="size-4" />
              {goal.area.name}
            </span>
          )}
          <span>
            {goal.targetDate
              ? `Target ${formatDayAndMonth(goal.targetDate, user.locale)}`
              : "Tanpa tenggat"}
          </span>
        </span>
      }
      actions={
        <Link
          href="/plan/goals"
          className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-border-strong bg-surface px-2.5 text-xs font-medium text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
        >
          <ArrowLeft size={13} />
          Semua tujuan
        </Link>
      }
    >
      <div className="space-y-5">
        {/* The measured state of the goal, first. */}
        <StatStrip>
          <Stat
            label="Progres"
            value={progress.percentage === null ? "-" : `${progress.percentage}%`}
            tone={progress.isComplete ? "positive" : "default"}
          />
          <Stat
            label="Sekarang"
            value={formatMoneyOrNumber(progress.current, goal.goalType, goal.unit)}
          />
          <Stat
            label="Target"
            value={
              progress.target === null
                ? "Selesai / belum"
                : formatMoneyOrNumber(progress.target, goal.goalType, goal.unit)
            }
          />
          <Stat
            label={progress.daysRemaining !== null && progress.daysRemaining < 0 ? "Lewat tenggat" : "Sisa hari"}
            value={
              progress.daysRemaining === null
                ? "-"
                : progress.daysRemaining < 0
                  ? `${Math.abs(progress.daysRemaining)}`
                  : `${progress.daysRemaining}`
            }
            tone={progress.daysRemaining !== null && progress.daysRemaining < 0 ? "negative" : "muted"}
          />
        </StatStrip>

        {progress.ratio !== null && (
          <Card className="px-5 py-4">
            <div className="flex items-center gap-3">
              <ProgressBar
                value={progress.ratio}
                token={goal.area?.colorToken}
                height={8}
                className="flex-1"
                tone={progress.isComplete ? "positive" : "auto"}
                label={`Progres ${goal.title}`}
              />
              <span className="tabular text-sm font-semibold text-ink">
                {progress.percentage}%
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
              {progress.velocityPerDay !== null && progress.velocityPerDay > 0 && (
                <div>
                  <dt className="text-ink-faint">Laju saat ini</dt>
                  <dd className="tabular mt-0.5 text-ink">
                    {formatPlainNumber(progress.velocityPerDay)} / hari
                  </dd>
                </div>
              )}
              {progress.requiredPerDay !== null && (
                <div>
                  <dt className="text-ink-faint">Dibutuhkan</dt>
                  <dd
                    className={
                      progress.isOffTrack
                        ? "tabular mt-0.5 font-medium text-negative"
                        : "tabular mt-0.5 text-ink"
                    }
                  >
                    {formatPlainNumber(progress.requiredPerDay)} / hari
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-ink-faint">Cara ukur</dt>
                <dd className="mt-0.5 text-ink">
                  {goal.isDerived ? "Otomatis dari data terkait" : "Diisi manual"}
                </dd>
              </div>
            </dl>

            {progress.isOffTrack && (
              <p className="mt-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-ink">
                Dengan laju sekarang, target ini kemungkinan tidak tercapai tepat waktu.
                Perlu sekitar {formatPlainNumber(progress.requiredPerDay ?? 0)} per hari.
              </p>
            )}
          </Card>
        )}

        {goal.description && (
          <Card className="px-5 py-4">
            <p className="text-sm leading-relaxed text-ink-muted">{goal.description}</p>
          </Card>
        )}

        {/* Contributing records, so the number above is always traceable. */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              size="sm"
              title="Tugas terkait"
              description={
                linkedTasks.length > 0
                  ? `${completedTasks} selesai, ${openTasks} terbuka`
                  : undefined
              }
            />
            <div className="px-4 pb-4">
              {linkedTasks.length === 0 ? (
                <EmptyState
                  compact
                  title="Belum ada tugas"
                  description="Tugas yang dikaitkan ke tujuan ini akan muncul di sini dan ikut menghitung progres."
                />
              ) : (
                <ul className="space-y-1">
                  {linkedTasks.slice(0, 12).map((task) => (
                    <li key={task.id}>
                      <Link
                        href={`/plan/tasks/${task.id}`}
                        className="-mx-1.5 flex items-start gap-2.5 rounded-md px-1.5 py-1.5 transition-colors duration-fast hover:bg-surface-sunken"
                      >
                        <span
                          aria-hidden
                          className={
                            task.status === "COMPLETED"
                              ? "mt-1.5 size-1.5 shrink-0 rounded-full bg-positive"
                              : "mt-1.5 size-1.5 shrink-0 rounded-full border border-border-strong"
                          }
                        />
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
                          {task.scheduledFor && (
                            <span className="mt-0.5 block text-micro text-ink-faint">
                              {formatDayAndMonth(task.scheduledFor, user.locale)}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {linkedTasks.length > 12 && (
                    <li className="px-1.5 pt-1 text-micro text-ink-faint">
                      +{linkedTasks.length - 12} tugas lainnya
                    </li>
                  )}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              size="sm"
              title="Kebiasaan terkait"
              description={
                linkedHabits.length > 0 ? `${linkedHabits.length} kebiasaan` : undefined
              }
            />
            <div className="px-4 pb-4">
              {linkedHabits.length === 0 ? (
                <EmptyState
                  compact
                  title="Belum ada kebiasaan"
                  description="Kebiasaan yang dikaitkan akan menambah progres setiap kali kamu mencentangnya."
                />
              ) : (
                <ul className="space-y-1">
                  {linkedHabits.map((habit) => (
                    <li
                      key={habit.id}
                      className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1.5"
                    >
                      <span className="min-w-0 truncate text-sm text-ink">{habit.name}</span>
                      <span className="tabular shrink-0 text-micro text-ink-faint">
                        {habit._count.logs} catatan
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {goal.projects.length > 0 && (
          <Card>
            <CardHeader size="sm" title="Proyek terkait" />
            <div className="px-4 pb-4">
              <ul className="space-y-1">
                {goal.projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/plan/projects/${project.id}`}
                      className="-mx-1.5 flex items-center justify-between gap-3 rounded-md px-1.5 py-1.5 transition-colors duration-fast hover:bg-surface-sunken"
                    >
                      <span className="min-w-0 truncate text-sm text-ink">{project.title}</span>
                      <StatusBadge domain="project" value={project.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        )}

        {/* Editing is last: the page is for reading, the form is for changing. */}
        <Card>
          <CardHeader size="sm" title="Ubah tujuan" />
          <div className="px-5 pb-5">
            <GoalEditForm
              goal={{
                id: goal.id,
                title: goal.title,
                description: goal.description ?? "",
                areaId: goal.areaId ?? "",
                goalType: goal.goalType,
                targetValue: goal.targetValue === null ? "" : String(Number(goal.targetValue)),
                currentValue: String(Number(goal.currentValue)),
                unit: goal.unit ?? "",
                priority: goal.priority,
                status: goal.status,
                startDate: goal.startDate ? formatCalendarDay(goal.startDate) : "",
                targetDate: goal.targetDate ? formatCalendarDay(goal.targetDate) : "",
                isDerived: goal.isDerived,
              }}
              areas={areaOptions}
              todayKey={formatCalendarDay(day)}
            />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
