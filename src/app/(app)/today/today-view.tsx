"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  CircleDot,
  NotebookPen,
  Plus,
  Wallet,
} from "lucide-react";
import { Card, CardHeader, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/indicator";
import { EmptyState } from "@/components/ui/states";
import { RecordIcon } from "@/components/ui/record-icon";
import { TaskRow, type TaskRowData } from "@/components/plan/task-row";
import { TaskComposer } from "../plan/tasks/task-composer";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { formatMoneyOrNumber } from "@/lib/format";
import { toggleHabitAction } from "@/domains/habits/actions";

/**
 * Today.
 *
 * The aggregation layer. It owns no data of its own and shows nothing that is
 * not already computed elsewhere: tasks come from the task service, habits from
 * the habit engine, money from the finance ledger, progress from the goal and
 * project services. Every figure therefore matches the page it links to.
 *
 * The reading order is intentional and follows the product's own loop:
 * what to do, what I am maintaining, what it costs, how far along I am, and
 * finally space to reflect.
 */

type TaskItem = TaskRowData;

type HabitItem = {
  id: string;
  name: string;
  frequency: string;
  targetCount: number;
  colorToken: string;
  iconName: string | null;
  areaName: string | null;
  completedToday: boolean;
  periodCount: number;
  periodTarget: number;
  consistency: number;
  currentStreak: number;
};

type MoneyItem = {
  netWorth: string;
  todayIncome: string;
  todayExpense: string;
  monthIncome: string;
  monthExpense: string;
  monthNet: string;
  accountCount: number;
  topAccounts: Array<{
    id: string;
    name: string;
    balance: string;
    colorToken: string;
    iconName: string | null;
  }>;
};

type GoalItem = {
  id: string;
  title: string;
  goalType: string;
  unit: string | null;
  percentage: number | null;
  ratio: number | null;
  current: number;
  target: number | null;
  areaToken: string | null;
  daysRemaining: number | null;
  isOffTrack: boolean;
};

type ProjectItem = {
  id: string;
  title: string;
  percentage: number;
  areaToken: string | null;
  completedMilestones: number;
  totalMilestones: number;
};

export function TodayView({
  todayKey,
  currency,
  tasks,
  habits,
  money,
  goals,
  projects,
  monthConsistency,
  areas,
  journal,
}: {
  todayKey: string;
  currency: string;
  tasks: { scheduled: TaskItem[]; overdue: TaskItem[] };
  habits: HabitItem[];
  money: MoneyItem;
  goals: GoalItem[];
  projects: ProjectItem[];
  monthConsistency: number;
  areas: Array<{ id: string; name: string; colorToken: string }>;
  journal: {
    id: string;
    mood: number | null;
    energy: number | null;
    focus: number | null;
    excerpt: string;
  } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [composerOpen, setComposerOpen] = useState(false);
  const [habitState, setHabitState] = useState<Record<string, boolean>>(
    Object.fromEntries(habits.map((h) => [h.id, h.completedToday])),
  );

  const openTasks = tasks.scheduled.length + tasks.overdue.length;
  const doneToday = habits.filter((h) => habitState[h.id]).length;

  const netWorth = BigInt(money.netWorth);
  const todayIncome = BigInt(money.todayIncome);
  const todayExpense = BigInt(money.todayExpense);
  const monthIncome = BigInt(money.monthIncome);
  const monthExpense = BigInt(money.monthExpense);
  const monthNet = BigInt(money.monthNet);

  function toggleHabit(habitId: string) {
    const next = !habitState[habitId];
    setHabitState((current) => ({ ...current, [habitId]: next }));

    startTransition(async () => {
      const result = await toggleHabitAction({
        habitId,
        date: todayKey,
        completed: next,
      });

      if (!result.ok) {
        setHabitState((current) => ({ ...current, [habitId]: !next }));
        toast.error("Gagal menyimpan kebiasaan", result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Greeting carries the day's shape in one line rather than a wall of stats. */}
      <p className="text-sm text-ink-subtle">
        {openTasks === 0
          ? "Tidak ada tugas tersisa untuk hari ini."
          : `${openTasks} tugas menunggu, ${doneToday} dari ${habits.length} kebiasaan sudah dicentang.`}
      </p>

      {/* ── Today's work ─────────────────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <SectionLabel>Hari ini</SectionLabel>
          <Button
            variant={composerOpen ? "ghost" : "secondary"}
            size="sm"
            icon={<Plus />}
            onClick={() => setComposerOpen((open) => !open)}
          >
            {composerOpen ? "Tutup" : "Tambah"}
          </Button>
        </div>

        {composerOpen && (
          <Card className="mb-3 p-4">
            <TaskComposer
              areas={areas}
              projects={[]}
              goals={[]}
              defaultDay={todayKey}
              todayKey={todayKey}
              tomorrowKey={todayKey}
              lockDay
              onDone={() => {
                setComposerOpen(false);
                router.refresh();
              }}
            />
          </Card>
        )}

        {/* Overdue first: the task most likely to be quietly forgotten. */}
        {tasks.overdue.length > 0 && (
          <Card className="mb-3 py-1">
            <div className="flex items-baseline gap-2 px-4 pt-2.5">
              <h3 className="text-micro font-semibold uppercase tracking-[0.08em] text-negative">
                Terlewat
              </h3>
              <span className="tabular text-micro text-ink-faint">
                {tasks.overdue.length}
              </span>
            </div>
            <ul>
              {tasks.overdue.map((task) => (
                <li key={task.id}>
                  <TaskRow task={task} today={todayKey} showDate />
                </li>
              ))}
            </ul>
          </Card>
        )}

        {tasks.scheduled.length > 0 ? (
          <Card className="py-1">
            <ul>
              {tasks.scheduled.map((task) => (
                <li key={task.id}>
                  <TaskRow task={task} today={todayKey} showDate={false} />
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          tasks.overdue.length === 0 && (
            <Card>
              <EmptyState
                icon={<CircleDot />}
                title="Hari ini masih kosong"
                description="Tambahkan satu hal yang paling penting untuk dikerjakan hari ini."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus />}
                    onClick={() => setComposerOpen(true)}
                  >
                    Tambah tugas
                  </Button>
                }
              />
            </Card>
          )
        )}
      </section>

      {/* ── Habits ───────────────────────────────────────────────────────── */}
      {habits.length > 0 && (
        <section>
          <SectionLabel className="mb-2">Kebiasaan</SectionLabel>
          <Card className="px-4 py-3">
            <ul className="divide-y divide-border-subtle">
              {habits.map((habit) => {
                const done = habitState[habit.id];
                return (
                  <li key={habit.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                    <RecordIcon
                      icon={habit.iconName}
                      token={habit.colorToken}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{habit.name}</p>
                      <p className="tabular text-micro text-ink-faint">
                        {habit.frequency === "DAILY"
                          ? `${habit.periodCount}/${habit.periodTarget} hari ini`
                          : habit.frequency === "WEEKLY"
                            ? `${habit.periodCount}/${habit.periodTarget} minggu ini`
                            : `${habit.periodCount}/${habit.periodTarget} bulan ini`}
                        {habit.currentStreak > 1 && ` - ${habit.currentStreak} hari beruntun`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleHabit(habit.id)}
                      aria-pressed={done}
                      aria-label={`${done ? "Batalkan" : "Tandai"} ${habit.name}`}
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-md border text-transparent transition-colors duration-fast",
                        done
                          ? "border-positive bg-positive text-white"
                          : "border-border-strong hover:border-accent hover:bg-accent-soft",
                      )}
                    >
                      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8.5l3.5 3.5L13 5" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}

      {/* ── Money ────────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <SectionLabel>Uang</SectionLabel>
          <Link
            href="/money"
            className="inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:underline"
          >
            Selengkapnya
            <ChevronRight size={13} />
          </Link>
        </div>

        <Card className="px-5 py-4">
          {money.accountCount === 0 ? (
            <EmptyState
              compact
              icon={<Wallet />}
              title="Belum ada akun keuangan"
              description="Tambahkan akun untuk mulai mencatat pemasukan dan pengeluaran."
              action={
                <Link
                  href="/money"
                  className="text-sm font-medium text-accent hover:underline"
                >
                  Tambah akun
                </Link>
              }
            />
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-micro font-medium uppercase tracking-[0.08em] text-ink-faint">
                    Total saldo
                  </p>
                  <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink">
                    {formatMoney(netWorth, currency)}
                  </p>
                </div>

                <div className="text-right">
                  {todayIncome > 0n && (
                    <p className="tabular flex items-center justify-end gap-1 text-xs text-positive">
                      <ArrowUpRight size={12} />
                      {formatMoney(todayIncome, currency)} hari ini
                    </p>
                  )}
                  {todayExpense > 0n && (
                    <p className="tabular flex items-center justify-end gap-1 text-xs text-negative">
                      <ArrowDownRight size={12} />
                      {formatMoney(todayExpense, currency)} hari ini
                    </p>
                  )}
                  {todayIncome === 0n && todayExpense === 0n && (
                    <p className="text-xs text-ink-faint">Belum ada pergerakan hari ini</p>
                  )}
                </div>
              </div>

              {money.topAccounts.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-border-subtle pt-3">
                  {money.topAccounts.map((account) => (
                    <li key={account.id} className="flex items-center gap-2.5">
                      <RecordIcon
                        icon={account.iconName}
                        token={account.colorToken}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">
                        {account.name}
                      </span>
                      <span className="tabular shrink-0 text-sm text-ink">
                        {formatMoney(BigInt(account.balance), currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Month-to-date, clearly labelled so it is not read as a total. */}
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border-subtle pt-3 text-xs">
                <div>
                  <p className="text-ink-faint">Masuk bulan ini</p>
                  <p className="tabular mt-0.5 text-positive">
                    {formatMoney(monthIncome, currency)}
                  </p>
                </div>
                <div>
                  <p className="text-ink-faint">Keluar bulan ini</p>
                  <p className="tabular mt-0.5 text-negative">
                    {formatMoney(monthExpense, currency)}
                  </p>
                </div>
                <div>
                  <p className="text-ink-faint">Selisih</p>
                  <p
                    className={cn(
                      "tabular mt-0.5 font-medium",
                      monthNet >= 0n ? "text-positive" : "text-negative",
                    )}
                  >
                    {formatMoney(monthNet, currency, { showSign: true })}
                  </p>
                </div>
              </div>
            </>
          )}
        </Card>
      </section>

      {/* ── Progress ─────────────────────────────────────────────────────── */}
      {(goals.length > 0 || projects.length > 0 || habits.length > 0) && (
        <section>
          <SectionLabel className="mb-2">Progres</SectionLabel>

          <Card className="px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">Konsistensi bulan ini</p>
                <p className="text-micro text-ink-faint">
                  Rata-rata seluruh kebiasaan aktif
                </p>
              </div>
              <span className="tabular text-lg font-semibold text-ink">
                {Math.round(monthConsistency * 100)}%
              </span>
            </div>
            <ProgressBar
              value={monthConsistency}
              height={6}
              className="mt-3"
              tone={monthConsistency >= 0.8 ? "positive" : "auto"}
              label="Konsistensi bulan ini"
            />
          </Card>

          {goals.length > 0 && (
            <Card className="mt-3">
              <CardHeader
                size="sm"
                title="Tujuan"
                action={
                  <Link
                    href="/plan/goals"
                    className="inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:underline"
                  >
                    Semua
                    <ChevronRight size={13} />
                  </Link>
                }
              />
              <ul className="px-4 pb-4">
                {goals.map((goal) => (
                  <li key={goal.id}>
                    <Link
                      href={`/plan/goals/${goal.id}`}
                      className="-mx-1.5 block rounded-md px-1.5 py-2 transition-colors duration-fast hover:bg-surface-sunken"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm text-ink">{goal.title}</span>
                        <span className="tabular shrink-0 text-xs text-ink-muted">
                          {goal.percentage === null ? "-" : `${goal.percentage}%`}
                        </span>
                      </div>
                      {goal.ratio !== null && (
                        <ProgressBar
                          value={goal.ratio}
                          token={goal.areaToken}
                          height={4}
                          className="mt-1.5"
                          label={`Progres ${goal.title}`}
                        />
                      )}
                      <p className="tabular mt-1 text-micro text-ink-faint">
                        {goal.target !== null
                          ? `${formatMoneyOrNumber(goal.current, goal.goalType, goal.unit)} dari ${formatMoneyOrNumber(goal.target, goal.goalType, goal.unit)}`
                          : goal.percentage !== null && goal.percentage >= 100
                            ? "Sudah tercapai"
                            : "Belum tercapai"}
                        {goal.isOffTrack && (
                          <span className="ml-2 text-negative">- laju kurang</span>
                        )}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {projects.length > 0 && (
            <Card className="mt-3">
              <CardHeader
                size="sm"
                title="Proyek"
                action={
                  <Link
                    href="/plan/projects"
                    className="inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:underline"
                  >
                    Semua
                    <ChevronRight size={13} />
                  </Link>
                }
              />
              <ul className="px-4 pb-4">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/plan/projects/${project.id}`}
                      className="-mx-1.5 block rounded-md px-1.5 py-2 transition-colors duration-fast hover:bg-surface-sunken"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm text-ink">{project.title}</span>
                        <span className="tabular shrink-0 text-xs text-ink-muted">
                          {project.percentage}%
                        </span>
                      </div>
                      <ProgressBar
                        value={project.percentage / 100}
                        token={project.areaToken}
                        height={4}
                        className="mt-1.5"
                        tone={project.percentage === 100 ? "positive" : "auto"}
                        label={`Progres ${project.title}`}
                      />
                      {project.totalMilestones > 0 && (
                        <p className="tabular mt-1 text-micro text-ink-faint">
                          {project.completedMilestones}/{project.totalMilestones} milestone
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      {/* ── Reflection ───────────────────────────────────────────────────── */}
      <section>
        <SectionLabel className="mb-2">Refleksi</SectionLabel>
        <Card className="px-5 py-4">
          {journal ? (
            <Link href="/journal" className="group block">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-muted">
                  {journal.excerpt}
                </p>
                <ChevronRight
                  size={15}
                  className="mt-0.5 shrink-0 text-ink-faint opacity-0 transition-opacity duration-fast group-hover:opacity-100"
                />
              </div>
              {(journal.mood !== null || journal.energy !== null || journal.focus !== null) && (
                <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border-subtle pt-3 text-micro">
                  {journal.mood !== null && (
                    <div className="flex items-center gap-1.5">
                      <dt className="text-ink-faint">Mood</dt>
                      <dd className="tabular font-medium text-ink">{journal.mood}/10</dd>
                    </div>
                  )}
                  {journal.energy !== null && (
                    <div className="flex items-center gap-1.5">
                      <dt className="text-ink-faint">Energi</dt>
                      <dd className="tabular font-medium text-ink">{journal.energy}/10</dd>
                    </div>
                  )}
                  {journal.focus !== null && (
                    <div className="flex items-center gap-1.5">
                      <dt className="text-ink-faint">Fokus</dt>
                      <dd className="tabular font-medium text-ink">{journal.focus}/10</dd>
                    </div>
                  )}
                </dl>
              )}
            </Link>
          ) : (
            <EmptyState
              compact
              icon={<NotebookPen />}
              title="Bagaimana hari ini?"
              description="Menulis beberapa baris sekarang membuat hari ini bisa kamu lihat lagi nanti."
              action={
                <Link
                  href="/journal"
                  className="inline-flex h-8 items-center rounded-md border border-border-strong bg-surface px-3 text-xs font-medium text-ink transition-colors duration-fast hover:bg-surface-sunken"
                >
                  Tulis jurnal
                </Link>
              }
            />
          )}
        </Card>
      </section>

      <p className="pt-1 text-center text-micro text-ink-faint">
        Semua angka di halaman ini dihitung dari catatanmu, bukan disimpan terpisah.
      </p>
    </div>
  );
}
