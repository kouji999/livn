"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Flame, ListTodo, Target, TriangleAlert } from "lucide-react";
import { Card, CardHeader, SectionLabel } from "@/components/ui/card";
import { Badge, ProgressBar } from "@/components/ui/indicator";
import { EmptyState } from "@/components/ui/states";
import { Stat, StatStrip } from "@/components/layout/page";
import { StatusBadge } from "@/components/ui/status";
import { ChartTooltipProvider } from "@/components/charts/chart-tooltip";
import { BarChart, PairedBarChart, RankedBar, ShareBar } from "@/components/charts";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { formatMoneyOrNumber, formatPlainNumber, formatShortDate } from "@/lib/format";

/**
 * Progress.
 *
 * Structure follows the questions a person asks about their own performance,
 * in order: am I executing, what am I maintaining, where is my money, and what
 * am I building toward. Each section reports its own numbers and none of them
 * claims to be a single life score.
 *
 * Every figure is labelled by kind — measured, calculated, or user-written — so
 * nothing computed is presented as though it were observed.
 */

const RANGES = [
  { value: "day", label: "Hari ini" },
  { value: "week", label: "Minggu" },
  { value: "month", label: "Bulan" },
  { value: "year", label: "Tahun" },
];

type RangeKind = "day" | "week" | "month" | "year";

export function ProgressView({
  currency,
  rangeKind,
  rangeLabel,
  summary,
  comparison,
  series,
  goals,
  goalMetrics,
  projects,
}: {
  currency: string;
  rangeKind: RangeKind;
  rangeLabel: string;
  summary: {
    executionScore: number;
    tasks: {
      planned: number;
      completed: number;
      skipped: number;
      stillOpen: number;
      completionRate: number;
      perDay: number;
      carriedOver: number;
    };
    habits: {
      habitsTracked: number;
      averageConsistency: number;
      sessions: number;
      achievedSessions: number;
      dueOpportunities: number;
      strongHabits: number;
      weakest: Array<{ habitId: string; name: string; rate: number }>;
      strongest: Array<{ habitId: string; name: string; rate: number }>;
    };
    money: {
      income: string;
      expense: string;
      net: string;
      savingsRate: number | null;
      activeDays: number;
      averageDailyExpense: string;
      largestExpense: string;
      topCategories: Array<{
        categoryId: string | null;
        name: string;
        colorToken: string;
        iconName: string | null;
        total: string;
        share: number;
      }>;
    };
    journal: {
      entries: number;
      perDay: number;
      averageMood: number | null;
      averageEnergy: number | null;
      averageFocus: number | null;
      withMood: number;
      topTags: Array<{ name: string; count: number }>;
    };
  };
  comparison: { current: number; previous: number; delta: number };
  series: Array<{
    date: string;
    tasksCompleted: number;
    habitSessions: number;
    income: string;
    expense: string;
    journaled: boolean;
  }>;
  goals: Array<{
    id: string;
    title: string;
    status: string;
    percentage: number | null;
    current: number;
    target: number | null;
    goalType: string;
    unit: string | null;
    daysRemaining: number | null;
    isOffTrack: boolean;
    requiredPerDay: number | null;
    velocityPerDay: number | null;
    areaToken: string | null;
  }>;
  goalMetrics: {
    active: number;
    achievedInPeriod: number;
    averageProgress: number;
    dueInPeriod: number;
    offTrack: Array<{ goalId: string; title: string; requiredPerDay: number; velocityPerDay: number }>;
  };
  projects: Array<{
    id: string;
    title: string;
    status: string;
    percentage: number;
    basis: string | null;
    totalMilestones: number;
    completedMilestones: number;
    taskCount: number;
    isOverdue: boolean;
    areaToken: string | null;
  }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<"none" | "goals" | "projects">("goals");

  const income = BigInt(summary.money.income);
  const expense = BigInt(summary.money.expense);
  const net = BigInt(summary.money.net);

  function setRange(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "month") next.delete("range");
    else next.set("range", value);
    startTransition(() => {
      router.replace(`/progress${next.size ? `?${next.toString()}` : ""}`, { scroll: false });
    });
  }

  // The chart series is labelled by day, or by month when the window is a year.
  const taskSeries = useMemo(
    () =>
      series.map((point) => ({
        label: formatShortDate(point.date),
        value: point.tasksCompleted,
      })),
    [series],
  );

  const habitSeries = useMemo(
    () =>
      series.map((point) => ({
        label: formatShortDate(point.date),
        value: point.habitSessions,
      })),
    [series],
  );

  const moneySeries = useMemo(
    () =>
      series.map((point) => ({
        label: formatShortDate(point.date),
        positive: Number(BigInt(point.income)),
        negative: Number(BigInt(point.expense)),
      })),
    [series],
  );

  /*
   * Axis ticks.
   *
   * With more than a fortnight plotted, a bar cannot be identified by its own
   * label without overlap, so four evenly spaced dates are given instead. The
   * first and last are always included, since those are the two a reader looks
   * for first when orienting on a time axis.
   */
  const axisTicks = useMemo(() => {
    if (series.length <= 14 || series.length < 4) return undefined;
    const at = (ratio: number) =>
      formatShortDate(series[Math.round((series.length - 1) * ratio)].date);
    return [at(0), at(1 / 3), at(2 / 3), at(1)];
  }, [series]);

  const journaledDays = series.filter((point) => point.journaled).length;
  const taskMax = Math.max(...taskSeries.map((d) => d.value), 0);

  return (
    <div className={cn("space-y-5", pending && "opacity-70")}>
      {/* — Range selector — */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1" role="tablist" aria-label="Rentang waktu">
          {RANGES.map((range) => {
            const active = rangeKind === range.value;
            return (
              <button
                key={range.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setRange(range.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-fast",
                  active
                    ? "bg-surface-sunken text-ink"
                    : "text-ink-subtle hover:bg-surface-sunken hover:text-ink",
                )}
              >
                {range.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-ink-subtle">{rangeLabel}</p>
      </div>

      {/* — Headline — */}
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-micro font-medium uppercase tracking-[0.08em] text-ink-faint">
              Eksekusi
            </p>
            <p className="tabular mt-1 text-3xl font-semibold tracking-tight text-ink">
              {Math.round(summary.executionScore * 100)}%
            </p>
            <p className="mt-1 max-w-[46ch] text-xs leading-relaxed text-ink-subtle">
              Rata-rata dari tingkat penyelesaian tugas dan konsistensi kebiasaan.
              Bukan nilai hidup secara keseluruhan — hanya dua hal yang bisa kamu
              kendalikan hari ini.
            </p>
          </div>

          <div className="text-right">
            <p className="text-micro text-ink-faint">Dibanding periode sebelumnya</p>
            <p
              className={cn(
                "tabular mt-1 text-lg font-semibold",
                comparison.delta > 0.01
                  ? "text-positive"
                  : comparison.delta < -0.01
                    ? "text-negative"
                    : "text-ink-muted",
              )}
            >
              {comparison.delta > 0 ? "+" : ""}
              {Math.round(comparison.delta * 100)} poin
            </p>
            <p className="tabular mt-0.5 text-micro text-ink-faint">
              {Math.round(comparison.previous * 100)}% lalu
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2.5 border-t border-border-subtle pt-3">
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-ink-subtle">Tugas</span>
            <ProgressBar
              value={summary.tasks.completionRate}
              height={5}
              className="flex-1"
              label="Tingkat penyelesaian tugas"
            />
            <span className="tabular w-10 shrink-0 text-right text-xs font-medium text-ink">
              {Math.round(summary.tasks.completionRate * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-ink-subtle">Kebiasaan</span>
            <ProgressBar
              value={summary.habits.averageConsistency}
              height={5}
              className="flex-1"
              label="Konsistensi kebiasaan"
            />
            <span className="tabular w-10 shrink-0 text-right text-xs font-medium text-ink">
              {Math.round(summary.habits.averageConsistency * 100)}%
            </span>
          </div>
        </div>
      </Card>

      {/* — Execution — */}
      <section>
        <SectionLabel className="mb-2">Eksekusi tugas</SectionLabel>
        <StatStrip>
          <Stat label="Direncanakan" value={summary.tasks.planned} />
          <Stat label="Selesai" value={summary.tasks.completed} tone="positive" />
          <Stat
            label="Dilewati"
            value={summary.tasks.skipped}
            tone={summary.tasks.skipped > 0 ? "negative" : "muted"}
          />
          <Stat
            label="Masih terbuka"
            value={summary.tasks.stillOpen}
            tone={summary.tasks.stillOpen > 0 ? "default" : "muted"}
          />
        </StatStrip>

        {summary.tasks.carriedOver > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-micro text-ink-subtle">
            <ListTodo size={11} />
            {summary.tasks.carriedOver} tugas dari periode sebelumnya ikut diselesaikan
            di periode ini, dan tetap dihitung pada periode asalnya.
          </p>
        )}

        <Card className="mt-3">
          <CardHeader
            size="sm"
            title="Tugas selesai per hari"
            description={
              taskMax > 0
                ? `Tertinggi ${taskMax} dalam sehari`
                : undefined
            }
          />
          <div className="px-4 pb-4">
            <ChartTooltipProvider>
              <BarChart
                data={taskSeries}
                token="accent"
                valueFormatter={(v) => `${v} tugas`}
                emptyLabel="Belum ada tugas diselesaikan pada rentang ini"
                ticks={axisTicks}
              />
            </ChartTooltipProvider>
          </div>
        </Card>
      </section>

      {/* — Habits — */}
      <section>
        <SectionLabel className="mb-2">Kebiasaan</SectionLabel>

        {summary.habits.habitsTracked === 0 ? (
          <Card>
            <EmptyState
              compact
              icon={<Flame />}
              title="Belum ada kebiasaan aktif"
              description="Konsistensi diukur dari kebiasaan yang kamu lacak."
              action={
                <Link href="/plan/habits" className="text-sm font-medium text-accent hover:underline">
                  Buat kebiasaan
                </Link>
              }
            />
          </Card>
        ) : (
          <>
            <StatStrip>
              <Stat label="Dilacak" value={summary.habits.habitsTracked} />
              <Stat
                label="Konsistensi"
                value={`${Math.round(summary.habits.averageConsistency * 100)}%`}
                tone={summary.habits.averageConsistency >= 0.8 ? "positive" : "default"}
              />
              <Stat label="Sesi tercatat" value={summary.habits.sessions} />
              <Stat
                label="Kebiasaan kuat"
                value={`${summary.habits.strongHabits}/${summary.habits.habitsTracked}`}
                hint="Konsistensi 80% atau lebih"
              />
            </StatStrip>

            <Card className="mt-3">
              <CardHeader
                size="sm"
                title="Sesi per hari"
                description="Setiap centang kebiasaan dihitung satu sesi"
              />
              <div className="px-4 pb-4">
                <ChartTooltipProvider>
                  <BarChart
                    data={habitSeries}
                    token="positive"
                    valueFormatter={(v) => `${v} sesi`}
                    emptyLabel="Belum ada sesi kebiasaan pada rentang ini"
                    ticks={axisTicks}
                  />
                </ChartTooltipProvider>
              </div>
            </Card>

            {/* Consistency is the headline; the best and worst habits explain it. */}
            {(summary.habits.weakest.length > 0 || summary.habits.strongest.length > 0) && (
              <Card className="mt-3">
                <CardHeader
                  size="sm"
                  title="Yang paling dan paling kurang konsisten"
                  description="Konsistensi diukur dari berapa kali kebiasaan benar-benar dilakukan dibanding berapa kali seharusnya"
                />
                <div className="grid grid-cols-1 gap-4 px-4 pb-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-micro font-medium uppercase tracking-[0.08em] text-ink-faint">
                      Paling kuat
                    </p>
                    <ul className="space-y-3">
                      {summary.habits.strongest.map((habit) => (
                        <li key={habit.habitId}>
                          <RankedBar
                            label={habit.name}
                            value={habit.rate}
                            max={1}
                            displayValue={`${Math.round(habit.rate * 100)}%`}
                            token="positive"
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-micro font-medium uppercase tracking-[0.08em] text-ink-faint">
                      Perlu perhatian
                    </p>
                    <ul className="space-y-3">
                      {summary.habits.weakest.map((habit) => (
                        <li key={habit.habitId}>
                          <RankedBar
                            label={habit.name}
                            value={habit.rate}
                            max={1}
                            displayValue={`${Math.round(habit.rate * 100)}%`}
                            token={habit.rate >= 0.5 ? "warning" : "negative"}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            )}
          </>
        )}
      </section>

      {/* — Money — */}
      <section>
        <SectionLabel className="mb-2">Uang</SectionLabel>
        <StatStrip>
          <Stat label="Masuk" value={formatMoney(income, currency)} tone="positive" />
          <Stat label="Keluar" value={formatMoney(expense, currency)} tone="negative" />
          <Stat
            label="Selisih"
            value={formatMoney(net, currency, { showSign: true })}
            tone={net >= 0n ? "positive" : "negative"}
          />
          <Stat
            label="Tingkat menabung"
            value={summary.money.savingsRate === null ? "-" : `${Math.round(summary.money.savingsRate * 100)}%`}
            hint="Bagian pemasukan yang tersisa"
            tone="muted"
          />
        </StatStrip>

        <Card className="mt-3">
          <CardHeader
            size="sm"
            title="Masuk dan keluar per hari"
            description="Transfer antar akun sendiri tidak dihitung"
          />
          <div className="px-4 pb-4">
            <ChartTooltipProvider>
              <PairedBarChart
                data={moneySeries}
                formatValue={(v) => formatMoney(BigInt(Math.round(v)), currency)}
              />
            </ChartTooltipProvider>
          </div>
        </Card>

        {summary.money.topCategories.length > 0 && (
          <Card className="mt-3">
            <CardHeader
              size="sm"
              title="Ke mana uangnya pergi"
              description={`${summary.money.activeDays} hari ada pergerakan, rata-rata ${formatMoney(BigInt(summary.money.averageDailyExpense), currency)} per hari aktif`}
            />
            <div className="px-4 pb-4">
              {/* Composition first: the question is "what share", and a bar
                  answers it before any number is read. */}
              <ShareBar
                segments={summary.money.topCategories.map((c) => ({
                  label: c.name,
                  value: Number(BigInt(c.total)),
                  token: c.colorToken,
                }))}
                className="mb-4"
              />

              <ul className="space-y-3">
                {summary.money.topCategories.map((category) => (
                  <li key={category.categoryId ?? "none"}>
                    <RankedBar
                      label={category.name}
                      value={Number(BigInt(category.total))}
                      max={Number(BigInt(summary.money.topCategories[0].total))}
                      displayValue={`${formatMoney(BigInt(category.total), currency)} - ${Math.round(category.share * 100)}%`}
                      token={category.colorToken}
                    />
                  </li>
                ))}
              </ul>

              {BigInt(summary.money.largestExpense) > 0n && (
                <p className="mt-4 border-t border-border-subtle pt-3 text-micro text-ink-faint">
                  Pengeluaran terbesar: {formatMoney(BigInt(summary.money.largestExpense), currency)}
                </p>
              )}
            </div>
          </Card>
        )}
      </section>

      {/* — Journal — */}
      <section>
        <SectionLabel className="mb-2">Jurnal</SectionLabel>
        <StatStrip>
          <Stat label="Catatan" value={summary.journal.entries} />
          <Stat
            label="Hari tercatat"
            value={`${journaledDays}/${series.length}`}
            hint="Pada rentang ini"
          />
          <Stat
            label="Rata-rata mood"
            value={summary.journal.averageMood === null ? "-" : `${summary.journal.averageMood}/10`}
            hint={
              summary.journal.withMood > 0
                ? `Dari ${summary.journal.withMood} catatan`
                : "Belum ada yang mengisi mood"
            }
            tone="muted"
          />
          <Stat
            label="Rata-rata energi"
            value={summary.journal.averageEnergy === null ? "-" : `${summary.journal.averageEnergy}/10`}
            tone="muted"
          />
        </StatStrip>

        {summary.journal.topTags.length > 0 && (
          <Card className="mt-3">
            <CardHeader size="sm" title="Tag paling sering" />
            <div className="flex flex-wrap gap-1.5 px-4 pb-4">
              {summary.journal.topTags.map((tag) => (
                <span
                  key={tag.name}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-sunken px-2.5 py-1 text-xs text-ink-muted"
                >
                  {tag.name}
                  <span className="tabular text-micro text-ink-faint">{tag.count}</span>
                </span>
              ))}
            </div>
          </Card>
        )}
      </section>

      {/* — Goals — */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <SectionLabel>Tujuan</SectionLabel>
          {goals.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((current) => (current === "goals" ? "none" : "goals"))}
              aria-expanded={expanded === "goals"}
              className="inline-flex items-center gap-1 text-xs text-ink-subtle hover:text-ink"
            >
              {expanded === "goals" ? "Sembunyikan" : "Tampilkan"}
              <ChevronDown
                size={12}
                className={cn("transition-transform duration-fast", expanded === "goals" && "rotate-180")}
              />
            </button>
          )}
        </div>

        {goals.length === 0 ? (
          <Card>
            <EmptyState
              compact
              icon={<Target />}
              title="Belum ada tujuan"
              description="Grafik progres muncul begitu kamu punya tujuan yang bisa diukur."
              action={
                <Link href="/plan/goals" className="text-sm font-medium text-accent hover:underline">
                  Buat tujuan
                </Link>
              }
            />
          </Card>
        ) : (
          <>
            <StatStrip>
              <Stat label="Aktif" value={goalMetrics.active} />
              <Stat
                label="Tercapai"
                value={goalMetrics.achievedInPeriod}
                hint="Pada rentang ini"
                tone={goalMetrics.achievedInPeriod > 0 ? "positive" : "muted"}
              />
              <Stat
                label="Rata-rata progres"
                value={`${Math.round(goalMetrics.averageProgress)}%`}
                hint="Dari tujuan yang punya target"
              />
              <Stat
                label="Perlu perhatian"
                value={goalMetrics.offTrack.length}
                tone={goalMetrics.offTrack.length > 0 ? "negative" : "muted"}
              />
            </StatStrip>

            {goalMetrics.offTrack.length > 0 && (
              <Card className="mt-3 border-warning/30 bg-warning-soft">
                <div className="flex items-start gap-2.5 px-4 py-3">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-ink">
                      {goalMetrics.offTrack.length} tujuan dengan laju di bawah yang dibutuhkan
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {goalMetrics.offTrack.slice(0, 4).map((goal) => (
                        <li key={goal.goalId} className="text-micro text-ink-muted">
                          <Link href={`/plan/goals/${goal.goalId}`} className="hover:underline">
                            {goal.title}
                          </Link>
                          {" - "}
                          perlu {formatPlainNumber(goal.requiredPerDay)}/hari, sekarang{" "}
                          {formatPlainNumber(goal.velocityPerDay)}/hari
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            )}

            {expanded === "goals" && (
              <Card className="mt-3">
                <CardHeader
                  size="sm"
                  title="Progres setiap tujuan"
                  description="Diurutkan dari yang paling dekat selesai"
                />
                <ul className="space-y-3.5 px-4 pb-4">
                  {goals.map((goal) => (
                    <li key={goal.id}>
                      <div className="flex items-baseline justify-between gap-3">
                        <Link
                          href={`/plan/goals/${goal.id}`}
                          className="min-w-0 truncate text-sm text-ink hover:text-accent hover:underline"
                        >
                          {goal.title}
                        </Link>
                        <span className="tabular shrink-0 text-xs font-medium text-ink-muted">
                          {goal.percentage === null ? "-" : `${goal.percentage}%`}
                        </span>
                      </div>
                      {goal.percentage !== null && (
                        <ProgressBar
                          value={goal.percentage / 100}
                          token={goal.areaToken}
                          height={4}
                          className="mt-1.5"
                          tone={goal.status === "ACHIEVED" ? "positive" : "auto"}
                          label={`Progres ${goal.title}`}
                        />
                      )}
                      <p className="tabular mt-1 flex flex-wrap items-center gap-x-2.5 text-micro text-ink-faint">
                        {goal.target !== null && (
                          <span>
                            {formatMoneyOrNumber(goal.current, goal.goalType, goal.unit)} dari{" "}
                            {formatMoneyOrNumber(goal.target, goal.goalType, goal.unit)}
                          </span>
                        )}
                        {goal.daysRemaining !== null && (
                          <span>
                            {goal.daysRemaining >= 0
                              ? `${goal.daysRemaining} hari lagi`
                              : `${Math.abs(goal.daysRemaining)} hari lewat`}
                          </span>
                        )}
                        {goal.isOffTrack && <span className="text-negative">laju kurang</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </section>

      {/* — Projects — */}
      {projects.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <SectionLabel>Proyek</SectionLabel>
            <button
              type="button"
              onClick={() => setExpanded((current) => (current === "projects" ? "none" : "projects"))}
              aria-expanded={expanded === "projects"}
              className="inline-flex items-center gap-1 text-xs text-ink-subtle hover:text-ink"
            >
              {expanded === "projects" ? "Sembunyikan" : "Tampilkan"}
              <ChevronDown
                size={12}
                className={cn(
                  "transition-transform duration-fast",
                  expanded === "projects" && "rotate-180",
                )}
              />
            </button>
          </div>

          {expanded === "projects" && (
            <Card>
              <ul className="divide-y divide-border-subtle">
                {projects.map((project) => (
                  <li key={project.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/plan/projects/${project.id}`}
                        className="min-w-0 truncate text-sm text-ink hover:text-accent hover:underline"
                      >
                        {project.title}
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        {project.isOverdue && (
                          <Badge tone="negative" dot>
                            Lewat tenggat
                          </Badge>
                        )}
                        <StatusBadge domain="project" value={project.status} />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <ProgressBar
                        value={project.percentage / 100}
                        token={project.areaToken}
                        height={4}
                        className="flex-1"
                        tone={project.percentage === 100 ? "positive" : "auto"}
                        label={`Progres ${project.title}`}
                      />
                      <span className="tabular shrink-0 text-xs text-ink-muted">
                        {project.percentage}%
                      </span>
                    </div>
                    <p className="mt-1 text-micro text-ink-faint">
                      {project.basis === "milestones"
                        ? `${project.completedMilestones} dari ${project.totalMilestones} milestone`
                        : project.basis === "tasks"
                          ? `${project.taskCount} tugas`
                          : "Belum ada milestone atau tugas"}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      <p className="pt-1 text-center text-micro text-ink-faint">
        Semua angka di halaman ini dihitung dari catatanmu. Tidak ada proyeksi
        atau perkiraan yang disajikan sebagai fakta.
      </p>
    </div>
  );
}
