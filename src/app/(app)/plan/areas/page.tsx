import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { Card, SectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { RecordIcon } from "@/components/ui/record-icon";
import { ProgressBar } from "@/components/ui/indicator";
import Link from "next/link";
import { ChevronRight, Layers } from "lucide-react";
import { db } from "@/lib/db";
import { today, formatFullDate } from "@/lib/date";
import * as areas from "@/domains/plan/areas";
import * as goals from "@/domains/plan/goals";
import * as projects from "@/domains/plan/projects";
import { AreaManager } from "./area-manager";

export const metadata = { title: "Area" };

/**
 * Areas.
 *
 * Areas are the top of the plan hierarchy and the dimension Progress groups
 * by. Each card reports how much live work sits under it, computed from real
 * counts rather than a stored tally.
 */
export default async function AreasPage() {
  const user = await requireUser();
  const day = today(user.timeZone);

  const [areaList, goalList, projectList, taskCounts, habitCounts] = await Promise.all([
    areas.listAreas(user.id, { includeArchived: true }),
    db.goal.findMany({
      where: { userId: user.id, status: { not: "ARCHIVED" } },
      select: { id: true, areaId: true, status: true, targetValue: true, currentValue: true },
    }),
    db.project.findMany({
      where: { userId: user.id, status: { not: "ARCHIVED" } },
      select: { id: true, areaId: true, status: true },
    }),
    db.task.groupBy({
      by: ["areaId", "status"],
      where: { userId: user.id, status: { not: "ARCHIVED" } },
      _count: { _all: true },
    }),
    db.habit.groupBy({
      by: ["areaId"],
      where: { userId: user.id, archivedAt: null },
      _count: { _all: true },
    }),
  ]);

  const openTaskByArea = new Map<string, number>();
  for (const row of taskCounts) {
    if (!row.areaId) continue;
    const open = row.status === "INBOX" || row.status === "PLANNED" || row.status === "TODAY";
    if (open) {
      openTaskByArea.set(row.areaId, (openTaskByArea.get(row.areaId) ?? 0) + row._count._all);
    }
  }

  const habitByArea = new Map<string, number>();
  for (const row of habitCounts) {
    if (row.areaId) habitByArea.set(row.areaId, row._count._all);
  }

  const goalProgressMap = await goals.computeGoalProgress(
    user.id,
    goalList.map((g) => ({
      id: g.id,
      goalType: "NUMERIC" as const,
      targetValue: g.targetValue,
      currentValue: g.currentValue,
      isDerived: false,
      derivationKey: null,
      startDate: null,
      targetDate: null,
      status: g.status,
    })),
    user.timeZone,
  );

  const projectProgressMap = await projects.computeProjectProgress(
    user.id,
    projectList.map((p) => ({ id: p.id, targetDate: null, status: p.status })),
    day,
  );

  const active = areaList.filter((a) => !a.archivedAt);
  const archived = areaList.filter((a) => a.archivedAt);

  function statsFor(areaId: string) {
    const areaGoals = goalList.filter((g) => g.areaId === areaId);
    const areaProjects = projectList.filter((p) => p.areaId === areaId);

    // Average of the goals that actually have a measurable target, so a binary
    // goal does not drag the area's figure to zero.
    const measured = areaGoals
      .map((g) => goalProgressMap.get(g.id)?.percentage)
      .filter((value): value is number => typeof value === "number");

    const projectAverage =
      areaProjects.length > 0
        ? Math.round(
            (areaProjects.reduce(
              (sum, p) => sum + (projectProgressMap.get(p.id)?.percentage ?? 0),
              0,
            ) /
              areaProjects.length) *
              10,
          ) / 10
        : null;

    return {
      goalCount: areaGoals.length,
      activeGoalCount: areaGoals.filter((g) => g.status === "ACTIVE" || g.status === "PLANNED").length,
      projectCount: areaProjects.length,
      activeProjectCount: areaProjects.filter((p) => p.status === "ACTIVE").length,
      openTasks: openTaskByArea.get(areaId) ?? 0,
      habits: habitByArea.get(areaId) ?? 0,
      goalAverage: measured.length > 0
        ? Math.round((measured.reduce((a, b) => a + b, 0) / measured.length) * 10) / 10
        : null,
      projectAverage,
    };
  }

  return (
    <AppShell
      title="Area"
      subtitle={`${active.length} area - ${formatFullDate(day, user.locale)}`}
    >
      <div className="space-y-5">
        <AreaManager
          areas={active.map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            colorToken: a.colorToken,
            iconName: a.iconName,
          }))}
        />

        {active.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Layers />}
              title="Belum ada area"
              description="Area mengelompokkan tujuan dan proyek kamu, misalnya Kesehatan atau Keuangan."
            />
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {active.map((area) => {
              const stats = statsFor(area.id);
              return (
                <li key={area.id}>
                  <Card interactive className="h-full">
                    <Link
                      href={`/plan/areas/${area.id}`}
                      className="group flex h-full flex-col gap-3 p-4 transition-colors duration-fast hover:bg-surface-sunken"
                    >
                      <div className="flex items-start gap-3">
                        <RecordIcon icon={area.iconName} token={area.colorToken} size="lg" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{area.name}</p>
                          {area.description && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-ink-subtle">
                              {area.description}
                            </p>
                          )}
                        </div>
                        <ChevronRight
                          size={15}
                          className="mt-0.5 shrink-0 text-ink-faint opacity-0 transition-opacity duration-fast group-hover:opacity-100"
                        />
                      </div>

                      {stats.goalAverage !== null && (
                        <div className="flex items-center gap-2.5">
                          <ProgressBar
                            value={stats.goalAverage / 100}
                            token={area.colorToken}
                            height={4}
                            className="flex-1"
                            label={`Rata-rata progres tujuan ${area.name}`}
                          />
                          <span className="tabular text-micro text-ink-faint">
                            {stats.goalAverage}%
                          </span>
                        </div>
                      )}

                      <dl className="mt-auto grid grid-cols-3 gap-2 text-micro">
                        <div>
                          <dt className="text-ink-faint">Tujuan</dt>
                          <dd className="tabular mt-0.5 text-ink">
                            {stats.activeGoalCount}
                            {stats.goalCount > stats.activeGoalCount && (
                              <span className="text-ink-faint">/{stats.goalCount}</span>
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-ink-faint">Proyek</dt>
                          <dd className="tabular mt-0.5 text-ink">
                            {stats.activeProjectCount}
                            {stats.projectCount > stats.activeProjectCount && (
                              <span className="text-ink-faint">/{stats.projectCount}</span>
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-ink-faint">Tugas</dt>
                          <dd className="tabular mt-0.5 text-ink">{stats.openTasks}</dd>
                        </div>
                      </dl>
                    </Link>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        {archived.length > 0 && (
          <section>
            <SectionLabel className="mb-2">Diarsipkan {archived.length}</SectionLabel>
            <Card>
              <ul className="divide-y divide-border-subtle">
                {archived.map((area) => (
                  <li key={area.id} className="flex items-center gap-3 px-4 py-2.5">
                    <RecordIcon icon={area.iconName} token={area.colorToken} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-subtle">
                      {area.name}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}
      </div>
    </AppShell>
  );
}
