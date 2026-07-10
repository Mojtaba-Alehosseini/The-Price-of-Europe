/* ============================================================
   Heatmap — CH4 "The cruel lag" (REBUILD, brief §5 CH4).
   rows = categories (Energy, Food, Services, Transport, Overall);
   cols = months Jan 2021 – Dec 2024; cell colour = monthly YoY rate
   on the --seq green→red ramp (HEX only — D15). Reads as five stacked
   time-ribbons: the energy ribbon runs red-hot through 2022, then cools
   while food stays hot — "Energy let go. Food never did."
     reveal: columns sweep in left→right on scroll (latched clip)
     steps:  a claret column-FRAME moves 2022 → spring 2023 → 2024
     hover:  cell tooltip (category · month · rate); row label dims other rows
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { watchChapterProgress, smooth } from "../modules/ChartMotion.js";

const ROWS = [
  { code: "NRG",  label: "Energy" },
  { code: "FOOD", label: "Food" },
  { code: "SERV", label: "Services" },
  { code: "CP07", label: "Transport" },
  { code: "CP00", label: "Overall" },
];

// Step → the claret column-frame range (inclusive month keys) + kicker word.
const FRAMES = {
  "2022":   { from: "2022-01", to: "2022-12", kicker: "2022" },
  "2023H1": { from: "2023-01", to: "2023-06", kicker: "2023" },
  "2024":   { from: "2024-01", to: "2024-12", kicker: "2024" },
};
const FRAME_ORDER = ["2022", "2023H1", "2024"];

// [D85] Event markers — 4 picks from data/processed/events_timeline.json (loaded once into
// this.data.events by DataManager), filtered to this chart's own 2021-01..2024-12 domain and
// narrowed to the events with the clearest link to the chart's own 3-step arc (2022 shock ->
// spring 2023 handover -> 2024 lingering). Only `date` is used as the lookup key — the label/
// category/description text is always read live from this.data.events, never duplicated here.
// pulseStep (0/1/2, matching FRAME_ORDER's index) marks the one step whose own narrative text
// directly names this event; only those get the step-enter pulse, per the owner's own
// conditional framing ("if a scroll step's narrative corresponds to an event").
const EVENT_PICKS = [
  { date: "2022-02-24", micro: "WAR BEGINS", pulseStep: 0 },
  { date: "2022-07-21", micro: "ECB HIKES",  pulseStep: null },
  { date: "2023-06-15", micro: "FOOD PEAKS", pulseStep: 1 },
  { date: "2024-06-06", micro: "ECB CUTS",   pulseStep: null },
];
// Extra bottom-margin reserved for the event tier (Option A) — matched 1:1 by a scoped panel
// block-size increase in charts.css so ih/cell/row geometry never shifts. Dropped to 0 at
// <=768px (dot-only mode shares the existing year-row margin, no separate label row needed).
const EVENT_TIER_H = 14;

export class Heatmap extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 60, right: 20, bottom: 30, left: 96 }, aspect: 1.5 });
    this._frame = "2022";
    this._drawn = 0;
  }

  // seq green→red ramp. Domain spans −3…41 (energy peaks ~41); good resolution in the busy
  // 0–15 band, red parked for the 25+ energy spikes.
  static DOMAIN = [-3, 0, 4, 8, 15, 25, 41];
  static TICKS = [{ v: 0, t: "0" }, { v: 10, t: "10" }, { v: 20, t: "20" }, { v: 41, t: "40+" }];
  _colorScale(pal) {
    const s = pal.seq;
    return d3.scaleLinear().domain(Heatmap.DOMAIN)
      .range([s[0], s[0], s[1], s[2], s[3], d3.interpolateLab(s[3], s[4])(0.5), s[4]])
      .interpolate(d3.interpolateLab).clamp(true);
  }

  size() {
    if (!this.container) return { width: 700, height: 480 };
    const w = this.container.clientWidth || 700;
    const h = this.container.clientHeight || Math.round(w / this.opts.aspect);
    // [D85] The container's own CSS height never grows (shared 100dvh-derived rule with every
    // other chart) — the event tier's extra height is added HERE, on top of the real measured
    // clientHeight, and margin.bottom grows by the identical amount in render() so ih is
    // unaffected. The resulting viewBox is genuinely taller than its container; charts.css frees
    // this chart's own svg from the shared max-block-size:100% cap so it renders at that true
    // (taller) size and overflows its grid row rather than being squeezed to fit — `.scroller__chart`
    // is already `overflow:visible`. Dropped to 0 at <=768px, matching the dot-only breakpoint.
    const tierH = window.innerWidth <= 768 ? 0 : EVENT_TIER_H;
    return { width: w, height: Math.max(320, h) + tierH };
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const isPhone = this.size().width < 560;
    this._isPhone = isPhone;
    // [D85] Viewport-width breakpoint (not the container-width isPhone flag above, which serves
    // a different purpose — row-label abbreviation/margin sizing at TRUE phone widths). The owner
    // asked for the event label row to drop to dot-only "at 768px and below", matching the
    // project's own tablet-portrait breakpoint (responsive.css), independent of container width.
    const narrowViewport = window.innerWidth <= 768;
    this._narrowViewport = narrowViewport;
    const tierH = narrowViewport ? 0 : EVENT_TIER_H;
    this.opts.margin = isPhone
      ? { top: 50, right: 12, bottom: 28 + tierH, left: 62 }
      : { top: 60, right: 20, bottom: 30 + tierH, left: 96 };
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    // [D85] The svg's rendered height, absent an explicit CSS height, was measured to settle to
    // chart-body's own grid-stretched box (~790px) regardless of a taller viewBox or a freed
    // max-block-size — chart-body is a GRID ITEM stretched to fill its `1fr` track independent of
    // its content, so the svg (a flex item inside it) never gets the chance to grow past that via
    // aspect-ratio alone. An explicit inline height is unambiguous and wins over both the
    // grid-stretch and the (still necessary, for max-height) CSS override below.
    this.svg.style("height", height + "px");
    this.svg.attr("aria-label", "Monthly inflation by category, 2021–2024: the energy row runs red-hot through 2022 then cools, while food stays hot into 2023 and services linger.");
    const M = this.opts.margin;
    const iw = width - M.left - M.right, ih = height - M.top - M.bottom;
    this._iw = iw; this._ih = ih;

    const eu = this.data.euAggregateCode();
    const months = [];
    for (const t of this.data.monthsCP00()) if (t >= "2021-01" && t <= "2024-12") months.push(t);
    months.sort();
    this._months = months;
    const parse = d3.timeParse("%Y-%m");
    this._parse = parse;

    const x = d3.scaleBand().domain(months).range([0, iw]).padding(0);
    const y = d3.scaleBand().domain(ROWS.map(r => r.code)).range([0, ih]).padding(0.06);
    this._x = x; this._y = y;
    this.color = this._colorScale(this.palette());

    // cell matrix
    const bg = getCSS("--bg"), ink = getCSS("--ink"), noData = getCSS("--rule-soft");
    const cells = [];
    ROWS.forEach(r => months.forEach(t => cells.push({ code: r.code, label: r.label, t, v: this.data.hicpMonthly[eu]?.[r.code]?.[t] })));
    this._cellData = cells;

    // defs — reveal clip (latched L→R column sweep)
    const uid = this.selector.replace(/[^\w]/g, "");
    const defs = this.svg.append("defs");
    const revealId = `hm-reveal-${uid}`;
    this._revealRect = defs.append("clipPath").attr("id", revealId)
      .append("rect").attr("x", -1).attr("y", -6).attr("width", 0).attr("height", ih + 12);

    const gCells = this.g.append("g").attr("clip-path", `url(#${revealId})`);
    this.cells = gCells.selectAll("rect.hm-cell").data(cells, d => `${d.code}-${d.t}`).join("rect")
      .attr("class", "hm-cell")
      .attr("x", d => x(d.t)).attr("y", d => y(d.code))
      .attr("width", x.bandwidth()).attr("height", y.bandwidth())
      .attr("fill", d => d.v == null ? noData : this.color(d.v))
      .attr("stroke", bg).attr("stroke-width", 1)
      .on("mouseenter", (e, d) => this._hoverCell(e.currentTarget, d, e))
      .on("mousemove", e => this.ctx.tooltip.move(e.clientX, e.clientY))
      .on("mouseleave", e => this._blurCell(e.currentTarget))
      .on("pointerdown", (e, d) => { if (e.pointerType !== "mouse") this._hoverCell(e.currentTarget, d, e); });

    // thin year separator rules (left edge of each year)
    ["2022-01", "2023-01", "2024-01"].forEach(t => {
      this.g.append("line").attr("class", "hm-year-sep")
        .attr("x1", x(t)).attr("x2", x(t)).attr("y1", -4).attr("y2", ih + 4);
    });

    // row labels (left, caps) — hover dims other rows
    this.g.selectAll("text.hm-row-label").data(ROWS).join("text")
      .attr("class", "hm-row-label").attr("text-anchor", "end")
      .attr("x", -10).attr("y", d => y(d.code) + y.bandwidth() / 2 + 4)
      .style("cursor", "pointer")
      .text(d => isPhone ? d.label.slice(0, 4) : d.label)
      .on("mouseenter", (e, d) => this._dimRows(d.code))
      .on("mouseleave", () => this._dimRows(null));

    // column labels at year starts only
    ["2021", "2022", "2023", "2024"].forEach(yr => {
      const t = `${yr}-01`;
      this.g.append("text").attr("class", "hm-col-head")
        .attr("x", x(t) + x.bandwidth() / 2).attr("y", ih + 16).attr("text-anchor", "start").text(yr);
    });

    // claret column-frame (moves per step)
    this._frameRect = this.g.append("rect").attr("class", "hm-frame")
      .attr("y", -4).attr("height", ih + 8).attr("rx", 2).style("opacity", 0);

    // [D85] event markers — resolved against the live events dataset, drawn last so they layer
    // above the year-separator rules but stay entirely outside [0,ih] (never over the cell grid).
    this._eventMarks = EVENT_PICKS
      .map(pick => {
        const rec = this.data.events.find(e => e.date === pick.date);
        if (!rec) return null;
        const monthKey = pick.date.slice(0, 7);
        if (!months.includes(monthKey)) return null;
        return { ...pick, cx: x(monthKey) + x.bandwidth() / 2, desc: rec.event, category: rec.category };
      })
      .filter(Boolean);
    this._eventsFired = false;
    this._drawEvents(isPhone, narrowViewport);

    // kicker + legend
    this._kickNum = this.svg.append("text").attr("class", "kick-num")
      .attr("x", M.left - 2).attr("y", isPhone ? 34 : 42)
      .style("font-size", isPhone ? "26px" : "34px").text(FRAMES[this._frame].kicker);
    this._drawScaleLegend(width - M.right, isPhone ? 20 : 26, isPhone);

    // reveal + frame
    this._drawn = 0;
    if (this.ctx.motion.reduced) {
      this._revealTo(1);
      this._moveFrame("2024", true);
      this._kickNum.text(FRAMES["2024"].kicker);
    } else {
      this._moveFrame(this._frame, true);
      this._wireScroll();
    }
  }

  _wireScroll() {
    if (this._unwatch) this._unwatch();
    const chapter = this.container.closest(".chapter");
    this._unwatch = watchChapterProgress(chapter, p => this._onProgress(p));
    this._watchUnpin(chapter, () => { this._revealTo(1); this._moveFrame("2024", true); this._kickNum.text(FRAMES["2024"].kicker); });   // [A2 §B.4]
  }

  _revealTo(np) {
    this._drawn = Math.max(this._drawn || 0, np);
    if (this._revealRect) this._revealRect.attr("width", Math.max(0, this._drawn * (this._iw + 2)));
    // [D85] events are last in the chapter's reveal order — fire once the grid's own latched
    // sweep reaches its end, whichever path got it there (animated scroll or the reduced-motion
    // instant _revealTo(1) in render()).
    if (this._drawn >= 0.999 && !this._eventsFired) { this._eventsFired = true; this._revealEvents(); }
  }

  _onProgress(p) {
    // The column sweep is the chapter's ENTRANCE — complete it early (by ~p=0.14) so the whole grid
    // is drawn before the first frame step activates (~p=0.22); otherwise the claret 2022 frame would
    // sit over still-blank columns. Latched, so re-scrolling never un-draws it.
    const target = smooth(Math.max(0, Math.min(1, p / 0.14)));
    if (target > this._drawn) this._revealTo(target);
  }

  onStep(index, el) {
    const frame = (el && el.dataset.frame) || FRAME_ORDER[Math.max(0, Math.min(FRAME_ORDER.length - 1, index))];
    this._frame = frame;
    if (this.container) { this.container.setAttribute("data-active-frame", frame); this.container.setAttribute("data-onstep", index); }
    if (this._kickNum) this._kickNum.text(FRAMES[frame]?.kicker || "");
    this._moveFrame(frame, false);
    this._pulseStepEvent(index);
  }

  _moveFrame(frame, immediate) {
    const f = FRAMES[frame]; if (!f || !this._frameRect) return;
    const x = this._x;
    const x0 = x(f.from), x1 = x(f.to) + x.bandwidth();
    const sel = immediate || this.ctx.motion.reduced ? this._frameRect : this._frameRect.interrupt().transition().duration(600).ease(d3.easeCubicInOut);
    sel.attr("x", x0 - 1).attr("width", (x1 - x0) + 2).style("opacity", 1);
  }

  // [D85] Event markers — bottom-axis tier, chosen over a top tier (between kicker/legend and
  // the grid) after shooting both at 1440/390: the top tier put "ECB CUTS" directly under the
  // legend's own "0…40+" tick labels — the kicker's big italic number and the legend already
  // claim nearly all of the existing 60px top margin, leaving no clean lane for a third element.
  // The bottom tier has no such competition — nothing else lives in that margin — and reads as a
  // quiet fifth ribbon under the grid, the same "capital-style dot below the data" voice as the
  // choropleth's peak markers. Dot sits just under the grid; at narrowViewport (<=768px) it's the
  // only mark (shares the existing margin, no growth, per the owner's dot-only spec) — the label
  // moves into the hover/tap tooltip instead (wired in _hoverEvent).
  _drawEvents(isPhone, narrowViewport) {
    if (!this._eventMarks || !this._eventMarks.length) return;
    const ih = this._ih;
    const g = this._eventG = this.g.append("g").attr("class", "hm-event-layer");
    const dotY = this._eventDotY = narrowViewport ? ih + 4 : ih + 24;
    const labelY = ih + 35;
    const reduced = this.ctx.motion.reduced;
    const marks = g.selectAll("g.hm-event").data(this._eventMarks, d => d.date).join("g")
      .attr("class", "hm-event")
      .style("cursor", "pointer")
      // [D85] motion: fade+rise plays once the grid's own reveal finishes (_revealEvents,
      // triggered from _revealTo) — start hidden here so there's no pre-reveal flash; reduced
      // motion snaps straight to the visible end-state, no transform offset to undo later.
      .style("opacity", reduced ? 1 : 0)
      .style("transform", reduced ? null : "translateY(3px)")
      .on("mouseenter", (e, d) => this._hoverEvent(e.currentTarget, d, e))
      .on("mousemove", e => this.ctx.tooltip.move(e.clientX, e.clientY))
      .on("mouseleave", e => this._blurEvent(e.currentTarget))
      .on("pointerdown", (e, d) => { if (e.pointerType !== "mouse") this._hoverEvent(e.currentTarget, d, e); });
    // Invisible, generously-sized hit target — the visible dot (2-2.4px) is too small to hover
    // or tap reliably on its own, especially at narrowViewport's dot-only size.
    marks.append("circle").attr("class", "hm-event-hit")
      .attr("cx", d => d.cx).attr("cy", dotY).attr("r", 9);
    marks.append("circle").attr("class", "hm-event-dot")
      .attr("cx", d => d.cx).attr("cy", dotY).attr("r", narrowViewport ? 2 : 2.4);
    if (narrowViewport) return;

    const labels = marks.append("text").attr("class", "hm-event-label")
      .attr("x", d => d.cx).attr("y", labelY).attr("text-anchor", "middle")
      .text(d => d.micro);

    // [D85] Two of the 4 picks land only 5 months apart (Feb + Jul 2022) — close enough that
    // their labels touched with only ~2.6px between them (measured at 1440px), reading as one
    // run-on phrase. Nudge ONLY the label text apart, symmetrically, on a single left-to-right
    // sweep — dots stay exactly on their true chronological x, never adjusted, so the marker
    // itself is never historically inaccurate, only the text beneath it breathes.
    const nodes = labels.nodes();
    const MIN_GAP = 10;
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const ax = +a.getAttribute("x"), bx = +b.getAttribute("x");
      const gap = (bx - b.getComputedTextLength() / 2) - (ax + a.getComputedTextLength() / 2);
      if (gap < MIN_GAP) {
        const push = (MIN_GAP - gap) / 2;
        a.setAttribute("x", ax - push);
        b.setAttribute("x", bx + push);
      }
    }
  }

  // [D85] Fires once, the first time the grid's own scroll-latched reveal reaches 1 (called from
  // _revealTo, which already covers both the animated and reduced-motion(instant _revealTo(1))
  // paths) — "events fade in AFTER the grid has painted its reveal, last in the chapter's reveal
  // order." Reduced motion already rendered at its final opacity/position in _drawEvents, so this
  // is a no-op there beyond the guard itself.
  _revealEvents() {
    if (!this._eventG || this.ctx.motion.reduced) return;
    this._eventG.selectAll("g.hm-event")
      .transition().delay((d, i) => i * 80).duration(280).ease(d3.easeCubicOut)
      .style("opacity", 1).style("transform", "translateY(0px)");
  }

  // [D85] One-time soft pulse when a step whose OWN narrative names this event is entered —
  // reuses the exact 3-ring burst already established in AnnotatedLine._firePulse /
  // SmallMultiplesLine._pulse (radius 3->~18-26, staggered ~220ms, 900ms ease-out, stroke=accent,
  // fill=none, self-removing) rather than inventing a new pulse language. Re-fires on every
  // re-entry into the step (matches SmallMultiplesLine's own cfg.pulse, which has no permanent
  // fired-guard) — only the immediate double-fire is guarded, per the D84 idempotency lesson.
  _pulseStepEvent(index) {
    if (this.ctx.motion.reduced || !this._eventMarks || !this._eventG) return;
    const mark = this._eventMarks.find(m => m.pulseStep === index);
    if (!mark || this._lastPulsedStep === index) return;
    this._lastPulsedStep = index;
    for (let k = 0; k < 3; k++) {
      this._eventG.append("circle")
        .attr("cx", mark.cx).attr("cy", this._eventDotY).attr("r", 3)
        .attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 1.6).style("opacity", 0.6)
        .transition().delay(k * 220).duration(900).ease(d3.easeCubicOut).attr("r", 18).style("opacity", 0).remove();
    }
  }

  _hoverEvent(node, d, ev) {
    d3.select(node).raise().classed("hm-event--focus", true);
    const dt = d3.timeFormat("%B %Y")(this._parse(d.date.slice(0, 7)));
    this.ctx.tooltip.show(
      `<h5>${dt}</h5><div class="row"><span class="key">${d.desc}</span></div>`,
      ev?.clientX ?? 0, ev?.clientY ?? 0);
  }
  _blurEvent(node) { d3.select(node).classed("hm-event--focus", false); this.ctx.tooltip.hide(); }

  _dimRows(code) {
    if (!this.cells) return;
    this.cells.interrupt("dim").transition("dim").duration(200)
      .attr("opacity", d => !code || d.code === code ? 1 : 0.18);
    this.g.selectAll("text.hm-row-label").classed("hm-row-label--peak", d => code && d.code === code);
  }

  _hoverCell(node, d, ev) {
    d3.select(node).raise().classed("hm-cell--focus", true);
    const dt = d3.timeFormat("%B %Y")(this._parse(d.t));
    this.ctx.tooltip.show(
      `<h5>${d.label}</h5><div class="row"><span class="key">${dt}</span><span class="val">${d.v == null ? "—" : (d.v >= 0 ? "+" : "") + d.v.toFixed(1) + "%"}</span></div>`,
      ev?.clientX ?? 0, ev?.clientY ?? 0);
  }
  _blurCell(node) { d3.select(node).classed("hm-cell--focus", false); this.ctx.tooltip.hide(); }

  _drawScaleLegend(xRight, yTop, isPhone) {
    const barW = isPhone ? 96 : 128, barH = 8;
    const g = this.svg.append("g").attr("class", "hm-scale-legend")
      .attr("transform", `translate(${xRight - barW}, ${yTop})`).attr("pointer-events", "none");
    g.append("text").attr("class", "hm-scale-unit").attr("x", barW).attr("y", -5).attr("text-anchor", "end").text("ANNUAL %");
    const D = Heatmap.DOMAIN, lo = D[0], hi = D[D.length - 1];
    const px = v => ((v - lo) / (hi - lo)) * barW;
    const gradId = `hm-grad-${this.selector.replace(/[^\w]/g, "")}`;
    const grad = g.append("defs").append("linearGradient").attr("id", gradId).attr("x1", "0%").attr("x2", "100%");
    const N = 24;
    for (let i = 0; i <= N; i++) grad.append("stop").attr("offset", `${(i / N) * 100}%`).attr("stop-color", this.color(lo + (hi - lo) * (i / N)));
    g.append("rect").attr("class", "hm-scale-bar").attr("x", 0).attr("y", 0).attr("width", barW).attr("height", barH).attr("rx", 1.5).attr("fill", `url(#${gradId})`);
    Heatmap.TICKS.forEach(s => {
      const tx = px(s.v);
      g.append("line").attr("class", "hm-scale-tickmark").attr("x1", tx).attr("x2", tx).attr("y1", 0).attr("y2", barH + 2);
      g.append("text").attr("class", "hm-scale-tick").attr("x", tx).attr("y", barH + 12)
        .attr("text-anchor", s.v === lo ? "start" : (s.v === hi ? "end" : "middle")).text(s.t);
    });
  }

  destroy() { if (this._unwatch) this._unwatch(); super.destroy(); }
  onThemeChange() { this.render(); }
}

function getCSS(name) { const m = name.match(/var\((--[^)]+)\)/); const n = m ? m[1] : name; return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
