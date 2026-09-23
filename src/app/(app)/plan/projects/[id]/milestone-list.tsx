"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatShortDate } from "@/lib/format";
import {
  createMilestoneAction,
  deleteMilestoneAction,
  updateMilestoneAction,
} from "@/domains/plan/actions";
import { ConfirmAction } from "@/components/ui/confirm-action";

/**
 * Milestone list.
 *
 * Completion is a single tap because that is the only routine action here.
 * Deleting is confirmed and states plainly that the tasks survive, since that
 * is the thing a user would worry about.
 */

type MilestoneRow = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  completedAt: string | null;
  taskCount: number;
};

export function MilestoneList({
  projectId,
  milestones,
  todayKey,
}: {
  projectId: string;
  milestones: MilestoneRow[];
  todayKey: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");

  function toggle(milestone: MilestoneRow) {
    startTransition(async () => {
      const result = await updateMilestoneAction({
        id: milestone.id,
        completed: milestone.completedAt === null,
      });
      if (!result.ok) {
        toast.error("Gagal mengubah milestone", result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function add() {
    if (!title.trim()) return;
    startTransition(async () => {
      const result = await createMilestoneAction({
        projectId,
        title: title.trim(),
        dueDate: dueDate || undefined,
      });
      if (!result.ok) {
        toast.error("Gagal menambah milestone", result.error.message);
        return;
      }
      toast.success("Milestone ditambahkan");
      setTitle("");
      setDueDate("");
      setAdding(false);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteMilestoneAction({ id });
      if (!result.ok) {
        toast.error("Gagal menghapus", result.error.message);
        return;
      }
      toast.success("Milestone dihapus");
      router.refresh();
    });
  }

  const completed = milestones.filter((m) => m.completedAt !== null).length;

  return (
    <div className={cn("space-y-2", pending && "opacity-70")}>
      {milestones.length === 0 && !adding && (
        <p className="py-3 text-center text-xs text-ink-subtle">
          Belum ada milestone. Milestone membantu memecah proyek jadi tahapan yang jelas.
        </p>
      )}

      {milestones.length > 0 && (
        <ul className="space-y-0.5">
          {milestones.map((milestone) => {
            const done = milestone.completedAt !== null;
            const overdue =
              !done && milestone.dueDate !== null && milestone.dueDate < todayKey;

            return (
              <li key={milestone.id} className="group flex items-start gap-2.5 rounded-md px-2 py-2 hover:bg-surface-sunken">
                <button
                  type="button"
                  onClick={() => toggle(milestone)}
                  aria-pressed={done}
                  aria-label={`${done ? "Batalkan" : "Tandai selesai"}: ${milestone.title}`}
                  className={cn(
                    "mt-0.5 flex size-[17px] shrink-0 items-center justify-center rounded-full border transition-colors duration-fast",
                    done
                      ? "border-positive bg-positive text-white"
                      : "border-border-strong hover:border-accent hover:bg-accent-soft",
                  )}
                >
                  {done && <Check size={11} strokeWidth={3} />}
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={
                      done
                        ? "text-sm text-ink-faint line-through"
                        : "text-sm text-ink"
                    }
                  >
                    {milestone.title}
                  </p>
                  {milestone.description && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-ink-subtle">
                      {milestone.description}
                    </p>
                  )}
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-micro text-ink-faint">
                    {milestone.dueDate && (
                      <span className={overdue ? "font-medium text-negative" : undefined}>
                        {overdue ? "Lewat " : "Tenggat "}
                        {formatShortDate(milestone.dueDate)}
                      </span>
                    )}
                    {milestone.taskCount > 0 && <span>{milestone.taskCount} tugas</span>}
                  </p>
                </div>

                <div className="shrink-0 opacity-0 transition-opacity duration-fast group-hover:opacity-100 focus-within:opacity-100">
                  <ConfirmAction
                    title={`Hapus milestone "${milestone.title}"?`}
                    description="Tugas di dalamnya tetap ada dan kembali ke proyek ini."
                    confirmLabel="Hapus milestone"
                    onConfirm={() => remove(milestone.id)}
                    variant="ghost"
                    size="sm"
                  >
                    <Trash2 size={13} />
                  </ConfirmAction>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {milestones.length > 0 && (
        <p className="tabular px-2 text-micro text-ink-faint">
          {completed} dari {milestones.length} selesai
        </p>
      )}

      {adding ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <Input
            label="Nama milestone"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Contoh: Riset kompetitor"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") setAdding(false);
            }}
          />
          <Input
            label="Tenggat"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={add} loading={pending} disabled={!title.trim()}>
              Tambah
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)} disabled={pending}>
              Batal
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => setAdding(true)}>
          Tambah milestone
        </Button>
      )}
    </div>
  );
}
