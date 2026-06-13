#!/usr/bin/env python3
"""
slim_hicp_index.py — prune hicp_index.json from ~20 MB to ~2 MB by keeping
only the EU-27 + EU aggregate codes, only the 8 categories charts use, and
only months from 2015-01 forward.

Usage:
    python scripts/slim_hicp_index.py

Rewrites data/processed/hicp_index.json in place (backs up to .bak).
"""

from pathlib import Path
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
SRC  = ROOT / "data" / "processed" / "hicp_index.json"
BAK  = SRC.with_suffix(".json.bak")

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

    slim = [
        r for r in records
        if r.get("geo") in KEEP_GEOS
        and r.get("coicop") in KEEP_CATEGORIES
        and r.get("time", "") >= KEEP_FROM_MONTH
    ]
    print(f"  kept {len(slim):,} records ({len(slim) / max(1, len(records)):.1%})")

    if not BAK.exists():
        shutil.copy2(SRC, BAK)
        print(f"  backup -> {BAK.name}")

    SRC.write_text(json.dumps(slim, separators=(",", ":")))
    print(f"Wrote {SRC} ({SRC.stat().st_size / 1024 / 1024:.1f} MB)")

if __name__ == "__main__":
    main()
