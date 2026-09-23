"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { PRIORITY_ORDER, GOAL_STATUS_ORDER, statusMeta } from "@/components/ui/status";
import { archiveGoalAction, deleteGoalAction, updateGoalAction } from "@/domains/plan/actions";
import { ConfirmAction } from "@/components/ui/confirm-action";

/**
 * Goal edit form.
 *
 * The current-value field is disabled for a derived goal and says why, rather
 * than letting someone type a number the next refresh would silently discard.
 */

type GoalFormValue = {
  id: string;
  title: string;
  description: string;
  areaId: string;
  goalType: string;
  targetValue: string;
  currentValue: string;
  unit: string;
  priority: string;
  status: string;
  startDate: string;
  targetDate: string;
  isDerived: boolean;
};

const NEEDS_TARGET = new Set(["NUMERIC", "PERCENTAGE", "CURRENCY", "COUNT"]);

export function GoalEditForm({
  goal,
  areas,
}: {
  goal: GoalFormValue;
  areas: Array<{ id: string; name: string }>;
  todayKey: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);

  const [form, setForm] = useState(goal);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set<K extends keyof GoalFormValue>(key: K, value: GoalFormValue[K]) {
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
    if (!form.title.trim()) {
      setErrors({ title: "Judul tujuan wajib diisi." });
      return;
    }

    startTransition(async () => {
      const result = await updateGoalAction({
        id: form.id,
        title: form.title.trim(),
        description: form.description.trim(),
        // `null` clears the relation; an empty string means "no change" to the
        // action, so it is normalised here.
        areaId: form.areaId || null,
        goalType: form.goalType,
        targetValue: NEEDS_TARGET.has(form.goalType) && form.targetValue !== ""
          ? Number(form.targetValue)
          : null,
        // Only a manual goal accepts a hand-entered value.
        currentValue: form.isDerived ? undefined : Number(form.currentValue || 0),
        unit: form.unit.trim(),
        priority: form.priority,
        status: form.status,
        startDate: form.startDate,
        targetDate: form.targetDate,
      });

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? { _form: result.error.message });
        toast.error("Gagal menyimpan", result.error.message);
        return;
      }

      toast.success("Tujuan disimpan");
      setDirty(false);
      router.refresh();
    });
  }

  function archive() {
    startTransition(async () => {
      const result = await archiveGoalAction({ id: form.id });
      if (!result.ok) {
        toast.error("Gagal mengarsipkan", result.error.message);
        return;
      }
      toast.success("Tujuan diarsipkan");
      router.push("/plan/goals");
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteGoalAction({ id: form.id });
      if (!result.ok) {
        toast.error("Tidak bisa dihapus", result.error.message);
        return;
      }
      toast.success("Tujuan dihapus");
      router.push("/plan/goals");
    });
  }

  const needsTarget = NEEDS_TARGET.has(form.goalType);

  return (
    <div className="space-y-4">
      {errors._form && (
        <p role="alert" className="rounded-md border border-negative/30 bg-negative-soft px-3 py-2 text-sm">
          {errors._form}
        </p>
      )}

      <Input
        label="Judul"
        value={form.title}
        onChange={(e) => set("title", e.target.value)}
        error={errors.title}
      />

      <Textarea
        label="Kenapa ini penting"
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
        rows={3}
        error={errors.description}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Cara ukur"
          value={form.goalType}
          onChange={(e) => set("goalType", e.target.value)}
          error={errors.goalType}
        >
          {["BINARY", "NUMERIC", "PERCENTAGE", "CURRENCY", "COUNT", "CUSTOM"].map((type) => (
            <option key={type} value={type}>
              {statusMeta("goalType", type).label}
            </option>
          ))}
        </Select>

        <Select
          label="Status"
          value={form.status}
          onChange={(e) => set("status", e.target.value)}
          error={errors.status}
        >
          {GOAL_STATUS_ORDER.map((value) => (
            <option key={value} value={value}>
              {statusMeta("goal", value).label}
            </option>
          ))}
        </Select>
      </div>

      {needsTarget && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            label="Target"
            value={form.targetValue}
            onChange={(e) => set("targetValue", e.target.value)}
            inputMode="decimal"
            error={errors.targetValue}
          />
          <Input
            label="Nilai saat ini"
            value={form.currentValue}
            onChange={(e) => set("currentValue", e.target.value)}
            inputMode="decimal"
            disabled={form.isDerived}
            hint={form.isDerived ? "Dihitung otomatis dari data terkait" : undefined}
            error={errors.currentValue}
          />
          <Input
            label="Satuan"
            value={form.unit}
            onChange={(e) => set("unit", e.target.value)}
            error={errors.unit}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          label="Mulai"
          type="date"
          value={form.startDate}
          onChange={(e) => set("startDate", e.target.value)}
          error={errors.startDate}
        />
        <Input
          label="Target selesai"
          type="date"
          value={form.targetDate}
          onChange={(e) => set("targetDate", e.target.value)}
          error={errors.targetDate}
        />
        <Select
          label="Prioritas"
          value={form.priority}
          onChange={(e) => set("priority", e.target.value)}
          error={errors.priority}
        >
          {PRIORITY_ORDER.map((value) => (
            <option key={value} value={value}>
              {statusMeta("priority", value).label}
            </option>
          ))}
        </Select>
      </div>

      {areas.length > 0 && (
        <Select
          label="Area"
          value={form.areaId}
          onChange={(e) => set("areaId", e.target.value)}
          error={errors.areaId}
        >
          <option value="">Tanpa area</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </Select>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
        <Button
          variant="primary"
          size="md"
          onClick={submit}
          loading={pending}
          disabled={!dirty}
        >
          {dirty ? "Simpan perubahan" : "Tersimpan"}
        </Button>

        {dirty && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setForm(goal);
              setDirty(false);
              setErrors({});
            }}
            disabled={pending}
          >
            Batalkan
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="md" onClick={archive} disabled={pending}>
            Arsipkan
          </Button>
          <ConfirmAction
            title="Hapus tujuan ini?"
            description="Tindakan ini permanen dan tidak bisa dibatalkan."
            confirmLabel="Hapus permanen"
            onConfirm={remove}
            disabled={pending}
          >
            <Trash2 />
            Hapus
          </ConfirmAction>
        </div>
      </div>
    </div>
  );
}
