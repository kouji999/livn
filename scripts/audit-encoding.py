"""Audit encoding, with the intended decorative characters allow-listed.

The first pass reported 98 findings, of which 94 were false positives: the
box-drawing character `U+2500` in section-divider comments, and the coloured
circles Prisma writes into its generated file headers. Flagging those buries the
handful that are genuine.

What remains is the real defect: a mojibake em dash, where `U+00E2` (and
sometimes `U+20AC` and a quote-like codepoint) stands where `—` belonged. It
compiles, so it only surfaces when a person reads the rendered page.

The generated Prisma directory is excluded outright: it is build output, it is
not committed, and its contents are regenerated rather than edited.
"""

import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")

ROOT = pathlib.Path("src")
EXTENSIONS = {".ts", ".tsx", ".css", ".mjs"}

# Build output, not source. Excluded because it is regenerated, never edited.
EXCLUDE_DIRS = {"generated"}

# Characters that are deliberately present in this codebase.
INTENDED = set(
    "\u2014"  # em dash, used in prose
    "\u2013"  # en dash
    "\u2018\u2019\u201c\u201d"  # typographic quotes
    "\u2026"  # ellipsis
    "\u2022"  # bullet, in doc comments
    "\u00b7"  # middle dot
    "\u00b0"  # degree
    "\u00d7"  # multiplication sign, in "4x/week" prose
    "\u00a9\u00ae"  # symbols
    "\u2192\u2193"  # arrows in prose
    "\u00b1"  # plus-minus
    "\u2500\u2502\u250c\u2510\u2514\u2518\u251c\u2524"  # box drawing
    "\U0001f7e2\U0001f6d1"  # circles Prisma writes in its headers
)

SEQUENCES = [
    ("\u00e2\u20ac\u201d", "\u2014"),
    ("\u00e2\u20ac\u201c", "\u2014"),
    ("\u00e2\u20ac\u009d", "\u2014"),
    ("\u00e2\u20ac\u009c", "\u2014"),
    ("\u00e2\u20ac\u0099", "\u2019"),
    ("\u00e2\u20ac\u0098", "\u2018"),
    ("\u00e2\u20ac\u00a6", "\u2026"),
    ("\u00e2\u20ac\u00a2", "\u2022"),
    ("\u00c2\u00b7", "\u00b7"),
    ("\ufffd?", "\u2014"),
    ("\ufffd", "\u2014"),
]

ORPHAN_LEADS = ["\u00e2", "\u00c3"]


def render(line: str) -> str:
    return "".join(c if ord(c) <= 127 else f"<U+{ord(c):04X}>" for c in line.strip())[:120]


def main() -> None:
    files = [
        path
        for path in sorted(ROOT.rglob("*"))
        if path.suffix in EXTENSIONS
        and path.is_file()
        and not any(part in EXCLUDE_DIRS for part in path.parts)
    ]

    repaired = []
    findings = []

    for path in files:
        try:
            text = path.read_bytes().decode("utf-8")
        except UnicodeDecodeError as error:
            findings.append((path, f"invalid UTF-8: {error}"))
            continue

        original = text

        for broken, replacement in SEQUENCES:
            text = text.replace(broken, replacement)

        # A BOM is never wanted in a source file.
        text = text.replace("\ufeff", "")

        if text != original:
            path.write_text(text, encoding="utf-8", newline="")
            repaired.append(path)

        # After repair, anything left that is not allow-listed is reported.
        for number, line in enumerate(text.split("\n"), start=1):
            for char in line:
                code = ord(char)
                if code <= 127 or char in INTENDED:
                    continue
                findings.append((path, f"line {number}: U+{code:04X} in {render(line)}"))
                break

    print(f"files scanned: {len(files)}")
    if repaired:
        print(f"\nrepaired {len(repaired)}:")
        for path in repaired:
            print(f"  {path}")
    else:
        print("\nnothing needed repair")

    if findings:
        print(f"\n{len(findings)} finding(s) to review:")
        for path, detail in findings:
            print(f"  {path}\n      {detail}")
        raise SystemExit(1)

    print("\nsource tree is clean")


main()
