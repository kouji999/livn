"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Plus,
  RotateCcw,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { RecordIcon } from "@/components/ui/record-icon";
import { Stat, StatStrip } from "@/components/layout/page";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { formatShortDate } from "@/lib/format";
import { TransactionComposer } from "../transaction-composer";
import { reverseTransactionAction } from "@/domains/finance/actions";

/**
 * Ledger.
 *
 * Grouped by day because that is how a person remembers spending — "what did I
 * spend on Tuesday" — rather than as one flat chronological list.
 *
 * Each row can be expanded to reveal the actions that change it. Reversal is
 * separate from delete on purpose: it keeps the original visible, which is what
 * makes the running balance auditable.
 */

type TransactionItem = {
  id: string;
  type: string;
  amount: string;
  occurredOn: string;
  createdAt: string;
  description: string | null;
  payee: string | null;
  notes: string | null;
  accountId: string;
  accountName: string;
  accountToken: string;
  accountIcon: string | null;
  toAccountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryToken: string | null;
  categoryIcon: string | null;
  isReversal: boolean;
};

const TYPE_FILTERS = [
  { value: "all", label: "Semua" },
  { value: "EXPENSE", label: "Keluar" },
  { value: "INCOME", label: "Masuk" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "ADJUSTMENT", label: "Penyesuaian" },
];

export function TransactionLedger({
  currency,
  transactions,
  accounts,
  categories,
  filteredTotals,
  defaultFrom,
  defaultTo,
}: {
  currency: string;
  transactions: TransactionItem[];
  accounts: Array<{ id: string; name: string; colorToken: string; iconName: string | null; currency: string }>;
  categories: Array<{ id: string; name: string; kind: string; colorToken: string; iconName: string | null }>;
  filteredTotals: { income: string; expense: string; net: string; count: number };
  monthLabel: string;
  defaultFrom: string;
  defaultTo: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [composerOpen, setComposerOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activeType = searchParams.get("type") ?? "";
  const activeAccount = searchParams.get("account") ?? "";
  const search = searchParams.get("q") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  /** Groups rows by day, preserving the server's newest-first order. */
  const days = useMemo(() => {
    const map = new Map<string, TransactionItem[]>();
    for (const transaction of transactions) {
      const bucket = map.get(transaction.occurredOn) ?? [];
      bucket.push(transaction);
      map.set(transaction.occurredOn, bucket);
    }
    return [...map.entries()].map(([date, items]) => ({ date, items }));
  }, [transactions]);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    startTransition(() => {
      router.replace(`/money/transactions${next.size ? `?${next.toString()}` : ""}`, {
        scroll: false,
      });
    });
  }

  function clearFilters() {
    startTransition(() => router.replace("/money/transactions", { scroll: false }));
  }

  function reverse(id: string) {
    startTransition(async () => {
      const result = await reverseTransactionAction({ id });
      if (!result.ok) {
        toast.error("Gagal membatalkan", result.error.message);
        return;
      }
      toast.success("Transaksi dibatalkan", "Catatan aslinya tetap tersimpan.");
      setExpandedId(null);
      router.refresh();
    });
  }

  const hasFilters = Boolean(activeType || activeAccount || search || from || to);
  const income = BigInt(filteredTotals.income);
  const expense = BigInt(filteredTotals.expense);
  const net = BigInt(filteredTotals.net);

  return (
    <div className="space-y-4">
      <StatStrip>
        <Stat label="Masuk" value={formatMoney(income, currency)} tone="positive" />
        <Stat label="Keluar" value={formatMoney(expense, currency)} tone="negative" />
        <Stat
          label="Selisih"
          value={formatMoney(net, currency, { showSign: true })}
          tone={net >= 0n ? "positive" : "negative"}
        />
        <Stat label="Jumlah" value={filteredTotals.count} tone="muted" />
      </StatStrip>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Jenis transaksi">
            {TYPE_FILTERS.map((filter) => {
              const isAll = filter.value === "all";
              const active = isAll ? !activeType : activeType === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setParam("type", isAll ? null : filter.value)}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-fast",
                    active
                      ? "bg-surface-sunken text-ink"
                      : "text-ink-subtle hover:bg-surface-sunken hover:text-ink",
                  )}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
              />
              <input
                type="search"
                defaultValue={search}
                placeholder="Cari keterangan..."
                aria-label="Cari transaksi"
                onChange={(event) => {
                  const value = event.target.value;
                  setParam("q", value.trim() === "" ? null : value);
                }}
                className="h-8 w-48 rounded-md border border-border-strong bg-surface pl-7 pr-2 text-sm placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>

            <Button
              variant="primary"
              size="sm"
              icon={<Plus />}
              onClick={() => setComposerOpen((open) => !open)}
            >
              Catat
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-micro text-ink-faint">Dari</span>
            <input
              type="date"
              value={from}
              max={to || defaultTo}
              onChange={(e) => setParam("from", e.target.value || null)}
              className="tabular h-8 rounded-md border border-border-strong bg-surface px-2 text-xs focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-micro text-ink-faint">Sampai</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              max={defaultTo}
              onChange={(e) => setParam("to", e.target.value || null)}
              className="tabular h-8 rounded-md border border-border-strong bg-surface px-2 text-xs focus:border-accent focus:outline-none"
            />
          </label>

          {accounts.length > 1 && (
            <Select
              label="Akun"
              value={activeAccount}
              onChange={(e) => setParam("account", e.target.value || null)}
              selectClassName="h-8 text-xs"
              containerClassName="min-w-[9rem]"
            >
              <option value="">Semua akun</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          )}

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              icon={<X />}
              onClick={clearFilters}
              className="mb-0.5"
            >
              Bersihkan filter
            </Button>
          )}
        </div>
      </div>

      {composerOpen && (
        <Card className="p-5">
          <TransactionComposer
            accounts={accounts}
            categories={categories}
            currency={currency}
            onDone={() => setComposerOpen(false)}
            onSaved={() => router.refresh()}
          />
        </Card>
      )}

      {/* ── Ledger ───────────────────────────────────────────────────────── */}
      {transactions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<TrendingUp />}
            title={hasFilters ? "Tidak ada transaksi yang cocok" : "Belum ada transaksi"}
            description={
              hasFilters
                ? "Coba lebarkan rentang tanggal atau hapus filter."
                : "Semua saldo di aplikasi ini dihitung dari transaksi, jadi mulai dari satu catatan."
            }
            action={
              hasFilters ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Hapus filter
                </Button>
              ) : (
                <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setComposerOpen(true)}>
                  Catat transaksi
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className={cn("space-y-4", pending && "opacity-70")}>
          {days.map((group) => {
            const dayIncome = group.items
              .filter((t) => t.type === "INCOME")
              .reduce((sum, t) => sum + BigInt(t.amount), 0n);
            const dayExpense = group.items
              .filter((t) => t.type === "EXPENSE")
              .reduce((sum, t) => sum + BigInt(t.amount), 0n);

            return (
              <section key={group.date}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 px-1">
                  <SectionLabel>{formatShortDate(group.date)}</SectionLabel>
                  <span className="tabular flex items-center gap-3 text-micro">
                    {dayIncome > 0n && (
                      <span className="text-positive">+{formatMoney(dayIncome, currency)}</span>
                    )}
                    {dayExpense > 0n && (
                      <span className="text-negative">-{formatMoney(dayExpense, currency)}</span>
                    )}
                  </span>
                </div>

                <Card className="py-1">
                  <ul className="divide-y divide-border-subtle">
                    {group.items.map((transaction) => (
                      <li key={transaction.id}>
                        <LedgerRow
                          transaction={transaction}
                          currency={currency}
                          expanded={expandedId === transaction.id}
                          onToggle={() =>
                            setExpandedId((current) =>
                              current === transaction.id ? null : transaction.id,
                            )
                          }
                          onReverse={() => reverse(transaction.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            );
          })}
        </div>
      )}

      <p className="text-center text-micro text-ink-faint">
        Saldo akun dihitung ulang dari daftar ini setiap kali halaman dibuka.
      </p>
    </div>
  );
}

function LedgerRow({
  transaction,
  currency,
  expanded,
  onToggle,
  onReverse,
}: {
  transaction: TransactionItem;
  currency: string;
  expanded: boolean;
  onToggle: () => void;
  onReverse: () => void;
}) {
  const value = BigInt(transaction.amount);
  const abs = value < 0n ? -value : value;

  const isTransfer = transaction.type === "TRANSFER";
  const positive = transaction.type === "INCOME" || (transaction.type === "ADJUSTMENT" && value > 0n);
  const negative = transaction.type === "EXPENSE" || (transaction.type === "ADJUSTMENT" && value < 0n);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-fast hover:bg-surface-sunken"
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md",
            isTransfer
              ? "bg-surface-sunken text-info"
              : positive
                ? "bg-positive-soft text-positive"
                : "bg-negative-soft text-negative",
          )}
        >
          {isTransfer ? (
            <ArrowLeftRight size={14} />
          ) : positive ? (
            <ArrowUpRight size={14} />
          ) : (
            <ArrowDownRight size={14} />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate text-sm text-ink">
              {transaction.description ??
                (isTransfer ? "Transfer" : transaction.payee ?? "Tanpa keterangan")}
            </p>
            {transaction.isReversal && (
              <span className="shrink-0 rounded-full border border-warning/30 bg-warning-soft px-1.5 py-0.5 text-micro text-warning">
                pembatalan
              </span>
            )}
          </div>

          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-micro text-ink-faint">
            <span>
              {isTransfer && transaction.toAccountName
                ? `${transaction.accountName} ke ${transaction.toAccountName}`
                : transaction.accountName}
            </span>
            {transaction.categoryName && (
              <span className="inline-flex items-center gap-1">
                <RecordIcon
                  icon={transaction.categoryIcon}
                  token={transaction.categoryToken}
                  size="sm"
                  className="size-3.5 rounded-sm"
                />
                {transaction.categoryName}
              </span>
            )}
            {transaction.payee && transaction.description && <span>{transaction.payee}</span>}
          </p>
        </div>

        <span
          className={cn(
            "tabular shrink-0 text-sm font-medium",
            isTransfer
              ? "text-ink-muted"
              : positive
                ? "text-positive"
                : negative
                  ? "text-negative"
                  : "text-ink-muted",
          )}
        >
          {isTransfer ? formatMoney(abs, currency) : `${positive ? "+" : "-"}${formatMoney(abs, currency)}`}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border-subtle bg-surface-sunken px-4 py-3 motion-safe:animate-fade-in">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-micro sm:grid-cols-4">
            <div>
              <dt className="text-ink-faint">Jenis</dt>
              <dd className="mt-0.5 text-ink">
                {
                  {
                    INCOME: "Pemasukan",
                    EXPENSE: "Pengeluaran",
                    TRANSFER: "Transfer",
                    ADJUSTMENT: "Penyesuaian",
                  }[transaction.type as "INCOME"]
                }
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">Tanggal</dt>
              <dd className="tabular mt-0.5 text-ink">{formatShortDate(transaction.occurredOn)}</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Akun</dt>
              <dd className="mt-0.5 text-ink">{transaction.accountName}</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Kategori</dt>
              <dd className="mt-0.5 text-ink">{transaction.categoryName ?? "-"}</dd>
            </div>
          </dl>

          {transaction.notes && (
            <p className="mt-3 text-xs text-ink-muted">{transaction.notes}</p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <Link
              href={`/money/transactions/${transaction.id}`}
              className="inline-flex h-7 items-center rounded-sm border border-border-strong bg-surface px-2.5 text-xs font-medium text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
            >
              Ubah keterangan
            </Link>

            {!transaction.isReversal && (
              <ConfirmAction
                title="Batalkan transaksi ini?"
                description="Catatan aslinya tetap tersimpan sebagai riwayat, dan saldo akun kembali seperti sebelumnya."
                confirmLabel="Batalkan transaksi"
                variant="secondary"
                size="sm"
                onConfirm={onReverse}
              >
                <RotateCcw size={13} />
                Batalkan
              </ConfirmAction>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
