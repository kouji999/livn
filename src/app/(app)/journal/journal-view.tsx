"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  Flame,
  Plus,
  Search,
  Smile,
  Sparkles,
  X,
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Stat, StatStrip } from "@/components/layout/page";
import { cn } from "@/lib/cn";
import { formatShortDate, formatShortDateWithYear } from "@/lib/format";
import { JournalEditor } from "./journal-editor";
import { LifeEventComposer } from "./life-event-composer";

/**
 * Journal view.
 *
 * Two columns on desktop: today's writing on the left, history on the right.
 * On a phone the editor comes first and the history collapses below it, because
 * writing is the reason someone opened the page.
 */

type EntryItem = {
  id: string;
  title: string;
  body: string;
  mood: number | null;
  energy: number | null;
  focus: number | null;
  wentWell: string;
  wentPoorly: string;
  changeNext: string;
  tags: string[];
  goalIds: string[];
  projectIds: string[];
};

type RecentItem = {
  id: string;
  date: string;
  title: string | null;
  excerpt: string;
  mood: number | null;
  energy: number | null;
  focus: number | null;
  tags: string[];
  hasMoodEntry: boolean;
};

type EventItem = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  isMilestone: boolean;
  goalTitle: string | null;
  projectTitle: string | null;
};

export function JournalView({
  todayKey,
  selectedDate,
  entry,
  events,
  recent,
  recentTotal,
  stats,
  tags,
  activeTag,
  search,
  areas,
  goals,
  projects,
}: {
  todayKey: string;
  selectedDate: string;
  entry: EntryItem | null;
  events: EventItem[];
  recent: RecentItem[];
  recentTotal: number;
  stats: {
    totalEntries: number;
    currentStreak: number;
    bestStreak: number;
    averageMood: number | null;
    averageEnergy: number | null;
    averageFocus: number | null;
    moodEntryCount: number;
    writtenLast30: number;
    firstEntryDate: string | null;
    lastEntryDate: string | null;
  };
  tags: Array<{ id: string; name: string; slug: string; count: number }>;
  activeTag: string | null;
  search: string;
  areas: Array<{ id: string; name: string }>;
  goals: Array<{ id: string; title: string }>;
  projects: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [eventComposerOpen, setEventComposerOpen] = useState(false);

  const isToday = selectedDate === todayKey;
  const yesterdayKey = shiftDay(todayKey, -1);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    startTransition(() => {
      router.replace(`/journal${next.size ? `?${next.toString()}` : ""}`, { scroll: false });
    });
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-5">
      <StatStrip>
        <Stat label="Total catatan" value={stats.totalEntries} />
        <Stat
          label="Beruntun"
          value={stats.currentStreak}
          hint={stats.bestStreak > 0 ? `Terbaik ${stats.bestStreak} hari` : undefined}
          tone={stats.currentStreak > 0 ? "positive" : "muted"}
        />
        <Stat
          label="30 hari terakhir"
          value={`${stats.writtenLast30}/30`}
          hint="Hari yang tercatat"
        />
        <Stat
          label="Rata-rata mood"
          value={stats.averageMood === null ? "-" : `${stats.averageMood}/10`}
          hint={stats.moodEntryCount > 0 ? `Dari ${stats.moodEntryCount} catatan` : undefined}
          tone="muted"
        />
      </StatStrip>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* —— Writing column ——————————————————————————————————————————————— */}
        <div className="min-w-0 space-y-5">
          {/* Day picker. Three taps cover almost every case. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setParam("date", todayKey)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-fast",
                  isToday
                    ? "bg-surface-sunken text-ink"
                    : "text-ink-subtle hover:bg-surface-sunken hover:text-ink",
                )}
              >
                Hari ini
              </button>
              <button
                type="button"
                onClick={() => setParam("date", yesterdayKey)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-fast",
                  selectedDate === yesterdayKey
                    ? "bg-surface-sunken text-ink"
                    : "text-ink-subtle hover:bg-surface-sunken hover:text-ink",
                )}
              >
                Kemarin
              </button>
            </div>

            <label className="flex items-center gap-1.5 text-xs text-ink-subtle">
              <CalendarDays size={13} />
              <input
                type="date"
                value={selectedDate}
                max={todayKey}
                onChange={(e) => setParam("date", e.target.value || null)}
                className="tabular h-8 rounded-md border border-border-strong bg-surface px-2 text-xs focus:border-accent focus:outline-none"
              />
            </label>

            {!isToday && (
              <span className="text-micro text-ink-faint">
                Menulis untuk {formatShortDateWithYear(selectedDate)}
              </span>
            )}
          </div>

          <Card>
            <CardHeader
              size="sm"
              title={isToday ? "Bagaimana hari ini?" : `Catatan ${formatShortDate(selectedDate)}`}
              description={
                isToday
                  ? "Tulis apa yang terjadi, apa yang terasa, dan apa yang ingin kamu ubah."
                  : "Kamu bisa mengisi catatan untuk hari yang sudah lewat."
              }
            />
            <div className="px-5 pb-5">
              <JournalEditor
                selectedDate={selectedDate}
                entry={entry}
                tags={tags.map((t) => t.name)}
                goals={goals}
                projects={projects}
                onSaved={refresh}
              />
            </div>
          </Card>

          {/* Life events for the day, alongside the narrative. */}
          <Card>
            <CardHeader
              size="sm"
              title="Peristiwa hari ini"
              description={
                events.length > 0
                  ? `${events.length} peristiwa tercatat`
                  : "Kejadian yang layak diingat, terpisah dari catatan harian"
              }
              action={
                <Button
                  variant={eventComposerOpen ? "ghost" : "secondary"}
                  size="sm"
                  icon={eventComposerOpen ? <X /> : <Plus />}
                  onClick={() => setEventComposerOpen((open) => !open)}
                >
                  {eventComposerOpen ? "Tutup" : "Catat"}
                </Button>
              }
            />
            <div className="px-4 pb-4">
              {eventComposerOpen && (
                <div className="mb-4 rounded-md border border-border p-4">
                  <LifeEventComposer
                    defaultDate={selectedDate}
                    areas={areas}
                    goals={goals}
                    projects={projects}
                    onDone={() => setEventComposerOpen(false)}
                    onSaved={refresh}
                  />
                </div>
              )}

              {events.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Sparkles />}
                  title="Belum ada peristiwa"
                  description="Mulai olahraga, mulai proyek, atau mencapai sesuatu — catat agar muncul di linimasa."
                />
              ) : (
                <ul className="space-y-1">
                  {events.map((event) => (
                    <li
                      key={event.id}
                      className="flex items-start gap-2.5 rounded-md px-1.5 py-2"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1.5 size-1.5 shrink-0 rounded-full",
                          event.isMilestone ? "bg-accent" : "bg-ink-faint",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink">{event.title}</p>
                        {event.description && (
                          <p className="mt-0.5 text-xs text-ink-subtle">{event.description}</p>
                        )}
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-micro text-ink-faint">
                          <span>{categoryLabel(event.category)}</span>
                          {event.goalTitle && <span>{event.goalTitle}</span>}
                          {event.projectTitle && <span>{event.projectTitle}</span>}
                          {event.isMilestone && <span className="text-accent">pencapaian</span>}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Link
            href="/journal/timeline"
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition-colors duration-fast hover:border-border-strong hover:bg-surface-sunken"
          >
            <span className="flex items-center gap-2.5">
              <BookOpen size={15} className="text-ink-faint" />
              <span className="text-sm text-ink">Linimasa hidup</span>
            </span>
            <span className="text-micro text-ink-faint">
              Semua peristiwa, tugas dan uang dalam satu alur
            </span>
          </Link>
        </div>

        {/* —— History column ——————————————————————————————————————————————— */}
        <aside className="space-y-5">
          <Card>
            <CardHeader size="sm" title="Catatan sebelumnya" />
            <div className="px-4 pb-4">
              {recent.length === 0 ? (
                <EmptyState
                  compact
                  icon={<BookOpen />}
                  title="Belum ada catatan lain"
                  description="Setelah kamu menulis beberapa hari, riwayatnya muncul di sini."
                />
              ) : (
                <>
                  <ul className="space-y-0.5">
                    {recent.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setParam("date", item.date)}
                          className={cn(
                            "-mx-1.5 block w-[calc(100%+0.75rem)] rounded-md px-1.5 py-2 text-left transition-colors duration-fast hover:bg-surface-sunken",
                            item.date === selectedDate && "bg-surface-sunken",
                          )}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-micro font-medium text-ink-subtle">
                              {formatShortDateWithYear(item.date)}
                            </span>
                            {item.mood !== null && (
                              <span className="tabular flex items-center gap-1 text-micro text-ink-faint">
                                <Smile size={10} />
                                {item.mood}/10
                              </span>
                            )}
                          </div>
                          {item.title && (
                            <p className="mt-0.5 truncate text-xs font-medium text-ink">
                              {item.title}
                            </p>
                          )}
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-subtle">
                            {item.excerpt}
                          </p>
                          {item.tags.length > 0 && (
                            <p className="mt-1 flex flex-wrap gap-1">
                              {item.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-sm bg-surface-sunken px-1.5 py-0.5 text-micro text-ink-faint"
                                >
                                  {tag}
                                </span>
                              ))}
                            </p>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>

                  {recentTotal > recent.length && (
                    <p className="mt-2 text-micro text-ink-faint">
                      Menampilkan {recent.length} dari {recentTotal} catatan
                    </p>
                  )}
                </>
              )}
            </div>
          </Card>

          {tags.length > 0 && (
            <Card>
              <CardHeader size="sm" title="Tag" />
              <div className="px-4 pb-4">
                <div className="flex flex-wrap gap-1.5">
                  {activeTag && (
                    <button
                      type="button"
                      onClick={() => setParam("tag", null)}
                      className="inline-flex items-center gap-1 rounded-full border border-ink-faint bg-surface-sunken px-2 py-0.5 text-micro text-ink"
                    >
                      <X size={9} />
                      hapus filter
                    </button>
                  )}
                  {tags.map((tag) => {
                    const active = activeTag === tag.slug;
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => setParam("tag", active ? null : tag.slug)}
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-micro transition-colors duration-fast",
                          active
                            ? "border-ink-faint bg-surface-sunken text-ink"
                            : "border-border text-ink-subtle hover:border-border-strong hover:text-ink",
                        )}
                      >
                        {tag.name}
                        <span className="tabular ml-1 text-ink-faint">{tag.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader size="sm" title="Cari catatan" />
            <div className="px-4 pb-4">
              <div className="relative">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
                />
                <input
                  type="search"
                  defaultValue={search}
                  placeholder="Kata di dalam catatan..."
                  aria-label="Cari catatan jurnal"
                  onChange={(event) => {
                    const value = event.target.value;
                    setParam("q", value.trim() === "" ? null : value);
                  }}
                  className="h-8 w-full rounded-md border border-border-strong bg-surface pl-7 pr-2 text-sm placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
              {search && (
                <p className="mt-2 text-micro text-ink-faint">
                  Mencari &quot;{search}&quot; di {recentTotal} catatan
                </p>
              )}
            </div>
          </Card>

          {stats.bestStreak > 0 && (
            <Card className="px-4 py-3.5">
              <div className="flex items-start gap-2.5">
                <Flame size={15} className="mt-0.5 shrink-0 text-warning" />
                <p className="text-xs leading-relaxed text-ink-muted">
                  Kamu pernah menulis {stats.bestStreak} hari berturut-turut
                  {stats.firstEntryDate && (
                    <>
                      , sejak {formatShortDateWithYear(stats.firstEntryDate)}
                    </>
                  )}
                  .
                </p>
              </div>
            </Card>
          )}
        </aside>
      </div>

      {pending && <p className="text-center text-micro text-ink-faint">Memuat...</p>}
    </div>
  );
}

/** Shifts a `YYYY-MM-DD` key by whole days without touching local time. */
function shiftDay(key: string, delta: number): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
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

