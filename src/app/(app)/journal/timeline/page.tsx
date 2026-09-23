import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { Stat, StatStrip } from "@/components/layout/page";
import {
  addCalendarDays,
  formatDayAndMonth,
  formatDayName,
  parseCalendarDay,
  today,
  type CalendarDay,
} from "@/lib/date";
import * as journal from "@/domains/journal/service";
import { TimelineFilters } from "./timeline-filters";
import { cn } from "@/lib/cn";

export const metadata = { title: "Linimasa" };
export const dynamic = "force-dynamic";

/**
 * Global timeline.
 *
 * The long-term memory of the product: what actually happened, in order, from
 * every domain at once. It is deliberately read-only. Anything worth changing
 * has a detail page one tap away, and making this screen editable would turn a
 * record of the past into another list to maintain.
 *
 * The window is chosen with presets rather than an unbounded scroll, because a
 * timeline with no start is not something anyone can read.
 */

const WINDOWS = [
  { value: "7", label: "7 hari" },
  { value: "30", label: "30 hari" },
  { value: "90", label: "3 bulan" },
  { value: "365", label: "Setahun" },
];

const KIND_LABELS: Record<string, string> = {
  event: "Peristiwa",
  journal: "Jurnal",
  task: "Tugas selesai",
  transaction: "Uang",
  milestone: "Milestone",
};

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; kind?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const todayDay = today(user.timeZone);

  const rangeDays = parseRange(params.range);
  const from = addCalendarDays(todayDay, -(rangeDays - 1));

  const kinds = parseKinds(params.kind);

  const [items, stats] = await Promise.all([
    journal.getTimeline(user.id, { from, to: todayDay, kinds, limit: 150 }),
    journal.getTimelineSummary(user.id, from, todayDay),
  ]);

  // Grouped by day so the eye can find "when" without reading every row.
  const grouped = groupByDay(items);

  return (
    <AppShell
      title="Linimasa"
      subtitle={`${rangeDays} hari terakhir`}
      actions={
        <Link
          href="/journal"
          className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-border-strong bg-surface px-2.5 text-xs font-medium text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
        >
          <ArrowLeft size={13} />
          Jurnal
        </Link>
      }
    >
      <div className="space-y-5">
        <StatStrip>
          <Stat label="Peristiwa" value={stats.events} hint="Hal yang kamu catat" />
          <Stat label="Catatan jurnal" value={stats.journals} />
          <Stat label="Tugas selesai" value={stats.tasks} tone="positive" />
          <Stat
            label="Pencapaian"
            value={stats.milestones}
            tone={stats.milestones > 0 ? "positive" : "muted"}
          />
        </StatStrip>

        <TimelineFilters windows={WINDOWS} activeRange={String(rangeDays)} activeKind={params.kind ?? ""} />

        {items.length === 0 ? (
          <Card>
            <EmptyState
              icon={<CalendarDays />}
              title="Belum ada yang tercatat"
              description={
                kinds
                  ? "Coba pilih jenis lain atau lebarkan rentang waktunya."
                  : "Selesaikan tugas, catat peristiwa, atau tulis jurnal — semuanya akan muncul di sini."
              }
            />
          </Card>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <section key={group.date}>
                <div className="mb-2 flex items-baseline gap-3">
                  <h2 className="text-sm font-semibold tracking-tight text-ink">
                    {formatDayAndMonth(group.day)}
                  </h2>
                  <span className="text-micro text-ink-faint">{formatDayName(group.day)}</span>
                  {group.items.length > 1 && (
                    <span className="tabular text-micro text-ink-faint">
                      {group.items.length} kejadian
                    </span>
                  )}
                </div>

                {/* A vertical rule with a node per row: the affordance that makes
                    a list read as a sequence. */}
                <ol className="relative ml-2 border-l border-border pl-5">
                  {group.items.map((item) => (
                    <li key={item.id} className="relative pb-3 last:pb-0">
                      <span
                        aria-hidden
                        className={cn(
                          "absolute -left-[1.4375rem] top-1.5 flex size-3 items-center justify-center rounded-full border-2 border-canvas",
                          item.isMilestone
                            ? "bg-accent"
                            : item.kind === "transaction"
                              ? item.amount?.startsWith("+")
                                ? "bg-positive"
                                : "bg-negative"
                              : "bg-ink-faint",
                        )}
                      />
                      <TimelineRow item={item} />
                    </li>
                  ))}
                </ol>
              </section>
            ))}

            {items.length >= 150 && (
              <p className="text-center text-micro text-ink-faint">
                Menampilkan 150 kejadian terbaru. Pilih rentang yang lebih pendek untuk detail lebih lama.
              </p>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function TimelineRow({
  item,
}: {
  item: Awaited<ReturnType<typeof journal.getTimeline>>[number];
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-ink">{item.title}</p>
        {item.amount && (
          <span
            className={cn(
              "tabular shrink-0 text-sm font-medium",
              item.amount.startsWith("+") ? "text-positive" : "text-negative",
            )}
          >
            {formatAmount(item.amount)}
          </span>
        )}
      </div>

      {(item.detail || item.category) && (
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-micro text-ink-faint">
          <span>{KIND_LABELS[item.kind] ?? item.kind}</span>
          {item.category && item.kind === "event" && (
            <span>{categoryLabel(item.category)}</span>
          )}
          {item.detail && <span className="truncate">{item.detail}</span>}
        </p>
      )}
    </>
  );

  // Only wrap in a link when the item has somewhere to go. A plain div keeps
  // the row from looking interactive when it is not.
  if (!item.href) {
    return <div className="rounded-md px-3 py-2.5">{content}</div>;
  }

  return (
    <Link
      href={item.href}
      className="block rounded-md transition-colors duration-fast hover:bg-surface-sunken"
    >
      <div className="px-3 py-2.5">{content}</div>
    </Link>
  );
}

function groupByDay(
  items: Awaited<ReturnType<typeof journal.getTimeline>>,
): Array<{ date: string; day: CalendarDay; items: typeof items }> {
  const map = new Map<string, typeof items>();
  for (const item of items) {
    const bucket = map.get(item.date) ?? [];
    bucket.push(item);
    map.set(item.date, bucket);
  }

  return [...map.entries()].map(([date, dayItems]) => ({
    date,
    day: parseCalendarDay(date) ?? today(),
    items: dayItems,
  }));
}

function parseRange(value: string | undefined): number {
  const allowed = [7, 30, 90, 365];
  const parsed = Number(value);
  return allowed.includes(parsed) ? parsed : 30;
}

function parseKinds(
  value: string | undefined,
): Array<"event" | "journal" | "task" | "transaction" | "milestone"> | undefined {
  if (!value) return undefined;
  const valid = value
    .split(",")
    .filter((v): v is "event" | "journal" | "task" | "transaction" | "milestone" =>
      ["event", "journal", "task", "transaction", "milestone"].includes(v),
    );
  return valid.length > 0 ? valid : undefined;
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    HEALTH: "Kesehatan",
    CAREER: "Karier",
    FINANCE: "Keuangan",
    RELATIONSHIP: "Hubungan",
    LEARNING: "Pembelajaran",
    BUSINESS: "Bisnis",
    PERSONAL: "Pribadi",
    MILESTONE: "Pencapaian",
    OTHER: "Lainnya",
  };
  return labels[category] ?? category;
}

/** Renders a raw minor-unit amount as grouped money without a currency lookup. */
function formatAmount(raw: string): string {
  const sign = raw.startsWith("+") ? "+" : raw.startsWith("-") ? "-" : "";
  const digits = raw.replace(/[^\d]/g, "");
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}Rp ${grouped}`;
}
