import { z } from "zod";
import { parseCalendarDay } from "@/lib/date";

/**
 * Plan domain input contracts.
 *
 * Every field a client can send is validated here. The service layer never
 * trusts a payload, and the UI imports these same schemas so inline feedback
 * cannot drift from server behaviour.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

/**
 * A calendar date as `YYYY-MM-DD`.
 *
 * The shape check alone is not enough: `2026-02-31` matches the pattern but is
 * not a real day, and `new Date("2026-02-31")` silently rolls it forward to
 * March 3rd. Accepting that would move a user's task to a day they never
 * chose, so the date is round-tripped through the same parser the services use.
 */
const optionalCalendarDay = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD.")
  .refine((value) => parseCalendarDay(value) !== null, "Tanggal tersebut tidak ada di kalender.")
  .optional()
  .or(z.literal(""))
  .transform((value) => (value === "" ? undefined : value));

// ─────────────────────────────────────────────────────────────────── areas ──

export const areaCreateSchema = z.object({
  name: z.string().trim().min(1, "Nama area wajib diisi.").max(60, "Maksimal 60 karakter."),
  description: optionalText(300),
  colorToken: z.string().trim().max(24).default("accent"),
  iconName: optionalText(40),
});

export const areaUpdateSchema = areaCreateSchema.partial();

export type AreaCreateInput = z.infer<typeof areaCreateSchema>;
export type AreaUpdateInput = z.infer<typeof areaUpdateSchema>;

// ─────────────────────────────────────────────────────────────────── goals ──

export const GOAL_TYPES = [
  "BINARY",
  "NUMERIC",
  "PERCENTAGE",
  "CURRENCY",
  "COUNT",
  "CUSTOM",
] as const;

export const GOAL_STATUSES = [
  "PLANNED",
  "ACTIVE",
  "PAUSED",
  "ACHIEVED",
  "MISSED",
  "ARCHIVED",
] as const;

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const goalCreateSchema = z
  .object({
    title: z.string().trim().min(1, "Judul tujuan wajib diisi.").max(140, "Maksimal 140 karakter."),
    description: optionalText(2000),
    areaId: z.string().trim().min(1).optional().or(z.literal("")),
    goalType: z.enum(GOAL_TYPES).default("BINARY"),
    targetValue: z.coerce.number().finite().nonnegative("Target tidak boleh negatif.").optional(),
    currentValue: z.coerce.number().finite().min(0, "Nilai saat ini tidak boleh negatif.").optional(),
    unit: optionalText(16),
    startDate: optionalCalendarDay,
    targetDate: optionalCalendarDay,
    status: z.enum(GOAL_STATUSES).default("ACTIVE"),
    priority: z.enum(PRIORITIES).default("MEDIUM"),
    notes: optionalText(4000),
  })
  .superRefine((data, ctx) => {
    // A measurable goal without a target cannot show progress, so the field is
    // required exactly where it is meaningful.
    const needsTarget = data.goalType !== "BINARY" && data.goalType !== "CUSTOM";
    if (needsTarget && (data.targetValue === undefined || data.targetValue <= 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["targetValue"],
        message: "Target harus lebih dari 0 untuk tipe tujuan ini.",
      });
    }
    // A goal whose deadline precedes its start can never be satisfied.
    if (data.startDate && data.targetDate && data.targetDate < data.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["targetDate"],
        message: "Tanggal target tidak boleh sebelum tanggal mulai.",
      });
    }
  });

export const goalUpdateSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  description: optionalText(2000),
  areaId: z.string().trim().min(1).nullable().optional(),
  goalType: z.enum(GOAL_TYPES).optional(),
  targetValue: z.coerce.number().finite().nonnegative().nullable().optional(),
  currentValue: z.coerce.number().finite().min(0).optional(),
  unit: optionalText(16),
  startDate: optionalCalendarDay,
  targetDate: optionalCalendarDay,
  status: z.enum(GOAL_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  notes: optionalText(4000),
});

export type GoalCreateInput = z.infer<typeof goalCreateSchema>;
export type GoalUpdateInput = z.infer<typeof goalUpdateSchema>;

// ──────────────────────────────────────────────────────────────── projects ──

export const PROJECT_STATUSES = [
  "PLANNED",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "ARCHIVED",
] as const;

export const projectCreateSchema = z
  .object({
    title: z.string().trim().min(1, "Judul proyek wajib diisi.").max(140, "Maksimal 140 karakter."),
    description: optionalText(2000),
    areaId: z.string().trim().min(1).optional().or(z.literal("")),
    goalId: z.string().trim().min(1).optional().or(z.literal("")),
    status: z.enum(PROJECT_STATUSES).default("PLANNED"),
    startDate: optionalCalendarDay,
    targetDate: optionalCalendarDay,
  })
  .superRefine((data, ctx) => {
    if (data.startDate && data.targetDate && data.targetDate < data.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["targetDate"],
        message: "Tanggal target tidak boleh sebelum tanggal mulai.",
      });
    }
  });

export const projectUpdateSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  description: optionalText(2000),
  areaId: z.string().trim().min(1).nullable().optional(),
  goalId: z.string().trim().min(1).nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  startDate: optionalCalendarDay,
  targetDate: optionalCalendarDay,
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

// ────────────────────────────────────────────────────────────── milestones ──

export const milestoneCreateSchema = z.object({
  projectId: z.string().trim().min(1, "Proyek wajib dipilih."),
  title: z.string().trim().min(1, "Judul milestone wajib diisi.").max(140),
  description: optionalText(1000),
  dueDate: optionalCalendarDay,
});

export const milestoneUpdateSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  description: optionalText(1000),
  dueDate: optionalCalendarDay,
  completed: z.boolean().optional(),
});

export type MilestoneCreateInput = z.infer<typeof milestoneCreateSchema>;
export type MilestoneUpdateInput = z.infer<typeof milestoneUpdateSchema>;

// ─────────────────────────────────────────────────────────────────── tasks ──

export const TASK_STATUSES = [
  "INBOX",
  "PLANNED",
  "TODAY",
  "COMPLETED",
  "SKIPPED",
  "ARCHIVED",
] as const;

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, "Judul tugas wajib diisi.").max(200, "Maksimal 200 karakter."),
  description: optionalText(2000),
  notes: optionalText(4000),
  status: z.enum(TASK_STATUSES).default("INBOX"),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  // `scheduledFor` is the calendar day a task belongs to; `dueDate` is the
  // deadline. Both are plain dates so a task cannot drift across midnight.
  scheduledFor: optionalCalendarDay,
  dueDate: optionalCalendarDay,
  estimatedMinutes: z.coerce
    .number()
    .int("Estimasi harus bilangan bulat.")
    .min(1, "Estimasi minimal 1 menit.")
    .max(1440, "Estimasi maksimal 1440 menit.")
    .optional(),
  areaId: z.string().trim().min(1).optional().or(z.literal("")),
  goalId: z.string().trim().min(1).optional().or(z.literal("")),
  projectId: z.string().trim().min(1).optional().or(z.literal("")),
  milestoneId: z.string().trim().min(1).optional().or(z.literal("")),
});

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: optionalText(2000),
  notes: optionalText(4000),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  scheduledFor: optionalCalendarDay,
  dueDate: optionalCalendarDay,
  estimatedMinutes: z.coerce.number().int().min(1).max(1440).nullable().optional(),
  areaId: z.string().trim().min(1).nullable().optional(),
  goalId: z.string().trim().min(1).nullable().optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
  milestoneId: z.string().trim().min(1).nullable().optional(),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

// ─────────────────────────────────────────────────────────── monthly plan ──

export const MONTHLY_METRICS = [
  "TASK_COMPLETION",
  "HABIT_SESSIONS",
  "SAVINGS_AMOUNT",
  "INCOME_AMOUNT",
  "EXPENSE_LIMIT",
  "CUSTOM",
] as const;

export const monthlyPlanTargetSchema = z.object({
  label: z.string().trim().min(1, "Label target wajib diisi.").max(80),
  metric: z.enum(MONTHLY_METRICS),
  targetValue: z.coerce.number().finite().positive("Target harus lebih dari 0."),
  unit: optionalText(16),
  habitId: z.string().trim().min(1).optional().or(z.literal("")),
  goalId: z.string().trim().min(1).optional().or(z.literal("")),
  areaId: z.string().trim().min(1).optional().or(z.literal("")),
  categoryId: z.string().trim().min(1).optional().or(z.literal("")),
});

export const monthlyPlanSchema = z.object({
  monthStart: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Bulan harus dalam format YYYY-MM-DD.")
    .refine((value) => value.endsWith("-01"), "Tanggal harus hari pertama bulan."),
  notes: optionalText(2000),
  targets: z.array(monthlyPlanTargetSchema).max(30, "Maksimal 30 target per bulan.").default([]),
});

export type MonthlyPlanInput = z.infer<typeof monthlyPlanSchema>;
export type MonthlyPlanTargetInput = z.infer<typeof monthlyPlanTargetSchema>;
