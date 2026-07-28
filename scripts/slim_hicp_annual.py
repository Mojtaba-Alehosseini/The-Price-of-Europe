#!/usr/bin/env python3
"""
slim_hicp_annual.py — keep data/processed/hicp_annual.json to what the charts actually read.

Idempotent (safe to re-run; a no-op on an already-clean file), in the pattern of
slim_hicp_index.py.

WHY, from a consumer census (REBUILD-AMENDMENT-3 §1.1) of `hicpAnnual` across js/:

  * Every one of the 21 call sites reads `?.CP00?.` and nothing else —
    BoxPlot.js:81, Choropleth.js (x17), CompareMap.js:106/122.
  * DataManager's own two readers are CP00-only too: `yearsCP00()` reads
    `byCat.CP00`, `euAggregateCode()` tests `hicpAnnual[c]?.CP00`.
  * So the eight other COICOP codes in the dump — CP01, CP04, CP045, CP07,
    CP11, FOOD, NRG, SERV — are dead weight here. (They ARE read, but from
    hicp_index.json and hicp_monthly.json, which are separate files and are
    NOT touched by this script.)

  That is 88.7% of the rows for zero rendered pixels: 7,901 -> 891.

WHAT IS DELIBERATELY *NOT* DROPPED:

  * No geo filter. "EA" looks droppable (it is not an EU-27 member and not the
    primary aggregate) but Choropleth.js:164 uses it as an explicit fallback
    behind EU27_2020, and it is in euAggregateCode()'s candidate list. It costs
    ~1.5 KB. Keeping a documented fallback alive is worth more than 1.5 KB.
  * No year filter. BoxPlot and Choropleth window themselves to 2015+, but
    CompareMap.js:27 feeds the RAW `yearsCP00()` into its Older/Newer year
    dropdowns — trimming years there would silently shrink a user-facing
    control. Size work must not become a feature change.

Rewrites the file in place. Git history holds the pre-slim file, so no .bak.

Usage:
    python scripts/slim_hicp_annual.py
"""

from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
SRC  = ROOT / "data" / "processed" / "hicp_annual.json"

KEEP_CATEGORIES = {"CP00"}


def main():
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")
    before_bytes = SRC.stat().st_size
    print(f"Loading {SRC} ({before_bytes / 1024:.0f} KB)…")
    records = json.loads(SRC.read_text(encoding="utf-8"))
    print(f"  {len(records):,} records")

    slim = [r for r in records if r.get("coicop") in KEEP_CATEGORIES]
    print(f"  slim -> {len(slim):,} records (CP00 only; all geos, all years kept)")

    # Deterministic, diff-friendly order. DataManager rebuilds its nested index at
    # runtime, so array order carries no meaning for correctness.
    slim.sort(key=lambda r: (r["geo"], r["coicop"], r["year"]))

    SRC.write_text(json.dumps(slim, separators=(",", ":")), encoding="utf-8")
    after_bytes = SRC.stat().st_size
    print(f"Wrote {SRC} ({after_bytes / 1024:.0f} KB, "
          f"-{(1 - after_bytes / before_bytes) * 100:.1f}%)")


if __name__ == "__main__":
    main()
