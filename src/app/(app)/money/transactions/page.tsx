import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { db } from "@/lib/db";
import { today, addCalendarDays, monthPeriod, parseCalendarDay } from "@/lib/date";
import * as finance from "@/domains/finance/service";
import { TransactionLedger } from "./transaction-ledger";

export const metadata = { title: "Transaksi" };

/**
 * Transaction ledger.
 *
 * Filters live in the URL so a filtered view is linkable and survives a reload,
 * and so the database does the filtering rather than the client receiving every
 * row the user has ever recorded.
 */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; account?: string; from?: string; to?: string; q?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const day = today(user.timeZone);

  const types = parseTypes(params.type);
  // `parseCalendarDay` returns null for an invalid date, which is the same as
  // "no filter" here rather than an error: a malformed query string should
  // show everything, not throw.
  const from = (params.from ? parseCalendarDay(params.from) : null) ?? undefined;
  const to = (params.to ? parseCalendarDay(params.to) : null) ?? undefined;

  const [result, accounts, categories] = await Promise.all([
    finance.listTransactions(user.id, {
      types,
      accountId: params.account || undefined,
      from,
      to,
      search: params.q || undefined,
      limit: 200,
    }),
    finance.listAccounts(user.id),
    finance.listCategories(user.id),
  ]);

  // Totals for the current filter, so the header reflects what is on screen
  // rather than the whole ledger.
  const filtered = await finance.summariseTransactions(user.id, {
    types,
    accountId: params.account || undefined,
    from,
    to,
    search: params.q || undefined,
  });

  const thisMonth = monthPeriod(day);

  return (
    <AppShell title="Transaksi" subtitle={`${result.total} transaksi`}>
      <TransactionLedger
        currency={user.currency}
        transactions={result.transactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: t.amount.toString(),
          occurredOn: t.occurredOn.toISOString().slice(0, 10),
          createdAt: t.createdAt.toISOString(),
          description: t.description,
          payee: t.payee,
          notes: t.notes,
          accountId: t.accountId,
          accountName: t.account.name,
          accountToken: t.account.colorToken,
          accountIcon: t.account.iconName,
          toAccountName: t.toAccount?.name ?? null,
          categoryId: t.categoryId,
          categoryName: t.category?.name ?? null,
          categoryToken: t.category?.colorToken ?? null,
          categoryIcon: t.category?.iconName ?? null,
          isReversal: t.reversesTransactionId !== null,
        }))}
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          colorToken: a.colorToken,
          iconName: a.iconName,
          currency: a.currency,
        }))}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          colorToken: c.colorToken,
          iconName: c.iconName,
        }))}
        filteredTotals={{
          income: filtered.income.toString(),
          expense: filtered.expense.toString(),
          net: filtered.net.toString(),
          count: filtered.count,
        }}
        monthLabel={thisMonth.start.toISOString().slice(0, 10)}
        defaultFrom={addCalendarDays(day, -30).toISOString().slice(0, 10)}
        defaultTo={day.toISOString().slice(0, 10)}
      />
    </AppShell>
  );
}

function parseTypes(value: string | undefined) {
  if (!value) return undefined;
  const parts = value.split(",").filter(Boolean);
  const valid = parts.filter((p): p is "INCOME" | "EXPENSE" | "TRANSFER" | "ADJUSTMENT" =>
    ["INCOME", "EXPENSE", "TRANSFER", "ADJUSTMENT"].includes(p),
  );
  return valid.length > 0 ? valid : undefined;
}

void Card;
void EmptyState;
void db;
