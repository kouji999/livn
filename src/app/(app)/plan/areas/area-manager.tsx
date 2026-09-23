"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { RecordIcon } from "@/components/ui/record-icon";
import { cn } from "@/lib/cn";
import { COLORS } from "@/lib/tokens";
import { ICON_OPTIONS } from "@/lib/icons";
import { createAreaAction, updateAreaAction } from "@/domains/plan/actions";

/**
 * Area manager.
 *
 * Creation and inline editing share one disclosure. Colour and icon are chosen
 * from fixed token sets rather than a free picker, which keeps every area
 * legible in both themes — a user-chosen hex could be unreadable on either.
 */

type AreaRow = {
  id: string;
  name: string;
  description: string | null;
  colorToken: string;
  iconName: string | null;
};

export function AreaManager({ areas }: { areas: AreaRow[] }) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-faint">
          Kelola area
        </h2>
        <Button
          variant={creating ? "ghost" : "secondary"}
          size="sm"
          icon={creating ? <X /> : <Plus />}
          onClick={() => {
            setCreating((open) => !open);
            setEditingId(null);
          }}
        >
          {creating ? "Tutup" : "Area baru"}
        </Button>
      </div>

      {creating && (
        <Card className="p-4">
          <AreaForm onDone={() => setCreating(false)} />
        </Card>
      )}

      {editingId && (
        <Card className="p-4">
          <AreaForm
            area={areas.find((a) => a.id === editingId) ?? null}
            onDone={() => setEditingId(null)}
          />
        </Card>
      )}

      {!creating && !editingId && areas.length > 0 && (
        <Card>
          <ul className="divide-y divide-border-subtle">
            {areas.map((area) => (
              <li key={area.id} className="flex items-center gap-3 px-4 py-2.5">
                <RecordIcon icon={area.iconName} token={area.colorToken} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{area.name}</span>
                <button
                  type="button"
                  onClick={() => setEditingId(area.id)}
                  className="shrink-0 rounded-sm px-2 py-1 text-micro text-ink-subtle transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
                >
                  Ubah
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function AreaForm({
  area,
  onDone,
}: {
  area?: AreaRow | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(area?.name ?? "");
  const [description, setDescription] = useState(area?.description ?? "");
  const [colorToken, setColorToken] = useState(area?.colorToken ?? "accent");
  const [iconName, setIconName] = useState(area?.iconName ?? "target");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit() {
    if (!name.trim()) {
      setErrors({ name: "Nama area wajib diisi." });
      return;
    }

    startTransition(async () => {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        colorToken,
        iconName,
      };

      const result = area
        ? await updateAreaAction({ id: area.id, ...payload })
        : await createAreaAction(payload);

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? { _form: result.error.message });
        toast.error(area ? "Gagal menyimpan" : "Gagal membuat area", result.error.message);
        return;
      }

      toast.success(area ? "Area disimpan" : "Area dibuat");
      onDone();
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
        <RecordIcon icon={iconName} token={colorToken} size="lg" />
        <div className="min-w-0 flex-1 space-y-3">
          <Input
            label="Nama"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Kesehatan"
            autoFocus
            error={errors.name}
          />
          <Input
            label="Keterangan"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Apa yang tercakup di area ini"
            error={errors.description}
          />
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-ink-muted">Warna</legend>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((token) => {
            const active = colorToken === token;
            return (
              <button
                key={token}
                type="button"
                onClick={() => setColorToken(token)}
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

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-ink-muted">Ikon</legend>
        <div className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto rounded-md border border-border p-2">
          {ICON_OPTIONS.map((option) => {
            const active = iconName === option.name;
            return (
              <button
                key={option.name}
                type="button"
                onClick={() => setIconName(option.name)}
                aria-label={option.label}
                aria-pressed={active}
                title={option.label}
                className={cn(
                  "flex items-center justify-center rounded-md border p-1.5 transition-colors duration-fast",
                  active
                    ? "border-accent bg-accent-soft"
                    : "border-transparent hover:bg-surface-sunken",
                )}
              >
                <RecordIcon icon={option.name} token={colorToken} size="sm" />
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <Button variant="primary" size="md" onClick={submit} loading={pending}>
          {area ? "Simpan" : "Buat area"}
        </Button>
        <Button variant="ghost" size="md" onClick={onDone} disabled={pending}>
          Batal
        </Button>
      </div>
    </div>
  );
}
