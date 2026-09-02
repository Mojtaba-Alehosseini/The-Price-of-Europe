# Data Sources

All data are public-domain Eurostat, downloaded automatically by `preprocessing/download_data.py`. The script writes raw JSON into `data/raw/` and a pre-processed tidy version into `data/processed/`. No proprietary data, no scraped data.

## Eurostat tables

| Variable | Eurostat code | Geometry | Frequency | URL |
|---|---|---|---|---|
| HICP — monthly rate of change | `prc_hicp_manr` | EU-27 + national | monthly | https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/prc_hicp_manr |
| HICP — monthly index (2015 = 100) | `prc_hicp_midx` | EU-27 + national | monthly | https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/prc_hicp_midx |
| HICP — annual average rate | `prc_hicp_aind` | EU-27 + national | annual | https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/prc_hicp_aind |
| Minimum wages | `earn_mw_cur` | 22 countries | semester | https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/earn_mw_cur |
| House price index | `prc_hpi_q` | EU-27 + national | quarterly | https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/prc_hpi_q |

## Filters that are load-bearing, not tidying

Eurostat cubes are keyed on more dimensions than the obvious ones, and a request that ignores them
stacks incompatible series under one key. Two tables here need an explicit filter, and round 6 fixed
both at source (`preprocessing/process_data.py`), with the fetch raising if the cube ever returns
anything else:

| Table | Real key | Filter | Why it matters |
|---|---|---|---|
| `earn_mw_cur` | `(currency, geo, time)` | `currency=NAC` | Publishes an EUR/NAC/PPS triplet per key. Unfiltered, last-write-wins kept **PPS** — already purchasing-power-adjusted — and the real-wage formula deflated it a second time. NAC is what every label and the methodology claim; for euro members NAC = EUR. The emitted file carries a `currency` column so the basis is self-describing. |
| `prc_hpi_q` | `(purchase, unit, geo, time)` | `purchase=TOTAL`, `unit=I15_Q` | Three purchase types × four unit types were being averaged together, which inverted Finland's sign among other damage. |

`scripts/validate_wages_hpi.mjs` reproduces every number the copy claims, offline, from the emitted
files — including both windows of the real-wage computation side by side.

## Geometry

`europe.topojson` — Europe country borders, from the leakyMirror fork of `world-atlas`, fallback to the official `topojson/world-atlas` v3. The download script tries the primary URL first and falls back if blocked.

Greece is `EL` in Eurostat but `GR` in TopoJSON; `DataManager.isoToTopo()` and `topoToIso()` paper over the mismatch.

## Manually curated

| File | What | Why |
|---|---|---|
| `data/processed/events_timeline.json` | ~15 dated events (COVID, ECB hikes, Russia invasion, gas-price cap, EU coal ban) | The chart annotations need a fixed, citable timeline; hand-curated rather than scraped from news sources. |
| `data/processed/countries_meta.json` | EU-27 with `name`, `region`, `has_min_wage` | Names + region grouping for the scroll-camera focus regions; min-wage flag controls which countries the wage charts use. |

## How to refresh

```bash
cd preprocessing
pip install -r requirements.txt
python download_data.py   # writes data/raw/*.json
python process_data.py    # tidies into data/processed/*.json
```

If Eurostat changes a dataset's structure, `process_data.py` will need updating — it's the only place that touches the raw JSON-stat shape.

## Citing

Eurostat data is licensed CC-BY 4.0. Citation suggestion:

> Eurostat (2025). *Harmonised Index of Consumer Prices (HICP)*. European Commission. Available at https://ec.europa.eu/eurostat/web/hicp.

## Limitations

- HICP weights are revised every year by Eurostat; our chart shows *rates*, not weights, so this only matters where we compose categories (StackedArea). There we use a simple proxy weighting; the chart is illustrative of composition, not an exact replication of Eurostat's contribution decomposition.
- Minimum wages exclude countries that set wages by collective bargaining (Austria, Denmark, Finland, Italy, Sweden, Cyprus). Those countries are dropped from the Diverging-Bar and Connected-Scatter charts.
- **Household electricity prices (`nrg_pc_204`) were REMOVED in round 6.** They fed the slope chart, which was cut, leaving a 2.56 MB file with zero consumers. The receipt's "Electricity & gas" line is a HICP *category* (CP045), not this table.
