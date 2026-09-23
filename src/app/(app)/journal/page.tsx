import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { today, formatFullDate, formatCalendarDay, addCalendarDays } from "@/lib/date";
import * as journal from "@/domains/journal/service";
import { listAreas } from "@/domains/plan/areas";
import { listGoals } from "@/domains/plan/goals";
import { listProjects } from "@/domains/plan/projects";
import { JournalView } from "./journal-view";

export const metadata = { title: "Journal" };
export const dynamic = "force-dynamic";

/**
 * Journal.
 *
 * A day-at-a-time writing surface plus the recent history beside it. The
 * default date is today, and `?date=` opens any past day so the same form is
 * used for catch-up entries rather than a separate screen.
 */
export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; tag?: string; q?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const todayDay = today(user.timeZone);
  const todayKey = formatCalendarDay(todayDay);

  // An invalid or missing date falls back to today rather than erroring.
  const selectedDate = (params.date && journal.isValidDateKey(params.date))
    ? params.date
    : todayKey;

  const [entry, recent, stats, tags, events, areaList, goalList, projectList] =
    await Promise.all([
      journal.getJournalEntry(user.id, selectedDate),
      journal.listJournalEntries(user.id, {
        from: addCalendarDays(todayDay, -60),
        to: todayDay,
        tagSlug: params.tag || undefined,
        search: params.q || undefined,
        limit: 30,
      }),
      journal.getJournalStats(user.id, user.timeZone),
      journal.listTags(user.id),
      journal.getEventsForDay(user.id, new Date(`${selectedDate}T00:00:00.000Z`)),
      listAreas(user.id),
      listGoals(user.id, { status: ["PLANNED", "ACTIVE"] }),
      listProjects(user.id, { status: ["PLANNED", "ACTIVE"] }),
    ]);

  return (
    <AppShell
      title="Journal"
      subtitle={formatFullDate(new Date(`${selectedDate}T00:00:00.000Z`), user.locale)}
    >
      <JournalView
        todayKey={todayKey}
        selectedDate={selectedDate}
        entry={
          entry
            ? {
                id: entry.id,
                title: entry.title ?? "",
                body: entry.body,
                mood: entry.mood,
                energy: entry.energy,
                focus: entry.focus,
                wentWell: entry.wentWell ?? "",
                wentPoorly: entry.wentPoorly ?? "",
                changeNext: entry.changeNext ?? "",
                tags: entry.tags.map((t) => t.tag.name),
                goalIds: entry.goals.map((g) => g.goal.id),
                projectIds: entry.projects.map((p) => p.project.id),
              }
            : null
        }
        events={events.map((e) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          category: e.category,
          isMilestone: e.isMilestone,
          goalTitle: e.goal?.title ?? null,
          projectTitle: e.project?.title ?? null,
        }))}
        recent={recent.entries.map((e) => ({
          id: e.id,
          date: formatCalendarDay(e.date),
          title: e.title,
          excerpt: excerpt(e.body),
          mood: e.mood,
          energy: e.energy,
          focus: e.focus,
          tags: e.tags.map((t) => t.tag.name),
          hasMoodEntry: e.mood !== null,
        }))}
        recentTotal={recent.total}
        stats={stats}
        tags={tags.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          count: t._count.journalEntries,
        }))}
        activeTag={params.tag ?? null}
        search={params.q ?? ""}
        areas={areaList.map((a) => ({ id: a.id, name: a.name }))}
        goals={goalList.map((g) => ({ id: g.id, title: g.title }))}
        projects={projectList.map((p) => ({ id: p.id, title: p.title }))}
      />
    </AppShell>
  );
}

function excerpt(body: string, max = 180): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}\u2026` : flat;
}
