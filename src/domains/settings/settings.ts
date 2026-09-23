import { supportedCurrencies } from "@/lib/money";

/**
 * Settings vocabulary.
 *
 * Kept apart from `actions.ts` for the same reason the finance enums live apart
 * from the finance service: a client component that imports an action module
 * drags the Prisma client, and therefore `pg` and `fs`, into the browser bundle
 * and breaks the build.
 *
 * Nothing here touches the database.
 */

export const SUPPORTED_LOCALES = ["id-ID", "en-US"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  "id-ID": "Bahasa Indonesia",
  "en-US": "English (US)",
};

export const THEME_OPTIONS = [
  { value: "system", label: "Ikuti sistem", description: "Menyesuaikan pengaturan perangkat" },
  { value: "light", label: "Terang", description: "Selalu terang" },
  { value: "dark", label: "Gelap", description: "Selalu gelap" },
] as const;

export const WEEK_START_OPTIONS = [
  { value: 1, label: "Senin" },
  { value: 0, label: "Minggu" },
] as const;

/**
 * Time zones offered in the picker.
 *
 * A short curated list rather than the browser's full database: the choice is
 * made once, and a 400-entry `<select>` is worse than eight relevant options.
 * The value stored is a real IANA zone, so `Intl` and the date helpers accept it.
 */
export const TIME_ZONE_OPTIONS = [
  { value: "Asia/Jakarta", label: "Jakarta (WIB, UTC+7)" },
  { value: "Asia/Makassar", label: "Makassar (WITA, UTC+8)" },
  { value: "Asia/Jayapura", label: "Jayapura (WIT, UTC+9)" },
  { value: "Asia/Singapore", label: "Singapura (UTC+8)" },
  { value: "Asia/Tokyo", label: "Tokyo (UTC+9)" },
  { value: "Europe/London", label: "London (UTC+0/+1)" },
  { value: "Europe/Amsterdam", label: "Amsterdam (UTC+1/+2)" },
  { value: "America/New_York", label: "New York (UTC-5/-4)" },
  { value: "America/Los_Angeles", label: "Los Angeles (UTC-8/-7)" },
  { value: "UTC", label: "UTC" },
] as const;

/** True when the value is a zone `Intl` can actually resolve. */
export function isSupportedTimeZone(value: string): boolean {
  try {
    // `Intl` throws a RangeError for an unknown zone, which is the check.
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const CURRENCY_OPTIONS = supportedCurrencies().map((code) => ({
  value: code,
  label: code,
}));

/** Formats a UTC offset for display, e.g. "UTC+07:00". */
export function formatTimeZoneOffset(timeZone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(at);
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "UTC";
    return name;
  } catch {
    return "UTC";
  }
}

/** The zone the browser reports, for the "use my device's zone" affordance. */
export function detectTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}
