/**
 * Link audit.
 *
 *   npx tsx scripts/audit-links.ts
 *
 * Finds every internal `href="/..."` in the source and reports the ones that do
 * not correspond to a route file. A dead link is invisible in type-checking,
 * passes every unit test, and is only discovered by a user clicking it.
 *
 * Dynamic routes are matched against their `[param]` segments, so `/plan/goals/abc`
 * resolves to `app/(app)/plan/goals/[id]/page.tsx`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const APP_DIR = join(process.cwd(), "src", "app");
const SRC_DIR = join(process.cwd(), "src");

let failures = 0;

function walk(dir: string, filter: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, filter));
    else if (filter(entry)) out.push(full);
  }
  return out;
}

/** Every route the App Router will serve, as path segments. */
function collectRoutes(): string[][] {
  const pages = walk(APP_DIR, (name) => name === "page.tsx" || name === "route.ts");

  return pages.map((file) => {
    const rel = relative(APP_DIR, file).replace(/\\/g, "/");
    const dir = rel.replace(/\/(page|route)\.tsx?$/, "");

    // Route groups in parentheses do not appear in the URL.
    const segments = dir
      .split("/")
      .filter((segment) => segment && !segment.startsWith("("))
      .map((segment) => segment.replace(/^\[\.\.\.(.+)\]$/, ":$1").replace(/^\[(.+)\]$/, ":$1"));

    return segments.length === 1 && segments[0] === "" ? [] : segments;
  });
}

/** Does a concrete path match a route pattern? */
function matches(pattern: string[], path: string[]): boolean {
  // A catch-all segment absorbs the rest.
  const catchAll = pattern.findIndex((segment) => segment.startsWith(":") && pattern.length === 1);
  if (catchAll !== -1) return true;
  if (pattern.length !== path.length) return false;

  return pattern.every((segment, index) => {
    if (segment.startsWith(":")) return path[index].length > 0;
    return segment === path[index];
  });
}

function main() {
  const routes = collectRoutes();

  console.log(`routes discovered: ${routes.length}`);
  for (const route of routes.sort((a, b) => a.join("/").localeCompare(b.join("/")))) {
    console.log(`  /${route.join("/")}`);
  }

  const files = walk(SRC_DIR, (name) => /\.(tsx?|mjs)$/.test(name)).filter(
    // Generated Prisma client contains no UI links and is large.
    (file) => !file.includes("generated"),
  );

  const links = new Map<string, string[]>();

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    // Static string hrefs only. Computed hrefs are reported separately because
    // they cannot be checked without running the component.
    for (const match of text.matchAll(/href="(\/[^"$`{]*)"/g)) {
      const href = match[1];
      const list = links.get(href) ?? [];
      list.push(relative(process.cwd(), file));
      links.set(href, list);
    }
  }

  console.log(`\nstatic internal links: ${links.size}`);

  const dead: Array<{ href: string; files: string[] }> = [];

  for (const [href, sources] of links) {
    const path = href.split("?")[0].split("#")[0].split("/").filter(Boolean);
    // `/` is the root route, which is always present.
    if (path.length === 0) continue;

    if (!routes.some((pattern) => matches(pattern, path))) {
      dead.push({ href, files: [...new Set(sources)] });
    }
  }

  if (dead.length === 0) {
    console.log("\nevery internal link resolves to a route");
  } else {
    failures += dead.length;
    console.log(`\n${dead.length} dead link(s):`);
    for (const { href, files } of dead) {
      console.log(`  ${href}`);
      for (const file of files) console.log(`      ${file}`);
    }
  }

  // Links built from a variable cannot be verified statically, so they are
  // listed for a human to check rather than silently ignored.
  const dynamic = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/href=\{`(\/[^`]*)`\}/g)) {
      dynamic.add(match[1].replace(/\$\{[^}]*\}/g, ":param"));
    }
  }

  if (dynamic.size > 0) {
    console.log(`\n${dynamic.size} dynamic link pattern(s) — verify by hand:`);
    for (const pattern of [...dynamic].sort()) console.log(`  ${pattern}`);
  }

  console.log(failures === 0 ? "\nno dead links\n" : `\n${failures} problem(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
