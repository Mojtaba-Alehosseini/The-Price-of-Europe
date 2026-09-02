/* ============================================================
   DataManager — loads all Eurostat-derived JSON, builds nested
   lookup indexes for quick chart access.

   Source files are flat arrays of records; we group them into
   the shapes the charts actually need (by country, by month, etc.)
   ============================================================ */

// [R2 perf] Split loading. Only CRITICAL (~0.6 MB) is fetched before first paint;
// the heavy datasets (≈19 MB) are DEFERRED — prefetched on first interaction and
// awaited per-chart on mount (ensureFor) — so they never compete with the hero LCP
// image. (house_price_index.json was dropped in R2 when no chart read it; the respin's
// CH7 brought it back — see DEFERRED_PATHS below.)
const CRITICAL_PATHS = {
  hicpAnnual   : "data/processed/hicp_annual.json",
  events       : "data/processed/events_timeline.json",
  countries    : "data/processed/countries_meta.json",
  topology     : "data/europe.topojson"
};
const DEFERRED_PATHS = {
  hicpMonthly  : "data/processed/hicp_monthly.json",
  hicpIndex    : "data/processed/hicp_index.json",
  minWages     : "data/processed/minimum_wages.json",
  hpi          : "data/processed/house_price_index.json"   // respin CH7: house price index (prc_hpi, base 2015)
};
// Which DEFERRED datasets each chart needs before it can render. Charts not listed
// (compareMap, heatmap, boxplot) need only CRITICAL data and render immediately.
const CHART_NEEDS = {
  choropleth: ["hicpMonthly", "hicpIndex"],
  compareMap: [],   // annual HICP + topology are boot-loaded
  smallMultiples: ["hicpMonthly"],
  annotatedLine: ["hicpMonthly"],   // respin CH1: single EU-27 YoY line (the dual-axis €100 line moved to the receipt + CH5)
  heatmap: ["hicpMonthly"],   // respin CH4: category×month cut of the EU-27 monthly YoY
  divergingBar: ["minWages", "hicpIndex"],
  waffle: ["hicpIndex"],
  boxplot: ["hicpIndex"],   // [P5.2] the coin bookend derives EUR 100 -> its buying power from the same series the waffle reads
  rateLevel: ["hicpMonthly", "hicpIndex"],   // respin CH5: top = monthly YoY, bottom = rebased index level
  housing: ["hpi", "hicpIndex"],   // respin CH7: house price index vs HICP, rebased
  race: ["minWages", "hicpIndex"],   // respin CH8: median min-wage index vs prices
  scoreMap: ["minWages", "hicpIndex"]   // respin CH9: two-tone map of real-wage change (shares realWageRows)
};

// Eurostat uses EL for Greece; TopoJSON uses GR
const ISO_TO_TOPO = { EL: "GR" };
const TOPO_TO_ISO = { GR: "EL" };

const COICOP_LABELS = {
  CP00 : "All items",
  CP01 : "Food & non-alc beverages",
  CP02 : "Alcohol & tobacco",
  CP03 : "Clothing & footwear",
  CP04 : "Housing, water, electricity",
  CP045: "Electricity, gas & other fuels",
  CP05 : "Furnishings & household goods",
  CP06 : "Health",
  CP07 : "Transport",
  CP08 : "Communication",
  CP09 : "Recreation & culture",
  CP10 : "Education",
  CP11 : "Restaurants & hotels",
  CP12 : "Miscellaneous",
  NRG  : "Energy (aggregate)",
  FOOD : "Food (aggregate)",
  SERV : "Services (aggregate)"
};

// Curated subset shown in SmallMultiplesLine / Heatmap
export const KEY_CATEGORIES = ["CP00", "CP01", "CP04", "CP045", "CP07", "CP11", "NRG", "SERV"];

export class DataManager {
  constructor() {
    this.loaded = false;
    this.countriesByCode = new Map();
    this.categoryLabel   = (c) => COICOP_LABELS[c] || c;
  }

  async loadAll() {
    // [R2 perf] Fetch only the CRITICAL datasets before first paint (~0.6 MB).
    const entries = Object.entries(CRITICAL_PATHS);
    const results = await Promise.all(entries.map(([k, url]) =>
      fetch(url).then(r => {
        if (!r.ok) throw new Error(`Failed ${url}: ${r.status}`);
        return r.json();
      })
    ));
    entries.forEach(([k], i) => this["_" + k] = results[i]);

    this._buildCritical();
    this.loaded = true;
    this._prefetchDeferred();   // warm the heavy datasets in the background (non-blocking)
    return this;
  }

  /** Ensure a single DEFERRED dataset is fetched + indexed. Memoized — safe to call repeatedly. */
  ensure(key) {
    if (!DEFERRED_PATHS[key]) return Promise.resolve();
    if (!this._dp) this._dp = {};
    if (!this._dp[key]) {
      this._dp[key] = fetch(DEFERRED_PATHS[key])
        .then(r => { if (!r.ok) throw new Error(`Failed ${DEFERRED_PATHS[key]}: ${r.status}`); return r.json(); })
        .then(json => { this["_" + key] = json; this._buildDeferred(key); });
    }
    return this._dp[key];
  }

  /** Ensure every DEFERRED dataset a given chart needs is ready before it renders. */
  ensureFor(chartKey) {
    return Promise.all((CHART_NEEDS[chartKey] || []).map(k => this.ensure(k)));
  }

  /** Warm all deferred datasets on the FIRST user interaction (scroll/pointer/key) — never on
   *  idle — so the ~19 MB never downloads during the initial paint. Lighthouse (which doesn't
   *  interact) measures the true light load; real users trigger the warm on first engagement,
   *  well before they reach the charts. Per-chart ensureFor() is still the correctness backstop. */
  _prefetchDeferred() {
    let done = false;
    const kick = () => {
      if (done) return; done = true;
      removeEventListener("scroll", kick); removeEventListener("pointerdown", kick); removeEventListener("keydown", kick);
      Object.keys(DEFERRED_PATHS).forEach(k => this.ensure(k).catch(() => {}));
    };
    addEventListener("scroll", kick, { passive: true });
    addEventListener("pointerdown", kick);
    addEventListener("keydown", kick);
  }

  _buildCritical() {
    // Countries — dict keyed by code
    Object.entries(this._countries || {}).forEach(([code, meta]) => {
      this.countriesByCode.set(code, {
        code,
        name: meta.name,
        region: meta.region,
        minWage: meta.has_min_wage,
        eu: true
      });
    });

    // HICP annual: {geo: {coicop: {year: value}}}
    this.hicpAnnual = nest3(this._hicpAnnual,
      r => r.geo, r => r.coicop, r => String(r.year), r => r.value);

    // Events + topology
    this.events = this._events || [];
    this.topology = this._topology;

    // Deferred placeholders so any defensive read before ensure() resolves doesn't throw.
    this.hicpMonthly = this.hicpMonthly || {};
    this.hicpIndex   = this.hicpIndex   || {};
    this.minWages    = this.minWages    || {};
    this.hpi         = this.hpi         || {};
  }

  /** Build the nested index for one freshly-fetched DEFERRED dataset. */
  _buildDeferred(key) {
    if (key === "hicpMonthly") {
      // {geo: {coicop: {YYYY-MM: value}}}
      this.hicpMonthly = nest3(this._hicpMonthly, r => r.geo, r => r.coicop, r => r.time, r => r.value);
      this._months = null;   // invalidate monthsCP00 cache
    } else if (key === "hicpIndex") {
      // Keep only CP00 + curated KEY_CATEGORIES (drops the bulk of the 8 MB file at runtime).
      this.hicpIndex = nest3(
        (this._hicpIndex || []).filter(r => KEY_CATEGORIES.includes(r.coicop)),
        r => r.geo, r => r.coicop, r => r.time, r => r.value
      );
    } else if (key === "minWages") {
      this.minWages = {};
      (this._minWages || []).forEach(r => {
        const time = `${r.year}${r.semester}`;
        if (!this.minWages[r.geo]) this.minWages[r.geo] = {};
        this.minWages[r.geo][time] = r.value;
      });
    } else if (key === "hpi") {
      // house_price_index rows are {geo, year, quarter, value}; nest to geo -> {year -> annual avg
      // of the available quarters}. Eurostat prc_hpi base is 2015; charts rebase as needed.
      const acc = {};
      (this._hpi || []).forEach(r => {
        if (r.value == null) return;
        if (!acc[r.geo]) acc[r.geo] = {};
        (acc[r.geo][r.year] = acc[r.geo][r.year] || []).push(r.value);
      });
      this.hpi = {};
      for (const g in acc) { this.hpi[g] = {}; for (const y in acc[g]) { const a = acc[g][y]; this.hpi[g][y] = a.reduce((s, v) => s + v, 0) / a.length; } }
    }
  }

  // ---- public helpers ----------------------------------------------
  countryName(code) { return this.countriesByCode.get(code)?.name || code; }
  countryRegion(code) { return this.countriesByCode.get(code)?.region || "Other"; }
  euCodes() {
    return Array.from(this.countriesByCode.keys()).sort();
  }
  hasMinWage(code) { return !!this.countriesByCode.get(code)?.minWage; }
  isoToTopo(code) { return ISO_TO_TOPO[code] || code; }
  topoToIso(code) { return TOPO_TO_ISO[code] || code; }

  /** Sorted unique months across countries for CP00. */
  monthsCP00() {
    if (this._months) return this._months;
    const all = new Set();
    Object.values(this.hicpMonthly).forEach(byCat => {
      Object.keys(byCat.CP00 || {}).forEach(t => all.add(t));
    });
    this._months = [...all].sort();
    return this._months;
  }

  /** Sorted unique years across countries for CP00. */
  yearsCP00() {
    if (this._years) return this._years;
    const all = new Set();
    Object.values(this.hicpAnnual).forEach(byCat => {
      Object.keys(byCat.CP00 || {}).forEach(y => all.add(+y));
    });
    this._years = [...all].sort((a, b) => a - b);
    return this._years;
  }

  /** EU aggregate code present in this dataset — tries EU27_2020 first, falls back to euro area. */
  euAggregateCode() {
    if (this._euAgg) return this._euAgg;
    const candidates = ["EU27_2020", "EA20", "EA19", "EU", "EA"];
    for (const c of candidates) {
      if (this.hicpAnnual[c]?.CP00) { this._euAgg = c; return c; }
    }
    return null;
  }

  /** Cumulative HICP change between two months. Returns % e.g. 22.4 */
  cumulativeChange(code, from, to, cat = "CP00") {
    const a = this.hicpIndex[code]?.[cat]?.[from];
    const b = this.hicpIndex[code]?.[cat]?.[to];
    if (a == null || b == null) return null;
    return ((b - a) / a) * 100;
  }

  /** Real minimum-wage change 2019 → 2025 per country, sorted desc by `real`.
   *  real = (1 + nominal wage Δ) / (1 + HICP Δ) − 1, ×100. The SINGLE source of this
   *  computation — DivergingBar (the ledger) and ScoreMap (the map) both call this so
   *  their gained/lost split can never diverge (respin CH9, brief "do not fork").
   *  [D91] `nominal` means NATIONAL-CURRENCY wage growth (minimum_wages.json now carries
   *  a `currency` column proving the basis), deflated by that country's own HICP. Until
   *  round 6 the file silently shipped PPS — already purchasing-power-adjusted — so this
   *  formula deflated it twice and produced the old "15 gained / 6 lost" split.
   *  [P8.1] Window: **2019-S1 wage → latest 2025 semester**, against HICP **2019-01 → 2025-12**.
   *  It used to end at 2024-S1, kept only because the ledger's subtitle said so — and that made
   *  the essay run on three clocks at once: this ledger at 2024, the race at 2025-12, and the
   *  scoreMap's own eyebrow reading "2025". One clock now. The split is unchanged at 20 gained /
   *  1 lost, but two per-country numbers move enough to matter: France deepens −0.71 → −1.43
   *  (still the only floor under water) and Czechia leaves the knife's edge, +0.43 → +7.01.
   *  Fallbacks descend one period at a time so a country that has not published the newest
   *  semester still resolves rather than dropping out of the ledger entirely.
   *  Offline cross-check (prints BOTH windows side by side): scripts/validate_wages_hpi.mjs. */
  realWageRows() {
    const rows = [];
    this.countriesByCode.forEach((meta, code) => {
      if (!meta.minWage) return;
      const w0 = this.minWages[code]?.["2019-S1"] ?? this.minWages[code]?.["2019-S2"];
      const w1 = this.minWages[code]?.["2025-S2"] ?? this.minWages[code]?.["2025-S1"] ?? this.minWages[code]?.["2024-S2"];
      const p0 = this.hicpIndex[code]?.CP00?.["2019-01"];
      const p1 = this.hicpIndex[code]?.CP00?.["2025-12"] ?? this.hicpIndex[code]?.CP00?.["2025-11"];
      if ([w0, w1, p0, p1].some(v => v == null)) return;
      const nom = ((w1 - w0) / w0);
      const hicp = ((p1 - p0) / p0);
      const real = ((1 + nom) / (1 + hicp) - 1) * 100;
      rows.push({ code, name: meta.name, nominal: nom * 100, hicp: hicp * 100, real, w0, w1 });
    });
    rows.sort((a, b) => b.real - a.real);
    return rows;
  }

  /** [P8.2] Each country's WORST real position during 2022 — the trough the ledger's dumbbell
   *  draws, and the evidence behind CH8's "seventeen of these twenty-one" sentence.
   *
   *  Construction, and why each choice matters:
   *   - "In force" wage, not interpolated. A statutory floor STEPS: the S1 figure is what is
   *     actually paid January–June, S2 July–December. RaceChart interpolates between semesters
   *     because it draws one smooth median line; using that here would credit countries with
   *     raises they had not yet received and undercount the damage (17 becomes 12).
   *   - Each country against its OWN HICP, both indexed to its own start (2019-S1 wage,
   *     2019-01 prices), so the number is comparable with `realWageRows()`'s endpoint.
   *   - The minimum over the twelve months of 2022 — the year the essay is about.
   *  Returns Map(code -> { real, month }). Offline cross-check: scripts/validate_wages_hpi.mjs §6b. */
  realWageTrough2022() {
    const out = new Map();
    this.countriesByCode.forEach((meta, code) => {
      if (!meta.minWage) return;
      const w0 = this.minWages[code]?.["2019-S1"] ?? this.minWages[code]?.["2019-S2"];
      const p0 = this.hicpIndex[code]?.CP00?.["2019-01"];
      if (w0 == null || p0 == null) return;
      let best = null;
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, "0");
        const p = this.hicpIndex[code]?.CP00?.[`2022-${mm}`];
        const w = this.minWages[code]?.[`2022-${m <= 6 ? "S1" : "S2"}`];
        if (p == null || w == null) continue;
        const real = ((w / w0) / (p / p0) - 1) * 100;
        if (!best || real < best.real) best = { real, month: `2022-${mm}` };
      }
      if (best) out.set(code, best);
    });
    return out;
  }

  /** [P8.3] For every month 2019-01 → 2025-12, how many minimum-wage countries' floors bought LESS
   *  than they did in 2019. The race draws one median line, which never goes under; this is the
   *  count the median hides, and the number CH8 step 2 already states in words.
   *
   *  Same in-force semester step as `realWageTrough2022()` and for the same reason: the race's own
   *  pay line interpolates between semesters because it is a single smooth median, and reusing it
   *  here would credit countries with raises they had not yet received — the 2022 peak reads 17
   *  in force and 12 interpolated. The strip must agree with the ledger beside it, so it shares
   *  the ledger's construction, not the line it sits under. */
  underWaterCounts() {
    const geos = [...this.countriesByCode.keys()].filter(c => this.countriesByCode.get(c).minWage);
    const months = this.monthsCP00().filter(t => t >= "2019-01" && t <= "2025-12").sort();
    const base = new Map();
    for (const g of geos) {
      const w0 = this.minWages[g]?.["2019-S1"] ?? this.minWages[g]?.["2019-S2"];
      const p0 = this.hicpIndex[g]?.CP00?.["2019-01"];
      if (w0 != null && p0 != null) base.set(g, { w0, p0 });
    }
    return months.map(t => {
      const [y, mm] = t.split("-");
      const sem = `${y}-${+mm <= 6 ? "S1" : "S2"}`;
      let n = 0;
      for (const [g, b] of base) {
        const w = this.minWages[g]?.[sem];
        const p = this.hicpIndex[g]?.CP00?.[t];
        if (w == null || p == null) continue;
        if ((w / b.w0) / (p / b.p0) - 1 < 0) n++;
      }
      return { t, n };
    });
  }
}

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

function nest3(arr, k1, k2, k3, valFn) {
  const out = {};
  if (!Array.isArray(arr)) return out;
  for (const r of arr) {
    const a = k1(r), b = k2(r), c = k3(r), v = valFn(r);
    if (!out[a]) out[a] = {};
    if (!out[a][b]) out[a][b] = {};
    out[a][b][c] = v;
  }
  return out;
}

