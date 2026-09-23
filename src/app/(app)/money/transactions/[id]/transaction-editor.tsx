"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { updateTransactionAction } from "@/domains/finance/actions";

/**
 * Transaction editor.
 *
 * Scope is deliberately narrow: the description, the counterparty, the category
 * and the notes. The amount and the accounts are absent rather than disabled,
 * because their absence has to be explained by the panel that contains this
 * form and a greyed-out field invites the reader to wonder whether it is a
 * permissions problem.
 */
export function TransactionEditor({
  transaction,
  categories,
}: {
  transaction: {
    id: string;
    description: string;
    payee: string;
    notes: string;
    categoryId: string;
    occurredOn: string;
  };
  categories: Array<{ id: string; name: string; kind: string }>;
  todayKey: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState(transaction);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    startTransition(async () => {
      const result = await updateTransactionAction({
        id: form.id,
        description: form.description.trim(),
        payee: form.payee.trim(),
        notes: form.notes.trim(),
        categoryId: form.categoryId || null,
        occurredOn: form.occurredOn,
      });

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? { _form: result.error.message });
        toast.error("Gagal menyimpan", result.error.message);
        return;
      }

      toast.success("Transaksi disimpan");
      setDirty(false);
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Keterangan"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Makan siang"
          error={errors.description}
        />
        <Input
          label="Ke siapa / dari siapa"
          value={form.payee}
          onChange={(e) => set("payee", e.target.value)}
          placeholder="Warung Bu Sari"
          error={errors.payee}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Kategori"
          value={form.categoryId}
          onChange={(e) => set("categoryId", e.target.value)}
          error={errors.categoryId}
        >
          <option value="">Tanpa kategori</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>

        <Input
          label="Tanggal"
          type="date"
          value={form.occurredOn}
          onChange={(e) => set("occurredOn", e.target.value)}
          error={errors.occurredOn}
        />
      </div>

      <Textarea
        label="Catatan"
        value={form.notes}
        onChange={(e) => set("notes", e.target.value)}
        rows={2}
        placeholder="Detail tambahan kalau perlu"
        error={errors.notes}
      />

      <div className="flex items-center gap-2">
        <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!dirty}>
          {dirty ? "Simpan perubahan" : "Tersimpan"}
        </Button>

        {dirty && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setForm(transaction);
              setDirty(false);
              setErrors({});
            }}
            disabled={pending}
          >
            Batalkan
          </Button>
        )}
      </div>
    </div>
  );
}
