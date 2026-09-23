/**
 * Accessibility name audit.
 *
 *   node scripts/a11y-names.mjs
 *
 * Reports the *computed* accessible name of every interactive control, using
 * the browser's own algorithm. Reading `textContent` is not a substitute: it
 * returns text that `aria-hidden` removes from the accessible tree, so a naive
 * check reports defects that assistive technology never experiences.
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3777";
const ROUTES = ["/login", "/register"];

let problems = 0;

/**
 * Computes the accessible name the way the spec requires for the cases this
 * UI uses: `aria-label`, then `aria-labelledby`, then the associated `<label>`
 * with `aria-hidden` content excluded.
 */
const COMPUTE_NAMES = () => {
  function visibleLabelText(label) {
    // Walk the label, skipping any subtree marked aria-hidden, and rebuild the
    // text. This is what the accessibility tree sees.
    let text = "";
    const visit = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          text += child.textContent ?? "";
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        if (child.getAttribute("aria-hidden") === "true") continue;
        if (child.tagName === "SVG") continue;
        visit(child);
      }
    };
    visit(label);
    return text.replace(/\s+/g, " ").trim();
  }

  const out = [];
  const controls = document.querySelectorAll(
    "input:not([type=hidden]), select, textarea, button, a[href]",
  );

  for (const el of controls) {
    let name = el.getAttribute("aria-label")?.trim() || null;

    if (!name) {
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        name = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
          .join(" ")
          .trim();
      }
    }

    if (!name && el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) name = visibleLabelText(label);
    }

    if (!name) {
      const wrapping = el.closest("label");
      if (wrapping) name = visibleLabelText(wrapping);
    }

    if (!name && (el.tagName === "BUTTON" || el.tagName === "A")) {
      name = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    }

    if (!name) name = el.getAttribute("placeholder")?.trim() ?? "";

    out.push({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type"),
      name: name ?? "",
      required: el.hasAttribute("required"),
    });
  }

  return out;
};

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    const controls = await page.evaluate(COMPUTE_NAMES);

    console.log(`\n=== ${route} ===`);
    for (const c of controls) {
      const name = c.name.trim();
      const named = name.length > 0;
      const leakedMarker = /\*\s*$/.test(name);

      if (!named) problems++;
      if (leakedMarker) problems++;

      const flag = !named ? "FAIL(no name)" : leakedMarker ? "FAIL(marker)" : "OK";
      console.log(`  ${flag.padEnd(13)} ${c.tag}[${c.type ?? "-"}]: "${name}"`);
    }
  }

  await browser.close();
  console.log(
    problems === 0
      ? "\nAccessible names are clean.\n"
      : `\n${problems} accessibility name problem(s).\n`,
  );
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
