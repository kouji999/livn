"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { EmptyState } from "@/components/ui/states";
import { TaskRow, type TaskRowData } from "@/components/plan/task-row";
import { cn } from "@/lib/cn";
import { TASK_PRESETS } from "./task-filters";
import { TaskComposer } from "./task-composer";

type AreaOption = { id: string; name: string; colorToken: string; iconName: string | null };
type Option = { id: string; title: string };

export function TaskBoard({
  tasks,
  todayKey,
  tomorrowKey,
  counts,
  activeAreaId,
  search,
  areas,
  projects,
  goals,
}: {
  tasks: TaskRowData[];
  todayKey: string;
  tomorrowKey: string;
  counts: { all: number; open: number; today: number; overdue: number; completed: number };
  activeAreaId: string | null;
  search: string;
  areas: AreaOption[];
  projects: Option[];
  goals: Option[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [composerOpen, setComposerOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // "overdue" is a date comparison the database cannot express as a status, so
  // it is resolved here against the same day key the server used.
  const activePreset = searchParams.get("status") ?? "open";

  const visible = useMemo(() => {
    if (activePreset !== "overdue") return tasks;
    return tasks.filter(
      (t) =>
        t.scheduledFor !== null &&
        t.scheduledFor < todayKey &&
        (t.status === "PLANNED" || t.status === "TODAY"),
    );
  }, [tasks, activePreset, todayKey]);

  // Open work is grouped by urgency so the top of the list is always the thing
  // that most needs attention.
  const groups = useMemo(() => {
    const overdue: TaskRowData[] = [];
    const today: TaskRowData[] = [];
    const upcoming: TaskRowData[] = [];
    const undated: TaskRowData[] = [];
    const finished: TaskRowData[] = [];

    for (const task of visible) {
      const isFinished = task.status === "COMPLETED" || task.status === "SKIPPED";
      if (isFinished) {
        finished.push(task);
        continue;
      }
      if (!task.scheduledFor) {
        undated.push(task);
        continue;
      }
      if (task.scheduledFor < todayKey) overdue.push(task);
      else if (task.scheduledFor === todayKey) today.push(task);
      else upcoming.push(task);
    }

    return [
      { key: "overdue", label: "Terlewat", tasks: overdue, tone: "negative" as const },
      { key: "today", label: "Hari ini", tasks: today, tone: "accent" as const },
      { key: "upcoming", label: "Akan datang", tasks: upcoming, tone: "default" as const },
      { key: "undated", label: "Belum dijadwalkan", tasks: undated, tone: "muted" as const },
      { key: "finished", label: "Selesai", tasks: finished, tone: "muted" as const },
    ].filter((group) => group.tasks.length > 0);
  }, [visible, todayKey]);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);

    startTransition(() => {
      router.replace(`/plan/tasks${next.size > 0 ? `?${next.toString()}` : ""}`, {
        scroll: false,
      });
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: presets, area filter, search, add. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Filter status">
          {TASK_PRESETS.map((preset) => {
            const active = activePreset === preset.value;
            const count = counts[preset.countKey];
            return (
              <button
                key={preset.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setParam("status", preset.value === "open" ? null : preset.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-fast",
                  active
                    ? "bg-surface-sunken text-ink"
                    : "text-ink-subtle hover:bg-surface-sunken hover:text-ink",
                )}
              >
                {preset.label}
                <span
                  className={cn(
                    "tabular rounded-sm px-1 text-micro",
                    active ? "bg-surface text-ink-muted" : "text-ink-faint",
                    preset.countKey === "overdue" && count > 0 && "text-negative",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative hidden sm:block">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              type="search"
              defaultValue={search}
              placeholder="Cari tugas..."
              aria-label="Cari tugas"
              onChange={(event) => {
                const value = event.target.value;
                // Debounced by the browser's own input events rather than a
                // timer: the query is cheap and the server dedupes renders.
                setParam("q", value.trim() === "" ? null : value);
              }}
              className="h-8 w-44 rounded-md border border-border-strong bg-surface pl-7 pr-2 text-sm placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>

          <Button
            variant="primary"
            size="sm"
            icon={<Plus />}
            onClick={() => setComposerOpen((open) => !open)}
          >
            Tambah
          </Button>
        </div>
      </div>

      {composerOpen && (
        <Card className="p-4">
          <TaskComposer
            areas={areas}
            projects={projects}
            goals={goals}
            defaultDay={todayKey}
            todayKey={todayKey}
            tomorrowKey={tomorrowKey}
            onDone={() => setComposerOpen(false)}
          />
        </Card>
      )}

      {/* Area filter, shown only when the user actually has more than one. */}
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
          {areas.map((area) => {
            const active = activeAreaId === area.id;
            return (
              <button
                key={area.id}
                type="button"
                onClick={() => setParam("area", active ? null : area.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-micro transition-colors duration-fast",
                  active
                    ? "border-ink-faint bg-surface-sunken text-ink"
                    : "border-border text-ink-subtle hover:border-border-strong hover:text-ink",
                )}
              >
                {area.name}
              </button>
            );
          })}
          {(activeAreaId || search) && (
            <button
              type="button"
              onClick={() => {
                setParam("area", null);
                setParam("q", null);
              }}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-micro text-ink-subtle hover:text-ink"
            >
              <X size={11} />
              Bersihkan filter
            </button>
          )}
        </div>
      )}

      {/* The list itself. */}
      {visible.length === 0 ? (
        <Card className="py-2">
          <EmptyState
            icon={<Plus />}
            title={search ? "Tidak ada tugas yang cocok" : "Belum ada tugas di sini"}
            description={
              search
                ? `Tidak ada hasil untuk "${search}". Coba kata kunci lain.`
                : "Tuliskan satu hal yang perlu kamu lakukan, lalu jadwalkan."
            }
            action={
              !search ? (
                <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setComposerOpen(true)}>
                  Tambah tugas
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setParam("q", null)}>
                  Hapus pencarian
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className={cn("space-y-4", pending && "opacity-70 transition-opacity")}>
          {groups.map((group) => (
            <section key={group.key}>
              <div className="mb-1 flex items-baseline gap-2 px-2">
                <h2
                  className={cn(
                    "text-micro font-semibold uppercase tracking-[0.08em]",
                    group.tone === "negative"
                      ? "text-negative"
                      : group.tone === "accent"
                        ? "text-accent"
                        : "text-ink-faint",
                  )}
                >
                  {group.label}
                </h2>
                <span className="tabular text-micro text-ink-faint">{group.tasks.length}</span>
              </div>

              <Card className="py-1">
                <ul>
                  {group.tasks.map((task) => (
                    <li key={task.id}>
                      <TaskRow
                        task={task}
                        today={todayKey}
                        showDate={group.key !== "today"}
                        onOpen={setOpenTaskId}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}

      {openTaskId && (
        <TaskDetailLink
          taskId={openTaskId}
          tasks={tasks}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </div>
  );
}

/**
 * Detail affordance.
 *
 * A task is edited in a dedicated panel rather than inline, because editing
 * several fields inline inside a list makes the list jump. This renders the
 * link as a small focusable strip so the interaction is discoverable without
 * a modal library.
 */
function TaskDetailLink({
  taskId,
  tasks,
  onClose,
}: {
  taskId: string;
  tasks: TaskRowData[];
  onClose: () => void;
}) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;

  return (
    <div
      role="dialog"
      aria-label={`Detail tugas: ${task.title}`}
      className="fixed inset-x-0 bottom-0 z-modal border-t border-border bg-surface p-4 shadow-overlay motion-safe:animate-fade-up md:inset-x-auto md:right-6 md:bottom-6 md:w-96 md:rounded-lg md:border"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{task.title}</p>
          <p className="mt-0.5 text-xs text-ink-subtle">Buka halaman detail untuk mengubah semua isinya.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="shrink-0 rounded-sm p-1 text-ink-faint hover:bg-surface-sunken hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Link
          href={`/plan/tasks/${task.id}`}
          className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-transparent bg-accent px-3.5 text-sm font-medium text-accent-ink transition-colors duration-fast hover:bg-accent-hover"
        >
          Buka detail
        </Link>
        <Button variant="ghost" size="md" onClick={onClose}>
          Tutup
        </Button>
      </div>
    </div>
  );
}

