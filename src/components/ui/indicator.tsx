import { cn } from "@/lib/cn";
import { colorVar } from "@/lib/tokens";
import type { ReactNode } from "react";

/**
 * Badge, status dot and progress bar.
 *
 * These three replace most of what would otherwise become bespoke decoration:
 * a state shown as a word, a state shown as a dot, and a measured amount shown
 * as a bar. All three derive colour from design tokens.
 */

export type BadgeTone = "neutral" | "accent" | "positive" | "negative" | "warning" | "info";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "border-border text-ink-muted bg-surface-sunken",
  accent: "border-accent/25 text-accent bg-accent-soft",
  positive: "border-positive/25 text-positive bg-positive-soft",
  negative: "border-negative/25 text-negative bg-negative-soft",
  warning: "border-warning/25 text-warning bg-warning-soft",
  info: "border-info/25 text-info bg-info-soft",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  dot,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-micro font-medium leading-none",
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** A single colour chip representing a record's colour token. */
export function ColorDot({
  token,
  size = 8,
  className,
  title,
}: {
  token?: string | null;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      aria-hidden={!title}
      title={title}
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{ width: size, height: size, backgroundColor: colorVar(token) }}
    />
  );
}

/**
 * Progress bar.
 *
 * `value` is 0..1 and is clamped: derived metrics can legitimately overshoot
 * (spending past a budget) and a bar rendering at 140% would break layout. The
 * overflow is communicated by the tone instead.
 */
export function ProgressBar({
  value,
  token,
  className,
  height = 6,
  tone,
  label,
}: {
  value: number;
  token?: string | null;
  className?: string;
  height?: number;
  tone?: "auto" | "positive" | "warning" | "negative";
  label?: string;
}) {
  const safe = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const pct = Math.round(safe * 100);

  const resolvedTone = tone && tone !== "auto" ? tone : undefined;
  const color =
    resolvedTone === "positive"
      ? "var(--color-positive)"
      : resolvedTone === "warning"
        ? "var(--color-warning)"
        : resolvedTone === "negative"
          ? "var(--color-negative)"
          : colorVar(token);

  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("w-full overflow-hidden rounded-full bg-surface-sunken", className)}
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-slow ease-emphasized"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

/** Compact metric comparison: a number plus a signed delta from a baseline. */
export function Delta({
  value,
  format = (n) => String(n),
  invert = false,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  /** Set for metrics where "up" is bad, such as expenses. */
  invert?: boolean;
  className?: string;
}) {
  if (value === 0) {
    return <span className={cn("text-xs text-ink-faint", className)}>-</span>;
  }
  const good = invert ? value < 0 : value > 0;
  return (
    <span
      className={cn(
        "tabular text-xs font-medium",
        good ? "text-positive" : "text-negative",
        className,
      )}
    >
      {value > 0 ? "+" : ""}
      {format(value)}
    </span>
  );
}
