/* ============================================================
   Housing — CH7 "The biggest bill" (brief §6 CH7).
   The house price index (prc_hpi_q, total purchases, rebased 2015 = 100) against
   consumer prices (HICP CP00, same base). The gap is the story: over 2015–2025
   house prices climbed ~62% while consumer prices climbed ~33% — and only the
   second is in the inflation number on the news.
     step 0 (lines)     — both lines trace on
     step 1 (countries) — a dot-range of the top-5 / bottom-5 countries by HPI change,
                           each row also carrying a --ink tick at that SAME country's own
                           consumer-price rise over the identical window (D88 R3 — the
                           chart now proves the claim per-country, not just at EU level)
     step 2 (gap)       — the gap area between the two lines is tinted
   [D92] The EU line is Eurostat's own EU27_2020 aggregate. It was an equal-weighted
   country mean until round 6, on the belief that no official aggregate existed — it did,
   the old pipeline just filtered aggregates out before writing the file. The dot-range
   below is per-country and unaffected. Greece is absent from every view because Eurostat
   publishes no house price index for EL at all, so the country set is 26, not 27.
   [D88] Colour discipline: house prices (the protagonist) are --accent everywhere,
   including every dot in the step-1 range regardless of top/bottom group — the row's
   OWN position already carries the ranking, colour must not double-encode it. Consumer
   prices (the context line the reader already half-knows from the news) are --ink at
   reduced opacity, never blue, on the line chart AND on the step-1 tick. The kicker is
   retired (D88 R2) — the line-end labels and row values already carry every number the
   kicker repeated, and the reclaimed margin feeds the plot directly.
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { watchChapterProgress, smooth } from "../modules/ChartMotion.js";

const Y0 = 2015, Y1 = 2025;

// [D88 R4] view-transition timing — named so JS and the LOG/design-decision entries agree
// on one vocabulary. Concurrent pairs (lines out + rows in, etc.) share a start; the gap
// view is the one 3-phase SEQUENCE (rows/lines settle, THEN tint, THEN label) since the
// owner's spec chains them with "then... then", not "while".
const LINES_MS = 300;          // lines fade+slide duration, both directions
const LINES_SLIDE_PX = 24;     // how far the line-chart group recedes while exiting
const ROW_STAGGER_MS = 50;
const ROW_SLIDE_MS = 420;      // a row's own dot slide (x=0 -> value) / fade duration
const TICK_DELAY_MS = 150;     // the HICP tick starts this far "behind" its row's own start
const TICK_FADE_MS = 150;
const GAP_TINT_MS = 420;       // --dur-4
const GAP_LABEL_MS = 420;      // --dur-4 — "rises over --dur-4" (spec's own wording)
const GAP_LABEL_RISE_PX = 10;

export class Housing extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 22, right: 84, bottom: 34, left: 52 }, aspect: 1.4 });
    this._view = "lines";
    this._drawn = 0;
    this._zoom = "full";          // [§C.3] zoom only (no country chips — the dot-range already lists countries)
    this._lastStepIdx = -1;
    this._viewSeq = 0;             // [D88 R4] guards the gap view's 3-phase async sequence against a rapid re-trigger
  }

  size() {
    if (!this.container) return { width: 700, height: 520 };
    const w = this.container.clientWidth || 700;
    const h = this.container.clientHeight || Math.round(w / this.opts.aspect);
    return { width: w, height: Math.max(340, h) };
  }

  // annual avg of the HICP CP00 index for a year (from the monthly index) — EU aggregate.
  _annHicp(year) {
    const eu = this.data.euAggregateCode();
    const s = this.data.hicpIndex[eu]?.CP00 || {};
    const v = [];
    for (let m = 1; m <= 12; m++) { const x = s[`${year}-${String(m).padStart(2, "0")}`]; if (Number.isFinite(x)) v.push(x); }
    return v.length ? d3.mean(v) : null;
  }
  // [D88 R3] same annual-average method, one specific country's own CP00 series — proves
  // the claim per-country rather than only at the EU-aggregate level the line chart shows.
  _annHicpCountry(geo, year) {
    const s = this.data.hicpIndex[geo]?.CP00 || {};
    const v = [];
    for (let m = 1; m <= 12; m++) { const x = s[`${year}-${String(m).padStart(2, "0")}`]; if (Number.isFinite(x)) v.push(x); }
    return v.length ? d3.mean(v) : null;
  }
  _hicpCountryChg(geo) {
    const base = this._annHicpCountry(geo, Y0), end = this._annHicpCountry(geo, Y1);
    return (base && end) ? (end / base * 100 - 100) : null;
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const isPhone = this.size().width < 560;
    this._isPhone = isPhone;
    // [D88 R2] top margin shrunk now the kicker is gone — the reclaimed space becomes
    // plot height (ih grows), not dead air; a little headroom stays for the y-axis's own
    // top gridline/tick label to not feel clipped.
    this.opts.margin = isPhone ? { top: 18, right: 46, bottom: 30, left: 40 } : { top: 22, right: 86, bottom: 34, left: 52 };
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    const M = this.opts.margin;
    const iw = width - M.left - M.right, ih = height - M.top - M.bottom;
    this._iw = iw; this._ih = ih;

    // countries with 2015 HPI (for the dot-range; the EU line no longer averages them)
    const countries = Object.keys(this.data.hpi).filter(g => /^[A-Z]{2}$/.test(g) && this.data.hpi[g]?.[Y0] != null);
    this._countries = countries;
    // [D92] The EU line is Eurostat's OWN EU27_2020 aggregate, not an equal-weighted country
    // mean. The mean was a workaround for an aggregate the old pipeline filtered out before
    // writing the file, and it over-weighted small fast markets — Hungary's +267% counted the
    // same as Germany's +53%, inflating "the EU" to +93% against the official +62%. Falls back
    // to the mean if the aggregate is ever missing, so the chart cannot go blank on a data swap.
    const AGG = "EU27_2020";
    const hasAgg = this.data.hpi[AGG]?.[Y0] != null;
    this._euBasis = hasAgg ? AGG : "mean";
    const hpiEU = y => {
      if (hasAgg) { const b = this.data.hpi[AGG]?.[Y0], v = this.data.hpi[AGG]?.[y]; return (b && v) ? v / b * 100 : null; }
      const r = countries.map(g => { const b = this.data.hpi[g]?.[Y0], v = this.data.hpi[g]?.[y]; return (b && v) ? v / b * 100 : null; }).filter(x => x != null);
      return r.length ? d3.mean(r) : null;
    };
    const hicpBase = this._annHicp(Y0);
    const hicpEU = y => { const v = this._annHicp(y); return (v && hicpBase) ? v / hicpBase * 100 : null; };
    const years = d3.range(Y0, Y1 + 1);
    const hpiLine = years.map(y => ({ y, v: hpiEU(y) })).filter(d => d.v != null);
    const hicpLine = years.map(y => ({ y, v: hicpEU(y) })).filter(d => d.v != null);
    this._hpiLine = hpiLine; this._hicpLine = hicpLine;
    this._hpiEU = hpiEU; this._hicpEU = hicpEU; this._years = years;   // [§C.3] reused by _applyZoom
    const hpiEnd = hpiLine.at(-1).v, hicpEnd = hicpLine.at(-1).v;
    // [D92] derived, never a literal — the numbers in the alt text are the numbers drawn.
    this.svg.attr("aria-label", `House prices versus consumer prices in the EU, rebased to 100 in ${Y0}: by ${Y1} house prices climbed about ${Math.round(hpiEnd - 100)}% while consumer prices climbed about ${Math.round(hicpEnd - 100)}%.`);

    const x = d3.scaleLinear().domain([Y0, Y1]).range([0, iw]);
    const y = d3.scaleLinear().domain([95, Math.ceil((hpiEnd + 8) / 10) * 10]).range([ih, 0]);
    this._x = x; this._y = y;
    const g = this.svg.append("g").attr("transform", `translate(${M.left},${M.top})`);
    this._g = g;

    // grid + axes
    g.append("g").attr("class", "grid").call(d3.axisLeft(y).tickSize(-iw).ticks(5).tickFormat("")).lower();
    g.append("g").attr("class", "axis axis--x").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).tickValues(d3.range(Y0, Y1 + 1, isPhone ? 2 : 1)).tickFormat(d3.format("d")));
    g.append("g").attr("class", "axis axis--y").call(d3.axisLeft(y).ticks(5).tickFormat(d => d));
    // 2015 = 100 baseline. Label sits at the RIGHT end, just under the line — both series
    // start at (0,100) and only climb, so the left origin is congested; the right end of the
    // baseline is clear (nearest line is ~200px above there). [§C.1: no text on the marks]
    g.append("line").attr("class", "hs-base").attr("x1", 0).attr("x2", iw).attr("y1", y(100)).attr("y2", y(100));
    g.append("text").attr("class", "hs-base-label").attr("x", iw - 2).attr("y", y(100) + 13).attr("text-anchor", "end").text("2015 = 100");

    const uid = this.selector.replace(/[^\w]/g, "");
    const defs = this.svg.append("defs");
    const clip = defs.append("clipPath").attr("id", `hs-clip-${uid}`).append("rect").attr("x", -2).attr("y", -6).attr("width", 0).attr("height", ih + 12);
    this._clip = clip;

    // gap tint (between the two lines) — hidden until step 2. [D88 R4] the tint path and its
    // label now animate on INDEPENDENT timers (tint fades up, THEN the label rises) so they
    // live as siblings inside a neutral (always-opacity-1) clip wrapper, not one fading group.
    const gapArea = d3.area().x(d => x(d.y)).y0(d => y(hicpEU(d.y))).y1(d => y(hpiEU(d.y)));
    this._gapG = g.append("g").attr("clip-path", `url(#hs-clip-${uid})`);
    this._gapPath = this._gapG.append("path").datum(years.map(yy => ({ y: yy }))).attr("class", "hs-gap").attr("d", gapArea).style("opacity", 0);
    this._gapLabel = this._gapG.append("text").attr("class", "hs-gap-label").attr("x", x(2022)).attr("y", y((hpiEU(2022) + hicpEU(2022)) / 2)).attr("text-anchor", "middle").text("the gap").style("opacity", 0);
    this._gapLabelBaseY = y((hpiEU(2022) + hicpEU(2022)) / 2);

    // lines (clipped for scroll trace). [D88 R1] consumer prices is now the CONTEXT line —
    // --ink at reduced opacity, never blue; house prices stays the protagonist, --accent.
    const drawG = g.append("g").attr("clip-path", `url(#hs-clip-${uid})`);
    const lineFn = arr => d3.line().x(d => x(d.y)).y(d => y(d.v)).curve(d3.curveMonotoneX)(arr);
    drawG.append("path").datum(hicpLine).attr("class", "hs-line-hicp").attr("d", lineFn(hicpLine)).attr("fill", "none").attr("stroke", "var(--ink)").attr("stroke-opacity", 0.75).attr("stroke-width", 2).attr("stroke-linejoin", "round");
    drawG.append("path").datum(hpiLine).attr("class", "hs-line-hpi").attr("d", lineFn(hpiLine)).attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 2.8).attr("stroke-linejoin", "round");
    // end dots + labels. [D88 R1] colour lives entirely in charts.css's .hs-end-dot/label--hpi
    // /--hicp rules, not a JS presentation attribute — an SVG fill="" attribute loses to ANY
    // stylesheet rule touching the same property, including this file's own broad
    // ".chart-svg text{fill:--ink-soft}" default, so setting colour here would be silently inert.
    this._linesG = drawG;
    [["hpi", hpiLine.at(-1), `+${Math.round(hpiEnd - 100)}%`, "House prices"], ["hicp", hicpLine.at(-1), `+${Math.round(hicpEnd - 100)}%`, "Consumer prices"]].forEach(([k, d, lbl, name]) => {
      g.append("circle").attr("class", `hs-end-dot hs-end-${k}`).attr("cx", x(d.y)).attr("cy", y(d.v)).attr("r", 4);
      g.append("text").attr("class", `hs-end-label hs-end-label--${k}`).attr("x", x(d.y) + 8).attr("y", y(d.v) + 2).text(lbl);
      if (!isPhone) g.append("text").attr("class", "hs-end-name").attr("x", x(d.y) + 8).attr("y", y(d.v) + 24).text(name);
    });

    // ── country dot-range (step 1) ────────────────────────────────
    this._buildDotRange();

    // hover on lines
    this._wireHover();

    // motion
    // [P3.3] `_view` used to be hard-reset to "lines" on EVERY render, so a dark-mode toggle taken
    // on step 1 or 2 visibly rewound the chapter — the dot-range vanished and the reader was back
    // at the opening view. render() is called bare by BaseChart.resize()/onThemeChange with no step
    // re-entry guaranteed to follow, so it must repaint what is already current. Waffle's own
    // firstMount pattern (WaffleChart.js ~236) is the model. `_drawn` genuinely does start at 0
    // here: watchChapterProgress computes once on subscribe, so the latch refills immediately from
    // the real scroll position.
    this._drawn = 0;
    this._viewSeq++;   // [P3.5] a re-render supersedes any in-flight gap-phase sequence
    const firstMount = this._view == null;
    if (firstMount) this._view = this.ctx.motion.reduced ? "gap" : "lines";   // reduced mounts at the settled end state
    if (this.ctx.motion.reduced) { this._revealTo(1); this._snapView(this._view); }
    else { this._wireScroll(); if (!firstMount) this._snapView(this._view); }

    // [§C.3] zoom presets (no country chips — the dot-range already lists countries) + restore on re-render
    this._buildControls();
    if (this._zoom === "crisis") this._applyZoom("crisis", false);
  }

  _controlsHost() { return document.getElementById(this.container.id + "-controls"); }
  _buildControls() {
    const host = this._controlsHost(); if (!host) return;
    if (host.dataset.wired === "1") { this._syncZoomButtons(); return; }
    host.dataset.wired = "1";
    host.innerHTML =
      `<span class="ac-add-label">Zoom</span>` +
      `<span class="ac-zoom" role="group" aria-label="Zoom the timeline">` +
      `<button type="button" class="ac-zoom-btn is-on" data-zoom="full">2015 – 2025</button>` +
      `<button type="button" class="ac-zoom-btn" data-zoom="crisis">2021 – 2023</button></span>`;
    host.querySelectorAll(".ac-zoom-btn").forEach(b => b.addEventListener("click", () => this._applyZoom(b.dataset.zoom, true)));
  }
  _syncZoomButtons() { const host = this._controlsHost(); if (!host) return; host.querySelectorAll(".ac-zoom-btn").forEach(b => b.classList.toggle("is-on", b.dataset.zoom === this._zoom)); }
  _applyZoom(preset, animate) {
    this._zoom = preset;
    const x = this._x, y = this._y, iw = this._iw;
    x.domain(preset === "crisis" ? [2021, 2023] : [Y0, Y1]);
    this._drawn = 1; if (this._clip) this._clip.attr("width", iw + 4);
    const dur = (animate && !this.ctx.motion.reduced) ? 600 : 0;
    const t = d3.transition().duration(dur).ease(d3.easeCubicInOut);
    const crisis = preset === "crisis";
    const lineFn = arr => d3.line().x(d => x(d.y)).y(d => y(d.v)).curve(d3.curveMonotoneX)(arr);
    this._g.select(".axis--x").transition(t).call(d3.axisBottom(x).tickValues(crisis ? [2021, 2022, 2023] : d3.range(Y0, Y1 + 1, this._isPhone ? 2 : 1)).tickFormat(d3.format("d")));
    this._g.select(".hs-line-hicp").transition(t).attr("d", lineFn(this._hicpLine));
    this._g.select(".hs-line-hpi").transition(t).attr("d", lineFn(this._hpiLine));
    const gapArea = d3.area().x(d => x(d.y)).y0(d => y(this._hicpEU(d.y))).y1(d => y(this._hpiEU(d.y)));
    this._gapPath.transition(t).attr("d", gapArea(this._years.map(yy => ({ y: yy }))));
    if (this._gapLabel) { this._gapLabelBaseY = y((this._hpiEU(2022) + this._hicpEU(2022)) / 2); this._gapLabel.transition(t).attr("x", x(2022)).attr("y", this._gapLabelBaseY); }
    this._g.selectAll(".hs-end-dot,.hs-end-label,.hs-end-name").style("opacity", crisis ? 0 : 1);
    this._syncZoomButtons();
  }

  // [D88 R3+R4] each row is now one <g class="hs-row"> (hit-rect, name, stem, HPI dot, HICP
  // tick, value) so the cascade transitions can select-and-stagger by row instead of juggling
  // five parallel flat selections. [D88 R1] one .hs-dot class, --accent always (see file header).
  // [D88 R4] rows are compact (ROW_H) and the row BLOCK centers in the space below the
  // title/legend/tick-axis header, not stretched to fill the whole panel.
  _buildDotRange() {
    const cs = this._countries;
    const per = cs.map(g => ({ g, name: this.data.countryName(g), chg: this.data.hpi[g][Y1] / this.data.hpi[g][Y0] * 100 - 100, hicpChg: this._hicpCountryChg(g) }))
      .filter(d => Number.isFinite(d.chg)).sort((a, b) => b.chg - a.chg);
    const top5 = per.slice(0, 5), bot5 = per.slice(-5);
    const rows = [...top5, { sep: true }, ...bot5];
    this._dotRows = rows;
    this._dotG = this.svg.append("g").attr("class", "hs-dotrange");
    const M = this.opts.margin, iw = this._iw, ih = this._ih;
    const x0 = M.left;
    const maxHpiChg = d3.max(per, d => d.chg);
    const maxHicpChg = d3.max(top5.concat(bot5), d => d.hicpChg) || 0;
    const domainMax = Math.ceil(Math.max(maxHpiChg, maxHicpChg) / 50) * 50;   // [D88 R3] extend for either series — nothing clips
    const xr = d3.scaleLinear().domain([0, domainMax]).range([M.left + (this._isPhone ? 78 : 128), M.left + iw - 16]);
    this._xr = xr;

    // header block: title -> legend -> tick-value axis, then the row BLOCK centers below it.
    const titleY = M.top + 14;
    const legendY = titleY + 22;
    const tickY = legendY + 22;
    const rowsTop0 = tickY + 16;
    const ROW_H = this._isPhone ? 34 : 40;   // [D88 R4] compact, not panel-filling
    const contentRowsH = rows.length * ROW_H;
    const rowsAvailH = Math.max(ROW_H, (M.top + ih) - rowsTop0);
    const rowsStart = rowsTop0 + Math.max(0, (rowsAvailH - contentRowsH) / 2);   // [D88 R4] centered block
    this._rowH = ROW_H; this._rowsStart = rowsStart;

    // [D88 fix] title/legend/tick-axis are a SEPARATE sub-group from the rows, so they can be
    // shown/hidden as one unit alongside the row cascade — appending them straight into _dotG
    // (as the ORIGINAL pre-D88 code did) left them permanently visible bleeding into the lines
    // and gap views, since only individual .hs-row opacity was ever being toggled, never this
    // header content (caught by reading the step-0 screenshot, not assumed away).
    this._dotHeaderG = this._dotG.append("g").attr("class", "hs-dot-header");
    this._dotHeaderG.append("text").attr("class", "hs-dot-title").attr("x", x0).attr("y", titleY).text("HOUSE-PRICE RISE 2015 → 2025, BY COUNTRY");

    // [D88 R3] legend — real dot + real tick swatches (not glyph characters), verbatim text.
    const legend = this._dotHeaderG.append("g").attr("class", "hs-legend");
    let lx = x0;
    legend.append("circle").attr("class", "hs-legend-dot").attr("cx", lx + 3.5).attr("cy", legendY - 4).attr("r", 3.5);
    lx += 12;
    const t1 = legend.append("text").attr("class", "hs-legend-text").attr("x", lx).attr("y", legendY).text("house prices");
    lx += t1.node().getComputedTextLength() + 10;
    const dotSep = legend.append("text").attr("class", "hs-legend-text").attr("x", lx).attr("y", legendY).text("·");
    lx += dotSep.node().getComputedTextLength() + 10;
    legend.append("line").attr("class", "hs-legend-tick").attr("x1", lx).attr("x2", lx).attr("y1", legendY - 8).attr("y2", legendY - 1);
    lx += 10;
    legend.append("text").attr("class", "hs-legend-text").attr("x", lx).attr("y", legendY).text("consumer prices, same country");

    xr.ticks(4).forEach(t => this._dotHeaderG.append("text").attr("class", "hs-dot-tick").attr("x", xr(t)).attr("y", tickY).attr("text-anchor", "middle").text(`+${t}%`));
    this._dotHeaderG.style("opacity", 0);

    this._rowSel = [];
    rows.forEach((r, i) => {
      const yy = rowsStart + i * ROW_H + ROW_H / 2;
      if (r.sep) {
        const row = this._dotG.append("g").attr("class", "hs-row hs-row--sep");
        row.append("text").attr("class", "hs-dot-sep").attr("x", (M.left + M.left + iw) / 2).attr("y", yy + 2).attr("text-anchor", "middle").text("· · ·  16 more countries in between  · · ·");
        this._rowSel.push(row);
        return;
      }
      const row = this._dotG.append("g").attr("class", "hs-row").datum(r);
      // full-width hit-rect: [D88 R3] hover anywhere on the row shows the house tooltip.
      row.append("rect").attr("class", "hs-row-hit").attr("x", x0).attr("y", yy - ROW_H / 2).attr("width", iw).attr("height", ROW_H).attr("fill", "transparent")
        .on("mouseenter mousemove", (event) => this._rowTip(event, r))
        .on("mouseleave", () => this.ctx.tooltip.hide());
      row.append("text").attr("class", "hs-dot-name").attr("x", xr.range()[0] - 8).attr("y", yy + 3).attr("text-anchor", "end").text(r.name);
      row.append("line").attr("class", "hs-dot-stem").attr("x1", xr(0)).attr("x2", xr(r.chg)).attr("y1", yy).attr("y2", yy);
      row.append("circle").attr("class", "hs-dot").attr("cx", xr(r.chg)).attr("cy", yy).attr("r", 4.5);
      row.append("text").attr("class", "hs-dot-val").attr("x", xr(r.chg) + 9).attr("y", yy + 3).text(`+${Math.round(r.chg)}%`);
      // [D88 R3] the second marker — a short 2px --ink tick at this SAME country's own
      // consumer-price rise over the identical 2015->2025 window.
      if (Number.isFinite(r.hicpChg)) {
        row.append("line").attr("class", "hs-tick").attr("x1", xr(r.hicpChg)).attr("x2", xr(r.hicpChg)).attr("y1", yy - 7).attr("y2", yy + 7);
      }
      this._rowSel.push(row);
    });
    // resting state: hidden (the "lines" view is the mount default) — dots parked at their
    // OWN final x already (no visible pop when a reduced-motion session snaps straight to
    // "countries"); the cascade-in only touches opacity/x on an ANIMATED entry (see _enterRows).
    this._dotG.selectAll(".hs-row").style("opacity", 0);
    this._dotG.selectAll(".hs-tick").style("opacity", 0);
  }

  _rowTip(event, r) {
    this.ctx.tooltip.show(
      `<h5>${r.name}</h5><div class="row"><span class="key">Houses</span><span class="val">+${Math.round(r.chg)}%</span></div><div class="row"><span class="key">Prices</span><span class="val">${r.hicpChg == null ? "—" : (r.hicpChg >= 0 ? "+" : "") + Math.round(r.hicpChg) + "%"}</span></div>`,
      event.clientX, event.clientY);
  }

  _wireHover() {
    const x = this._x, y = this._y, g = this._g, iw = this._iw, ih = this._ih;
    const cur = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", ih).style("opacity", 0);
    g.append("rect").attr("x", 0).attr("y", 0).attr("width", iw).attr("height", ih).attr("fill", "transparent")
      .on("mousemove", (event) => {
        if (this._view !== "lines" && this._view !== "gap") return;
        const [mx] = d3.pointer(event, g.node());
        const yr = Math.max(Y0, Math.min(Y1, Math.round(x.invert(mx))));
        const hp = this._hpiLine.find(d => d.y === yr), hc = this._hicpLine.find(d => d.y === yr);
        cur.style("opacity", 1).attr("x1", x(yr)).attr("x2", x(yr));
        this.ctx.tooltip.show(`<h5>${yr}</h5><div class="row"><span class="key">House prices</span><span class="val">${hp ? hp.v.toFixed(0) : "—"}</span></div><div class="row"><span class="key">Consumer prices</span><span class="val">${hc ? hc.v.toFixed(0) : "—"}</span></div>`, event.clientX, event.clientY);
      })
      .on("mouseleave", () => { cur.style("opacity", 0); this.ctx.tooltip.hide(); });
  }

  _wireScroll() { if (this._unwatch) this._unwatch(); const chapter = this.container.closest(".chapter"); this._unwatch = watchChapterProgress(chapter, p => this._onProgress(p)); this._watchUnpin(chapter, () => { this._revealTo(1); this._snapView("gap"); this._view = "gap"; }); }   /* [A2 §B.4] */
  _onProgress(p) { const t = smooth(Math.max(0, Math.min(1, p / 0.16))); if (t > this._drawn) this._revealTo(t); }
  _revealTo(np) { this._drawn = Math.max(this._drawn, np); this._clip.attr("width", Math.max(0, this._drawn * (this._iw + 4))); }

  onStep(index, el) {
    const view = (el && el.dataset.view) || ["lines", "countries", "gap"][Math.max(0, Math.min(2, index))];
    if (this.container) { this.container.setAttribute("data-active-view", view); this.container.setAttribute("data-onstep", index); }
    const stepChanged = (index !== this._lastStepIdx); this._lastStepIdx = index;   // [§C.3]
    if (stepChanged && this._zoom !== "full") this._applyZoom("full", true);
    this._setView(view);
  }

  // [D88 R4] view transitions are now TIMED on step entry, same speed whether reached by
  // scroll or a rail-jump — replaces the old plain 420ms cross-fade. Adjacent views
  // (lines<->countries, countries<->gap) play the owner's named choreography; a rail-jump
  // that skips a view entirely (lines<->gap direct) snaps instead of racing a multi-phase
  // animation the reader never watched start, matching this project's established
  // rail-jump-safety precedent (D86/D87).
  /* [P2.3] The 10 full-plot-width row hit-rects live in _dotG, which is appended ABOVE the line
     group — and opacity 0 hides a rect without stopping it hit-testing. Outside the countries
     view they therefore swallowed every mousemove: the year crosshair never appeared anywhere on
     the plot, and hovering the line chart popped a country ROW's tooltip. They are live only
     where the rows actually are. Called from both view entry points — _setView covers every
     animated transition, _snapView covers the reduced-motion mount and the unpin reset, which
     assign `_view` directly. */
  _setHitLive(view) { this._dotG?.classed("is-hit-live", view === "countries"); }

  _setView(view) {
    const prev = this._view;
    this._view = view;
    this._setHitLive(view);
    if (!this.rendered) return;
    if (this.ctx.motion.reduced) { this._snapView(view); return; }
    if (prev === view) return;
    const adjacent = (prev === "lines" && view === "countries") || (prev === "countries" && view === "lines")
      || (prev === "countries" && view === "gap") || (prev === "gap" && view === "countries");
    if (!adjacent) { this._snapView(view); return; }
    if (prev === "lines" && view === "countries") { this._exitLines(); this._enterRows(); }
    else if (prev === "countries" && view === "lines") { this._exitRows(); this._enterLines(); }
    else if (prev === "countries" && view === "gap") this._countriesToGap();
    else if (prev === "gap" && view === "countries") this._gapToCountries();
  }

  _snapView(view) {
    this._setHitLive(view);
    const M = this.opts.margin;
    this._g.interrupt("view").style("opacity", view === "lines" || view === "gap" ? 1 : 0).attr("transform", `translate(${M.left},${M.top})`);
    this._dotHeaderG.interrupt("header").style("opacity", view === "countries" ? 1 : 0);
    this._dotG.selectAll(".hs-row").interrupt("row").style("opacity", view === "countries" ? 1 : 0);
    this._dotG.selectAll(".hs-dot").interrupt("row").attr("cx", d => this._xr(d.chg));
    this._dotG.selectAll(".hs-tick").interrupt("row").style("opacity", view === "countries" ? 1 : 0);
    this._gapPath.interrupt("gaptint").style("opacity", view === "gap" ? 1 : 0);
    if (this._gapLabel) this._gapLabel.interrupt("gaplabel").style("opacity", view === "gap" ? 1 : 0).attr("transform", null);
  }

  _exitLines() {
    const M = this.opts.margin;
    return this._g.interrupt("view").transition("view").duration(LINES_MS).ease(d3.easeCubicIn)
      .style("opacity", 0).attr("transform", `translate(${M.left - LINES_SLIDE_PX},${M.top})`).end().catch(() => {});
  }
  _enterLines() {
    const M = this.opts.margin;
    this._g.attr("transform", `translate(${M.left - LINES_SLIDE_PX},${M.top})`).style("opacity", 0);
    return this._g.interrupt("view").transition("view").duration(LINES_MS).ease(d3.easeCubicOut)
      .style("opacity", 1).attr("transform", `translate(${M.left},${M.top})`).end().catch(() => {});
  }

  // [D88 R4] "dots slide from x=0 to their value, ticks fade in 150ms behind" — per-row
  // stagger (50ms), the dot itself is the one sliding mark, the tick/stem/name/value fade in.
  _enterRows() {
    const xr = this._xr;
    this._dotHeaderG.interrupt("header").style("opacity", 0).transition("header").duration(200).style("opacity", 1);
    const dataRows = this._rowSel.filter(r => r.datum());
    dataRows.forEach((row, i) => {
      const d = row.datum();
      const delay = i * ROW_STAGGER_MS;
      row.interrupt("row").transition("row").delay(delay).duration(1).style("opacity", 1);
      row.selectAll(".hs-dot-stem,.hs-dot-name,.hs-dot-val").interrupt("row").style("opacity", 0)
        .transition("row").delay(delay).duration(200).style("opacity", 1);
      row.select(".hs-dot").interrupt("row").attr("cx", xr(0))
        .transition("row").delay(delay).duration(ROW_SLIDE_MS).ease(d3.easeCubicOut).attr("cx", xr(d.chg));
      row.select(".hs-tick").interrupt("row").style("opacity", 0)
        .transition("row").delay(delay + TICK_DELAY_MS).duration(TICK_FADE_MS).style("opacity", 1);
    });
    const sepRow = this._rowSel.find(r => !r.datum());
    if (sepRow) sepRow.interrupt("row").style("opacity", 0).transition("row").delay(dataRows.length * ROW_STAGGER_MS / 2).duration(200).style("opacity", 1);
  }
  // reverse cascade: last row first, working back to the first — an "unwind" of the entry order.
  _exitRows() {
    this._dotHeaderG.interrupt("header").transition("header").duration(150).style("opacity", 0);
    const dataRows = this._rowSel.filter(r => r.datum());
    const n = dataRows.length;
    dataRows.forEach((row, i) => {
      const delay = (n - 1 - i) * ROW_STAGGER_MS;
      row.select(".hs-tick").interrupt("row").transition("row").delay(delay).duration(TICK_FADE_MS).style("opacity", 0);
      row.selectAll(".hs-dot-stem,.hs-dot-name,.hs-dot-val").interrupt("row").transition("row").delay(delay).duration(150).style("opacity", 0);
      row.select(".hs-dot").interrupt("row").transition("row").delay(delay).duration(ROW_SLIDE_MS).ease(d3.easeCubicIn).attr("cx", this._xr(0));
      row.interrupt("row").transition("row").delay(delay + ROW_SLIDE_MS).duration(1).style("opacity", 0);
    });
    const sepRow = this._rowSel.find(r => !r.datum());
    if (sepRow) sepRow.interrupt("row").transition("row").duration(150).style("opacity", 0);
  }

  _fadeGapTint(to) { return this._gapPath.interrupt("gaptint").transition("gaptint").duration(GAP_TINT_MS).style("opacity", to).end().catch(() => {}); }
  _riseGapLabel(to) {
    if (!this._gapLabel) return Promise.resolve();
    const y0 = this._gapLabelBaseY + GAP_LABEL_RISE_PX, y1 = this._gapLabelBaseY;
    if (to === 1) this._gapLabel.attr("transform", `translate(0,${GAP_LABEL_RISE_PX})`).style("opacity", 0);
    return this._gapLabel.interrupt("gaplabel").transition("gaplabel").duration(GAP_LABEL_MS).ease(d3.easeCubicOut)
      .style("opacity", to).attr("transform", to === 1 ? "translate(0,0)" : `translate(0,${GAP_LABEL_RISE_PX})`).end().catch(() => {});
  }
  async _countriesToGap() {
    const seq = ++this._viewSeq;
    this._exitRows(); this._enterLines();
    const dataRowCount = this._rowSel.filter(r => r.datum()).length;
    // [P3.5] The phase gap is a real timer and needs a handle — destroy() (and a re-render) must be
    // able to cancel it. The _viewSeq check after it already stops a superseded sequence from
    // acting, but the timeout itself kept the callback alive until it fired.
    await new Promise(r => { this._gapPhaseT = setTimeout(r, Math.max(LINES_MS, (dataRowCount - 1) * ROW_STAGGER_MS + ROW_SLIDE_MS)); });
    if (seq !== this._viewSeq) return;
    await this._fadeGapTint(1);
    if (seq !== this._viewSeq) return;
    await this._riseGapLabel(1);
  }
  async _gapToCountries() {
    const seq = ++this._viewSeq;
    await this._riseGapLabel(0);
    if (seq !== this._viewSeq) return;
    await this._fadeGapTint(0);
    if (seq !== this._viewSeq) return;
    this._exitLines(); this._enterRows();
  }

  destroy() { if (this._unwatch) this._unwatch(); clearTimeout(this._gapPhaseT); super.destroy(); }
  onThemeChange() { this.render(); }
}
