/* ============================================================
   DataManager — loads all Eurostat-derived JSON, builds nested
   lookup indexes for quick chart access.

   Source files are flat arrays of records; we group them into
   the shapes the charts actually need (by country, by month, etc.)
   ============================================================ */

const PATHS = {
  hicpMonthly  : "data/processed/hicp_monthly.json",
  hicpIndex    : "data/processed/hicp_index.json",
  hicpAnnual   : "data/processed/hicp_annual.json",
  electricity  : "data/processed/electricity_prices.json",
  minWages     : "data/processed/minimum_wages.json",
  housePrice   : "data/processed/house_price_index.json",
  events       : "data/processed/events_timeline.json",
  countries    : "data/processed/countries_meta.json",
  topology     : "data/europe.topojson"
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
    const entries = Object.entries(PATHS);
    const results = await Promise.all(entries.map(([k, url]) =>
      fetch(url).then(r => {
        if (!r.ok) throw new Error(`Failed ${url}: ${r.status}`);
        return r.json();
      })
    ));
    entries.forEach(([k], i) => this["_" + k] = results[i]);

    this._buildIndexes();
    this.loaded = true;
    return this;
  }

  _buildIndexes() {
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

    // HICP monthly: nest as {geo: {coicop: {YYYY-MM: value}}}
    this.hicpMonthly = nest3(this._hicpMonthly, r => r.geo, r => r.coicop, r => r.time, r => r.value);

    // HICP annual: {geo: {coicop: {year: value}}}
    this.hicpAnnual = nest3(this._hicpAnnual,
      r => r.geo, r => r.coicop, r => String(r.year), r => r.value);

    // HICP index — only keep CP00 + curated KEY_CATEGORIES (drops bulk of 20 MB at runtime)
    this.hicpIndex = nest3(
      (this._hicpIndex || []).filter(r => KEY_CATEGORIES.includes(r.coicop)),
      r => r.geo, r => r.coicop, r => r.time, r => r.value
    );

    // Electricity: {geo: {time: value}} time = "YYYY-Hn"
    this.electricity = {};
    (this._electricity || []).forEach(r => {
      const time = `${r.year}${r.semester}`;
      if (!this.electricity[r.geo]) this.electricity[r.geo] = {};
      this.electricity[r.geo][time] = r.value;
    });

    // Minimum wages: same shape
    this.minWages = {};
    (this._minWages || []).forEach(r => {
      const time = `${r.year}${r.semester}`;
      if (!this.minWages[r.geo]) this.minWages[r.geo] = {};
      this.minWages[r.geo][time] = r.value;
    });

    // House prices: {geo: {time: value}} time = "YYYY-Qn"
    this.housePrice = {};
    (this._housePrice || []).forEach(r => {
      const time = `${r.year}${r.quarter}`;
      if (!this.housePrice[r.geo]) this.housePrice[r.geo] = {};
      this.housePrice[r.geo][time] = r.value;
    });

    // Events
    this.events = this._events || [];

    // Topology
    this.topology = this._topology;
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
