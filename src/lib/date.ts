/**
 * Calendar arithmetic.
 *
 * Two distinct concepts live in this file and must not be confused:
 *
 *   • An *instant* — a moment on the timeline, stored as a JS `Date` in UTC.
 *     Used for `createdAt`, `completedAt`, transaction `occurredAt`.
 *
 *   • A *calendar day* — "the 23rd of September", which is a different day
 *     depending on the viewer's time zone. Stored in PostgreSQL as `date`,
 *     which Prisma represents as a `Date` pinned to midnight UTC.
 *
 * Conflating them causes the classic bug where a transaction made at 23:30 in
 * Jakarta appears on the previous day. Every function below states which
 * concept it works with.
 */

export const DEFAULT_TIME_ZONE = "Asia/Jakarta";

/** A `date`-column value: midnight UTC representing a calendar day. */
export type CalendarDay = Date;

// ────────────────────────────────────────────────────────────────── instant ──

export function now(): Date {
  return new Date();
}

/** The current calendar day in the given time zone, as a `date` value. */
export function today(timeZone: string = DEFAULT_TIME_ZONE): CalendarDay {
  return toCalendarDay(new Date(), timeZone);
}

/**
 * Converts an instant to the calendar day it falls on *in the given zone*.
 * This is the only correct way to decide "which day was that".
 */
export function toCalendarDay(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): CalendarDay {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  // en-CA renders as YYYY-MM-DD, which Date parses as UTC midnight.
  return new Date(`${parts}T00:00:00.000Z`);
}

// ─────────────────────────────────────────────────────────── calendar day ──

/** Builds a `date` value from numeric parts, avoiding any local-zone parsing. */
export function calendarDay(year: number, month1to12: number, day: number): CalendarDay {
  return new Date(Date.UTC(year, month1to12 - 1, day));
}

/** Parses `YYYY-MM-DD` into a `date` value. Rejects anything else. */
export function parseCalendarDay(input: string): CalendarDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = calendarDay(Number(y), Number(m), Number(d));
  // Guard against overflow like 2026-02-31 rolling into March.
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() + 1 !== Number(m) ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return date;
}

/** Formats a `date` value as `YYYY-MM-DD`. Safe to store and compare. */
export function formatCalendarDay(day: CalendarDay): string {
  const y = day.getUTCFullYear();
  const m = String(day.getUTCMonth() + 1).padStart(2, "0");
  const d = String(day.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addCalendarDays(day: CalendarDay, days: number): CalendarDay {
  const next = new Date(day.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function addCalendarMonths(day: CalendarDay, months: number): CalendarDay {
  const year = day.getUTCFullYear();
  const month = day.getUTCMonth();
  const targetDay = day.getUTCDate();
  // Clamp to the last valid day of the target month (Jan 31 + 1 month = Feb 28).
  const lastDay = new Date(Date.UTC(year, month + months + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, month + months, Math.min(targetDay, lastDay)),
  );
}

/** Whole days between two calendar days. Negative when `to` precedes `from`. */
export function daysBetween(from: CalendarDay, to: CalendarDay): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function isSameCalendarDay(a: CalendarDay, b: CalendarDay): boolean {
  return a.getTime() === b.getTime();
}

export function isCalendarDayBefore(a: CalendarDay, b: CalendarDay): boolean {
  return a.getTime() < b.getTime();
}

export function isCalendarDayAfter(a: CalendarDay, b: CalendarDay): boolean {
  return a.getTime() > b.getTime();
}

/** Inclusive list of calendar days. Capped to avoid accidental huge ranges. */
export function calendarDayRange(
  from: CalendarDay,
  to: CalendarDay,
  maxDays = 1000,
): CalendarDay[] {
  const out: CalendarDay[] = [];
  let cursor = from;
  while (!isCalendarDayAfter(cursor, to) && out.length < maxDays) {
    out.push(cursor);
    cursor = addCalendarDays(cursor, 1);
  }
  return out;
}

// ───────────────────────────────────────────────────────────────── period ──

export type Period = {
  start: CalendarDay;
  /** Exclusive bound: the first day *after* the period. */
  endExclusive: CalendarDay;
};

/** Monday-based week containing `day`, matching the product's `weekStartsOn`. */
export function weekPeriod(day: CalendarDay, weekStartsOn = 1): Period {
  const dow = day.getUTCDay(); // 0 = Sunday
  const delta = (dow - weekStartsOn + 7) % 7;
  const start = addCalendarDays(day, -delta);
  return { start, endExclusive: addCalendarDays(start, 7) };
}

export function monthPeriod(day: CalendarDay): Period {
  const start = calendarDay(day.getUTCFullYear(), day.getUTCMonth() + 1, 1);
  return { start, endExclusive: addCalendarMonths(start, 1) };
}

export function yearPeriod(day: CalendarDay): Period {
  const start = calendarDay(day.getUTCFullYear(), 1, 1);
  return { start, endExclusive: calendarDay(day.getUTCFullYear() + 1, 1, 1) };
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

export function daysInPeriod(period: Period): number {
  return daysBetween(period.start, period.endExclusive);
}

/** Clamps a day to the period's end, for prorating part-period metrics. */
export function clampToPeriod(day: CalendarDay, period: Period): CalendarDay {
  if (isCalendarDayBefore(day, period.start)) return period.start;
  if (!isCalendarDayBefore(day, period.endExclusive)) {
    return addCalendarDays(period.endExclusive, -1);
  }
  return day;
}

// ────────────────────────────────────────────────────────────── formatting ──

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatMonthName(day: CalendarDay, locale = "id-ID"): string {
  const names = locale.startsWith("id") ? MONTHS_ID : MONTHS_EN;
  return names[day.getUTCMonth()];
}

export function formatMonthYear(day: CalendarDay, locale = "id-ID"): string {
  return `${formatMonthName(day, locale)} ${day.getUTCFullYear()}`;
}

export function formatDayName(day: CalendarDay, locale = "id-ID"): string {
  const names = locale.startsWith("id") ? DAYS_ID : DAYS_EN;
  return names[day.getUTCDay()];
}

/** "23 September" — the format used in page headers. */
export function formatDayAndMonth(day: CalendarDay, locale = "id-ID"): string {
  return `${day.getUTCDate()} ${formatMonthName(day, locale)}`;
}

/** "23 September 2026" */
export function formatFullDate(day: CalendarDay, locale = "id-ID"): string {
  return `${day.getUTCDate()} ${formatMonthName(day, locale)} ${day.getUTCFullYear()}`;
}

/** "Senin, 23 September 2026" */
export function formatLongDate(day: CalendarDay, locale = "id-ID"): string {
  return `${formatDayName(day, locale)}, ${formatFullDate(day, locale)}`;
}

/**
 * Greeting appropriate to the hour, evaluated in the user's zone so it matches
 * what the clock on their wall says.
 */
export function greetingFor(instant: Date = new Date(), timeZone = DEFAULT_TIME_ZONE): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).format(instant),
  );
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}

/** Relative label for the timeline: "Hari ini", "Kemarin", "3 hari lalu". */
export function relativeDayLabel(
  day: CalendarDay,
  reference: CalendarDay,
): string {
  const diff = daysBetween(day, reference);
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Kemarin";
  if (diff === -1) return "Besok";
  if (diff > 1 && diff < 7) return `${diff} hari lalu`;
  if (diff < -1 && diff > -7) return `${Math.abs(diff)} hari lagi`;
  if (diff >= 7 && diff < 30) return `${Math.floor(diff / 7)} minggu lalu`;
  if (diff < -7 && diff > -30) return `${Math.floor(Math.abs(diff) / 7)} minggu lagi`;
  return formatDayAndMonth(day);
}
