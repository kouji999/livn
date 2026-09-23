"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { X } from "lucide-react";

/**
 * Timeline filters.
 *
 * Two independent axes, both in the URL so a view is linkable: how far back to
 * look, and which kinds of event to include. The range presets are fixed rather
 * than a free date picker because the useful questions ("this week", "this
 * month") have known answers, and a picker would invite windows too wide to
 * read.
 */

const KINDS = [
  { value: "event", label: "Peristiwa" },
  { value: "journal", label: "Jurnal" },
  { value: "task", label: "Tugas" },
  { value: "transaction", label: "Uang" },
  { value: "milestone", label: "Milestone" },
];

export function TimelineFilters({
  windows,
  activeRange,
  activeKind,
}: {
  windows: Array<{ value: string; label: string }>;
  activeRange: string;
  activeKind: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const selectedKinds = activeKind ? activeKind.split(",").filter(Boolean) : [];

  function setParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    startTransition(() => {
      router.replace(`/journal/timeline${next.size ? `?${next.toString()}` : ""}`, {
        scroll: false,
      });
    });
  }

  function toggleKind(kind: string) {
    const isSelected = selectedKinds.includes(kind);

    // Selecting every kind is the same as selecting none, so the URL stays
    // clean rather than encoding the default explicitly.
    const next = isSelected
      ? selectedKinds.filter((k) => k !== kind)
      : KINDS.map((k) => k.value).filter((k) => k === kind || selectedKinds.includes(k));

    setParams({ kind: next.length === KINDS.length ? null : next.join(",") });
  }

  return (
    <div className={cn("space-y-2.5", pending && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="tablist" aria-label="Rentang waktu">
          {windows.map((window) => {
            const active = activeRange === window.value;
            return (
              <button
                key={window.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setParams({ range: window.value === "30" ? null : window.value })}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-fast",
                  active
                    ? "bg-surface-sunken text-ink"
                    : "text-ink-subtle hover:bg-surface-sunken hover:text-ink",
                )}
              >
                {window.label}
              </button>
            );
          })}
        </div>

        {selectedKinds.length > 0 && (
          <button
            type="button"
            onClick={() => setParams({ kind: null })}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-micro text-ink-subtle hover:text-ink"
          >
            <X size={11} />
            Tampilkan semua jenis
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-micro text-ink-faint">Jenis:</span>
        {KINDS.map((kind) => {
          const active = selectedKinds.includes(kind.value);
          return (
            <button
              key={kind.value}
              type="button"
              aria-pressed={active}
              onClick={() => toggleKind(kind.value)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-micro transition-colors duration-fast",
                active
                  ? "border-ink-faint bg-surface-sunken text-ink"
                  : "border-border text-ink-subtle hover:border-border-strong hover:text-ink",
              )}
            >
              {kind.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
