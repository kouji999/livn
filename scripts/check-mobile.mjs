/**
 * Mobile chrome verification.
 *
 *   node scripts/check-mobile.mjs
 *
 * Captures the viewport (not the full page) so `position: sticky` and `fixed`
 * elements are photographed where they actually sit. Also probes for real
 * layout faults: horizontal overflow, and content that is unreachable behind
 * a bottom bar.
 */

import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3777";
const OUT = join(process.cwd(), ".data", "screenshots");
const STAMP = Date.now();
const EMAIL = `mobile+${STAMP}@livn.test`;
const PASSWORD = "mobile-check-passphrase-2026";

mkdirSync(OUT, { recursive: true });

let problems = 0;

function fail(message) {
  problems++;
  console.log(`  FAIL ${message}`);
}

async function main() {
  const browser = await chromium.launch();

  // --- Create an account so there is data to look at --------------------------
  const setup = await browser.newContext();
  const setupPage = await setup.newPage();
  await setupPage.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await setupPage.locator('input[name="displayName"]').fill("Mobile Check");
  await setupPage.locator('input[name="email"]').fill(EMAIL);
  await setupPage.locator('input[name="password"]').fill(PASSWORD);
  await setupPage.locator('input[name="confirmPassword"]').fill(PASSWORD);
  await setupPage.getByRole("button", { name: /buat akun/i }).click();
  await setupPage.waitForURL(/\/today/, { timeout: 30000 });
  await setup.close();

  // --- Phone pass -------------------------------------------------------------
  const phone = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await phone.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/favicon|DevTools/i.test(msg.text())) {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(`uncaught: ${error.message}`));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^masuk$/i }).click();
  await page.waitForURL(/\/today/, { timeout: 30000 });

  const routes = [
    ["/today", "today"],
    ["/plan", "plan"],
    ["/plan/tasks", "tasks"],
    ["/plan/goals", "goals"],
  ];

  for (const [route, name] of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });

    // Viewport capture: sticky elements are photographed in place.
    await page.screenshot({ path: join(OUT, `20-phone-${name}-viewport.png`) });

    // Horizontal overflow is the classic mobile layout fault.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    if (overflow > 2) fail(`${route} overflows horizontally by ${overflow}px`);

    // The tab bar must be visible and inside the viewport.
    const bar = page.getByRole("navigation", { name: /navigasi tab/i });
    if ((await bar.count()) === 0) {
      fail(`${route} has no bottom navigation`);
      continue;
    }

    const barBox = await bar.first().boundingBox();
    const viewport = page.viewportSize();
    if (!barBox) {
      fail(`${route} bottom navigation has no layout box`);
      continue;
    }
    if (viewport && barBox.y + barBox.height > viewport.height + 1) {
      fail(
        `${route} bottom navigation is outside the viewport (bottom at ${Math.round(barBox.y + barBox.height)}px, viewport ${viewport.height}px)`,
      );
    }

    // The last row of content must not be trapped underneath the bar: scroll to
    // the bottom and confirm the deepest element sits above it.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);
    const lastContentBottom = await page.evaluate(() => {
      const main = document.querySelector("#main");
      if (!main) return null;
      const children = Array.from(main.querySelectorAll("*"));
      let deepest = 0;
      for (const el of children) {
        const rect = el.getBoundingClientRect();
        if (rect.height > 0 && rect.bottom > deepest) deepest = rect.bottom;
      }
      return deepest;
    });

    if (lastContentBottom !== null && barBox.y < lastContentBottom - 4) {
      fail(
        `${route} bottom navigation overlaps content by ${Math.round(lastContentBottom - barBox.y)}px`,
      );
    }

    // Tap targets: navigation entries must be comfortably tappable.
    const smallTargets = await page.evaluate(() => {
      const found = [];
      const nav = document.querySelector('nav[aria-label="Navigasi tab"]');
      if (!nav) return found;
      for (const link of nav.querySelectorAll("a")) {
        const rect = link.getBoundingClientRect();
        if (rect.height < 44) {
          found.push(`${link.textContent?.trim()} (${Math.round(rect.height)}px)`);
        }
      }
      return found;
    });
    for (const target of smallTargets) {
      fail(`${route} nav tap target under 44px: ${target}`);
    }

    console.log(`  checked ${route}`);
  }

  // --- Tablet pass ------------------------------------------------------------
  const tablet = await browser.newContext({ ...devices["iPad Mini"] });
  const tabletPage = await tablet.newPage();
  await tabletPage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await tabletPage.locator('input[name="email"]').fill(EMAIL);
  await tabletPage.locator('input[name="password"]').fill(PASSWORD);
  await tabletPage.getByRole("button", { name: /^masuk$/i }).click();
  await tabletPage.waitForURL(/\/today/, { timeout: 30000 });
  await tabletPage.goto(`${BASE}/plan`, { waitUntil: "networkidle" });
  await tabletPage.screenshot({ path: join(OUT, "21-tablet-plan.png") });
  console.log("  checked tablet layout");

  for (const message of consoleErrors) {
    fail(`console error: ${message.slice(0, 160)}`);
  }

  await browser.close();

  // --- Cleanup ----------------------------------------------------------------
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("../src/generated/prisma/client.ts").catch(() => ({}));
  if (PrismaClient) {
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await db.user.deleteMany({ where: { email: EMAIL } });
    await db.$disconnect();
  }

  console.log(
    problems === 0
      ? "\nMobile chrome is clean.\n"
      : `\n${problems} problem(s) found.\n`,
  );
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
