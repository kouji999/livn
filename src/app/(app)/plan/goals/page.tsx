import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { today, formatFullDate } from "@/lib/date";
import * as goals from "@/domains/plan/goals";
import * as areas from "@/domains/plan/areas";
import { GoalList } from "./goal-list";
import type { GoalStatusFilter } from "./goal-filters";

export const metadata = { title: "Tujuan" };

/**
 * Goals.
 *
 * Lists every live goal with its computed progress. Progress is calculated in
 * one batched pass, so the page cost does not grow with the number of goals.
 */
export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; area?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const day = today(user.timeZone);

  const statusFilter = parseStatus(params.status);
  const areaFilter = params.area?.trim() || undefined;

  const [goalList, areaList] = await Promise.all([
    goals.listGoals(user.id, {
      status: statusFilter,
      areaId: areaFilter,
      limit: 300,
    }),
    areas.listAreas(user.id),
  ]);

  const progressMap = await goals.computeGoalProgress(
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

  // Counts across all statuses, so the filter chips stay stable while filtering.
  const allGoals = await goals.listGoals(user.id, { includeArchived: false, limit: 500 });
  const counts = {
    all: allGoals.length,
    active: allGoals.filter((g) => g.status === "ACTIVE").length,
    achieved: allGoals.filter((g) => g.status === "ACHIEVED").length,
    atRisk: 0,
  };

  return (
    <AppShell
      title="Tujuan"
      subtitle={`${goalList.length} tujuan - ${formatFullDate(day, user.locale)}`}
    >
      <GoalList
        goals={goalList.map((g) => {
          const progress = progressMap.get(g.id);
          return {
            id: g.id,
            title: g.title,
            description: g.description,
            status: g.status,
            goalType: g.goalType,
            priority: g.priority,
            unit: g.unit,
            areaId: g.areaId,
            areaName: g.area?.name ?? null,
            areaToken: g.area?.colorToken ?? null,
            areaIcon: g.area?.iconName ?? null,
            current: progress?.current ?? 0,
            target: progress?.target ?? null,
            percentage: progress?.percentage ?? null,
            ratio: progress?.ratio ?? null,
            daysRemaining: progress?.daysRemaining ?? null,
            requiredPerDay: progress?.requiredPerDay ?? null,
            velocityPerDay: progress?.velocityPerDay ?? null,
            isOffTrack: progress?.isOffTrack ?? false,
            taskCount: g._count.tasks,
            projectCount: g._count.projects,
            habitCount: g._count.habits,
          };
        })}
        counts={counts}
        activeAreaId={areaFilter ?? null}
        areas={areaList.map((a) => ({
          id: a.id,
          name: a.name,
          colorToken: a.colorToken,
        }))}      />
    </AppShell>
  );
}

function parseStatus(value: string | undefined): GoalStatusFilter[] | undefined {
  switch (value) {
    case "active":
      return ["ACTIVE", "PLANNED"];
    case "achieved":
      return ["ACHIEVED"];
    case "paused":
      return ["PAUSED"];
    case "all":
      return undefined;
    default:
      return ["PLANNED", "ACTIVE", "PAUSED"];
  }
}
