# The Price of Europe

How life got expensive in Europe, 2019 to 2025. A scrollytelling data essay.

MSc in Artificial Intelligence, University of Genova. Data Visualization, 2025/2026. Solo project.

![D3](https://img.shields.io/badge/D3.js-v7-f1f1e8) ![build](https://img.shields.io/badge/build_step-none-lightgrey) ![license](https://img.shields.io/badge/license-MIT-blue)

Live site: _to be set after the GitHub Pages deploy._

## What it is

A long, scroll-driven story about what six years did to the cost of living in Europe: the quiet of
2019, the COVID shock, the energy crisis of 2022, and the aftermath, where inflation stopped but the
prices stayed. It opens on a receipt for one month of European living, dated December 2025, with
every line printed above its struck-through January 2019 price.

Nine chapters carrying eleven charts, all hand-built in D3 v7. No framework, no build step. Plain
HTML, CSS custom properties and ES modules, served straight from the folder.

## Running it locally

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## The chapters

| # | Chart | The question it answers |
|--|--|--|
| 1 | AnnotatedLine | What actually happened to prices, in one line? |
| 2 | SmallMultiplesLine | Which categories were loading the spring before it fired? |
| 3 | Choropleth *(+ drag-to-compare map)* | How differently did the shock land across the union? |
| 4 | Heatmap | Which categories let go, and which never did? |
| 5 | RateLevel | If inflation is over, why is nothing cheaper? |
| 6 | WaffleChart | What does €100 of 2019 still buy, country by country? |
| 7 | Housing | Did the biggest bill of all outrun the basket? |
| 8 | RaceChart | Did the minimum wage keep up with prices? |
| 8b | DivergingBar | How far did each country's floor fall, and how far did it come back? |
| 9 | ScoreMap | Where is it over, and where is it not? |
| 9b | BoxPlot | Did Europe agree about inflation again, and at what level? |

## The data

Every figure comes from Eurostat and is public domain under CC-BY 4.0. The pipeline downloads five
tables and tidies them into `data/processed/`.

```bash
cd preprocessing
pip install -r requirements.txt
python download_data.py        # Eurostat JSON-API + Europe topojson
python process_data.py         # tidies into data/processed/*.json
python ../scripts/slim_hicp_index.py
```

Two filters in that pipeline are not housekeeping. They decide whether the numbers are right.
Eurostat cubes are keyed on more dimensions than the obvious ones, and asking for them unfiltered
quietly stacks incompatible series under the same key.

`earn_mw_cur` (minimum wages) is keyed on currency, geo and time, and publishes a EUR, NAC and PPS
value for every key. Fetched without a currency filter, the last write wins, and what I was left
with was PPS. That series is already adjusted for purchasing power, so the real-wage formula was
deflating it a second time. It is now fetched with `currency=NAC`, the basis every label and the
methodology actually claim, and the file it writes carries a `currency` column so the basis is
visible instead of assumed.

`prc_hpi_q` (house prices) is keyed on purchase type, unit, geo and time, with three purchase types
and four units. It is now fetched with `purchase=TOTAL, unit=I15_Q`.

Both fetches raise if the cube ever returns something else. `scripts/validate_wages_hpi.mjs`
recomputes every wage and housing figure the text claims, offline, straight from the files the
pipeline emits.

## How the code is laid out

`index.html` is the spine of the page. `css/` holds the design tokens and the chart styles.
`js/modules/` holds the managers for data, theme, motion and scroll, and `js/charts/` holds one file
per chart. `docs/data_sources.md` lists every Eurostat table the essay uses.

## Credits and licence

Data © European Union, Eurostat (CC-BY 4.0). Code under MIT.

Mojtaba Alehosseini, MSc AI, University of Genova, 2026.
