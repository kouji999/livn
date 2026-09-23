"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { RecordIcon } from "@/components/ui/record-icon";
import { cn } from "@/lib/cn";
import { COLORS } from "@/lib/tokens";
import { statusMeta } from "@/components/ui/status";
import { ACCOUNT_TYPES } from "@/domains/finance/vocabulary";
import { closeAccountAction, updateAccountAction } from "@/domains/finance/actions";
import { ConfirmAction } from "@/components/ui/confirm-action";

/**
 * Account editor.
 *
 * The opening balance is shown but not editable: changing it after transactions
 * exist would silently rewrite every balance the user has already seen. A
 * correction belongs in an adjustment, which leaves a trace.
 */
export function AccountEditor({
  account,
}: {
  account: {
    id: string;
    name: string;
    type: string;
    institution: string;
    colorToken: string;
    iconName: string;
    balance: string;
    currency: string;
    closedAt: string | null;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState(account);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const closed = form.closedAt !== null;
  const hasBalance = BigInt(form.balance) !== 0n;

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    if (errors[key as string]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[key as string];
        return next;
      });
    }
  }

  function submit() {
    if (!form.name.trim()) {
      setErrors({ name: "Nama akun wajib diisi." });
      return;
    }

    startTransition(async () => {
      const result = await updateAccountAction({
        id: form.id,
        name: form.name.trim(),
        type: form.type,
        institution: form.institution.trim(),
        colorToken: form.colorToken,
        iconName: form.iconName,
      });

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? { _form: result.error.message });
        toast.error("Gagal menyimpan", result.error.message);
        return;
      }

      toast.success("Akun disimpan");
      setDirty(false);
      router.refresh();
    });
  }

  function close() {
    startTransition(async () => {
      const result = await closeAccountAction({ id: form.id });
      if (!result.ok) {
        toast.error("Tidak bisa ditutup", result.error.message);
        return;
      }
      toast.success("Akun ditutup");
      setForm((current) => ({ ...current, closedAt: new Date().toISOString() }));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {errors._form && (
        <p role="alert" className="rounded-md border border-negative/30 bg-negative-soft px-3 py-2 text-sm">
          {errors._form}
        </p>
      )}

      <div className="flex items-start gap-3">
        <RecordIcon icon={form.iconName} token={form.colorToken} size="lg" />
        <div className="min-w-0 flex-1 space-y-3">
          <Input
            label="Nama akun"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            error={errors.name}
          />
          <Input
            label="Institusi"
            value={form.institution}
            onChange={(e) => set("institution", e.target.value)}
            placeholder="Opsional"
            error={errors.institution}
          />
        </div>
      </div>

      <Select
        label="Jenis"
        value={form.type}
        onChange={(e) => set("type", e.target.value)}
        error={errors.type}
      >
        {ACCOUNT_TYPES.map((value) => (
          <option key={value} value={value}>
            {statusMeta("account", value).label}
          </option>
        ))}
      </Select>

      <div className="rounded-md border border-border bg-surface-sunken px-3 py-2.5">
        <p className="text-micro text-ink-faint">Saldo awal</p>
        <p className="tabular mt-0.5 text-sm text-ink-muted">
          Terkunci setelah ada transaksi. Untuk mengoreksi saldo, catat penyesuaian.
        </p>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-ink-muted">Warna</legend>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((token) => {
            const active = form.colorToken === token;
            return (
              <button
                key={token}
                type="button"
                onClick={() => set("colorToken", token)}
                aria-label={`Warna ${token}`}
                aria-pressed={active}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md border transition-colors duration-fast",
                  active ? "border-ink-faint" : "border-transparent hover:border-border-strong",
                )}
                style={{ backgroundColor: `var(--color-${token}-soft)` }}
              >
                {active && <Check size={13} style={{ color: `var(--color-${token})` }} />}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
        <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!dirty}>
          {dirty ? "Simpan perubahan" : "Tersimpan"}
        </Button>

        {dirty && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setForm(account);
              setDirty(false);
              setErrors({});
            }}
            disabled={pending}
          >
            Batalkan
          </Button>
        )}

        {!closed && (
          <div className="ml-auto">
            <ConfirmAction
              title={`Tutup akun "${form.name}"?`}
              description={
                hasBalance
                  ? "Akun ini masih punya saldo, jadi belum bisa ditutup."
                  : "Akun yang ditutup tetap menyimpan riwayat transaksinya."
              }
              confirmLabel="Tutup akun"
              variant="secondary"
              onConfirm={close}
              disabled={pending || hasBalance}
            >
              <Lock />
              Tutup akun
            </ConfirmAction>
          </div>
        )}
      </div>
    </div>
  );
}
