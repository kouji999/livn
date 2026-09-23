import { formatMoney, formatMoney as money } from "@/lib/money";

/**
 * Presentation formatting.
 *
 * One place decides how a raw domain value becomes a string. Components call
 * these rather than formatting inline, so a goal showing "8.000.000" in one
 * screen cannot show "8000000" in another.
 */

/**
 * Formats a goal's measured value according to its type.
 *
 * A currency goal shows grouped money; a count shows a plain number; a
 * percentage shows one decimal place. Mixing these up is the kind of bug that
 * makes a user distrust every number on the page.
 */
export function formatMoneyOrNumber(
  value: number | null | undefined,
  goalType: string,
  unit?: string | null,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";

  switch (goalType) {
    case "CURRENCY":
      // Goal values are stored in major units, so they are converted to minor
      // units before formatting to reuse the exact money formatter.
      return money(BigInt(Math.round(value)), "IDR", { withSymbol: true });

    case "PERCENTAGE":
      return `${round(value, 1)}%`;

    case "BINARY":
      return value > 0 ? "Ya" : "Belum";

    case "COUNT":
    case "NUMERIC": {
      const formatted = formatPlainNumber(value);
      // A unit is appended only when it adds information; "1 tugas" reads
      // better than "1" but "1 %" would be wrong.
      return unit ? `${formatted} ${unit}` : formatted;
    }

    default: {
      const formatted = formatPlainNumber(value);
      return unit ? `${formatted} ${unit}` : formatted;
    }
  }
}

/** Groups digits with a dot, and keeps at most four decimals. */
export function formatPlainNumber(value: number): string {
  if (!Number.isFinite(value)) return "-";

  // Whole numbers lose the decimal point entirely; fractions keep up to four
  // places with trailing zeros removed, so 2.50 reads as 2,5 not 2,5000.
  const rounded = round(value, 4);
  const [intPart, fracPart] = String(rounded).split(".");

  const sign = intPart.startsWith("-") ? "-" : "";
  const digits = sign ? intPart.slice(1) : intPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return fracPart ? `${sign}${grouped},${fracPart}` : `${sign}${grouped}`;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** A compact percentage for tight layouts: 33.3% but 40% not 40.0%. */
export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const rounded = round(value, 1);
  return `${Number.isInteger(rounded) ? rounded : rounded}%`;
}

/**
 * Signed money, used by the ledger where the direction must be visible.
 * Returns the plain formatted value; the caller styles the sign.
 */
export function formatSignedMoney(amount: bigint, currency = "IDR"): string {
  return formatMoney(amount < 0n ? -amount : amount, currency, { withSymbol: true });
}

/** "1j 30m" from minutes, or "45m". */
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "-";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}j` : `${hours}j ${rest}m`;
}

/** Ordinal-free day label used in dense history lists: "23 Sep". */
const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${Number(day)} ${SHORT_MONTHS[Number(month) - 1] ?? month}`;
}

export function formatShortDateWithYear(isoDate: string): string {
  const [year] = isoDate.split("-");
  return `${formatShortDate(isoDate)} ${year ?? ""}`.trim();
}
