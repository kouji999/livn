"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { createLifeEventAction } from "@/domains/journal/actions";

/**
 * Life event composer.
 *
 * A life event is deliberately lighter than a journal entry: a title, a date and
 * a category. Anything longer belongs in the journal, and asking for it here
 * would stop people recording the small things worth remembering.
 *
 * Categories are user-facing language, not enum names, because the person
 * filing an event thinks in terms of "this was about work", not `CAREER`.
 */

const CATEGORIES = [
  { value: "PERSONAL", label: "Pribadi" },
  { value: "HEALTH", label: "Kesehatan" },
  { value: "CAREER", label: "Karier" },
  { value: "LEARNING", label: "Pembelajaran" },
  { value: "BUSINESS", label: "Bisnis" },
  { value: "FINANCE", label: "Keuangan" },
  { value: "RELATIONSHIP", label: "Hubungan" },
  { value: "MILESTONE", label: "Pencapaian" },
  { value: "OTHER", label: "Lainnya" },
];

export function LifeEventComposer({
  defaultDate,
  areas,
  goals,
  projects,
  onDone,
  onSaved,
}: {
  defaultDate: string;
  areas: Array<{ id: string; name: string }>;
  goals: Array<{ id: string; title: string }>;
  projects: Array<{ id: string; title: string }>;
  onDone?: () => void;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [category, setCategory] = useState("PERSONAL");
  const [isMilestone, setIsMilestone] = useState(false);
  const [areaId, setAreaId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit() {
    if (!title.trim()) {
      setErrors({ title: "Judul peristiwa wajib diisi." });
      return;
    }

    startTransition(async () => {
      const result = await createLifeEventAction({
        title: title.trim(),
        description: description.trim() || undefined,
        date,
        category,
        isMilestone,
        areaId: areaId || undefined,
        goalId: goalId || undefined,
        projectId: projectId || undefined,
      });

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? { _form: result.error.message });
        toast.error("Gagal menyimpan peristiwa", result.error.message);
        return;
      }

      toast.success("Peristiwa dicatat");
      setTitle("");
      setDescription("");
      setIsMilestone(false);
      setErrors({});
      onSaved?.();
      onDone?.();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h4 className="text-xs font-semibold text-ink">Peristiwa baru</h4>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="text-micro text-ink-subtle hover:text-ink"
          >
            Tutup
          </button>
        )}
      </div>

      {errors._form && (
        <p role="alert" className="text-xs text-negative">
          {errors._form}
        </p>
      )}

      <Input
        label="Apa yang terjadi"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Contoh: Mulai rutin berenang"
        autoFocus
        required
        error={errors.title}
      />

      <Textarea
        label="Keterangan"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Opsional"
        error={errors.description}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Tanggal"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={errors.date}
        />
        <Select
          label="Kategori"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          error={errors.category}
        >
          {CATEGORIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {goals.length > 0 && (
        <Select
          label="Terkait tujuan"
          value={goalId}
          onChange={(e) => setGoalId(e.target.value)}
          error={errors.goalId}
        >
          <option value="">Tidak terkait</option>
          {goals.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.title}
            </option>
          ))}
        </Select>
      )}

      {projects.length > 0 && (
        <Select
          label="Terkait proyek"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          error={errors.projectId}
        >
          <option value="">Tidak terkait</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </Select>
      )}

      {areas.length > 0 && !goalId && !projectId && (
        <Select
          label="Area"
          value={areaId}
          onChange={(e) => setAreaId(e.target.value)}
          error={errors.areaId}
        >
          <option value="">Tidak terkait</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </Select>
      )}

      {/* Milestones are the events that should stand out on the long timeline. */}
      <button
        type="button"
        onClick={() => setIsMilestone((v) => !v)}
        aria-pressed={isMilestone}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors duration-fast",
          isMilestone
            ? "border-accent bg-accent-soft"
            : "border-border hover:border-border-strong",
        )}
      >
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-sm border",
            isMilestone ? "border-accent bg-accent text-white" : "border-border-strong",
          )}
        >
          {isMilestone && <Check size={10} strokeWidth={3} />}
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-medium text-ink">Tandai sebagai pencapaian</span>
          <span className="block text-micro text-ink-faint">
            Peristiwa penting yang layak dikenang jangka panjang
          </span>
        </span>
      </button>

      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={submit} loading={pending}>
          Catat peristiwa
        </Button>
      </div>
    </div>
  );
}
