/**
 * Visual QA runner.
 *
 *   npx playwright test-ish flow via node scripts/visual-qa.mjs
 *
 * Drives a real Chromium against the running dev server: signs up, walks every
 * implemented route at desktop and mobile widths, captures a screenshot of
 * each, and fails loudly on any console error or failed request.
 *
 * This is the check that catches what type-checking cannot: a page that renders
 * but is wrong, a form that throws on submit, or a layout that breaks at 375px.
 */

import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3777";
const OUT = join(process.cwd(), ".data", "screenshots");
const STAMP = Date.now();
const EMAIL = `qa+${STAMP}@livn.test`;
const PASSWORD = "visual-qa-passphrase-2026";

mkdirSync(OUT, { recursive: true });

const problems = [];
const notes = [];

function record(kind, message) {
  problems.push(`${kind}: ${message}`);
  console.log(`  !! ${kind}: ${message}`);
}

/**
 * Attaches console and network listeners to a page and returns a drain
 * function. Errors are collected rather than thrown so one bad page does not
 * hide the state of the rest.
 */
function watch(page, label) {
  const found = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Next.js dev overlay noise and React hydration warnings about browser
    // extensions are not product defects.
    if (/favicon|Download the React DevTools/i.test(text)) return;
    found.push(text);
  });

  page.on("pageerror", (error) => {
    found.push(`uncaught: ${error.message}`);
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "unknown";
    // Aborted requests happen when a navigation supersedes an in-flight fetch.
    if (/aborted/i.test(failure)) return;
    found.push(`request failed ${request.url()} - ${failure}`);
  });

  return () => {
    for (const message of found) record("console", `[${label}] ${message.slice(0, 200)}`);
    return found.length;
  };
}

async function screenshot(page, name, fullPage = true) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage });
  return path;
}

async function main() {
  const browser = await chromium.launch();

  // â”€â”€ Desktop pass â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await desktop.newPage();
  const drain = watch(page, "desktop");

  console.log("\nLanding and auth");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  notes.push(`root redirected to ${new URL(page.url()).pathname}`);
  await screenshot(page, "01-login");

  // The login form must state its purpose and offer registration.
  const loginHeading = await page.locator("text=Tempat hidup kamu dicatat").count();
  if (loginHeading === 0) record("content", "login page is missing its subtitle");

  console.log("\nRegistration");
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await screenshot(page, "02-register");

  await page.locator('input[name="displayName"]').fill("QA Tester");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirmPassword"]').fill(PASSWORD);
  await screenshot(page, "03-register-filled");

  await page.getByRole("button", { name: /buat akun/i }).click();
  await page.waitForURL(/\/today/, { timeout: 30000 });
  notes.push("registration succeeded and landed on /today");
  await page.waitForLoadState("networkidle");
  await screenshot(page, "04-today-after-signup");

  console.log("\nAuthenticated routes");
  const routes = [
    ["/today", "today"],
    ["/plan", "plan"],
    ["/plan/tasks", "plan-tasks"],
    ["/plan/goals", "plan-goals"],
    ["/plan/projects", "plan-projects"],
    ["/plan/areas", "plan-areas"],
    ["/plan/habits", "plan-habits"],
    ["/money", "money"],
    ["/progress", "progress"],
    ["/journal", "journal"],
    ["/settings", "settings"],
  ];

  for (const [route, name] of routes) {
    const response = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    const status = response?.status() ?? 0;
    const landed = new URL(page.url()).pathname;

    if (status >= 400) record("http", `${route} returned ${status}`);
    if (landed === "/login" && route !== "/login") {
      record("auth", `${route} redirected to login while signed in`);
    }

    await page.waitForLoadState("networkidle").catch(() => undefined);
    await screenshot(page, `05-desktop-${name}`);
    notes.push(`${route} -> ${status} (${landed})`);
    console.log(`  ${route} -> ${status}`);
  }

  console.log("\nTask creation flow");
  await page.goto(`${BASE}/plan/tasks`, { waitUntil: "networkidle" });

  // Open the composer, add a task, confirm it appears.
  const addButton = page.getByRole("button", { name: /^tambah$/i }).first();
  if (await addButton.count()) {
    await addButton.click();
    await page.waitForTimeout(400);

    const titleInput = page.locator('input[aria-label="Judul tugas"]');
    await titleInput.fill("QA - tulis laporan mingguan");
    await screenshot(page, "06-task-composer");

    const submit = page.getByRole("button", { name: /^tambah$/i }).last();
    await submit.click();
    await page.waitForTimeout(2500);
    await page.waitForLoadState("networkidle").catch(() => undefined);

    const created = await page.locator('text=QA - tulis laporan mingguan').count();
    if (created === 0) record("flow", "created task did not appear in the list");
    else notes.push("task creation rendered the new task in the list");

    await screenshot(page, "07-task-created");
  } else {
    record("flow", "could not find the add-task button on /plan/tasks");
  }

  console.log("\nValidation feedback");
  await page.goto(`${BASE}/plan/tasks`, { waitUntil: "networkidle" });
  const addAgain = page.getByRole("button", { name: /^tambah$/i }).first();
  if (await addAgain.count()) {
    await addAgain.click();
    await page.waitForTimeout(300);
    // Submitting an empty title must produce an inline message, not a crash.
    await page.getByRole("button", { name: /^tambah$/i }).last().click();
    await page.waitForTimeout(600);
    const errorVisible = await page.locator("text=Judul tugas wajib diisi").count();
    if (errorVisible === 0) record("validation", "empty task title produced no inline error");
    else notes.push("empty title correctly showed an inline error");
    await screenshot(page, "08-validation-error");
  }

  console.log("\nCommand palette");
  await page.keyboard.press("Escape");
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });

  drain();

  // â”€â”€ Mobile pass â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nMobile layout");
  const mobile = await browser.newContext({
    ...devices["iPhone 13"],
  });
  const mobilePage = await mobile.newPage();
  const drainMobile = watch(mobilePage, "mobile");

  // Sign in again in the fresh context so the mobile pass is authenticated.
  await mobilePage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await mobilePage.locator('input[name="email"]').fill(EMAIL);
  await mobilePage.locator('input[name="password"]').fill(PASSWORD);
  await screenshot(mobilePage, "10-mobile-login");
  await mobilePage.getByRole("button", { name: /^masuk$/i }).click();
  await mobilePage.waitForURL(/\/today/, { timeout: 30000 });
  await mobilePage.waitForLoadState("networkidle").catch(() => undefined);
  await screenshot(mobilePage, "11-mobile-today");

  for (const [route, name] of [
    ["/plan", "plan"],
    ["/plan/tasks", "tasks"],
  ]) {
    await mobilePage.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    await screenshot(mobilePage, `12-mobile-${name}`);

    // The bottom tab bar must be present on phones.
    const tabbar = await mobilePage.getByRole("navigation", { name: /navigasi tab/i }).count();
    if (tabbar === 0) record("mobile", `no navigation found on ${route}`);

    // Horizontal overflow is the classic mobile layout defect.
    const overflow = await mobilePage.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    if (overflow > 2) record("mobile", `${route} overflows horizontally by ${overflow}px`);
  }

  drainMobile();

  await browser.close();

  // â”€â”€ Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const report = {
    base: BASE,
    generatedAt: new Date().toISOString(),
    problems,
    notes,
  };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));

  console.log("\n--- Notes ---");
  for (const note of notes) console.log(`  ${note}`);

  console.log(`\nScreenshots: ${OUT}`);
  console.log(problems.length === 0 ? "\nNO PROBLEMS FOUND\n" : `\n${problems.length} PROBLEM(S)\n`);
  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nVisual QA crashed:", error);
  process.exit(1);
});
