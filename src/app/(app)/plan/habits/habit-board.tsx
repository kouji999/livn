"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, TriangleAlert } from "lucide-react";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/indicator";
import { EmptyState } from "@/components/ui/states";
import { RecordIcon } from "@/components/ui/record-icon";
import { Stat, StatStrip } from "@/components/layout/page";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { COLORS } from "@/lib/tokens";
import { ICON_OPTIONS } from "@/lib/icons";
import { createHabitAction, toggleHabitAction } from "@/domains/habits/actions";

/**
 * Habit board.
 *
 * The heat strip shows the trailing fortnight, because two weeks is the
 * shortest window in which a pattern is visible: a single missed day looks
 * like an accident, a gap in a row looks like a decision.
 */

type HabitItem = {
  id: string;
  name: string;
  description: string | null;
  frequency: string;
  targetCount: number;
  scheduleDays: number[];
  trackingMethod: string;
  unit: string | null;
  colorToken: string;
  iconName: string | null;
  areaName: string | null;
  goalTitle: string | null;
  totalLogs: number;
  consistency: number;
  currentStreak: number;
  bestStreak: number;
  periodCount: number;
  periodTarget: number;
  missedCount: number;
  weeklyConsistency: number;
  monthlyConsistency: number;
  completedToday: boolean;
  activeToday: boolean;
  recent: string[];
};

const FREQUENCY_LABEL: Record<string, string> = {
  DAILY: "Harian",
  WEEKLY: "Mingguan",
  MONTHLY: "Bulanan",
  CUSTOM: "Kustom",
};

export function HabitBoard({
  habits,
  todayKey,
  areas,
  goals,
}: {
  habits: HabitItem[];
  todayKey: string;
  areas: Array<{ id: string; name: string }>;
  goals: Array<{ id: string; title: string }>;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [showArchivedHint] = useState(true);

  // The last 14 day keys, oldest first.
  const days = useMemo(() => {
    const base = new Date(`${todayKey}T00:00:00.000Z`);
    return Array.from({ length: 14 }, (_, i) => {
      const date = new Date(base.getTime() - (13 - i) * 86_400_000);
      return date.toISOString().slice(0, 10);
    });
  }, [todayKey]);

  const averageConsistency =
    habits.length > 0
      ? habits.reduce((sum, h) => sum + h.consistency, 0) / habits.length
      : 0;

  const doneToday = habits.filter((h) => h.completedToday).length;

  return (
    <div className="space-y-5">
      <StatStrip>
        <Stat label="Kebiasaan" value={habits.length} />
        <Stat
          label="Hari ini"
          value={`${doneToday}/${habits.filter((h) => h.activeToday).length}`}
          tone={doneToday > 0 ? "positive" : "muted"}
        />
        <Stat
          label="Konsistensi"
          value={habits.length === 0 ? "-" : `${Math.round(averageConsistency * 100)}%`}
          hint="Rata-rata seluruh kebiasaan"
        />
        <Stat
          label="Terlewat"
          value={habits.reduce((sum, h) => sum + h.missedCount, 0)}
          tone={habits.some((h) => h.missedCount > 0) ? "negative" : "muted"}
        />
      </StatStrip>

      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Semua kebiasaan</SectionLabel>
        <Button
          variant={composerOpen ? "ghost" : "primary"}
          size="sm"
          icon={<Plus />}
          onClick={() => setComposerOpen((open) => !open)}
        >
          {composerOpen ? "Tutup" : "Kebiasaan baru"}
        </Button>
      </div>

      {composerOpen && (
        <Card className="p-5">
          <HabitComposer
            areas={areas}
            goals={goals}
            todayKey={todayKey}
            onDone={() => setComposerOpen(false)}
          />
        </Card>
      )}

      {habits.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Plus />}
            title="Belum ada kebiasaan"
            description="Kebiasaan adalah sesuatu yang kamu lakukan berulang, misalnya olahraga 4 kali seminggu."
            action={
              <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setComposerOpen(true)}>
                Buat kebiasaan
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {habits.map((habit) => (
            <li key={habit.id}>
              <HabitCard habit={habit} days={days} todayKey={todayKey} />
            </li>
          ))}
        </ul>
      )}

      {showArchivedHint && habits.length > 0 && (
        <p className="text-micro text-ink-faint">
          Kebiasaan yang diarsipkan tetap menyimpan riwayatnya dan tidak lagi dihitung
          dalam konsistensi.
        </p>
      )}
    </div>
  );
}

function HabitCard({
  habit,
  days,
  todayKey,
}: {
  habit: HabitItem;
  days: string[];
  todayKey: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(habit.completedToday);

  const completedSet = new Set(habit.recent);
  const periodLabel =
    habit.frequency === "WEEKLY"
      ? `${habit.periodCount}/${habit.periodTarget} minggu ini`
      : habit.frequency === "MONTHLY"
        ? `${habit.periodCount}/${habit.periodTarget} bulan ini`
        : `${habit.periodCount}/${habit.periodTarget} hari ini`;

  function toggle() {
    startTransition(async () => {
      setDone((current) => !current);
      const result = await toggleHabitAction({
        habitId: habit.id,
        date: todayKey,
        completed: !habit.completedToday,
      });

      if (!result.ok) {
        setDone(habit.completedToday);
        toast.error("Gagal menyimpan", result.error.message);
        return;
      }

      router.refresh();
    });
  }

  return (
    <Card className={cn("px-4 py-3.5", pending && "opacity-80")}>
      <div className="flex items-start gap-3">
        <RecordIcon icon={habit.iconName} token={habit.colorToken} size="md" className="mt-0.5" />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{habit.name}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-micro text-ink-faint">
                <span>
                  {FREQUENCY_LABEL[habit.frequency] ?? habit.frequency}
                  {habit.frequency !== "DAILY" && ` ${habit.targetCount}x`}
                </span>
                {habit.areaName && <span>{habit.areaName}</span>}
                {habit.goalTitle && <span>{habit.goalTitle}</span>}
              </p>
            </div>

            {/* The daily action, kept on the right where the thumb and eye land. */}
            <button
              type="button"
              onClick={toggle}
              disabled={pending}
              aria-pressed={done}
              aria-label={`${done ? "Batalkan" : "Tandai"} ${habit.name} hari ini`}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-md border transition-colors duration-fast",
                done
                  ? "border-positive bg-positive text-white"
                  : "border-border-strong bg-surface text-ink-faint hover:border-accent hover:bg-accent-soft hover:text-accent",
              )}
            >
              <Check size={16} strokeWidth={2.5} />
            </button>
          </div>

          {/* Consistency leads; the streak is supporting detail. */}
          <div className="mt-3 flex items-center gap-3">
            <ProgressBar
              value={habit.consistency}
              token={habit.colorToken}
              height={5}
              className="flex-1"
              tone={habit.consistency >= 0.8 ? "positive" : "auto"}
              label={`Konsistensi ${habit.name}`}
            />
            <span className="tabular shrink-0 text-xs font-medium text-ink-muted">
              {Math.round(habit.consistency * 100)}%
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-micro text-ink-faint">
            <span className="tabular">{periodLabel}</span>
            <span className="tabular">Streak {habit.currentStreak} hari</span>
            <span className="tabular">Terbaik {habit.bestStreak}</span>
            {habit.missedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-warning">
                <TriangleAlert size={10} />
                {habit.missedCount} terlewat
              </span>
            )}
          </div>

          {/* Trailing fortnight. Filled = done, outline = expected, faded = not scheduled. */}
          <div className="mt-3 flex items-center gap-1" aria-label="14 hari terakhir">
            {days.map((date) => {
              const isDone = completedSet.has(date);
              const isToday = date === todayKey;
              const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
              const scheduled =
                habit.scheduleDays.length === 0 || habit.scheduleDays.includes(weekday);
              const isFuture = date > todayKey;

              return (
                <span
                  key={date}
                  title={date}
                  className={cn(
                    "h-5 flex-1 rounded-sm border transition-colors",
                    isDone
                      ? "border-transparent"
                      : scheduled && !isFuture
                        ? "border-border"
                        : "border-border-subtle",
                    isToday && "ring-1 ring-accent ring-offset-1 ring-offset-[var(--color-surface)]",
                  )}
                  style={isDone ? { backgroundColor: `var(--color-${habit.colorToken})` } : undefined}
                />
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

function HabitComposer({
  areas,
  goals,
  todayKey,
  onDone,
}: {
  areas: Array<{ id: string; name: string }>;
  goals: Array<{ id: string; title: string }>;
  todayKey: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState("DAILY");
  const [targetCount, setTargetCount] = useState("1");
  const [scheduleDays, setScheduleDays] = useState<number[]>([]);
  const [trackingMethod, setTrackingMethod] = useState("BOOLEAN");
  const [unit, setUnit] = useState("");
  const [colorToken, setColorToken] = useState("accent");
  const [iconName, setIconName] = useState("activity");
  const [areaId, setAreaId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [startDate, setStartDate] = useState(todayKey);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const DAY_LABELS = [
    { value: 1, label: "Sen" },
    { value: 2, label: "Sel" },
    { value: 3, label: "Rab" },
    { value: 4, label: "Kam" },
    { value: 5, label: "Jum" },
    { value: 6, label: "Sab" },
    { value: 0, label: "Min" },
  ];

  function submit() {
    if (!name.trim()) {
      setErrors({ name: "Nama kebiasaan wajib diisi." });
      return;
    }

    startTransition(async () => {
      const result = await createHabitAction({
        name: name.trim(),
        description: description.trim() || undefined,
        frequency,
        targetCount: Number(targetCount),
        scheduleDays,
        trackingMethod,
        unit: trackingMethod === "BOOLEAN" ? undefined : unit.trim(),
        colorToken,
        iconName,
        areaId: areaId || undefined,
        goalId: goalId || undefined,
        startDate,
      });

      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? { _form: result.error.message });
        toast.error("Gagal membuat kebiasaan", result.error.message);
        return;
      }

      toast.success("Kebiasaan dibuat");
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
        <div className="min-w-0 flex-1">
          <Input
            label="Nama kebiasaan"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Olahraga"
            autoFocus
            error={errors.name}
          />
        </div>
      </div>

      <Textarea
        label="Keterangan"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        error={errors.description}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Frekuensi"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
          hint="Seberapa sering kebiasaan ini seharusnya terjadi"
          error={errors.frequency}
        >
          <option value="DAILY">Harian</option>
          <option value="WEEKLY">Mingguan</option>
          <option value="MONTHLY">Bulanan</option>
        </Select>

        <Input
          label={frequency === "DAILY" ? "Berapa kali sehari" : frequency === "WEEKLY" ? "Berapa kali seminggu" : "Berapa kali sebulan"}
          value={targetCount}
          onChange={(e) => setTargetCount(e.target.value)}
          inputMode="numeric"
          error={errors.targetCount}
        />
      </div>

      {/* A weekly or monthly habit benefits from naming its days. */}
      {(frequency === "WEEKLY" || frequency === "MONTHLY") && (
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-ink-muted">
            Hari tertentu <span className="text-ink-faint">(opsional)</span>
          </legend>
          <div className="flex flex-wrap gap-1">
            {DAY_LABELS.map((day) => {
              const active = scheduleDays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setScheduleDays((current) =>
                      active
                        ? current.filter((d) => d !== day.value)
                        : [...current, day.value],
                    )
                  }
                  className={cn(
                    "h-8 w-11 rounded-md border text-xs font-medium transition-colors duration-fast",
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border text-ink-subtle hover:border-border-strong hover:text-ink",
                  )}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          {scheduleDays.length > 0 && (
            <p className="mt-1.5 text-xs text-ink-faint">
              Hanya hari yang dipilih yang dihitung. Hari lain tidak akan menurunkan
              konsistensi.
            </p>
          )}
        </fieldset>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Cara mencatat"
          value={trackingMethod}
          onChange={(e) => setTrackingMethod(e.target.value)}
          error={errors.trackingMethod}
        >
          <option value="BOOLEAN">Selesai / belum</option>
          <option value="COUNT">Hitungan</option>
          <option value="DURATION">Durasi</option>
          <option value="QUANTITY">Jumlah</option>
        </Select>

        {trackingMethod !== "BOOLEAN" && (
          <Input
            label="Satuan"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder={trackingMethod === "DURATION" ? "menit" : "gelas"}
            error={errors.unit}
          />
        )}
      </div>

      <Input
        label="Mulai"
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        hint="Hari sebelum tanggal ini tidak dihitung sebagai terlewat"
        error={errors.startDate}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {areas.length > 0 && (
          <Select label="Area" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">Tanpa area</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </Select>
        )}

        {goals.length > 0 && (
          <Select
            label="Mendukung tujuan"
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            hint="Progres kebiasaan akan ikut menghitung tujuan"
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
        <div className="grid max-h-32 grid-cols-8 gap-1 overflow-y-auto rounded-md border border-border p-2">
          {ICON_OPTIONS.slice(0, 32).map((option) => {
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
                  active ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-sunken",
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
          Buat kebiasaan
        </Button>
        <Button variant="ghost" size="md" onClick={onDone} disabled={pending}>
          Batal
        </Button>
      </div>
    </div>
  );
}
