"use client";

import Link from "next/link";
import { CalendarRange, ChevronRight, Flame, Layers, ListTodo, Target, TriangleAlert } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, ColorDot, ProgressBar } from "@/components/ui/indicator";
import { EmptyState } from "@/components/ui/states";
import { Stat, StatStrip } from "@/components/layout/page";
import { StatusBadge } from "@/components/ui/status";
import { RecordIcon } from "@/components/ui/record-icon";
import { cn } from "@/lib/cn";
import { formatMoneyOrNumber } from "@/lib/format";

/**
 * Plan hub.
 *
 * A client component only because it renders interactive links within cards;
 * all data is passed down already computed. Keeping the queries on the server
 * means the numbers are correct on first paint, with no loading flicker.
 */

type AreaItem = {
  id: string;
  name: string;
  colorToken: string;
  iconName: string | null;
  goalCount: number;
  projectCount: number;
  taskCount: number;
};

type GoalItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  areaName: string | null;
  areaToken: string | null;
  percentage: number | null;
  current: number;
  target: number | null;
  unit: string | null;
  goalType: string;
  daysRemaining: number | null;
  isOffTrack: boolean;
};

type ProjectItem = {
  id: string;
  title: string;
  status: string;
  areaName: string | null;
  areaToken: string | null;
  goalTitle: string | null;
  percentage: number;
  basis: string | null;
  totalMilestones: number;
  completedMilestones: number;
  taskCount: number;
  isOverdue: boolean;
};

export function PlanOverview({
  areas,
  goals,
  projects,
  counts,
  weekLoad,
  weekStart,
}: {
  areas: AreaItem[];
  goals: GoalItem[];
  projects: ProjectItem[];
  counts: {
    openTasks: number;
    overdueTasks: number;
    activeGoals: number;
    activeProjects: number;
  };
  weekLoad: Record<string, { open: number; done: number }>;
  weekStart: string;
}) {
  // The busiest day in the coming week tells the user whether this week is
  // realistic. Computed from the same load map the week strip renders.
  const loadValues = Object.values(weekLoad);
  const totalOpenThisWeek = loadValues.reduce((sum, d) => sum + d.open, 0);

  return (
    <div className="space-y-5">
      <StatStrip>
        <Stat label="Tugas terbuka" value={counts.openTasks} />
        <Stat
          label="Terlewat"
          value={counts.overdueTasks}
          tone={counts.overdueTasks > 0 ? "negative" : "muted"}
        />
        <Stat label="Tujuan aktif" value={counts.activeGoals} />
        <Stat label="Proyek aktif" value={counts.activeProjects} />
      </StatStrip>

      {/* Section navigation. Four destinations, matching the hierarchy. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SectionLink
          href="/plan/tasks"
          icon={<ListTodo size={15} />}
          label="Tugas"
          hint={`${counts.openTasks} terbuka`}
        />
        <SectionLink
          href="/plan/goals"
          icon={<Target size={15} />}
          label="Tujuan"
          hint={`${counts.activeGoals} aktif`}
        />
        <SectionLink
          href="/plan/projects"
          icon={<CalendarRange size={15} />}
          label="Proyek"
          hint={`${counts.activeProjects} aktif`}
        />
        <SectionLink
          href="/plan/habits"
          icon={<Flame size={15} />}
          label="Kebiasaan"
          hint="Rutinitas berulang"
        />
        <SectionLink
          href="/plan/areas"
          icon={<Layers size={15} />}
          label="Area"
          hint={`${areas.length} area`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-5">
          {/* Goals: the "why" behind the work. */}
          <Card>
            <CardHeader
              title="Tujuan berjalan"
              description={
                goals.length > 0
                  ? `${goals.length} tujuan sedang dikerjakan`
                  : undefined
              }
              action={
                <Link
                  href="/plan/goals"
                  className="inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:underline"
                >
                  Semua
                  <ChevronRight size={13} />
                </Link>
              }
            />
            <div className="px-5 pb-5">
              {goals.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Target />}
                  title="Belum ada tujuan aktif"
                  description="Tujuan memberi arah pada tugas harian. Mulai dari satu hal yang ingin kamu capai."
                  action={
                    <Link
                      href="/plan/goals"
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      Buat tujuan
                    </Link>
                  }
                />
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {goals.slice(0, 6).map((goal) => (
                    <li key={goal.id}>
                      <Link
                        href={`/plan/goals/${goal.id}`}
                        className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors duration-fast hover:bg-surface-sunken"
                      >
                        <ColorDot token={goal.areaToken} size={7} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-sm text-ink">{goal.title}</span>
                            <span className="tabular shrink-0 text-xs font-medium text-ink-muted">
                              {goal.percentage === null ? "-" : `${goal.percentage}%`}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-3">
                            <ProgressBar
                              value={(goal.percentage ?? 0) / 100}
                              token={goal.areaToken}
                              height={4}
                              className="flex-1"
                            />
                            <span className="tabular shrink-0 text-micro text-ink-faint">
                              {goal.target !== null
                                ? `${formatMoneyOrNumber(goal.current, goal.goalType, goal.unit)} / ${formatMoneyOrNumber(goal.target, goal.goalType, goal.unit)}`
                                : "Selesai / belum"}
                            </span>
                          </div>
                          {(goal.isOffTrack || (goal.daysRemaining !== null && goal.daysRemaining <= 14)) && (
                            <p
                              className={cn(
                                "mt-1.5 flex items-center gap-1 text-micro",
                                goal.isOffTrack ? "text-negative" : "text-warning",
                              )}
                            >
                              {goal.isOffTrack && <TriangleAlert size={11} />}
                              {goal.isOffTrack
                                ? "Laju saat ini belum cukup untuk tepat waktu"
                                : `${goal.daysRemaining} hari lagi`}
                            </p>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {/* Projects: the finite chunks of work. */}
          <Card>
            <CardHeader
              title="Proyek berjalan"
              description={
                projects.length > 0 ? `${projects.length} proyek sedang jalan` : undefined
              }
              action={
                <Link
                  href="/plan/projects"
                  className="inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:underline"
                >
                  Semua
                  <ChevronRight size={13} />
                </Link>
              }
            />
            <div className="px-5 pb-5">
              {projects.length === 0 ? (
                <EmptyState
                  compact
                  icon={<CalendarRange />}
                  title="Belum ada proyek"
                  description="Proyek memecah tujuan besar menjadi pekerjaan yang bisa diselesaikan."
                />
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {projects.slice(0, 6).map((project) => (
                    <li key={project.id}>
                      <Link
                        href={`/plan/projects/${project.id}`}
                        className="group -mx-2 block rounded-md px-2 py-2.5 transition-colors duration-fast hover:bg-surface-sunken"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <ColorDot token={project.areaToken} size={7} />
                            <span className="truncate text-sm text-ink">{project.title}</span>
                          </span>
                          <span className="tabular shrink-0 text-xs font-medium text-ink-muted">
                            {project.percentage}%
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3">
                          <ProgressBar
                            value={project.percentage / 100}
                            token={project.areaToken}
                            height={4}
                            className="flex-1"
                            tone={project.percentage === 100 ? "positive" : "auto"}
                          />
                          <span className="shrink-0 text-micro text-ink-faint">
                            {project.basis === "milestones"
                              ? `${project.completedMilestones}/${project.totalMilestones} milestone`
                              : project.basis === "tasks"
                                ? `${project.taskCount} tugas`
                                : "belum ada isi"}
                          </span>
                        </div>
                        {(project.isOverdue || project.goalTitle) && (
                          <p className="mt-1.5 flex items-center gap-2 text-micro">
                            {project.isOverdue && (
                              <span className="flex items-center gap-1 text-negative">
                                <TriangleAlert size={11} />
                                Melewati tenggat
                              </span>
                            )}
                            {project.goalTitle && (
                              <span className="truncate text-ink-faint">
                                untuk {project.goalTitle}
                              </span>
                            )}
                          </p>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {/* Side column: the week ahead and the area breakdown. */}
        <div className="space-y-5">
          <Card>
            <CardHeader
              size="sm"
              title="Minggu ini"
              description={
                totalOpenThisWeek > 0 ? `${totalOpenThisWeek} tugas terjadwal` : "Belum ada jadwal"
              }
            />
            <div className="px-4 pb-4">
              <WeekStrip weekLoad={weekLoad} weekStart={weekStart} />
            </div>
          </Card>

          <Card>
            <CardHeader size="sm" title="Area hidup" />
            <div className="px-4 pb-4">
              {areas.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Layers />}
                  title="Belum ada area"
                  description="Area mengelompokkan tujuan dan proyek."
                />
              ) : (
                <ul className="space-y-1">
                  {areas.map((area) => (
                    <li key={area.id}>
                      <Link
                        href={`/plan/areas/${area.id}`}
                        className="-mx-1.5 flex items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors duration-fast hover:bg-surface-sunken"
                      >
                        <RecordIcon
                          icon={area.iconName}
                          token={area.colorToken}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">
                          {area.name}
                        </span>
                        <span className="tabular shrink-0 text-micro text-ink-faint">
                          {area.goalCount + area.projectCount}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SectionLink({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-3 transition-colors duration-fast ease-standard hover:border-border-strong hover:bg-surface-sunken"
    >
      <span className="flex items-center gap-2 text-ink-subtle transition-colors duration-fast group-hover:text-accent">
        {icon}
        <span className="text-sm font-medium text-ink">{label}</span>
      </span>
      <span className="text-micro text-ink-faint">{hint}</span>
    </Link>
  );
}

/**
 * Seven-day load strip.
 *
 * Deliberately shows *counts*, not a chart. The useful question is "which day
 * is overloaded", and a number answers it faster than a bar.
 */
function WeekStrip({
  weekLoad,
  weekStart,
}: {
  weekLoad: Record<string, { open: number; done: number }>;
  weekStart: string;
}) {
  const dayLabels = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  const base = new Date(`${weekStart}T00:00:00.000Z`);

  return (
    <ul className="grid grid-cols-7 gap-1">
      {dayLabels.map((label, index) => {
        const date = new Date(base.getTime() + index * 86_400_000);
        const key = date.toISOString().slice(0, 10);
        const load = weekLoad[key] ?? { open: 0, done: 0 };
        const total = load.open + load.done;

        return (
          <li key={key} className="flex flex-col items-center gap-1">
            <span className="text-micro text-ink-faint">{label}</span>
            <span
              className={cn(
                "tabular flex size-7 items-center justify-center rounded-md text-xs font-medium",
                total === 0
                  ? "text-ink-faint"
                  : load.open === 0
                    ? "bg-positive-soft text-positive"
                    : load.open >= 5
                      ? "bg-negative-soft text-negative"
                      : "bg-surface-sunken text-ink",
              )}
              title={`${date.getUTCDate()}: ${load.done} selesai, ${load.open} terbuka`}
            >
              {total === 0 ? "\u00b7" : total}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// Kept local so the client bundle does not import the status module twice.
export { Badge, StatusBadge };
