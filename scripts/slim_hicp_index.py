#!/usr/bin/env python3
"""
slim_hicp_index.py — keep data/processed/hicp_index.json compact AND consistent.

Two idempotent jobs (safe to re-run; running on an already-clean file is a no-op):

  1. SLIM   — keep only the EU-27 members + EU/EA aggregates, the 9 categories the
              charts use, and months from 2015-01 forward.

  2. DEDUPE — the Eurostat `prc_hicp_midx` dump carried every index *base*
              (2015=100, 2005=100, 1996=100 …) as its own row, so each
              (geo, coicop, time) landed in the file 2–3× with different index
              values on parallel bases (e.g. EU27_2020/CP00/2019-01 = 123.69 AND
              103.22 AND a third). Nothing reads more than one base, and every
              chart figure is a RATIO within a single (geo, coicop) series, so the
              base cancels out. Keep exactly ONE row per (geo, coicop, time): the
              LAST occurrence — which is precisely the row DataManager's
              last-write-wins nest already lands on. The kept base is therefore
              consistent within each (geo, coicop) and every rendered number
              (€100 → €77 / €61 / €78 …) is preserved byte-for-byte; the dropped
              rows carried no extra information. This more than halves the file
              (97,680 → 35,640 rows).

Rewrites the file in place. Git history holds the pre-clean file, so there is no
on-disk .bak left lying around.

Usage:
    python scripts/slim_hicp_index.py
"""

from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
SRC  = ROOT / "data" / "processed" / "hicp_index.json"

KEEP_CATEGORIES = {"CP00", "CP01", "CP04", "CP045", "CP07", "CP11", "NRG", "FOOD", "SERV"}
KEEP_GEOS = {
    "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","EL","HU","IE",
    "IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
    "EU27_2020","EA20","EA19","EU"
}
KEEP_FROM_MONTH = "2015-01"

def main():
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")
    print(f"Loading {SRC} ({SRC.stat().st_size / 1024 / 1024:.1f} MB)…")
    records = json.loads(SRC.read_text())
    print(f"  {len(records):,} records")

    # 1) SLIM — geo / category / month window.
    slim = [
        r for r in records
        if r.get("geo") in KEEP_GEOS
        and r.get("coicop") in KEEP_CATEGORIES
        and r.get("time", "") >= KEEP_FROM_MONTH
    ]
    print(f"  slim   -> {len(slim):,} records")

    # 2) DEDUPE — keep the LAST row seen per (geo, coicop, time). Dict assignment
    #    overwrites, so iterating in file order leaves exactly the last occurrence,
    #    which equals DataManager's last-write-wins selection → identical chart
    #    numbers. Then sort for a deterministic, diff-friendly file (the nest is
    #    rebuilt at runtime, so array order is irrelevant to correctness).
    by_key = {}
    for r in slim:
        by_key[(r["geo"], r["coicop"], r["time"])] = r
    deduped = sorted(by_key.values(), key=lambda r: (r["geo"], r["coicop"], r["year"], r["month"]))
    print(f"  dedupe -> {len(deduped):,} records (1 base per geo×coicop×month)")

    SRC.write_text(json.dumps(deduped, separators=(",", ":")))
    print(f"Wrote {SRC} ({SRC.stat().st_size / 1024 / 1024:.1f} MB)")

if __name__ == "__main__":
    main()
