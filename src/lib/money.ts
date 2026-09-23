import { AppError } from "@/lib/errors";

/**
 * Money.
 *
 * Every amount in Livn is an integer count of minor units plus a currency code:
 * 50000 IDR rupiah is `50000` (IDR has no practical minor unit, exponent 0),
 * 12.50 USD is `1250` (exponent 2).
 *
 * Rationale: floating point cannot represent 0.1 exactly, and a personal
 * finance ledger that drifts by a fraction of a cent per row is worse than
 * useless — it is actively misleading. Integers make every sum exact.
 *
 * Never call `Number()` on an amount to do arithmetic. Use these helpers.
 */

/** ISO 4217 minor-unit exponents for the currencies the product supports. */
const CURRENCY_EXPONENT: Record<string, number> = {
  IDR: 0,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  SGD: 2,
  MYR: 2,
  AUD: 2,
  CNY: 2,
  KRW: 0,
  INR: 2,
  THB: 2,
  PHP: 2,
  VND: 0,
};

export const DEFAULT_CURRENCY = "IDR";

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENT[currency.toUpperCase()] ?? 2;
}

export function isSupportedCurrency(currency: string): boolean {
  return currency.toUpperCase() in CURRENCY_EXPONENT;
}

export function supportedCurrencies(): string[] {
  return Object.keys(CURRENCY_EXPONENT);
}

/**
 * BigInt arithmetic helpers.
 *
 * Prisma maps `BigInt` columns to JS `bigint`, which has no default JSON
 * serialization. All cross-boundary amounts therefore move as decimal strings.
 */

export type Minor = bigint;

export function toMinor(value: bigint | number | string): Minor {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw errors.validation("Amount is not a finite number.");
    }
    if (!Number.isInteger(value)) {
      throw errors.validation("Amount must be a whole number of minor units.");
    }
    return BigInt(value);
  }
  const trimmed = value.trim();
  if (trimmed === "") throw errors.validation("Amount is required.");
  if (!/^-?\d+$/.test(trimmed)) {
    throw errors.validation("Amount must be a whole number of minor units.");
  }
  return BigInt(trimmed);
}

const errors = {
  validation: (message: string) => new AppError("VALIDATION", message),
};

/**
 * Parses user input like "1.500.000", "1500000", "1,500,000.50" or
 * "Rp 85.000" into minor units for the given currency.
 *
 * Accepts both Indonesian and Western conventions because a single user will
 * paste from both. Ambiguity rule: the last separator wins as the decimal
 * point only when the currency has a non-zero exponent and the trailing group
 * is not exactly three digits (which would indicate a thousands separator).
 */
export function parseAmountInput(
  input: string,
  currency: string = DEFAULT_CURRENCY,
): Minor {
  const raw = input.trim();
  if (raw === "") throw errors.validation("Amount is required.");

  const negative = raw.startsWith("-");
  // Strip currency symbols, spaces and letters; keep digits and separators.
  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (cleaned === "") throw errors.validation("Amount must contain digits.");

  const exponent = currencyExponent(currency);

  if (exponent === 0) {
    const digits = cleaned.replace(/[.,]/g, "");
    if (!/^\d+$/.test(digits)) throw errors.validation("Amount must be a number.");
    const magnitude = BigInt(digits);
    return negative ? -magnitude : magnitude;
  }

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  const lastSep = Math.max(lastDot, lastComma);

  let integerPart = cleaned;
  let fractionPart = "";

  if (lastSep !== -1) {
    const tail = cleaned.slice(lastSep + 1);
    const head = cleaned.slice(0, lastSep);
    const hasOtherSeparator = (head.match(/[.,]/g) ?? []).length > 0;
    // A trailing three-digit group is a thousands separator, not decimals,
    // unless the number has no other separator and the exponent expects cents.
    const looksLikeThousands = /^\d{3}$/.test(tail) && hasOtherSeparator;

    if (looksLikeThousands) {
      integerPart = cleaned.replace(/[.,]/g, "");
      fractionPart = "";
    } else {
      integerPart = head.replace(/[.,]/g, "");
      fractionPart = tail;
    }
  }

  if (integerPart === "") integerPart = "0";
  if (!/^\d+$/.test(integerPart)) throw errors.validation("Amount must be a number.");

  const digits = fractionPart.replace(/\D/g, "").slice(0, exponent).padEnd(exponent, "0");
  const magnitude = BigInt(integerPart + digits);
  return negative ? -magnitude : magnitude;
}

/** Formats minor units for display, with grouping and a currency prefix. */
export function formatMoney(
  amount: bigint | number | string,
  currency: string = DEFAULT_CURRENCY,
  options: { withSymbol?: boolean; showSign?: boolean; compact?: boolean } = {},
): string {
  const { withSymbol = true, showSign = false, compact = false } = options;
  const minor = typeof amount === "bigint" ? amount : toMinor(amount);
  const exponent = currencyExponent(currency);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;

  const asString = abs.toString().padStart(exponent + 1, "0");
  const intPart = exponent === 0 ? asString : asString.slice(0, -exponent);
  const fracPart = exponent === 0 ? "" : asString.slice(-exponent);

  let grouped: string;
  if (compact && intPart.length > 6) {
    grouped = compactNumber(intPart);
  } else {
    grouped = groupDigits(intPart);
  }

  const body = fracPart ? `${grouped},${fracPart}` : grouped;
  const symbol = withSymbol ? `${currencySymbol(currency)} ` : "";
  const sign = negative ? "-" : showSign ? "+" : "";
  return `${sign}${symbol}${body}`;
}

function groupDigits(digits: string): string {
  // Indonesian convention: dot as the thousands separator.
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function compactNumber(intPart: string): string {
  const value = Number(intPart);
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return groupDigits(intPart);
}

export function currencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    IDR: "Rp",
    USD: "$",
    EUR: "\u20AC",
    GBP: "\u00A3",
    JPY: "\u00A5",
    SGD: "S$",
    MYR: "RM",
    AUD: "A$",
    CNY: "\u00A5",
    KRW: "\u20A9",
    INR: "\u20B9",
    THB: "\u0E3F",
    PHP: "\u20B1",
    VND: "\u20AB",
  };
  return symbols[currency.toUpperCase()] ?? currency.toUpperCase();
}

export function sumMinor(values: Array<bigint | number | string>): Minor {
  return values.reduce<Minor>((acc, v) => acc + toMinor(v), 0n);
}

export function absMinor(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/**
 * Converts to a JS number for charting only. Charts plot pixel positions, so
 * losing precision beyond 2^53 is irrelevant; arithmetic must never use this.
 */
export function minorToNumber(value: bigint | number | string): number {
  const minor = typeof value === "bigint" ? value : toMinor(value);
  return Number(minor);
}

/** Serializes for JSON transport without losing precision. */
export function serializeMoney(value: bigint | number | string): string {
  return (typeof value === "bigint" ? value : toMinor(value)).toString();
}
