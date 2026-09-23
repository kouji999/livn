import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { today, formatFullDate } from "@/lib/date";
import * as habits from "@/domains/habits/service";
import * as areas from "@/domains/plan/areas";
import * as goals from "@/domains/plan/goals";
import { HabitBoard } from "./habit-board";

export const metadata = { title: "Kebiasaan" };

/**
 * Habits.
 *
 * Deliberately leads with consistency rather than streak. A streak tells you
 * that you have not missed; consistency tells you how much of your intention
 * you actually kept, which is the number that survives a bad week.
 */
export default async function HabitsPage() {
  const user = await requireUser();
  const day = today(user.timeZone);

  const [habitList, areaList, goalList] = await Promise.all([
    habits.listHabits(user.id),
    areas.listAreas(user.id),
    goals.listGoals(user.id, { status: ["PLANNED", "ACTIVE"] }),
  ]);

  const metrics = await habits.computeHabitMetrics(user.id, habitList, day, {
    weekStartsOn: user.weekStartsOn,
  });

  // The last 14 days drive the per-habit heat strip.
  const stripStart = new Date(day.getTime() - 13 * 86_400_000);
  const recentLogs = await habits.recentCompletionMap(
    user.id,
    habitList.map((h) => h.id),
    stripStart,
    day,
  );

  return (
    <AppShell
      title="Kebiasaan"
      subtitle={`${habitList.length} kebiasaan - ${formatFullDate(day, user.locale)}`}
    >
      <HabitBoard
        habits={habitList.map((habit) => {
          const m = metrics.get(habit.id);
          return {
            id: habit.id,
            name: habit.name,
            description: habit.description,
            frequency: habit.frequency,
            targetCount: habit.targetCount,
            scheduleDays: habit.scheduleDays,
            trackingMethod: habit.trackingMethod,
            unit: habit.unit,
            colorToken: habit.colorToken,
            iconName: habit.iconName,
            areaName: habit.area?.name ?? null,
            goalTitle: habit.goal?.title ?? null,
            totalLogs: habit._count.logs,
            consistency: m?.consistency ?? 0,
            currentStreak: m?.currentStreak ?? 0,
            bestStreak: m?.bestStreak ?? 0,
            periodCount: m?.periodCount ?? 0,
            periodTarget: m?.periodTarget ?? habit.targetCount,
            missedCount: m?.missedCount ?? 0,
            weeklyConsistency: m?.weeklyConsistency ?? 0,
            monthlyConsistency: m?.monthlyConsistency ?? 0,
            completedToday: m?.completedToday ?? false,
            activeToday: m?.activeToday ?? false,
            recent: recentLogs.get(habit.id) ?? [],
          };
        })}
        todayKey={day.toISOString().slice(0, 10)}
        areas={areaList.map((a) => ({ id: a.id, name: a.name }))}
        goals={goalList.map((g) => ({ id: g.id, title: g.title }))}
      />
    </AppShell>
  );
}
