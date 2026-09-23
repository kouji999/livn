"use client";

import { useState, useTransition } from "react";
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { createTransactionAction } from "@/domains/finance/actions";

/**
 * Transaction composer.
 *
 * Optimised for the common case and honest about the uncommon ones. The four
 * types are a segmented control because they are mutually exclusive and the
 * user always knows which one they mean before opening the form.
 *
 * The amount field accepts the way people actually type money: "1.500.000",
 * "1500000", "Rp 85.000". Parsing handles both conventions rather than forcing
 * one.
 */

type AccountOption = {
  id: string;
  name: string;
  colorToken: string;
  iconName: string | null;
  currency: string;
};

type CategoryOption = {
  id: string;
  name: string;
  kind: string;
  colorToken: string;
  iconName: string | null;
};

const TYPE_OPTIONS = [
  { value: "EXPENSE", label: "Keluar", icon: ArrowDownRight, tone: "negative" },
  { value: "INCOME", label: "Masuk", icon: ArrowUpRight, tone: "positive" },
  { value: "TRANSFER", label: "Transfer", icon: ArrowLeftRight, tone: "info" },
  { value: "ADJUSTMENT", label: "Sesuaikan", icon: TrendingUp, tone: "warning" },
] as const;

export function TransactionComposer({
  accounts,
  categories,
  currency,
  onDone,
  onSaved,
  defaultType = "EXPENSE",
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  currency: string;
  onDone?: () => void;
  onSaved?: () => void;
  defaultType?: string;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [type, setType] = useState(defaultType);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [occurredOn, setOccurredOn] = useState(
    // Local date, so the field reads as "today" for the person filling it in.
    new Date().toLocaleDateString("en-CA"),
  );
  const [description, setDescription] = useState("");
  const [payee, setPayee] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState<"increase" | "decrease">(
    "increase",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const relevantCategories = categories.filter((c) => {
    if (type === "INCOME") return c.kind === "INCOME";
    if (type === "EXPENSE") return c.kind === "EXPENSE";
    return false;
  });

  function reset() {
    setAmount("");
    setDescription("");
    setPayee("");
    setCategoryId("");
    setToAccountId("");
    setErrors({});
  }

  function submit() {
    if (!amount.trim()) {
      setErrors({ amount: "Jumlah wajib diisi." });
      return;
    }
    if (!accountId) {
      setErrors({ accountId: "Pilih akun." });
      return;
    }

    startTransition(async () => {
      const result = await createTransactionAction({
        type,
        amount: amount.trim(),
        accountId,
        toAccountId: type === "TRANSFER" ? toAccountId : undefined,
        categoryId: categoryId || undefined,
        occurredOn,
        description: description.trim() || undefined,
        payee: payee.trim() || undefined,
        adjustmentDirection: type === "ADJUSTMENT" ? adjustmentDirection : undefined,
      });

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? { _form: result.error.message });
        toast.error("Gagal menyimpan transaksi", result.error.message);
        return;
      }

      toast.success("Transaksi dicatat");
      reset();
      onSaved?.();
      onDone?.();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-ink">Catat transaksi</h3>
        {onDone && (
          <button type="button" onClick={onDone} className="text-xs text-ink-subtle hover:text-ink">
            Tutup
          </button>
        )}
      </div>

      {errors._form && (
        <p role="alert" className="rounded-md border border-negative/30 bg-negative-soft px-3 py-2 text-sm">
          {errors._form}
        </p>
      )}

      {/* Type first: everything else on the form depends on it. */}
      <div role="radiogroup" aria-label="Jenis transaksi" className="grid grid-cols-4 gap-1.5">
        {TYPE_OPTIONS.map((option) => {
          const active = type === option.value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setType(option.value);
                setCategoryId("");
                setErrors({});
              }}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-md border px-2 py-2.5 text-xs transition-colors duration-fast",
                active
                  ? "border-accent bg-accent-soft font-medium text-ink"
                  : "border-border text-ink-muted hover:border-border-strong hover:text-ink",
              )}
            >
              <Icon
                size={15}
                className={cn(
                  active
                    ? option.tone === "negative"
                      ? "text-negative"
                      : option.tone === "positive"
                        ? "text-positive"
                        : option.tone === "warning"
                          ? "text-warning"
                          : "text-info"
                    : "text-ink-faint",
                )}
              />
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Jumlah"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            if (errors.amount) setErrors((c) => ({ ...c, amount: "" }));
          }}
          placeholder={currency === "IDR" ? "85.000" : "12.50"}
          inputMode="decimal"
          prefix={currency === "IDR" ? "Rp" : currency}
          required
          autoFocus
          error={errors.amount}
        />

        <Input
          label="Tanggal"
          type="date"
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          error={errors.occurredOn}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label={type === "TRANSFER" ? "Dari akun" : "Akun"}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          error={errors.accountId}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>

        {type === "TRANSFER" ? (
          <Select
            label="Ke akun"
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            error={errors.toAccountId}
          >
            <option value="">Pilih akun tujuan</option>
            {accounts
              .filter((a) => a.id !== accountId)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </Select>
        ) : type === "ADJUSTMENT" ? (
          <Select
            label="Arah penyesuaian"
            value={adjustmentDirection}
            onChange={(e) => setAdjustmentDirection(e.target.value as "increase" | "decrease")}
            hint="Menambah atau mengurangi saldo akun"
            error={errors.adjustmentDirection}
          >
            <option value="increase">Tambah saldo</option>
            <option value="decrease">Kurangi saldo</option>
          </Select>
        ) : (
          <Select
            label="Kategori"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            error={errors.categoryId}
          >
            <option value="">Tanpa kategori</option>
            {relevantCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {type !== "ADJUSTMENT" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Keterangan"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={type === "TRANSFER" ? "Tarik tunai" : "Makan siang"}
            error={errors.description}
          />
          <Input
            label="Ke siapa / dari siapa"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            placeholder="Opsional"
            error={errors.payee}
          />
        </div>
      )}

      {type === "ADJUSTMENT" && (
        <Textarea
          label="Alasan penyesuaian"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Misalnya: selisih kas saat menghitung uang tunai"
          hint="Penyesuaian tidak dihitung sebagai pemasukan atau pengeluaran"
          error={errors.description}
        />
      )}

      <div className="flex items-center gap-2">
        <Button variant="primary" size="md" onClick={submit} loading={pending}>
          Catat
        </Button>
        <Button variant="ghost" size="md" onClick={reset} disabled={pending}>
          Bersihkan
        </Button>
      </div>
    </div>
  );
}
