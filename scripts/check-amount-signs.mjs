/**
 * Verify transaction amount signs on the Money overview.
 *
 *   node scripts/check-amount-signs.mjs
 *
 * The sign of a transaction's amount comes from its `type`, never from the sign
 * of the stored number — an expense is stored as a positive value. A regression
 * here shows every expense as money coming in, which is the kind of error a
 * person acts on before they notice it.
 *
 * Asserts on the rendered text and colour, not on the source.
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3777";
const EMAIL = "demo@livn.test";
const PASSWORD = "lihat-livn-2026";

let failures = 0;

function check(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` - ${detail}` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "load", timeout: 90000 });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^masuk$/i }).click();
  await page.waitForURL(/\/today/, { timeout: 90000 });

  console.log("\nMoney overview, recent transactions");
  await page.goto(`${BASE}/money`, { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(2000);

  const rows = await page.evaluate(() => {
    const out = [];
    // Each recent transaction is a link into the ledger.
    for (const link of document.querySelectorAll('a[href^="/money/transactions"]')) {
      const title = link.querySelector("p")?.textContent?.trim() ?? "";
      const amountEl = link.querySelector("span.tabular");
      if (!amountEl) continue;
      const amount = amountEl.textContent?.trim() ?? "";
      const color = getComputedStyle(amountEl).color;
      // rgb(47, 111, 91) is --color-positive, rgb(168, 68, 58) is --color-negative.
      const isPositiveColour = color.includes("47, 111, 91");
      const isNegativeColour = color.includes("168, 68, 58");
      out.push({ title, amount, color, isPositiveColour, isNegativeColour });
    }
    return out.slice(0, 12);
  });

  if (rows.length === 0) {
    check("found recent transactions to inspect", false, "no rows matched");
  } else {
    console.log(`  found ${rows.length} rows\n`);
    for (const row of rows) {
      const sign = row.amount.startsWith("+") ? "+" : row.amount.startsWith("-") ? "-" : "?";
      console.log(
        `    ${sign} ${row.amount.padEnd(16)} ${row.title.slice(0, 30).padEnd(30)} ${row.color}`,
      );
    }

    console.log("");
    const wrong = rows.filter(
      (row) => row.amount.startsWith("+") !== row.isPositiveColour,
    );
    check(
      "every amount's sign matches its colour",
      wrong.length === 0,
      wrong.length === 0
        ? ""
        : wrong
            .map((r) => `"${r.amount}" ${r.isPositiveColour ? "positive-coloured" : "negative-coloured"}`)
            .join("; "),
    );

    check(
      "no expense is shown with a plus sign",
      rows.every((row) => !(row.amount.startsWith("+") && row.isNegativeColour)),
    );
  }

  console.log("\nLedger, same check");
  await page.goto(`${BASE}/money/transactions`, { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(2000);

  const ledgerRows = await page.evaluate(() => {
    const out = [];
    for (const button of document.querySelectorAll("li > div > button[aria-expanded]")) {
      const title = button.querySelector("p")?.textContent?.trim() ?? "";
      // The amount is the last tabular span in the row.
      const spans = button.querySelectorAll("span.tabular");
      const amountEl = spans[spans.length - 1];
      if (!amountEl) continue;
      const amount = amountEl.textContent?.trim() ?? "";
      const color = getComputedStyle(amountEl).color;
      out.push({
        title,
        amount,
        isPositiveColour: color.includes("47, 111, 91"),
        isNegativeColour: color.includes("168, 68, 58"),
      });
    }
    return out.slice(0, 12);
  });

  if (ledgerRows.length === 0) {
    check("found ledger rows to inspect", false, "no rows matched");
  } else {
    console.log(`  found ${ledgerRows.length} rows\n`);
    for (const row of ledgerRows) {
      const sign = row.amount.startsWith("+") ? "+" : row.amount.startsWith("-") ? "-" : "=";
      console.log(`    ${sign} ${row.amount.padEnd(16)} ${row.title.slice(0, 30)}`);
    }

    console.log("");
    const wrong = ledgerRows.filter(
      (row) =>
        row.amount.startsWith("+") && !row.isPositiveColour && !row.amount.includes("Rp"),
    );
    check(
      "ledger signs are consistent",
      ledgerRows.every(
        (row) =>
          (row.amount.startsWith("+") && row.isPositiveColour) ||
          (row.amount.startsWith("-") && row.isNegativeColour) ||
          (!row.amount.startsWith("+") && !row.amount.startsWith("-")),
      ),
      wrong.length > 0 ? `${wrong.length} inconsistent` : "",
    );
  }

  await browser.close();

  console.log(
    `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
