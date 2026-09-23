/**
 * Finance vocabulary.
 *
 * Enums and label maps live here, away from `service.ts`, because client
 * components need them. Importing the service from a client component would
 * pull `@prisma/adapter-pg` -> `pg` -> `fs` into the browser bundle, which
 * breaks the entire application at build time with "Module not found: fs".
 *
 * Rule: anything a `.tsx` with `"use client"` imports must not reach the
 * database.
 */

export const ACCOUNT_TYPES = [
  "CASH",
  "BANK",
  "E_WALLET",
  "INVESTMENT",
  "CRYPTO",
  "CREDIT",
  "OTHER",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TRANSACTION_TYPES = ["INCOME", "EXPENSE", "TRANSFER", "ADJUSTMENT"] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const CATEGORY_KINDS = ["INCOME", "EXPENSE", "TRANSFER"] as const;

export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/** Human labels, single-sourced so the UI cannot drift between screens. */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CASH: "Tunai",
  BANK: "Bank",
  E_WALLET: "E-wallet",
  INVESTMENT: "Investasi",
  CRYPTO: "Kripto",
  CREDIT: "Kartu kredit",
  OTHER: "Lainnya",
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  INCOME: "Pemasukan",
  EXPENSE: "Pengeluaran",
  TRANSFER: "Transfer",
  ADJUSTMENT: "Penyesuaian",
};
