"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { formatShortDate } from "@/lib/format";
import { reverseTransactionAction } from "@/domains/finance/actions";

/**
 * Reversal panel.
 *
 * Two states, never both: either the action, or a link to the reversal that
 * already exists. Showing a disabled button after the fact would leave the
 * reader unsure whether it had worked.
 */
export function ReversePanel({
  transactionId,
  existingReversal,
}: {
  transactionId: string;
  existingReversal: { id: string; occurredOn: string; amount: string } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  if (existingReversal) {
    return (
      <div className="rounded-md border border-warning/30 bg-warning-soft px-4 py-3">
        <p className="text-sm text-ink">
          Transaksi ini sudah dibatalkan pada {formatShortDate(existingReversal.occurredOn)}.
        </p>
        <Link
          href={`/money/transactions/${existingReversal.id}`}
          className="mt-1.5 inline-block text-xs font-medium text-accent hover:underline"
        >
          Lihat catatan pembatalannya
        </Link>
      </div>
    );
  }

  function reverse() {
    startTransition(async () => {
      const result = await reverseTransactionAction({ id: transactionId });
      if (!result.ok) {
        toast.error("Gagal membatalkan", result.error.message);
        return;
      }
      toast.success("Transaksi dibatalkan", "Saldo akun sudah disesuaikan.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        Membatalkan akan menulis satu penyesuaian yang berlawanan, sehingga saldo
        akun kembali seperti sebelum transaksi ini dicatat. Tidak ada riwayat yang
        hilang.
      </p>

      <ConfirmAction
        title="Batalkan transaksi ini?"
        description="Catatan aslinya tetap ada sebagai riwayat, dan sebuah penyesuaian akan menyeimbangkan kembali saldonya."
        confirmLabel="Batalkan transaksi"
        variant="secondary"
        onConfirm={reverse}
        disabled={pending}
      >
        <RotateCcw />
        Batalkan transaksi
      </ConfirmAction>
    </div>
  );
}
