/**
 * Starter categories and areas.
 *
 * A brand-new account with an empty ledger is a blank wall, so every user is
 * seeded with a usable baseline. Two rules govern this file:
 *
 *   1. These are *seeds*, not architecture. Nothing in the domain logic
 *      references a specific slug; users may rename, re-parent or archive any
 *      of them, and add their own.
 *   2. Only categories ship with `isSystem: true`, which protects them from
 *      hard deletion while still allowing them to be archived. Everything
 *      else is ordinary user data.
 */

export type SeedCategory = {
  name: string;
  slug: string;
  kind: "INCOME" | "EXPENSE" | "TRANSFER";
  colorToken: string;
  iconName: string;
  /** Nested under the parent slug when set. */
  parentSlug?: string;
};

export const DEFAULT_EXPENSE_CATEGORIES: SeedCategory[] = [
  { name: "Makanan", slug: "makanan", kind: "EXPENSE", colorToken: "warning", iconName: "utensils" },
  { name: "Transportasi", slug: "transportasi", kind: "EXPENSE", colorToken: "info", iconName: "car" },
  { name: "Kesehatan", slug: "kesehatan", kind: "EXPENSE", colorToken: "negative", iconName: "heart-pulse" },
  { name: "Pendidikan", slug: "pendidikan", kind: "EXPENSE", colorToken: "accent", iconName: "graduation-cap" },
  { name: "Hiburan", slug: "hiburan", kind: "EXPENSE", colorToken: "info", iconName: "gamepad-2" },
  { name: "Belanja", slug: "belanja", kind: "EXPENSE", colorToken: "warning", iconName: "shopping-bag" },
  { name: "Tagihan", slug: "tagihan", kind: "EXPENSE", colorToken: "negative", iconName: "receipt" },
  { name: "Langganan", slug: "langganan", kind: "EXPENSE", colorToken: "neutral", iconName: "repeat" },
  { name: "Bisnis", slug: "bisnis", kind: "EXPENSE", colorToken: "accent", iconName: "briefcase" },
  { name: "Rumah", slug: "rumah", kind: "EXPENSE", colorToken: "neutral", iconName: "home" },
  { name: "Lainnya", slug: "lainnya", kind: "EXPENSE", colorToken: "neutral", iconName: "more-horizontal" },
];

export const DEFAULT_INCOME_CATEGORIES: SeedCategory[] = [
  { name: "Gaji", slug: "gaji", kind: "INCOME", colorToken: "positive", iconName: "wallet" },
  { name: "Freelance", slug: "freelance", kind: "INCOME", colorToken: "accent", iconName: "laptop" },
  { name: "Bisnis", slug: "bisnis-masuk", kind: "INCOME", colorToken: "positive", iconName: "briefcase" },
  { name: "Investasi", slug: "investasi", kind: "INCOME", colorToken: "info", iconName: "trending-up" },
  { name: "Bonus", slug: "bonus", kind: "INCOME", colorToken: "positive", iconName: "gift" },
  { name: "Lainnya", slug: "lainnya-masuk", kind: "INCOME", colorToken: "neutral", iconName: "more-horizontal" },
];

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  ...DEFAULT_EXPENSE_CATEGORIES,
  ...DEFAULT_INCOME_CATEGORIES,
];

/**
 * Default life areas. Chosen to cover the questions the Today screen asks;
 * a user who tracks different dimensions renames or deletes these.
 */
export type SeedArea = {
  name: string;
  description: string;
  colorToken: string;
  iconName: string;
};

export const DEFAULT_AREAS: SeedArea[] = [
  {
    name: "Kesehatan",
    description: "Tubuh, energi dan kebiasaan fisik",
    colorToken: "positive",
    iconName: "heart-pulse",
  },
  {
    name: "Keuangan",
    description: "Pemasukan, pengeluaran dan tabungan",
    colorToken: "accent",
    iconName: "wallet",
  },
  {
    name: "Karier",
    description: "Pekerjaan, keterampilan dan posisi profesional",
    colorToken: "info",
    iconName: "briefcase",
  },
  {
    name: "Pembelajaran",
    description: "Bahasa, kursus dan pengetahuan baru",
    colorToken: "warning",
    iconName: "graduation-cap",
  },
  {
    name: "Bisnis",
    description: "Produk, pelanggan dan pertumbuhan usaha",
    colorToken: "accent",
    iconName: "trending-up",
  },
  {
    name: "Pribadi",
    description: "Hubungan, istirahat dan hal yang kamu anggap penting",
    colorToken: "neutral",
    iconName: "user",
  },
];

/** The wallet most users start from, so Money is usable immediately. */
export const DEFAULT_ACCOUNTS = [
  {
    name: "Tunai",
    type: "CASH" as const,
    colorToken: "positive",
    iconName: "banknote",
  },
  {
    name: "Bank",
    type: "BANK" as const,
    colorToken: "info",
    iconName: "landmark",
  },
  {
    name: "E-Wallet",
    type: "E_WALLET" as const,
    colorToken: "accent",
    iconName: "smartphone",
  },
];

/** Habit suggestions offered during onboarding. None are created by default. */
export const HABIT_SUGGESTIONS = [
  { name: "Olahraga", frequency: "WEEKLY" as const, targetCount: 4, colorToken: "positive" },
  { name: "Membaca", frequency: "DAILY" as const, targetCount: 1, colorToken: "warning" },
  { name: "Belajar bahasa", frequency: "DAILY" as const, targetCount: 1, colorToken: "info" },
  { name: "Menulis jurnal", frequency: "DAILY" as const, targetCount: 1, colorToken: "accent" },
  { name: "Tidur cukup", frequency: "DAILY" as const, targetCount: 1, colorToken: "neutral" },
];
