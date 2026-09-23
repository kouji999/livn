/**
 * Read a Next.js dev error overlay.
 *
 *   node scripts/read-error.mjs /journal
 *
 * The overlay is rendered in a shadow root, so its text is invisible to a
 * normal `textContent` read. This reaches into the shadow DOM and prints the
 * message, which is the fastest way to see what actually threw.
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3777";
const route = process.argv[2];
if (!route) {
  console.error("usage: node scripts/read-error.mjs /route");
  process.exit(2);
}

const EMAIL = `err+${Date.now()}@livn.test`;
const PASSWORD = "error-read-passphrase-2026";

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const serverErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") serverErrors.push(msg.text());
  });
  page.on("pageerror", (error) => {
    serverErrors.push(`UNCAUGHT: ${error.message}\n${error.stack ?? ""}`);
  });

  await page.goto(`${BASE}/register`, { waitUntil: "load", timeout: 90000 });
  await page.locator('input[name="displayName"]').fill("Err");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirmPassword"]').fill(PASSWORD);
  await page.getByRole("button", { name: /buat akun/i }).click();
  await page.waitForURL(/\/today/, { timeout: 90000 });

  await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(2000);

  // The overlay lives inside a custom element with a shadow root.
  const overlayText = await page.evaluate(() => {
    const portal = document.querySelector("nextjs-portal");
    if (!portal) return null;
    const root = portal.shadowRoot;
    if (!root) return "(portal present but no shadow root)";

    const parts = [];
    const walk = (node) => {
      for (const child of node.querySelectorAll("*")) {
        if (child.shadowRoot) walk(child.shadowRoot);
        const text = (child.textContent ?? "").trim();
        if (text && text.length < 400) parts.push(text);
      }
    };
    walk(root);

    // Deduplicate and keep the longest strings, which carry the message.
    const unique = [...new Set(parts)].sort((a, b) => b.length - a.length);
    return unique.slice(0, 12).join("\n---\n");
  });

  console.log("=== overlay ===");
  console.log(overlayText ?? "(no overlay)");

  console.log("\n=== console / page errors ===");
  for (const error of serverErrors.slice(0, 15)) {
    console.log(error.slice(0, 1500));
    console.log("---");
  }

  await browser.close();

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("../src/generated/prisma/client.ts").catch(() => ({}));
  if (PrismaClient) {
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    await db.user.deleteMany({ where: { email: EMAIL } });
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
