import { Badge, type BadgeTone } from "@/components/ui/indicator";

/**
 * Status presentation.
 *
 * Statuses are enums in the database and must be read the same way everywhere:
 * one label, one tone, one ordering. Centralising the mapping means adding a
 * status to the schema surfaces a type error at every place that renders it,
 * rather than silently falling through to a blank badge.
 */

type StatusMeta = { label: string; tone: BadgeTone };

const TASK_STATUS: Record<string, StatusMeta> = {
  INBOX: { label: "Kotak masuk", tone: "neutral" },
  PLANNED: { label: "Direncanakan", tone: "info" },
  TODAY: { label: "Hari ini", tone: "accent" },
  COMPLETED: { label: "Selesai", tone: "positive" },
  SKIPPED: { label: "Dilewati", tone: "warning" },
  ARCHIVED: { label: "Diarsipkan", tone: "neutral" },
};

const GOAL_STATUS: Record<string, StatusMeta> = {
  PLANNED: { label: "Direncanakan", tone: "neutral" },
  ACTIVE: { label: "Berjalan", tone: "accent" },
  PAUSED: { label: "Dijeda", tone: "warning" },
  ACHIEVED: { label: "Tercapai", tone: "positive" },
  MISSED: { label: "Terlewat", tone: "negative" },
  ARCHIVED: { label: "Diarsipkan", tone: "neutral" },
};

const PROJECT_STATUS: Record<string, StatusMeta> = {
  PLANNED: { label: "Direncanakan", tone: "neutral" },
  ACTIVE: { label: "Berjalan", tone: "accent" },
  PAUSED: { label: "Dijeda", tone: "warning" },
  COMPLETED: { label: "Selesai", tone: "positive" },
  ARCHIVED: { label: "Diarsipkan", tone: "neutral" },
};

const PRIORITY: Record<string, StatusMeta> = {
  LOW: { label: "Rendah", tone: "neutral" },
  MEDIUM: { label: "Sedang", tone: "info" },
  HIGH: { label: "Tinggi", tone: "warning" },
  URGENT: { label: "Mendesak", tone: "negative" },
};

const SAVINGS_STATUS: Record<string, StatusMeta> = {
  ACTIVE: { label: "Berjalan", tone: "accent" },
  ACHIEVED: { label: "Tercapai", tone: "positive" },
  PAUSED: { label: "Dijeda", tone: "warning" },
  ARCHIVED: { label: "Diarsipkan", tone: "neutral" },
};

const TRANSACTION_TYPE: Record<string, StatusMeta> = {
  INCOME: { label: "Pemasukan", tone: "positive" },
  EXPENSE: { label: "Pengeluaran", tone: "negative" },
  TRANSFER: { label: "Transfer", tone: "info" },
  ADJUSTMENT: { label: "Penyesuaian", tone: "warning" },
};

const ACCOUNT_TYPE: Record<string, StatusMeta> = {
  CASH: { label: "Tunai", tone: "neutral" },
  BANK: { label: "Bank", tone: "info" },
  E_WALLET: { label: "E-wallet", tone: "accent" },
  INVESTMENT: { label: "Investasi", tone: "positive" },
  CRYPTO: { label: "Kripto", tone: "warning" },
  CREDIT: { label: "Kartu kredit", tone: "negative" },
  OTHER: { label: "Lainnya", tone: "neutral" },
};

const LIFE_EVENT_CATEGORY: Record<string, StatusMeta> = {
  HEALTH: { label: "Kesehatan", tone: "positive" },
  CAREER: { label: "Karier", tone: "info" },
  FINANCE: { label: "Keuangan", tone: "accent" },
  RELATIONSHIP: { label: "Hubungan", tone: "warning" },
  LEARNING: { label: "Pembelajaran", tone: "info" },
  BUSINESS: { label: "Bisnis", tone: "accent" },
  PERSONAL: { label: "Pribadi", tone: "neutral" },
  MILESTONE: { label: "Pencapaian", tone: "positive" },
  OTHER: { label: "Lainnya", tone: "neutral" },
};

const HABIT_FREQUENCY: Record<string, StatusMeta> = {
  DAILY: { label: "Harian", tone: "neutral" },
  WEEKLY: { label: "Mingguan", tone: "neutral" },
  MONTHLY: { label: "Bulanan", tone: "neutral" },
  CUSTOM: { label: "Kustom", tone: "neutral" },
};

const GOAL_TYPE: Record<string, StatusMeta> = {
  BINARY: { label: "Selesai / belum", tone: "neutral" },
  NUMERIC: { label: "Angka", tone: "neutral" },
  PERCENTAGE: { label: "Persentase", tone: "neutral" },
  CURRENCY: { label: "Uang", tone: "neutral" },
  COUNT: { label: "Hitungan", tone: "neutral" },
  CUSTOM: { label: "Kustom", tone: "neutral" },
};

const MAPS = {
  task: TASK_STATUS,
  goal: GOAL_STATUS,
  project: PROJECT_STATUS,
  priority: PRIORITY,
  savings: SAVINGS_STATUS,
  transaction: TRANSACTION_TYPE,
  account: ACCOUNT_TYPE,
  lifeEvent: LIFE_EVENT_CATEGORY,
  frequency: HABIT_FREQUENCY,
  goalType: GOAL_TYPE,
} as const;

export type StatusDomain = keyof typeof MAPS;

export function statusMeta(domain: StatusDomain, value: string): StatusMeta {
  return MAPS[domain][value] ?? { label: value, tone: "neutral" };
}

export function StatusBadge({
  domain,
  value,
  className,
  dot,
}: {
  domain: StatusDomain;
  value: string;
  className?: string;
  dot?: boolean;
}) {
  const meta = statusMeta(domain, value);
  return (
    <Badge tone={meta.tone} className={className} dot={dot}>
      {meta.label}
    </Badge>
  );
}

/** Options for a `<select>`, in the order the product presents them. */
export function statusOptions(domain: StatusDomain): Array<{ value: string; label: string }> {
  return Object.entries(MAPS[domain]).map(([value, meta]) => ({
    value,
    label: meta.label,
  }));
}

export const TASK_STATUS_ORDER = ["INBOX", "PLANNED", "TODAY", "COMPLETED", "SKIPPED"] as const;
export const GOAL_STATUS_ORDER = ["PLANNED", "ACTIVE", "PAUSED", "ACHIEVED", "MISSED"] as const;
export const PROJECT_STATUS_ORDER = ["PLANNED", "ACTIVE", "PAUSED", "COMPLETED"] as const;
export const PRIORITY_ORDER = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const GOAL_TYPE_ORDER = ["BINARY", "NUMERIC", "PERCENTAGE", "CURRENCY", "COUNT", "CUSTOM"] as const;
