"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronRight,
  Plus,
  Settings2,
  TrendingUp,
} from "lucide-react";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/indicator";
import { EmptyState } from "@/components/ui/states";
import { RecordIcon } from "@/components/ui/record-icon";
import { Stat, StatStrip } from "@/components/layout/page";
import { StatusBadge } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { formatShortDate } from "@/lib/format";
import { TransactionComposer } from "./transaction-composer";
import { AccountComposer } from "./account-composer";

/**
 * Money overview.
 *
 * Reading order mirrors the questions a person actually asks about their money:
 * what do I have, what moved, where did it go, and what happened recently.
 * Transfers are labelled and never mixed into the income or expense totals.
 */

type AccountItem = {
  id: string;
  name: string;
  type: string;
  currency: string;
  institution: string | null;
  colorToken: string;
  iconName: string | null;
  balance: string;
  openingBalance: string;
  income: string;
  expense: string;
  transfersIn: string;
  transfersOut: string;
  transactionCount: number;
  closedAt: string | null;
};

type TransactionItem = {
  id: string;
  type: string;
  amount: string;
  occurredOn: string;
  description: string | null;
  payee: string | null;
  accountName: string;
  accountToken: string;
  toAccountName: string | null;
  categoryName: string | null;
  categoryToken: string | null;
  isReversal: boolean;
};

export function MoneyOverview({
  currency,
  accounts,
  netWorth,
  todayIncome,
  todayExpense,
  month,
  categories,
  recent,
  totalTransactions,
  trend,
}: {
  currency: string;
  accounts: AccountItem[];
  netWorth: string;
  todayIncome: string;
  todayExpense: string;
  month: {
    label: string;
    income: string;
    expense: string;
    net: string;
    previousIncome: string;
    previousExpense: string;
    byCategory: Array<{
      categoryId: string | null;
      name: string;
      colorToken: string;
      iconName: string | null;
      total: string;
      share: number;
    }>;
  };
  categories: Array<{
    id: string;
    name: string;
    kind: string;
    colorToken: string;
    iconName: string | null;
  }>;
  recent: TransactionItem[];
  totalTransactions: number;
  trend: Array<{ date: string; income: string; expense: string; net: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [composerOpen, setComposerOpen] = useState(false);
  const [accountComposerOpen, setAccountComposerOpen] = useState(false);

  const openAccounts = accounts.filter((a) => !a.closedAt);
  const closedAccounts = accounts.filter((a) => a.closedAt);

  const net = BigInt(netWorth);
  const income = BigInt(month.income);
  const expense = BigInt(month.expense);
  const monthNet = BigInt(month.net);

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-5">
      {/* ── Position ─────────────────────────────────────────────────────── */}
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-micro font-medium uppercase tracking-[0.08em] text-ink-faint">
              Total saldo
            </p>
            <p className="tabular mt-1 text-3xl font-semibold tracking-tight text-ink">
              {formatMoney(net, currency)}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              {openAccounts.length} akun aktif
              {closedAccounts.length > 0 && `, ${closedAccounts.length} ditutup`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={accountComposerOpen ? "ghost" : "secondary"}
              size="md"
              icon={accountComposerOpen ? undefined : <Settings2 />}
              onClick={() => setAccountComposerOpen((open) => !open)}
            >
              {accountComposerOpen ? "Tutup" : "Akun"}
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={<Plus />}
              onClick={() => setComposerOpen((open) => !open)}
            >
              Catat
            </Button>
          </div>
        </div>

        {(todayIncome !== "0" || todayExpense !== "0") && (
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border-subtle pt-3">
            {todayIncome !== "0" && (
              <p className="tabular flex items-center gap-1.5 text-sm text-positive">
                <ArrowUpRight size={14} />
                {formatMoney(BigInt(todayIncome), currency)} masuk hari ini
              </p>
            )}
            {todayExpense !== "0" && (
              <p className="tabular flex items-center gap-1.5 text-sm text-negative">
                <ArrowDownRight size={14} />
                {formatMoney(BigInt(todayExpense), currency)} keluar hari ini
              </p>
            )}
          </div>
        )}
      </Card>

      {accountComposerOpen && (
        <Card className="p-5">
          <AccountComposer onDone={() => setAccountComposerOpen(false)} onSaved={refresh} />
        </Card>
      )}

      {composerOpen && (
        <Card className="p-5">
          <TransactionComposer
            accounts={openAccounts.map((a) => ({
              id: a.id,
              name: a.name,
              colorToken: a.colorToken,
              iconName: a.iconName,
              currency: a.currency,
            }))}
            categories={categories}
            currency={currency}
            onDone={() => setComposerOpen(false)}
            onSaved={refresh}
          />
        </Card>
      )}

      {/* Thirty-day movement. A sparkline answers "which way am I going" faster
          than a table of numbers does. */}
      {trend.length > 1 && (
        <Card className="px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <SectionLabel>30 hari terakhir</SectionLabel>
            <span className="text-micro text-ink-faint">Masuk vs keluar per hari</span>
          </div>
          <TrendBars trend={trend} currency={currency} className="mt-3" />
        </Card>
      )}

      {/* ── Month ────────────────────────────────────────────────────────── */}
      <section>
        <SectionLabel className="mb-2">Bulan ini</SectionLabel>
        <StatStrip>
          <Stat
            label="Masuk"
            value={formatMoney(income, currency)}
            tone="positive"
            hint={
              month.previousIncome !== "0"
                ? `Bulan lalu ${formatMoney(BigInt(month.previousIncome), currency, { compact: true })}`
                : undefined
            }
          />
          <Stat
            label="Keluar"
            value={formatMoney(expense, currency)}
            tone="negative"
            hint={
              month.previousExpense !== "0"
                ? `Bulan lalu ${formatMoney(BigInt(month.previousExpense), currency, { compact: true })}`
                : undefined
            }
          />
          <Stat
            label="Selisih"
            value={formatMoney(monthNet, currency, { showSign: true })}
            tone={monthNet >= 0n ? "positive" : "negative"}
          />
          <Stat
            label="Tingkat menabung"
            value={income > 0n ? `${Math.max(0, Math.round((Number(monthNet) / Number(income)) * 100))}%` : "-"}
            hint="Bagian dari pemasukan yang tersisa"
            tone="muted"
          />
        </StatStrip>
      </section>

      {/* ── Where it went ────────────────────────────────────────────────── */}
      {month.byCategory.length > 0 && (
        <section>
          <SectionLabel className="mb-2">Ke mana uangnya pergi</SectionLabel>
          <Card className="px-5 py-4">
            <ul className="space-y-3">
              {month.byCategory.slice(0, 8).map((category) => (
                <li key={category.categoryId ?? "none"}>
                  <div className="flex items-center gap-3">
                    <RecordIcon
                      icon={category.iconName}
                      token={category.colorToken}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {category.name}
                    </span>
                    <span className="tabular shrink-0 text-micro text-ink-faint">
                      {Math.round(category.share * 100)}%
                    </span>
                    <span className="tabular shrink-0 text-sm font-medium text-ink">
                      {formatMoney(BigInt(category.total), currency)}
                    </span>
                  </div>
                  <ProgressBar
                    value={category.share}
                    token={category.colorToken}
                    height={3}
                    className="mt-2"
                    label={`Bagian ${category.name}`}
                  />
                </li>
              ))}
            </ul>
            {month.byCategory.length > 8 && (
              <p className="mt-3 text-micro text-ink-faint">
                +{month.byCategory.length - 8} kategori lain
              </p>
            )}
          </Card>
        </section>
      )}

      {/* ── Accounts ─────────────────────────────────────────────────────── */}
      <section>
        <SectionLabel className="mb-2">Akun</SectionLabel>
        {accounts.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Plus />}
              title="Belum ada akun"
              description="Akun adalah tempat uang kamu berada: tunai, rekening bank, atau e-wallet."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus />}
                  onClick={() => setAccountComposerOpen(true)}
                >
                  Tambah akun
                </Button>
              }
            />
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => (
              <li key={account.id}>
                <AccountCard account={account} currency={currency} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Recent activity ──────────────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <SectionLabel>Transaksi terakhir</SectionLabel>
          <Link
            href="/money/transactions"
            className="inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:underline"
          >
            Semua {totalTransactions > 0 && `(${totalTransactions})`}
            <ChevronRight size={13} />
          </Link>
        </div>

        {recent.length === 0 ? (
          <Card>
            <EmptyState
              icon={<TrendingUp />}
              title="Belum ada transaksi"
              description="Catat pemasukan atau pengeluaran pertama kamu. Saldo akun akan dihitung otomatis dari sini."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus />}
                  onClick={() => setComposerOpen(true)}
                >
                  Catat transaksi
                </Button>
              }
            />
          </Card>
        ) : (
          <Card className={cn("py-1", pending && "opacity-70")}>
            <ul className="divide-y divide-border-subtle">
              {recent.map((transaction) => (
                <li key={transaction.id}>
                  <Link
                    href={`/money/transactions?q=${encodeURIComponent(transaction.description ?? "")}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-fast hover:bg-surface-sunken"
                  >
                    <TransactionIcon transaction={transaction} currency={currency} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">
                        {transaction.description ??
                          (transaction.type === "TRANSFER" ? "Transfer" : "Tanpa keterangan")}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-micro text-ink-faint">
                        <span>{formatShortDate(transaction.occurredOn)}</span>
                        <span>
                          {transaction.type === "TRANSFER" && transaction.toAccountName
                            ? `${transaction.accountName} ke ${transaction.toAccountName}`
                            : transaction.accountName}
                        </span>
                        {transaction.categoryName && <span>{transaction.categoryName}</span>}
                        {transaction.isReversal && (
                          <span className="text-warning">pembatalan</span>
                        )}
                      </p>
                    </div>
                    <span className="tabular shrink-0 text-sm font-medium">
                      <AmountLabel amount={transaction.amount} type={transaction.type} currency={currency} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

/** Sign and colour for a transaction's amount. */
/**
 * Sign and colour for a transaction's amount.
 *
 * Direction comes from `type`, never from the sign of `amount`. The ledger stores
 * an expense as a *positive* number and lets `type` carry the direction, so a
 * check like `value > 0n` reports every expense as money coming in. Only an
 * `ADJUSTMENT` is genuinely signed, because a correction can move either way.
 */
function AmountLabel({
  amount,
  type,
  currency,
}: {
  amount: string;
  type: string;
  currency: string;
}) {
  const value = BigInt(amount);
  const magnitude = value < 0n ? -value : value;

  if (type === "TRANSFER") {
    return <span className="text-ink-muted">{formatMoney(magnitude, currency)}</span>;
  }

  // An adjustment's sign is its direction; income and expense are decided by
  // type alone.
  const incoming = type === "INCOME" || (type === "ADJUSTMENT" && value > 0n);

  return (
    <span className={incoming ? "text-positive" : "text-negative"}>
      {incoming ? "+" : "-"}
      {formatMoney(magnitude, currency)}
    </span>
  );
}

function TransactionIcon({
  transaction,
  currency,
}: {
  transaction: TransactionItem;
  currency: string;
}) {
  if (transaction.type === "TRANSFER") {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-info">
        <ArrowLeftRight size={14} />
      </span>
    );
  }

  const positive = transaction.type === "INCOME";
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md",
        positive ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative",
      )}
    >
      {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
    </span>
  );
}

/**
 * Daily income-and-expense bars.
 *
 * Rendered as plain divs rather than a charting library: 30 bars need no axis,
 * no tooltip and no interaction, and the dependency would outweigh the benefit.
 */
function TrendBars({
  trend,
  currency,
  className,
}: {
  trend: Array<{ date: string; income: string; expense: string; net: string }>;
  currency: string;
  className?: string;
}) {
  const { max } = useMemo(() => {
    let peak = 0n;
    for (const day of trend) {
      const income = BigInt(day.income);
      const expense = BigInt(day.expense);
      if (income > peak) peak = income;
      if (expense > peak) peak = expense;
    }
    return { max: peak };
  }, [trend]);

  if (max === 0n) {
    return (
      <p className={cn("text-xs text-ink-faint", className)}>
        Belum ada pemasukan atau pengeluaran dalam 30 hari terakhir.
      </p>
    );
  }

  const scale = Number(max);

  return (
    <div className={className}>
      <div className="flex h-20 items-end gap-[3px]">
        {trend.map((day) => {
          const income = Number(BigInt(day.income)) / scale;
          const expense = Number(BigInt(day.expense)) / scale;
          return (
            <div
              key={day.date}
              className="group relative flex h-full flex-1 items-end justify-center gap-px"
              title={`${day.date}: masuk ${formatMoney(BigInt(day.income), currency)}, keluar ${formatMoney(BigInt(day.expense), currency)}`}
            >
              <span
                className="w-full max-w-[6px] rounded-t-sm bg-positive/70 transition-colors group-hover:bg-positive"
                style={{ height: `${Math.max(income * 100, income > 0 ? 3 : 0)}%` }}
              />
              <span
                className="w-full max-w-[6px] rounded-t-sm bg-negative/60 transition-colors group-hover:bg-negative"
                style={{ height: `${Math.max(expense * 100, expense > 0 ? 3 : 0)}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-micro text-ink-faint">
        <span>{formatShortDate(trend[0].date)}</span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-sm bg-positive/70" />
            masuk
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-sm bg-negative/60" />
            keluar
          </span>
        </div>
        <span>{formatShortDate(trend[trend.length - 1].date)}</span>
      </div>
    </div>
  );
}

function AccountCard({ account, currency }: { account: AccountItem; currency: string }) {
  const balance = BigInt(account.balance);
  const closed = account.closedAt !== null;

  return (
    <Card
      interactive={!closed}
      className={cn("h-full px-4 py-3.5", closed && "opacity-60")}
    >
      <Link href={`/money/accounts/${account.id}`} className="block">
        <div className="flex items-start gap-3">
          <RecordIcon icon={account.iconName} token={account.colorToken} size="md" />
          <div className="min-w-0 flex-1">
            {/*
              The account name already says what it is, so the type is shown only
              when it adds something: "BCA" benefits from "Bank", "Tunai" does
              not benefit from "Tunai". Repeating the name as a badge was noise.
            */}
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-medium text-ink">{account.name}</p>
              {account.institution && (
                <span className="shrink-0 text-micro text-ink-faint">
                  {account.institution}
                </span>
              )}
            </div>

            <p
              className={cn(
                "tabular mt-2 text-lg font-semibold tracking-tight",
                balance < 0n ? "text-negative" : "text-ink",
              )}
            >
              {formatMoney(balance, account.currency || currency)}
            </p>

            <p className="tabular mt-0.5 flex items-center gap-2 text-micro text-ink-faint">
              <span>{account.transactionCount} transaksi</span>
              {/* Only surfaced when non-zero, so a healthy account stays quiet. */}
              {BigInt(account.transfersIn) > 0n && (
                <span className="text-info">
                  +{formatMoney(BigInt(account.transfersIn), account.currency || currency)}
                </span>
              )}
              {closed && <span className="text-warning">ditutup</span>}
            </p>
          </div>
        </div>
      </Link>
    </Card>
  );
}
