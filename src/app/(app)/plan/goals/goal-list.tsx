"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Plus, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/indicator";
import { EmptyState } from "@/components/ui/states";
import { RecordIcon } from "@/components/ui/record-icon";
import { StatusBadge } from "@/components/ui/status";
import { Stat, StatStrip } from "@/components/layout/page";
import { cn } from "@/lib/cn";
import { formatMoneyOrNumber, formatPlainNumber } from "@/lib/format";
import { GOAL_PRESETS } from "./goal-filters";
import { GoalComposer } from "./goal-composer";

type AreaOption = { id: string; name: string; colorToken: string };

export type GoalListItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  goalType: string;
  priority: string;
  unit: string | null;
  areaId: string | null;
  areaName: string | null;
  areaToken: string | null;
  areaIcon: string | null;
  current: number;
  target: number | null;
  percentage: number | null;
  ratio: number | null;
  daysRemaining: number | null;
  requiredPerDay: number | null;
  velocityPerDay: number | null;
  isOffTrack: boolean;
  taskCount: number;
  projectCount: number;
  habitCount: number;
};

export function GoalList({
  goals,
  counts,
  activeAreaId,
  areas,
}: {
  goals: GoalListItem[];
  counts: { all: number; active: number; achieved: number; atRisk: number };
  activeAreaId: string | null;
  areas: AreaOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [composerOpen, setComposerOpen] = useState(false);

  const activePreset = searchParams.get("status") ?? "active";

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    startTransition(() => {
      router.replace(`/plan/goals${next.size ? `?${next.toString()}` : ""}`, { scroll: false });
    });
  }

  return (
    <div className="space-y-4">
      <StatStrip>
        <Stat label="Total" value={counts.all} />
        <Stat label="Berjalan" value={counts.active} />
        <Stat label="Tercapai" value={counts.achieved} tone="positive" />
        <Stat
          label="Perlu perhatian"
          value={goals.filter((g) => g.isOffTrack).length}
          tone={goals.some((g) => g.isOffTrack) ? "negative" : "muted"}
        />
      </StatStrip>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Filter tujuan">
          {GOAL_PRESETS.map((preset) => {
            const active = activePreset === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setParam("status", preset.value === "active" ? null : preset.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-fast",
                  active
                    ? "bg-surface-sunken text-ink"
                    : "text-ink-subtle hover:bg-surface-sunken hover:text-ink",
                )}
              >
                {preset.label}
                <span className="tabular rounded-sm px-1 text-micro text-ink-faint">
                  {counts[preset.countKey]}
                </span>
              </button>
            );
          })}
        </div>

        <Button
          variant="primary"
          size="sm"
          icon={<Plus />}
          className="ml-auto"
          onClick={() => setComposerOpen((open) => !open)}
        >
          Tujuan baru
        </Button>
      </div>

      {composerOpen && (
        <Card className="p-5">
          <GoalComposer areas={areas} onDone={() => setComposerOpen(false)} />
        </Card>
      )}

      {areas.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setParam("area", null)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-micro transition-colors duration-fast",
              !activeAreaId
                ? "border-ink-faint bg-surface-sunken text-ink"
                : "border-border text-ink-subtle hover:border-border-strong hover:text-ink",
            )}
          >
            Semua area
          </button>
          {areas.map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() => setParam("area", activeAreaId === area.id ? null : area.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-micro transition-colors duration-fast",
                activeAreaId === area.id
                  ? "border-ink-faint bg-surface-sunken text-ink"
                  : "border-border text-ink-subtle hover:border-border-strong hover:text-ink",
              )}
            >
              {area.name}
            </button>
          ))}
        </div>
      )}

      {goals.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Plus />}
            title="Belum ada tujuan di sini"
            description="Tujuan adalah hal yang ingin kamu capai. Bisa berupa angka, uang, atau sekadar selesai atau belum."
            action={
              <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setComposerOpen(true)}>
                Buat tujuan
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className={cn("space-y-2", pending && "opacity-70")}>
          {goals.map((goal) => (
            <li key={goal.id}>
              <GoalCard goal={goal} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GoalCard({ goal }: { goal: GoalListItem }) {
  const hasTarget = goal.target !== null;
  const urgent = goal.daysRemaining !== null && goal.daysRemaining <= 14 && goal.status !== "ACHIEVED";

  return (
    <Card interactive className="overflow-hidden">
      <Link
        href={`/plan/goals/${goal.id}`}
        className="group block px-4 py-3.5 transition-colors duration-fast hover:bg-surface-sunken"
      >
        <div className="flex items-start gap-3">
          <RecordIcon icon={goal.areaIcon} token={goal.areaToken} size="md" className="mt-0.5" />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{goal.title}</p>
                {goal.description && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-ink-subtle">{goal.description}</p>
                )}
              </div>
              <ChevronRight
                size={15}
                className="mt-0.5 shrink-0 text-ink-faint opacity-0 transition-opacity duration-fast group-hover:opacity-100"
              />
            </div>

            <div className="mt-2.5 flex items-center gap-3">
              {hasTarget ? (
                <>
                  <ProgressBar
                    value={goal.ratio ?? 0}
                    token={goal.areaToken}
                    height={5}
                    className="flex-1"
                    tone={goal.status === "ACHIEVED" ? "positive" : "auto"}
                    label={`Progres ${goal.title}`}
                  />
                  <span className="tabular shrink-0 text-xs font-medium text-ink-muted">
                    {goal.percentage}%
                  </span>
                </>
              ) : (
                <span className="text-xs text-ink-subtle">
                  {goal.status === "ACHIEVED" ? "Sudah tercapai" : "Belum tercapai"}
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-ink-faint">
              {hasTarget && (
                <span className="tabular">
                  {formatMoneyOrNumber(goal.current, goal.goalType, goal.unit)} dari{" "}
                  {formatMoneyOrNumber(goal.target, goal.goalType, goal.unit)}
                </span>
              )}

              {goal.velocityPerDay !== null && goal.velocityPerDay > 0 && (
                <span className="tabular">
                  {formatPlainNumber(goal.velocityPerDay)}/hari
                </span>
              )}

              {goal.areaName && <span>{goal.areaName}</span>}

              {goal.taskCount > 0 && <span>{goal.taskCount} tugas</span>}
              {goal.projectCount > 0 && <span>{goal.projectCount} proyek</span>}
              {goal.habitCount > 0 && <span>{goal.habitCount} kebiasaan</span>}
            </div>

            {urgent && (
              <p
                className={cn(
                  "mt-2 flex items-center gap-1 text-micro",
                  goal.isOffTrack ? "text-negative" : "text-warning",
                )}
              >
                {goal.isOffTrack && <TriangleAlert size={11} />}
                {goal.isOffTrack
                  ? `Perlu ${formatPlainNumber(goal.requiredPerDay ?? 0)}/hari agar tepat waktu`
                  : `${goal.daysRemaining} hari lagi`}
              </p>
            )}
          </div>

          <div className="hidden shrink-0 sm:block">
            <StatusBadge domain="goal" value={goal.status} />
          </div>
        </div>
      </Link>
    </Card>
  );
}
