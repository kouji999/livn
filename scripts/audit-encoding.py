"""Repair mojibake in strings and comments, then verify.

The corruption keeps returning because editing files through PowerShell's
`Set-Content` / `-replace` round-trips text through the console code page. Each
pass can scramble a multi-byte character differently, so several distinct
sequences have appeared:

    U+00E2 U+20AC U+201D      em dash, one byte order
    U+00E2 U+201D U+20AC      the same, scrambled
    U+FFFD                    replacement character

All are repaired here, and the whole tree is re-read afterwards. A repair script
that reports success without verifying is exactly how this defect kept surviving
earlier attempts.
"""

import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")

ROOT = pathlib.Path("src")
EXTENSIONS = {".ts", ".tsx", ".css", ".mjs"}

# Sequence -> intended character. Longest first, so a doubled pattern is
# consumed in one replacement rather than leaving half of itself behind.
SEQUENCES = [
    ("\u00e2\u201d\u20ac\u00e2\u201d\u20ac\u00e2\u201d\u20ac", "\u2014"),
    ("\u00e2\u201d\u20ac\u00e2\u201d\u20ac", "\u2014"),
    ("\u00e2\u201d\u20ac", "\u2014"),
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

# Lead bytes that only ever appear as the remains of a mis-decoded sequence.
ORPHAN_LEADS = ["\u00e2", "\u00c3", "\u20ac"]

# Characters that belong in this codebase.
INTENDED = set(
    "\u2014\u2013\u2018\u2019\u201c\u201d\u2026\u2022\u00b7\u00b0\u00d7"
    "\u00a9\u00ae\u2192\u2193\u00b1"
    "\u2500\u2502\u250c\u2510\u2514\u2518\u251c\u2524"
    "\U0001f7e2\U0001f6d1"
)


def render(line: str) -> str:
    return "".join(c if ord(c) <= 127 else f"<U+{ord(c):04X}>" for c in line.strip())[:120]


def main() -> None:
    files = [
        p
        for p in sorted(ROOT.rglob("*"))
        if p.suffix in EXTENSIONS and p.is_file() and "generated" not in p.parts
    ]

    repaired = []
    remaining = []

    for path in files:
        try:
            text = path.read_bytes().decode("utf-8")
        except UnicodeDecodeError as error:
            remaining.append((path, f"invalid UTF-8: {error}"))
            continue

        original = text

        for broken, replacement in SEQUENCES:
            text = text.replace(broken, replacement)

        # Strip a BOM, which some Windows editors add and nothing here wants.
        text = text.replace("\ufeff", "")

        # An orphan lead byte next to a repaired dash is the same defect.
        for lead in ORPHAN_LEADS:
            text = text.replace(f"\u2014{lead}", "\u2014")
            text = text.replace(f"{lead}\u2014", "\u2014")

        # A run of dashes only ever came from one original character.
        while "\u2014\u2014" in text:
            text = text.replace("\u2014\u2014", "\u2014")

        if text != original:
            path.write_text(text, encoding="utf-8", newline="")
            repaired.append(path)

        # Verify what is actually on disk now, not what was computed.
        written = path.read_text(encoding="utf-8")
        for number, line in enumerate(written.split("\n"), start=1):
            for char in line:
                code = ord(char)
                if code <= 127 or char in INTENDED:
                    continue
                remaining.append((path, f"line {number}: U+{code:04X} in {render(line)}"))
                break

    print(f"files scanned: {len(files)}")

    if repaired:
        print(f"\nrepaired {len(repaired)}:")
        for path in repaired:
            print(f"  {path}")
    else:
        print("\nnothing needed repair")

    if remaining:
        print(f"\n{len(remaining)} finding(s) to review:")
        for path, detail in remaining:
            print(f"  {path}\n      {detail}")
        raise SystemExit(1)

    print("\nsource tree is clean")


main()
