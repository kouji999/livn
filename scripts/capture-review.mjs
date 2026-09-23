/**
 * Design review capture.
 *
 *   node scripts/capture-review.mjs
 *
 * Photographs the authenticated screens with the seeded demo data, at a size
 * where spacing, hierarchy and density decisions are actually visible. Used to
 * review the interface rather than to prove a route works.
 *
 * Full-page at 1x rather than viewport-only: a design review needs to see how a
 * page reads when scrolled, and 1x keeps text at its real rendered size instead
 * of being halved by a device-pixel ratio.
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3777";
const OUT = join(process.cwd(), ".data", "review");
const EMAIL = "demo@livn.test";
const PASSWORD = "lihat-livn-2026";

mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ["/today", "today"],
  ["/plan", "plan"],
  ["/plan/tasks", "tasks"],
  ["/plan/goals", "goals"],
  ["/money", "money"],
  ["/money/transactions", "ledger"],
  ["/progress", "progress"],
  ["/journal", "journal"],
];

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "load", timeout: 90000 });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^masuk$/i }).click();
  await page.waitForURL(/\/today/, { timeout: 90000 });
  console.log("signed in\n");

  for (const [route, name] of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 90000 });
    await page.waitForTimeout(1500);

    await page.screenshot({ path: join(OUT, `${name}-full.png`), fullPage: true });

    // Also the first screenful, which is what a person actually sees on arrival.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, `${name}-fold.png`) });

    console.log(`  ${route}`);
  }

  await browser.close();
  console.log(`\nscreenshots in ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
