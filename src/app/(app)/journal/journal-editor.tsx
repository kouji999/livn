"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { saveJournalAction } from "@/domains/journal/actions";

/**
 * Journal editor.
 *
 * The body is the only required field. The reflection prompts and the 1-10
 * scales are collapsed behind a disclosure, because a form that opens with six
 * empty boxes is a form nobody starts — and the point of a journal is that the
 * entry gets written, not that every field is filled.
 *
 * Autosave is deliberately absent: a partial sentence saved silently would be
 * worse than an explicit save, and the user is the one who knows when a thought
 * is finished.
 */

type ScaleName = "mood" | "energy" | "focus";

const SCALES: Array<{ key: ScaleName; label: string; low: string; high: string }> = [
  { key: "mood", label: "Mood", low: "Berat", high: "Ringan" },
  { key: "energy", label: "Energi", low: "Habis", high: "Penuh" },
  { key: "focus", label: "Fokus", low: "Pecah", high: "Tajam" },
];

export function JournalEditor({
  selectedDate,
  entry,
  tags: knownTags,
  goals,
  projects,
  onSaved,
}: {
  selectedDate: string;
  entry: {
    id: string;
    title: string;
    body: string;
    mood: number | null;
    energy: number | null;
    focus: number | null;
    wentWell: string;
    wentPoorly: string;
    changeNext: string;
    tags: string[];
    goalIds: string[];
    projectIds: string[];
  } | null;
  tags: string[];
  goals: Array<{ id: string; title: string }>;
  projects: Array<{ id: string; title: string }>;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [body, setBody] = useState(entry?.body ?? "");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [scales, setScales] = useState<Record<ScaleName, number | null>>({
    mood: entry?.mood ?? null,
    energy: entry?.energy ?? null,
    focus: entry?.focus ?? null,
  });
  const [tagList, setTagList] = useState<string[]>(entry?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [goalIds, setGoalIds] = useState<string[]>(entry?.goalIds ?? []);
  const [projectIds, setProjectIds] = useState<string[]>(entry?.projectIds ?? []);
  const [reflectionOpen, setReflectionOpen] = useState(
    Boolean(entry?.wentWell || entry?.wentPoorly || entry?.changeNext),
  );
  const [wentWell, setWentWell] = useState(entry?.wentWell ?? "");
  const [wentPoorly, setWentPoorly] = useState(entry?.wentPoorly ?? "");
  const [changeNext, setChangeNext] = useState(entry?.changeNext ?? "");
  const [error, setError] = useState<string | undefined>();

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const dirty =
    body !== (entry?.body ?? "") ||
    title !== (entry?.title ?? "") ||
    scales.mood !== (entry?.mood ?? null) ||
    scales.energy !== (entry?.energy ?? null) ||
    scales.focus !== (entry?.focus ?? null) ||
    tagList.length !== (entry?.tags.length ?? 0) ||
    wentWell !== (entry?.wentWell ?? "") ||
    wentPoorly !== (entry?.wentPoorly ?? "") ||
    changeNext !== (entry?.changeNext ?? "");

  function addTag(raw: string) {
    const value = raw.trim().replace(/,$/, "");
    if (!value) return;
    if (tagList.length >= 15) {
      setTagInput("");
      return;
    }
    if (!tagList.some((t) => t.toLowerCase() === value.toLowerCase())) {
      setTagList((current) => [...current, value]);
    }
    setTagInput("");
  }

  function save() {
    if (!body.trim()) {
      setError("Tulis sesuatu dulu sebelum menyimpan.");
      return;
    }
    setError(undefined);

    startTransition(async () => {
      const result = await saveJournalAction({
        date: selectedDate,
        title: title.trim(),
        body,
        mood: scales.mood ?? undefined,
        energy: scales.energy ?? undefined,
        focus: scales.focus ?? undefined,
        wentWell: wentWell.trim(),
        wentPoorly: wentPoorly.trim(),
        changeNext: changeNext.trim(),
        tags: tagList,
        goalIds,
        projectIds,
      });

      if (!result.ok) {
        setError(result.error.message);
        toast.error("Gagal menyimpan", result.error.message);
        return;
      }

      toast.success(entry ? "Catatan diperbarui" : "Catatan tersimpan");
      onSaved?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Scales first: they are the quickest thing to answer and they frame the
          writing that follows. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SCALES.map((scale) => (
          <div key={scale.key}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs font-medium text-ink-muted">{scale.label}</span>
              <span className="tabular text-micro text-ink-faint">
                {scales[scale.key] === null ? "belum diisi" : `${scales[scale.key]}/10`}
              </span>
            </div>
            <div
              role="radiogroup"
              aria-label={scale.label}
              className="flex items-center gap-0.5"
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => {
                const active = scales[scale.key] === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={`${scale.label} ${value} dari 10`}
                    title={`${value}/10`}
                    onClick={() =>
                      setScales((current) => ({
                        ...current,
                        [scale.key]: current[scale.key] === value ? null : value,
                      }))
                    }
                    className={cn(
                      "h-7 flex-1 rounded-sm border text-micro transition-colors duration-fast",
                      active
                        ? "border-accent bg-accent text-accent-ink"
                        : "border-border bg-surface text-ink-faint hover:border-accent hover:bg-accent-soft",
                    )}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-micro text-ink-faint">
              <span>{scale.low}</span>
              <span>{scale.high}</span>
            </div>
          </div>
        ))}
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Judul (opsional)"
        aria-label="Judul catatan"
        className="h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm font-medium placeholder:font-normal placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />

      <div>
        <Textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (error) setError(undefined);
          }}
          rows={10}
          placeholder={
            selectedDate === new Date().toLocaleDateString("en-CA")
              ? "Apa yang terjadi hari ini? Apa yang kamu pikirkan?"
              : "Apa yang terjadi hari itu?"
          }
          aria-label="Isi catatan"
          error={error}
          textareaClassName="min-h-[12rem]"
        />
        <p className="mt-1 flex items-center justify-between text-micro text-ink-faint">
          <span>{words > 0 ? `${words} kata` : "Tulis bebas, tidak ada format yang wajib"}</span>
        </p>
      </div>

      {/* Tags */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink-muted">Tag</label>
        <div className="flex flex-wrap items-center gap-1.5">
          {tagList.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-micro text-ink-muted"
            >
              {tag}
              <button
                type="button"
                onClick={() => setTagList((current) => current.filter((t) => t !== tag))}
                aria-label={`Hapus tag ${tag}`}
                className="text-ink-faint hover:text-negative"
              >
                <X size={10} />
              </button>
            </span>
          ))}

          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(tagInput);
              } else if (e.key === "Backspace" && tagInput === "" && tagList.length > 0) {
                setTagList((current) => current.slice(0, -1));
              }
            }}
            onBlur={() => addTag(tagInput)}
            placeholder={tagList.length === 0 ? "Tambah tag, tekan Enter" : "Tambah lagi"}
            aria-label="Tambah tag"
            className="h-7 min-w-[8rem] flex-1 rounded-sm border border-transparent bg-transparent px-1.5 text-xs placeholder:text-ink-faint focus:border-border-strong focus:outline-none"
          />
        </div>

        {knownTags.length > 0 && tagList.length < 15 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {knownTags
              .filter((tag) => !tagList.some((t) => t.toLowerCase() === tag.toLowerCase()))
              .slice(0, 8)
              .map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => addTag(tag)}
                  className="rounded-full border border-dashed border-border px-2 py-0.5 text-micro text-ink-faint transition-colors duration-fast hover:border-border-strong hover:text-ink"
                >
                  + {tag}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Links to the plan hierarchy. Optional, because a reflection does not
          have to be about a goal. */}
      {(goals.length > 0 || projects.length > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {goals.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                Terkait tujuan
              </label>
              <div className="max-h-28 space-y-0.5 overflow-y-auto rounded-md border border-border p-1.5">
                {goals.map((goal) => {
                  const linked = goalIds.includes(goal.id);
                  return (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() =>
                        setGoalIds((current) =>
                          linked ? current.filter((id) => id !== goal.id) : [...current, goal.id],
                        )
                      }
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-xs transition-colors duration-fast",
                        linked ? "bg-accent-soft text-ink" : "text-ink-muted hover:bg-surface-sunken",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-3.5 shrink-0 items-center justify-center rounded-sm border",
                          linked ? "border-accent bg-accent text-white" : "border-border-strong",
                        )}
                      >
                        {linked && <Check size={9} strokeWidth={3} />}
                      </span>
                      <span className="truncate">{goal.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {projects.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                Terkait proyek
              </label>
              <div className="max-h-28 space-y-0.5 overflow-y-auto rounded-md border border-border p-1.5">
                {projects.map((project) => {
                  const linked = projectIds.includes(project.id);
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() =>
                        setProjectIds((current) =>
                          linked
                            ? current.filter((id) => id !== project.id)
                            : [...current, project.id],
                        )
                      }
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-xs transition-colors duration-fast",
                        linked ? "bg-accent-soft text-ink" : "text-ink-muted hover:bg-surface-sunken",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-3.5 shrink-0 items-center justify-center rounded-sm border",
                          linked ? "border-accent bg-accent text-white" : "border-border-strong",
                        )}
                      >
                        {linked && <Check size={9} strokeWidth={3} />}
                      </span>
                      <span className="truncate">{project.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reflection prompts. Collapsed by default so the common case — write
          and save — stays two interactions. */}
      <div>
        <button
          type="button"
          onClick={() => setReflectionOpen((open) => !open)}
          aria-expanded={reflectionOpen}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted transition-colors duration-fast hover:text-ink"
        >
          <Plus
            size={12}
            className={cn("transition-transform duration-fast", reflectionOpen && "rotate-45")}
          />
          {reflectionOpen ? "Sembunyikan pertanyaan refleksi" : "Tambah refleksi mendalam"}
        </button>

        {reflectionOpen && (
          <div className="mt-3 space-y-3 motion-safe:animate-fade-in">
            <Textarea
              label="Apa yang berjalan baik?"
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
              rows={2}
              placeholder="Sesuatu yang layak diulang"
            />
            <Textarea
              label="Apa yang tidak berjalan baik?"
              value={wentPoorly}
              onChange={(e) => setWentPoorly(e.target.value)}
              rows={2}
              placeholder="Tanpa menghakimi diri sendiri"
            />
            <Textarea
              label="Apa yang ingin diubah?"
              value={changeNext}
              onChange={(e) => setChangeNext(e.target.value)}
              rows={2}
              placeholder="Satu hal konkret untuk lain kali"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border-subtle pt-4">
        <Button variant="primary" size="md" onClick={save} loading={pending} disabled={!dirty && Boolean(entry)}>
          {entry ? (dirty ? "Simpan perubahan" : "Tersimpan") : "Simpan catatan"}
        </Button>

        {dirty && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setBody(entry?.body ?? "");
              setTitle(entry?.title ?? "");
              setScales({
                mood: entry?.mood ?? null,
                energy: entry?.energy ?? null,
                focus: entry?.focus ?? null,
              });
              setTagList(entry?.tags ?? []);
              setGoalIds(entry?.goalIds ?? []);
              setProjectIds(entry?.projectIds ?? []);
              setWentWell(entry?.wentWell ?? "");
              setWentPoorly(entry?.wentPoorly ?? "");
              setChangeNext(entry?.changeNext ?? "");
              setError(undefined);
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
