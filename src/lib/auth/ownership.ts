import { db } from "@/lib/db";
import { errors } from "@/lib/errors";

/**
 * Ownership guards.
 *
 * Every mutation and query in the product is scoped by `userId`. Relying on
 * "the UI only ever sends my own ids" is not a security model — a crafted
 * request would then be able to read or modify another user's ledger.
 *
 * These helpers make the check explicit and impossible to forget: a service
 * that needs a record calls `assertOwned` before touching it, and the query
 * itself also carries `userId` so a race cannot slip through either.
 */

type OwnedModel =
  | "area"
  | "goal"
  | "project"
  | "milestone"
  | "task"
  | "habit"
  | "journalEntry"
  | "lifeEvent"
  | "account"
  | "category"
  | "transaction"
  | "budget"
  | "savingsGoal"
  | "recurringRule"
  | "monthlyPlan"
  | "tag"
  | "attachment"
  | "review"
  | "insight";

/**
 * The subset of a Prisma delegate this module needs.
 *
 * `OwnershipDelegate` is the only shape the ownership helpers ever call, and
 * every generated delegate satisfies it. Pinning it here means a model that
 * stops exposing `findFirst` is a compile error at the cast below, rather than
 * a runtime failure deep inside a request.
 */
type OwnershipDelegate = {
  findFirst: (args: {
    where: Record<string, unknown>;
    select: { id: true };
  }) => Promise<{ id: string } | null>;
};

/**
 * Resolves a model name to its delegate.
 *
 * A single assertion is unavoidable: Prisma's delegates are structurally
 * incompatible with each other, so a union of them cannot be indexed and called.
 * The assertion is bounded to `OwnedModel`, which is a closed list checked
 * against the client, and the result is narrowed to `OwnershipDelegate`. The
 * previous `as any` had neither bound, so a misspelled model name compiled.
 */
function delegateFor(model: OwnedModel): OwnershipDelegate {
  const delegate: unknown = db[model];
  if (
    typeof delegate !== "object" ||
    delegate === null ||
    typeof (delegate as { findFirst?: unknown }).findFirst !== "function"
  ) {
    throw new Error(`Model "${model}" is not a queryable Prisma delegate.`);
  }
  return delegate as OwnershipDelegate;
}

/**
 * Confirms the record exists and belongs to `userId`, then returns its id.
 * Throws `NOT_FOUND` rather than `FORBIDDEN` deliberately: telling a caller
 * that a record exists but is theirs-not-to-see leaks information.
 */
export async function assertOwned(
  model: OwnedModel,
  id: string,
  userId: string,
  label?: string,
): Promise<string> {
  const found = await delegateFor(model).findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!found) throw errors.notFound(label ?? humanize(model));
  return found.id;
}

/**
 * Confirms every id in a list is owned by the user. Used when linking records
 * (a task to a project, a journal entry to several goals) so one forged id
 * cannot attach someone else's data.
 */
export async function assertAllOwned(
  model: OwnedModel,
  ids: string[],
  userId: string,
  label?: string,
): Promise<string[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];

  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "${tableName(model)}" WHERE id = ANY($1::text[]) AND "userId" = $2`,
    unique,
    userId,
  );

  if (rows.length !== unique.length) {
    throw errors.notFound(label ?? humanize(model));
  }
  return unique;
}

/**
 * Optional variant: returns null instead of throwing when not found.
 *
 * Use this only for *filtering* an untrusted id out of a set the caller does
 * not control. Never use it when a client sent the id directly — silently
 * dropping a forged reference makes the write appear to have succeeded while
 * the link is missing, which is worse than refusing it. Reach for
 * `assertOwned` in that case.
 */
export async function findOwned(
  model: OwnedModel,
  id: string | null | undefined,
  userId: string,
): Promise<string | null> {
  if (!id) return null;
  const found = await delegateFor(model).findFirst({
    where: { id, userId },
    select: { id: true },
  });
  return found?.id ?? null;
}

/**
 * Maps a Prisma model name to its physical table so raw ownership checks stay
 * correct. Kept beside the enum above so the two cannot drift apart unnoticed.
 */
function tableName(model: OwnedModel): string {
  const names: Record<OwnedModel, string> = {
    area: "Area",
    goal: "Goal",
    project: "Project",
    milestone: "Milestone",
    task: "Task",
    habit: "Habit",
    journalEntry: "JournalEntry",
    lifeEvent: "LifeEvent",
    account: "Account",
    category: "Category",
    transaction: "Transaction",
    budget: "Budget",
    savingsGoal: "SavingsGoal",
    recurringRule: "RecurringRule",
    monthlyPlan: "MonthlyPlan",
    tag: "Tag",
    attachment: "Attachment",
    review: "Review",
    insight: "Insight",
  };
  return names[model];
}

function humanize(model: string): string {
  const labels: Record<string, string> = {
    area: "Area",
    goal: "Tujuan",
    project: "Proyek",
    milestone: "Milestone",
    task: "Tugas",
    habit: "Kebiasaan",
    journalEntry: "Catatan jurnal",
    lifeEvent: "Peristiwa",
    account: "Akun",
    category: "Kategori",
    transaction: "Transaksi",
    budget: "Anggaran",
    savingsGoal: "Target tabungan",
    recurringRule: "Transaksi berulang",
    monthlyPlan: "Rencana bulanan",
    tag: "Tag",
    attachment: "Lampiran",
    review: "Review",
    insight: "Insight",
  };
  return labels[model] ?? "Data";
}

/**
 * The scope object every Prisma query must spread in. Using a named helper
 * makes a missing ownership filter obvious in review.
 */
export function scoped(userId: string) {
  return { userId } as const;
}
