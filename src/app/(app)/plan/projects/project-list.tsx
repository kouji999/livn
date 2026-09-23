"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Plus, TriangleAlert } from "lucide-react";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/indicator";
import { EmptyState } from "@/components/ui/states";
import { RecordIcon } from "@/components/ui/record-icon";
import { StatusBadge } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatShortDate } from "@/lib/format";
import { createProjectAction } from "@/domains/plan/actions";

type AreaOption = { id: string; name: string; colorToken: string };
type Option = { id: string; title: string };

export type ProjectListItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  areaName: string | null;
  areaToken: string | null;
  areaIcon: string | null;
  goalId: string | null;
  goalTitle: string | null;
  percentage: number;
  basis: string | null;
  totalMilestones: number;
  completedMilestones: number;
  totalTasks: number;
  completedTasks: number;
  isOverdue: boolean;
  targetDate: string | null;
};

/**
 * Project list.
 *
 * Grouped by status so active work is at the top and finished work does not
 * compete for attention. Sorting inside a group is by deadline, since the
 * nearest deadline is the one worth knowing.
 */
export function ProjectList({
  projects,
  areas,
  goals,
}: {
  projects: ProjectListItem[];
  areas: AreaOption[];
  goals: Option[];
}) {
  const router = useRouter();
  const [pending] = useTransition();
  const [composerOpen, setComposerOpen] = useState(false);

  const groups = useMemo(() => {
    const active = projects.filter((p) => p.status === "ACTIVE");
    const planned = projects.filter((p) => p.status === "PLANNED");
    const paused = projects.filter((p) => p.status === "PAUSED");
    const done = projects.filter((p) => p.status === "COMPLETED" || p.status === "ARCHIVED");

    const byDeadline = (a: ProjectListItem, b: ProjectListItem) => {
      if (!a.targetDate && !b.targetDate) return a.title.localeCompare(b.title);
      if (!a.targetDate) return 1;
      if (!b.targetDate) return -1;
      return a.targetDate.localeCompare(b.targetDate);
    };

    return [
      { key: "active", label: "Berjalan", items: active.sort(byDeadline) },
      { key: "planned", label: "Direncanakan", items: planned.sort(byDeadline) },
      { key: "paused", label: "Dijeda", items: paused.sort(byDeadline) },
      { key: "done", label: "Selesai", items: done.sort(byDeadline) },
    ].filter((group) => group.items.length > 0);
  }, [projects]);

  const overdueCount = projects.filter((p) => p.isOverdue).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-ink-subtle">
          {projects.length} proyek
          {overdueCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-negative">
              <TriangleAlert size={11} />
              {overdueCount} melewati tenggat
            </span>
          )}
        </p>

        <Button
          variant="primary"
          size="sm"
          icon={<Plus />}
          className="ml-auto"
          onClick={() => setComposerOpen((open) => !open)}
        >
          Proyek baru
        </Button>
      </div>

      {composerOpen && (
        <Card className="p-5">
          <ProjectComposer
            areas={areas}
            goals={goals}
            onDone={() => {
              setComposerOpen(false);
              router.refresh();
            }}
          />
        </Card>
      )}

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Plus />}
            title="Belum ada proyek"
            description="Proyek adalah pekerjaan yang punya akhir. Pecah tujuan besar menjadi proyek agar bisa diselesaikan."
            action={
              <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setComposerOpen(true)}>
                Buat proyek
              </Button>
            }
          />
        </Card>
      ) : (
        <div className={cn("space-y-5", pending && "opacity-70")}>
          {groups.map((group) => (
            <section key={group.key}>
              <SectionLabel className="mb-2">
                {group.label} <span className="tabular text-ink-faint">{group.items.length}</span>
              </SectionLabel>

              <ul className="space-y-2">
                {group.items.map((project) => (
                  <li key={project.id}>
                    <ProjectCard project={project} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectListItem }) {
  return (
    <Card interactive>
      <Link
        href={`/plan/projects/${project.id}`}
        className="group block px-4 py-3.5 transition-colors duration-fast hover:bg-surface-sunken"
      >
        <div className="flex items-start gap-3">
          <RecordIcon icon={project.areaIcon} token={project.areaToken} size="md" className="mt-0.5" />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p className="truncate text-sm font-medium text-ink">{project.title}</p>
              <ChevronRight
                size={15}
                className="mt-0.5 shrink-0 text-ink-faint opacity-0 transition-opacity duration-fast group-hover:opacity-100"
              />
            </div>

            {project.description && (
              <p className="mt-0.5 line-clamp-1 text-xs text-ink-subtle">{project.description}</p>
            )}

            <div className="mt-2.5 flex items-center gap-3">
              <ProgressBar
                value={project.percentage / 100}
                token={project.areaToken}
                height={5}
                className="flex-1"
                tone={project.percentage === 100 ? "positive" : "auto"}
                label={`Progres ${project.title}`}
              />
              <span className="tabular shrink-0 text-xs font-medium text-ink-muted">
                {project.percentage}%
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-ink-faint">
              <span>
                {project.basis === "milestones"
                  ? `${project.completedMilestones}/${project.totalMilestones} milestone`
                  : project.basis === "tasks"
                    ? `${project.completedTasks}/${project.totalTasks} tugas`
                    : "Belum ada isi"}
              </span>
              {project.goalTitle && <span className="truncate">untuk {project.goalTitle}</span>}
              {project.areaName && <span>{project.areaName}</span>}
              {project.targetDate && (
                <span className={project.isOverdue ? "font-medium text-negative" : undefined}>
                  {project.isOverdue ? "Lewat " : "Target "}
                  {formatShortDate(project.targetDate)}
                </span>
              )}
            </div>
          </div>

          <div className="hidden shrink-0 sm:block">
            <StatusBadge domain="project" value={project.status} />
          </div>
        </div>
      </Link>
    </Card>
  );
}

function ProjectComposer({
  areas,
  goals,
  onDone,
}: {
  areas: AreaOption[];
  goals: Option[];
  onDone: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [areaId, setAreaId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit() {
    if (!title.trim()) {
      setErrors({ title: "Judul proyek wajib diisi." });
      return;
    }

    startTransition(async () => {
      const result = await createProjectAction({
        title: title.trim(),
        description: description.trim() || undefined,
        areaId: areaId || undefined,
        goalId: goalId || undefined,
        status: "ACTIVE",
        startDate: startDate || undefined,
        targetDate: targetDate || undefined,
      });

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? { _form: result.error.message });
        toast.error("Gagal membuat proyek", result.error.message);
        return;
      }

      toast.success("Proyek dibuat");
      onDone();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-ink">Proyek baru</h3>
        <button type="button" onClick={onDone} className="text-xs text-ink-subtle hover:text-ink">
          Tutup
        </button>
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
        placeholder="Contoh: Bangun portofolio online"
        required
        autoFocus
        error={errors.title}
      />

      <Textarea
        label="Deskripsi"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        error={errors.description}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {goals.length > 0 && (
          <Select
            label="Mendukung tujuan"
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
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
      </div>

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

      <div className="flex items-center gap-2">
        <Button variant="primary" size="md" onClick={submit} loading={pending}>
          Buat proyek
        </Button>
        <Button variant="ghost" size="md" onClick={onDone} disabled={pending}>
          Batal
        </Button>
      </div>
    </div>
  );
}
