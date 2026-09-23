import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { Card, CardHeader } from "@/components/ui/card";
import { Stat, StatStrip } from "@/components/layout/page";
import { RecordIcon } from "@/components/ui/record-icon";
import { StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";
import { db } from "@/lib/db";
import { today, addCalendarDays, formatFullDate } from "@/lib/date";
import * as finance from "@/domains/finance/service";
import { formatMoney } from "@/lib/money";
import { formatShortDate } from "@/lib/format";
import { AccountEditor } from "./account-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const account = await db.account.findFirst({
    where: { id, userId: user.id },
    select: { name: true },
  });
  return { title: account?.name ?? "Akun" };
}

/**
 * Account detail.
 *
 * Shows the derivation of the balance rather than just the total, so the number
 * can be checked: opening balance, then each kind of movement. This is the page
 * that makes the ledger model legible.
 */
export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const day = today(user.timeZone);

  const account = await db.account
    .findFirst({ where: { id, userId: user.id } })
    .catch(() => null);

  if (!account) notFound();

  const [balances, recentTx, trendFrom] = await Promise.all([
    finance.computeAccountBalances(user.id),
    finance.listTransactions(user.id, { accountId: account.id, limit: 20 }),
    Promise.resolve(addCalendarDays(day, -29)),
  ]);

  const entry = balances.get(account.id);
  const balance = entry?.balance ?? account.openingBalance;
  const trend = await finance.getDailyTotals(user.id, trendFrom, day);

  const income = entry?.income ?? 0n;
  const expense = entry?.expense ?? 0n;
  const transfersIn = entry?.transfersIn ?? 0n;
  const transfersOut = entry?.transfersOut ?? 0n;
  const adjustments = entry?.adjustments ?? 0n;

  return (
    <AppShell
      title={account.name}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span>{formatFullDate(day, user.locale)}</span>
          {account.institution && <span>{account.institution}</span>}
        </span>
      }
      actions={
        <Link
          href="/money/accounts"
          className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-border-strong bg-surface px-2.5 text-xs font-medium text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
        >
          <ArrowLeft size={13} />
          Semua akun
        </Link>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <RecordIcon icon={account.iconName} token={account.colorToken} size="lg" />
          <div>
            <StatusBadge domain="account" value={account.type} />
            {account.closedAt && (
              <span className="ml-2 text-xs text-ink-subtle">Ditutup</span>
            )}
          </div>
        </div>

        <Card className="px-5 py-4">
          <p className="text-micro font-medium uppercase tracking-[0.08em] text-ink-faint">
            Saldo saat ini
          </p>
          <p
            className={`tabular mt-1 text-3xl font-semibold tracking-tight ${
              balance < 0n ? "text-negative" : "text-ink"
            }`}
          >
            {formatMoney(balance, account.currency)}
          </p>

          {/* The derivation, so the total above is verifiable by eye. */}
          <dl className="mt-4 space-y-2 border-t border-border-subtle pt-3 text-xs">
            <Row label="Saldo awal" value={formatMoney(account.openingBalance, account.currency)} />
            {income !== 0n && (
              <Row
                label="Pemasukan"
                value={`+${formatMoney(income, account.currency)}`}
                tone="positive"
              />
            )}
            {expense !== 0n && (
              <Row
                label="Pengeluaran"
                value={`-${formatMoney(expense, account.currency)}`}
                tone="negative"
              />
            )}
            {transfersIn !== 0n && (
              <Row
                label="Transfer masuk"
                value={`+${formatMoney(transfersIn, account.currency)}`}
                tone="info"
              />
            )}
            {transfersOut !== 0n && (
              <Row
                label="Transfer keluar"
                value={`-${formatMoney(transfersOut, account.currency)}`}
                tone="info"
              />
            )}
            {adjustments !== 0n && (
              <Row
                label="Penyesuaian"
                value={formatMoney(adjustments, account.currency, { showSign: true })}
                tone="muted"
              />
            )}
          </dl>
        </Card>

        <StatStrip>
          <Stat label="Transaksi" value={entry?.transactionCount ?? 0} />
          <Stat label="Masuk" value={formatMoney(income, account.currency)} tone="positive" />
          <Stat label="Keluar" value={formatMoney(expense, account.currency)} tone="negative" />
          <Stat
            label="Transfer bersih"
            value={formatMoney(transfersIn - transfersOut, account.currency, { showSign: true })}
            tone="muted"
          />
        </StatStrip>

        {trend.some((d) => d.net !== 0n) && (
          <Card className="px-5 py-4">
            <CardHeader size="sm" title="30 hari terakhir" />
            <ul className="space-y-1">
              {trend
                .filter((d) => d.income !== 0n || d.expense !== 0n)
                .slice(-10)
                .reverse()
                .map((d) => (
                  <li key={d.date} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-ink-subtle">{formatShortDate(d.date)}</span>
                    <span className="tabular flex items-center gap-3">
                      {d.income > 0n && (
                        <span className="text-positive">+{formatMoney(d.income, account.currency)}</span>
                      )}
                      {d.expense > 0n && (
                        <span className="text-negative">-{formatMoney(d.expense, account.currency)}</span>
                      )}
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        )}

        <Card>
          <CardHeader
            size="sm"
            title="Transaksi terakhir"
            action={
              <Link
                href={`/money/transactions?account=${account.id}`}
                className="text-xs font-medium text-accent hover:underline"
              >
                Lihat semua
              </Link>
            }
          />
          <div className="px-4 pb-4">
            {recentTx.transactions.length === 0 ? (
              <EmptyState
                compact
                title="Belum ada transaksi"
                description="Akun ini belum punya pergerakan. Saldonya masih sama dengan saldo awal."
              />
            ) : (
              <ul className="space-y-0.5">
                {recentTx.transactions.map((t) => {
                  const value = t.amount < 0n ? -t.amount : t.amount;
                  const isTransfer = t.type === "TRANSFER";
                  const isIncoming =
                    isTransfer && t.toAccountId === account.id;

                  return (
                    <li key={t.id} className="flex items-center gap-3 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">
                          {t.description ?? (isTransfer ? "Transfer" : "Tanpa keterangan")}
                        </span>
                        <span className="mt-0.5 block text-micro text-ink-faint">
                          {formatShortDate(t.occurredOn.toISOString().slice(0, 10))}
                          {t.category && ` - ${t.category.name}`}
                        </span>
                      </span>
                      <span
                        className={`tabular shrink-0 text-sm ${
                          isTransfer
                            ? isIncoming
                              ? "text-positive"
                              : "text-negative"
                            : t.type === "INCOME"
                              ? "text-positive"
                              : "text-negative"
                        }`}
                      >
                        {isTransfer
                          ? `${isIncoming ? "+" : "-"}${formatMoney(value, account.currency)}`
                          : `${t.type === "INCOME" ? "+" : "-"}${formatMoney(value, account.currency)}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader size="sm" title="Pengaturan akun" />
          <div className="px-5 pb-5">
            <AccountEditor
              account={{
                id: account.id,
                name: account.name,
                type: account.type,
                institution: account.institution ?? "",
                colorToken: account.colorToken,
                iconName: account.iconName ?? "wallet",
                balance: balance.toString(),
                currency: account.currency,
                closedAt: account.closedAt?.toISOString() ?? null,
              }}
            />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Row({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative" | "info" | "muted";
}) {
  const toneClass = {
    default: "text-ink",
    positive: "text-positive",
    negative: "text-negative",
    info: "text-info",
    muted: "text-ink-subtle",
  }[tone];

  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-faint">{label}</dt>
      <dd className={`tabular ${toneClass}`}>{value}</dd>
    </div>
  );
}
