/**
 * Targeted route check.
 *
 *   node scripts/check-routes.mjs /journal /journal/timeline
 *
 * Signs in once, then visits each route with a generous timeout and reports the
 * status, any console error, and whether the page rendered real content. Used
 * while iterating on a single screen, where the full visual suite is overkill
 * and its first-compile timing can produce misleading aborts.
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3777";
const OUT = join(process.cwd(), ".data", "screenshots");
const routes = process.argv.slice(2);

if (routes.length === 0) {
  console.error("usage: node scripts/check-routes.mjs /route [/route...]");
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });

const STAMP = Date.now();
const EMAIL = `routes+${STAMP}@livn.test`;
const PASSWORD = "route-check-passphrase-2026";

let problems = 0;

async function main() {
  const browser = await chromium.launch();

  // Register a throwaway account so the routes have a session.
  const setup = await browser.newContext();
  const page = await setup.newPage();

  await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.locator('input[name="displayName"]').fill("Route Check");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirmPassword"]').fill(PASSWORD);
  await page.getByRole("button", { name: /buat akun/i }).click();
  await page.waitForURL(/\/today/, { timeout: 90000 });
  console.log("signed in\n");

  for (const route of routes) {
    const errors = [];
    const onError = (msg) => {
      if (msg.type() === "error" && !/favicon|DevTools|404 \(Not Found\)/i.test(msg.text())) {
        errors.push(msg.text());
      }
    };
    const onPageError = (error) => errors.push(`uncaught: ${error.message}`);

    page.on("console", onError);
    page.on("pageerror", onPageError);

    let status = 0;
    try {
      // `load` rather than `networkidle`: a page with a long-poll or a dev
      // websocket never reaches networkidle, and that is not a page defect.
      const response = await page.goto(`${BASE}${route}`, {
        waitUntil: "load",
        timeout: 90000,
      });
      status = response?.status() ?? 0;
    } catch (error) {
      problems++;
      console.log(`FAIL ${route} - navigation error: ${error.message.split("\n")[0]}`);
      page.off("console", onError);
      page.off("pageerror", onPageError);
      continue;
    }

    await page.waitForTimeout(1200);

    const info = await page.evaluate(() => ({
      title: document.title,
      h1: document.querySelector("h1")?.textContent?.trim() ?? null,
      mainText: (document.querySelector("#main")?.textContent ?? "").trim().length,
      // `nextjs-portal` is always present in dev: it hosts the devtools
      // indicator, not only errors. The element's *text* is what distinguishes
      // a real failure, so that is what gets checked.
      hasErrorOverlay: (() => {
        const portal = document.querySelector("nextjs-portal");
        if (portal?.shadowRoot) {
          const text = portal.shadowRoot.textContent ?? "";
          if (/Unhandled Runtime Error|Failed to compile|Build Error|Application error/i.test(text)) {
            return true;
          }
        }
        return /Application error|Unhandled Runtime Error/i.test(document.body.textContent ?? "");
      })(),
    }));

    const landed = new URL(page.url()).pathname;
    const problemsHere = [];

    if (status >= 400) problemsHere.push(`status ${status}`);
    if (info.hasErrorOverlay) problemsHere.push("error overlay present");
    if (landed === "/login" && route !== "/login") problemsHere.push("redirected to login");
    if (info.mainText < 40) problemsHere.push(`almost no content (${info.mainText} chars)`);
    for (const error of errors) problemsHere.push(`console: ${error.slice(0, 140)}`);

    const name = route.replace(/^\//, "").replace(/\//g, "-") || "root";
    await page.screenshot({ path: join(OUT, `30-check-${name}.png`), fullPage: true });

    if (problemsHere.length === 0) {
      console.log(`OK   ${route} - ${status}, h1="${info.h1}", ${info.mainText} chars`);
    } else {
      problems += problemsHere.length;
      console.log(`FAIL ${route}`);
      for (const problem of problemsHere) console.log(`       ${problem}`);
    }

    page.off("console", onError);
    page.off("pageerror", onPageError);
  }

  await browser.close();

  // Clean up the throwaway account.
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("../src/generated/prisma/client.ts").catch(() => ({}));
  if (PrismaClient) {
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await db.user.deleteMany({ where: { email: EMAIL } });
    await db.$disconnect();
  }

  console.log(problems === 0 ? "\nAll routes OK\n" : `\n${problems} problem(s)\n`);
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
