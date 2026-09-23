import { cn } from "@/lib/cn";

/**
 * Shared layout for a page that is a list of work.
 *
 * Extracting this keeps every plan surface identical in rhythm: a header with
 * actions, optional filter row, then the content column. Without it, each page
 * drifts a few pixels and the product stops feeling like one thing.
 */
export function PageStack({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-5", className)}>{children}</div>;
}

/** Two-column layout used by list pages that have a side panel. */
export function PageSplit({
  main,
  side,
}: {
  main: React.ReactNode;
  side: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-5">{main}</div>
      <aside className="space-y-5 lg:sticky lg:top-[4.5rem] lg:self-start">{side}</aside>
    </div>
  );
}

/** A count with a label, used in summary strips. */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "positive" | "negative" | "muted";
  className?: string;
}) {
  const toneClass = {
    default: "text-ink",
    positive: "text-positive",
    negative: "text-negative",
    muted: "text-ink-subtle",
  }[tone];

  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-micro font-medium uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </p>
      <p className={cn("tabular mt-1 text-xl font-semibold tracking-tight", toneClass)}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p>}
    </div>
  );
}

/** Horizontal strip of stats separated by rules. */
export function StatStrip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Two columns until there is genuinely room for four. At 768px a
        // four-column strip gives each cell about 170px, which is narrower than
        // "Rp 10.540.000" and forces a wrap that breaks the strip's alignment.
        "grid grid-cols-2 gap-x-4 gap-y-4 border-y border-border-subtle py-4",
        "md:grid-cols-3 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
