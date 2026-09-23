/**
 * Plan domain verification against the real database.
 *
 *   npx tsx scripts/verify-plan.ts
 *
 * Exercises the whole plan hierarchy and, most importantly, the *derived*
 * calculations: that a project's percentage comes from its milestones rather
 * than double-counting tasks, and that a derived goal's value follows the
 * records it is linked to.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { registerUser } from "../src/domains/auth/service";
import * as areas from "../src/domains/plan/areas";
import * as goals from "../src/domains/plan/goals";
import * as projects from "../src/domains/plan/projects";
import * as tasks from "../src/domains/plan/tasks";
import { today, parseCalendarDay, addCalendarDays } from "../src/lib/date";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` - ${detail}` : ""}`);
}

async function expectRejection(label: string, fn: () => Promise<unknown>, fragment?: string) {
  try {
    await fn();
    check(label, false, "expected a rejection but it succeeded");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Validation failures surface a generic top-level message with the
    // specifics in `fieldErrors`, so both places are searched before failing.
    const fieldErrors =
      typeof error === "object" && error !== null && "fieldErrors" in error
        ? JSON.stringify((error as { fieldErrors?: unknown }).fieldErrors ?? {})
        : "";
    const haystack = `${message} ${fieldErrors}`;
    if (fragment) check(label, haystack.includes(fragment), message.slice(0, 60));
    else check(label, true, message.slice(0, 60));
  }
}

const TZ = "Asia/Jakarta";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const email = `plan-verify+${Date.now()}@livn.test`;
  const password = "verification-passphrase-2026";
  const user = await registerUser({ displayName: "Plan Verify", email, password, confirmPassword: password });
  const userId = user.id;

  try {
    console.log("\nAreas");
    const areaList = await areas.listAreas(userId);
    check("default areas seeded", areaList.length === 6, `${areaList.length}`);
    const health = areaList.find((a) => a.name === "Kesehatan")!;
    const learning = await areas.createArea(userId, { name: "Bahasa", colorToken: "info" });
    check("custom area created", Boolean(learning.id));
    await expectRejection("duplicate area name rejected", () => areas.createArea(userId, { name: "Bahasa" }), "sudah ada");

    console.log("\nGoals");
    // A target before the start date can never be met, so it must be refused.
    await expectRejection(
      "goal with target before start is rejected",
      () => goals.createGoal(userId, {
        title: "Bad dates", goalType: "NUMERIC", targetValue: 10,
        startDate: "2026-06-01", targetDate: "2026-05-01",
      }),
      "tidak boleh sebelum",
    );
    await expectRejection(
      "numeric goal without a target is rejected",
      () => goals.createGoal(userId, { title: "No target", goalType: "NUMERIC" }),
      "Target harus lebih dari 0",
    );

    const manualGoal = await goals.createGoal(userId, {
      title: "Tabungan darurat", goalType: "CURRENCY", targetValue: 20_000_000,
      currentValue: 8_000_000, unit: "IDR", areaId: health.id,
      startDate: "2026-01-01", targetDate: "2026-12-31",
    });
    check("manual goal created", Boolean(manualGoal.id));

    // Binary goals legitimately have no target.
    const binaryGoal = await goals.createGoal(userId, {
      title: "Punya bisnis", goalType: "BINARY", areaId: health.id, status: "ACTIVE",
    });
    check("binary goal without target accepted", binaryGoal.targetValue === null);

    console.log("\nGoal progress (manual)");
    let progress = await goals.getGoalProgress(userId, manualGoal.id, TZ);
    check("current value read", progress.current === 8_000_000, `${progress.current}`);
    check("target read", progress.target === 20_000_000);
    check("ratio is 0.4", progress.ratio === 0.4, `${progress.ratio}`);
    check("percentage is 40", progress.percentage === 40, `${progress.percentage}`);
    check("not complete", !progress.isComplete);
    check("days remaining computed", progress.daysRemaining !== null, `${progress.daysRemaining}`);
    check("required per day computed", progress.requiredPerDay !== null, `${progress.requiredPerDay}`);
    check("velocity computed", progress.velocityPerDay !== null, `${progress.velocityPerDay}`);

    console.log("\nDerived goal follows its records");
    const derivedGoal = await goals.createGoal(userId, {
      title: "Selesaikan 3 tugas", goalType: "COUNT", targetValue: 3,
      startDate: "2026-01-01", targetDate: "2026-12-31",
    });
    // Switch it to derived: the service exposes this through the schema only
    // for internal callers, so the row is flipped directly here.
    await db.goal.update({
      where: { id: derivedGoal.id },
      data: { isDerived: true, derivationKey: "task.completed.count" },
    });

    progress = await goals.getGoalProgress(userId, derivedGoal.id, TZ);
    check("derived goal starts at 0 with no completed tasks", progress.current === 0, `${progress.current}`);

    await expectRejection(
      "manual write to a derived goal is refused",
      () => goals.updateGoal(userId, derivedGoal.id, { currentValue: 99 }),
      "dihitung otomatis",
    );

    // Tasks must be linked to the goal for the derivation to count them.
    // Without this link the derived value is correctly 0 â€” the test asserting
    // otherwise would be testing a behaviour the product does not have.
    const linkedTask = await tasks.createTask(userId, {
      title: "Tugas terhubung ke tujuan",
      goalId: derivedGoal.id,
    });
    await tasks.toggleTaskCompletion(userId, linkedTask.id);
    const derivedAfterLink = await goals.getGoalProgress(userId, derivedGoal.id, TZ);
    check("derived goal counts only tasks linked to it", derivedAfterLink.current === 1, `${derivedAfterLink.current}`);
    check("derived goal reaches 33.3% of 3", derivedAfterLink.percentage === 33.3, `${derivedAfterLink.percentage}%`);

    console.log("\nProjects, milestones and derived percentage");
    const project = await projects.createProject(userId, {
      title: "Belajar TypeScript", status: "ACTIVE", areaId: learning.id,
      startDate: "2026-09-01", targetDate: "2026-12-01",
    });
    check("project created", Boolean(project.id));

    const m1 = await projects.createMilestone(userId, { projectId: project.id, title: "Dasar" });
    const m2 = await projects.createMilestone(userId, { projectId: project.id, title: "Menengah" });
    const m3 = await projects.createMilestone(userId, { projectId: project.id, title: "Mahir" });
    check("three milestones created", Boolean(m1.id && m2.id && m3.id));

    // Two tasks under one milestone, both complete. If the percentage counted
    // tasks it would read 100%; milestone-based it must read 0% until the
    // milestone itself is closed.
    const t1 = await tasks.createTask(userId, { title: "Baca bab 1", projectId: project.id, milestoneId: m1.id });
    const t2 = await tasks.createTask(userId, { title: "Baca bab 2", projectId: project.id, milestoneId: m1.id });
    await tasks.toggleTaskCompletion(userId, t1.id);
    await tasks.toggleTaskCompletion(userId, t2.id);

    const day = today(TZ);
    const tomorrow = addCalendarDays(day, 1);
    let projectProgress = await projects.computeProjectProgress(
      userId,
      [{ id: project.id, targetDate: project.targetDate, status: project.status }],
      day,
    );
    let pp = projectProgress.get(project.id)!;
    check("basis is milestones when milestones exist", pp.basis === "milestones", `${pp.basis}`);
    check("percentage ignores task completion", pp.percentage === 0, `${pp.percentage}%`);
    check("task counts still reported", pp.completedTasks === 2 && pp.totalTasks === 2);

    await projects.updateMilestone(userId, m1.id, { completed: true });
    projectProgress = await projects.computeProjectProgress(
      userId,
      [{ id: project.id, targetDate: project.targetDate, status: project.status }],
      day,
    );
    pp = projectProgress.get(project.id)!;
    check("one of three milestones is 33.3%", pp.percentage === 33.3, `${pp.percentage}%`);
    check("completed milestones counted", pp.completedMilestones === 1);

    await projects.updateMilestone(userId, m2.id, { completed: true });
    await projects.updateMilestone(userId, m3.id, { completed: true });
    projectProgress = await projects.computeProjectProgress(
      userId,
      [{ id: project.id, targetDate: project.targetDate, status: project.status }],
      day,
    );
    pp = projectProgress.get(project.id)!;
    check("all milestones complete is 100%", pp.percentage === 100, `${pp.percentage}%`);

    // A project with no milestones must fall back to tasks.
    const taskOnly = await projects.createProject(userId, { title: "Tanpa milestone", status: "ACTIVE" });
    const t3 = await tasks.createTask(userId, { title: "Satu", projectId: taskOnly.id });
    await tasks.createTask(userId, { title: "Dua", projectId: taskOnly.id });
    await tasks.toggleTaskCompletion(userId, t3.id);
    let taskOnlyProgress = await projects.computeProjectProgress(
      userId,
      [{ id: taskOnly.id, targetDate: null, status: taskOnly.status }],
      day,
    );
    let tp = taskOnlyProgress.get(taskOnly.id)!;
    check("basis falls back to tasks", tp.basis === "tasks", `${tp.basis}`);
    check("one of two tasks is 50%", tp.percentage === 50, `${tp.percentage}%`);

    console.log("\nDerived goal now reflects completed tasks");
    // A second completed task linked to the goal brings it to 2 of 3.
    const linked2 = await tasks.createTask(userId, { title: "Tugas kedua", goalId: derivedGoal.id });
    await tasks.toggleTaskCompletion(userId, linked2.id);
    const updated = await goals.refreshDerivedGoals(userId, TZ);
    check("refreshDerivedGoals reported changes", updated >= 1, `${updated} updated`);
    progress = await goals.getGoalProgress(userId, derivedGoal.id, TZ);
    check("derived goal counted 2 linked completed tasks", progress.current === 2, `${progress.current}`);
    check("derived goal not yet complete", !progress.isComplete, `${progress.current}/3`);

    const linked3 = await tasks.createTask(userId, { title: "Tugas ketiga", goalId: derivedGoal.id });
    await tasks.toggleTaskCompletion(userId, linked3.id);
    await goals.refreshDerivedGoals(userId, TZ);
    progress = await goals.getGoalProgress(userId, derivedGoal.id, TZ);
    check("derived goal reached its target", progress.current === 3 && progress.isComplete, `${progress.current}/3`);
    const refreshed = await db.goal.findUnique({ where: { id: derivedGoal.id }, select: { status: true } });
    check("derived goal auto-achieved", refreshed?.status === "ACHIEVED", `${refreshed?.status}`);

    // A task that is not linked to the goal must not inflate it.
    const unlinked = await tasks.createTask(userId, { title: "Tidak terhubung" });
    await tasks.toggleTaskCompletion(userId, unlinked.id);
    progress = await goals.getGoalProgress(userId, derivedGoal.id, TZ);
    check("unlinked tasks do not affect the goal", progress.current === 3, `${progress.current}`);

    console.log("\nTask completion is idempotent");
    const t4 = await tasks.createTask(userId, { title: "Idempotent" });
    const first = await tasks.toggleTaskCompletion(userId, t4.id);
    const stamp = first.completedAt!.getTime();
    const second = await tasks.toggleTaskCompletion(userId, t4.id);
    check("toggling to complete stamps the time", first.status === "COMPLETED");
    check("toggling back clears completion", second.status === "PLANNED" && second.completedAt === null);
    const third = await tasks.toggleTaskCompletion(userId, t4.id);
    check("re-completing stamps a fresh time", third.status === "COMPLETED" && third.completedAt!.getTime() >= stamp);
    const freshTask = await tasks.createTask(userId, { title: "Jadwalkan besok" });
    const scheduled = await tasks.scheduleTask(userId, freshTask.id, tomorrow);
    check("task moved to tomorrow", scheduled.scheduledFor?.getTime() === tomorrow.getTime());
    const dayTasks = await tasks.getTasksForDay(userId, tomorrow);
    check("task appears in that day's list", dayTasks.scheduled.some((t) => t.id === freshTask.id));

    console.log("\nTask validation");
    await expectRejection("empty title rejected", () => tasks.createTask(userId, { title: "   " }), "wajib diisi");
    await expectRejection(
      "estimate above one day rejected",
      () => tasks.createTask(userId, { title: "Too long", estimatedMinutes: 5000 }),
      "maksimal 1440",
    );
    await expectRejection(
      "invalid calendar date rejected",
      () => tasks.createTask(userId, { title: "Bad date", scheduledFor: "2026-02-31" }),
      "tidak ada di kalender",
    );

    // The same guard must cover goals and projects, not just tasks.
    await expectRejection(
      "invalid goal target date rejected",
      () => goals.createGoal(userId, { title: "Bad", goalType: "BINARY", targetDate: "2026-02-31" }),
      "tidak ada di kalender",
    );
    await expectRejection(
      "invalid project start date rejected",
      () => projects.createProject(userId, { title: "Bad", startDate: "2026-11-31" }),
      "tidak ada di kalender",
    );
    // A real leap day must still be accepted.
    const leap = await tasks.createTask(userId, { title: "Leap day", scheduledFor: "2028-02-29" });
    check("valid leap day accepted", leap.scheduledFor?.toISOString().slice(0, 10) === "2028-02-29");

    console.log("\nOwnership isolation");
    const other = await registerUser({
      displayName: "Other", email: `other+${Date.now()}@livn.test`,
      password, confirmPassword: password,
    });
    await expectRejection(
      "cannot read another user's task",
      () => tasks.getTask(other.id, t1.id),
      "Tugas tidak ditemukan",
    );
    await expectRejection(
      "cannot update another user's task",
      () => tasks.updateTask(other.id, t1.id, { title: "Hijacked" }),
      "Tugas tidak ditemukan",
    );
    await expectRejection(
      "cannot link a task to another user's project",
      () => tasks.createTask(other.id, { title: "Sneaky", projectId: project.id }),
      "tidak ditemukan",
    );
    await expectRejection(
      "cannot update another user's area",
      () => areas.updateArea(other.id, health.id, { name: "Stolen" }),
      "Area tidak ditemukan",
    );

    console.log("\nReferential guards");
    // `manualGoal` has no links, so deleting it must succeed â€” the guard only
    // fires when work is attached.
    await goals.deleteGoal(userId, manualGoal.id);
    const gone = await db.goal.findUnique({ where: { id: manualGoal.id }, select: { id: true } });
    check("goal without links can be deleted", gone === null);

    const linkedGoal = await goals.createGoal(userId, { title: "Linked", goalType: "BINARY" });
    await tasks.createTask(userId, { title: "Blocker", goalId: linkedGoal.id });
    await expectRejection(
      "cannot delete a goal that has tasks",
      () => goals.deleteGoal(userId, linkedGoal.id),
      "masih terhubung",
    );
    await expectRejection(
      "cannot archive an area that still holds work",
      () => areas.archiveArea(userId, health.id),
      "masih punya",
    );
    await expectRejection(
      "cannot delete a project that still has tasks",
      () => projects.deleteProject(userId, taskOnly.id),
      "masih punya",
    );

    console.log("\nRescheduling reopens finished work");
    const reopen = await tasks.createTask(userId, { title: "Buka lagi" });
    await tasks.toggleTaskCompletion(userId, reopen.id);
    check("started as completed", (await db.task.findUniqueOrThrow({ where: { id: reopen.id } })).status === "COMPLETED");
    const moved = await tasks.scheduleTask(userId, reopen.id, tomorrow);
    check("rescheduling reopens the task", moved.status === "PLANNED", `${moved.status}`);
    check("rescheduling clears the completion stamp", moved.completedAt === null);
    const tomorrowList = await tasks.getTasksForDay(userId, tomorrow);
    check("reopened task appears on its new day", tomorrowList.scheduled.some((t) => t.id === reopen.id));

    console.log("\nDeleting a milestone keeps its tasks");
    await projects.deleteMilestone(userId, m1.id);
    const orphan = await db.task.findUnique({ where: { id: t1.id }, select: { milestoneId: true, projectId: true } });
    check("task survives its milestone", orphan !== null, orphan ? "" : "task was deleted");
    check("task's milestone link cleared", orphan?.milestoneId === null);
    check("task keeps its project link", orphan?.projectId === project.id);

    console.log("\nCleanup");
    await db.user.delete({ where: { id: other.id } });
    await db.user.delete({ where: { id: userId } });
    const remaining = await db.task.count({ where: { userId } });
    check("cascade removed all plan data", remaining === 0, `${remaining} tasks left`);

    await db.$disconnect();
    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
    process.exit(failures === 0 ? 0 : 1);
  } catch (error) {
    console.error("\nVerification crashed:", error);
    await db.user.delete({ where: { id: userId } }).catch(() => undefined);
    await db.$disconnect();
    process.exit(1);
  }
}

void parseCalendarDay;

main();
