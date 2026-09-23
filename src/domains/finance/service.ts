import { db } from "@/lib/db";
import { errors } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import { assertOwned } from "@/lib/auth/ownership";
import {
  addCalendarDays,
  monthPeriod,
  parseCalendarDay,
  today,
  toCalendarDay,
  type CalendarDay,
  type Period,
} from "@/lib/date";
import { parseAmountInput, toMinor } from "@/lib/money";
import { z } from "zod";
import type { Account, Prisma, Transaction } from "@/generated/prisma/client";

/**
 * Finance.
 *
 * The system is a ledger. No balance is ever stored: every figure is derived
 * from `openingBalance` plus the immutable transaction rows. That single rule
 * is what makes the numbers trustworthy, and it is enforced here rather than
 * being left to individual callers.
 *
 * Sign convention on `Transaction.amount`:
 *   • Always a non-negative integer count of minor units.
 *   • `type` carries the direction. An expense of 50 000 is stored as
 *     `amount = 50000, type = EXPENSE`, never as -50000.
 *
 * Effect on a balance:
 *   INCOME      +amount   on accountId
 *   EXPENSE     -amount   on accountId
 *   TRANSFER    -amount   on accountId, +amount on toAccountId
 *   ADJUSTMENT  +amount   on accountId (signed by `adjustmentDirection`)
 */

// — schemas —

// Imported for the Zod schemas below, and re-exported so a server-side caller
// can keep importing from the service. Client components must import from
// `./vocabulary` instead, or this module drags the database into the browser.
import { ACCOUNT_TYPES, TRANSACTION_TYPES } from "./vocabulary";
export { ACCOUNT_TYPES, TRANSACTION_TYPES };

export const accountCreateSchema = z.object({
  name: z.string().trim().min(1, "Nama akun wajib diisi.").max(60, "Maksimal 60 karakter."),
  type: z.enum(ACCOUNT_TYPES).default("CASH"),
  currency: z.string().trim().length(3, "Kode mata uang 3 huruf.").default("IDR"),
  openingBalance: z.union([z.string(), z.number()]).default("0"),
  institution: z.string().trim().max(80).optional().or(z.literal("")),
  colorToken: z.string().trim().max(24).default("accent"),
  iconName: z.string().trim().max(40).optional().or(z.literal("")),
});

export const accountUpdateSchema = accountCreateSchema.partial().omit({ openingBalance: true });

const calendarDayString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD.")
  .refine((value) => parseCalendarDay(value) !== null, "Tanggal tersebut tidak ada di kalender.");

export const transactionCreateSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES),
    amount: z.union([z.string(), z.number()]),
    currency: z.string().trim().length(3).optional(),
    accountId: z.string().trim().min(1, "Akun wajib dipilih."),
    toAccountId: z.string().trim().min(1).optional().or(z.literal("")),
    categoryId: z.string().trim().min(1).optional().or(z.literal("")),
    occurredOn: calendarDayString.optional(),
    description: z.string().trim().max(200).optional().or(z.literal("")),
    payee: z.string().trim().max(120).optional().or(z.literal("")),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
    /** Only meaningful for ADJUSTMENT: which way the correction moves money. */
    adjustmentDirection: z.enum(["increase", "decrease"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "TRANSFER") {
      if (!data.toAccountId) {
        ctx.addIssue({
          code: "custom",
          path: ["toAccountId"],
          message: "Transfer perlu akun tujuan.",
        });
      } else if (data.toAccountId === data.accountId) {
        ctx.addIssue({
          code: "custom",
          path: ["toAccountId"],
          message: "Akun tujuan tidak boleh sama dengan akun asal.",
        });
      }
    }
    if (data.type !== "TRANSFER" && data.toAccountId) {
      ctx.addIssue({
        code: "custom",
        path: ["toAccountId"],
        message: "Hanya transfer yang punya akun tujuan.",
      });
    }
    if (data.type === "ADJUSTMENT" && !data.adjustmentDirection) {
      ctx.addIssue({
        code: "custom",
        path: ["adjustmentDirection"],
        message: "Pilih arah penyesuaian.",
      });
    }
  });

export const transactionUpdateSchema = z.object({
  categoryId: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().max(200).nullable().optional(),
  payee: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  occurredOn: calendarDayString.optional(),
});

export type AccountCreateInput = z.infer<typeof accountCreateSchema>;
export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;

// — balances —

/**
 * Ids of transactions that have been cancelled by a reversal.
 *
 * A reversal leaves the original row in place for the audit trail, so anything
 * reporting *activity* — spending, earnings, category shares — must exclude the
 * cancelled originals explicitly. Derived from `reversesTransactionId` rather
 * than a stored boolean, so the reversal row stays the single source of truth
 * and the two can never disagree.
 */
async function reversedTransactionIds(
  userId: string,
  scope: Prisma.TransactionWhereInput = {},
): Promise<string[]> {
  const reversals = await db.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      reversesTransactionId: { not: null },
      ...scope,
    },
    select: { reversesTransactionId: true },
  });

  return reversals
    .map((row) => row.reversesTransactionId)
    .filter((id): id is string => id !== null);
}

export type AccountBalance = {
  accountId: string;
  /** Opening balance plus every transaction effect. */
  balance: bigint;
  income: bigint;
  expense: bigint;
  transfersIn: bigint;
  transfersOut: bigint;
  adjustments: bigint;
  transactionCount: number;
};

/**
 * Computes the balance of every account from the ledger.
 *
 * Two grouped aggregate queries regardless of account count, so the cost is
 * constant and the result cannot drift from the rows it summarises.
 */
export async function computeAccountBalances(
  userId: string,
  options: { from?: CalendarDay; to?: CalendarDay } = {},
): Promise<Map<string, AccountBalance>> {
  const accounts = await db.account.findMany({
    where: { userId },
    select: { id: true, openingBalance: true },
  });

  const out = new Map<string, AccountBalance>();
  for (const account of accounts) {
    out.set(account.id, {
      accountId: account.id,
      balance: account.openingBalance,
      income: 0n,
      expense: 0n,
      transfersIn: 0n,
      transfersOut: 0n,
      adjustments: 0n,
      transactionCount: 0,
    });
  }
  if (accounts.length === 0) return out;

  const range: Prisma.TransactionWhereInput = {};
  if (options.from || options.to) {
    range.occurredOn = {};
    if (options.from) range.occurredOn.gte = options.from;
    if (options.to) range.occurredOn.lte = options.to;
  }

  const [outgoing, incoming] = await Promise.all([
    db.transaction.groupBy({
      by: ["accountId", "type"],
      where: { userId, deletedAt: null, ...range },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    // Transfers and adjustments credit a second account, so their effect must
    // be read from the destination side as well.
    db.transaction.groupBy({
      by: ["toAccountId", "type"],
      where: {
        userId,
        deletedAt: null,
        toAccountId: { not: null },
        ...range,
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  for (const row of outgoing) {
    const entry = out.get(row.accountId);
    if (!entry) continue;

    const amount = row._sum.amount ?? 0n;
    entry.transactionCount += row._count._all;

    switch (row.type) {
      case "INCOME":
        entry.income += amount;
        entry.balance += amount;
        break;
      case "EXPENSE":
        entry.expense += amount;
        entry.balance -= amount;
        break;
      case "TRANSFER":
        entry.transfersOut += amount;
        entry.balance -= amount;
        break;
      case "ADJUSTMENT":
        // An adjustment is already signed at the time it is written: a positive
        // amount adds to the balance, a negative one subtracts. A reversal is
        // an adjustment whose sign is the opposite of the row it cancels, so
        // this single line undoes an expense (+amount) and an income (-amount)
        // without needing to know which it was.
        entry.adjustments += amount;
        entry.balance += amount;
        break;
    }
  }

  for (const row of incoming) {
    if (!row.toAccountId) continue;
    const entry = out.get(row.toAccountId);
    if (!entry) continue;

    // A destination account only ever sees the credit side of a transfer.
    if (row.type === "TRANSFER") {
      const amount = row._sum.amount ?? 0n;
      entry.transfersIn += amount;
      entry.balance += amount;
    } else if (row.type === "ADJUSTMENT") {
      const amount = row._sum.amount ?? 0n;
      entry.adjustments += amount;
      entry.balance += amount;
    }
  }

  return out;
}

// — queries —

export async function listAccounts(userId: string, options: { includeArchived?: boolean } = {}) {
  return db.account.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function listCategories(userId: string, kind?: "INCOME" | "EXPENSE" | "TRANSFER") {
  return db.category.findMany({
    where: {
      userId,
      archivedAt: null,
      ...(kind ? { kind } : {}),
    },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: { parent: { select: { id: true, name: true } } },
  });
}

export async function createAccount(userId: string, input: unknown): Promise<Account> {
  const data = parseOrThrow(accountCreateSchema, input, "Periksa kembali data akun.");

  const duplicate = await db.account.findFirst({
    where: { userId, name: data.name },
    select: { id: true },
  });
  if (duplicate) throw errors.conflict(`Akun "${data.name}" sudah ada.`);

  const opening = toMinor(data.openingBalance);

  const last = await db.account.findFirst({
    where: { userId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  return db.account.create({
    data: {
      userId,
      name: data.name,
      type: data.type,
      currency: data.currency.toUpperCase(),
      openingBalance: opening,
      institution: data.institution || null,
      colorToken: data.colorToken,
      iconName: data.iconName || null,
      position: (last?.position ?? -1) + 1,
    },
  });
}

export async function updateAccount(
  userId: string,
  accountId: string,
  input: unknown,
): Promise<Account> {
  await assertOwned("account", accountId, userId, "Akun");
  const data = parseOrThrow(accountUpdateSchema, input, "Periksa kembali data akun.");

  if (data.name) {
    const duplicate = await db.account.findFirst({
      where: { userId, name: data.name, id: { not: accountId } },
      select: { id: true },
    });
    if (duplicate) throw errors.conflict(`Akun "${data.name}" sudah ada.`);
  }

  return db.account.update({
    where: { id: accountId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.institution !== undefined ? { institution: data.institution || null } : {}),
      ...(data.colorToken !== undefined ? { colorToken: data.colorToken } : {}),
      ...(data.iconName !== undefined ? { iconName: data.iconName || null } : {}),
    },
  });
}

/**
 * Closes an account.
 *
 * Refused while a non-zero balance remains, because closing it would make that
 * money vanish from the net total with no explanation.
 */
export async function closeAccount(userId: string, accountId: string): Promise<Account> {
  await assertOwned("account", accountId, userId, "Akun");

  const balances = await computeAccountBalances(userId);
  const balance = balances.get(accountId)?.balance ?? 0n;

  if (balance !== 0n) {
    throw errors.conflict(
      "Akun ini masih punya saldo. Pindahkan atau sesuaikan saldonya dulu sampai nol.",
    );
  }

  return db.account.update({
    where: { id: accountId },
    data: { closedAt: new Date() },
  });
}

export async function listTransactions(
  userId: string,
  filters: {
    accountId?: string;
    categoryId?: string;
    types?: Transaction["type"][];
    from?: CalendarDay;
    to?: CalendarDay;
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ transactions: TransactionWithContext[]; total: number }> {
  const where: Prisma.TransactionWhereInput = { userId, deletedAt: null };

  if (filters.accountId) {
    // A transfer touches two accounts, so both sides must match.
    where.OR = [{ accountId: filters.accountId }, { toAccountId: filters.accountId }];
  }
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.types?.length) where.type = { in: filters.types };

  if (filters.from || filters.to) {
    where.occurredOn = {};
    if (filters.from) where.occurredOn.gte = filters.from;
    if (filters.to) where.occurredOn.lte = filters.to;
  }

  if (filters.search?.trim()) {
    const term = filters.search.trim();
    const searchClause: Prisma.TransactionWhereInput[] = [
      { description: { contains: term, mode: "insensitive" } },
      { payee: { contains: term, mode: "insensitive" } },
      { notes: { contains: term, mode: "insensitive" } },
    ];
    // Combined with the account filter rather than replacing it.
    where.AND = [{ OR: searchClause }];
  }

  const [transactions, total] = await Promise.all([
    db.transaction.findMany({
      where,
      include: {
        account: { select: { id: true, name: true, colorToken: true, iconName: true } },
        toAccount: { select: { id: true, name: true, colorToken: true, iconName: true } },
        category: { select: { id: true, name: true, colorToken: true, iconName: true, kind: true } },
        attachments: { select: { id: true, kind: true, fileName: true }, take: 1 },
      },
      orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
      take: filters.limit ?? 100,
      skip: filters.offset ?? 0,
    }),
    db.transaction.count({ where }),
  ]);

  return { transactions: transactions as TransactionWithContext[], total };
}

export type TransactionWithContext = Transaction & {
  account: { id: string; name: string; colorToken: string; iconName: string | null };
  toAccount: { id: string; name: string; colorToken: string; iconName: string | null } | null;
  category: {
    id: string;
    name: string;
    colorToken: string;
    iconName: string | null;
    kind: string;
  } | null;
  attachments: Array<{ id: string; kind: string; fileName: string }>;
};

/**
 * Records a transaction.
 *
 * The only place a `Transaction` row is created, so the sign convention cannot
 * be violated by a caller.
 */
export async function createTransaction(
  userId: string,
  input: unknown,
): Promise<Transaction> {
  const data = parseOrThrow(transactionCreateSchema, input, "Periksa kembali data transaksi.");

  const [accountId, toAccountId, categoryId] = await Promise.all([
    assertOwned("account", data.accountId, userId, "Akun"),
    data.toAccountId ? assertOwned("account", data.toAccountId, userId, "Akun tujuan") : null,
    data.categoryId ? assertOwned("category", data.categoryId, userId, "Kategori") : null,
  ]);

  const magnitude = parseAmountInput(String(data.amount), data.currency ?? "IDR");
  if (magnitude <= 0n) {
    throw errors.validation("Jumlah harus lebih dari nol.", {
      amount: "Jumlah harus lebih dari nol.",
    });
  }

  // A transfer's two sides are the same number, so the account it was entered
  // from is the *source*. Storing the sign here means the balance calculator
  // never has to guess a direction.
  const signedAmount =
    data.type === "ADJUSTMENT" && data.adjustmentDirection === "decrease"
      ? -magnitude
      : magnitude;

  return db.transaction.create({
    data: {
      userId,
      type: data.type,
      amount: signedAmount,
      currency: data.currency?.toUpperCase() ?? "IDR",
      accountId,
      toAccountId,
      categoryId,
      occurredOn:
        (data.occurredOn ? parseCalendarDay(data.occurredOn) : null) ??
        today("Asia/Jakarta"),
      // The instant is anchored to the start of the chosen day so a
      // back-dated entry does not appear to have happened at the current time.
      occurredAt: data.occurredOn
        ? (parseCalendarDay(data.occurredOn) as Date)
        : new Date(),
      description: data.description || null,
      payee: data.payee || null,
      notes: data.notes || null,
    },
  });
}

/**
 * Edits a transaction's descriptive fields.
 *
 * Amount, type and accounts are deliberately not editable: changing them after
 * the fact would rewrite history that other figures have already been computed
 * from. A correction is a new row, which is what `reverseTransaction` creates.
 */
export async function updateTransaction(
  userId: string,
  transactionId: string,
  input: unknown,
): Promise<Transaction> {
  await assertOwned("transaction", transactionId, userId, "Transaksi");
  const data = parseOrThrow(transactionUpdateSchema, input, "Periksa kembali data transaksi.");

  const patch: Prisma.TransactionUpdateInput = {};

  if (data.description !== undefined) patch.description = data.description;
  if (data.payee !== undefined) patch.payee = data.payee;
  if (data.notes !== undefined) patch.notes = data.notes;

  if (data.categoryId !== undefined) {
    patch.category = data.categoryId
      ? { connect: { id: await assertOwned("category", data.categoryId, userId, "Kategori") } }
      : { disconnect: true };
  }

  if (data.occurredOn !== undefined) {
    const day = parseCalendarDay(data.occurredOn);
    if (!day) throw errors.validation("Tanggal tidak valid.", { occurredOn: "Tanggal tidak valid." });
    patch.occurredOn = day;
  }

  return db.transaction.update({ where: { id: transactionId }, data: patch });
}

/**
 * Corrects a transaction by posting a reversing entry.
 *
 * This is the accounting meaning of a reversal: the original row is left
 * untouched and stays visible in the history, and a new signed adjustment is
 * posted whose effect on the balance is the exact opposite of the original's.
 * The two cancel out arithmetically and neither has to be special-cased.
 *
 * A first attempt at this soft-deleted the original *and* wrote a mirror row,
 * which cancelled out twice and left the balance unchanged. The lesson is that
 * the ledger has exactly one mechanism for undoing an entry, and it is the
 * reversing entry.
 *
 * Softer than a hard delete, and better than a soft delete alone:
 *   - `deletedAt` stays null, so a report can still show what was recorded.
 *   - The reversal carries `reversesTransactionId`, so the pair can be linked.
 *
 * A transfer touched two accounts, so its reversal needs two rows: one
 * returning the money to the source, one removing it from the destination.
 */
export async function reverseTransaction(
  userId: string,
  transactionId: string,
): Promise<Transaction> {
  const original = await db.transaction.findFirst({
    where: { id: transactionId, userId, deletedAt: null },
  });
  if (!original) throw errors.notFound("Transaksi");

  // Guard against reversing twice: the second reversal would re-apply the
  // original effect instead of cancelling it.
  const alreadyReversed = await db.transaction.findFirst({
    where: { userId, reversesTransactionId: original.id, deletedAt: null },
    select: { id: true },
  });
  if (alreadyReversed) {
    throw errors.conflict("Transaksi ini sudah dibatalkan sebelumnya.");
  }

  const day = today("Asia/Jakarta");
  const label = original.description
    ? `Pembatalan: ${original.description}`
    : "Pembatalan transaksi";

  return db.$transaction(async (tx) => {
    if (original.type === "TRANSFER" && original.toAccountId) {
      // Undo the outgoing leg: money returns to the source.
      await tx.transaction.create({
        data: {
          userId,
          type: "INCOME",
          amount: original.amount,
          currency: original.currency,
          accountId: original.accountId,
          occurredOn: day,
          occurredAt: new Date(),
          description: label,
          reversesTransactionId: original.id,
        },
      });

      // Undo the incoming leg: the destination gives the money up.
      return tx.transaction.create({
        data: {
          userId,
          type: "EXPENSE",
          amount: original.amount,
          currency: original.currency,
          accountId: original.toAccountId,
          occurredOn: day,
          occurredAt: new Date(),
          description: label,
          reversesTransactionId: original.id,
        },
      });
    }

    // Signed opposite of the original's effect, so the two rows sum to zero:
    //   INCOME     +amount  ->  reversal -amount  (ADJUSTMENT decrease)
    //   EXPENSE    -amount  ->  reversal +amount  (ADJUSTMENT increase)
    //   ADJUSTMENT signed   ->  reversal -amount
    const effect =
      original.type === "INCOME"
        ? original.amount
        : original.type === "EXPENSE"
          ? -original.amount
          : original.amount; // an ADJUSTMENT is already signed

    return tx.transaction.create({
      data: {
        userId,
        type: "ADJUSTMENT",
        amount: -effect,
        currency: original.currency,
        accountId: original.accountId,
        categoryId: original.categoryId,
        occurredOn: day,
        occurredAt: new Date(),
        description: label,
        reversesTransactionId: original.id,
      },
    });
  });
}

export type DailySummary = {
  day: CalendarDay;
  netWorth: bigint;
  todayIncome: bigint;
  todayExpense: bigint;
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    currency: string;
    balance: bigint;
    colorToken: string;
    iconName: string | null;
  }>;
};

/**
 * Today's money position: what everything is worth, and what moved today.
 *
 * Transfers are excluded from both income and expense — moving money between
 * your own accounts is not earning or spending, and counting it would inflate
 * every figure on the page.
 *
 * A reversal is an `ADJUSTMENT` that cancels an earlier row. It is reported in
 * the direction it actually moves money, so a cancelled expense reduces the
 * day's spending rather than appearing as income.
 */
export async function getDailySummary(userId: string, day: CalendarDay): Promise<DailySummary> {
  const [accounts, balances, moves] = await Promise.all([
    db.account.findMany({
      where: { userId, archivedAt: null, closedAt: null },
      orderBy: [{ position: "asc" }],
    }),
    computeAccountBalances(userId),
    db.transaction.groupBy({
      by: ["type"],
      where: {
        userId,
        deletedAt: null,
        occurredOn: day,
        type: { in: ["INCOME", "EXPENSE", "ADJUSTMENT"] },
        // A cancelled entry must not count as activity for the day.
        reversesTransactionId: null,
        id: { notIn: await reversedTransactionIds(userId, { occurredOn: day }) },
      },
      _sum: { amount: true },
    }),
  ]);

  let netWorth = 0n;
  for (const account of accounts) {
    netWorth += balances.get(account.id)?.balance ?? 0n;
  }

  // Adjustments are deliberately excluded. They exist to correct a balance, and
  // reporting one as income would show the user money they never earned. The
  // balance calculator still applies them, which is where they belong.
  let income = 0n;
  let expense = 0n;
  for (const row of moves) {
    const amount = row._sum.amount ?? 0n;
    if (row.type === "INCOME") income += amount;
    else if (row.type === "EXPENSE") expense += amount;
  }

  return {
    day,
    netWorth,
    todayIncome: income,
    todayExpense: expense,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance: balances.get(account.id)?.balance ?? account.openingBalance,
      colorToken: account.colorToken,
      iconName: account.iconName,
    })),
  };
}

export type MonthSummary = {
  period: Period;
  income: bigint;
  expense: bigint;
  net: bigint;
  byCategory: Array<{
    categoryId: string | null;
    categoryName: string;
    colorToken: string;
    iconName: string | null;
    kind: string;
    total: bigint;
    share: number;
  }>;
  previous: { income: bigint; expense: bigint; net: bigint };
};

/**
 * Month-to-date money summary with a comparison against the previous month.
 *
 * The comparison is intentionally unfiltered by day-of-month: a month that is
 * only half over legitimately has less income than a complete one, and the UI
 * labels it as month-to-date rather than pretending the two are equivalent.
 */
export async function getMonthSummary(userId: string, day: CalendarDay): Promise<MonthSummary> {
  const period = monthPeriod(day);
  const previousPeriod = monthPeriod(addCalendarDays(period.start, -1));

  const [current, previous, grouped] = await Promise.all([
    db.transaction.groupBy({
      by: ["type"],
      where: {
        userId,
        deletedAt: null,
        occurredOn: { gte: period.start, lt: period.endExclusive },
        type: { in: ["INCOME", "EXPENSE"] },
        reversesTransactionId: null,
        id: {
          notIn: await reversedTransactionIds(userId, {
            occurredOn: { gte: period.start, lt: period.endExclusive },
          }),
        },
      },
      _sum: { amount: true },
    }),
    db.transaction.groupBy({
      by: ["type"],
      where: {
        userId,
        deletedAt: null,
        occurredOn: { gte: previousPeriod.start, lt: previousPeriod.endExclusive },
        type: { in: ["INCOME", "EXPENSE"] },
        reversesTransactionId: null,
        id: {
          notIn: await reversedTransactionIds(userId, {
            occurredOn: { gte: previousPeriod.start, lt: previousPeriod.endExclusive },
          }),
        },
      },
      _sum: { amount: true },
    }),
    db.transaction.groupBy({
      by: ["categoryId"],
      where: {
        userId,
        deletedAt: null,
        occurredOn: { gte: period.start, lt: period.endExclusive },
        type: "EXPENSE",
        categoryId: { not: null },
        reversesTransactionId: null,
        id: {
          notIn: await reversedTransactionIds(userId, {
            occurredOn: { gte: period.start, lt: period.endExclusive },
          }),
        },
      },
      _sum: { amount: true },
    }),
  ]);

  // Adjustments are excluded for the same reason as on the daily summary: a
  // correction is not income, and treating it as one would misstate both the
  // month's earnings and its spending.
  const summarise = (rows: typeof current) => {
    let income = 0n;
    let expense = 0n;
    for (const row of rows) {
      const amount = row._sum.amount ?? 0n;
      if (row.type === "INCOME") income += amount;
      else if (row.type === "EXPENSE") expense += amount;
    }
    return { income, expense, net: income - expense };
  };

  const now = summarise(current);
  const before = summarise(previous);

  // Category names are fetched in one query rather than per row.
  const categoryIds = grouped
    .map((row) => row.categoryId)
    .filter((id): id is string => id !== null);

  const categories =
    categoryIds.length > 0
      ? await db.category.findMany({
          where: { id: { in: categoryIds } },
          select: {
            id: true,
            name: true,
            colorToken: true,
            iconName: true,
            kind: true,
          },
        })
      : [];

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const totalExpense = now.expense;

  const byCategory = grouped
    .map((row) => {
      const category = row.categoryId ? categoryById.get(row.categoryId) : null;
      const total = row._sum.amount ?? 0n;
      return {
        categoryId: row.categoryId,
        categoryName: category?.name ?? "Tanpa kategori",
        colorToken: category?.colorToken ?? "neutral",
        iconName: category?.iconName ?? null,
        kind: category?.kind ?? "EXPENSE",
        total,
        // Share of spending, as a fraction. Zero-guarded so an empty month does
        // not produce NaN.
        share: totalExpense > 0n ? Number(total) / Number(totalExpense) : 0,
      };
    })
    .sort((a, b) => (b.total > a.total ? 1 : -1));

  return {
    period,
    income: now.income,
    expense: now.expense,
    net: now.net,
    byCategory,
    previous: before,
  };
}

/**
 * Account balance as of a specific day, used by the ledger view for a running
 * total column.
 */
export async function getBalanceAsOf(
  userId: string,
  accountId: string,
  day: CalendarDay,
): Promise<bigint> {
  const account = await db.account.findFirst({
    where: { id: accountId, userId },
    select: { openingBalance: true },
  });
  if (!account) throw errors.notFound("Akun");

  const [out, incoming] = await Promise.all([
    db.transaction.groupBy({
      by: ["type"],
      where: { userId, accountId, deletedAt: null, occurredOn: { lte: day } },
      _sum: { amount: true },
    }),
    db.transaction.groupBy({
      by: ["type"],
      where: { userId, toAccountId: accountId, deletedAt: null, occurredOn: { lte: day } },
      _sum: { amount: true },
    }),
  ]);

  let balance = account.openingBalance;
  for (const row of out) {
    const amount = row._sum.amount ?? 0n;
    if (row.type === "INCOME" || row.type === "ADJUSTMENT") balance += amount;
    else balance -= amount;
  }
  for (const row of incoming) {
    const amount = row._sum.amount ?? 0n;
    if (row.type === "TRANSFER" || row.type === "ADJUSTMENT") balance += amount;
  }
  return balance;
}

/** Convenience: net worth in the user's currency, for the Today screen. */
export async function getNetWorth(userId: string): Promise<bigint> {
  const balances = await computeAccountBalances(userId);
  const accounts = await db.account.findMany({
    where: { userId, archivedAt: null, closedAt: null },
    select: { id: true },
  });
  return accounts.reduce((sum, account) => sum + (balances.get(account.id)?.balance ?? 0n), 0n);
}

export { toCalendarDay };

/** Namespace used by the Today screen so the import stays a single symbol. */
export const finance = {
  getDailySummary,
  getMonthSummary,
  getNetWorth,
  computeAccountBalances,
};

/**
 * Income, expense and net per calendar day over a range.
 *
 * One grouped query, then a dense array with zero-filled gaps. A chart needs a
 * value for every day in the window, and an absent day is genuinely zero
 * activity rather than missing data.
 *
 * Adjustments are excluded, matching the summaries: they move a balance but are
 * not activity.
 */
export async function getDailyTotals(
  userId: string,
  from: CalendarDay,
  to: CalendarDay,
): Promise<Array<{ date: string; income: bigint; expense: bigint; net: bigint }>> {
  const reversedIds = await reversedTransactionIds(userId, {
    occurredOn: { gte: from, lte: to },
  });

  const rows = await db.transaction.groupBy({
    by: ["occurredOn", "type"],
    where: {
      userId,
      deletedAt: null,
      occurredOn: { gte: from, lte: to },
      type: { in: ["INCOME", "EXPENSE"] },
      id: { notIn: reversedIds },
    },
    _sum: { amount: true },
  });

  const byDay = new Map<string, { income: bigint; expense: bigint }>();
  for (const row of rows) {
    const key = row.occurredOn.toISOString().slice(0, 10);
    const bucket = byDay.get(key) ?? { income: 0n, expense: 0n };
    const amount = row._sum.amount ?? 0n;
    if (row.type === "INCOME") bucket.income += amount;
    else bucket.expense += amount;
    byDay.set(key, bucket);
  }

  const out: Array<{ date: string; income: bigint; expense: bigint; net: bigint }> = [];
  let cursor = from;
  // A bounded walk: the caller controls the range, and this guards against an
  // accidental multi-year span producing a huge array.
  let guard = 0;
  while (cursor <= to && guard < 400) {
    guard++;
    const key = cursor.toISOString().slice(0, 10);
    const bucket = byDay.get(key) ?? { income: 0n, expense: 0n };
    out.push({
      date: key,
      income: bucket.income,
      expense: bucket.expense,
      net: bucket.income - bucket.expense,
    });
    cursor = addCalendarDays(cursor, 1);
  }

  return out;
}

/**
 * Income, expense and net for a filtered set of transactions.
 *
 * Uses the same exclusion rules as `getMonthSummary`: reversed originals are
 * skipped, transfers are not income or expense, and adjustments are reported on
 * their own. Sharing those rules is why the total under a filtered list always
 * matches the figure the summary screens show for the same set.
 */
export async function summariseTransactions(
  userId: string,
  filters: {
    accountId?: string;
    categoryId?: string;
    types?: Transaction["type"][];
    from?: CalendarDay;
    to?: CalendarDay;
    search?: string;
  } = {},
): Promise<{ income: bigint; expense: bigint; net: bigint; count: number }> {
  const where: Prisma.TransactionWhereInput = {
    userId,
    deletedAt: null,
    reversesTransactionId: null,
  };

  if (filters.accountId) {
    where.OR = [{ accountId: filters.accountId }, { toAccountId: filters.accountId }];
  }
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.types?.length) where.type = { in: filters.types };

  if (filters.from || filters.to) {
    where.occurredOn = {};
    if (filters.from) where.occurredOn.gte = filters.from;
    if (filters.to) where.occurredOn.lte = filters.to;
  }

  if (filters.search?.trim()) {
    const term = filters.search.trim();
    where.AND = [
      {
        OR: [
          { description: { contains: term, mode: "insensitive" } },
          { payee: { contains: term, mode: "insensitive" } },
          { notes: { contains: term, mode: "insensitive" } },
        ],
      },
    ];
  }

  // Ids cancelled within the same window, so a reversal in a different month
  // does not silently change this month's totals.
  // Only constrain the window when a bound was supplied; an empty object
  // means "every transaction", which is what an unfiltered summary wants.
  const reversedIds = await reversedTransactionIds(
    userId,
    filters.from || filters.to
      ? {
          occurredOn: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {},
  );

  const [rows, count] = await Promise.all([
    db.transaction.groupBy({
      by: ["type"],
      where: { ...where, id: { notIn: reversedIds } },
      _sum: { amount: true },
    }),
    db.transaction.count({
      where: { ...where, id: { notIn: reversedIds } },
    }),
  ]);

  let income = 0n;
  let expense = 0n;
  for (const row of rows) {
    const amount = row._sum.amount ?? 0n;
    if (row.type === "INCOME") income += amount;
    else if (row.type === "EXPENSE") expense += amount;
  }

  return { income, expense, net: income - expense, count };
}
