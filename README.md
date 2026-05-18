# The Price of Europe

> *How inflation reshaped daily life across 27 countries*

A data-driven scrollytelling website exploring Europe's cost of living crisis (2019–2025), built with Eurostat data, D3.js, and modern web standards.

## Live Demo

Run locally:
```bash
python -m http.server 8080
# Open http://localhost:8080
```

## Project Structure

```
cost-of-living-europe/
├── index.html                    # Single-page scrollytelling app
├── css/
│   ├── main.css                 # Layout, design tokens, components
│   ├── typography.css           # Roboto Slab + Fira Sans
│   ├── charts.css               # SVG/D3 chart styling
│   ├── scrollytelling.css       # Scroll-driven narrative
│   └── responsive.css           # Tablet + mobile breakpoints
├── js/
│   ├── main.js                  # App entry point
│   ├── modules/
│   │   ├── dataManager.js       # Load all JSON datasets
│   │   ├── scrollytelling.js    # Scrollama setup
│   │   ├── tooltip.js           # Reusable tooltip
│   │   └── navigation.js        # Header scroll behavior
│   └── charts/
│       ├── BaseChart.js          # Reusable base class
│       ├── Choropleth.js         # Animated EU inflation map
│       ├── SmallMultiplesLine.js # HICP by category
│       ├── Heatmap.js            # Country × category matrix
│       ├── SlopeChart.js         # Electricity 2019 vs 2024
│       ├── AnnotatedLine.js      # EU HICP timeline + events
│       ├── StackedArea.js        # Inflation drivers
│       ├── DivergingBar.js       # Real wage change
│       └── WaffleChart.js        # €100 purchasing power
├── data/
│   ├── processed/               # JSON files for D3
│   │   ├── hicp_monthly.json
│   │   ├── hicp_index.json
│   │   ├── hicp_annual.json
│   │   ├── electricity_prices.json
│   │   ├── minimum_wages.json
│   │   ├── house_price_index.json
│   │   ├── events_timeline.json
│   │   └── countries_meta.json
│   └── europe.topojson          # Map geometry
└── preprocessing/
    └── process_data.py          # Data pipeline
```

## Scope 1 — Core 8 Charts

| Step | Chart | Question | Depth interaction |
|------|-------|----------|----|
| 1 | **Animated Choropleth** | Where was inflation in 2019 — and how did it explode? | Play/pause, slider, hover-to-reveal country sparkline (click to pin), worst-country dashed ring |
| 2 | **Small Multiples Line** | Which product categories drove inflation? | Cross-panel hover-sync, Ukraine-invasion annotation line |
| 3 | **Heatmap** | Who's suffering most in which category? | Time slider (2018→latest), sort by category, row hover |
| 4 | **Slope Chart** | How did electricity prices change 2019→2024? | Nominal ↔ Indexed mode toggle, EU-median benchmark line, top/bottom 2 labelled |
| 5 | **Annotated Line** | EU-wide inflation with key policy events | Crosshair + crisis bands + event-category filter + peak callout |
| 6 | **Stacked Area** | What drove inflation over time? | Stacked / Stream / 100% mode toggle, peak callout, per-layer bisect tooltip |
| 7 | **Diverging Bar** | Did wages keep up with inflation? | Real-wage = (1 + nominal) / inflation − 1, sort, faded no-min-wage rows |
| 8 | **Waffle Chart** | What does €100 from 2019 buy today? | Country + category selector, animated number tween, EU-average benchmark |

## Design System

- **Colors:** Dark theme (#0f0f14 background) with semantic colors for inflation (red/orange/green), energy (burnt orange), food (green), housing (steel blue)
- **Typography:** Roboto Slab (headings) + Fira Sans (body) — course requirement
- **Interaction:** Scrollama-driven scrollytelling, play/pause animations, sort toggles, category filters, hover tooltips

## Data Sources

All data from [Eurostat](https://ec.europa.eu/eurostat):
- `prc_hicp_manr` — HICP monthly rate of change
- `prc_hicp_midx` — HICP monthly index (2015=100)
- `nrg_pc_204` — Electricity prices for households
- `earn_mw_cur` — Monthly minimum wages
- `prc_hpi_q` — House price index (quarterly)

## Tech Stack

- HTML5 + CSS3 (no frameworks)
- D3.js v7 (visualizations)
- TopoJSON (maps)
- Scrollama (scrollytelling)
- Python + Pandas (data preprocessing)

## Course

Data Visualization 2025–2026, University of Genova
