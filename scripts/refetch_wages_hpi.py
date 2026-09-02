"""
Re-emit ONLY minimum_wages.json + house_price_index.json from Eurostat.  [round-6 Phase 1]

Why this exists rather than `python process_data.py`: process_all() also rewrites
hicp_monthly / hicp_index / hicp_annual, and hicp_annual.json is a SLIMMED artefact
(scripts/slim_hicp_annual.py, 413 KB -> 46 KB, D90-I2). A full re-run would silently
un-slim it and pull in whatever Eurostat has revised since — a much larger blast radius
than the two files D91/D92 actually fix. This calls the pipeline's own repaired
process_wages() / process_hpi(), so there is exactly one implementation of the fix.

Usage (from the repo root):
    python scripts/refetch_wages_hpi.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, 'preprocessing'))

import process_data                      # noqa: E402

# process_data writes to OUTPUT_DIR relative to preprocessing/ ('../data/processed/').
# Pin it to an absolute path so the script works from any cwd.
process_data.OUTPUT_DIR = os.path.join(ROOT, 'data', 'processed') + os.sep

print("=== RE-EMIT: wages + house prices ===")
print(f"output: {process_data.OUTPUT_DIR}")
process_data.process_wages()
process_data.process_hpi()
print("\nDone. Validate with: node scripts/validate_wages_hpi.mjs")
