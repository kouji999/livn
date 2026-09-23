/**
 * Capture the showcase screenshots.
 *
 *   node scripts/capture-showcase.mjs
 *
 * Signs in as the demo account and photographs every implemented screen at
 * desktop and mobile widths. The output is what a visitor sees before they run
 * anything, so these are real renders of the real application with real seeded
 * data — not mockups.
 *
 * Also reports any console error, so a broken page cannot end up in the
 * showcase unnoticed.
 */

import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3777";
const OUT = join(process.cwd(), "docs", "screenshots");
const EMAIL = process.env.DEMO_EMAIL ?? "demo@livn.test";
const PASSWORD = process.env.DEMO_PASSWORD ?? "lihat-livn-2026";

mkdirSync(OUT, { recursive: true });

const problems = [];

/** Desktop screens, in the order a visitor should read them. */
const DESKTOP_SHOTS = [
  { route: "/today", name: "01-today", title: "Today", note: "Priority, habits, money and reflection in one view" },
  { route: "/plan", name: "02-plan", title: "Plan hub", note: "Goals and projects in flight" },
  { route: "/plan/tasks", name: "03-tasks", title: "Tasks", note: "Grouped by urgency, not by status" },
  { route: "/plan/goals", name: "04-goals", title: "Goals", note: "Derived progress with pace" },
  { route: "/plan/projects", name: "05-projects", title: "Projects", note: "Percentage from milestones, not tasks" },
  { route: "/plan/habits", name: "06-habits", title: "Habits", note: "Consistency first, streak second" },
  { route: "/money", name: "07-money", title: "Money", note: "Every balance derived from the ledger" },
  { route: "/money/transactions", name: "08-ledger", title: "Ledger", note: "Grouped by day, reversible without erasing" },
  { route: "/progress", name: "09-progress", title: "Progress", note: "Across day, week, month and year" },
  { route: "/journal", name: "10-journal", title: "Journal", note: "Mood, reflection, and optional depth" },
  { route: "/journal/timeline", name: "11-timeline", title: "Timeline", note: "Every domain in one chronology" },
  { route: "/login", name: "12-login", title: "Sign in", note: "The entry point" },
];

const MOBILE_SHOTS = [
  { route: "/today", name: "m1-today", title: "Today" },
  { route: "/plan/tasks", name: "m2-tasks", title: "Tasks" },
  { route: "/money", name: "m3-money", title: "Money" },
  { route: "/journal", name: "m4-journal", title: "Journal" },
];

async function main() {
  const browser = await chromium.launch();

  // ── Desktop ─────────────────────────────────────────────────────────────
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const page = await desktop.newPage();

  const desktopErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/favicon|DevTools/i.test(msg.text())) {
      desktopErrors.push(msg.text());
    }
  });
  page.on("pageerror", (error) => desktopErrors.push(`uncaught: ${error.message}`));

  console.log(`\nSigning in as ${EMAIL}`);
  await page.goto(`${BASE}/login`, { waitUntil: "load", timeout: 90000 });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^masuk$/i }).click();
  await page.waitForURL(/\/today/, { timeout: 90000 });
  console.log("signed in");

  const manifest = [];

  for (const shot of DESKTOP_SHOTS) {
    // The login screen is captured while signed out, at the end.
    if (shot.route === "/login") continue;

    const before = desktopErrors.length;

    try {
      const response = await page.goto(`${BASE}${shot.route}`, {
        waitUntil: "load",
        timeout: 90000,
      });
      // Let charts finish their entry transition before the shutter.
      await page.waitForTimeout(1400);

      const status = response?.status() ?? 0;
      const file = join(OUT, `${shot.name}.png`);

      // Viewport-sized rather than fullPage: a showcase image should show what
      // a person actually sees on screen, not a compressed 4000px column.
      await page.screenshot({ path: file });

      const newErrors = desktopErrors.slice(before);
      if (status >= 400) problems.push(`${shot.route} returned ${status}`);
      for (const error of newErrors) problems.push(`${shot.route}: ${error.slice(0, 150)}`);

      manifest.push({
        name: shot.name,
        route: shot.route,
        title: shot.title,
        note: shot.note,
        status,
        file: `screenshots/${shot.name}.png`,
      });

      console.log(
        `  ${status >= 400 ? "FAIL" : "OK  "} ${shot.route.padEnd(22)} -> ${shot.name}.png${newErrors.length > 0 ? ` (${newErrors.length} console errors)` : ""}`,
      );
    } catch (error) {
      problems.push(`${shot.route}: ${error.message.split("\n")[0]}`);
      console.log(`  FAIL ${shot.route} - ${error.message.split("\n")[0]}`);
    }
  }

  // Sign out and capture the login screen.
  try {
    await page.goto(`${BASE}/today`, { waitUntil: "load", timeout: 60000 });
    await desktop.clearCookies();
    await page.goto(`${BASE}/login`, { waitUntil: "load", timeout: 90000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, "12-login.png") });
    manifest.push({
      name: "12-login",
      route: "/login",
      title: "Sign in",
      note: "The entry point",
      status: 200,
      file: "screenshots/12-login.png",
    });
    console.log("  OK   /login                 -> 12-login.png");
  } catch (error) {
    problems.push(`/login capture: ${error.message.split("\n")[0]}`);
  }

  await desktop.close();

  // ── Mobile ──────────────────────────────────────────────────────────────
  console.log("\nMobile pass");
  const mobile = await browser.newContext({
    ...devices["iPhone 13"],
    deviceScaleFactor: 3,
  });
  const mobilePage = await mobile.newPage();

  const mobileErrors = [];
  mobilePage.on("console", (msg) => {
    if (msg.type() === "error" && !/favicon|DevTools/i.test(msg.text())) {
      mobileErrors.push(msg.text());
    }
  });
  mobilePage.on("pageerror", (error) => mobileErrors.push(`uncaught: ${error.message}`));

  await mobilePage.goto(`${BASE}/login`, { waitUntil: "load", timeout: 90000 });
  await mobilePage.locator('input[name="email"]').fill(EMAIL);
  await mobilePage.locator('input[name="password"]').fill(PASSWORD);
  await mobilePage.getByRole("button", { name: /^masuk$/i }).click();
  await mobilePage.waitForURL(/\/today/, { timeout: 90000 });

  for (const shot of MOBILE_SHOTS) {
    try {
      const response = await mobilePage.goto(`${BASE}${shot.route}`, {
        waitUntil: "load",
        timeout: 90000,
      });
      await mobilePage.waitForTimeout(1200);
      await mobilePage.screenshot({ path: join(OUT, `${shot.name}.png`) });

      const status = response?.status() ?? 0;
      if (status >= 400) problems.push(`mobile ${shot.route} returned ${status}`);

      manifest.push({
        name: shot.name,
        route: shot.route,
        title: `${shot.title} (mobile)`,
        note: "Mobile layout",
        status,
        file: `screenshots/${shot.name}.png`,
      });

      console.log(`  ${status >= 400 ? "FAIL" : "OK  "} ${shot.route.padEnd(22)} -> ${shot.name}.png`);
    } catch (error) {
      problems.push(`mobile ${shot.route}: ${error.message.split("\n")[0]}`);
      console.log(`  FAIL ${shot.route} - ${error.message.split("\n")[0]}`);
    }
  }

  for (const error of mobileErrors) problems.push(`mobile: ${error.slice(0, 150)}`);
  await mobile.close();
  await browser.close();

  writeFileSync(
    join(OUT, "manifest.json"),
    JSON.stringify({ base: BASE, capturedAt: new Date().toISOString(), shots: manifest, problems }, null, 2),
  );

  console.log(`\n${manifest.length} screenshots written to docs/screenshots/`);
  if (problems.length > 0) {
    console.log(`\n${problems.length} problem(s):`);
    for (const problem of problems) console.log(`  ${problem}`);
  } else {
    console.log("No problems found.");
  }

  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nCapture failed:", error);
  process.exit(1);
});
