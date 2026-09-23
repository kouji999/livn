import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { today, formatFullDate, addCalendarDays } from "@/lib/date";
import * as finance from "@/domains/finance/service";
import { MoneyOverview } from "./money-overview";

export const metadata = { title: "Money" };

/**
 * Money.
 *
 * Answers four questions in order: what do I have, what came in and out, where
 * did it go, and what is coming. Every figure is derived from the ledger, so
 * this screen can never show a balance the transaction list disagrees with.
 */
export default async function MoneyPage() {
  const user = await requireUser();
  const day = today(user.timeZone);

  const [accounts, balances, daily, month, categories, recent] = await Promise.all([
    finance.listAccounts(user.id),
    finance.computeAccountBalances(user.id),
    finance.getDailySummary(user.id, day),
    finance.getMonthSummary(user.id, day),
    finance.listCategories(user.id),
    finance.listTransactions(user.id, { limit: 8 }),
  ]);

  // Thirty-day sparkline of net movement, built from one grouped query rather
  // than a request per day.
  const trendFrom = addCalendarDays(day, -29);
  const dailyTotals = await finance.getDailyTotals(user.id, trendFrom, day);

  return (
    <AppShell
      title="Money"
      subtitle={`${accounts.length} akun - ${formatFullDate(day, user.locale)}`}
    >
      <MoneyOverview
        currency={user.currency}
        accounts={accounts.map((account) => ({
          id: account.id,
          name: account.name,
          type: account.type,
          currency: account.currency,
          institution: account.institution,
          colorToken: account.colorToken,
          iconName: account.iconName,
          balance: (balances.get(account.id)?.balance ?? account.openingBalance).toString(),
          openingBalance: account.openingBalance.toString(),
          income: (balances.get(account.id)?.income ?? 0n).toString(),
          expense: (balances.get(account.id)?.expense ?? 0n).toString(),
          transfersIn: (balances.get(account.id)?.transfersIn ?? 0n).toString(),
          transfersOut: (balances.get(account.id)?.transfersOut ?? 0n).toString(),
          transactionCount: balances.get(account.id)?.transactionCount ?? 0,
          closedAt: account.closedAt?.toISOString() ?? null,
        }))}
        netWorth={daily.netWorth.toString()}
        todayIncome={daily.todayIncome.toString()}
        todayExpense={daily.todayExpense.toString()}
        month={{
          label: month.period.start.toISOString().slice(0, 7),
          income: month.income.toString(),
          expense: month.expense.toString(),
          net: month.net.toString(),
          previousIncome: month.previous.income.toString(),
          previousExpense: month.previous.expense.toString(),
          byCategory: month.byCategory.map((c) => ({
            categoryId: c.categoryId,
            name: c.categoryName,
            colorToken: c.colorToken,
            iconName: c.iconName,
            total: c.total.toString(),
            share: c.share,
          })),
        }}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          colorToken: c.colorToken,
          iconName: c.iconName,
        }))}
        recent={recent.transactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: t.amount.toString(),
          occurredOn: t.occurredOn.toISOString().slice(0, 10),
          description: t.description,
          payee: t.payee,
          accountName: t.account.name,
          accountToken: t.account.colorToken,
          toAccountName: t.toAccount?.name ?? null,
          categoryName: t.category?.name ?? null,
          categoryToken: t.category?.colorToken ?? null,
          isReversal: t.reversesTransactionId !== null,
        }))}
        totalTransactions={recent.total}
        trend={dailyTotals.map((d) => ({
          date: d.date,
          income: d.income.toString(),
          expense: d.expense.toString(),
          net: d.net.toString(),
        }))}
      />
    </AppShell>
  );
}
