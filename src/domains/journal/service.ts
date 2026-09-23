import { db } from "@/lib/db";
import { errors } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import { assertOwned } from "@/lib/auth/ownership";
import { z } from "zod";
import {
  addCalendarDays,
  calendarDayRange,
  parseCalendarDay,
  today,
  type CalendarDay,
} from "@/lib/date";
import type { JournalEntry, LifeEvent, Prisma } from "@/generated/prisma/client";

/**
 * Journal and life memory.
 *
 * Two records, two purposes:
 *
 *   • A `JournalEntry` belongs to exactly one calendar day and holds how that
 *     day felt and what was learned. Mood, energy and focus are optional — a
 *     reflection form that refuses to save because a slider was not moved is a
 *     form people stop opening.
 *   • A `LifeEvent` is a dated thing that happened, with no obligation to be
 *     part of a day's narrative. It is the raw material for the long-term
 *     timeline, which is why it is queried by range rather than by entry.
 *
 * The daily aggregation on Today reads both, plus tasks, habits and money, so
 * it never has to be written twice by the user.
 */

// ─────────────────────────────────────────────────────────────────── schemas ──

/** A scale value that may be absent. Absent is not the same as zero. */
const scale = (label: string) =>
  z.coerce
    .number()
    .int(`${label} harus bilangan bulat.`)
    .min(1, `${label} minimal 1.`)
    .max(10, `${label} maksimal 10.`)
    .optional();

export const journalCreateSchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD.")
    .refine((v) => parseCalendarDay(v) !== null, "Tanggal tersebut tidak ada di kalender."),
  title: z.string().trim().max(140, "Judul maksimal 140 karakter.").optional().or(z.literal("")),
  body: z.string().trim().min(1, "Isi jurnal tidak boleh kosong.").max(20000, "Isi jurnal terlalu panjang."),
  mood: scale("Mood"),
  energy: scale("Energi"),
  focus: scale("Fokus"),
  wentWell: z.string().trim().max(4000).optional().or(z.literal("")),
  wentPoorly: z.string().trim().max(4000).optional().or(z.literal("")),
  changeNext: z.string().trim().max(4000).optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(15, "Maksimal 15 tag.").default([]),
  goalIds: z.array(z.string().trim().min(1)).max(20).default([]),
  projectIds: z.array(z.string().trim().min(1)).max(20).default([]),
});

export const journalUpdateSchema = journalCreateSchema.omit({ date: true }).partial();

export const lifeEventCreateSchema = z.object({
  title: z.string().trim().min(1, "Judul peristiwa wajib diisi.").max(140, "Maksimal 140 karakter."),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD.")
    .refine((v) => parseCalendarDay(v) !== null, "Tanggal tersebut tidak ada di kalender."),
  category: z
    .enum(["HEALTH", "CAREER", "FINANCE", "RELATIONSHIP", "LEARNING", "BUSINESS", "PERSONAL", "MILESTONE", "OTHER"])
    .default("OTHER"),
  isMilestone: z.boolean().default(false),
  areaId: z.string().trim().min(1).optional().or(z.literal("")),
  goalId: z.string().trim().min(1).optional().or(z.literal("")),
  projectId: z.string().trim().min(1).optional().or(z.literal("")),
});

export const lifeEventUpdateSchema = lifeEventCreateSchema.partial();

export type JournalCreateInput = z.infer<typeof journalCreateSchema>;
export type LifeEventCreateInput = z.infer<typeof lifeEventCreateSchema>;

/**
 * True when a string is a real `YYYY-MM-DD` calendar day.
 *
 * Used by the page to fall back to today rather than 404 on a malformed
 * `?date=` in the URL. Delegates to `parseCalendarDay`, which already rejects
 * impossible dates such as 2026-02-31, so the two cannot disagree.
 */
export function isValidDateKey(value: string): boolean {
  return parseCalendarDay(value) !== null;
}

// ──────────────────────────────────────────────────────────────── journal ──

/** Upserts a tag and returns its id. Tags are per-user, so the slug is unique. */
async function ensureTag(userId: string, name: string): Promise<string> {
  const slug = slugify(name);
  const existing = await db.tag.findUnique({
    where: { userId_slug: { userId, slug } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await db.tag.create({
    data: { userId, name: name.trim(), slug },
    select: { id: true },
  });
  return created.id;
}

/** Lowercase, hyphenated, ASCII-only — stable across renames of casing. */
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * Creates or replaces the entry for a day.
 *
 * One entry per day means a second save is an update, not a duplicate. The
 * unique constraint on `(userId, date)` enforces this at the database level so
 * a race between two tabs cannot produce a double entry.
 */
export async function saveJournalEntry(
  userId: string,
  input: unknown,
): Promise<JournalEntry & { tags: string[] }> {
  const data = parseOrThrow(journalCreateSchema, input, "Periksa kembali isi jurnal.");

  const date = parseCalendarDay(data.date);
  if (!date) {
    throw errors.validation("Tanggal tidak valid.", { date: "Tanggal tidak valid." });
  }

  // Every linked record must belong to the caller.
  const [goalIds, projectIds] = await Promise.all([
    Promise.all(data.goalIds.map((id) => assertOwned("goal", id, userId, "Tujuan"))),
    Promise.all(data.projectIds.map((id) => assertOwned("project", id, userId, "Proyek"))),
  ]);

  const tagIds = await Promise.all(data.tags.map((name) => ensureTag(userId, name)));

  return db.$transaction(async (tx) => {
    const existing = await tx.journalEntry.findUnique({
      where: { userId_date: { userId, date } },
      select: { id: true },
    });

    const payload = {
      title: data.title || null,
      body: data.body,
      mood: data.mood ?? null,
      energy: data.energy ?? null,
      focus: data.focus ?? null,
      wentWell: data.wentWell || null,
      wentPoorly: data.wentPoorly || null,
      changeNext: data.changeNext || null,
      deletedAt: null,
    };

    const entry = existing
      ? await tx.journalEntry.update({ where: { id: existing.id }, data: payload })
      : await tx.journalEntry.create({ data: { userId, date, ...payload } });

    // Links are replaced wholesale: the client sends the complete desired set,
    // so a removed tag is genuinely removed rather than left behind.
    await tx.journalTag.deleteMany({ where: { journalEntryId: entry.id } });
    if (tagIds.length > 0) {
      await tx.journalTag.createMany({
        data: tagIds.map((tagId) => ({ journalEntryId: entry.id, tagId })),
        skipDuplicates: true,
      });
    }

    await tx.journalEntryGoal.deleteMany({ where: { journalEntryId: entry.id } });
    if (goalIds.length > 0) {
      await tx.journalEntryGoal.createMany({
        data: goalIds.map((goalId) => ({ journalEntryId: entry.id, goalId })),
        skipDuplicates: true,
      });
    }

    await tx.journalEntryProject.deleteMany({ where: { journalEntryId: entry.id } });
    if (projectIds.length > 0) {
      await tx.journalEntryProject.createMany({
        data: projectIds.map((projectId) => ({ journalEntryId: entry.id, projectId })),
        skipDuplicates: true,
      });
    }

    const tags = await tx.journalTag.findMany({
      where: { journalEntryId: entry.id },
      select: { tag: { select: { name: true } } },
    });

    return { ...entry, tags: tags.map((t) => t.tag.name) };
  });
}

export type JournalEntryWithContext = JournalEntry & {
  tags: Array<{ tag: { id: string; name: string; slug: string } }>;
  goals: Array<{ goal: { id: string; title: string } }>;
  projects: Array<{ project: { id: string; title: string } }>;
  events: Array<{ id: string; title: string; category: string }>;
  _count: { attachments: number };
};

const JOURNAL_INCLUDE = {
  tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
  goals: { select: { goal: { select: { id: true, title: true } } } },
  projects: { select: { project: { select: { id: true, title: true } } } },
  events: { select: { id: true, title: true, category: true } },
  _count: { select: { attachments: true } },
} as const;

export async function getJournalEntry(
  userId: string,
  date: CalendarDay | string,
): Promise<JournalEntryWithContext | null> {
  const day = typeof date === "string" ? parseCalendarDay(date) : date;
  if (!day) return null;

  return db.journalEntry.findFirst({
    where: { userId, date: day, deletedAt: null },
    include: JOURNAL_INCLUDE,
  }) as Promise<JournalEntryWithContext | null>;
}

export async function listJournalEntries(
  userId: string,
  options: {
    from?: CalendarDay;
    to?: CalendarDay;
    tagSlug?: string;
    search?: string;
    hasMood?: boolean;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ entries: JournalEntryWithContext[]; total: number }> {
  const where: Prisma.JournalEntryWhereInput = { userId, deletedAt: null };

  if (options.from || options.to) {
    where.date = {};
    if (options.from) where.date.gte = options.from;
    if (options.to) where.date.lte = options.to;
  }

  if (options.tagSlug) {
    where.tags = { some: { tag: { slug: options.tagSlug } } };
  }

  if (options.hasMood) {
    where.mood = { not: null };
  }

  if (options.search?.trim()) {
    const term = options.search.trim();
    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      { body: { contains: term, mode: "insensitive" } },
      { wentWell: { contains: term, mode: "insensitive" } },
      { wentPoorly: { contains: term, mode: "insensitive" } },
      { changeNext: { contains: term, mode: "insensitive" } },
    ];
  }

  const [entries, total] = await Promise.all([
    db.journalEntry.findMany({
      where,
      include: JOURNAL_INCLUDE,
      orderBy: { date: "desc" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    }),
    db.journalEntry.count({ where }),
  ]);

  return { entries: entries as JournalEntryWithContext[], total };
}

export async function deleteJournalEntry(userId: string, entryId: string): Promise<void> {
  await assertOwned("journalEntry", entryId, userId, "Catatan jurnal");
  // Soft delete keeps the day's history intact while removing it from view.
  await db.journalEntry.update({
    where: { id: entryId },
    data: { deletedAt: new Date() },
  });
}

export async function listTags(userId: string) {
  return db.tag.findMany({
    where: { userId },
    select: { id: true, name: true, slug: true, _count: { select: { journalEntries: true } } },
    orderBy: { name: "asc" },
  });
}

// ────────────────────────────────────────────────────────────── life events ──

export type LifeEventWithContext = LifeEvent & {
  goal: { id: string; title: string } | null;
  project: { id: string; title: string } | null;
};

export async function createLifeEvent(
  userId: string,
  input: unknown,
): Promise<LifeEvent> {
  const data = parseOrThrow(lifeEventCreateSchema, input, "Periksa kembali data peristiwa.");

  const date = parseCalendarDay(data.date);
  if (!date) throw errors.validation("Tanggal tidak valid.", { date: "Tanggal tidak valid." });

  const [areaId, goalId, projectId] = await Promise.all([
    data.areaId ? assertOwned("area", data.areaId, userId, "Area") : null,
    data.goalId ? assertOwned("goal", data.goalId, userId, "Tujuan") : null,
    data.projectId ? assertOwned("project", data.projectId, userId, "Proyek") : null,
  ]);

  return db.lifeEvent.create({
    data: {
      userId,
      title: data.title,
      description: data.description || null,
      date,
      category: data.category,
      isMilestone: data.isMilestone,
      areaId,
      goalId,
      projectId,
    },
  });
}

export async function updateLifeEvent(
  userId: string,
  eventId: string,
  input: unknown,
): Promise<LifeEvent> {
  await assertOwned("lifeEvent", eventId, userId, "Peristiwa");
  const data = parseOrThrow(lifeEventUpdateSchema, input, "Periksa kembali data peristiwa.");

  const patch: Prisma.LifeEventUpdateInput = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description || null;
  if (data.category !== undefined) patch.category = data.category;
  if (data.isMilestone !== undefined) patch.isMilestone = data.isMilestone;

  if (data.date !== undefined) {
    const date = parseCalendarDay(data.date);
    if (!date) throw errors.validation("Tanggal tidak valid.", { date: "Tanggal tidak valid." });
    patch.date = date;
  }

  if (data.areaId !== undefined) {
    patch.area = data.areaId
      ? { connect: { id: await assertOwned("area", data.areaId, userId, "Area") } }
      : { disconnect: true };
  }
  if (data.goalId !== undefined) {
    patch.goal = data.goalId
      ? { connect: { id: await assertOwned("goal", data.goalId, userId, "Tujuan") } }
      : { disconnect: true };
  }
  if (data.projectId !== undefined) {
    patch.project = data.projectId
      ? { connect: { id: await assertOwned("project", data.projectId, userId, "Proyek") } }
      : { disconnect: true };
  }

  return db.lifeEvent.update({ where: { id: eventId }, data: patch });
}

export async function deleteLifeEvent(userId: string, eventId: string): Promise<void> {
  await assertOwned("lifeEvent", eventId, userId, "Peristiwa");
  await db.lifeEvent.delete({ where: { id: eventId } });
}

export async function listLifeEvents(
  userId: string,
  options: {
    from?: CalendarDay;
    to?: CalendarDay;
    categories?: LifeEvent["category"][];
    milestonesOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ events: LifeEventWithContext[]; total: number }> {
  const where: Prisma.LifeEventWhereInput = { userId, deletedAt: null };

  if (options.from || options.to) {
    where.date = {};
    if (options.from) where.date.gte = options.from;
    if (options.to) where.date.lte = options.to;
  }
  if (options.categories?.length) where.category = { in: options.categories };
  if (options.milestonesOnly) where.isMilestone = true;

  const [events, total] = await Promise.all([
    db.lifeEvent.findMany({
      where,
      include: {
        goal: { select: { id: true, title: true } },
        project: { select: { id: true, title: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: options.limit ?? 100,
      skip: options.offset ?? 0,
    }),
    db.lifeEvent.count({ where }),
  ]);

  return { events: events as LifeEventWithContext[], total };
}

export async function getEventsForDay(
  userId: string,
  day: CalendarDay,
): Promise<LifeEventWithContext[]> {
  const events = await db.lifeEvent.findMany({
    where: { userId, date: day, deletedAt: null },
    include: {
      goal: { select: { id: true, title: true } },
      project: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return events as LifeEventWithContext[];
}

/**
 * Ids of transactions cancelled by a reversal.
 *
 * A reversal leaves the original row in place for the audit trail, so anything
 * presenting *activity* must exclude it explicitly. Derived from
 * `reversesTransactionId` on the reversal row rather than a stored flag, so the
 * reversal remains the single source of truth.
 *
 * Mirrors the helper in the finance domain. It is repeated here rather than
 * imported to keep the journal domain from depending on finance for one query.
 */
async function cancelledTransactionIds(
  userId: string,
  from: CalendarDay,
  to: CalendarDay,
): Promise<string[]> {
  const reversals = await db.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      reversesTransactionId: { not: null },
      occurredOn: { gte: from, lte: to },
    },
    select: { reversesTransactionId: true },
  });

  return reversals
    .map((row) => row.reversesTransactionId)
    .filter((id): id is string => id !== null);
}

// ───────────────────────────────────────────────────────────────── timeline ──

export type TimelineItem = {
  id: string;
  kind: "event" | "journal" | "task" | "transaction" | "milestone";
  date: string;
  title: string;
  detail: string | null;
  category: string | null;
  colorToken: string | null;
  iconName: string | null;
  amount: string | null;
  isMilestone: boolean;
  href: string | null;
};

/**
 * Global timeline.
 *
 * Merges five sources into one chronological view. Each source contributes a
 * bounded slice and the merge happens here rather than in the database, because
 * there is no shared table to order by — and a `UNION` across five differently
 * shaped tables would be harder to read than this.
 *
 * The slices are capped so a user with ten years of history does not pull every
 * row into memory to render thirty days of scroll.
 */
export async function getTimeline(
  userId: string,
  options: {
    from: CalendarDay;
    to: CalendarDay;
    kinds?: TimelineItem["kind"][];
    limit?: number;
  },
): Promise<TimelineItem[]> {
  const { from, to } = options;
  const kinds = options.kinds ?? ["event", "journal", "task", "transaction", "milestone"];
  const perSource = Math.min(options.limit ?? 60, 200);

  const wants = (kind: TimelineItem["kind"]) => kinds.includes(kind);

  const [events, journals, tasks, transactions, milestones] = await Promise.all([
    wants("event")
      ? db.lifeEvent.findMany({
          where: { userId, deletedAt: null, date: { gte: from, lte: to } },
          select: {
            id: true, title: true, description: true, date: true,
            category: true, isMilestone: true,
          },
          orderBy: { date: "desc" },
          take: perSource,
        })
      : Promise.resolve([]),

    wants("journal")
      ? db.journalEntry.findMany({
          where: { userId, deletedAt: null, date: { gte: from, lte: to } },
          select: { id: true, title: true, body: true, date: true, mood: true },
          orderBy: { date: "desc" },
          take: perSource,
        })
      : Promise.resolve([]),

    // Completed tasks only: the timeline records what happened, not what was
    // planned. Planned work already has a home in the Plan screens.
    wants("task")
      ? db.task.findMany({
          where: {
            userId,
            status: "COMPLETED",
            completedAt: { gte: from, lte: addCalendarDays(to, 1) },
          },
          select: {
            id: true, title: true, completedAt: true,
            project: { select: { title: true } },
          },
          orderBy: { completedAt: "desc" },
          take: perSource,
        })
      : Promise.resolve([]),

    // Transfers excluded: moving money between your own accounts is not an
    // event in a person's life.
    wants("transaction")
      ? cancelledTransactionIds(userId, from, to).then((cancelled) =>
          db.transaction.findMany({
            where: {
              userId,
              deletedAt: null,
              // Both the reversal row and the original it cancels are excluded:
              // the pair nets to nothing, so showing either would report
              // activity that did not stand.
              reversesTransactionId: null,
              id: { notIn: cancelled },
              occurredOn: { gte: from, lte: to },
              type: { in: ["INCOME", "EXPENSE"] },
            },
            select: {
              id: true, type: true, amount: true, currency: true,
              description: true, occurredOn: true,
              category: { select: { name: true, colorToken: true, iconName: true } },
            },
            orderBy: { occurredOn: "desc" },
            take: perSource,
          }),
        )
      : Promise.resolve([]),

    wants("milestone")
      ? db.milestone.findMany({
          where: {
            userId,
            completedAt: { gte: from, lte: addCalendarDays(to, 1) },
          },
          select: {
            id: true, title: true, completedAt: true,
            project: { select: { id: true, title: true } },
          },
          orderBy: { completedAt: "desc" },
          take: perSource,
        })
      : Promise.resolve([]),
  ]);

  const items: TimelineItem[] = [];

  for (const event of events) {
    items.push({
      id: `event-${event.id}`,
      kind: "event",
      date: event.date.toISOString().slice(0, 10),
      title: event.title,
      detail: event.description,
      category: event.category,
      colorToken: null,
      iconName: null,
      amount: null,
      isMilestone: event.isMilestone,
      href: `/journal/events/${event.id}`,
    });
  }

  for (const journal of journals) {
    const excerpt = journal.body.replace(/\s+/g, " ").trim();
    items.push({
      id: `journal-${journal.id}`,
      kind: "journal",
      date: journal.date.toISOString().slice(0, 10),
      title: journal.title ?? "Catatan harian",
      detail: excerpt.length > 120 ? `${excerpt.slice(0, 119)}\u2026` : excerpt,
      category: null,
      colorToken: null,
      iconName: "notebook-pen",
      amount: null,
      isMilestone: false,
      href: `/journal/${journal.date.toISOString().slice(0, 10)}`,
    });
  }

  for (const task of tasks) {
    if (!task.completedAt) continue;
    items.push({
      id: `task-${task.id}`,
      kind: "task",
      date: task.completedAt.toISOString().slice(0, 10),
      title: task.title,
      detail: task.project?.title ?? null,
      category: null,
      colorToken: "positive",
      iconName: "check-circle",
      amount: null,
      isMilestone: false,
      href: `/plan/tasks/${task.id}`,
    });
  }

  for (const transaction of transactions) {
    const magnitude = transaction.amount < 0n ? -transaction.amount : transaction.amount;
    items.push({
      id: `transaction-${transaction.id}`,
      kind: "transaction",
      date: transaction.occurredOn.toISOString().slice(0, 10),
      title:
        transaction.description ??
        transaction.category?.name ??
        (transaction.type === "INCOME" ? "Pemasukan" : "Pengeluaran"),
      detail: transaction.category?.name ?? null,
      category: transaction.type,
      colorToken: transaction.type === "INCOME" ? "positive" : "negative",
      iconName: transaction.category?.iconName ?? null,
      amount: `${transaction.type === "INCOME" ? "+" : "-"}${magnitude}`,
      isMilestone: false,
      href: `/money/transactions/${transaction.id}`,
    });
  }

  for (const milestone of milestones) {
    if (!milestone.completedAt) continue;
    items.push({
      id: `milestone-${milestone.id}`,
      kind: "milestone",
      date: milestone.completedAt.toISOString().slice(0, 10),
      title: milestone.title,
      detail: milestone.project?.title ?? null,
      category: null,
      colorToken: "accent",
      iconName: "flag",
      amount: null,
      isMilestone: true,
      href: milestone.project ? `/plan/projects/${milestone.project.id}` : null,
    });
  }

  // Newest first, and stable within a day by id so the order does not shuffle
  // between renders.
  items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });

  return items.slice(0, options.limit ?? 100);
}

/**
 * Journaling streak and cadence, derived from entry dates.
 *
 * Reported alongside the list because writing regularly is the behaviour the
 * journal exists to encourage, and a streak is the honest measure of it: unlike
 * a habit, an entry either exists for a day or it does not.
 */
export async function getJournalStats(userId: string, timeZone: string) {
  const entries = await db.journalEntry.findMany({
    where: { userId, deletedAt: null },
    select: { date: true, mood: true, energy: true, focus: true },
    orderBy: { date: "desc" },
  });

  const todayDay = today(timeZone);
  const dates = new Set(entries.map((e) => e.date.getTime()));

  // Streak walks back from today. Today missing does not break the streak while
  // the day is still running.
  let currentStreak = 0;
  let cursor = todayDay;
  for (let i = 0; i < 3650; i++) {
    if (dates.has(cursor.getTime())) {
      currentStreak++;
    } else if (i > 0 || !dates.has(todayDay.getTime())) {
      if (i === 0) {
        // Today not written yet: check yesterday without counting today.
        cursor = addCalendarDays(cursor, -1);
        continue;
      }
      break;
    }
    cursor = addCalendarDays(cursor, -1);
  }

  // Longest run across all entries.
  const sorted = [...dates].sort((a, b) => a - b);
  let bestStreak = 0;
  let running = 0;
  let previous: number | null = null;
  for (const time of sorted) {
    if (previous !== null && time - previous === 86_400_000) running++;
    else running = 1;
    if (running > bestStreak) bestStreak = running;
    previous = time;
  }

  const withMood = entries.filter((e) => e.mood !== null);
  const average = (pick: (e: (typeof entries)[number]) => number | null) => {
    const values = entries.map(pick).filter((v): v is number => v !== null);
    if (values.length === 0) return null;
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  };

  const last30 = calendarDayRange(addCalendarDays(todayDay, -29), todayDay);
  const writtenLast30 = last30.filter((d) => dates.has(d.getTime())).length;

  return {
    totalEntries: entries.length,
    currentStreak,
    bestStreak,
    averageMood: average((e) => e.mood),
    averageEnergy: average((e) => e.energy),
    averageFocus: average((e) => e.focus),
    moodEntryCount: withMood.length,
    writtenLast30,
    firstEntryDate: sorted.length > 0 ? new Date(sorted[0]).toISOString().slice(0, 10) : null,
    lastEntryDate:
      sorted.length > 0
        ? new Date(sorted[sorted.length - 1]).toISOString().slice(0, 10)
        : null,
  };
}

export type TimelineSummary = {
  events: number;
  journals: number;
  tasks: number;
  transactions: number;
  milestones: number;
  netMoney: bigint;
};

/**
 * Counts what happened in a window, per kind.
 *
 * Separate from `getTimeline` because that function caps each source so the
 * merged list stays readable, and a header built from a capped list would
 * under-report. These are counts over the whole window.
 */
export async function getTimelineSummary(
  userId: string,
  from: CalendarDay,
  to: CalendarDay,
): Promise<TimelineSummary> {
  const endExclusive = addCalendarDays(to, 1);

  const [events, journals, tasks, milestones, money] = await Promise.all([
    db.lifeEvent.count({ where: { userId, deletedAt: null, date: { gte: from, lte: to } } }),
    db.journalEntry.count({ where: { userId, deletedAt: null, date: { gte: from, lte: to } } }),
    db.task.count({
      where: { userId, status: "COMPLETED", completedAt: { gte: from, lt: endExclusive } },
    }),
    db.milestone.count({
      where: { userId, completedAt: { gte: from, lt: endExclusive } },
    }),
    // Only income and expense count toward the net: a transfer moves money
    // between the user's own accounts, so including it would create the
    // impression of earning or spending.
    cancelledTransactionIds(userId, from, to).then((cancelled) =>
      db.transaction.groupBy({
        by: ["type"],
        where: {
          userId,
          deletedAt: null,
          reversesTransactionId: null,
          id: { notIn: cancelled },
          occurredOn: { gte: from, lte: to },
          type: { in: ["INCOME", "EXPENSE"] },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ),
  ]);

  let netMoney = 0n;
  let transactionCount = 0;
  for (const row of money) {
    const amount = row._sum.amount ?? 0n;
    transactionCount += row._count._all;
    netMoney += row.type === "INCOME" ? amount : -amount;
  }

  return {
    events,
    journals,
    tasks,
    milestones,
    transactions: transactionCount,
    netMoney,
  };
}
