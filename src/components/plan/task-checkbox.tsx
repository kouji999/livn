"use client";

import { useOptimistic, useTransition, type ReactNode } from "react";
import { Check, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";
import { toggleTaskAction } from "@/domains/plan/actions";

/**
 * Task checkbox.
 *
 * The product's most used control, so it is built for three things at once:
 *
 *   • Immediate feedback. The box flips on click via an optimistic value
 *     rather than waiting for the server round trip.
 *   • Honest failure. If the write fails the box reverts and a toast explains
 *     why — a silently reverted checkbox is worse than a slow one.
 *   • Keyboard parity. It is a real button with a label, not a styled div, so
 *     space and enter work and screen readers announce the state.
 */
export function TaskCheckbox({
  taskId,
  completed,
  title,
  size = "md",
  className,
}: {
  taskId: string;
  completed: boolean;
  /** Used to build the accessible name, e.g. "Tandai selesai: Baca buku". */
  title: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [optimisticCompleted, setOptimisticCompleted] = useOptimistic(
    completed,
    (_current, next: boolean) => next,
  );

  function handleClick() {
    startTransition(async () => {
      setOptimisticCompleted(!optimisticCompleted);

      const result = await toggleTaskAction({ id: taskId });
      if (!result.ok) {
        // The optimistic value is discarded automatically when the transition
        // ends without the server state changing, so no manual revert is
        // needed — only an explanation.
        toast.error("Gagal memperbarui tugas", result.error.message);
      }
    });
  }

  const boxSize = size === "sm" ? "size-4" : "size-[18px]";
  const iconSize = size === "sm" ? 11 : 12;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={optimisticCompleted}
      aria-label={`${optimisticCompleted ? "Batalkan selesai" : "Tandai selesai"}: ${title}`}
      className={cn(
        "group/check relative flex shrink-0 items-center justify-center rounded-full border transition-colors duration-fast ease-standard",
        boxSize,
        optimisticCompleted
          ? "border-positive bg-positive text-white"
          : "border-border-strong bg-surface hover:border-accent hover:bg-accent-soft",
        pending && "opacity-70",
        className,
      )}
    >
      {pending && !optimisticCompleted ? (
        <Loader2 size={iconSize} className="animate-spin text-accent" />
      ) : optimisticCompleted ? (
        <Check size={iconSize} strokeWidth={3} />
      ) : (
        <Circle
          size={iconSize}
          strokeWidth={0}
          className="opacity-0 transition-opacity duration-fast group-hover/check:opacity-30"
          fill="currentColor"
        />
      )}
    </button>
  );
}

/**
 * Checkbox for a habit on a specific day.
 *
 * Separate from `TaskCheckbox` because the write is keyed by habit *and day*
 * rather than by a single row, and because a habit log is a record of
 * something that happened rather than a status on a task.
 */
export function HabitCheckbox({
  habitId,
  date,
  completed,
  title,
  onToggle,
  className,
}: {
  habitId: string;
  date: string;
  completed: boolean;
  title: string;
  onToggle: (habitId: string, date: string, next: boolean) => Promise<boolean>;
  className?: string;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [optimisticCompleted, setOptimisticCompleted] = useOptimistic(
    completed,
    (_current, next: boolean) => next,
  );

  function handleClick() {
    startTransition(async () => {
      setOptimisticCompleted(!optimisticCompleted);
      const ok = await onToggle(habitId, date, !optimisticCompleted);
      if (!ok) toast.error("Gagal menyimpan kebiasaan", "Coba lagi sebentar.");
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={optimisticCompleted}
      aria-label={`${optimisticCompleted ? "Batalkan" : "Tandai"} ${title} pada ${date}`}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors duration-fast",
        optimisticCompleted
          ? "border-positive bg-positive text-white"
          : "border-border bg-surface-sunken text-transparent hover:border-accent",
        pending && "opacity-70",
        className,
      )}
    >
      <Check size={14} strokeWidth={3} />
    </button>
  );
}

/** Small row of labels that describe where a task sits in the hierarchy. */
export function TaskMeta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1 text-micro text-ink-subtle", className)}>
      {children}
    </div>
  );
}
