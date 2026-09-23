import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { today, addCalendarDays, formatFullDate, parseCalendarDay } from "@/lib/date";
import * as analytics from "@/domains/analytics/service";
import * as goals from "@/domains/plan/goals";
import * as projects from "@/domains/plan/projects";
import { ProgressView } from "./progress-view";

export const metadata = { title: "Progress" };
export const dynamic = "force-dynamic";

/**
 * Progress.
 *
 * Answers "how am I actually doing" across every dimension, over four
 * timeframes. Nothing here is stored: each figure is computed from the same
 * analytics functions the rest of the product uses, so the completion rate
 * shown here is arithmetic-identical to the one quoted in a review.
 *
 * The default is a month, because a week is too short to show a trend and a
 * year is too long to act on.
 */
export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; compare?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const day = today(user.timeZone);

  const rangeKind = parseRangeKind(params.range);
  const range = analytics.rangeFor(rangeKind, day, user.weekStartsOn);

  // The series is what the charts plot. Its window follows the selected
  // timeframe, capped so a year does not plot 365 bars into a thumbnail.
  const seriesFrom = seriesStart(range, day);
  const seriesTo = range.period.endExclusive > addCalendarDays(day, 1)
    ? addCalendarDays(range.period.start, Math.min(daysBetweenInclusive(range.period.start, day), 90))
    : addCalendarDays(range.period.endExclusive, -1);

  const [summary, series, goalList, projectList, comparison] = await Promise.all([
    analytics.getPeriodSummary(user.id, range, { weekStartsOn: user.weekStartsOn }),
    analytics.getSeries(user.id, seriesFrom, seriesTo),
    goals.listGoals(user.id, { status: ["ACTIVE", "PLANNED", "ACHIEVED"], limit: 100 }),
    projects.listProjects(user.id, { status: ["ACTIVE", "PLANNED", "COMPLETED"], limit: 100 }),
    analytics.comparePeriods(
      range,
      (r) => analytics.getPeriodSummary(user.id, r, { weekStartsOn: user.weekStartsOn }),
      (s) => s.executionScore,
    ),
  ]);

  // Per-goal progress comes from the goal service so the numbers match the goal
  // pages; analytics only aggregates them.
  const goalProgress = await goals.computeGoalProgress(
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
  );

  const projectProgress = await projects.computeProjectProgress(
    user.id,
    projectList.map((p) => ({ id: p.id, targetDate: p.targetDate, status: p.status })),
    day,
  );

  const goalMetrics = await analytics.getGoalMetrics(
    user.id,
    range,
    goalProgress,
    goalList.map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status,
      targetDate: g.targetDate,
    })),
  );

  return (
    <AppShell
      title="Progress"
      subtitle={formatFullDate(day, user.locale)}
    >
      <ProgressView
        currency={user.currency}
        rangeKind={rangeKind}
        rangeLabel={rangeLabel(rangeKind, range)}
        summary={{
          executionScore: summary.executionScore,
          tasks: summary.tasks,
          habits: summary.habits,
          money: {
            income: summary.money.income.toString(),
            expense: summary.money.expense.toString(),
            net: summary.money.net.toString(),
            savingsRate: summary.money.savingsRate,
            activeDays: summary.money.activeDays,
            averageDailyExpense: summary.money.averageDailyExpense.toString(),
            largestExpense: summary.money.largestExpense.toString(),
            topCategories: summary.money.topCategories.map((c) => ({
              categoryId: c.categoryId,
              name: c.name,
              colorToken: c.colorToken,
              iconName: c.iconName,
              total: c.total.toString(),
              share: c.share,
            })),
          },
          journal: summary.journal,
        }}
        comparison={{
          current: comparison.current.executionScore,
          previous: comparison.previous.executionScore,
          delta: comparison.delta,
        }}
        series={series.map((point) => ({
          date: point.date,
          tasksCompleted: point.tasksCompleted,
          habitSessions: point.habitSessions,
          income: point.income.toString(),
          expense: point.expense.toString(),
          journaled: point.journaled,
        }))}
        goals={goalList
          .map((goal) => {
            const progress = goalProgress.get(goal.id);
            return {
              id: goal.id,
              title: goal.title,
              status: goal.status,
              percentage: progress?.percentage ?? null,
              current: progress?.current ?? 0,
              target: progress?.target ?? null,
              goalType: goal.goalType,
              unit: goal.unit,
              daysRemaining: progress?.daysRemaining ?? null,
              isOffTrack: progress?.isOffTrack ?? false,
              requiredPerDay: progress?.requiredPerDay ?? null,
              velocityPerDay: progress?.velocityPerDay ?? null,
              areaToken: goal.area?.colorToken ?? null,
            };
          })
          .sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1))}
        goalMetrics={{
          active: goalMetrics.active,
          achievedInPeriod: goalMetrics.achievedInPeriod,
          averageProgress: goalMetrics.averageProgress,
          dueInPeriod: goalMetrics.dueInPeriod,
          offTrack: goalMetrics.offTrack,
        }}
        projects={projectList.map((project) => {
          const progress = projectProgress.get(project.id);
          return {
            id: project.id,
            title: project.title,
            status: project.status,
            percentage: progress?.percentage ?? 0,
            basis: progress?.basis ?? null,
            totalMilestones: progress?.totalMilestones ?? 0,
            completedMilestones: progress?.completedMilestones ?? 0,
            taskCount: Number(project._count.tasks),
            isOverdue: progress?.isOverdue ?? false,
            areaToken: project.area?.colorToken ?? null,
          };
        })}
      />
    </AppShell>
  );
}

function parseRangeKind(value: string | undefined): "day" | "week" | "month" | "year" {
  if (value === "day" || value === "week" || value === "month" || value === "year") return value;
  return "month";
}

/**
 * Where the chart series begins.
 *
 * A month is plotted day by day; a year is plotted by month, because 365 bars
 * in a small chart is a texture rather than a shape. The chart component treats
 * the series as opaque labels, so the granularity change is invisible to it.
 */
function seriesStart(range: analytics.MetricRange, reference: Date): Date {
  const spanDays = Math.round(
    (range.period.endExclusive.getTime() - range.period.start.getTime()) / 86_400_000,
  );

  if (spanDays <= 31) {
    // Day granularity, clipped to the reference day so an in-progress month does
    // not plot a flat line of future zeros.
    const elapsedEnd =
      range.period.endExclusive > addCalendarDays(reference, 1) ? reference : addCalendarDays(range.period.endExclusive, -1);
    return range.period.start <= elapsedEnd ? range.period.start : elapsedEnd;
  }

  return range.period.start;
}

function daysBetweenInclusive(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

/** A human label for the period being shown. */
function rangeLabel(kind: "day" | "week" | "month" | "year", range: analytics.MetricRange): string {
  const start = range.period.start;
  const end = addCalendarDays(range.period.endExclusive, -1);

  switch (kind) {
    case "day":
      return formatFullDate(start);
    case "week":
      return `${formatFullDate(start)} - ${formatFullDate(end)}`;
    case "month":
      return new Intl.DateTimeFormat("id-ID", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(start);
    case "year":
      return String(start.getUTCFullYear());
  }
}

void parseCalendarDay;
