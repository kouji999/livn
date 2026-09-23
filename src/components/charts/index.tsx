"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { useTooltip } from "./chart-tooltip";

/**
 * Charts.
 *
 * Hand-built SVG rather than a charting library. The three shapes the product
 * needs — a bar series, a line, and a share bar — are a few dozen lines each,
 * and the alternative is a dependency larger than the rest of the application
 * combined, whose defaults fight the design tokens.
 *
 * Every chart here is decorative in the accessibility sense: the same numbers
 * appear as text beside it. That is why they are `aria-hidden` rather than
 * carrying a long description, and why none of them is the only place a figure
 * can be read.
 */

export type SeriesDatum = { label: string; value: number; caption?: string };

/**
 * A single bar series.
 *
 * Values are plotted against the maximum in the set rather than a fixed scale,
 * so a week of small numbers still shows a shape. The trade-off is that two
 * charts of different magnitudes are not directly comparable, which is why each
 * one carries its own maximum in the caption.
 */
export function BarChart({
  data,
  token = "accent",
  height = 120,
  className,
  valueFormatter = (v) => String(v),
  emptyLabel = "Belum ada data",
}: {
  data: SeriesDatum[];
  token?: string;
  height?: number;
  className?: string;
  valueFormatter?: (value: number) => string;
  emptyLabel?: string;
}) {
  const gradientId = useId();
  const tooltip = useTooltip();

  if (data.length === 0) {
    return (
      <p className={cn("py-8 text-center text-xs text-ink-faint", className)}>{emptyLabel}</p>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 0);

  if (max === 0) {
    return (
      <p className={cn("py-8 text-center text-xs text-ink-faint", className)}>
        Semua nilai nol pada rentang ini.
      </p>
    );
  }

  return (
    <div className={cn("relative", className)} aria-hidden>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((datum, index) => {
          const ratio = datum.value / max;
          // A small floor keeps a non-zero day visible rather than drawing a
          // hairline that reads as nothing.
          const percent = datum.value === 0 ? 0 : Math.max(ratio * 100, 3);

          return (
            <button
              key={`${datum.label}-${index}`}
              type="button"
              tabIndex={-1}
              className="group relative flex h-full flex-1 items-end"
              onMouseEnter={(event) =>
                tooltip.show(event, {
                  label: datum.label,
                  value: valueFormatter(datum.value),
                  caption: datum.caption,
                })
              }
              onMouseLeave={tooltip.hide}
            >
              <span
                className="w-full rounded-t-sm transition-colors duration-fast"
                style={{
                  height: `${percent}%`,
                  background: `linear-gradient(to top, var(--color-${token}), color-mix(in srgb, var(--color-${token}) 70%, transparent))`,
                }}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between text-micro text-ink-faint">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>

      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id={gradientId} />
        </defs>
      </svg>
    </div>
  );
}

/**
 * Two overlapped bar series, for money in and money out.
 *
 * Grouped rather than stacked: income and expense are independent quantities,
 * and stacking them would imply they sum to something meaningful when they do
 * not.
 */
export function PairedBarChart({
  data,
  height = 130,
  className,
  formatValue,
  positiveLabel = "Masuk",
  negativeLabel = "Keluar",
}: {
  data: Array<{ label: string; positive: number; negative: number }>;
  height?: number;
  className?: string;
  formatValue: (value: number) => string;
  positiveLabel?: string;
  negativeLabel?: string;
}) {
  const tooltip = useTooltip();

  if (data.length === 0) {
    return <p className={cn("py-8 text-center text-xs text-ink-faint", className)}>Belum ada data</p>;
  }

  const max = Math.max(...data.flatMap((d) => [d.positive, d.negative]), 0);

  if (max === 0) {
    return (
      <p className={cn("py-8 text-center text-xs text-ink-faint", className)}>
        Belum ada pemasukan atau pengeluaran pada rentang ini.
      </p>
    );
  }

  return (
    <div className={cn("relative", className)} aria-hidden>
      <div className="flex items-end gap-[5px]" style={{ height }}>
        {data.map((datum, index) => (
          <div
            key={`${datum.label}-${index}`}
            className="flex h-full flex-1 items-end justify-center gap-px"
          >
            <button
              type="button"
              tabIndex={-1}
              className="group flex h-full w-1/2 items-end"
              onMouseEnter={(event) =>
                tooltip.show(event, {
                  label: datum.label,
                  value: formatValue(datum.positive),
                  caption: positiveLabel,
                })
              }
              onMouseLeave={tooltip.hide}
            >
              <span
                className="w-full rounded-t-sm bg-positive/75 transition-colors duration-fast group-hover:bg-positive"
                style={{
                  height: `${datum.positive === 0 ? 0 : Math.max((datum.positive / max) * 100, 3)}%`,
                }}
              />
            </button>
            <button
              type="button"
              tabIndex={-1}
              className="group flex h-full w-1/2 items-end"
              onMouseEnter={(event) =>
                tooltip.show(event, {
                  label: datum.label,
                  value: formatValue(datum.negative),
                  caption: negativeLabel,
                })
              }
              onMouseLeave={tooltip.hide}
            >
              <span
                className="w-full rounded-t-sm bg-negative/65 transition-colors duration-fast group-hover:bg-negative"
                style={{
                  height: `${datum.negative === 0 ? 0 : Math.max((datum.negative / max) * 100, 3)}%`,
                }}
              />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between text-micro text-ink-faint">
        <span>{data[0].label}</span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-sm bg-positive/75" />
            {positiveLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-sm bg-negative/65" />
            {negativeLabel}
          </span>
        </span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}

/**
 * A single horizontal share bar with labelled segments.
 *
 * Used where the question is "how is this split", such as the composition of a
 * month's spending. Segments under two percent are grouped into "lainnya",
 * because a sliver too thin to label is noise rather than information.
 */
export function ShareBar({
  segments,
  height = 10,
  className,
}: {
  segments: Array<{ label: string; value: number; token: string }>;
  height?: number;
  className?: string;
}) {
  const tooltip = useTooltip();
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total <= 0) {
    return (
      <div
        className={cn("rounded-full bg-surface-sunken", className)}
        style={{ height }}
        aria-hidden
      />
    );
  }

  // Anything below this share is merged: an unlabelled sliver reads as a
  // rendering artefact.
  const MIN_SHARE = 0.02;
  const visible: typeof segments = [];
  let rest = 0;

  for (const segment of segments) {
    if (segment.value / total < MIN_SHARE) rest += segment.value;
    else visible.push(segment);
  }
  if (rest > 0) visible.push({ label: "Lainnya", value: rest, token: "neutral" });

  return (
    <div
      className={cn("flex overflow-hidden rounded-full", className)}
      style={{ height }}
      aria-hidden
    >
      {visible.map((segment, index) => (
        <button
          key={`${segment.label}-${index}`}
          type="button"
          tabIndex={-1}
          className="group h-full transition-opacity duration-fast hover:opacity-85"
          style={{
            width: `${(segment.value / total) * 100}%`,
            backgroundColor: `var(--color-${segment.token})`,
          }}
          onMouseEnter={(event) =>
            tooltip.show(event, {
              label: segment.label,
              value: `${Math.round((segment.value / total) * 100)}%`,
            })
          }
          onMouseLeave={tooltip.hide}
        >
          <span className="sr-only">{segment.label}</span>
        </button>
      ))}
    </div>
  );
}

/** A horizontal progress row with a label, used for ranked lists. */
export function RankedBar({
  label,
  value,
  max,
  displayValue,
  token = "accent",
  caption,
  className,
}: {
  label: string;
  value: number;
  max: number;
  displayValue: string;
  token?: string;
  caption?: string;
  className?: string;
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-ink">{label}</span>
        <span className="tabular shrink-0 text-xs font-medium text-ink-muted">{displayValue}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
        <div
          className="h-full rounded-full transition-[width] duration-slow ease-emphasized"
          style={{ width: `${ratio * 100}%`, backgroundColor: `var(--color-${token})` }}
        />
      </div>
      {caption && <p className="text-micro text-ink-faint">{caption}</p>}
    </div>
  );
}
