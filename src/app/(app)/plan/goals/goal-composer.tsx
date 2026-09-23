"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { GOAL_TYPE_ORDER, PRIORITY_ORDER, statusMeta } from "@/components/ui/status";
import { createGoalAction } from "@/domains/plan/actions";

/**
 * Goal composer.
 *
 * The form adapts to the chosen goal type: a measurable goal requires a target
 * and a unit, a binary goal requires neither. Hiding the irrelevant fields
 * rather than disabling them keeps the form short enough to finish.
 */

type AreaOption = { id: string; name: string; colorToken: string };

const TYPE_HINTS: Record<string, string> = {
  BINARY: "Hanya selesai atau belum - tidak ada angka yang perlu diukur.",
  NUMERIC: "Angka apa pun: berat badan, jarak, skor.",
  PERCENTAGE: "Progres dalam persen.",
  CURRENCY: "Jumlah uang, misalnya target tabungan.",
  COUNT: "Berapa kali atau berapa banyak.",
  CUSTOM: "Bebas - kamu isi sendiri nilainya.",
};

/** Types that need a numeric target to have any meaning. */
const NEEDS_TARGET = new Set(["NUMERIC", "PERCENTAGE", "CURRENCY", "COUNT"]);

export function GoalComposer({
  areas,
  onDone,
}: {
  areas: AreaOption[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalType, setGoalType] = useState("BINARY");
  const [targetValue, setTargetValue] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [unit, setUnit] = useState("");
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [priority, setPriority] = useState("MEDIUM");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const needsTarget = NEEDS_TARGET.has(goalType);

  function reset() {
    setTitle("");
    setDescription("");
    setGoalType("BINARY");
    setTargetValue("");
    setCurrentValue("");
    setUnit("");
    setPriority("MEDIUM");
    setStartDate("");
    setTargetDate("");
    setErrors({});
  }

  function submit() {
    if (!title.trim()) {
      setErrors({ title: "Judul tujuan wajib diisi." });
      return;
    }

    startTransition(async () => {
      const result = await createGoalAction({
        title: title.trim(),
        description: description.trim() || undefined,
        areaId: areaId || undefined,
        goalType,
        // Empty strings must become undefined so the schema's optional numeric
        // coercion does not receive "".
        targetValue: needsTarget && targetValue !== "" ? Number(targetValue) : undefined,
        currentValue: currentValue !== "" ? Number(currentValue) : undefined,
        unit: unit.trim() || undefined,
        priority,
        startDate: startDate || undefined,
        targetDate: targetDate || undefined,
        status: "ACTIVE",
      });

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? { _form: result.error.message });
        toast.error("Gagal membuat tujuan", result.error.message);
        return;
      }

      toast.success("Tujuan dibuat");
      reset();
      router.refresh();
      onDone?.();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-ink">Tujuan baru</h3>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="text-xs text-ink-subtle hover:text-ink"
          >
            Tutup
          </button>
        )}
      </div>

      {errors._form && (
        <p role="alert" className="rounded-md border border-negative/30 bg-negative-soft px-3 py-2 text-sm">
          {errors._form}
        </p>
      )}

      <Input
        label="Judul"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Contoh: Menabung Rp50 juta"
        required
        autoFocus
        error={errors.title}
      />

      <Textarea
        label="Kenapa ini penting"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Alasan yang membuat kamu bertahan saat sulit"
        rows={2}
        error={errors.description}
      />

      {/* Goal type drives the rest of the form. */}
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-ink-muted">Cara mengukur</legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {GOAL_TYPE_ORDER.map((type) => {
            const active = goalType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setGoalType(type)}
                aria-pressed={active}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors duration-fast",
                  active
                    ? "border-accent bg-accent-soft text-ink"
                    : "border-border text-ink-muted hover:border-border-strong hover:text-ink",
                )}
              >
                <span className="truncate">{statusMeta("goalType", type).label}</span>
                {active && <Check size={12} className="shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-ink-faint">{TYPE_HINTS[goalType]}</p>
      </fieldset>

      {needsTarget && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            label="Target"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            inputMode="decimal"
            placeholder={goalType === "CURRENCY" ? "50000000" : "20"}
            required
            error={errors.targetValue}
          />
          <Input
            label="Sudah tercapai"
            value={currentValue}
            onChange={(e) => setCurrentValue(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            hint="Boleh dikosongkan"
            error={errors.currentValue}
          />
          <Input
            label="Satuan"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder={goalType === "CURRENCY" ? "IDR" : "buku"}
            error={errors.unit}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Mulai"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          error={errors.startDate}
        />
        <Input
          label="Target selesai"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          error={errors.targetDate}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {areas.length > 0 && (
          <Select
            label="Area"
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
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

        <Select
          label="Prioritas"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          error={errors.priority}
        >
          {PRIORITY_ORDER.map((value) => (
            <option key={value} value={value}>
              {statusMeta("priority", value).label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button variant="primary" size="md" onClick={submit} loading={pending}>
          Buat tujuan
        </Button>
        <Button variant="ghost" size="md" onClick={reset} disabled={pending}>
          Bersihkan
        </Button>
      </div>
    </div>
  );
}
