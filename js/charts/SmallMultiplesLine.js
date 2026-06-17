/* ============================================================
   SmallMultiplesLine — 8 panels of euro-area HICP categories.
   Competition-grade: 2-col x 4-row, shared y-axis, line trace
   with sequential delay, area fade-in, italic Fraunces kicker +
   per-panel last-value tag, COVID + Energy bands, scroll-driven
   focus (dim non-target panels + stamp annotation), cross-panel
   synchronised cursor.
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { KEY_CATEGORIES } from "../modules/DataManager.js";
import { sphereGradient } from "../modules/CraftFX.js";
import { drawOnPlay } from "../modules/ChartMotion.js";

// Focus codes MUST match entries in KEY_CATEGORIES (see DataManager.js).
// "FOOD" / "SERV" are aggregate codes in Eurostat but KEY_CATEGORIES uses CP01 for food
// and SERV for services, so the focus codes here are kept aligned with the actual panels.
// [R5·P5] Focus codes drive both the dimming and the hero enlarge. Step 1 now focuses the
// ACTUAL fuse — CP045 (electricity, gas & fuels), the protagonist, the ~54% spike — not the
// broad CP04 housing aggregate, so the chart's enlarge matches its own title ("Energy lit the
// fuse"). Captions carry the VERIFIED take-off leads (EU27_2020, first sustained ≥5% YoY from
// the 2020-06 trough): energy Apr-2021 → headline Nov-2021 = 7 months; → food Feb-2022 = 10
// months; → services Sep-2022 = 17 months. The earlier "six months" was unverified (D18).
const STEP_CONFIG = [
  { focus: null,    caption: null },
  { focus: "CP045", caption: "Energy crossed 5% in April 2021 — seven months before the headline rate, the first category to move." },
  { focus: "CP01",  caption: "Food did not cross 5% until February 2022 — ten months after energy — then peaked near 19% a year later." },
  { focus: "SERV",  caption: "Services never spiked, but crossed 5% in late 2022 and refused to fall — costs moving into wages and rents." },
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
    // [R5·P5] Stash margins + plot box so the focus-mode hero layer can size itself.
    this._m = m; this._plotW = iw; this._plotH = ih;

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

    // <defs> — the focus-mode emphasis is now the hero enlarge (gradient fill + sphere dot +
    // multiply blend), so the old per-panel blur glow is gone; defs holds the clip only.
    const defs = this.svg.append("defs");
    defs.append("clipPath").attr("id", "smlm-clip")
      .append("rect").attr("x", 0).attr("y", 0).attr("width", this.cellW).attr("height", this.cellH);

    // Kicker (top-left). On phone the band is shorter, so raise the baselines.
    const kY = isPhone ? 26 : 50;
    const kSubY = isPhone ? 42 : 72;
    this.kickerG = this.svg.append("g").attr("class", "year-kicker-g sml-kicker");
    this.kickerY  = this.kickerG.append("text").attr("class", "year-kicker sml-kicker-text")
      .attr("x", m.left).attr("y", kY);
    this.kickerSub = this.kickerG.append("text").attr("class", "year-kicker-sub sml-kicker-sub")
      .attr("x", m.left + 3).attr("y", kSubY);
    this._setKicker(null);

    // [R5·P5 / DESIGN-REVIEW Burn-Murdoch] No legend. The unit lives in the subtitle
    // above the SVG ("annual % change") and the focus kicker; the lines are labelled
    // directly (panel last-value tags + the hero's end-of-line label). A legend here
    // was redundant chrome competing with the kicker.

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

    // [R5·P5] Hero layer (topmost) — the focus-mode "enlarge". When a step focuses a
    // category, this holds a scrim that dims the small-multiples grid to calm context +
    // a big redrawn hero panel of that category (its own scales, gradient fill, accent
    // line drawn on, sphere dot, the verified lead-marker) + the caption in the freed
    // space. Cleared on return to the overview. Replaces the old in-grid stamp card —
    // a single panel was too small to annotate in place (Bremer: "pointing at a tiny
    // panel is weak; the focused panel should grow into reclaimed space").
    this.heroG = this.svg.append("g").attr("class", "sml-hero-layer");

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
    this._appliedFocus = cfg.focus;
  }

  _applyFocus() {
    const focus = this._focusCat;
    // [R5·P5] Focus mode is an OVERLAY: the small-multiples grid stays drawn and untouched;
    // the hero layer scrims it to calm context and lifts a big hero panel of the focused
    // category above it. Overview (focus=null) simply removes that layer. Keeping the grid
    // code (and its boundary-jitter + rAF-stall fixes) untouched makes reverse-scroll trivially
    // safe — add a layer / remove a layer — and avoids the non-uniform SVG-text distortion a
    // scale-relayout of the grid would cause (see docs/design_decisions.md D21).
    this._clearHero();
    const reduced = this.ctx.motion.reduced;
    if (!focus) {
      if (reduced) this.g.style("opacity", 1);
      else this.g.transition("grid-fade").duration(360).style("opacity", 1);
      if (this.overlay) this.overlay.style("pointer-events", "all");
      return;
    }
    // Fade the WHOLE grid group (panels + titles + ticks all live inside this.g, so they dim
    // uniformly — no poke-through) to a faint ghost: "the others recede to calm context". The
    // hero draws on an opaque paper plate above it. Mute the grid's hover cursor (it would fire
    // under the ghost — invisible playhead, confusing tooltip); the hero has its own hover.
    if (reduced) this.g.style("opacity", 0.08);
    else this.g.transition("grid-fade").duration(360).style("opacity", 0.08);
    if (this.overlay) this.overlay.style("pointer-events", "none");
    this.ctx.tooltip.hide();
    this._drawHero(focus);
  }

  // ── Focus-mode hero enlarge (R5·P5) ───────────────────────────────────────────
  _clearHero() {
    if (this._heroFade)       { clearTimeout(this._heroFade); this._heroFade = null; }
    if (this._heroLineSafety) { clearTimeout(this._heroLineSafety); this._heroLineSafety = null; }
    if (this.heroG) this.heroG.selectAll("*").remove();
    this._heroX = this._heroY = this._heroRect = this._heroSeries = this._heroFocus = null;
  }

  // First sustained crossing of `thr`% from the 2020-06 trough (the take-off). Window-guarded
  // so a volatile pre-2021 reading can't masquerade as the take-off (verified: none exists).
  _firstCross(cat, thr) {
    const s = this.seriesMap.get(cat) || [];
    for (const p of s) { if (p.time >= "2020-06" && Number.isFinite(p.v) && p.v >= thr) return p; }
    return null;
  }
  _monthsBetween(a, b) {
    const [ay, am] = a.split("-").map(Number), [by, bm] = b.split("-").map(Number);
    return Math.abs((by * 12 + bm) - (ay * 12 + am));
  }
  // The verified lead (months) the focused category ran ahead of / behind its reference, at 5%.
  _leadFor(focus) {
    const map = { CP045: { other: "CP00", phrase: "before the headline" },
                  CP01:  { other: "CP045", phrase: "after energy" } };
    const cfg = map[focus]; if (!cfg) return null;
    const a = this._firstCross(focus, 5), b = this._firstCross(cfg.other, 5);
    if (!a || !b) return null;
    return { gap: this._monthsBetween(a.time, b.time), phrase: cfg.phrase };
  }

  _drawHero(focus) {
    if (!this.heroG) return;
    const reduced = this.ctx.motion.reduced;
    const m = this._m, plotW = this._plotW, plotH = this._plotH;
    const series = (this.seriesMap.get(focus) || []).filter(d => Number.isFinite(d.v));
    if (!series.length) return;
    const isPhone = this.isPhone;

    // (The grid is faded to a faint ghost by _applyFocus — see there. The hero draws on an
    // opaque paper plate above it, with its caption in the freed space.)

    // layout: hero panel + caption in the freed space (never below a shrunken chart)
    let hero, capRect;
    if (isPhone) {
      hero    = { x: m.left, y: m.top + 2, w: plotW, h: Math.round(plotH * 0.52) };
      capRect = { x: m.left, y: hero.y + hero.h + 16, w: plotW, h: plotH - hero.h - 20 };
    } else {
      // [owner review D2] descriptions on the LEFT, the enlarged chart on the RIGHT.
      const hw = Math.round(plotW * 0.60);
      const capW = plotW - hw - 30;
      capRect = { x: m.left, y: m.top + 12, w: capW, h: plotH - 24 };
      hero    = { x: m.left + capW + 30, y: m.top + 6, w: hw, h: plotH - 12 };
    }

    const g = this.heroG.append("g").attr("class", "sml-hero").style("opacity", reduced ? 1 : 0);
    this._drawHeroPanel(g, hero, focus, series, reduced);
    this._drawHeroCaption(g, capRect, focus, series, isPhone);

    if (!reduced) {
      g.transition().duration(280).ease(d3.easeCubicOut).style("opacity", 1);
      this._heroFade = setTimeout(() => { if (!g.empty()) g.interrupt().style("opacity", 1); }, 360);
    }
  }

  _heroAreaGradient(cls) {
    const id = `sml-hero-grad-${cls}`;
    const defs = this.svg.select("defs");
    if (!defs.empty() && defs.select(`#${id}`).empty()) {
      const hue = getCSS(`var(--cat-${cls})`);
      const lg = defs.append("linearGradient").attr("id", id)
        .attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 1);
      lg.append("stop").attr("offset", "0%").attr("stop-color", hue).attr("stop-opacity", 0.34);
      lg.append("stop").attr("offset", "100%").attr("stop-color", hue).attr("stop-opacity", 0.02);
    }
    return id;
  }

  _drawHeroPanel(g, rect, focus, series, reduced) {
    const parse = this.parse;
    const cls = CAT_CLASS[focus] || "other";
    // .craft-blend → the accent line carries multiply (via .series-line) so it sits into the
    // paper + the gradient area; on phone it falls back to opacity (charts.css).
    const panel = g.append("g").attr("class", "sml-hero-panel craft-blend")
      .attr("transform", `translate(${rect.x},${rect.y})`);

    // solid paper backing so the hero reads crisply over the scrimmed ghost grid
    panel.append("rect").attr("class", "sml-hero-plate")
      .attr("x", -6).attr("y", -6).attr("width", rect.w + 12).attr("height", rect.h + 12);

    // scales: time across the full span; y to THIS category's own peak (the hero is about it)
    const xs = d3.scaleTime().domain(this.x.domain()).range([0, rect.w]);
    const vmax = d3.max(series, d => d.v) || 10;
    const vmin = Math.min(0, d3.min(series, d => d.v) || 0);
    const ys = d3.scaleLinear().domain([vmin, Math.ceil((vmax * 1.08) / 5) * 5]).range([rect.h, 0]).nice();
    this._heroX = xs; this._heroY = ys; this._heroRect = rect; this._heroSeries = series; this._heroFocus = focus;

    // event bands
    [["covid", COVID_BAND], ["energy", ENERGY_BAND]].forEach(([k, band]) => {
      panel.append("rect").attr("class", `sml-band event-band--${k}`)
        .attr("x", xs(parse(band[0]))).attr("y", 0)
        .attr("width", Math.max(2, xs(parse(band[1])) - xs(parse(band[0])))).attr("height", rect.h);
    });

    // gridlines + y ticks (zero line emphasised)
    ys.ticks(5).forEach(t => {
      const yy = ys(t);
      panel.append("line").attr("class", t === 0 ? "sml-zero" : "sml-gridline")
        .attr("x1", 0).attr("x2", rect.w).attr("y1", yy).attr("y2", yy);
      panel.append("text").attr("class", "sml-ytick").attr("x", -8).attr("y", yy + 3)
        .attr("text-anchor", "end").text(`${t}%`);
    });
    // x ticks (years)
    ["2016", "2018", "2020", "2022", "2024"].forEach(yr => {
      panel.append("text").attr("class", "sml-xtick").attr("x", xs(parse(`${yr}-01`))).attr("y", rect.h + 16)
        .attr("text-anchor", "middle").text(yr);
    });

    // 5% reference line — the threshold the lead-marker measures against
    const y5 = ys(5);
    if (y5 > 6 && y5 < rect.h - 6) {
      panel.append("line").attr("class", "sml-hero-ref")
        .attr("x1", 0).attr("x2", rect.w).attr("y1", y5).attr("y2", y5);
      panel.append("text").attr("class", "sml-hero-ref-label").attr("x", rect.w - 3).attr("y", y5 - 4)
        .attr("text-anchor", "end").text("5% threshold");
    }

    // gradient area (category hue) + accent line drawn on
    const gradId = this._heroAreaGradient(cls);
    const area = d3.area().x(d => xs(d.t)).y0(ys(0)).y1(d => ys(d.v)).curve(d3.curveMonotoneX);
    panel.append("path").datum(series).attr("class", "sml-hero-area").attr("d", area).attr("fill", `url(#${gradId})`);

    const line = d3.line().x(d => xs(d.t)).y(d => ys(d.v)).curve(d3.curveMonotoneX);
    const lp = panel.append("path").datum(series).attr("class", "sml-hero-line series-line")
      .attr("d", line).attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 2.6)
      .attr("stroke-linejoin", "round").attr("stroke-linecap", "round");
    drawOnPlay(lp, this.ctx.motion, 1000);
    if (!reduced) {
      this._heroLineSafety = setTimeout(() => {
        const off = +lp.attr("stroke-dashoffset");
        if (Number.isFinite(off) && off > 1) lp.interrupt().attr("stroke-dashoffset", 0);
      }, 1150);
    }

    // peak — sphere dot + label
    const peak = d3.greatest(series, d => d.v);
    if (peak) {
      const px = xs(peak.t), py = ys(peak.v), late = (rect.w - px) < 70;
      const dot = panel.append("circle").attr("class", "sml-hero-dot").attr("cx", px).attr("cy", py)
        .attr("r", reduced ? 5 : 0).attr("fill", sphereGradient(this.svg, `hero-${cls}`, getCSS("var(--accent)")));
      if (!reduced) dot.transition().delay(720).duration(300).attr("r", 5);
      panel.append("text").attr("class", "sml-peak-tag sml-peak-tag--lead")
        .attr("x", px + (late ? -9 : 9)).attr("y", py - 8).attr("text-anchor", late ? "end" : "start")
        .text(`peak ${peak.v.toFixed(1)}%`);
    }

    // last value — a direct end-of-line label (Burn-Murdoch: label the line, no legend)
    const last = series[series.length - 1];
    if (last) {
      const lx = xs(last.t), ly = ys(last.v);
      panel.append("circle").attr("class", "sml-hero-lastdot").attr("cx", lx).attr("cy", ly).attr("r", 3);
      panel.append("text").attr("class", "sml-last-tag").attr("x", lx - 6).attr("y", ly - 8)
        .attr("text-anchor", "end").attr("opacity", 1)
        .text(`${last.v >= 0 ? "+" : ""}${last.v.toFixed(1)}% now`);
    }

    // the EVIDENCE — verified lead-marker (#8)
    this._drawLeadMarker(panel, rect, xs, focus);
    // tactile hover for focus mode
    this._buildHeroHover(panel, rect, xs, ys);
  }

  // DESIGN-REVIEW #8 — two vertical markers at the take-off crossings + the gap labelled with
  // the VERIFIED lead (computed at runtime from the data). This is the proof of the title; the
  // enlarge is only the mechanic.
  _drawLeadMarker(panel, rect, xs, focus) {
    const map = { CP045: "CP00", CP01: "CP045" };
    const other = map[focus]; if (!other) return;
    const a = this._firstCross(focus, 5), b = this._firstCross(other, 5);
    if (!a || !b) return;
    const early = (a.time <= b.time) ? a : b;
    const late  = (a.time <= b.time) ? b : a;
    const gap = this._monthsBetween(early.time, late.time);
    const xe = xs(early.t), xl = xs(late.t), topY = 4, by = topY + 9;

    [xe, xl].forEach(x => panel.append("line").attr("class", "sml-lead-mark")
      .attr("x1", x).attr("x2", x).attr("y1", topY).attr("y2", rect.h));
    panel.append("path").attr("class", "sml-lead-bracket").attr("fill", "none")
      .attr("d", `M ${xe} ${by} L ${xl} ${by}`);
    panel.append("text").attr("class", "sml-lead-num").attr("x", (xe + xl) / 2).attr("y", by - 6)
      .attr("text-anchor", "middle").text(`${gap} months`);
    // Splay the month tags OUTWARD from their markers (the two crossings are only ~7–10 months
    // apart on a 10-year axis, so same-side tags would collide): earlier tag to the left, later
    // tag to the right.
    panel.append("text").attr("class", "sml-lead-tag").attr("x", xe - 3).attr("y", rect.h - 5)
      .attr("text-anchor", "end").text(d3.timeFormat("%b ’%y")(early.t));
    panel.append("text").attr("class", "sml-lead-tag").attr("x", xl + 3).attr("y", rect.h - 5)
      .attr("text-anchor", "start").text(d3.timeFormat("%b ’%y")(late.t));
  }

  _drawHeroCaption(g, rect, focus, series, isPhone) {
    const cap = g.append("g").attr("class", "sml-hero-caption").attr("transform", `translate(${rect.x},${rect.y})`);
    const peak = d3.greatest(series, d => d.v);
    const name = (SHORT_LABEL[focus] || this.data.categoryLabel(focus));
    let y = 6;
    cap.append("text").attr("class", "stamp-eyebrow").attr("x", 0).attr("y", y).text(name.toUpperCase());

    // headline number = the LEAD (months) when there is one — that is the chapter's evidence;
    // otherwise the category peak.
    const lead = this._leadFor(focus);
    y += isPhone ? 30 : 46;
    if (lead) {
      cap.append("text").attr("class", "stamp-num").attr("x", -1).attr("y", y).text(lead.gap);
      cap.append("text").attr("class", "stamp-compare").attr("x", 0).attr("y", y + (isPhone ? 16 : 19))
        .text(`months ${lead.phrase}`);
    } else if (peak) {
      cap.append("text").attr("class", "stamp-num").attr("x", -1).attr("y", y)
        .text(`${peak.v >= 0 ? "+" : ""}${peak.v.toFixed(1)}%`);
      cap.append("text").attr("class", "stamp-compare").attr("x", 0).attr("y", y + (isPhone ? 16 : 19))
        .text(`peak · ${d3.timeFormat("%b %Y")(peak.t)}`);
    }
    y += isPhone ? 34 : 42;

    // sentence (word-wrapped)
    const sentence = this._stepCaption || "";
    if (sentence) {
      const maxChars = isPhone ? 44 : 27;
      const words = sentence.split(" ");
      let buf = "", lineN = 0;
      const sg = cap.append("g").attr("transform", `translate(0, ${y})`);
      const emit = (txt) => sg.append("text").attr("class", "stamp-sentence").attr("x", 0).attr("y", lineN++ * 17).text(txt);
      words.forEach(w => { if ((buf + " " + w).trim().length > maxChars) { emit(buf.trim()); buf = w; } else buf += " " + w; });
      if (buf.trim()) emit(buf.trim());
      y += lineN * 17;
    }

    // mini sparkline (last 72 mo) — desktop only (phone is tight)
    if (!isPhone) {
      const arr = series.slice(-72).map(d => ({ value: d.v }));
      if (arr.length > 12) {
        const sw = Math.min(rect.w, 200), sh = 30;
        const sp = sparkPath(arr, sw, sh);
        const skg = cap.append("g").attr("transform", `translate(0, ${Math.min(rect.h - sh - 2, y + 18)})`);
        skg.append("path").attr("d", sp.d).attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 1.4);
        skg.append("circle").attr("cx", sp.lastX).attr("cy", sp.lastY).attr("r", 2.4).attr("fill", "var(--accent)");
      }
    }
  }

  _buildHeroHover(panel, rect, xs, ys) {
    const series = this._heroSeries;
    const cur = panel.append("g").attr("class", "sml-hero-cursor").attr("pointer-events", "none").style("opacity", 0);
    const ph  = cur.append("line").attr("class", "cursor-line").attr("y1", 0).attr("y2", rect.h);
    const dot = cur.append("circle").attr("class", "sml-hero-curdot").attr("r", 4);
    const lbl = cur.append("text").attr("class", "sml-cursor-month").attr("y", -4);
    const read = (clientX, evt) => {
      const r = this.svg.node().getBoundingClientRect();
      const vb = this.svg.attr("viewBox").split(/\s+/).map(Number);
      const svgX = ((clientX - r.left) / r.width) * vb[2];
      const t = xs.invert(Math.max(0, Math.min(rect.w, svgX - rect.x)));
      const monthKey = d3.timeFormat("%Y-%m")(t);
      const rec = series.find(p => p.time === monthKey);
      if (!rec) { cur.style("opacity", 0); this.ctx.tooltip.hide(); return; }
      const cx = xs(rec.t);
      cur.style("opacity", 1);
      ph.attr("x1", cx).attr("x2", cx);
      dot.attr("cx", cx).attr("cy", ys(rec.v));
      lbl.attr("x", cx).attr("text-anchor", cx > rect.w - 56 ? "end" : "start").text(d3.timeFormat("%b %Y")(rec.t));
      if (evt) {
        const items = this.cats.map(c => {
          const v = this.data.hicpMonthly[this.eu]?.[c]?.[monthKey];
          const l = SHORT_LABEL[c] || this.data.categoryLabel(c);
          return `<div class="row"><span class="key">${l}</span><span class="val">${v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(1) + "%"}</span></div>`;
        }).join("");
        this.ctx.tooltip.show(`<h5>${d3.timeFormat("%b %Y")(t)}</h5>${items}`, evt.clientX, evt.clientY);
      }
    };
    const hit = panel.append("rect").attr("class", "sml-hero-hit")
      .attr("x", 0).attr("y", 0).attr("width", rect.w).attr("height", rect.h)
      .attr("fill", "transparent").style("cursor", "crosshair");
    hit.on("mousemove", (e) => read(e.clientX, e))
       .on("mouseleave", () => { cur.style("opacity", 0); this.ctx.tooltip.hide(); });
    hit.node().addEventListener("touchstart", (e) => {
      if (!e.touches || !e.touches.length) return;
      const t = e.touches[0]; read(t.clientX, { clientX: t.clientX, clientY: t.clientY });
    }, { passive: true });
  }

  onThemeChange() { this.render(); }
}
