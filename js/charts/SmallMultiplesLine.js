/* ============================================================
   SmallMultiplesLine — 8 panels of euro-area HICP categories.
   Competition-grade: 2-col x 4-row, shared y-axis, line trace
   with sequential delay, area fade-in, italic Fraunces kicker +
   per-panel last-value tag, COVID + Energy bands, scroll-driven
   focus (dim non-target panels + stamp annotation), cross-panel
   synchronised cursor.
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { KEY_CATEGORIES } from "../modules/dataManager.js";

// Focus codes MUST match entries in KEY_CATEGORIES (see DataManager.js).
// "FOOD" / "SERV" are aggregate codes in Eurostat but KEY_CATEGORIES uses CP01 for food
// and SERV for services, so the focus codes here are kept aligned with the actual panels.
const STEP_CONFIG = [
  { focus: null,    caption: null },
  { focus: "CP04",  caption: "Housing, water & electricity peeled off in mid-2021 — six months before the rest." },
  { focus: "CP01",  caption: "Food followed energy with a six-month lag, peaking above 15 % in early 2023." },
  { focus: "SERV",  caption: "Services never spiked but climb steadily — and refuse to come back down." },
];

const CAT_CLASS = {
  CP00: "overall", CP01: "food", CP04: "housing", CP045: "energy",
  CP07: "transport", CP11: "services", NRG: "energy", FOOD: "food", SERV: "services"
};

const SHORT_LABEL = {
  CP00:  "Overall",
  CP01:  "Food & drink",
  CP04:  "Housing & utilities",
  CP045: "Electricity, gas, fuels",
  CP07:  "Transport",
  CP11:  "Restaurants & hotels",
  NRG:   "Energy (agg.)",
  FOOD:  "Food (agg.)",
  SERV:  "Services (agg.)"
};

const COVID_BAND  = ["2020-03", "2020-07"];
const ENERGY_BAND = ["2021-09", "2022-12"];
const UKRAINE     = "2022-02";

// [R2·1a] The narrative protagonist. Step-1 of this chapter literally calls the
// electricity/gas/fuels panel "the lit fuse on the rest of the chart" — it owns
// the single most dramatic mark (≈54 % spike). So at rest THIS panel carries the
// terracotta accent (like the Estonia capital-dot in the choropleth), and every
// other panel draws in a calm ink tone. When a *different* panel is focused, the
// protagonist recedes to ink so there is only ever ONE terracotta element on
// screen — restoring the accent's editorial function (CLAUDE.md §4 "accent
// restraint"). Previously two panels (CP045, NRG) were permanently terracotta
// AND all peak/last tags were accent, so the colour was sprayed everywhere.
const PROTAGONIST = "CP045";

function getCSS(name) {
  const m = name.match(/var\((--[^)]+)\)/); const n = m ? m[1] : name;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888";
}

function sparkPath(data, w, h) {
  if (!data || !data.length) return { d: "", lastX: 0, lastY: h, zeroY: h - 2, length: 0 };
  const x = d3.scaleLinear().domain([0, data.length - 1]).range([2, w - 2]);
  const ext = d3.extent(data, d => d.value);
  const y = d3.scaleLinear().domain([Math.min(0, ext[0]), Math.max(ext[1], 2)]).range([h - 2, 2]);
  const line = d3.line().x((_, i) => x(i)).y(d => y(d.value)).curve(d3.curveMonotoneX);
  const d = line(data);
  const last = data[data.length - 1];
  const tmp = document.createElementNS("http://www.w3.org/2000/svg", "path");
  tmp.setAttribute("d", d);
  const length = tmp.getTotalLength ? tmp.getTotalLength() : w;
  return { d, lastX: x(data.length - 1), lastY: y(last.value), zeroY: y(0), length };
}

export class SmallMultiplesLine extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 84, right: 22, bottom: 36, left: 56 }, aspect: 1.02 });
    this.cats = KEY_CATEGORIES;
    this._focusCat = null;
    this._stepCaption = null;
    // [R3 motion] Sentinel for "no step applied yet" — distinct from any real focus
    // value (including null, which is a legitimate focus for step 0). onStep compares
    // the incoming focus against this so the FIRST call always applies, while later
    // calls that re-enter the SAME focus step (scrollama re-fires on boundary jitter
    // and on every reverse-scroll re-entry) become no-ops. Without this, _renderStamp
    // wiped + re-traced the stamp (opacity 0 → re-fade + re-trace leader/sparkline)
    // every re-enter — a visible blink. Reset on render() so a re-mount re-applies.
    this._UNSET = Symbol("sml-unset-focus");
    this._appliedFocus = this._UNSET;
  }

  // Fill the sticky panel exactly. The chart-body box is fixed by the sticky
  // panel height minus the header/subtitle/source, so we must size the viewBox
  // to the body's REAL clientHeight — otherwise an over-tall viewBox (e.g. 420)
  // gets letterboxed by `preserveAspectRatio meet` into the shorter box and the
  // whole grid is squashed ~0.65x (illegible on phone). Only fall back to the
  // aspect-derived height when the body hasn't been laid out yet (clientHeight 0).
  size() {
    if (!this.container) return { width: 600, height: 600 };
    const w = this.container.clientWidth || 600;
    const hAvail = this.container.clientHeight || 0;
    const hMin = Math.round(w / this.opts.aspect);
    // When the body is laid out, track its REAL height 1:1 so the viewBox is
    // never taller than its box (the cause of the squash). Clamp to a small
    // readable minimum only as a guard against a degenerate near-zero box.
    const h = hAvail ? Math.max(220, hAvail) : Math.max(420, hMin);
    return { width: w, height: h };
  }

  render() {
    super.render();
    // [R3 motion] A fresh render rebuilds all DOM (panels at full opacity, stamp
    // layer empty), so the "applied focus" cache is stale — clear it so the next
    // onStep re-applies even if its focus equals the pre-render value (e.g. theme
    // toggle while on a focus step). Without this the idempotency guard would skip
    // and leave the rebuilt chart un-focused / stamp-less until a DIFFERENT step.
    this._appliedFocus = this._UNSET;
    this.container.innerHTML = "";
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    const isPhone = width < 480;
    this.isPhone = isPhone;
    // [S3-3 / audit-CH2] Tighter margins on mobile so panels get more usable
    // area. Top margin is the kicker+legend band; on the short phone body (~274px)
    // it must be small or the 4 rows collapse. 56px fits a 22px kicker + 12px sub.
    const m = isPhone
      ? { top: 56, right: 12, bottom: 30, left: 34 }
      : this.opts.margin;
    const iw = width - m.left - m.right;
    const ih = height - m.top - m.bottom;

    // 2 columns x 4 rows
    // [S3-3] On narrow viewports (≤ 480px), keep 2-col layout but use TIGHTER gaps so
    // each panel gets a bit more width/height. 1-col layout gave full width per
    // panel but only ~22px height per panel — too short to read line shapes.
    const cols = 2, rows = 4;
    const gapX = (width < 480) ? 16 : 44;
    const gapY = (width < 480) ? 16 : 26;
    this.cellW = (iw - gapX * (cols - 1)) / cols;
    this.cellH = (ih - gapY * (rows - 1)) / rows;
    this.cols = cols; this.rows = rows; this.gapX = gapX; this.gapY = gapY;

    const eu = this.data.euAggregateCode();
    if (!eu) {
      this.svg.append("text").attr("x", width/2).attr("y", height/2)
        .attr("text-anchor", "middle").attr("fill", "var(--ink-faint)")
        .text("Euro-area aggregate unavailable.");
      return;
    }
    this.eu = eu;

    const months = this.data.monthsCP00().filter(t => t >= "2015-01");
    const parse = d3.timeParse("%Y-%m");
    this.parse = parse;
    this.x = d3.scaleTime().domain(d3.extent(months, t => parse(t))).range([0, this.cellW]);

    // Build per-category series; collect shared y-domain
    this.seriesMap = new Map();
    let yMax = 0;
    this.cats.forEach(cat => {
      const series = months
        .map(t => ({ t: parse(t), time: t, v: this.data.hicpMonthly[eu]?.[cat]?.[t] }))
        .filter(d => Number.isFinite(d.v));
      this.seriesMap.set(cat, series);
      yMax = Math.max(yMax, d3.max(series, d => d.v) || 0);
    });
    const yMaxR = Math.ceil((yMax * 1.05) / 5) * 5;
    this.y = d3.scaleLinear().domain([-2, Math.max(12, yMaxR)]).range([this.cellH, 0]);

    // <defs>
    const defs = this.svg.append("defs");
    defs.append("clipPath").attr("id", "smlm-clip")
      .append("rect").attr("x", 0).attr("y", 0).attr("width", this.cellW).attr("height", this.cellH);
    const glow = defs.append("filter").attr("id", "sml-focus-glow")
      .attr("x", "-30%").attr("y", "-30%").attr("width", "160%").attr("height", "160%");
    glow.append("feGaussianBlur").attr("stdDeviation", "1.2").attr("result", "b");
    const mg = glow.append("feMerge");
    mg.append("feMergeNode").attr("in", "b");
    mg.append("feMergeNode").attr("in", "SourceGraphic");

    // Kicker (top-left). On phone the band is shorter, so raise the baselines.
    const kY = isPhone ? 26 : 50;
    const kSubY = isPhone ? 42 : 72;
    this.kickerG = this.svg.append("g").attr("class", "year-kicker-g sml-kicker");
    this.kickerY  = this.kickerG.append("text").attr("class", "year-kicker sml-kicker-text")
      .attr("x", m.left).attr("y", kY);
    this.kickerSub = this.kickerG.append("text").attr("class", "year-kicker-sub sml-kicker-sub")
      .attr("x", m.left + 3).attr("y", kSubY);
    this._setKicker(null);

    // Legend (top-right). [audit-CH2 P1] On phone the kicker spans most of the
    // width, so a top-right legend at the same y collides with it. Drop the
    // legend on phone — the subtitle above the SVG already states the unit and
    // span ("monthly YoY %", "eight categories"), so it is redundant there.
    if (!isPhone) {
      const lg = this.svg.append("g").attr("class", "map-legend sml-legend")
        .attr("transform", `translate(${width - m.right}, 38)`);
      lg.append("text").attr("class", "legend-title")
        .attr("x", 0).attr("y", 0).attr("text-anchor", "end").text("MONTHLY YoY %");
      lg.append("text").attr("class", "legend-tick")
        .attr("x", 0).attr("y", 16).attr("text-anchor", "end")
        .text("Euro area · 8 categories · 2015–2025");
    }

    // Inner panel group (margin-translated)
    this.g.attr("transform", `translate(${m.left},${m.top})`);

    // Draw panels
    this.panelGs = new Map();
    this.cats.forEach((cat, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const tx = col * (this.cellW + gapX);
      const ty = row * (this.cellH + gapY);
      const cell = this.g.append("g").attr("class", "panel sml-panel").attr("data-cat", cat)
        .attr("transform", `translate(${tx},${ty})`);
      this.panelGs.set(cat, cell);
      this._drawPanel(cell, cat, i);
    });

    // Y-axis ticks at the chart canvas edge (one shared y-axis)
    this._drawSharedYAxis();

    // Overlay rect for cross-panel cursor
    this._buildOverlay();

    // [R2·1d] Cursor layer — synchronized playhead + read-out dots, drawn in
    // absolute coords ABOVE the (dimmable) panels so the hover/tap read stays
    // crisp at full opacity even during a focus step.
    this.cursorG = this.svg.append("g").attr("class", "sml-cursor-layer").attr("pointer-events", "none");

    // Stamp layer (above everything)
    this.stampG = this.svg.append("g").attr("class", "stamp-layer").attr("pointer-events", "none");

    // Initial reveal
    this._initialReveal();
  }

  _drawPanel(cell, cat, idx) {
    const cls = CAT_CLASS[cat] || "other";
    const series = this.seriesMap.get(cat);
    const parse = this.parse;

    // Event bands behind everything
    const bands = [
      { cls: "event-band--covid",  from: parse(COVID_BAND[0]),  to: parse(COVID_BAND[1])  },
      { cls: "event-band--energy", from: parse(ENERGY_BAND[0]), to: parse(ENERGY_BAND[1]) }
    ];
    bands.forEach(b => {
      cell.append("rect").attr("class", `sml-band ${b.cls}`)
        .attr("x", this.x(b.from)).attr("y", 0)
        .attr("width", Math.max(2, this.x(b.to) - this.x(b.from)))
        .attr("height", this.cellH);
    });

    // Zero line
    cell.append("line").attr("class", "zero-line sml-zero")
      .attr("x1", 0).attr("x2", this.cellW)
      .attr("y1", this.y(0)).attr("y2", this.y(0));

    // Ukraine dashed marker
    cell.append("line").attr("class", "sml-ukraine")
      .attr("x1", this.x(parse(UKRAINE))).attr("x2", this.x(parse(UKRAINE)))
      .attr("y1", 0).attr("y2", this.cellH);

    // Body group (clipped, holds area + line)
    const body = cell.append("g").attr("class", "sml-body").attr("clip-path", "url(#smlm-clip)");

    // [R2·1a] Resting colour: calm ink for the eight lines; terracotta only for
    // the protagonist panel. The category hue survives as a *whisper* in the area
    // fill (very low opacity), so each panel keeps a trace of identity without
    // eight saturated lines competing. `_lineColor()` is the single source of
    // truth for which colour a line shows in any state (rest / focus / dimmed).
    const isProtagonist = cat === PROTAGONIST;
    const catColor  = getCSS(`--cat-${cls}`);
    // Resting line tone: --ink-soft reads as a calm, legible neutral on cream and
    // on warm-dark — distinct from the much fainter --ink-faint axes/gridlines.
    const restColor = isProtagonist ? "var(--accent)" : getCSS("var(--ink-soft)");
    const area = d3.area().x(d => this.x(d.t)).y0(this.y(0)).y1(d => this.y(d.v)).curve(d3.curveMonotoneX);
    const line = d3.line().x(d => this.x(d.t)).y(d => this.y(d.v)).curve(d3.curveMonotoneX);

    body.append("path").datum(series)
      .attr("class", `sml-area series--${cls}`).attr("d", area)
      .attr("fill", catColor).attr("opacity", 0);

    const lp = body.append("path").datum(series)
      .attr("class", `sml-line line series--${cls}`).attr("d", line)
      .attr("fill", "none").attr("stroke", restColor).attr("stroke-width", isProtagonist ? 2 : 1.6)
      .attr("stroke-linejoin", "round").attr("stroke-linecap", "round");

    // Peak dot + tag. [R2·1a] The dot is accent ONLY on the protagonist; elsewhere
    // it is an ink marker. The numeric tag is ink (not accent) so terracotta stays
    // reserved. The protagonist's tag reads in deep-terracotta (--accent-text, AA).
    const peak = d3.greatest(series, d => d.v);
    if (peak) {
      cell.append("circle").attr("class", "sml-peak-dot")
        .attr("cx", this.x(peak.t)).attr("cy", this.y(peak.v))
        .attr("r", 0)
        .attr("fill", isProtagonist ? "var(--accent)" : "var(--ink-soft)")
        .attr("stroke", "var(--bg)").attr("stroke-width", 1.6);
      const isLate = (this.cellW - this.x(peak.t)) < 48;
      cell.append("text").attr("class", "sml-peak-tag" + (isProtagonist ? " sml-peak-tag--lead" : ""))
        .attr("x", this.x(peak.t) + (isLate ? -6 : 6))
        .attr("y", this.y(peak.v) - 7)
        .attr("text-anchor", isLate ? "end" : "start")
        .attr("opacity", 0)
        .text(`${peak.v.toFixed(1)}%`);
    }

    // Panel title (top-left, just above the panel)
    cell.append("text").attr("class", "sml-title")
      .attr("x", 0).attr("y", -10)
      .text(SHORT_LABEL[cat] || this.data.categoryLabel(cat));

    // Last-value italic Fraunces tag (top-right).
    // [R2·1a] Default is calm ink-soft (was accent → terracotta-spray). Only the
    // protagonist's tag reads in deep terracotta (--accent-text, AA-safe). Negative
    // values stay ink-soft so deflation doesn't read as "alarm".
    const last = series[series.length - 1];
    const leadCls = isProtagonist ? " sml-last-tag--lead" : "";
    const negCls = (last && last.v < 0) ? " sml-last-tag--neg" : "";
    cell.append("text").attr("class", "sml-last-tag" + leadCls + negCls)
      .attr("x", this.cellW).attr("y", -10)
      .attr("text-anchor", "end")
      .attr("opacity", 0)
      .text(last ? `${last.v >= 0 ? "+" : ""}${last.v.toFixed(1)}%` : "—");

    // X-axis labels (sparse) — only on bottom row to avoid clutter
    const isBottomRow = idx >= (this.cats.length - this.cols);
    if (isBottomRow) {
      [["2015-01", "2015"], ["2020-01", "2020"], ["2025-01", "2025"]].forEach(([t, label]) => {
        cell.append("text").attr("class", "sml-xtick")
          .attr("x", this.x(parse(t))).attr("y", this.cellH + 16)
          .attr("text-anchor", label === "2015" ? "start" : label === "2025" ? "end" : "middle")
          .text(label);
      });
    }

    cell.datum({ cat, series, lp, body, cls, catColor, restColor, isProtagonist });
  }

  _drawSharedYAxis() {
    const ticks = this.y.ticks(5).filter(t => t !== 0);
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cat = this.cats[row * this.cols + col];
        if (!cat) continue;
        const cell = this.panelGs.get(cat);
        ticks.forEach(t => {
          const yy = this.y(t);
          cell.insert("line", ":first-child").attr("class", "sml-gridline")
            .attr("x1", 0).attr("x2", this.cellW)
            .attr("y1", yy).attr("y2", yy);
          if (col === 0) {
            cell.append("text").attr("class", "sml-ytick")
              .attr("x", -8).attr("y", yy + 3).attr("text-anchor", "end")
              .text(`${t}%`);
          }
        });
        // [CH2-W3] zero baseline label on the left column — anchors the reader's eye
        if (col === 0) {
          cell.append("text").attr("class", "sml-ytick sml-ytick--zero")
            .attr("x", -8).attr("y", this.y(0) + 3).attr("text-anchor", "end")
            .text("0%");
        }
      }
    }
  }

  _initialReveal() {
    const reduced = this.ctx.motion.reduced;
    if (reduced) {
      this.panelGs.forEach(cell => {
        cell.select("path.sml-line").attr("stroke-dasharray", null).attr("stroke-dashoffset", null);
        cell.select("path.sml-area").attr("opacity", 0.1);
        cell.select(".sml-peak-dot").attr("r", 2.6);
        cell.select(".sml-peak-tag").attr("opacity", 1);
        cell.select(".sml-last-tag").attr("opacity", 1);
      });
      return;
    }
    this.cats.forEach((cat, idx) => {
      const cell = this.panelGs.get(cat);
      if (!cell) return;
      const lp = cell.select("path.sml-line");
      const node = lp.node();
      if (!node) return;
      const L = node.getTotalLength() || 1;
      lp.attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L);
      const startDelay = idx * 80;
      lp.transition().delay(startDelay).duration(900).ease(d3.easeCubicOut)
        .attr("stroke-dashoffset", 0);
      cell.select("path.sml-area").transition().delay(startDelay + 600).duration(500).attr("opacity", 0.1);
      cell.select(".sml-peak-dot").transition().delay(startDelay + 750).duration(280).attr("r", 2.6);
      cell.select(".sml-peak-tag").transition().delay(startDelay + 850).duration(300).attr("opacity", 1);
      cell.select(".sml-last-tag").transition().delay(startDelay + 850).duration(300).attr("opacity", 1);
      // [CH2-C1] rAF-stall safety net — if d3 transitions fail to tick (background tab,
      // throttled iframe, headless), the panel would stay invisible forever. After the
      // full reveal duration force the final attribute values directly.
      const totalReveal = startDelay + 1200;
      setTimeout(() => {
        if (!this.rendered) return;
        const live = cell.select("path.sml-line").node();
        if (!live) return;
        // Detect "stuck": dashoffset still matches initial L (within 1 px)
        const off = +cell.select("path.sml-line").attr("stroke-dashoffset");
        if (Number.isFinite(off) && off > 1) {
          cell.select("path.sml-line").interrupt().attr("stroke-dasharray", null).attr("stroke-dashoffset", null);
          cell.select("path.sml-area").interrupt().attr("opacity", 0.1);
          cell.select(".sml-peak-dot").interrupt().attr("r", 2.6);
          cell.select(".sml-peak-tag").interrupt().attr("opacity", 1);
          cell.select(".sml-last-tag").interrupt().attr("opacity", 1);
        }
      }, totalReveal);
    });
  }

  _buildOverlay() {
    const m = this.opts.margin;
    // Shared logic — given a viewport (x, y) inside the SVG, compute the month
    // key and call _brush. Returns false if outside the cell area (so callers
    // can decide to do nothing for that input).
    const computeAndBrush = (svgX, evt) => {
      const mx = svgX - m.left;
      const cellWi = this.cellW + this.gapX;
      const col = Math.min(this.cols - 1, Math.max(0, Math.floor(mx / cellWi)));
      const localX = mx - col * cellWi;
      if (localX < 0 || localX > this.cellW) { this._brush(null, null); return; }
      const t = this.x.invert(localX);
      const monthKey = d3.timeFormat("%Y-%m")(t);
      this._brush(monthKey, evt);
    };
    this.overlay = this.svg.append("rect")
      .attr("class", "sml-overlay")
      .attr("x", m.left).attr("y", m.top)
      .attr("width", this.W - m.left - m.right)
      .attr("height", this.H - m.top - m.bottom)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .on("mousemove", (event) => {
        const [mxAbs] = d3.pointer(event, this.svg.node());
        computeAndBrush(mxAbs, event);
      })
      .on("mouseleave", () => this._brush(null, null));

    // [R3 fix 3 / R2·1d] Mobile tap-to-cursor. Touch devices have no hover; without
    // this the cross-panel cursor (the chart's central interaction) is invisible to
    // touch users. touchstart + touchmove synthesise the cursor at the touch point;
    // preventDefault() stops the page scrolling while the finger drags it across
    // panels. CRUCIALLY we do NOT clear on touchend — a single TAP places the
    // synchronized playhead + 8 read-out dots + the tooltip and LEAVES them up, so
    // a tap delivers exactly the persistent readout a desktop hover does (round-2
    // required: tap == hover). The readout simply moves to the next tap location.
    // [QA fix] Touch-brush WITHOUT trapping page scroll. On mobile the sticky chart covers most of
    // the viewport, so a touchmove handler that ALWAYS preventDefault()s blocked the reader from
    // scrolling the page with a vertical swipe over the chart (the chart is pointer-events:auto on
    // mobile — responsive.css). Fix: brush on touchstart (tap to read), and only claim the gesture
    // (preventDefault + scrub) once the finger moves HORIZONTALLY; a vertical-dominant swipe falls
    // through to native page scroll.
    const brushAt = (touch) => {
      const svgRect = this.svg.node().getBoundingClientRect();
      const vb = this.svg.attr("viewBox").split(/\s+/).map(Number);
      const svgX = ((touch.clientX - svgRect.left) / svgRect.width) * vb[2];
      computeAndBrush(svgX, { clientX: touch.clientX, clientY: touch.clientY });
    };
    const onTouchStart = (event) => {
      if (!event.touches || !event.touches.length) return;
      const t = event.touches[0];
      this._touchAnchor = { x: t.clientX, y: t.clientY, scrubbing: false };
      brushAt(t);                          // tap-to-read; no preventDefault (a vertical swipe may follow)
    };
    const onTouchMove = (event) => {
      if (!this._touchAnchor || !event.touches || !event.touches.length) return;
      const t = event.touches[0];
      const dx = Math.abs(t.clientX - this._touchAnchor.x);
      const dy = Math.abs(t.clientY - this._touchAnchor.y);
      if (!this._touchAnchor.scrubbing) {
        if (dy > dx && dy > 8) return;     // vertical-dominant → let the page scroll (no trap)
        if (dx > 6) this._touchAnchor.scrubbing = true;
      }
      if (this._touchAnchor.scrubbing) { event.preventDefault(); brushAt(t); }
    };
    this.overlay.node().addEventListener("touchstart", onTouchStart, { passive: false });
    this.overlay.node().addEventListener("touchmove", onTouchMove, { passive: false });
  }

  _brush(monthKey, event) {
    // [R2·1d] Draw the synchronized cursor into a dedicated TOP layer in absolute
    // chart coords, not inside each panel group. Two wins: (1) the playhead + the
    // eight read-out dots stay at FULL opacity even when a focus step has dimmed
    // the panels to 0.30 (round-1 "remaining lever #5" — the hover read stayed
    // crisp only on the focused panel before); (2) one shared vertical playhead
    // per column reads as a single instrument rather than eight faint dashes.
    if (!this.cursorG) return;
    this.cursorG.selectAll("*").remove();
    if (monthKey) {
      // One crisp playhead per column (the time slice is identical across a column).
      for (let col = 0; col < this.cols; col++) {
        const cat0 = this.cats[col];
        if (!cat0) continue;
        const rec0 = (this.seriesMap.get(cat0) || []).find(p => p.time === monthKey);
        const px = this.opts.margin.left + col * (this.cellW + this.gapX) + this.x(this.parse(monthKey));
        const topPanelTop = this.opts.margin.top;
        const botPanelBottom = this.opts.margin.top + this.rows * this.cellH + (this.rows - 1) * this.gapY;
        this.cursorG.append("line").attr("class", "cursor-line")
          .attr("x1", px).attr("x2", px).attr("y1", topPanelTop).attr("y2", botPanelBottom)
          .attr("stroke", "var(--ink)").attr("stroke-opacity", 0.5).attr("stroke-dasharray", "2 3");
        void rec0;
      }
      // A read-out dot on every panel's line at the slice (full opacity, on top).
      this.panelGs.forEach((cell, cat) => {
        const d = cell.datum(); if (!d) return;
        const rec = d.series.find(p => p.time === monthKey); if (!rec) return;
        const col = this.cats.indexOf(cat) % this.cols, row = Math.floor(this.cats.indexOf(cat) / this.cols);
        const ox = this.opts.margin.left + col * (this.cellW + this.gapX);
        const oy = this.opts.margin.top  + row * (this.cellH + this.gapY);
        this.cursorG.append("circle").attr("class", "cursor-dot")
          .attr("cx", ox + this.x(rec.t)).attr("cy", oy + this.y(rec.v))
          .attr("r", 3).attr("fill", "var(--ink)").attr("stroke", "var(--bg)").attr("stroke-width", 1.5);
      });
      // Month label riding the top of the playhead (so the slice reads without
      // the tooltip — useful on touch where the tooltip can sit under a thumb).
      const lblX = this.opts.margin.left + this.x(this.parse(monthKey));
      this.cursorG.append("text").attr("class", "sml-cursor-month")
        .attr("x", lblX).attr("y", this.opts.margin.top - 4)
        .attr("text-anchor", "start")
        .text(d3.timeFormat("%b %Y")(this.parse(monthKey)));
    }
    if (monthKey && event) {
      const eu = this.eu;
      const items = this.cats.map(c => {
        const v = this.data.hicpMonthly[eu]?.[c]?.[monthKey];
        const lbl = SHORT_LABEL[c] || this.data.categoryLabel(c);
        return `<div class="row"><span class="key">${lbl}</span><span class="val">${v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(1) + "%"}</span></div>`;
      }).join("");
      const fmt = d3.timeFormat("%b %Y");
      this.ctx.tooltip.show(`<h5>${fmt(this.parse(monthKey))}</h5>${items}`, event.clientX, event.clientY);
    } else {
      this.ctx.tooltip.hide();
    }
  }

  _setKicker(focusCat) {
    if (!focusCat) {
      // [CH2-R3 / S2-1] Editorial kicker — kept short enough to fit the panel
      // without overflowing the right edge at typical viewport widths.
      this.kickerY.text("Where the heat hit");
      // [R2·1e] On phone the kicker sits in a tight band right above the first
      // panel row, so the sub-line was crowding the top panels' titles. The chart
      // subtitle above the SVG already says "eight categories … on a shared scale",
      // so the overview sub-line is redundant there — drop it on phone. (On focus
      // the sub-line carries the peak read-out, which IS the phone's stamp
      // substitute, so it stays.)
      this.kickerSub.text(this.isPhone ? "" : "eight categories of euro-area inflation, monthly");
      return;
    }
    const series = this.seriesMap.get(focusCat) || [];
    const peak = d3.greatest(series, d => d.v);
    this.kickerY.text(SHORT_LABEL[focusCat] || this.data.categoryLabel(focusCat));
    this.kickerSub.text(peak
      ? `peaked at ${peak.v.toFixed(1)}% in ${d3.timeFormat("%b %Y")(peak.t)}`
      : "");
  }

  onStep(index, el) {
    const cfg = STEP_CONFIG[Math.max(0, Math.min(STEP_CONFIG.length - 1, index))];
    // [R3 motion · #3/#4] Idempotent step handler. scrollama re-fires onStepEnter on
    // boundary micro-jitter and on every reverse-scroll re-entry; re-running the focus
    // pipeline re-wiped + re-traced the stamp (blink) and restarted the dim transitions.
    // If the incoming focus matches what is already applied, the on-screen state is
    // already correct — skip. The caption can differ while focus is the same in theory,
    // so also bail only when both match. (_appliedFocus starts at a private sentinel so
    // the very first call, even with focus=null for step 0, always applies.)
    if (cfg.focus === this._appliedFocus && cfg.caption === this._stepCaption) return;
    this._focusCat = cfg.focus;
    this._stepCaption = cfg.caption;
    this._applyFocus();
    this._setKicker(cfg.focus);
    this._renderStamp();
    this._appliedFocus = cfg.focus;
  }

  _applyFocus() {
    const focus = this._focusCat;
    const reduced = this.ctx.motion.reduced;
    this.panelGs.forEach((cell, cat) => {
      const d = cell.datum() || {};
      const isFocus = !focus || cat === focus;
      // [R2·1c] Raised the dimmed level 0.22 → 0.30 so the receding panels keep
      // legible AA contrast (round-1 "remaining lever": dim to recede, not to
      // illegibility). Still a clear hierarchy step below the focused panel's 1.0.
      const target = isFocus ? 1 : 0.3;
      if (reduced) cell.style("opacity", target);
      else cell.transition("focus").duration(440).ease(d3.easeCubicOut).style("opacity", target);

      // [R2·1a] Line colour is state-driven so terracotta marks exactly ONE thing:
      //  • a panel is focused  → THAT panel's line is accent (the focused element);
      //    every other line (including the protagonist) recedes to ink.
      //  • nothing is focused  → only the protagonist (CP045) is accent; rest ink.
      const line = cell.select(".sml-line");
      let stroke, width;
      if (focus && cat === focus) { stroke = "var(--accent)"; width = 2.4; }
      else if (!focus && d.isProtagonist) { stroke = "var(--accent)"; width = 2; }
      else { stroke = getCSS("var(--ink-soft)"); width = 1.6; }
      if (reduced) line.attr("stroke", stroke).attr("stroke-width", width);
      else line.transition("focus-color").duration(440).ease(d3.easeCubicOut)
        .attr("stroke", stroke).attr("stroke-width", width);
      line.attr("filter", (focus && cat === focus) ? "url(#sml-focus-glow)" : null);

      // Area fill: lift the focused panel's category tint a touch so the panel
      // reads as a filled region under its accent line; others stay whisper-faint.
      const areaOp = (focus && cat === focus) ? 0.16 : 0.1;
      const area = cell.select(".sml-area");
      if (reduced) area.attr("opacity", areaOp);
      else area.transition("focus-area").duration(440).attr("opacity", areaOp);

      // Peak dot tracks the same accent logic (focused or protagonist → accent).
      const dotAccent = (focus && cat === focus) || (!focus && d.isProtagonist);
      cell.select(".sml-peak-dot").attr("fill", dotAccent ? "var(--accent)" : "var(--ink-soft)");

      // [CH2-R2] Hide peak tag on the focused panel — stamp already announces the peak.
      // Restore visibility on non-focused panels.
      const tag = cell.select(".sml-peak-tag");
      if (!tag.empty()) tag.style("display", (focus && cat === focus) ? "none" : null);

      // [R4·P5] Also hide the focused panel's own small title — the big italic kicker
      // already names the focused category, so the in-panel title is a redundant echo.
      const ttl = cell.select(".sml-title");
      if (!ttl.empty()) ttl.style("display", (focus && cat === focus) ? "none" : null);
    });
    if (focus) this.panelGs.get(focus)?.raise();
    // [CH2-W2] rAF-stall safety net — force the focus opacity if transitions don't run
    if (this._focusSafety) clearTimeout(this._focusSafety);
    this._focusSafety = setTimeout(() => {
      this.panelGs.forEach((cell, cat) => {
        const isFocus = !focus || cat === focus;
        const target = isFocus ? "1" : "0.3";
        if (cell.style("opacity") !== target) cell.interrupt("focus").style("opacity", target);
      });
    }, 480);
  }

  _renderStamp() {
    if (!this.stampG) return;
    this.stampG.selectAll("*").remove();
    const focus = this._focusCat;
    if (!focus) return;
    // [audit-CH2 P0] On phone the 240x152 stamp cannot fit beside a ~150px panel
    // in a 336x274 viewBox without overlapping the cramped grid. Suppress it:
    // the kicker (top-left) already updates to the focused category + its peak
    // ("peaked at 23.2% in Oct 2022"), the focused panel keeps its glow + peak
    // dot, and the scrolling text step carries the prose. So no information is
    // lost — only the colliding card is removed.
    if (this.isPhone) return;
    const m = this.opts.margin;
    const idx = this.cats.indexOf(focus);
    if (idx < 0) return;
    const col = idx % this.cols, row = Math.floor(idx / this.cols);
    const panelLeft = m.left + col * (this.cellW + this.gapX);
    const panelTop  = m.top  + row * (this.cellH + this.gapY);
    const panelRight = panelLeft + this.cellW;
    const panelBottom = panelTop + this.cellH;
    const panelCx = (panelLeft + panelRight) / 2;
    const panelCy = (panelTop + panelBottom) / 2;

    const series = this.seriesMap.get(focus) || [];
    const peak = d3.greatest(series, d => d.v);
    if (!peak) return;

    // [R2·1b] Place the stamp inside the focused panel's OWN COLUMN, in the
    // vertical space of the rows above or below it (whichever has more room),
    // with a SHORT mostly-vertical leader anchored on the panel's peak point.
    // This fixes the round-1 P2 where a right-column focus (Food / Services)
    // threw a long diagonal leader clear across the grid: a right-column stamp
    // used to be forced to the far left because a 232px card can't fit to the
    // right of the right column. Staying in-column keeps the leader tidy.
    const stampW = 232, stampH = 150;
    const W = this.W, H = this.H;
    const peakX = panelLeft + this.x(peak.t);
    const peakY = panelTop  + this.y(peak.v);
    // Stamp X: left-align to the panel, clamped to the canvas so it never bleeds.
    let stampX = Math.max(14, Math.min(W - stampW - 14, panelLeft));
    // Choose above vs below by available room between the panel and the chart
    // edges. Prefer below unless the panel is in the bottom half.
    const roomBelow = (H - m.bottom) - panelBottom;
    const roomAbove = panelTop - m.top;
    const placeBelow = roomBelow >= roomAbove;
    let stampY = placeBelow
      ? Math.min(H - stampH - 14, panelBottom + 22)
      : Math.max(m.top + 6, panelTop - 22 - stampH);

    // Leader: from the peak point straight to the nearest stamp edge.
    const leaderX = peakX;
    const leaderY = peakY;
    const lineEndX = Math.max(stampX + 8, Math.min(stampX + stampW - 8, peakX));
    const lineEndY = placeBelow ? stampY - 4 : stampY + stampH + 4;

    const g = this.stampG.append("g").attr("class", "stamp");
    const lp = g.append("path").attr("class", "stamp-line")
      .attr("d", `M ${leaderX} ${leaderY} L ${lineEndX} ${lineEndY}`)
      .attr("fill", "none").attr("stroke", "var(--ink)").attr("stroke-width", 0.8);
    const len = lp.node().getTotalLength();
    lp.attr("stroke-dasharray", len).attr("stroke-dashoffset", len)
      .transition().duration(540).ease(d3.easeCubicOut).attr("stroke-dashoffset", 0);
    g.append("circle").attr("cx", leaderX).attr("cy", leaderY).attr("r", 0)
      .attr("fill", "var(--accent)")
      .transition().delay(450).duration(260).attr("r", 4);

    const sg = g.append("g").attr("transform", `translate(${stampX}, ${stampY})`).style("opacity", 0);
    sg.append("rect").attr("class", "stamp-plate sml-stamp-plate")
      .attr("x", -10).attr("y", -10).attr("width", stampW + 20).attr("height", stampH + 20);
    // [R2·1b] Editorial eyebrow: human category name + the dated peak — never the
    // raw COICOP code ("CP04 · PEAK" was database jargon leaking into the graphic).
    const peakLabel = (SHORT_LABEL[focus] || this.data.categoryLabel(focus)).toUpperCase();
    sg.append("text").attr("class", "stamp-eyebrow")
      .attr("x", 0).attr("y", 0)
      .text(`${peakLabel} · PEAKED ${d3.timeFormat("%b %Y")(peak.t).toUpperCase()}`);
    sg.append("text").attr("class", "stamp-num")
      .attr("x", 0).attr("y", 32)
      .text(`${peak.v.toFixed(1)}%`);

    // [CH2-R1] Comparison to the all-items rate at the same month — adds story
    // density. Skip when focus IS overall (CP00) or the gap is < 1 pt. [R2·1b]
    // Reworded from "vs overall (11.5%)" to a human "above the all-items rate".
    const overallSeries = this.seriesMap.get("CP00");
    const overallAtPeak = overallSeries?.find(d => d.time === peak.time);
    const delta = (focus !== "CP00" && overallAtPeak) ? (peak.v - overallAtPeak.v) : null;
    if (delta != null && Math.abs(delta) >= 1) {
      sg.append("text").attr("class", "stamp-compare")
        .attr("x", 0).attr("y", 48)
        .text(`${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} pts ${delta >= 0 ? "above" : "below"} the all-items rate`);
    }

    const sentence = this._stepCaption || `Peaked in ${d3.timeFormat("%B %Y")(peak.t)}.`;
    const words = sentence.split(" ");
    let lineN = 0, buf = "";
    const maxChars = 30;
    const sentenceG = sg.append("g").attr("transform", `translate(0, ${delta != null && Math.abs(delta) >= 1 ? 68 : 52})`);
    words.forEach(w => {
      if ((buf + " " + w).trim().length > maxChars) {
        sentenceG.append("text").attr("class", "stamp-sentence")
          .attr("x", 0).attr("y", lineN * 16).text(buf.trim());
        buf = w; lineN++;
      } else { buf += " " + w; }
    });
    if (buf.trim()) sentenceG.append("text").attr("class", "stamp-sentence")
      .attr("x", 0).attr("y", lineN * 16).text(buf.trim());

    const arr = series.slice(-72).map(d => ({ value: d.v }));
    if (arr.length > 12) {
      const sw2 = stampW, sh = 28;
      const sp = sparkPath(arr, sw2, sh);
      const skg = sg.append("g").attr("transform", `translate(0, ${stampH - sh - 4})`);
      skg.append("path").attr("d", sp.d).attr("fill", "none")
        .attr("stroke", "var(--accent)").attr("stroke-width", 1.4)
        .attr("stroke-dasharray", sp.length).attr("stroke-dashoffset", sp.length)
        .transition().delay(700).duration(900).ease(d3.easeCubicOut).attr("stroke-dashoffset", 0);
      skg.append("circle").attr("cx", sp.lastX).attr("cy", sp.lastY).attr("r", 0)
        .attr("fill", "var(--accent)")
        .transition().delay(1500).duration(260).attr("r", 2.5);
    }

    sg.transition().delay(380).duration(420).style("opacity", 1);
    // [CH2-W1] Safety net — force stamp opacity 1 even if transitions don't tick.
    if (this._stampSafety) clearTimeout(this._stampSafety);
    this._stampSafety = setTimeout(() => {
      if (!sg.empty() && sg.style("opacity") !== "1") sg.interrupt().style("opacity", 1);
      // Also force the sparkline trace to land (if present)
      g.selectAll("path[stroke-dasharray]").each(function () {
        const sel = d3.select(this);
        const off = +sel.attr("stroke-dashoffset");
        if (Number.isFinite(off) && off > 1) sel.interrupt().attr("stroke-dashoffset", 0);
      });
      g.selectAll("circle[r='0']").each(function () {
        const sel = d3.select(this);
        if (+sel.attr("r") === 0) sel.interrupt().attr("r", 2.5);
      });
    }, 1700);
  }

  onThemeChange() { this.render(); }
}
