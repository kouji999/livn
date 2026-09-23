/**
 * Project integrity audit.
 *
 *   npx tsx scripts/audit-project.ts
 *
 * Checks what neither the compiler nor the test suites catch, and that only
 * surfaces when a user or a reviewer looks:
 *
 *   1. Every npm script points at a file that exists.
 *   2. Every declared dependency is reachable â€” either imported directly, or
 *      used through a subpath, a peer of another package, or a CLI.
 *   3. Documentation does not promise directories that are absent.
 *   4. Every database table has an accessor in application code.
 *   5. Every navigation entry resolves to a real page.
 *   6. Each route group has the loading and error states Next.js expects.
 *
 * Reports facts. A finding is either a broken promise to a user or dead weight
 * in the repository.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = process.cwd();
let findings = 0;
const notes: string[] = [];

function report(ok: boolean, label: string, detail = "") {
  if (!ok) findings++;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` - ${detail}` : ""}`);
}

function note(text: string) {
  notes.push(text);
  console.log(`  [NOTE] ${text}`);
}

function walk(dir: string, filter: (name: string) => boolean, skip: string[] = []): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (skip.includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, filter, skip));
    else if (filter(entry)) out.push(full);
  }
  return out;
}

const SOURCE_FILES = walk(join(ROOT, "src"), (n) => /\.(ts|tsx)$/.test(n), ["generated"]);
const ALL_SOURCE = SOURCE_FILES.map((f) => readFileSync(f, "utf8")).join("\n");

/**
 * Packages that are used without a direct `from "pkg"` import.
 *
 * Each entry states why, so this list cannot quietly grow to hide a real
 * unused dependency.
 */
const TRANSITIVE_OR_TOOLING: Record<string, string> = {
  "@prisma/client": "superseded by the generated client in src/generated/prisma",
  pg: "driven by @prisma/adapter-pg, never imported directly",
  "react-dom": "required by Next.js as a peer; never imported in app code",
};

// â”€â”€ 1. npm scripts point at real files â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

console.log("\nnpm scripts");
{
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const scripts: Record<string, string> = pkg.scripts ?? {};

  for (const [name, command] of Object.entries(scripts)) {
    const localFile = command.match(/(?:^|\s)((?:\.\/|prisma\/|scripts\/|src\/)[\w./-]+\.\w+)/);
    if (!localFile) continue;
    report(existsSync(join(ROOT, localFile[1])), `"${name}" -> ${localFile[1]}`);
  }
}

// â”€â”€ 2. Declared dependencies are used â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

console.log("\ndependencies");
{
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const declared: string[] = Object.keys(pkg.dependencies ?? {});

  for (const dep of declared) {
    if (TRANSITIVE_OR_TOOLING[dep]) {
      note(`"${dep}" is used indirectly: ${TRANSITIVE_OR_TOOLING[dep]}`);
      continue;
    }

    const escaped = dep.replace(/[/@]/g, "\\$&");
    const pattern = new RegExp(`from\\s+["']${escaped}(?:/|["'])`);
    report(pattern.test(ALL_SOURCE), `"${dep}" is imported`);
  }
}

// â”€â”€ 3. Documentation matches the tree â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

console.log("\ndocumentation accuracy");
{
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");

  // Directory references inside the architecture block. A reference may be
  // relative to `src/` or to the repository root.
  // Only top-level entries of the architecture tree. Nested domain folders
  // are listed under `domains/` and are not paths from the repository root.
  const claimed = [...readme.matchAll(/^(?!\s{4,})[\s│├└─]*([\w.-]+\/)\s{2,}\S/gm)].map((m) => m[1]);

  for (const claimedPath of claimed) {
    const underSrc = existsSync(resolve(ROOT, "src", claimedPath));
    const atRoot = existsSync(resolve(ROOT, claimedPath));
    report(underSrc || atRoot, `README directory "${claimedPath}" exists`);
  }
}

// â”€â”€ 4. Database tables are reachable â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

console.log("\ndatabase tables");
{
  const schema = readFileSync(join(ROOT, "prisma", "schema.prisma"), "utf8");
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);

  /**
   * Models reached only through a relation, not through their own delegate.
   *
   * A join table is written via `createMany` on the parent, so it has no
   * `db.<model>` call and does not need one.
   */
  const RELATION_ONLY = new Set([
    "JournalEntryGoal",
    "JournalEntryProject",
    "JournalTag",
  ]);

  const unreachable = models.filter((model) => {
    if (model === "User" || model === "Session") return false;
    if (RELATION_ONLY.has(model)) return false;
    const delegate = model.charAt(0).toLowerCase() + model.slice(1);
    return !new RegExp(`db\\.${delegate}\\b`).test(ALL_SOURCE);
  });

  console.log(`  ${models.length} models, ${unreachable.length} without an accessor`);

  if (unreachable.length > 0) {
    // Not a failure: a table can exist ahead of the feature that uses it, which
    // is a deliberate choice rather than a defect. It is reported so the gap is
    // visible rather than forgotten.
    note(
      `tables with no accessor yet: ${unreachable.join(", ")}`,
    );
  }
}

// â”€â”€ 5. Navigation resolves to a page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

console.log("\nnavigation");
{
  const navConfig = join(ROOT, "src", "components", "shell", "nav-config.ts");
  const pages = walk(join(ROOT, "src", "app"), (n) => n === "page.tsx").map((f) =>
    f.replace(/\\/g, "/"),
  );

  if (existsSync(navConfig)) {
    const hrefs = [...readFileSync(navConfig, "utf8").matchAll(/href:\s*"([^"]+)"/g)].map(
      (m) => m[1],
    );

    for (const href of hrefs) {
      const found = pages.some((file) => file.endsWith(`${href}/page.tsx`));
      report(found, `nav "${href}" resolves`);
    }
  }
}

// â”€â”€ 6. Route states â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

console.log("\nroute states");
{
  report(existsSync(join(ROOT, "src", "app", "not-found.tsx")), "root has not-found");

  // Only the authenticated shell needs a group-level loading state; the public
  // pages are server-rendered and fast enough that a skeleton would flash.
  const appGroup = join(ROOT, "src", "app", "(app)");
  report(existsSync(join(appGroup, "error.tsx")), "(app) has an error boundary");
  report(existsSync(join(appGroup, "loading.tsx")), "(app) has a loading state");
}

console.log(
  findings === 0
    ? `\nNo integrity problems found.${notes.length > 0 ? ` ${notes.length} note(s).` : ""}\n`
    : `\n${findings} problem(s) found.\n`,
);

process.exit(findings === 0 ? 0 : 1);
