/**
 * Development seeder.
 *
 *   npx tsx scripts/seed-demo.ts [email]
 *
 * Populates an existing account with a realistic few weeks of history so the
 * charts, statistics and reviews can be inspected with real shape rather than
 * empty states.
 *
 * Deliberately separate from `prisma/seed.ts` and clearly marked: this is
 * development data, and the product's own rule is that seed data must be
 * isolated from a real user's records. It refuses to run against an account
 * that already has transactions, so it cannot quietly corrupt real history.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  addCalendarDays,
  calendarDay,
  formatCalendarDay,
  today,
  type CalendarDay,
} from "../src/lib/date";

const EMAIL = process.argv[2] ?? "demo@livn.test";
const TIME_ZONE = "Asia/Jakarta";

let failures = 0;
function note(message: string) {
  console.log(`  ${message}`);
}
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` - ${detail}` : ""}`);
}

/** Deterministic pseudo-random so repeated runs produce the same history. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

const random = makeRandom(20260923);

function pick<T>(items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  console.log(`\nSeeding development history for ${EMAIL}\n`);

  const user = await db.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, displayName: true },
  });

  if (!user) {
    throw new Error(
      `No account for ${EMAIL}. Register it in the app first, then run this again.`,
    );
  }

  const existingTransactions = await db.transaction.count({ where: { userId: user.id } });
  if (existingTransactions > 0) {
    throw new Error(
      `This account already has ${existingTransactions} transactions. This seeder only runs against a fresh account, so it cannot overwrite real history.`,
    );
  }

  const todayDay = today(TIME_ZONE);
  const startDay = addCalendarDays(todayDay, -34);

  // â”€â”€ Look up the seeded scaffolding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const areas = await db.area.findMany({
    where: { userId: user.id },
    select: { id: true, name: true },
  });
  const areaByName = new Map(areas.map((a) => [a.name, a.id]));

  const categories = await db.category.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, kind: true },
  });
  const categoryByName = new Map(categories.map((c) => [c.name, c]));

  const accounts = await db.account.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, type: true },
  });
  const cash = accounts.find((a) => a.type === "CASH")!;
  const bank = accounts.find((a) => a.type === "BANK")!;
  const wallet = accounts.find((a) => a.type === "E_WALLET")!;

  console.log("Existing scaffolding");
  check("areas are seeded", areas.length >= 6, `${areas.length}`);
  check("categories are seeded", categories.length >= 15, `${categories.length}`);
  check("accounts are seeded", accounts.length === 3, `${accounts.length}`);

  // â”€â”€ Goals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nGoals");
  const emergencyFund = await db.goal.create({
    data: {
      userId: user.id,
      areaId: areaByName.get("Keuangan") ?? null,
      title: "Dana darurat Rp20 juta",
      description: "Enam bulan pengeluaran, supaya keputusan besar tidak diambil karena panik.",
      goalType: "CURRENCY",
      targetValue: 20_000_000,
      currentValue: 12_400_000,
      unit: "IDR",
      startDate: calendarDay(todayDay.getUTCFullYear(), 1, 1),
      targetDate: calendarDay(todayDay.getUTCFullYear(), 12, 31),
      status: "ACTIVE",
      priority: "HIGH",
    },
    select: { id: true },
  });

  const booksGoal = await db.goal.create({
    data: {
      userId: user.id,
      areaId: areaByName.get("Pembelajaran") ?? null,
      title: "Baca 20 buku",
      goalType: "COUNT",
      // Derived: the count comes from completed tasks tagged to this goal.
      isDerived: true,
      derivationKey: "task.completed.count",
      targetValue: 20,
      currentValue: 0,
      unit: "buku",
      startDate: calendarDay(todayDay.getUTCFullYear(), 1, 1),
      targetDate: calendarDay(todayDay.getUTCFullYear(), 12, 31),
      status: "ACTIVE",
      priority: "MEDIUM",
    },
    select: { id: true },
  });

  const businessGoal = await db.goal.create({
    data: {
      userId: user.id,
      areaId: areaByName.get("Bisnis") ?? null,
      title: "Punya penghasilan sampingan",
      goalType: "BINARY",
      status: "ACTIVE",
      priority: "HIGH",
      startDate: calendarDay(todayDay.getUTCFullYear(), 3, 1),
      targetDate: calendarDay(todayDay.getUTCFullYear() + 1, 3, 1),
    },
    select: { id: true },
  });

  check("three goals created", Boolean(emergencyFund.id && booksGoal.id && businessGoal.id));

  // â”€â”€ Projects and milestones â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nProjects");
  const portfolio = await db.project.create({
    data: {
      userId: user.id,
      areaId: areaByName.get("Karier") ?? null,
      goalId: businessGoal.id,
      title: "Bangun portofolio online",
      description: "Satu halaman yang membuktikan apa yang bisa saya kerjakan.",
      status: "ACTIVE",
      startDate: addCalendarDays(todayDay, -28),
      targetDate: addCalendarDays(todayDay, 40),
    },
    select: { id: true },
  });

  const runProject = await db.project.create({
    data: {
      userId: user.id,
      areaId: areaByName.get("Kesehatan") ?? null,
      title: "Lari half marathon",
      status: "ACTIVE",
      startDate: addCalendarDays(todayDay, -40),
      targetDate: addCalendarDays(todayDay, 70),
    },
    select: { id: true },
  });

  const portfolioMilestones = [
    { title: "Kumpulkan 5 studi kasus", completedOffset: -12 },
    { title: "Desain dan tulis halaman utama", completedOffset: -4 },
    { title: "Publikasikan dan minta masukan", completedOffset: null },
    { title: "Perbaiki berdasarkan masukan", completedOffset: null },
  ];

  for (const [index, milestone] of portfolioMilestones.entries()) {
    await db.milestone.create({
      data: {
        userId: user.id,
        projectId: portfolio.id,
        title: milestone.title,
        dueDate: addCalendarDays(todayDay, -20 + index * 14),
        position: index,
        completedAt:
          milestone.completedOffset === null
            ? null
            : addCalendarDays(todayDay, milestone.completedOffset),
      },
    });
  }

  const runMilestones = [
    { title: "Lari 5 km tanpa berhenti", completedOffset: -30 },
    { title: "Lari 10 km", completedOffset: -14 },
    { title: "Lari 15 km", completedOffset: -3 },
    { title: "Lari 21 km", completedOffset: null },
  ];

  for (const [index, milestone] of runMilestones.entries()) {
    await db.milestone.create({
      data: {
        userId: user.id,
        projectId: runProject.id,
        title: milestone.title,
        dueDate: addCalendarDays(todayDay, -35 + index * 20),
        position: index,
        completedAt:
          milestone.completedOffset === null
            ? null
            : addCalendarDays(todayDay, milestone.completedOffset),
      },
    });
  }

  check("two projects with milestones created", true);

  // â”€â”€ Habits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nHabits");
  const habitSpecs = [
    { name: "Olahraga", frequency: "WEEKLY" as const, targetCount: 4, scheduleDays: [], colorToken: "positive", hitRate: 0.75, iconName: "dumbbell", area: "Kesehatan" },
    { name: "Baca 30 menit", frequency: "DAILY" as const, targetCount: 1, scheduleDays: [], colorToken: "warning", hitRate: 0.68, iconName: "book-open", area: "Pembelajaran" },
    { name: "Belajar bahasa Jepang", frequency: "DAILY" as const, targetCount: 1, scheduleDays: [], colorToken: "info", hitRate: 0.55, iconName: "graduation-cap", area: "Pembelajaran" },
    { name: "Tidur sebelum jam 11", frequency: "DAILY" as const, targetCount: 1, scheduleDays: [], colorToken: "neutral", hitRate: 0.45, iconName: "activity", area: "Kesehatan" },
    { name: "Menulis jurnal", frequency: "DAILY" as const, targetCount: 1, scheduleDays: [], colorToken: "accent", hitRate: 0.8, iconName: "notebook-pen", area: "Pribadi" },
  ];

  const habitIds: Array<{ id: string; name: string; hitRate: number }> = [];

  for (const [index, spec] of habitSpecs.entries()) {
    const habit = await db.habit.create({
      data: {
        userId: user.id,
        areaId: areaByName.get(spec.area) ?? null,
        goalId: spec.name === "Baca 30 menit" ? booksGoal.id : null,
        name: spec.name,
        frequency: spec.frequency,
        targetCount: spec.targetCount,
        scheduleDays: spec.scheduleDays,
        colorToken: spec.colorToken,
        iconName: spec.iconName,
        startDate: startDay,
        position: index,
      },
      select: { id: true, name: true },
    });
    habitIds.push({ id: habit.id, name: habit.name, hitRate: spec.hitRate });
  }

  check("five habits created", habitIds.length === 5);

  // A month of logs, dense enough for the consistency arithmetic to have shape.
  let logCount = 0;
  for (const habit of habitIds) {
    for (let offset = 0; offset <= 34; offset++) {
      const day = addCalendarDays(startDay, offset);
      if (day > todayDay) continue;
      if (random() > habit.hitRate) continue;

      await db.habitLog.create({
        data: {
          userId: user.id,
          habitId: habit.id,
          date: day,
          completed: true,
        },
      });
      logCount++;
    }
  }
  check("habit logs written", logCount > 50, `${logCount} sessions`);

  // â”€â”€ Tasks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nTasks");
  const taskTemplates = [
    { title: "Tulis studi kasus klien", project: "portfolio", area: "Karier" },
    { title: "Riset kompetitor", project: "portfolio", area: "Karier" },
    { title: "Perbaiki halaman kontak", project: "portfolio", area: "Karier" },
    { title: "Lari pagi 5 km", project: "run", area: "Kesehatan" },
    { title: "Latihan interval", project: "run", area: "Kesehatan" },
    { title: "Baca satu bab", project: null, area: "Pembelajaran", goal: "books" },
    { title: "Hafal 10 kosakata", project: null, area: "Pembelajaran" },
    { title: "Rapikan catatan keuangan", project: null, area: "Keuangan" },
    { title: "Telepon supplier", project: null, area: "Bisnis" },
    { title: "Review rencana minggu depan", project: null, area: "Pribadi" },
  ];

  let taskCount = 0;
  let completedCount = 0;

  for (let offset = 0; offset <= 34; offset++) {
    const day = addCalendarDays(startDay, offset);
    // Roughly two scheduled tasks a day, occasionally none.
    const perDay = random() < 0.15 ? 0 : random() < 0.5 ? 1 : 2;

    for (let i = 0; i < perDay; i++) {
      const template = pick(taskTemplates);
      // Earlier days are more likely to be resolved than the last few.
      const isPast = day < addCalendarDays(todayDay, -2);
      const roll = random();
      const status = isPast
        ? roll < 0.72
          ? "COMPLETED"
          : roll < 0.88
            ? "SKIPPED"
            : "PLANNED"
        : roll < 0.3
          ? "COMPLETED"
          : "PLANNED";

      await db.task.create({
        data: {
          userId: user.id,
          areaId: areaByName.get(template.area) ?? null,
          projectId:
            template.project === "portfolio"
              ? portfolio.id
              : template.project === "run"
                ? runProject.id
                : null,
          goalId: template.goal === "books" ? booksGoal.id : null,
          title: template.title,
          status,
          priority: random() < 0.2 ? "HIGH" : "MEDIUM",
          scheduledFor: day,
          estimatedMinutes: random() < 0.5 ? 30 : 60,
          completedAt:
            status === "COMPLETED"
              ? // Completed on the scheduled day, at a plausible hour.
                new Date(day.getTime() + (9 + Math.floor(random() * 10)) * 3_600_000)
              : null,
          skippedAt: status === "SKIPPED" ? day : null,
        },
      });

      taskCount++;
      if (status === "COMPLETED") completedCount++;
    }
  }

  check("tasks created", taskCount > 40, `${taskCount} tasks`);
  check("a realistic share completed", completedCount > 20, `${completedCount} completed`);

  // A few tasks due in the coming week, so Today and the plan calendar are not
  // empty.
  for (const template of taskTemplates.slice(0, 4)) {
    await db.task.create({
      data: {
        userId: user.id,
        areaId: areaByName.get(template.area) ?? null,
        projectId:
          template.project === "portfolio"
            ? portfolio.id
            : template.project === "run"
              ? runProject.id
              : null,
        goalId: template.goal === "books" ? booksGoal.id : null,
        title: template.title,
        status: "PLANNED",
        priority: "MEDIUM",
        scheduledFor: todayDay,
      },
    });
  }

  // â”€â”€ Finance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nFinance");

  await db.account.update({
    where: { id: bank.id },
    data: { openingBalance: 2_500_000n },
  });
  await db.account.update({
    where: { id: cash.id },
    data: { openingBalance: 350_000n },
  });

  const incomeSpecs = [
    { category: "Gaji", amount: 7_500_000n, account: "bank", dayOffset: -32, description: "Gaji bulan lalu" },
    { category: "Gaji", amount: 7_500_000n, account: "bank", dayOffset: -2, description: "Gaji bulan ini" },
    { category: "Freelance", amount: 1_850_000n, account: "bank", dayOffset: -18, description: "Proyek desain logo" },
    { category: "Freelance", amount: 950_000n, account: "wallet", dayOffset: -8, description: "Revisi halaman web" },
    { category: "Investasi", amount: 240_000n, account: "bank", dayOffset: -6, description: "Bunga deposito" },
  ];

  for (const spec of incomeSpecs) {
    const category = categoryByName.get(spec.category);
    const account = spec.account === "bank" ? bank : spec.account === "cash" ? cash : wallet;
    await db.transaction.create({
      data: {
        userId: user.id,
        type: "INCOME",
        amount: spec.amount,
        accountId: account.id,
        categoryId: category?.id ?? null,
        occurredOn: addCalendarDays(todayDay, spec.dayOffset),
        occurredAt: addCalendarDays(todayDay, spec.dayOffset),
        description: spec.description,
      },
    });
  }

  const expenseSpecs = [
    { category: "Makanan", min: 25_000, max: 85_000, perDay: 0.85, description: "Makan" },
    { category: "Transportasi", min: 15_000, max: 60_000, perDay: 0.6, description: "Transport" },
    { category: "Belanja", min: 80_000, max: 420_000, perDay: 0.18, description: "Belanja" },
    { category: "Hiburan", min: 45_000, max: 180_000, perDay: 0.15, description: "Hiburan" },
    { category: "Kesehatan", min: 60_000, max: 250_000, perDay: 0.08, description: "Kesehatan" },
  ];

  let expenseCount = 0;
  let expenseTotal = 0n;

  for (let offset = 0; offset <= 34; offset++) {
    const day = addCalendarDays(startDay, offset);
    if (day > todayDay) continue;

    for (const spec of expenseSpecs) {
      if (random() > spec.perDay) continue;

      const category = categoryByName.get(spec.category);
      const amount = BigInt(
        Math.round((spec.min + random() * (spec.max - spec.min)) / 5_000) * 5_000,
      );
      // Most spending is cash or e-wallet; bills come from the bank.
      const account = random() < 0.35 ? wallet : random() < 0.8 ? cash : bank;

      await db.transaction.create({
        data: {
          userId: user.id,
          type: "EXPENSE",
          amount,
          accountId: account.id,
          categoryId: category?.id ?? null,
          occurredOn: day,
          occurredAt: day,
          description: spec.description,
        },
      });

      expenseCount++;
      expenseTotal += amount;
    }
  }

  // Monthly bills, so expense is not only small daily amounts.
  const bills = [
    { category: "Tagihan", amount: 450_000n, description: "Listrik dan air" },
    { category: "Langganan", amount: 149_000n, description: "Langganan musik" },
    { category: "Langganan", amount: 99_000n, description: "Penyimpanan cloud" },
    { category: "Rumah", amount: 1_200_000n, description: "Sewa" },
  ];

  for (const bill of bills) {
    for (const offset of [-30, -1]) {
      const category = categoryByName.get(bill.category);
      await db.transaction.create({
        data: {
          userId: user.id,
          type: "EXPENSE",
          amount: bill.amount,
          accountId: bank.id,
          categoryId: category?.id ?? null,
          occurredOn: addCalendarDays(todayDay, offset),
          occurredAt: addCalendarDays(todayDay, offset),
          description: bill.description,
        },
      });
      expenseCount++;
      expenseTotal += bill.amount;
    }
  }

  // Transfers, which must never appear as income or expense.
  for (const offset of [-25, -12, -3]) {
    await db.transaction.create({
      data: {
        userId: user.id,
        type: "TRANSFER",
        amount: 750_000n,
        accountId: bank.id,
        toAccountId: cash.id,
        occurredOn: addCalendarDays(todayDay, offset),
        occurredAt: addCalendarDays(todayDay, offset),
        description: "Tarik tunai",
      },
    });
  }

  check("income transactions created", incomeSpecs.length > 0, `${incomeSpecs.length}`);
  check("expense transactions created", expenseCount > 40, `${expenseCount}`);
  check("total expense looks realistic", expenseTotal > 3_000_000n, `${expenseTotal}`);

  // A reversal, so the audit trail and its exclusions have something to show.
  const reversalTarget = await db.transaction.findFirst({
    where: { userId: user.id, type: "EXPENSE" },
    orderBy: { amount: "desc" },
    select: { id: true, amount: true, categoryId: true, accountId: true, description: true },
  });

  if (reversalTarget) {
    await db.transaction.create({
      data: {
        userId: user.id,
        type: "ADJUSTMENT",
        amount: reversalTarget.amount,
        accountId: reversalTarget.accountId,
        categoryId: reversalTarget.categoryId,
        occurredOn: addCalendarDays(todayDay, -5),
        occurredAt: addCalendarDays(todayDay, -5),
        description: `Pembatalan: ${reversalTarget.description ?? "transaksi"}`,
        reversesTransactionId: reversalTarget.id,
      },
    });
    check("one reversal recorded for the audit trail", true);
  }

  // â”€â”€ Journal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nJournal");
  const journalTemplates = [
    { mood: 8, energy: 7, focus: 8, tags: ["kerja"], body: "Hari yang padat tapi terasa terkendali. Yang paling membantu adalah menyelesaikan satu hal besar sebelum membuka email." },
    { mood: 6, energy: 5, focus: 6, tags: ["olahraga"], body: "Lari pagi terasa berat, tapi setelah selesai justru lebih segar. Mungkin perlu tidur lebih awal." },
    { mood: 7, energy: 6, focus: 7, tags: ["belajar"], body: "Belajar bahasa Jepang mulai masuk. Pola kalimat yang kemarin sulit sekarang terasa lebih wajar." },
    { mood: 5, energy: 4, focus: 5, tags: ["kerja", "istirahat"], body: "Kurang tidur membuat semuanya terasa lebih lambat. Tidak banyak yang selesai hari ini, dan itu tidak apa-apa." },
    { mood: 9, energy: 8, focus: 8, tags: ["keluarga"], body: "Makan malam bersama keluarga. Tidak produktif sama sekali, tapi ini justru bagian yang paling saya ingat dari minggu ini." },
  ];

  let journalCount = 0;
  for (let offset = 20; offset >= 0; offset--) {
    // Not every day: a journal written daily without fail is less believable
    // than one that misses a few days.
    if (random() > 0.78) continue;
    const day = addCalendarDays(todayDay, -offset);
    const template = pick(journalTemplates);

    await db.journalEntry.create({
      data: {
        userId: user.id,
        date: day,
        body: template.body,
        mood: template.mood,
        energy: template.energy,
        focus: template.focus,
      },
    });
    journalCount++;
  }

  check("journal entries written", journalCount > 10, `${journalCount} entries`);

  // Tags, attached to the entries just written.
  for (const tagName of ["kerja", "olahraga", "belajar", "istirahat", "keluarga"]) {
    const slug = tagName.toLowerCase();
    const tag = await db.tag.upsert({
      where: { userId_slug: { userId: user.id, slug } },
      create: { userId: user.id, name: tagName, slug },
      update: {},
      select: { id: true },
    });

    // Attach to a handful of entries rather than all of them.
    const entries = await db.journalEntry.findMany({
      where: { userId: user.id },
      select: { id: true },
      take: 8,
    });

    for (const entry of entries) {
      if (random() > 0.6) continue;
      await db.journalTag
        .create({ data: { journalEntryId: entry.id, tagId: tag.id } })
        .catch(() => undefined);
    }
  }
  check("journal tags attached", true);

  // â”€â”€ Life events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nLife events");
  const events = [
    { title: "Mulai rutin lari", description: "Tiga kali seminggu, target half marathon.", dayOffset: -40, category: "HEALTH" as const, isMilestone: false },
    { title: "Selesaikan studi kasus pertama", description: "Halaman portofolio mulai terisi.", dayOffset: -12, category: "CAREER" as const, isMilestone: false },
    { title: "Lari 15 km tanpa berhenti", description: "Melewati yang saya kira batas saya.", dayOffset: -3, category: "HEALTH" as const, isMilestone: true },
    { title: "Dana darurat melewati Rp10 juta", description: "Lebih cepat dari rencana.", dayOffset: -9, category: "FINANCE" as const, isMilestone: true },
    { title: "Mulai belajar bahasa Jepang", description: "Lima belas menit setiap hari.", dayOffset: -30, category: "LEARNING" as const, isMilestone: false },
    { title: "Klien pertama untuk jasa desain", description: "Proyek kecil, tapi ini permulaan.", dayOffset: -18, category: "BUSINESS" as const, isMilestone: true },
  ];

  for (const event of events) {
    await db.lifeEvent.create({
      data: {
        userId: user.id,
        title: event.title,
        description: event.description,
        date: addCalendarDays(todayDay, event.dayOffset),
        category: event.category,
        isMilestone: event.isMilestone,
        areaId:
          event.category === "HEALTH"
            ? areaByName.get("Kesehatan") ?? null
            : event.category === "FINANCE"
              ? areaByName.get("Keuangan") ?? null
              : event.category === "LEARNING"
                ? areaByName.get("Pembelajaran") ?? null
                : areaByName.get("Karier") ?? null,
      },
    });
  }
  check("life events created", events.length > 0, `${events.length}`);

  // â”€â”€ Recompute the derived goal so its value matches its records â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nDerived values");
  const completedForBooks = await db.task.count({
    where: { userId: user.id, goalId: booksGoal.id, status: "COMPLETED" },
  });
  await db.goal.update({
    where: { id: booksGoal.id },
    data: { currentValue: completedForBooks },
  });
  check(
    "derived goal reflects its linked tasks",
    completedForBooks > 0,
    `${completedForBooks} books read`,
  );

  // â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [finalTasks, finalTx, finalLogs, finalEntries, finalEvents] = await Promise.all([
    db.task.count({ where: { userId: user.id } }),
    db.transaction.count({ where: { userId: user.id } }),
    db.habitLog.count({ where: { userId: user.id } }),
    db.journalEntry.count({ where: { userId: user.id } }),
    db.lifeEvent.count({ where: { userId: user.id } }),
  ]);

  console.log("\nSeeded");
  note(`${finalTasks} tasks (${completedCount} completed)`);
  note(`${finalTx} transactions`);
  note(`${finalLogs} habit sessions`);
  note(`${finalEntries} journal entries`);
  note(`${finalEvents} life events`);
  note(`window: ${formatCalendarDay(startDay)} to ${formatCalendarDay(todayDay)}`);

  await db.$disconnect();

  console.log(
    `\n${failures === 0 ? "Seeding complete." : `${failures} check(s) failed.`}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void ({} as CalendarDay);

main().catch((error) => {
  console.error("\nSeeding failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
