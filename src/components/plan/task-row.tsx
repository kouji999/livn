"use client";

import Link from "next/link";
import { CalendarDays, ChevronRight, Flag, Target } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCalendarDay, formatDayAndMonth, relativeDayLabel, toCalendarDay } from "@/lib/date";
import { ColorDot } from "@/components/ui/indicator";
import { TaskCheckbox, TaskMeta } from "./task-checkbox";
import { statusMeta } from "@/components/ui/status";

/**
 * A single task row.
 *
 * Structure is deliberately flat — one line of title, one line of metadata —
 * so that a list of twenty tasks stays scannable. Nothing here fetches data;
 * every value is passed in, which keeps the row cheap to render in a long list.
 */

export type TaskRowData = {
  id: string;
  title: string;
  status: string;
  priority: string;
  scheduledFor: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  area: { id: string; name: string; colorToken: string } | null;
  goal: { id: string; title: string } | null;
  project: { id: string; title: string; status: string } | null;
};

export function TaskRow({
  task,
  today,
  showDate,
  onOpen,
  className,
}: {
  task: TaskRowData;
  /** The reference day, as `YYYY-MM-DD`, for relative date labels. */
  today: string;
  showDate?: boolean;
  onOpen?: (taskId: string) => void;
  className?: string;
}) {
  const completed = task.status === "COMPLETED";
  const skipped = task.status === "SKIPPED";
  const priority = statusMeta("priority", task.priority);

  const referenceDay = toCalendarDay(new Date());
  const scheduledDay = task.scheduledFor ? toCalendarDay(new Date(task.scheduledFor)) : null;
  const dueDay = task.dueDate ? toCalendarDay(new Date(task.dueDate)) : null;

  const isOverdue =
    !completed &&
    !skipped &&
    scheduledDay !== null &&
    formatCalendarDay(scheduledDay) < today;

  const priorityIsMeaningful = task.priority === "HIGH" || task.priority === "URGENT";

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors duration-fast ease-standard hover:bg-surface-sunken",
        className,
      )}
    >
      <TaskCheckbox taskId={task.id} completed={completed} title={task.title} className="mt-0.5" />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => onOpen?.(task.id)}
            className={cn(
              "block min-w-0 flex-1 text-left text-sm leading-snug transition-colors duration-fast",
              completed
                ? "text-ink-faint line-through decoration-ink-faint/50"
                : skipped
                  ? "text-ink-faint"
                  : "text-ink group-hover:text-ink",
            )}
          >
            {task.title}
          </button>

          {onOpen && (
            <ChevronRight
              size={14}
              className="mt-0.5 shrink-0 text-ink-faint opacity-0 transition-opacity duration-fast group-hover:opacity-100"
              aria-hidden
            />
          )}
        </div>

        {(task.area || task.project || task.goal || priorityIsMeaningful || showDate || task.estimatedMinutes) && (
          <TaskMeta className="mt-1">
            {showDate && scheduledDay && (
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  isOverdue && "font-medium text-negative",
                )}
              >
                <CalendarDays size={11} aria-hidden />
                {isOverdue
                  ? `Terlewat - ${formatDayAndMonth(scheduledDay)}`
                  : relativeDayLabel(scheduledDay, referenceDay)}
              </span>
            )}

            {!showDate && dueDay && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={11} aria-hidden />
                Tenggat {formatDayAndMonth(dueDay)}
              </span>
            )}

            {priorityIsMeaningful && !completed && (
              <span className="inline-flex items-center gap-1">
                <Flag size={11} aria-hidden />
                {priority.label}
              </span>
            )}

            {task.project && (
              <Link
                href={`/plan/projects/${task.project.id}`}
                className="inline-flex items-center gap-1 hover:text-ink hover:underline"
              >
                <ColorDot token={task.area?.colorToken} size={6} />
                {task.project.title}
              </Link>
            )}

            {!task.project && task.goal && (
              <span className="inline-flex items-center gap-1">
                <Target size={11} aria-hidden />
                {task.goal.title}
              </span>
            )}

            {!task.project && !task.goal && task.area && (
              <span className="inline-flex items-center gap-1">
                <ColorDot token={task.area.colorToken} size={6} />
                {task.area.name}
              </span>
            )}

            {task.estimatedMinutes && (
              <span className="tabular">
                {task.estimatedMinutes >= 60
                  ? `${Math.floor(task.estimatedMinutes / 60)}j${task.estimatedMinutes % 60 ? ` ${task.estimatedMinutes % 60}m` : ""}`
                  : `${task.estimatedMinutes}m`}
              </span>
            )}
          </TaskMeta>
        )}
      </div>
    </div>
  );
}

/** An empty slot that keeps list height stable while data loads. */
export function TaskRowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-2 py-2.5">
      <div className="mt-0.5 size-[18px] shrink-0 rounded-full bg-surface-sunken" />
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="h-3.5 w-3/5 rounded-sm bg-surface-sunken" />
        <div className="h-2.5 w-2/5 rounded-sm bg-surface-sunken" />
      </div>
    </div>
  );
}
