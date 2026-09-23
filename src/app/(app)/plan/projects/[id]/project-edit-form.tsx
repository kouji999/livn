"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { PROJECT_STATUS_ORDER, statusMeta } from "@/components/ui/status";
import { archiveProjectAction, deleteProjectAction, updateProjectAction } from "@/domains/plan/actions";
import { ConfirmAction } from "@/components/ui/confirm-action";

type ProjectFormValue = {
  id: string;
  title: string;
  description: string;
  status: string;
  areaId: string;
  goalId: string;
  startDate: string;
  targetDate: string;
};

export function ProjectEditForm({
  project,
  areas,
  goals,
}: {
  project: ProjectFormValue;
  areas: Array<{ id: string; name: string }>;
  goals: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState(project);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set<K extends keyof ProjectFormValue>(key: K, value: ProjectFormValue[K]) {
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
      setErrors({ title: "Judul proyek wajib diisi." });
      return;
    }

    startTransition(async () => {
      const result = await updateProjectAction({
        id: form.id,
        title: form.title.trim(),
        description: form.description.trim(),
        status: form.status,
        areaId: form.areaId || null,
        goalId: form.goalId || null,
        startDate: form.startDate,
        targetDate: form.targetDate,
      });

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? { _form: result.error.message });
        toast.error("Gagal menyimpan", result.error.message);
        return;
      }

      toast.success("Proyek disimpan");
      setDirty(false);
      router.refresh();
    });
  }

  function archive() {
    startTransition(async () => {
      const result = await archiveProjectAction({ id: form.id });
      if (!result.ok) {
        toast.error("Tidak bisa diarsipkan", result.error.message);
        return;
      }
      toast.success("Proyek diarsipkan");
      router.push("/plan/projects");
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteProjectAction({ id: form.id });
      if (!result.ok) {
        toast.error("Tidak bisa dihapus", result.error.message);
        return;
      }
      toast.success("Proyek dihapus");
      router.push("/plan/projects");
    });
  }

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
        label="Deskripsi"
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
        rows={3}
        error={errors.description}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Status"
          value={form.status}
          onChange={(e) => set("status", e.target.value)}
          error={errors.status}
        >
          {PROJECT_STATUS_ORDER.map((value) => (
            <option key={value} value={value}>
              {statusMeta("project", value).label}
            </option>
          ))}
        </Select>

        {goals.length > 0 && (
          <Select
            label="Mendukung tujuan"
            value={form.goalId}
            onChange={(e) => set("goalId", e.target.value)}
            error={errors.goalId}
          >
            <option value="">Tanpa tujuan</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </Select>
        )}
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
        <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!dirty}>
          {dirty ? "Simpan perubahan" : "Tersimpan"}
        </Button>

        {dirty && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setForm(project);
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
            title="Hapus proyek ini?"
            description="Proyek hanya bisa dihapus kalau tidak ada tugas di dalamnya. Milestone ikut terhapus."
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
