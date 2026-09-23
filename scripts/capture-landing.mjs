/**
 * Capture the landing page.
 *
 *   node scripts/capture-landing.mjs
 *
 * Photographs the public page a visitor sees first, at desktop and phone
 * widths. Screenshots are taken per viewport section rather than as one tall
 * image, so the framing matches what a person actually scrolls through.
 */

import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3777";
const OUT = join(process.cwd(), "docs", "screenshots");

mkdirSync(OUT, { recursive: true });

const problems = [];

async function main() {
  const browser = await chromium.launch();

  // ── Desktop ──────────────────────────────────────────────────────────────
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const page = await desktop.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error" && !/favicon|DevTools/i.test(msg.text())) {
      problems.push(`console: ${msg.text().slice(0, 150)}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));

  console.log("\nLanding page, desktop");
  const response = await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 90000 });
  // Let the optimized images decode before the shutter.
  await page.waitForTimeout(3000);

  const status = response?.status() ?? 0;
  if (status >= 400) problems.push(`landing returned ${status}`);

  // Section by section, so each image shows a readable amount.
  await page.screenshot({ path: join(OUT, "landing-01-hero.png") });
  console.log("  OK hero");

  for (const [selector, name] of [
    ["#screens", "landing-02-screens"],
    ["#status", "landing-03-status"],
  ]) {
    const element = page.locator(selector);
    if ((await element.count()) === 0) {
      problems.push(`section ${selector} not found`);
      continue;
    }
    await element.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`  OK ${name}`);
  }

  // Check the images actually loaded rather than showing a broken icon.
  const imageState = await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll("img"));
    return images.map((img) => ({
      src: img.currentSrc || img.src,
      loaded: img.complete && img.naturalWidth > 0,
      width: img.naturalWidth,
    }));
  });

  console.log(`\n  ${imageState.length} images on the page`);
  for (const image of imageState) {
    const name = image.src.split("/").slice(-1)[0].split("?")[0];
    if (!image.loaded) {
      problems.push(`image failed to load: ${name}`);
      console.log(`  FAIL ${name} did not load`);
    } else {
      console.log(`  OK   ${name} (${image.width}px)`);
    }
  }

  await desktop.close();

  // ── Mobile ───────────────────────────────────────────────────────────────
  const mobile = await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 3 });
  const mobilePage = await mobile.newPage();

  console.log("\nLanding page, mobile");
  await mobilePage.goto(`${BASE}/`, { waitUntil: "load", timeout: 90000 });
  await mobilePage.waitForTimeout(2500);
  await mobilePage.screenshot({ path: join(OUT, "landing-m1-hero.png") });

  // Bottom of the page, where the closing action sits.
  await mobilePage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await mobilePage.waitForTimeout(900);
  await mobilePage.screenshot({ path: join(OUT, "landing-m2-end.png") });

  const overflow = await mobilePage.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (overflow > 2) problems.push(`mobile landing overflows by ${overflow}px`);
  else console.log(`  OK no horizontal overflow`);

  await mobile.close();
  await browser.close();

  console.log(`\nScreenshots in docs/screenshots/`);
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
