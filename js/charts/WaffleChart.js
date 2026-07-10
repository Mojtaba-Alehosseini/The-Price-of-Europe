/* ============================================================
   WaffleChart — CH6 "The kitchen table" (D86 two-column redesign).
   Two columns in one body:
     LEFT  — the 100-cell waffle: €1 of 2019 purchasing power; eroded cells (ghost hatch→claret).
             EU-27 = 77 solid / 23 eroded; Hungary = 61.
     RIGHT — the hero's six basket lines as paired 2019→NOW bars, each in its own locked --cat-*
             colour, with an OWN reserved label gutter so a label can never cross into the waffle.
   Step-driven choreography (owner ruling, D86): step 0 = waffle alone, centered, bars hidden;
   step 1 = waffle glides into its left-column slot (scale 0.92) while bars cascade in; step 2 /
   any country-picker change = waffle re-erodes + bars re-scale in one 600ms transition, no
   re-mount, no re-stagger. Reversible: scrolling back to step 0 retracts the bars and re-centers
   the waffle. Timed on entry (fixed durations), not scroll-scrubbed — same speed on scroll or a
   rail-dot jump (D70 house ruling). Reduced motion: instant final state of the active step.
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
const WF_SCALE     = 0.92;   // split-mode waffle scale, relative to its solo (centered-alone) size
const WF_MOVE_MS   = 600;    // waffle glide (enter split) / re-erode+rescale (country change) / return (exit split)
const BAR_RETRACT_MS  = 280;
const BAR_STAGGER_MS  = 60;  // per-row cascade delay on first entry into split mode
const BAR_GROW_MS     = 420; // each bar's own grow duration
const BAR_NOW_DELAY_MS = 150; // the NOW bar starts this long after its own row's 2019 bar

export class WaffleChart extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 56, right: 20, bottom: 24, left: 20 }, aspect: 1.3 });
    this.geo = "EU27_2020";
    this.controlsEl = document.getElementById("chart-waffle-controls");
    this._erodeP = 0;
    this._mode = "solo";   // "solo" (step 0, waffle alone) | "split" (step 1+, two columns)
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
    this.svg.attr("aria-label", "The €100 monthly basket of 2019, priced for one country: on the left, its purchasing power today (77 of 100 euros for the EU-27); on the right, the six spending lines paired 2019 against now.");
    const M = this.opts.margin;
    const iw = width - M.left - M.right, ih = height - M.top - M.bottom;
    this._iw = iw; this._ih = ih;
    const contentY = M.top;

    // ── D86 layout: strict two columns. LEFT = waffle, fixed width min(42%,420px), vertically
    // centered. RIGHT = bars, with their OWN reserved label gutter so a label can never cross
    // into the waffle's zone at any width (the structural fix for the overlap bug). Phone <=~620px
    // container (matches the project's own isPhone threshold, well under the 860px the owner
    // named as the stacking break) stacks: waffle above bars, both full width. ──
    const gap = isPhone ? 20 : 34;
    const leftW = isPhone ? iw : Math.min(iw * 0.42, 420);
    const rightW = isPhone ? iw : iw - leftW - gap;
    const rightX0 = isPhone ? 0 : leftW + gap;           // right column's local x start
    const labelGutter = isPhone ? 104 : 140;               // reserved, label-only zone inside the right column
    const tagRoom = isPhone ? 54 : 66;                     // room for the "→ €40.46" tag past the bar's end
    const rowH = isPhone ? 38 : 44;
    const rowGap = isPhone ? 9 : 14;
    const totalBarsH = BASKET.length * rowH + (BASKET.length - 1) * rowGap;
    const titleGapH = isPhone ? 22 : 26;                   // room reserved for the section title above the row block

    // waffle geometry: a single BASE size (the grid's own local coordinate span, 0..waffleSideBase)
    // that the group's own `transform` scales/positions for either mode — never recomputed per
    // mode, so cell x/y attrs are set exactly once and only the wrapping <g> ever animates.
    const cols = 10, rows = 10;
    let waffleSideBase, soloX, soloY, splitX, splitY, splitScale;
    if (isPhone) {
      splitScale = 1;   // phone: simpler vertical reflow, no scale change
      waffleSideBase = Math.min(iw, ih * 0.4);
      soloX = (iw - waffleSideBase) / 2;
      soloY = Math.max(0, (ih - waffleSideBase) / 2);
      splitX = (iw - waffleSideBase) / 2;
      splitY = 0;
    } else {
      splitScale = WF_SCALE;
      const splitSide = Math.min(leftW, ih);
      waffleSideBase = splitSide / splitScale;   // solo (scale=1) size that shrinks to fit the column at 0.92
      soloX = (iw - waffleSideBase) / 2;
      soloY = (ih - waffleSideBase) / 2;
      splitX = (leftW - splitSide) / 2;
      splitY = (ih - splitSide) / 2;
    }
    const cellPitch = waffleSideBase / cols;
    const cellGap = Math.max(2, cellPitch * 0.12);
    const cellSize = cellPitch - cellGap;
    this._waffle = { cols, rows, cellPitch, cellSize };
    this._waffleXform = {
      solo:  `translate(${soloX},${soloY}) scale(1)`,
      split: `translate(${splitX},${splitY}) scale(${splitScale})`,
    };

    // bars block: the 6 rows form a compact group, vertically centered in the space BELOW the
    // section title (desktop) or below the waffle's OWN split-mode footprint (phone stacked) —
    // never spread across the full panel height. Phone fix (D86 gate caught this): the waffle
    // occupies real vertical space at the top of the stack in split mode, so the bars' own zone
    // must start AFTER it, not from the panel's top margin like the desktop two-column case.
    const phoneWaffleBottom = splitY + waffleSideBase * splitScale;
    const phoneGap = 22;
    const rowsTop = isPhone ? phoneWaffleBottom + phoneGap + titleGapH : contentY + titleGapH;
    const rowsAvailBottom = height - M.bottom;
    const rowsAvailH = Math.max(totalBarsH, rowsAvailBottom - rowsTop);
    const barsGroupY = rowsTop + Math.max(0, (rowsAvailH - totalBarsH) / 2);
    const barsGroupX = M.left + (isPhone ? 0 : rightX0);
    const barsX = isPhone ? M.left : barsGroupX;
    const plotW = rightW - labelGutter - tagRoom;
    this._bars = { x: barsX, y: barsGroupY, w: rightW, labelGutter, plotW, rowH, rowGap };

    // ── kicker (purchasing power €77 / €61) — stays fixed regardless of mode ──
    this._kickNum = this.svg.append("text").attr("class", "kick-num").attr("x", M.left).attr("y", isPhone ? 38 : 46).style("font-size", isPhone ? "30px" : "42px");
    // right-column section title — lives INSIDE the bars group so it hides/shows with the rows.

    // ── waffle cells (persistent, local coords 0..waffleSideBase; the WRAPPING group animates) ──
    this._waffleG = this.g.append("g").attr("class", "wf-waffle-group");
    const cellData = d3.range(100).map(i => { const col = i % cols, row = Math.floor(i / cols); return { i, col, row, idx: (rows - 1 - row) * cols + col }; });
    const wf = this._waffle;
    this._cells = this._waffleG.selectAll("rect.waffle-cell").data(cellData, d => d.i).join("rect")
      .attr("class", "waffle-cell")
      .attr("x", d => d.col * wf.cellPitch).attr("y", d => d.row * wf.cellPitch)
      .attr("width", wf.cellSize).attr("height", wf.cellSize).attr("rx", 2)
      .on("mouseenter", (e) => this._cellTip(e))
      .on("mousemove", (e) => this.ctx.tooltip.move(e.clientX, e.clientY))
      .on("mouseleave", () => this.ctx.tooltip.hide())
      .on("pointerdown", (e) => { if (e.pointerType !== "mouse") this._cellTip(e); });

    // ── basket bars (persistent groups, inside a single show/hide wrapper) ──
    this._buildBars();

    // country picker
    this._renderControls();

    // ── initial state: SOLO (step 0), no animation on first paint ────────────
    this._recompute();
    this._mode = "solo";
    this._waffleG.attr("transform", this._waffleXform.solo);
    this._erodeP = this.ctx.motion.reduced ? 1 : 0;
    this._applyWaffle(this._erodeP);
    this._barsGroupEl.classed("is-shown", false);
    BASKET.forEach(b => {
      const g = this._barG.get(b.cat);
      g.select(".wf-bar-2019").attr("width", 0);
      g.select(".wf-bar-2025").attr("width", 0);
      g.select(".wf-bar-v2019").style("opacity", 0).text(`€${b.base}`);
      g.select(".wf-bar-v2025").style("opacity", 0);
    });
    this._kickShown = this._fillN;
    this._kickNum.text(this._fillN == null ? "—" : `€${this._fillN}`);

    if (!this.ctx.motion.reduced) {
      if (this._unsub) this._unsub();
      const chapter = this.container.closest(".chapter");
      this._unsub = watchChapterProgress(chapter, p => this._onProgress(p));
    }
  }

  _buildBars() {
    const { x, y, w, labelGutter, plotW, rowH, rowGap } = this._bars;
    const maxVal = 46;   // headroom above rent's ~40.5
    const xScale = d3.scaleLinear().domain([0, maxVal]).range([0, plotW]);
    this._barX = xScale;

    this._barsGroupEl = this.g.append("g").attr("class", "wf-bars-group");
    this._barsGroupEl.append("text").attr("class", "legend-title wf-bars-title")
      .attr("x", x).attr("y", y - 12).text("WHERE THE €100 GOES — 2019 → NOW");

    this._barG = new Map();
    BASKET.forEach((b, i) => {
      const rowY = y + i * (rowH + rowGap);
      const g = this._barsGroupEl.append("g").attr("class", "wf-barrow").attr("data-cat", b.cat)
        .attr("transform", `translate(${x},${rowY})`)
        .style("cursor", "default")
        .on("mouseenter", (e) => this._barTip(e, b))
        .on("mousemove", (e) => this.ctx.tooltip.move(e.clientX, e.clientY))
        .on("mouseleave", () => this.ctx.tooltip.hide());
      // full-row hit area, confined to this row's OWN column — never reaches into the waffle.
      g.append("rect").attr("class", "wf-bar-hit").attr("x", 0).attr("y", -2).attr("width", w).attr("height", rowH + 4).attr("fill", "transparent");
      // category label — LEFT-aligned, lives entirely inside the reserved gutter.
      g.append("text").attr("class", "wf-bar-label").attr("x", 0).attr("y", rowH / 2 + 4).attr("text-anchor", "start").text(b.label);
      // 2019 base bar (top half, --ink-fainter) + NOW bar (bottom half, category's own --cat-* colour).
      g.append("rect").attr("class", "wf-bar-2019").attr("x", labelGutter).attr("y", 0).attr("height", rowH * 0.4).attr("width", 0).attr("rx", 1.5);
      g.append("rect").attr("class", "wf-bar-2025").attr("x", labelGutter).attr("y", rowH * 0.5).attr("height", rowH * 0.4).attr("width", 0).attr("rx", 1.5);
      g.append("text").attr("class", "wf-bar-v2019").attr("x", labelGutter).attr("y", rowH * 0.4 - 3).attr("text-anchor", "start");
      g.append("text").attr("class", "wf-bar-v2025").attr("x", labelGutter).attr("y", rowH * 0.94).attr("text-anchor", "start");
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
    c.querySelector("[data-w-geo]").addEventListener("change", e => this._onGeoChange(e.target.value));
  }

  // Recompute the DATA for the current geo (power, per-cell on/off, basket line values) without
  // touching anything visual — the caller decides how (or whether) to animate into the new state.
  _recompute() {
    const power = this._power(this.geo);
    this._fillN = power == null ? 0 : Math.round(power);
    this._power$ = power;
    this._cells.each(d => { d._on = d.idx < this._fillN; });
    this._lineVals = BASKET.map(b => ({ ...b, v: this._lineVal(this.geo, b.cat, b.base) }));
  }

  _onGeoChange(geo) {
    if (geo === this.geo) return;
    this.geo = geo;
    this._recompute();
    const reduced = this.ctx.motion.reduced;
    if (this._mode === "split") {
      this._rescaleSplit(reduced);
    } else {
      // solo mode: no bars to rescale yet — just re-erode the waffle to the new country, honouring
      // whatever erosion progress the reader has already scrolled to (or full, under reduced motion).
      this._applyWaffle(reduced ? 1 : this._erodeP);
    }
    if (reduced) this._kickNum.text(this._fillN == null ? "—" : `€${this._fillN}`);
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

  _onProgress(p) {
    if (this._mode !== "solo" || this._erodeP >= 1) return;   // step 0's own entrance reveal only
    const er = smooth(Math.max(0, Math.min(1, (p - 0.02) / 0.24)));
    if (er > this._erodeP) { this._erodeP = er; this._applyWaffle(er); }
  }

  // ── D86 step-driven choreography: timed on entry, identical whether reached by scroll or a
  // rail-dot jump (onStep fires the same either way) — never scroll-scrubbed. ──────────────────

  _enterSplit(reduced) {
    this._mode = "split";
    this._barsGroupEl.classed("is-shown", true);
    const wg = this._waffleG.interrupt("wfmove");
    if (reduced) wg.attr("transform", this._waffleXform.split);
    else wg.transition("wfmove").duration(WF_MOVE_MS).ease(d3.easeCubicOut).attr("transform", this._waffleXform.split);

    BASKET.forEach((b, i) => {
      const g = this._barG.get(b.cat);
      const lv = this._lineVals.find(x => x.cat === b.cat);
      const w2019 = Math.max(0, this._barX(b.base));
      const w2025 = Math.max(0, this._barX(lv?.v ?? b.base));
      const v2019 = g.select(".wf-bar-v2019"), v2025 = g.select(".wf-bar-v2025");
      const bar2019 = g.select(".wf-bar-2019").interrupt("gb"), bar2025 = g.select(".wf-bar-2025").interrupt("gb");
      v2019.attr("x", this._bars.labelGutter + w2019 + 6).text(`€${b.base}`);
      v2025.attr("x", this._bars.labelGutter + w2025 + 6).text(lv?.v == null ? "" : `→ €${lv.v.toFixed(2)}`);
      if (reduced) {
        bar2019.attr("width", w2019); bar2025.attr("width", w2025);
        v2019.style("opacity", 1); v2025.style("opacity", 1);
        return;
      }
      v2019.style("opacity", 0); v2025.style("opacity", 0);
      bar2019.transition("gb").delay(i * BAR_STAGGER_MS).duration(BAR_GROW_MS).ease(d3.easeCubicOut)
        .attr("width", w2019).on("end", function () { if (this === bar2019.node()) v2019.style("opacity", 1); });
      bar2025.transition("gb").delay(i * BAR_STAGGER_MS + BAR_NOW_DELAY_MS).duration(BAR_GROW_MS).ease(d3.easeCubicOut)
        .attr("width", w2025).on("end", function () { if (this === bar2025.node()) v2025.style("opacity", 1); });
    });
  }

  _exitSplit(reduced) {
    this._mode = "solo";
    this._barsGroupEl.classed("is-shown", false);
    const wg = this._waffleG.interrupt("wfmove");
    if (reduced) wg.attr("transform", this._waffleXform.solo);
    else wg.transition("wfmove").duration(WF_MOVE_MS).ease(d3.easeCubicOut).attr("transform", this._waffleXform.solo);

    BASKET.forEach(b => {
      const g = this._barG.get(b.cat);
      const bar2019 = g.select(".wf-bar-2019").interrupt("gb"), bar2025 = g.select(".wf-bar-2025").interrupt("gb");
      g.select(".wf-bar-v2019").style("opacity", 0);
      g.select(".wf-bar-v2025").style("opacity", 0);
      if (reduced) { bar2019.attr("width", 0); bar2025.attr("width", 0); return; }
      bar2019.transition("gb").duration(BAR_RETRACT_MS).ease(d3.easeCubicIn).attr("width", 0);
      bar2025.transition("gb").duration(BAR_RETRACT_MS).ease(d3.easeCubicIn).attr("width", 0);
    });
  }

  // step 2 entry (new geo) or any picker change while already split: waffle re-erodes + bars
  // re-scale together, ONE 600ms transition, no stagger, no re-mount.
  _rescaleSplit(reduced) {
    this._applyWaffle(1);
    BASKET.forEach(b => {
      const g = this._barG.get(b.cat);
      const lv = this._lineVals.find(x => x.cat === b.cat);
      const w2019 = Math.max(0, this._barX(b.base));
      const w2025 = Math.max(0, this._barX(lv?.v ?? b.base));
      const v2019 = g.select(".wf-bar-v2019"), v2025 = g.select(".wf-bar-v2025");
      const bar2019 = g.select(".wf-bar-2019").interrupt("gb"), bar2025 = g.select(".wf-bar-2025").interrupt("gb");
      v2019.text(`€${b.base}`);
      v2025.text(lv?.v == null ? "" : `→ €${lv.v.toFixed(2)}`);
      if (reduced) {
        bar2019.attr("width", w2019); bar2025.attr("width", w2025);
        v2019.attr("x", this._bars.labelGutter + w2019 + 6).style("opacity", 1);
        v2025.attr("x", this._bars.labelGutter + w2025 + 6).style("opacity", 1);
        return;
      }
      bar2019.transition("gb").duration(WF_MOVE_MS).ease(d3.easeCubicInOut).attr("width", w2019);
      bar2025.transition("gb").duration(WF_MOVE_MS).ease(d3.easeCubicInOut).attr("width", w2025);
      v2019.transition("gb").duration(WF_MOVE_MS).ease(d3.easeCubicInOut).attr("x", this._bars.labelGutter + w2019 + 6).style("opacity", 1);
      v2025.transition("gb").duration(WF_MOVE_MS).ease(d3.easeCubicInOut).attr("x", this._bars.labelGutter + w2025 + 6).style("opacity", 1);
    });
  }

  onStep(index, el) {
    const geo = (el && el.dataset.geo) || this.geo;
    const mode = el && el.dataset.mode;
    const wantSplit = mode === "bars" || index >= 1;
    if (this.container) { this.container.setAttribute("data-active-geo", geo); this.container.setAttribute("data-onstep", index); }

    const geoChanged = geo !== this.geo;
    if (geoChanged) {
      this.geo = geo;
      this._recompute();
      const s = this.controlsEl?.querySelector("select"); if (s) s.value = geo;
    }

    const reduced = this.ctx.motion.reduced;
    if (wantSplit && this._mode !== "split") {
      // rail-jump safety: fully erode before/while gliding, so the waffle never arrives at its
      // left-column slot still showing an unfinished (mid-scroll) erosion pattern.
      this._erodeP = 1;
      this._enterSplit(reduced);
    } else if (!wantSplit && this._mode === "split") {
      this._exitSplit(reduced);
    } else if (wantSplit && geoChanged) {
      this._rescaleSplit(reduced);
    }
    if (geoChanged) { if (reduced) this._kickNum.text(this._fillN == null ? "—" : `€${this._fillN}`); else this._tweenKicker(this._fillN); }
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
