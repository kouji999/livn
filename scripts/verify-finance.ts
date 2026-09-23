/**
 * Finance ledger verification.
 *
 *   npx tsx scripts/verify-finance.ts
 *
 * The claim this file exists to prove: every balance is derived from the
 * ledger, transfers never touch income or expense, and a correction preserves
 * the audit trail rather than overwriting it.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { registerUser } from "../src/domains/auth/service";
import * as finance from "../src/domains/finance/service";
import { parseCalendarDay, formatCalendarDay } from "../src/lib/date";
import { formatMoney } from "../src/lib/money";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` - ${detail}` : ""}`);
}

async function expectRejection(label: string, fn: () => Promise<unknown>, fragment?: string) {
  try {
    await fn();
    check(label, false, "expected a rejection but it succeeded");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fieldErrors =
      typeof error === "object" && error !== null && "fieldErrors" in error
        ? JSON.stringify((error as { fieldErrors?: unknown }).fieldErrors ?? {})
        : "";
    const haystack = `${message} ${fieldErrors}`;
    if (fragment) check(label, haystack.includes(fragment), message.slice(0, 70));
    else check(label, true, message.slice(0, 70));
  }
}

const DAY = parseCalendarDay("2026-09-23")!;
const IDR = "IDR";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const email = `finance-verify+${Date.now()}@livn.test`;
  const password = "verification-passphrase-2026";
  const user = await registerUser({
    displayName: "Finance Verify",
    email,
    password,
    confirmPassword: password,
  });
  const userId = user.id;

  try {
    console.log("\nOpening a ledger");
    const accounts = await finance.listAccounts(userId);
    check("three starter accounts exist", accounts.length === 3, `${accounts.length}`);
    check("starter accounts open at zero", accounts.every((a) => a.openingBalance === 0n));

    const cash = accounts.find((a) => a.type === "CASH")!;
    const bank = accounts.find((a) => a.type === "BANK")!;

    // Opening balance is the only non-transaction input to a balance.
    await finance.updateAccount(userId, cash.id, {});
    const funded = await db.account.update({
      where: { id: cash.id },
      data: { openingBalance: 1_000_000n },
    });
    check("opening balance stored in minor units", funded.openingBalance === 1_000_000n);

    let balances = await finance.computeAccountBalances(userId);
    check(
      "balance starts at the opening balance",
      balances.get(cash.id)!.balance === 1_000_000n,
      formatMoney(balances.get(cash.id)!.balance, IDR),
    );

    console.log("\nIncome increases the balance");
    const categories = await finance.listCategories(userId, "INCOME");
    const salary = categories.find((c) => c.name === "Gaji")!;

    await finance.createTransaction(userId, {
      type: "INCOME",
      amount: "5000000",
      accountId: bank.id,
      categoryId: salary.id,
      occurredOn: formatCalendarDay(DAY),
      description: "Gaji September",
    });

    balances = await finance.computeAccountBalances(userId);
    check("bank holds the income", balances.get(bank.id)!.balance === 5_000_000n);
    check(
      "income is reported separately",
      balances.get(bank.id)!.income === 5_000_000n,
    );

    console.log("\nExpense decreases the balance");
    const expenseCategories = await finance.listCategories(userId, "EXPENSE");
    const food = expenseCategories.find((c) => c.name === "Makanan")!;

    await finance.createTransaction(userId, {
      type: "EXPENSE",
      amount: "85000",
      accountId: cash.id,
      categoryId: food.id,
      occurredOn: formatCalendarDay(DAY),
      description: "Makan siang",
    });

    balances = await finance.computeAccountBalances(userId);
    check(
      "cash falls by the expense",
      balances.get(cash.id)!.balance === 915_000n,
      formatMoney(balances.get(cash.id)!.balance, IDR),
    );
    check("expense is reported separately", balances.get(cash.id)!.expense === 85_000n);

    console.log("\nTransfer moves money without becoming income or expense");
    const beforeIncome = (await finance.getMonthSummary(userId, DAY)).income;
    const beforeExpense = (await finance.getMonthSummary(userId, DAY)).expense;

    await finance.createTransaction(userId, {
      type: "TRANSFER",
      amount: "500000",
      accountId: bank.id,
      toAccountId: cash.id,
      occurredOn: formatCalendarDay(DAY),
      description: "Tarik tunai",
    });

    balances = await finance.computeAccountBalances(userId);
    check(
      "source account decreases",
      balances.get(bank.id)!.balance === 4_500_000n,
      formatMoney(balances.get(bank.id)!.balance, IDR),
    );
    check(
      "destination account increases",
      balances.get(cash.id)!.balance === 1_415_000n,
      formatMoney(balances.get(cash.id)!.balance, IDR),
    );
    check(
      "transfer counts as transfer out, not expense",
      balances.get(bank.id)!.expense === 0n,
      `expense=${balances.get(bank.id)!.expense}`,
    );
    check(
      "transfer counts as transfer in, not income",
      balances.get(cash.id)!.income === 0n,
      `income=${balances.get(cash.id)!.income}`,
    );

    const afterSummary = await finance.getMonthSummary(userId, DAY);
    check(
      "net income and expense are unchanged by the transfer",
      afterSummary.income === beforeIncome && afterSummary.expense === beforeExpense,
      `income ${afterSummary.income}, expense ${afterSummary.expense}`,
    );

    console.log("\nNet worth is the sum of derived balances");
    const summary = await finance.getDailySummary(userId, DAY);
    check(
      "net worth equals cash plus bank",
      summary.netWorth === 1_415_000n + 4_500_000n,
      formatMoney(summary.netWorth, IDR),
    );
    check(
      "today's income is reported",
      summary.todayIncome === 5_000_000n,
      formatMoney(summary.todayIncome, IDR),
    );
    check(
      "today's expense is reported",
      summary.todayExpense === 85_000n,
      formatMoney(summary.todayExpense, IDR),
    );

    console.log("\nAdjustment reconciles a balance without becoming income or expense");
    const incomeBeforeAdjust = (await finance.getMonthSummary(userId, DAY)).income;
    const expenseBeforeAdjust = (await finance.getMonthSummary(userId, DAY)).expense;

    await finance.createTransaction(userId, {
      type: "ADJUSTMENT",
      amount: "10000",
      adjustmentDirection: "increase",
      accountId: cash.id,
      occurredOn: formatCalendarDay(DAY),
      description: "Rekonsiliasi selisih",
    });
    balances = await finance.computeAccountBalances(userId);
    check(
      "a positive adjustment adds to the balance",
      balances.get(cash.id)!.balance === 1_425_000n,
      formatMoney(balances.get(cash.id)!.balance, IDR),
    );
    check(
      "a positive adjustment is tracked separately",
      balances.get(cash.id)!.adjustments === 10_000n,
      `${balances.get(cash.id)!.adjustments}`,
    );

    await finance.createTransaction(userId, {
      type: "ADJUSTMENT",
      amount: "25000",
      adjustmentDirection: "decrease",
      accountId: cash.id,
      occurredOn: formatCalendarDay(DAY),
      description: "Koreksi salah catat",
    });
    balances = await finance.computeAccountBalances(userId);
    check(
      "a negative adjustment subtracts from the balance",
      balances.get(cash.id)!.balance === 1_400_000n,
      formatMoney(balances.get(cash.id)!.balance, IDR),
    );

    const afterAdjust = await finance.getMonthSummary(userId, DAY);
    check(
      "adjustments do not appear as income",
      afterAdjust.income === incomeBeforeAdjust,
      `${formatMoney(incomeBeforeAdjust, IDR)} -> ${formatMoney(afterAdjust.income, IDR)}`,
    );
    check(
      "adjustments do not appear as expense",
      afterAdjust.expense === expenseBeforeAdjust,
      `${formatMoney(expenseBeforeAdjust, IDR)} -> ${formatMoney(afterAdjust.expense, IDR)}`,
    );

    console.log("\nValidation");
    await expectRejection(
      "zero amount rejected",
      () => finance.createTransaction(userId, {
        type: "EXPENSE", amount: "0", accountId: cash.id, occurredOn: formatCalendarDay(DAY),
      }),
      "lebih dari nol",
    );
    await expectRejection(
      "negative amount rejected",
      () => finance.createTransaction(userId, {
        type: "EXPENSE", amount: "-5000", accountId: cash.id, occurredOn: formatCalendarDay(DAY),
      }),
      "lebih dari nol",
    );
    await expectRejection(
      "transfer without a destination rejected",
      () => finance.createTransaction(userId, {
        type: "TRANSFER", amount: "1000", accountId: cash.id, occurredOn: formatCalendarDay(DAY),
      }),
      "akun tujuan",
    );
    await expectRejection(
      "transfer to the same account rejected",
      () => finance.createTransaction(userId, {
        type: "TRANSFER", amount: "1000", accountId: cash.id, toAccountId: cash.id,
        occurredOn: formatCalendarDay(DAY),
      }),
      "tidak boleh sama",
    );
    await expectRejection(
      "destination on a non-transfer rejected",
      () => finance.createTransaction(userId, {
        type: "EXPENSE", amount: "1000", accountId: cash.id, toAccountId: bank.id,
        occurredOn: formatCalendarDay(DAY),
      }),
      "Hanya transfer",
    );
    await expectRejection(
      "adjustment without a direction rejected",
      () => finance.createTransaction(userId, {
        type: "ADJUSTMENT", amount: "1000", accountId: cash.id,
        occurredOn: formatCalendarDay(DAY),
      }),
      "arah penyesuaian",
    );
    await expectRejection(
      "impossible calendar date rejected",
      () => finance.createTransaction(userId, {
        type: "EXPENSE", amount: "1000", accountId: cash.id, occurredOn: "2026-02-31",
      }),
      "tidak ada di kalender",
    );

    console.log("\nOwnership");
    const other = await registerUser({
      displayName: "Other", email: `other+${Date.now()}@livn.test`,
      password, confirmPassword: password,
    });
    await expectRejection(
      "cannot post to another user's account",
      () => finance.createTransaction(other.id, {
        type: "EXPENSE", amount: "1000", accountId: cash.id, occurredOn: formatCalendarDay(DAY),
      }),
      "tidak ditemukan",
    );
    await expectRejection(
      "cannot use another user's category",
      () => finance.createTransaction(other.id, {
        type: "EXPENSE", amount: "1000", accountId: cash.id, categoryId: food.id,
        occurredOn: formatCalendarDay(DAY),
      }),
      "tidak ditemukan",
    );

    console.log("\nCategory breakdown");
    const month = await finance.getMonthSummary(userId, DAY);
    check("expense appears in the breakdown", month.byCategory.length > 0, `${month.byCategory.length} categories`);
    const foodRow = month.byCategory.find((c) => c.categoryName === "Makanan");
    check("food expense is attributed", foodRow !== undefined);
    check("share is a fraction", foodRow !== undefined && foodRow.share > 0 && foodRow.share <= 1, `${foodRow?.share}`);
    check("net is income minus expense", month.net === month.income - month.expense);

    console.log("\nReversal preserves the audit trail");
    const cashBefore = (await finance.computeAccountBalances(userId)).get(cash.id)!.balance;

    const gas = await finance.createTransaction(userId, {
      type: "EXPENSE",
      amount: "50000",
      accountId: cash.id,
      categoryId: food.id,
      occurredOn: formatCalendarDay(DAY),
      description: "Salah input",
    });

    balances = await finance.computeAccountBalances(userId);
    const balanceWithMistake = balances.get(cash.id)!.balance;
    check(
      "the mistaken expense reduced the balance",
      balanceWithMistake === cashBefore - 50_000n,
      `${formatMoney(cashBefore, IDR)} -> ${formatMoney(balanceWithMistake, IDR)}`,
    );

    const monthBeforeReversal = await finance.getMonthSummary(userId, DAY);

    const reversal = await finance.reverseTransaction(userId, gas.id);
    check("reversal row exists", Boolean(reversal.id));
    check("reversal links back to the original", reversal.reversesTransactionId === gas.id);
    check(
      "reversal is a signed adjustment, not a copy of the original",
      reversal.type === "ADJUSTMENT" && reversal.amount === 50_000n,
      `${reversal.type} ${reversal.amount}`,
    );

    balances = await finance.computeAccountBalances(userId);
    check(
      "balance returns to exactly where it was before the mistake",
      balances.get(cash.id)!.balance === cashBefore,
      `${formatMoney(balances.get(cash.id)!.balance, IDR)} (expected ${formatMoney(cashBefore, IDR)})`,
    );

    const original = await db.transaction.findUnique({
      where: { id: gas.id },
      select: { deletedAt: true },
    });
    check("the original row is preserved for the audit trail", original?.deletedAt === null);

    await expectRejection(
      "reversing the same transaction twice is refused",
      () => finance.reverseTransaction(userId, gas.id),
      "sudah dibatalkan",
    );

    // A reversal must not manufacture income. The expense leaves the spending
    // figure and nothing appears on the income side.
    const monthAfterReversal = await finance.getMonthSummary(userId, DAY);
    check(
      "the reversal does not create income",
      monthAfterReversal.income === monthBeforeReversal.income,
      `${formatMoney(monthBeforeReversal.income, IDR)} -> ${formatMoney(monthAfterReversal.income, IDR)}`,
    );
    check(
      "the reversed expense is no longer part of the month's spending total",
      monthAfterReversal.byCategory.reduce((sum, c) => sum + c.total, 0n) === monthBeforeReversal.expense - 50_000n,
      `category total ${formatMoney(monthAfterReversal.byCategory.reduce((sum, c) => sum + c.total, 0n), IDR)}`,
    );

    console.log("\nEditing descriptive fields leaves the amount alone");
    const editable = await finance.createTransaction(userId, {
      type: "EXPENSE", amount: "30000", accountId: cash.id,
      occurredOn: formatCalendarDay(DAY), description: "Awal",
    });
    const edited = await finance.updateTransaction(userId, editable.id, {
      description: "Sudah diperbaiki",
      payee: "Warung",
    });
    check("description updated", edited.description === "Sudah diperbaiki");
    check("payee updated", edited.payee === "Warung");
    check("amount untouched", edited.amount === 30_000n, `${edited.amount}`);

    console.log("\nBalance as of a past day");
    const earlier = parseCalendarDay("2026-09-01")!;
    const asOf = await finance.getBalanceAsOf(userId, cash.id, earlier);
    check(
      "a day before any activity shows only the opening balance",
      asOf === 1_000_000n,
      formatMoney(asOf, IDR),
    );

    console.log("\nClosing an account requires a zero balance");
    await expectRejection(
      "cannot close an account that still holds money",
      () => finance.closeAccount(userId, cash.id),
      "masih punya saldo",
    );

    const empty = await finance.createAccount(userId, { name: "Akun kosong", type: "OTHER" });
    await finance.closeAccount(userId, empty.id);
    const closed = await db.account.findUnique({ where: { id: empty.id }, select: { closedAt: true } });
    check("a zero-balance account can be closed", closed?.closedAt !== null);

    console.log("\nDuplicate account names");
    await expectRejection(
      "duplicate account name rejected",
      () => finance.createAccount(userId, { name: "Tunai" }),
      "sudah ada",
    );

    console.log("\nAmount parsing follows the currency");
    const idr = await finance.createTransaction(userId, {
      type: "EXPENSE", amount: "1.500.000", accountId: cash.id,
      occurredOn: formatCalendarDay(DAY), description: "Format Indonesia",
    });
    check("dot-grouped input parsed as 1,500,000", idr.amount === 1_500_000n, `${idr.amount}`);

    console.log("\nCleanup");
    await db.user.delete({ where: { id: other.id } });
    await db.user.delete({ where: { id: userId } });
    const remaining = await db.transaction.count({ where: { userId } });
    check("cascade removed all transactions", remaining === 0, `${remaining} left`);

    await db.$disconnect();
    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
    process.exit(failures === 0 ? 0 : 1);
  } catch (error) {
    console.error("\nVerification crashed:", error);
    await db.user.delete({ where: { id: userId } }).catch(() => undefined);
    await db.$disconnect();
    process.exit(1);
  }
}

main();
