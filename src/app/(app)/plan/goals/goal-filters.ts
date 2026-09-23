export type GoalStatusFilter =
  | "PLANNED"
  | "ACTIVE"
  | "PAUSED"
  | "ACHIEVED"
  | "MISSED"
  | "ARCHIVED";

export type GoalPreset = {
  value: string;
  label: string;
  countKey: "all" | "active" | "achieved" | "atRisk";
};

/** Shared between the server page (parsing) and the client list (rendering). */
export const GOAL_PRESETS: GoalPreset[] = [
  { value: "active", label: "Berjalan", countKey: "active" },
  { value: "achieved", label: "Tercapai", countKey: "achieved" },
  { value: "paused", label: "Dijeda", countKey: "atRisk" },
  { value: "all", label: "Semua", countKey: "all" },
];
