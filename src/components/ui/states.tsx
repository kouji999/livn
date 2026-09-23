import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * Empty, error and loading states.
 *
 * Every list, card and page has three non-happy paths and each one needs a
 * considered design. Centralising them here means no screen silently renders
 * nothing when a query returns zero rows.
 */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 py-8" : "gap-3 py-14",
        className,
      )}
    >
      {icon && (
        <div className="mb-1 flex size-9 items-center justify-center rounded-full border border-border bg-surface-sunken text-ink-faint [&>svg]:size-4">
          {icon}
        </div>
      )}
      <p className={cn("font-medium text-ink", compact ? "text-sm" : "text-base")}>{title}</p>
      {description && (
        <p className="max-w-[38ch] text-sm leading-relaxed text-ink-subtle">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Terjadi kesalahan",
  description,
  action,
  className,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-negative/30 bg-negative-soft px-6 py-10 text-center",
        className,
      )}
    >
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && (
        <p className="max-w-[44ch] text-sm text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/**
 * Skeleton block.
 *
 * A shimmer that respects reduced motion; without it the bar simply sits
 * still, which still reads as "content is coming".
 */
export function Skeleton({
  className,
  rounded = "rounded-sm",
}: {
  className?: string;
  rounded?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden bg-surface-sunken",
        rounded,
        className,
      )}
    >
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-black/[0.04] to-transparent motion-safe:animate-shimmer" />
    </div>
  );
}

/** Placeholder for a list of rows while data loads. */
export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  // Varied widths read as real content rather than a loading pattern.
  const widths = ["w-3/5", "w-4/5", "w-2/5", "w-3/4", "w-1/2"];
  return (
    <div className={cn("space-y-2.5", className)} role="status" aria-label="Memuat">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-4 shrink-0" rounded="rounded-full" />
          <Skeleton className={cn("h-3.5", widths[i % widths.length])} />
        </div>
      ))}
    </div>
  );
}
