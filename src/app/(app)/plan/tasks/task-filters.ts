export type TaskStatusFilter =
  | "INBOX"
  | "PLANNED"
  | "TODAY"
  | "COMPLETED"
  | "SKIPPED"
  | "ARCHIVED";

/**
 * Shared filter definitions for the task surfaces.
 *
 * Kept in its own module so both the server page (which parses the query
 * string) and the client board (which renders the chips) refer to the same
 * list of options rather than each declaring their own.
 */
export type TaskPreset = {
  value: string;
  label: string;
  countKey: "all" | "open" | "today" | "overdue" | "completed";
};

export const TASK_PRESETS: TaskPreset[] = [
  { value: "open", label: "Terbuka", countKey: "open" },
  { value: "today", label: "Hari ini", countKey: "today" },
  { value: "overdue", label: "Terlewat", countKey: "overdue" },
  { value: "completed", label: "Selesai", countKey: "completed" },
  { value: "all", label: "Semua", countKey: "all" },
];
