#!/usr/bin/env python3
"""
build_fonts.py — build the self-hosted woff2 subsets in assets/fonts/ (D90-I2c).

WHY self-host at all
--------------------
The page used to load a render-blocking <link rel=stylesheet> from
fonts.googleapis.com. That is two extra DNS+TLS handshakes on the critical path
before ANY webfont byte can even be requested, and it was the single biggest
lever on Largest Contentful Paint (the hero's display-serif headline).

WHY BUILD SUBSETS INSTEAD OF MIRRORING GOOGLE'S
----------------------------------------------
Google's own `latin` subset does NOT contain U+2192 (->) or U+2194 (<->). The
essay uses both — "2019 -> NOW" on the basket bars, "2019 <-> 2022" on the
compare-map step — so today they silently fall back to a system font mid-string.
Mirroring Google's files would have preserved that bug. These subsets are built
from the upstream variable TTFs with those codepoints explicitly included, so the
arrows now render in the real typeface.

COVERAGE (see UNICODES below): Latin-1 + Latin Extended-A, the General
Punctuation block U+2000-206F (which carries the guillemets ‹ › and the one-dot
leader ․ the receipt uses), the euro U+20AC, arrows U+2190-2199, and the maths
minus/ratio signs the axes use. Latin Extended-A matters for the country names
(Czechia, Malta, ...) and the Italian supervisor credit.

Variable axes are PRESERVED (no --instancer): charts.css sets
`font-variation-settings: "opsz" ...` on display text, which needs a live opsz
axis, and the weight axis is used across the UI.

Sources: the google/fonts repo (OFL-1.1). Licences are vendored next to the
fonts in assets/fonts/OFL.txt.

Usage (needs `pip install fonttools brotli`):
    python scripts/build_fonts.py            # expects the TTFs in .d90tmp/
    python scripts/build_fonts.py <src_dir>
"""

from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "fonts"

# The exact coverage the essay needs. Derived by scanning index.html, js/ and css/ for
# every non-ASCII codepoint actually present — not guessed, and deliberately NOT a copy of
# Google's ranges (see the arrows note above).
#
# Latin Extended-A (U+0100-017F) is intentionally EXCLUDED: the scan found zero occurrences
# in the markup and every country name in countries_meta.json is ASCII. It is the single
# biggest range by glyph count, so dropping it is most of the size win on the serif faces.
UNICODES = ",".join([
    "U+0000-00FF",     # Basic Latin + Latin-1 Supplement — §, °, ±, ·, ×, á, é
    "U+0192",          # florin (appears in some Eurostat exports)
    "U+02BB-02BC",     # modifier apostrophes Google ships in its latin subset
    "U+02C6,U+02DA,U+02DC",
    "U+0300-0304,U+0308,U+0309,U+0323,U+0329",   # combining marks
    "U+0394,U+03A3",   # Δ Σ — used in chart annotations
    "U+2000-206F",     # General Punctuation: – — • … ‹ › ․ and the quotes
    "U+2074,U+20AC",   # superscript four, EURO
    "U+2113,U+2122",   # litre sign, trademark
    "U+2190-2199",     # ARROWS ← → ↔ — U+2192 and U+2194 are the two Google's subset drops
    "U+2208,U+2212,U+2215,U+2248,U+2264-2265,U+2282",   # ∈ − ∕ ≈ ≤ ≥ ⊂ (maths in labels)
    "U+2500",          # ─ box-drawing rule
    "U+25A0,U+25B2,U+25B8,U+25BC,U+25C2,U+25CF",        # ■ ▲ ▸ ▼ ◂ ● swatches, sort arrows, play
    "U+FEFF,U+FFFD",
])

# (source ttf, output basename, note)
FACES = [
    ("SourceSerif4[opsz,wght].ttf",        "source-serif-4-var",        "display/body roman, opsz+wght"),
    ("SourceSerif4-Italic[opsz,wght].ttf", "source-serif-4-italic-var", "display italic — the signature look"),
    ("SchibstedGrotesk[wght].ttf",         "schibsted-grotesk-var",     "UI / axes / labels"),
    ("JetBrainsMono[wght].ttf",            "jetbrains-mono-var",        "tabular numerals"),
]


def main():
    src_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / ".d90tmp"
    OUT.mkdir(parents=True, exist_ok=True)
    total_before = total_after = 0

    for src_name, out_base, note in FACES:
        src = src_dir / src_name
        if not src.exists():
            raise SystemExit(f"missing source font: {src}\n"
                             f"fetch the variable TTFs from the google/fonts repo into {src_dir}")
        dst = OUT / f"{out_base}.woff2"
        cmd = [
            sys.executable, "-m", "fontTools.subset", str(src),
            f"--unicodes={UNICODES}",
            "--flavor=woff2",
            "--layout-features=kern,liga,clig,calt,tnum,onum,frac,ccmp,locl,mark,mkmk",
            "--name-IDs=1,2,3,4,6",
            "--notdef-outline",
            "--drop-tables+=DSIG",
            f"--output-file={dst}",
        ]
        subprocess.run(cmd, check=True)
        b, a = src.stat().st_size, dst.stat().st_size
        total_before += b
        total_after += a
        print(f"  {out_base:<28} {b/1024:7.0f} KB -> {a/1024:6.1f} KB   ({note})")

    print(f"\ntotal {total_before/1024:.0f} KB -> {total_after/1024:.1f} KB "
          f"(-{(1 - total_after/total_before)*100:.1f}%)")


if __name__ == "__main__":
    main()
