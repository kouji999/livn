/**
 * Hydration-error check.
 *
 *   node scripts/check-hydration.mjs [route...]
 *
 * Walks the authenticated routes and fails on any React hydration mismatch or
 * invalid-HTML warning.
 *
 * These matter more than a normal console error: a mismatched tree means the
 * server and client rendered different markup, so React discards the server
 * output and re-renders everything. The page looks right afterwards, which is
 * why the defect survives a visual review — only the console shows it.
 *
 * `loading.tsx` is a common source: it streams first, so a nesting mistake there
 * only fires when a route is slow enough to render the fallback.
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3777";
const EMAIL = "demo@livn.test";
const PASSWORD = "lihat-livn-2026";

const ROUTES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "/",
      "/login",
      "/register",
      "/today",
      "/plan",
      "/plan/tasks",
      "/plan/goals",
      "/plan/projects",
      "/plan/areas",
      "/plan/habits",
      "/money",
      "/money/transactions",
      "/progress",
      "/journal",
      "/journal/timeline",
      "/settings",
    ];

/** Messages that indicate a real hydration or markup defect. */
const FATAL = [
  /hydration/i,
  /did not match/i,
  /cannot be a descendant of/i,
  /validateDOMNesting/i,
  /cannot appear as a descendant/i,
  /In HTML,/i,
];

let problems = 0;

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const collected = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    const text = msg.text();
    if (/favicon|DevTools/i.test(text)) return;
    if (FATAL.some((pattern) => pattern.test(text))) collected.push(text);
  });
  page.on("pageerror", (error) => {
    if (FATAL.some((pattern) => pattern.test(error.message))) {
      collected.push(`uncaught: ${error.message}`);
    }
  });

  // Sign in once; the public routes are re-checked at the end.
  await page.goto(`${BASE}/login`, { waitUntil: "load", timeout: 90000 });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^masuk$/i }).click();
  await page.waitForURL(/\/today/, { timeout: 90000 });
  console.log("signed in\n");

  for (const route of ROUTES) {
    const before = collected.length;

    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 90000 });
      // Give React a beat to hydrate and report a mismatch after paint.
      await page.waitForTimeout(1200);
    } catch (error) {
      problems++;
      console.log(`  FAIL ${route} - ${error.message.split("\n")[0]}`);
      continue;
    }

    const found = collected.slice(before);
    if (found.length === 0) {
      console.log(`  OK   ${route}`);
    } else {
      problems += found.length;
      console.log(`  FAIL ${route}`);
      for (const message of found) {
        console.log(`         ${message.split("\n")[0].slice(0, 160)}`);
      }
    }
  }

  await browser.close();

  console.log(
    problems === 0
      ? "\nNo hydration or markup errors.\n"
      : `\n${problems} problem(s).\n`,
  );
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
