/* ============================================================
   WaffleChart — CH6 "The kitchen table" (REBUILD, brief §6 CH6).
   Two halves in one body:
     LEFT  — the 100-cell waffle: €1 of 2019 purchasing power; eroded cells (claret→ghost).
             EU-27 = 77 solid / 23 eroded; Hungary = 61.
     RIGHT — the hero's six basket lines as paired bars: the 2019 base (€30/22/15/14/10/9)
             vs the same line at Dec-2025, priced for the SELECTED country (matches the
             receipt to the cent for EU-27).
   A country <select> re-animates both halves in one transition (never re-mounts).
   Key stays `waffle` in the factory (brief allows).
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { watchChapterProgress, smooth } from "../modules/ChartMotion.js";

const BASKET = [
  { cat: "CP04",  label: "Rent & water",       base: 30 },
  { cat: "CP01",  label: "Groceries",          base: 22 },
  { cat: "SERV",  label: "Services",           base: 15 },
  { cat: "CP07",  label: "Petrol & transport", base: 14 },
  { cat: "CP045", label: "Electricity & gas",  base: 10 },
  { cat: "CP11",  label: "Café & restaurants", base: 9  },
];
const START = "2019-01";

export class WaffleChart extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 56, right: 20, bottom: 24, left: 20 }, aspect: 1.3 });
    this.geo = "EU27_2020";
    this.controlsEl = document.getElementById("chart-waffle-controls");
    this._erodeP = 0;
  }

  size() {
    if (!this.container) return { width: 720, height: 560 };
    const w = this.container.clientWidth || 720;
    const h = this.container.clientHeight || Math.round(w / this.opts.aspect);
    return { width: w, height: Math.max(360, h) };
  }

  // carry-forward guard (last known value at or before t) — matches ReceiptHero.
  _at(series, t) {
    if (!series) return null;
    if (series[t] != null) return series[t];
    const ks = Object.keys(series).filter(k => k <= t).sort();
    return ks.length ? series[ks.at(-1)] : null;
  }
  _lastMonth(geo) {
    const s = this.data.hicpIndex[geo]?.CP00 || {};
    const ks = Object.keys(s).filter(k => k <= "2025-12").sort();
    return ks.at(-1) || "2025-12";
  }
  // €100 CP00 purchasing power at end (77.1 EU, 61.1 HU).
  _power(geo) {
    const s = this.data.hicpIndex[geo]?.CP00; if (!s) return null;
    const b = this._at(s, START), e = this._at(s, this._lastMonth(geo));
    return (b && e) ? 100 * b / e : null;
  }
  // a basket line's Dec-2025 nominal value for geo.
  _lineVal(geo, cat, base) {
    const s = this.data.hicpIndex[geo]?.[cat]; if (!s) return null;
    const b = this._at(s, START), e = this._at(s, this._lastMonth(geo));
    return (b && e) ? base * e / b : null;
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const isPhone = this.size().width < 620;
    this._isPhone = isPhone;
    this.opts.margin = isPhone ? { top: 48, right: 14, bottom: 20, left: 14 } : { top: 56, right: 20, bottom: 24, left: 20 };
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    this.svg.attr("aria-label", "The €100 monthly basket of 2019, priced for one country: on the left, its purchasing power today (77 of 100 euros for the EU-27); on the right, the six spending lines and how much each costs now.");
    const M = this.opts.margin;
    const iw = width - M.left - M.right, ih = height - M.top - M.bottom;
    this._iw = iw; this._ih = ih;
    const contentY = M.top;

    // ── layout: LEFT waffle | RIGHT bars ──────────────────────────
    // phone stacks: waffle on top, bars below.
    const gap = isPhone ? 12 : 34;
    const leftW = isPhone ? iw : Math.min(iw * 0.42, ih);
    const rightX = isPhone ? 0 : leftW + gap;
    const rightW = isPhone ? iw : iw - leftW - gap;
    // waffle geometry
    const cols = 10, rows = 10;
    const waffleSide = isPhone ? Math.min(leftW, ih * 0.42) : Math.min(leftW, ih);
    const cellPitch = waffleSide / cols;
    const cellGap = Math.max(2, cellPitch * 0.12);
    const cellSize = cellPitch - cellGap;
    const waffleX = M.left + (isPhone ? (iw - waffleSide) / 2 : 0);
    const waffleY = contentY + (isPhone ? 0 : Math.max(0, (ih - waffleSide) / 2));
    this._waffle = { cols, rows, cellPitch, cellSize, x: waffleX, y: waffleY };
    // bars geometry
    const barsX = M.left + (isPhone ? 0 : rightX);
    const barsY = isPhone ? contentY + waffleSide + 26 : contentY + 8;
    const barsW = isPhone ? iw : rightW;
    const barsH = isPhone ? ih - waffleSide - 40 : ih - 16;
    this._bars = { x: barsX, y: barsY, w: barsW, h: barsH };

    // ── kicker (purchasing power €77 / €61) ───────────────────────
    // kicker = the purchasing power (€77 EU / €61 HU); country comes from the step card + subtitle.
    this._kickNum = this.svg.append("text").attr("class", "kick-num").attr("x", M.left).attr("y", isPhone ? 38 : 46).style("font-size", isPhone ? "30px" : "42px").text("€77");
    // right-side title over the bars
    this._barsTitle = this.svg.append("text").attr("class", "legend-title").attr("x", barsX).attr("y", (isPhone ? barsY - 8 : contentY - 2)).text("WHERE THE €100 GOES — 2019 → NOW");

    // ── waffle cells (persistent) — eroded = claret (the loss, brief §6), survived = muted ──
    const cellData = d3.range(100).map(i => { const col = i % cols, row = Math.floor(i / cols); return { i, col, row, idx: (rows - 1 - row) * cols + col }; });
    const wf = this._waffle;
    this._cells = this.svg.selectAll("rect.waffle-cell").data(cellData, d => d.i).join("rect")
      .attr("class", "waffle-cell")
      .attr("x", d => wf.x + d.col * wf.cellPitch).attr("y", d => wf.y + d.row * wf.cellPitch)
      .attr("width", wf.cellSize).attr("height", wf.cellSize).attr("rx", 2)
      .on("mouseenter", (e) => this._cellTip(e))
      .on("mousemove", (e) => this.ctx.tooltip.move(e.clientX, e.clientY))
      .on("mouseleave", () => this.ctx.tooltip.hide())
      .on("pointerdown", (e) => { if (e.pointerType !== "mouse") this._cellTip(e); });

    // ── basket bars (persistent groups) ───────────────────────────
    this._buildBars();

    // country picker
    this._renderControls();

    // ── data + motion ─────────────────────────────────────────────
    this._erodeP = 0;
    this._update(true);
    if (this.ctx.motion.reduced) {
      this._erodeP = 1; this._applyWaffle(1); this._growBars(1);
    } else {
      if (this._unsub) this._unsub();
      const chapter = this.container.closest(".chapter");
      this._unsub = watchChapterProgress(chapter, p => this._onProgress(p));
    }
  }

  _buildBars() {
    const { x, y, w, h } = this._bars;
    const maxVal = 46;   // headroom above rent's ~40.5
    const xScale = d3.scaleLinear().domain([0, maxVal]).range([0, w - 46]);
    const yBand = d3.scaleBand().domain(BASKET.map(b => b.cat)).range([0, h]).padding(0.34);
    this._barX = xScale; this._barY = yBand; this._barX0 = x + 46;
    const bh = yBand.bandwidth();
    this._barG = new Map();
    BASKET.forEach(b => {
      const g = this.svg.append("g").attr("class", "wf-barrow").attr("data-cat", b.cat)
        .attr("transform", `translate(${this._barX0},${y + yBand(b.cat)})`)
        .style("cursor", "default")
        .on("mouseenter", (e) => this._barTip(e, b))
        .on("mousemove", (e) => this.ctx.tooltip.move(e.clientX, e.clientY))
        .on("mouseleave", () => this.ctx.tooltip.hide());
      // category label
      g.append("text").attr("class", "wf-bar-label").attr("x", -6).attr("y", bh / 2 - 6).attr("text-anchor", "end").text(b.label);
      // 2019 base bar (muted, top half) + 2025 bar (claret, bottom half)
      g.append("rect").attr("class", "wf-bar-2019").attr("x", 0).attr("y", 0).attr("height", bh * 0.42).attr("width", 0).attr("rx", 1.5);
      g.append("rect").attr("class", "wf-bar-2025").attr("x", 0).attr("y", bh * 0.52).attr("height", bh * 0.42).attr("width", 0).attr("rx", 1.5);
      g.append("text").attr("class", "wf-bar-v2019").attr("x", 0).attr("y", bh * 0.42 - 3).attr("text-anchor", "start");
      g.append("text").attr("class", "wf-bar-v2025").attr("x", 0).attr("y", bh * 0.94).attr("text-anchor", "start");
      // full-row hit area
      g.insert("rect", ":first-child").attr("class", "wf-bar-hit").attr("x", -160).attr("y", -2).attr("width", w + 160).attr("height", bh + 4).attr("fill", "transparent");
      this._barG.set(b.cat, g);
    });
  }

  _renderControls() {
    const c = this.controlsEl; if (!c) return;
    if (c.dataset.wired === "1") { const s = c.querySelector("select"); if (s && s.value !== this.geo) s.value = this.geo; return; }
    c.dataset.wired = "1";
    const codes = ["EU27_2020", ...this.data.euCodes()].filter(code => BASKET.every(b => (this.data.hicpIndex[code]?.[b.cat]?.[START] != null)) && this.data.hicpIndex[code]?.CP00?.[START] != null);
    const opt = codes.map(code => `<option value="${code}" ${code === this.geo ? "selected" : ""}>${code === "EU27_2020" ? "EU-27 average" : this.data.countryName(code)}</option>`).join("");
    c.innerHTML = `<label class="waffle-ctrl">Country&nbsp;<select data-w-geo aria-label="Country">${opt}</select></label>`;
    c.querySelector("[data-w-geo]").addEventListener("change", e => { this.geo = e.target.value; this._update(false); });
  }

  // recompute + animate both halves (one 600ms transition), never remount.
  _update(immediate) {
    const power = this._power(this.geo);
    this._fillN = power == null ? 0 : Math.round(power);
    this._power$ = power;
    // waffle: mark cells on/off vs waterline
    this._cells.each(d => { d._on = d.idx < this._fillN; });
    this._applyWaffle(this._erodeP);
    // bars
    this._lineVals = BASKET.map(b => ({ ...b, v: this._lineVal(this.geo, b.cat, b.base) }));
    this._growBars(this._barsShown ? 1 : (this.ctx.motion.reduced ? 1 : 0), immediate);
    // kicker (the purchasing power number, tweened on country change)
    if (immediate || this.ctx.motion.reduced) this._kickNum.text(power == null ? "—" : `€${this._fillN}`);
    else this._tweenKicker(this._fillN);
  }

  _tweenKicker(to) {
    const from = this._kickShown ?? to; this._kickShown = to;
    const num = this._kickNum;
    d3.select({ v: from }).transition().duration(560).ease(d3.easeCubicInOut).tween("k", function () {
      const i = d3.interpolateNumber(from, to); return t => num.text(`€${Math.round(i(t))}`);
    });
  }

  // waffle fill: erodeP 0→1 stages the erosion of the lost cells (top-down), latched. Each cell
  // flips class as the erosion wave (from the top) reaches it — the stagger IS the erodeP threshold,
  // so scrolling drives it and reduced-motion (erodeP=1) shows the full loss. --off = claret (loss).
  _applyWaffle(erodeP) {
    if (!this._cells) return;
    const lost = 100 - this._fillN;
    this._cells.each(function (d) {
      const el = d3.select(this);
      if (d._on) { el.classed("waffle-cell--on", true).classed("waffle-cell--off", false); return; }
      const rank = 99 - d.idx;                 // 0 = topmost eroded target
      const threshold = lost > 0 ? rank / lost : 1;
      const gone = erodeP >= threshold;
      el.classed("waffle-cell--on", !gone).classed("waffle-cell--off", gone);
    });
  }

  _growBars(frac, immediate) {
    if (!this._lineVals) return;
    this._barsFrac = frac;
    const dur = (immediate || this.ctx.motion.reduced) ? 0 : 600;
    const x = this._barX;
    this._lineVals.forEach(b => {
      const g = this._barG.get(b.cat); if (!g) return;
      const w2019 = x(b.base), w2025 = x(b.v ?? b.base) * frac;
      const t = (sel) => immediate || this.ctx.motion.reduced ? sel : sel.transition("gb").duration(dur).ease(d3.easeCubicInOut);
      t(g.select(".wf-bar-2019")).attr("width", Math.max(0, w2019));
      t(g.select(".wf-bar-2025")).attr("width", Math.max(0, w2025));
      g.select(".wf-bar-v2019").attr("x", x(b.base) + 5).text(`€${b.base}`);
      const shown = frac > 0.6;
      g.select(".wf-bar-v2025").attr("x", x(b.v ?? b.base) * frac + 5).style("opacity", shown ? 1 : 0).text(b.v == null ? "" : `€${b.v.toFixed(0)}`);
    });
  }

  _onProgress(p) {
    const er = smooth(Math.max(0, Math.min(1, (p - 0.02) / 0.24)));
    if (er > this._erodeP) { this._erodeP = er; this._applyWaffle(er); }
    // bars grow once the reader passes into the second beat
    const bt = smooth(Math.max(0, Math.min(1, (p - 0.34) / 0.24)));
    if (bt > (this._barsFrac || 0)) { if (bt > 0.05) this._barsShown = true; this._growBars(bt); }
  }

  onStep(index, el) {
    const geo = (el && el.dataset.geo) || this.geo;
    const mode = el && el.dataset.mode;
    if (this.container) { this.container.setAttribute("data-active-geo", geo); this.container.setAttribute("data-onstep", index); }
    if (mode === "bars" || index >= 1) { this._barsShown = true; if (!this.ctx.motion.reduced && (this._barsFrac || 0) < 1) this._growBars(1); }
    if (geo !== this.geo) { this.geo = geo; this._update(false); const s = this.controlsEl?.querySelector("select"); if (s) s.value = geo; }
  }

  _cellTip(e) {
    const p = this._power$; const per = p == null ? null : p / 100;
    const name = this.geo === "EU27_2020" ? "EU-27 average" : this.data.countryName(this.geo);
    this.ctx.tooltip.show(`<h5>${name}</h5><div class="row"><span class="key">€1 of 2019</span><span class="val">worth €${per == null ? "—" : per.toFixed(2)} today</span></div>`, e.clientX, e.clientY);
  }
  _barTip(e, b) {
    const v = this._lineVal(this.geo, b.cat, b.base);
    const pct = v == null ? null : (v / b.base - 1) * 100;
    this.ctx.tooltip.show(
      `<h5>${b.label}</h5><div class="row"><span class="key">2019</span><span class="val">€${b.base.toFixed(2)}</span></div><div class="row"><span class="key">Now</span><span class="val">€${v == null ? "—" : v.toFixed(2)}</span></div><div class="row"><span class="key">Change</span><span class="val">${pct == null ? "—" : (pct >= 0 ? "+" : "") + pct.toFixed(0) + "%"}</span></div>`,
      e.clientX, e.clientY);
  }

  destroy() { if (this._unsub) this._unsub(); super.destroy(); }
  onThemeChange() { this.render(); }
}
