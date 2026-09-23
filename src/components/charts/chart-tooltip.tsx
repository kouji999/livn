"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Chart tooltips.
 *
 * A single tooltip element per chart region rather than one per bar: twenty
 * tooltips in the DOM for a twenty-bar chart is twenty times the work for one
 * visible at a time, and they fight each other for z-order.
 *
 * Positioning is relative to the chart's own container, measured on hover, so it
 * needs no layout query at render time and no effect that could flash.
 */

type TooltipContent = {
  label: string;
  value: string;
  caption?: string;
};

type TooltipApi = {
  show: (event: { currentTarget: HTMLElement }, content: TooltipContent) => void;
  hide: () => void;
};

const TooltipContext = createContext<TooltipApi | null>(null);

export function useTooltip(): TooltipApi {
  const context = useContext(TooltipContext);
  // A chart rendered outside a provider still works; it simply has no tooltip.
  // Throwing here would make the charts unusable in isolation, which is worse
  // than missing a hover affordance.
  return context ?? { show: () => {}, hide: () => {} };
}

export function ChartTooltipProvider({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [content, setContent] = useState<TooltipContent | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const api = useMemo<TooltipApi>(
    () => ({
      show: (event, next) => {
        const target = event.currentTarget;
        const container = target.closest("[data-chart-root]") as HTMLElement | null;
        const targetBox = target.getBoundingClientRect();

        if (container) {
          const containerBox = container.getBoundingClientRect();
          setPosition({
            x: targetBox.left - containerBox.left + targetBox.width / 2,
            y: targetBox.top - containerBox.top,
          });
        } else {
          setPosition({ x: targetBox.left, y: targetBox.top });
        }

        setContent(next);
      },
      hide: () => setContent(null),
    }),
    [],
  );

  return (
    <TooltipContext.Provider value={api}>
      <div className={cn("relative", className)} data-chart-root>
        {children}

        {content && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-tooltip -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-raised"
            style={{ left: position.x, top: position.y - 6 }}
          >
            <p className="tabular font-medium text-ink">{content.value}</p>
            <p className="mt-0.5 whitespace-nowrap text-micro text-ink-subtle">
              {content.caption ? `${content.caption} - ${content.label}` : content.label}
            </p>
          </div>
        )}
      </div>
    </TooltipContext.Provider>
  );
}
