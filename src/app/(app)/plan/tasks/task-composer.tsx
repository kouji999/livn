"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, ChevronDown, Flag, Link2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { PRIORITY_ORDER, statusMeta } from "@/components/ui/status";
import { createTaskAction } from "@/domains/plan/actions";

/**
 * Quick task composer.
 *
 * Optimised for the common case: type a title, press Enter. Everything else is
 * behind a disclosure. A form that demands a project, a priority and an
 * estimate before accepting a thought is a form people stop using.
 *
 * The title field keeps focus after submit and clears itself, so several tasks
 * can be entered in a row without touching the mouse.
 */
type AreaOption = { id: string; name: string; colorToken: string };
type Option = { id: string; title: string };

export function TaskComposer({
  areas,
  projects,
  goals,
  defaultDay,
  todayKey,
  tomorrowKey,
  onDone,
  /** Used by the Today screen, which pins new tasks to that day. */
  lockDay,
}: {
  areas: AreaOption[];
  projects: Option[];
  goals: Option[];
  defaultDay: string;
  todayKey: string;
  tomorrowKey: string;
  onDone?: () => void;
  lockDay?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(defaultDay);
  const [priority, setPriority] = useState("MEDIUM");
  const [projectId, setProjectId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [error, setError] = useState<string | undefined>();

  function reset() {
    setTitle("");
    setPriority("MEDIUM");
    setProjectId("");
    setGoalId("");
    setAreaId("");
    setError(undefined);
    setExpanded(false);
    setDay(defaultDay);
    inputRef.current?.focus();
  }

  function submit() {
    if (!title.trim()) {
      setError("Judul tugas wajib diisi.");
      inputRef.current?.focus();
      return;
    }

    startTransition(async () => {
      const result = await createTaskAction({
        title: title.trim(),
        status: "INBOX",
        priority,
        scheduledFor: lockDay ? undefined : day,
        projectId: projectId || undefined,
        goalId: goalId || undefined,
        areaId: areaId || undefined,
      });

      if (!result.ok) {
        setError(result.error.fieldErrors?.title ?? result.error.message);
        toast.error("Gagal menambah tugas", result.error.message);
        return;
      }

      // The action schedules an inbox task onto today when it has no date, so
      // an explicit day is applied here for the non-locked case.
      toast.success("Tugas ditambahkan");
      reset();
      router.refresh();
      onDone?.();
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Enter submits from the title field; the textarea-free design means there
    // is no newline to preserve.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
    if (event.key === "Escape") {
      if (expanded) setExpanded(false);
      else onDone?.();
    }
  }

  const dayOptions = [
    { value: todayKey, label: "Hari ini" },
    { value: tomorrowKey, label: "Besok" },
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (error) setError(undefined);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Apa yang perlu dilakukan?"
          aria-label="Judul tugas"
          aria-invalid={error ? true : undefined}
          autoFocus
          disabled={pending}
          className={cn(
            "h-9 min-w-0 flex-1 rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-ink-faint",
            "focus:outline-none focus:ring-2 focus:ring-accent/20",
            error ? "border-negative" : "border-border-strong focus:border-accent",
          )}
        />

        <Button
          variant={expanded ? "ghost" : "secondary"}
          size="md"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-label={expanded ? "Sembunyikan opsi" : "Tampilkan opsi"}
          className="shrink-0"
        >
          <ChevronDown
            size={14}
            className={cn("transition-transform duration-fast", expanded && "rotate-180")}
          />
        </Button>

        <Button
          variant="primary"
          size="md"
          onClick={submit}
          loading={pending}
          icon={pending ? undefined : <ArrowRight />}
          className="shrink-0"
        >
          Tambah
        </Button>
      </div>

      {error && (
        <p role="alert" className="px-1 text-xs text-negative">
          {error}
        </p>
      )}

      {expanded && (
        <div className="grid grid-cols-2 gap-2.5 motion-safe:animate-fade-in sm:grid-cols-4">
          {!lockDay && (
            <Select
              label="Jadwal"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              selectClassName="h-8 text-xs"
            >
              {dayOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}

          <Select
            label="Prioritas"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            selectClassName="h-8 text-xs"
          >
            {PRIORITY_ORDER.map((value) => (
              <option key={value} value={value}>
                {statusMeta("priority", value).label}
              </option>
            ))}
          </Select>

          {projects.length > 0 && (
            <Select
              label="Proyek"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              selectClassName="h-8 text-xs"
            >
              <option value="">Tanpa proyek</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </Select>
          )}

          {projects.length === 0 && goals.length > 0 && (
            <Select
              label="Tujuan"
              value={goalId}
              onChange={(event) => setGoalId(event.target.value)}
              selectClassName="h-8 text-xs"
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
              onChange={(event) => setAreaId(event.target.value)}
              selectClassName="h-8 text-xs"
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
      )}

      {!expanded && (
        <p className="flex items-center gap-3 px-1 text-micro text-ink-faint">
          <span className="inline-flex items-center gap-1">
            <CalendarDays size={11} />
            {defaultDay === todayKey ? "Hari ini" : defaultDay}
          </span>
          <span className="inline-flex items-center gap-1">
            <Flag size={11} />
            {statusMeta("priority", priority).label}
          </span>
          <span className="hidden items-center gap-1 sm:inline-flex">
            <Target size={11} />
            Enter untuk simpan
          </span>
          <span className="inline-flex items-center gap-1">
            <Link2 size={11} />
            Tab lalu panah untuk opsi
          </span>
        </p>
      )}
    </div>
  );
}