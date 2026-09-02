// scripts/validate_wages_hpi.mjs — [round-6 Phase 1 / D91+D92] offline validation of the
// re-emitted wage + house-price files, and the single offline source of every number the
// CH7/CH8/CH9 copy claims. Run from the repo root:  node scripts/validate_wages_hpi.mjs
//
// It reproduces DataManager's own indexing and realWageRows() exactly (same 2019->2024
// window, same S1/S2 fallbacks, same HICP months) so "offline" and "on screen" cannot drift.
// Pass a directory of alternative-basis wage files as argv[2] to also print the EUR/PPS
// comparison (used once, to put OWNER GATE G1's basis choice in front of the owner).
import { readFileSync, existsSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = p => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const pct = (n, d = 1) => (n == null ? "  n/a" : (n >= 0 ? "+" : "") + n.toFixed(d));

const meta = read("data/processed/countries_meta.json");
const hicpIdx = read("data/processed/hicp_index.json");
const wages = read("data/processed/minimum_wages.json");
const hpi = read("data/processed/house_price_index.json");

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
};

// ---- index the way DataManager does -------------------------------------------------
const idxCP00 = {};                       // geo -> {"YYYY-MM": value}
for (const r of hicpIdx) {
  if (r.coicop !== "CP00") continue;
  (idxCP00[r.geo] = idxCP00[r.geo] || {})[r.time] = r.value;
}
const mwOf = rows => {                    // geo -> {"YYYY-Sn": value}
  const o = {};
  for (const r of rows) (o[r.geo] = o[r.geo] || {})[`${r.year}${r.semester}`] = r.value;
  return o;
};
const hpiYear = {};                       // geo -> {year: mean of that year's quarters}
{
  const acc = {};
  for (const r of hpi) { if (r.value == null) continue; ((acc[r.geo] = acc[r.geo] || {})[r.year] = acc[r.geo][r.year] || []).push(r.value); }
  for (const g in acc) { hpiYear[g] = {}; for (const y in acc[g]) hpiYear[g][y] = acc[g][y].reduce((s, v) => s + v, 0) / acc[g][y].length; }
}

// ---- 1 · structural integrity -------------------------------------------------------
console.log("\n=== 1 · ONE ROW PER KEY (the D91/D92 bug class) ===");
for (const [name, rows, keyFn] of [
  ["minimum_wages.json", wages, r => `${r.geo}|${r.year}|${r.semester}`],
  ["house_price_index.json", hpi, r => `${r.geo}|${r.year}|${r.quarter}`]
]) {
  const seen = new Map();
  for (const r of rows) { const k = keyFn(r); seen.set(k, (seen.get(k) || 0) + 1); }
  const dups = [...seen].filter(([, n]) => n > 1);
  check(`${name}: ${rows.length} rows / ${seen.size} keys`, dups.length === 0,
    dups.length ? `${dups.length} duplicated keys, e.g. ${dups[0][0]} x${dups[0][1]}` : "no key carries >1 row");
}
const curs = [...new Set(wages.map(r => r.currency))];
check("minimum_wages.json is single-basis", curs.length === 1, `currency = ${JSON.stringify(curs)}`);

// ---- 2 · HPI base year --------------------------------------------------------------
console.log("\n=== 2 · HPI 2015 BASE (every geo's 2015 must average 100) ===");
const off = Object.keys(hpiYear).filter(g => hpiYear[g][2015] != null && Math.abs(hpiYear[g][2015] - 100) > 0.05);
check(`all ${Object.keys(hpiYear).length} geos average 100.0 in 2015`, off.length === 0,
  off.length ? off.map(g => `${g}=${hpiYear[g][2015].toFixed(2)}`).join(", ") : "max deviation < 0.05");
check("Greece absent (Eurostat publishes no HPI for EL)", hpiYear.EL == null, "not a pipeline defect — see process_hpi() docstring");
check("EU27_2020 aggregate present", hpiYear.EU27_2020 != null, hpiYear.EU27_2020 ? "official aggregate available to charts" : "missing");

// ---- 3 · HPI 2015 -> 2025, per country ----------------------------------------------
console.log("\n=== 3 · HOUSE PRICES 2015 -> 2025 (CH7) ===");
const Y0 = 2015, Y1 = 2025;
const hpiChg = g => (hpiYear[g]?.[Y0] && hpiYear[g]?.[Y1]) ? (hpiYear[g][Y1] / hpiYear[g][Y0] * 100 - 100) : null;
const hpiCountries = Object.keys(hpiYear).filter(g => /^[A-Z]{2}$/.test(g) && hpiYear[g][Y0] != null && hpiYear[g][Y1] != null);
const hpiRanked = hpiCountries.map(g => ({ g, name: meta[g]?.name || g, chg: hpiChg(g) })).sort((a, b) => b.chg - a.chg);
console.log("  rank  geo  country              2015->2025");
hpiRanked.forEach((r, i) => console.log(`  ${String(i + 1).padStart(4)}  ${r.g}   ${r.name.padEnd(20)} ${pct(r.chg)}%`));
check("Finland FELL over the window", hpiChg("FI") < 0, `FI = ${pct(hpiChg("FI"))}% (the shipped file said +5.0)`);
check("Hungary leads the rise", hpiRanked[0].g === "HU", `top = ${hpiRanked[0].g} ${pct(hpiRanked[0].chg)}%`);

// annual-average HICP index, DataManager/_annHicp method
const annHicp = (geo, y) => {
  const s = idxCP00[geo] || {}; const v = [];
  for (let m = 1; m <= 12; m++) { const x = s[`${y}-${String(m).padStart(2, "0")}`]; if (Number.isFinite(x)) v.push(x); }
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const hicpChg = geo => { const a = annHicp(geo, Y0), b = annHicp(geo, Y1); return (a && b) ? (b / a * 100 - 100) : null; };
const euAgg = ["EU27_2020", "EA20", "EA19", "EU", "EA"].find(c => idxCP00[c]);
console.log("\n=== 4 · CH7 STEP-0 EU PAIR ===");
console.log(`  HICP aggregate in use: ${euAgg}`);
const euHicp = hicpChg(euAgg);
const meanHpi = hpiCountries.reduce((s, g) => s + hpiChg(g), 0) / hpiCountries.length;
const aggHpi = hpiChg("EU27_2020");
console.log(`  consumer prices (${euAgg})           : ${pct(euHicp)}%`);
console.log(`  house prices, equal-weighted mean of ${hpiCountries.length}: ${pct(meanHpi)}%   <- what Housing.js draws today`);
console.log(`  house prices, official EU27_2020 aggregate : ${pct(aggHpi)}%   <- now available`);

// ---- 5 · real wages -----------------------------------------------------------------
// Verbatim port of DataManager.realWageRows(), parameterised by END WINDOW so the shipped
// window and a candidate one come out of ONE implementation -- two copies of this formula is
// how the on-screen and offline numbers drift apart. [P8.1] `2025` is the window the essay now
// runs on: 2019-S1 wage -> latest 2025 semester, HICP 2019-01 -> 2025-12.
const WINDOWS = {
  2024: { wage: ["2024-S1", "2024-S2", "2023-S2"], hicp: ["2024-01", "2023-12"], label: "2019 -> 2024" },
  2025: { wage: ["2025-S2", "2025-S1", "2024-S2"], hicp: ["2025-12", "2025-11"], label: "2019 -> 2025" },
};
function realWageRows(mw, win = 2024) {
  const W = WINDOWS[win];
  const pick = (obj, keys) => { for (const k of keys) if (obj?.[k] != null) return obj[k]; return null; };
  const rows = [];
  for (const code of Object.keys(meta)) {
    if (!meta[code].has_min_wage) continue;
    const w0 = mw[code]?.["2019-S1"] ?? mw[code]?.["2019-S2"];
    const w1 = pick(mw[code], W.wage);
    const p0 = idxCP00[code]?.["2019-01"];
    const p1 = pick(idxCP00[code], W.hicp);
    if ([w0, w1, p0, p1].some(v => v == null)) continue;
    const nom = (w1 - w0) / w0, hicp = (p1 - p0) / p0;
    rows.push({ code, name: meta[code].name, nominal: nom * 100, hicp: hicp * 100, real: ((1 + nom) / (1 + hicp) - 1) * 100 });
  }
  return rows.sort((a, b) => b.real - a.real);
}

const old2024 = realWageRows(mwOf(wages), 2024);
const shipped = realWageRows(mwOf(wages), 2025);   // [P8.1] the window the essay now runs on
console.log(`\n=== 5 · REAL MINIMUM WAGE, basis = ${curs[0]} — BOTH WINDOWS ===`);
console.log("  geo  country              nominal    HICP     real(2025)   was(2024)    shift");
shipped.forEach(r => {
  const o = old2024.find(x => x.code === r.code);
  console.log(`  ${r.code}   ${r.name.padEnd(20)} ${pct(r.nominal).padStart(7)}% ${pct(r.hicp).padStart(7)}% ${pct(r.real, 2).padStart(9)}%  ${pct(o?.real, 2).padStart(9)}%  ${pct(r.real - (o?.real ?? 0), 2).padStart(8)}`);
});
const nPos = shipped.filter(r => r.real >= 0).length, nNeg = shipped.length - nPos;
const oPos = old2024.filter(r => r.real >= 0).length;
console.log(`  --> 2019->2025: ${shipped.length} countries, ${nPos} gained, ${nNeg} lost   (2019->2024 was ${old2024.length}: ${oPos} gained, ${old2024.length - oPos} lost)`);
console.log(`  --> losers: ${shipped.filter(r => r.real < 0).map(r => `${r.name} ${pct(r.real, 2)}%`).join(", ") || "none"}`);
const near = [...shipped].sort((a, b) => Math.abs(a.real) - Math.abs(b.real))[0];
console.log(`  --> closest to zero: ${near.name} ${pct(near.real, 2)}%`);
console.log(`  --> best: ${shipped[0].name} ${pct(shipped[0].real, 2)}%   worst: ${shipped.at(-1).name} ${pct(shipped.at(-1).real, 2)}%`);
check("every min-wage country resolves in the 2025 window", shipped.length === old2024.length,
  `${shipped.length} rows vs ${old2024.length} in the 2024 window`);

// ---- 6 · race median pay vs prices ---------------------------------------------------
// verbatim port of RaceChart.render() (:54-91): months clamped 2019-01..2025-12; pay =
// median of per-country wage indexes (2019-S1 = 100) at semester points (S1->Jan, S2->Jul),
// linearly interpolated to each month and flat outside; gap read at the LAST month.
function raceGap(mw) {
  const geos = Object.keys(mw).filter(g => mw[g]["2019-S1"] != null);
  const pIdx = idxCP00[euAgg] || {}, pBase = pIdx["2019-01"];
  const months = Object.keys(pIdx).filter(t => t >= "2019-01" && t <= "2025-12").sort();
  const median = arr => { const a = arr.filter(x => x != null).sort((x, y) => x - y); if (!a.length) return null; const k = a.length >> 1; return a.length % 2 ? a[k] : (a[k - 1] + a[k]) / 2; };
  const periods = [];
  for (let yy = 2019; yy <= 2025; yy++) for (const s of ["S1", "S2"]) periods.push({ key: `${yy}-${s}`, m: `${yy}-${s === "S1" ? "01" : "07"}` });
  const mnum = m => { const [y, mm] = m.split("-").map(Number); return y * 12 + mm; };
  const payPts = periods.map(p => ({ t: mnum(p.m), v: median(geos.map(g => { const b = mw[g]["2019-S1"], v = mw[g][p.key]; return (b && v) ? v / b * 100 : null; })) })).filter(d => d.v != null);
  const payAt = m => {
    const t = mnum(m);
    if (t <= payPts[0].t) return payPts[0].v;
    if (t >= payPts.at(-1).t) return payPts.at(-1).v;
    for (let i = 1; i < payPts.length; i++) { const a = payPts[i - 1], b = payPts[i]; if (t <= b.t) return a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t)); }
    return payPts.at(-1).v;
  };
  const rows = months.map(m => ({ m, price: pBase ? pIdx[m] / pBase * 100 : null, pay: payAt(m) })).filter(d => d.price != null);
  const end = rows.at(-1);
  return { n: geos.length, lastM: end.m, lastPeriod: periods.at(-1).key, pay: end.pay, price: end.price };
}
const rg = raceGap(mwOf(wages));
console.log(`\n=== 6 · CH8 RACE FINISH (basis ${curs[0]}) ===`);
console.log(`  ${rg.n} wage-floor countries; pay read at ${rg.lastPeriod}, prices at ${rg.lastM}`);
console.log(`  median pay index ${rg.pay.toFixed(1)}  vs  price index ${rg.price.toFixed(1)}  -->  gap ${pct(rg.pay - rg.price)} points`);

// ---- 6b · per-country worst month of 2022 -------------------------------------------
// The evidence behind CH8 step 2's claim that the median hides the damage. For each
// country: its OWN minimum wage against its OWN HICP, both indexed to Jan-2019 = 100,
// evaluated every month of 2022. "In force" = the semester's floor actually being paid
// (S1 = Jan–Jun, S2 = Jul–Dec) — a real floor steps, it does not drift — with RaceChart's
// linear interpolation reported alongside so the drawn line and the sentence can be
// compared. A country "sat below where it started" when its real position went negative.
console.log("\n=== 6b · WORST MONTH OF 2022, COUNTRY BY COUNTRY (CH8 step 2's claim) ===");
{
  const mw = mwOf(wages);
  const geos = Object.keys(mw).filter(g => mw[g]["2019-S1"] != null).sort();
  const months2022 = Array.from({ length: 12 }, (_, i) => `2022-${String(i + 1).padStart(2, "0")}`);
  const mnum = m => { const [y, mm] = m.split("-").map(Number); return y * 12 + mm; };
  const rows = [];
  for (const g of geos) {
    const wBase = mw[g]["2019-S1"], pBase = idxCP00[g]?.["2019-01"];
    if (!wBase || !pBase) continue;
    const inForce = m => { const [y, mm] = m.split("-").map(Number); return mw[g][`${y}-${+mm <= 6 ? "S1" : "S2"}`]; };
    const pts = [];
    for (let yy = 2019; yy <= 2025; yy++) for (const s of ["S1", "S2"]) { const v = mw[g][`${yy}-${s}`]; if (v != null) pts.push({ t: mnum(`${yy}-${s === "S1" ? "01" : "07"}`), v }); }
    const interp = m => { const t = mnum(m); if (t <= pts[0].t) return pts[0].v; if (t >= pts.at(-1).t) return pts.at(-1).v; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (t <= b.t) return a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t)); } };
    let worst = null, worstI = null;
    for (const m of months2022) {
      const p = idxCP00[g]?.[m]; if (p == null) continue;
      const price = p / pBase;
      const w = inForce(m); if (w == null) continue;
      const real = ((w / wBase) / price - 1) * 100;
      if (!worst || real < worst.real) worst = { m, real };
      const realI = ((interp(m) / wBase) / price - 1) * 100;
      if (!worstI || realI < worstI.real) worstI = { m, real: realI };
    }
    if (worst) rows.push({ g, name: meta[g]?.name || g, ...worst, realI: worstI.real, mI: worstI.m });
  }
  rows.sort((a, b) => a.real - b.real);
  console.log("  geo  country              worst month   in-force   (interpolated)");
  rows.forEach(r => console.log(`  ${r.g}   ${r.name.padEnd(20)} ${r.m}      ${pct(r.real, 1).padStart(6)}%    ${pct(r.realI, 1).padStart(6)}%`));
  const below = rows.filter(r => r.real < 0), belowI = rows.filter(r => r.realI < 0);
  const modal = {};
  below.forEach(r => { modal[r.m] = (modal[r.m] || 0) + 1; });
  const commonest = Object.entries(modal).sort((a, b) => b[1] - a[1])[0];
  console.log(`  --> below their 2019 level at their own worst month of 2022: ${below.length} of ${rows.length}  (in force)`);
  console.log(`  --> same, using RaceChart's interpolated pay line          : ${belowI.length} of ${rows.length}`);
  console.log(`  --> commonest worst month: ${commonest ? `${commonest[0]} (${commonest[1]} countries)` : "n/a"}; deepest: ${below[0] ? `${below[0].name} ${pct(below[0].real, 1)}% in ${below[0].m}` : "none"}`);
  console.log(`  --> SENTENCE MUST SAY: "${below.length} of these ${rows.length} countries sat below where they started"`);

  // ---- 6c · the dumbbell's own table -------------------------------------------------
  // [P8.2] Exactly what DivergingBar draws: per country the 2022 trough (floor IN FORCE, the
  // semester step function -- NOT the race's interpolation) and the 2019->2025 endpoint. The
  // chart must reproduce both columns to the decimal; this is the offline source for that.
  console.log("\n=== 6c · DUMBBELL: 2022 TROUGH -> 2025 ENDPOINT (CH8b) ===");
  const endBy = new Map(shipped.map(r => [r.code, r.real]));
  const pairs = rows.filter(r => endBy.has(r.g))
    .map(r => ({ g: r.g, name: r.name, trough: r.real, month: r.m, now: endBy.get(r.g) }))
    .sort((a, b) => b.now - a.now);
  console.log("  geo  country              trough(2022)   month     now(2025)     recovery");
  pairs.forEach(r => console.log(`  ${r.g}   ${r.name.padEnd(20)} ${pct(r.trough, 2).padStart(9)}%   ${r.month}   ${pct(r.now, 2).padStart(9)}%   ${pct(r.now - r.trough, 2).padStart(9)}`));
  const stillUnder = pairs.filter(r => r.now < 0);
  const deepest = [...pairs].sort((a, b) => a.trough - b.trough)[0];
  console.log(`  --> domain: min trough ${pct(deepest.trough, 2)}% (${deepest.name}) .. max now ${pct(pairs[0].now, 2)}% (${pairs[0].name})`);
  console.log(`  --> under water at their 2022 trough: ${pairs.filter(r => r.trough < 0).length} of ${pairs.length}`);
  console.log(`  --> STILL under water in 2025        : ${stillUnder.length} of ${pairs.length}  ${stillUnder.map(r => `${r.name} ${pct(r.now, 2)}%`).join(", ")}`);
  console.log(`  --> biggest recovery: ${[...pairs].sort((a, b) => (b.now - b.trough) - (a.now - a.trough))[0].name}`);
  check("the dumbbell has a trough AND an endpoint for every drawn country", pairs.length === shipped.length,
    `${pairs.length} pairs vs ${shipped.length} ledger rows`);
}

// ---- 7 · basis comparison (optional) -------------------------------------------------
const altDir = process.argv[2];
if (altDir) {
  console.log("\n=== 7 · BASIS COMPARISON (OWNER GATE G1) ===");
  console.log("  basis       n  gained  lost   losers                                   CZ      LT      HU     best");
  const bases = readdirSync(altDir).filter(f => /^mw_.+\.json$/.test(f)).map(f => f.slice(3, -5)).sort();
  for (const b of bases) {
    const p = join(altDir, `mw_${b}.json`);
    if (!existsSync(p)) { console.log(`  ${b}: (missing ${p})`); continue; }
    const mw = mwOf(JSON.parse(readFileSync(p, "utf8")));
    const rows = realWageRows(mw), pos = rows.filter(r => r.real >= 0).length;
    const losers = rows.filter(r => r.real < 0).map(r => `${r.code} ${pct(r.real, 1)}`).join(" ");
    const get = c => pct(rows.find(r => r.code === c)?.real, 1);
    const g = raceGap(mw);
    console.log(`  ${b}   ${String(rows.length).padStart(2)}    ${String(pos).padStart(2)}    ${String(rows.length - pos).padStart(2)}   ${losers.padEnd(40)} ${get("CZ").padStart(6)} ${get("LT").padStart(6)} ${get("HU").padStart(6)}  ${rows[0].code} ${pct(rows[0].real, 1)}  | race gap ${pct(g.pay - g.price)}`);
  }
}

console.log(`\n=== RESULT: ${failures === 0 ? "ALL CHECKS PASS" : failures + " CHECK(S) FAILED"} ===`);
process.exit(failures ? 1 : 0);
