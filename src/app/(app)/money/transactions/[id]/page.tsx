import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { Card, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatShortDate, formatShortDateWithYear } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { TransactionEditor } from "./transaction-editor";
import { ReversePanel } from "./reverse-panel";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const transaction = await db.transaction.findFirst({
    where: { id, userId: user.id },
    select: { description: true, type: true },
  });
  return { title: transaction?.description ?? "Transaksi" };
}

/**
 * Transaction detail.
 *
 * Only the descriptive fields are editable. The amount, the type and the
 * accounts are fixed once written, because other figures have already been
 * computed from them; a correction is a reversal, and the panel for that sits
 * next to the explanation rather than buried in a menu.
 */
export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const transaction = await db.transaction
    .findFirst({
      where: { id, userId: user.id },
      include: {
        account: { select: { id: true, name: true, colorToken: true, iconName: true } },
        toAccount: { select: { id: true, name: true, colorToken: true, iconName: true } },
        category: { select: { id: true, name: true, colorToken: true, iconName: true, kind: true } },
      },
    })
    .catch(() => null);

  if (!transaction) notFound();

  const [categories, reversal] = await Promise.all([
    db.category.findMany({
      where: { userId: user.id, archivedAt: null, kind: transaction.category?.kind ?? undefined },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true, colorToken: true, iconName: true },
    }),
    // If this row was already reversed, say so rather than offering the action
    // again and failing on submit.
    db.transaction.findFirst({
      where: { userId: user.id, reversesTransactionId: transaction.id, deletedAt: null },
      select: { id: true, occurredOn: true, amount: true },
    }),
  ]);

  // A reversal row itself has an original to show.
  const reversedOriginal = transaction.reversesTransactionId
    ? await db.transaction.findUnique({
        where: { id: transaction.reversesTransactionId },
        select: { id: true, description: true, type: true, amount: true },
      })
    : null;

  return (
    <AppShell
      title={transaction.description ?? "Transaksi"}
      subtitle={formatShortDateWithYear(transaction.occurredOn.toISOString().slice(0, 10))}
      actions={
        <Link
          href="/money/transactions"
          className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-border-strong bg-surface px-2.5 text-xs font-medium text-ink-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
        >
          <ArrowLeft size={13} />
          Semua transaksi
        </Link>
      }
    >
      <div className="space-y-5">
        <Card className="px-5 py-4">
          <p className="text-micro font-medium uppercase tracking-[0.08em] text-ink-faint">
            Jumlah
          </p>
          <p
            className={`tabular mt-1 text-3xl font-semibold tracking-tight ${
              transaction.type === "INCOME"
                ? "text-positive"
                : transaction.type === "EXPENSE"
                  ? "text-negative"
                  : "text-ink"
            }`}
          >
            {transaction.type === "INCOME" ? "+" : transaction.type === "EXPENSE" ? "-" : ""}
            {formatMoney(
              transaction.amount < 0n ? -transaction.amount : transaction.amount,
              transaction.currency,
            )}
          </p>

          <dl className="mt-4 space-y-2 border-t border-border-subtle pt-3 text-xs">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-faint">Jenis</dt>
              <dd className="text-ink">
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
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-faint">{transaction.type === "TRANSFER" ? "Dari" : "Akun"}</dt>
              <dd>
                <Link
                  href={`/money/accounts/${transaction.account.id}`}
                  className="text-ink hover:text-accent hover:underline"
                >
                  {transaction.account.name}
                </Link>
              </dd>
            </div>
            {transaction.toAccount && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-faint">Ke</dt>
                <dd>
                  <Link
                    href={`/money/accounts/${transaction.toAccount.id}`}
                    className="text-ink hover:text-accent hover:underline"
                  >
                    {transaction.toAccount.name}
                  </Link>
                </dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-faint">Dicatat</dt>
              <dd className="tabular text-ink-muted">
                {new Intl.DateTimeFormat(user.locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: user.timeZone,
                }).format(transaction.createdAt)}
              </dd>
            </div>
          </dl>
        </Card>

        {reversedOriginal && (
          <Card className="border-warning/30 bg-warning-soft px-5 py-4">
            <p className="text-sm text-ink">
              Ini adalah catatan pembatalan untuk{" "}
              <Link
                href={`/money/transactions/${reversedOriginal.id}`}
                className="font-medium text-accent hover:underline"
              >
                transaksi aslinya
              </Link>
              .
            </p>
          </Card>
        )}

        <Card>
          <CardHeader
            size="sm"
            title="Ubah keterangan"
            description="Jumlah, jenis dan akun tidak bisa diubah. Untuk mengoreksi, batalkan transaksi."
          />
          <div className="px-5 pb-5">
            <TransactionEditor
              transaction={{
                id: transaction.id,
                description: transaction.description ?? "",
                payee: transaction.payee ?? "",
                notes: transaction.notes ?? "",
                categoryId: transaction.categoryId ?? "",
                occurredOn: transaction.occurredOn.toISOString().slice(0, 10),
              }}
              categories={categories}
              todayKey={new Date().toLocaleDateString("en-CA")}
            />
          </div>
        </Card>

        {!transaction.reversesTransactionId && (
          <Card>
            <CardHeader
              size="sm"
              title="Batalkan transaksi"
              description="Membuat catatan pembatalan dan mengembalikan saldo. Riwayat aslinya tetap ada."
            />
            <div className="px-5 pb-5">
              <ReversePanel
                transactionId={transaction.id}
                existingReversal={
                  reversal
                    ? {
                        id: reversal.id,
                        occurredOn: reversal.occurredOn.toISOString().slice(0, 10),
                        amount: reversal.amount.toString(),
                      }
                    : null
                }
              />
            </div>
          </Card>
        )}

        <p className="text-micro text-ink-faint">
          Dibuat {formatShortDate(transaction.createdAt.toISOString().slice(0, 10))} - akun{" "}
          {transaction.account.name}
        </p>
      </div>
    </AppShell>
  );
}
