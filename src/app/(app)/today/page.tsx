import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { db } from "@/lib/db";
import {
  today,
  formatCalendarDay,
  formatLongDate,
  greetingFor,
} from "@/lib/date";
import * as tasks from "@/domains/plan/tasks";
import * as habits from "@/domains/habits/service";
import * as goals from "@/domains/plan/goals";
import * as projects from "@/domains/plan/projects";
import * as areas from "@/domains/plan/areas";
import { finance } from "@/domains/finance/service";
import { TodayView } from "./today-view";

export const metadata = { title: "Today" };

/**
 * Today.
 *
 * The product's operating surface. Every figure here is aggregated from the
 * same services its detail pages use — Today owns no data and stores no
 * derived number, so it can never disagree with the screen it links to.
 *
 * The queries are issued in parallel and each is a single call for its domain
 * (one for tasks on the day, one for habit metrics, one for the money
 * summary), which keeps the page's cost flat as the user's history grows.
 */
export default async function TodayPage() {
  const user = await requireUser();
  const day = today(user.timeZone);
  const todayKey = formatCalendarDay(day);
  const greeting = greetingFor(new Date(), user.timeZone);

  const [
    dayTasks,
    habitList,
    activeGoals,
    activeProjects,
    areaList,
    money,
    journalToday,
  ] = await Promise.all([
    tasks.getTasksForDay(user.id, day),
    habits.listHabits(user.id),
    goals.listGoals(user.id, { status: ["ACTIVE", "PLANNED"], limit: 12 }),
    projects.listProjects(user.id, { status: ["ACTIVE"], limit: 12 }),
    areas.listAreas(user.id),
    finance.getDailySummary(user.id, day),
    db.journalEntry.findUnique({
      where: { userId_date: { userId: user.id, date: day } },
      select: { id: true, mood: true, energy: true, focus: true, body: true, title: true },
    }),
  ]);

  // Habits due today, with their full metrics.
  const habitMetrics = await habits.computeHabitMetrics(user.id, habitList, day, {
    weekStartsOn: user.weekStartsOn,
  });

  const habitsDue = habitList
    .filter((habit) => day >= habit.startDate && (habit.endDate === null || day <= habit.endDate))
    .filter((habit) => habits.isEligible(day, habit.scheduleDays))
    .map((habit) => ({
      id: habit.id,
      name: habit.name,
      frequency: habit.frequency,
      targetCount: habit.targetCount,
      colorToken: habit.colorToken,
      iconName: habit.iconName,
      areaName: habit.area?.name ?? null,
      metrics: habitMetrics.get(habit.id) ?? null,
    }));

  const [goalProgressMap, projectProgressMap, monthSummary] = await Promise.all([
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
      activeProjects.map((p) => ({ id: p.id, targetDate: p.targetDate, status: p.status })),
      day,
    ),
    finance.getMonthSummary(user.id, day),
  ]);

  // Consistency for the current month, the number the Today screen reports as
  // monthly progress. Derived from the same habit metrics used elsewhere.
  const monthConsistency =
    habitsDue.length > 0
      ? habitList.reduce((sum, h) => sum + (habitMetrics.get(h.id)?.monthlyConsistency ?? 0), 0) /
        habitList.length
      : 0;

  return (
    <AppShell title={greeting} subtitle={formatLongDate(day, user.locale)}>
      <TodayView
        todayKey={todayKey}
        currency={user.currency}
        tasks={{
          scheduled: dayTasks.scheduled.map(serializeTask),
          overdue: dayTasks.overdue.map(serializeTask),
        }}
        habits={habitsDue.map((h) => ({
          id: h.id,
          name: h.name,
          frequency: h.frequency,
          targetCount: h.targetCount,
          colorToken: h.colorToken,
          iconName: h.iconName,
          areaName: h.areaName,
          completedToday: h.metrics?.completedToday ?? false,
          periodCount: h.metrics?.periodCount ?? 0,
          periodTarget: h.metrics?.periodTarget ?? 1,
          consistency: h.metrics?.consistency ?? 0,
          currentStreak: h.metrics?.currentStreak ?? 0,
        }))}
        money={{
          netWorth: money.netWorth.toString(),
          todayIncome: money.todayIncome.toString(),
          todayExpense: money.todayExpense.toString(),
          monthIncome: monthSummary.income.toString(),
          monthExpense: monthSummary.expense.toString(),
          monthNet: monthSummary.net.toString(),
          accountCount: money.accounts.length,
          topAccounts: money.accounts
            .slice()
            .sort((a, b) => (b.balance > a.balance ? 1 : -1))
            .slice(0, 3)
            .map((a) => ({
              id: a.id,
              name: a.name,
              balance: a.balance.toString(),
              colorToken: a.colorToken,
              iconName: a.iconName,
            })),
        }}
        goals={activeGoals.slice(0, 4).map((goal) => {
          const progress = goalProgressMap.get(goal.id);
          return {
            id: goal.id,
            title: goal.title,
            goalType: goal.goalType,
            unit: goal.unit,
            percentage: progress?.percentage ?? null,
            ratio: progress?.ratio ?? null,
            current: progress?.current ?? 0,
            target: progress?.target ?? null,
            areaToken: goal.area?.colorToken ?? null,
            daysRemaining: progress?.daysRemaining ?? null,
            isOffTrack: progress?.isOffTrack ?? false,
          };
        })}
        projects={activeProjects.slice(0, 3).map((project) => {
          const progress = projectProgressMap.get(project.id);
          return {
            id: project.id,
            title: project.title,
            percentage: progress?.percentage ?? 0,
            areaToken: project.area?.colorToken ?? null,
            completedMilestones: progress?.completedMilestones ?? 0,
            totalMilestones: progress?.totalMilestones ?? 0,
          };
        })}
        monthConsistency={monthConsistency}
        areas={areaList.map((a) => ({ id: a.id, name: a.name, colorToken: a.colorToken }))}
        journal={
          journalToday
            ? {
                id: journalToday.id,
                mood: journalToday.mood,
                energy: journalToday.energy,
                focus: journalToday.focus,
                excerpt: excerpt(journalToday.body),
              }
            : null
        }
      />
    </AppShell>
  );
}

function serializeTask(task: Awaited<ReturnType<typeof tasks.getTasksForDay>>["scheduled"][number]) {
  return {
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
  };
}

/** First meaningful line of a journal entry, for the Today summary. */
function excerpt(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}\u2026` : flat;
}
