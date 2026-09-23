"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { TASK_STATUS_ORDER, PRIORITY_ORDER, statusMeta } from "@/components/ui/status";
import {
  archiveTaskAction,
  deleteTaskAction,
  toggleTaskAction,
  updateTaskAction,
} from "@/domains/plan/actions";
import { ConfirmAction } from "@/components/ui/confirm-action";

/**
 * Task edit form.
 *
 * Relations are presented as plain selects whose empty option means "none".
 * The action layer converts an empty string into a disconnect, so the form does
 * not have to distinguish "unchanged" from "cleared".
 */

type TaskFormValue = {
  id: string;
  title: string;
  description: string;
  notes: string;
  status: string;
  priority: string;
  scheduledFor: string;
  dueDate: string;
  estimatedMinutes: string;
  areaId: string;
  goalId: string;
  projectId: string;
  milestoneId: string;
  completedAt: string | null;
  createdAt: string;
};

type Option = { id: string; title: string };

export function TaskEditForm({
  task,
  areas,
  projects,
  goals,
}: {
  task: TaskFormValue;
  areas: Array<{ id: string; name: string }>;
  projects: Option[];
  goals: Option[];
  todayKey: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState(task);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set<K extends keyof TaskFormValue>(key: K, value: TaskFormValue[K]) {
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
      setErrors({ title: "Judul tugas wajib diisi." });
      return;
    }

    startTransition(async () => {
      const result = await updateTaskAction({
        id: form.id,
        title: form.title.trim(),
        description: form.description.trim(),
        notes: form.notes.trim(),
        status: form.status,
        priority: form.priority,
        scheduledFor: form.scheduledFor,
        dueDate: form.dueDate,
        estimatedMinutes: form.estimatedMinutes === "" ? null : Number(form.estimatedMinutes),
        // An empty string clears the relation.
        areaId: form.areaId || null,
        goalId: form.goalId || null,
        projectId: form.projectId || null,
        milestoneId: form.milestoneId || null,
      });

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? { _form: result.error.message });
        toast.error("Gagal menyimpan", result.error.message);
        return;
      }

      toast.success("Tugas disimpan");
      setDirty(false);
      router.refresh();
    });
  }

  function toggle() {
    startTransition(async () => {
      const result = await toggleTaskAction({ id: form.id });
      if (!result.ok) {
        toast.error("Gagal mengubah status", result.error.message);
        return;
      }
      // Reflect the change locally so the form matches the new server state
      // without a full reload.
      const nextStatus = result.data.status;
      setForm((current) => ({ ...current, status: nextStatus }));
      toast.success(nextStatus === "COMPLETED" ? "Tugas selesai" : "Tugas dibuka lagi");
      router.refresh();
    });
  }

  function archive() {
    startTransition(async () => {
      const result = await archiveTaskAction({ id: form.id });
      if (!result.ok) {
        toast.error("Gagal mengarsipkan", result.error.message);
        return;
      }
      toast.success("Tugas diarsipkan");
      router.push("/plan/tasks");
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteTaskAction({ id: form.id });
      if (!result.ok) {
        toast.error("Gagal menghapus", result.error.message);
        return;
      }
      toast.success("Tugas dihapus");
      router.push("/plan/tasks");
    });
  }

  const isFinished = form.status === "COMPLETED";

  return (
    <div className="space-y-4">
      {errors._form && (
        <p role="alert" className="rounded-md border border-negative/30 bg-negative-soft px-3 py-2 text-sm">
          {errors._form}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant={isFinished ? "secondary" : "primary"}
          size="sm"
          onClick={toggle}
          disabled={pending}
        >
          {isFinished ? "Buka lagi" : "Tandai selesai"}
        </Button>
        {isFinished && (
          <span className="text-xs text-positive">Sudah selesai</span>
        )}
      </div>

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
        rows={2}
        error={errors.description}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select
          label="Status"
          value={form.status}
          onChange={(e) => set("status", e.target.value)}
          error={errors.status}
        >
          {TASK_STATUS_ORDER.map((value) => (
            <option key={value} value={value}>
              {statusMeta("task", value).label}
            </option>
          ))}
        </Select>

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

        <Input
          label="Estimasi (menit)"
          value={form.estimatedMinutes}
          onChange={(e) => set("estimatedMinutes", e.target.value)}
          inputMode="numeric"
          error={errors.estimatedMinutes}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Dijadwalkan"
          type="date"
          value={form.scheduledFor}
          onChange={(e) => set("scheduledFor", e.target.value)}
          error={errors.scheduledFor}
        />
        <Input
          label="Tenggat"
          type="date"
          value={form.dueDate}
          onChange={(e) => set("dueDate", e.target.value)}
          error={errors.dueDate}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {projects.length > 0 && (
          <Select
            label="Proyek"
            value={form.projectId}
            onChange={(e) => set("projectId", e.target.value)}
            error={errors.projectId}
          >
            <option value="">Tanpa proyek</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </Select>
        )}

        {goals.length > 0 && (
          <Select
            label="Tujuan"
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
      </div>

      <Textarea
        label="Catatan"
        value={form.notes}
        onChange={(e) => set("notes", e.target.value)}
        rows={2}
        hint="Hal yang perlu kamu ingat saat mengerjakan ini"
        error={errors.notes}
      />

      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
        <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!dirty}>
          {dirty ? "Simpan perubahan" : "Tersimpan"}
        </Button>

        {dirty && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setForm(task);
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
            title="Hapus tugas ini?"
            description="Tindakan ini permanen. Kalau kamu hanya ingin menyembunyikannya, pakai Arsipkan."
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
