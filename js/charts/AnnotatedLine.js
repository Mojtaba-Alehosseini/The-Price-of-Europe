/* ============================================================
   AnnotatedLine — CH1 "The official story" (REBUILD for AMENDMENT-2 §B).
   Single EU-27 monthly YoY line, Jan 2019 → Dec 2025, x-domain to 2026-01.
   NO kicker (A2 §B.1). Playhead dot lives only during the scroll-draw and fades
   when the draw completes by step 2 (§B.2/§B.3). Last step = full line end-to-end;
   un-pin resets to the neutral full view (§B.4). Band labels live INSIDE their band,
   centered, clipped (§B.5). Compare mode adds country lines in cmp colours and
   RESCALES y over all visible series (§B.7/§B.8). Zoom = a d3.brushX overview strip
   + preset chips (§B.10). Info-popovers on COVID/WAR/ECB/peak labels (§C). Native
   <title> tooltip replaced by aria-label in BaseChart (§D.1).
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { watchChapterProgress, smooth } from "../modules/ChartMotion.js";
import { ensureGlow } from "../modules/CraftFX.js";
import { getInfoPop } from "../modules/InfoPop.js";

const STEPS = ["calm", "covid", "climb", "peak", "return"];
const DRAW_DONE_STEP = 2;   // §B.3 the scroll-draw finishes by the activation of step 2

// §C.2 verbatim popover copy — the executor writes none of these.
const POP = {
  covid: "March 2020: governments shut shops, travel and factories. Spending collapsed — for a few months prices were falling, not rising.",
  war:   "February 2022: Russia invades Ukraine. Europe scrambles to replace Russian gas, and energy bills drag everything else up with them.",
  ecb:   "The European Central Bank aims to keep inflation near 2% a year — slow enough to ignore, positive enough to avoid deflation.",
  peak:  "October 2022: prices 11.5% higher than a year before — the fastest rise the euro area has ever recorded.",
};
const CMP = ["var(--cmp-1)", "var(--cmp-2)", "var(--cmp-3)", "var(--cmp-4)"];

export class AnnotatedLine extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 12, right: 74, bottom: 74, left: 48 }, aspect: 1.5 });
    this._stepIdx = 0; this._lastStepIdx = -1; this._neutral = false;
    this._drawnP = 0; this._drawComplete = false; this._peakFired = false;
    this._selectedCodes = [];
    this._win = null;                 // current x window [d0,d1]; null = full
    this._compareMode = false;        // §2.1 chips≥1 = explore mode (story annotations hidden)
    this._info = getInfoPop();
  }

  size() {
    if (!this.container) return { width: 600, height: 560 };
    const w = this.container.clientWidth || 600;
    const h = this.container.clientHeight || Math.round(w / this.opts.aspect);
    return { width: w, height: Math.max(340, h) };
  }

  // ---- data helpers ----
  _series(code) {
    const parse = this._parse;
    return this.data.monthsCP00()
      .map(t => ({ t: parse(t), v: this.data.hicpMonthly[code]?.CP00?.[t], time: t }))
      .filter(d => d.v != null && d.time >= "2019-01" && d.time <= "2025-12")
      .sort((a, b) => a.t - b.t);
  }
  _yScale() {   // §B.7 nice domain + explicit ticks so the TOP GRIDLINE (top tick) is always ≥ the data max
    let max = d3.max(this._all, d => d.v) ?? 11.5;
    let min = d3.min(this._all, d => d.v) ?? 0;
    this._selectedCodes.forEach(c => {
      const s = this._series(c);
      const m = d3.max(s, d => d.v); if (m != null && m > max) max = m;
      const n = d3.min(s, d => d.v); if (n != null && n < min) min = n;
    });
    const step = max <= 14 ? 2 : (max <= 28 ? 4 : (max <= 45 ? 5 : 10));
    const top = Math.max(12, Math.ceil((max + step * 0.12) / step) * step);
    // §B.7 lower bound — drop the floor below 0 ONLY when a visible series is actually negative
    // (deflation: prices falling year-on-year), snapped to the same step so the gridlines stay
    // even. Default (EU only, never < 0) keeps the 0 floor, so the story view is unchanged.
    const bottom = min >= 0 ? 0 : Math.floor(min / step) * step;
    return { top, bottom, step, ticks: d3.range(bottom, top + 0.001, step) };
  }
  _line() { return d3.line().x(d => this._x(d.t)).y(d => this._y(d.v)).curve(d3.curveMonotoneX); }

  render() {
    super.render();
    this.container.innerHTML = "";
    const isPhone = this.size().width < 560;
    this._isPhone = isPhone;
    this.opts.margin = isPhone ? { top: 10, right: 18, bottom: 44, left: 40 } : { top: 12, right: 74, bottom: 20, left: 48 };
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    this.svg.attr("aria-label", "Euro-area inflation rose from about 1% in 2019 to a peak of 11.5% in October 2022, then returned to near 2% by 2025.");
    const M = this.opts.margin;
    const overviewH = isPhone ? 0 : 32, gapOv = overviewH ? 16 : 0;   // §B.10 overview strip (desktop)
    const iw = width - M.left - M.right;
    const ih = height - M.top - M.bottom - overviewH - gapOv;         // main plot height above the overview
    this._iw = iw; this._ih = ih; this._overviewH = overviewH; this._gapOv = gapOv;

    const eu = this.data.euAggregateCode();
    const parse = d3.timeParse("%Y-%m");
    this._parse = parse;
    this._all = this._series(eu);

    this._fullDomain = [parse("2019-01"), parse("2026-01")];   // §B.6 extend to 2026-01
    const x = d3.scaleTime().domain(this._win || this._fullDomain).range([0, iw]);
    const ys = this._yScale();
    const y = d3.scaleLinear().domain([ys.bottom, ys.top]).range([ih, 0]);
    this._x = x; this._y = y; this._yTicks = ys.ticks;

    const uid = this.selector.replace(/[^\w]/g, "");
    const defs = this.svg.append("defs");
    this._revealId = `anno-reveal-${uid}`;
    this._revealRect = defs.append("clipPath").attr("id", this._revealId)
      .append("rect").attr("x", 0).attr("y", -4).attr("width", 0).attr("height", ih + 8);
    this._plotClip = `anno-plot-${uid}`;
    defs.append("clipPath").attr("id", this._plotClip)
      .append("rect").attr("x", 0).attr("y", -6).attr("width", iw).attr("height", ih + 12);
    this._defs = defs;

    // grid + axes
    this._gridG = this.g.append("g").attr("class", "grid").call(d3.axisLeft(y).tickSize(-iw).tickValues(ys.ticks).tickFormat("")).lower();
    this._xAxisG = this.g.append("g").attr("class", "axis axis--x").attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")));
    this._yAxisG = this.g.append("g").attr("class", "axis axis--y").call(d3.axisLeft(y).tickValues(ys.ticks).tickFormat(d => d + "%"));

    // ---- event bands (behind the line) + labels INSIDE the band (§B.5) ----
    this._bands = [
      { key: "covid", from: "2020-03", to: "2021-06", fillVar: "--event-covid",  label: "COVID LOCKDOWNS",  showAt: 1, pop: POP.covid },
      { key: "war",   from: "2022-02", to: "2023-06", fillVar: "--event-energy", label: "WAR + ENERGY SHOCK", showAt: 3, pop: POP.war },
    ];
    this._bandG = new Map();
    this._bands.forEach(b => {
      const g = this.g.append("g").attr("class", `anno-band anno-band--${b.key}`).attr("data-band", b.key).style("opacity", 0);
      const clipId = `anno-band-${b.key}-${uid}`;
      const bandClip = defs.append("clipPath").attr("id", clipId).append("rect").attr("class", "anno-band-clip");
      g.append("rect").attr("class", "anno-band-rect").attr("y", 0).attr("height", ih).attr("fill", `var(${b.fillVar})`);
      const lbl = g.append("text").attr("class", "anno-band-label").attr("y", 15).attr("text-anchor", "middle")
        .attr("clip-path", `url(#${clipId})`).text(b.label)
        .style("opacity", 0);   // matches g's own start state — raised out of g into _triggersG (§5.1), so it no longer inherits g's opacity
      b._clipRect = bandClip; b._lbl = lbl; b._g = g;
      this._bandG.set(b.key, g);
    });

    // ---- ECB 2% reference ----
    this._ecbLine = this.g.append("line").attr("class", "anno-ref").attr("x1", 0).attr("x2", iw).attr("y1", y(2)).attr("y2", y(2))
      .attr("stroke", "var(--seq-target)").attr("stroke-width", 1).attr("stroke-dasharray", "3 4").attr("stroke-opacity", 0.85);
    this._ecbLabel = this.g.append("text").attr("class", "anno-ref-label anno-clickable").attr("y", y(2) - 5).attr("text-anchor", "start")
      .text("ECB target 2%");   // colour governed by §D.3 CSS (ink-soft), not an inline fill

    // ---- compared country lines (under the EU line, plot-clipped) ----
    this._extraG = this.g.append("g").attr("class", "anno-extra-g").attr("clip-path", `url(#${this._plotClip})`);

    // ---- the traced EU line (reveal-clipped for the scroll-draw) ----
    const drawG = this.g.append("g").attr("clip-path", `url(#${this._revealId})`);
    this._lineMain = drawG.append("path").datum(this._all).attr("class", "anno-line")
      .attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 2.5)
      .attr("stroke-linejoin", "round").attr("stroke-linecap", "round");

    // ---- tail highlight (2024→end) + "back to 2.3%" tag with a 45° leader (§B.2 marks the end) ----
    this._tail = this._all.filter(d => d.time >= "2024-01");
    this._tailG = this.g.append("g").attr("class", "anno-tail-g").attr("clip-path", `url(#${this._plotClip})`).style("opacity", 0);
    this._tailLine = this._tailG.append("path").datum(this._tail).attr("class", "anno-tail-line")
      .attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 2.8).attr("stroke-linejoin", "round").attr("stroke-linecap", "round");
    this._tailLeader = this._tailG.append("line").attr("class", "anno-tail-leader").attr("stroke", "var(--accent)").attr("stroke-opacity", 0.5).attr("stroke-width", 1);
    this._tailLabel = this._tailG.append("text").attr("class", "anno-tail-label").attr("text-anchor", "end").text(`back to ${this._tail.at(-1).v.toFixed(1)}%`);

    // ---- peak stamp (upper-left empty region, leader to the peak dot) ----
    this._peak = this._all.find(d => d.time === "2022-10") || d3.greatest(this._all, d => d.v);
    const pg = this.g.append("g").attr("class", "anno-peak-g").attr("clip-path", `url(#${this._plotClip})`).style("opacity", 0);
    this._peakG = pg;
    this._pulseHost = pg.append("g").attr("class", "anno-pulse-host");
    this._peakDot = pg.append("circle").attr("class", "anno-peak-dot").attr("r", 4.5).attr("fill", "var(--accent)").attr("stroke", "var(--bg)").attr("stroke-width", 1.8);
    this._peakEyebrow = pg.append("text").attr("class", "stamp-eyebrow anno-clickable").attr("text-anchor", "start").text("PEAK · OCT 2022")
      .style("opacity", 0);   // matches pg's own start state — this node is raised out of pg into _triggersG (§5.1), so it no longer inherits pg's opacity
    this._peakNum = pg.append("text").attr("class", "stamp-num").attr("text-anchor", "start").text(`${this._peak.v.toFixed(1)}%`);
    this._peakSentence = pg.append("g").attr("class", "anno-peak-sentence");
    this._peakLeader = pg.append("line").attr("class", "anno-peak-leader").attr("stroke", "var(--accent)").attr("stroke-opacity", 0.45).attr("stroke-width", 1.5);

    // ---- playhead (draw-tip only; fades on completion — §B.2) ----
    this._drawComplete = false;
    this._playhead = this.g.append("g").attr("class", "anno-playhead").style("opacity", 0);
    this._playhead.append("circle").attr("class", "anno-playhead-halo").attr("r", 9).attr("fill", "var(--accent)").attr("opacity", 0.16);
    this._playhead.append("circle").attr("class", "anno-playhead-dot").attr("r", 5).attr("fill", "var(--accent)").attr("stroke", "var(--bg)").attr("stroke-width", 2);
    this._extraLabels = this.g.append("g").attr("class", "anno-extra-labels");   // country end labels (unclipped → can sit in the right margin)

    // ---- hover crosshair + tooltip (reads EVERY visible line: EU average + compared countries) ----
    this._ch = this.g.append("g").attr("class", "crosshair-g").style("opacity", 0);
    this._ch.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", ih);
    this._hoverDots = this._ch.append("g").attr("class", "anno-hover-dots");   // one dot per visible line
    const bisect = d3.bisector(d => d.t).left;
    const nearest = (data, t) => {
      const i = bisect(data, t), a = data[Math.max(0, i - 1)], b = data[Math.min(data.length - 1, i)];
      return (!a || (b && (t - a.t) > (b.t - t))) ? b : a;
    };
    this._hitRect = this.svg.append("rect").attr("x", M.left).attr("y", M.top).attr("width", iw).attr("height", ih).attr("fill", "transparent")
      .on("mousemove", (event) => {
        const [mx] = d3.pointer(event, this.g.node());
        const t = this._x.invert(mx), dom = this._x.domain();
        // visible series in draw order — EU average first, then each compared country (CMP colours)
        const series = [{ key: "eu", name: "EU average", color: "var(--accent)", data: this._all, sw: "ac-sw--eu" }];
        this._selectedCodes.forEach((code, i) => series.push({ key: code, name: this.data.countryName(code), color: CMP[i % CMP.length], data: this._series(code), sw: `ac-sw--c${i % CMP.length}` }));
        const rows = series.map(s => { const rec = nearest(s.data, t); return rec ? { ...s, rec } : null; })
          .filter(r => r && r.rec.t >= dom[0] && r.rec.t <= dom[1]);
        if (!rows.length) { this._ch.style("opacity", 0); this.ctx.tooltip.hide(); return; }
        const anchorT = rows[0].rec.t;
        this._ch.style("opacity", 1).attr("transform", `translate(${this._x(anchorT)},0)`);
        this._hoverDots.selectAll("circle").data(rows, d => d.key).join(
          enter => enter.append("circle").attr("r", 4).attr("cx", 0).attr("stroke", "var(--bg)").attr("stroke-width", 1.5),
          update => update, exit => exit.remove()
        ).attr("cy", d => this._y(d.rec.v)).attr("fill", d => d.color);
        const multi = rows.length > 1;
        const html = `<h5>${d3.timeFormat("%B %Y")(anchorT)}</h5>` + rows.map(r =>
          `<div class="row"><span class="key">${multi ? `<span class="ac-sw ${r.sw}"></span>` : ""}${multi ? r.name : "Inflation"}</span><span class="val">${r.rec.v.toFixed(1)}%</span></div>`
        ).join("");
        this.ctx.tooltip.show(html, event.clientX, event.clientY);
      })
      .on("mouseleave", () => { this._ch.style("opacity", 0); this.ctx.tooltip.hide(); });

    // [AMENDMENT-3 §5.1 real-click fix] SVG paints/hit-tests in document order — a later
    // sibling always wins over an earlier subtree, however deep it's nested. `_hitRect` is a
    // sibling of `this.g` (appended straight to the svg root) and comes AFTER it, so it sat on
    // top of every popover-trigger label (band labels, ECB label, peak eyebrow) despite them
    // being visually "under" nothing — a real mouse click landed on the invisible hover rect,
    // not the label, so the popover never opened (dispatchEvent-based tests never caught this:
    // dispatching straight at a target element bypasses hit-testing entirely). Fix: a dedicated
    // group appended AFTER `_hitRect`, sharing `this.g`'s exact transform so nothing visually
    // moves; `_flagPopovers()` raises each trigger node into it once flagged.
    this._triggersG = this.svg.append("g").attr("class", "anno-popover-triggers").attr("transform", `translate(${M.left},${M.top})`);

    this._layoutX();          // position everything for the current x window
    this._buildOverview();    // §B.10 brush strip
    this._flagPopovers();     // §C wire clickable labels

    // ---- motion ----
    this._drawnP = 0; this._peakFired = false;
    if (this.ctx.motion.reduced) { this._neutralView(); }
    else { this._applyFocus(0); this._wireScroll(); }

    this._buildControls();
    this._drawExtras();
  }

  // Position all x-dependent geometry for the current x scale (no transition).
  _layoutX(t) {
    const x = this._x, y = this._y, iw = this._iw, ih = this._ih;
    const sel = (s) => t ? s.transition(t) : s;
    sel(this._xAxisG).call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")));
    sel(this._lineMain).attr("d", this._line());
    sel(this._tailLine).attr("d", this._line());
    // bands + clipped labels
    this._bands.forEach(b => {
      const bx = Math.max(0, x(this._parse(b.from))), bxr = Math.min(iw, x(this._parse(b.to))), bw = Math.max(0, bxr - bx);
      sel(b._g.select(".anno-band-rect")).attr("x", bx).attr("width", bw);
      b._clipRect.attr("x", bx).attr("y", 0).attr("width", bw).attr("height", ih);
      // §B.5/§G.8 squish the label to fit inside its band width so its bbox stays inside the band rect.
      b._lbl.attr("x", bx + bw / 2).attr("textLength", null).attr("lengthAdjust", null);
      // The label used to inherit its band group's opacity (nested opacity multiplies down),
      // so "too narrow to show" (bw<=70) always won even when the group itself was visible.
      // Since §5.1 raised the label out of the group (for real-click hit-testing), that
      // multiplicative safety net is gone — track the width-fit explicitly and combine it with
      // the current step-visibility here so a narrow band never shows an overlapping label.
      b._labelFits = bw > 70;
      const stepOp = this._neutral ? 1 : (this._stepIdx >= b.showAt ? 1 : 0);
      sel(b._lbl).style("opacity", b._labelFits ? stepOp : 0);
      const ln = b._lbl.node();
      if (ln && ln.getComputedTextLength) { const w = ln.getComputedTextLength(); if (w > bw - 12) b._lbl.attr("textLength", Math.max(20, bw - 12)).attr("lengthAdjust", "spacingAndGlyphs"); }
    });
    // ECB
    sel(this._ecbLine).attr("y1", y(2)).attr("y2", y(2));
    sel(this._ecbLabel).attr("x", x(this._parse("2019-07"))).attr("y", y(2) - 5);
    // tail tag + leader
    const tEnd = this._tail.at(-1), tlx = x(tEnd.t), tly = y(tEnd.v), lx = tlx - 46, ly = tly - 46;
    sel(this._tailLeader).attr("x1", tlx - 3).attr("y1", tly - 3).attr("x2", lx + 3).attr("y2", ly + 3);
    sel(this._tailLabel).attr("x", lx).attr("y", ly);
    // peak dot + stamp + leader (stamp fixed upper-left)
    const sx = this._isPhone ? 4 : x(this._parse("2019-02")), sy = this._isPhone ? y(9.4) : this._ih * 0.13;
    sel(this._peakDot).attr("cx", x(this._peak.t)).attr("cy", y(this._peak.v));
    this._peakEyebrow.attr("x", sx).attr("y", sy);
    this._peakNum.attr("x", sx).attr("y", sy + 40);
    this._peakSentence.selectAll("*").remove();
    this._wrapText(this._peakSentence, "the fastest prices had ever risen in the euro's lifetime.", sx, sy + 66, 19, "start", "stamp-sentence");
    this._peakLeader.attr("x1", sx + 92).attr("y1", sy + 34).attr("x2", x(this._peak.t) - 7).attr("y2", y(this._peak.v) + 3)
      .style("display", this._isPhone ? "none" : null);
    this._drawExtras();
  }

  // §B.7 rescale y over all visible series, transition axis + grid + every path.
  _rescaleY(animate) {
    const ys = this._yScale();
    this._y.domain([ys.bottom, ys.top]); this._yTicks = ys.ticks;
    const dur = animate && !this.ctx.motion.reduced ? 600 : 0;
    const t = d3.transition().duration(dur).ease(d3.easeCubicInOut);
    this._yAxisG.transition(t).call(d3.axisLeft(this._y).tickValues(ys.ticks).tickFormat(d => d + "%"));
    this._gridG.transition(t).call(d3.axisLeft(this._y).tickSize(-this._iw).tickValues(ys.ticks).tickFormat(""));
    this._lineMain.transition(t).attr("d", this._line());
    this._tailLine.transition(t).attr("d", this._line());
    this._ecbLine.transition(t).attr("y1", this._y(2)).attr("y2", this._y(2));
    this._ecbLabel.transition(t).attr("y", this._y(2) - 5);
    this._peakDot.transition(t).attr("cy", this._y(this._peak.v));
    this._drawExtras(t);
  }

  _drawExtras(t) {
    if (!this._extraG) return;
    this._extraG.selectAll("*").remove();
    if (this._extraLabels) this._extraLabels.selectAll("*").remove();
    const line = this._line(), x = this._x, y = this._y, domHi = x.domain()[1];
    const labels = [];
    this._selectedCodes.forEach((code, i) => {
      const ser = this._series(code); if (!ser.length) return;
      const col = CMP[i % CMP.length];
      this._extraG.append("path").datum(ser).attr("class", "anno-extra-line").attr("fill", "none")
        .attr("stroke", col).attr("stroke-width", 1.5).attr("stroke-opacity", 0.9).attr("stroke-linejoin", "round").attr("d", line);
      const vis = ser.filter(d => d.t <= domHi), end = vis.at(-1) || ser.at(-1);
      labels.push({ code, col, x: x(end.t), y: y(end.v) });
    });
    // §B.8 end-label collision nudge — stacked codes must never touch.
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 13) labels[i].y = labels[i - 1].y + 13;
    const host = this._extraLabels || this._extraG;
    labels.forEach(l => host.append("text").attr("class", "anno-extra-label")
      .attr("x", Math.min(l.x + 4, this._iw + 2)).attr("y", l.y + 3).attr("text-anchor", "start")
      .attr("paint-order", "stroke").attr("stroke", "var(--bg)").attr("stroke-width", 3).attr("fill", l.col).text(l.code));
  }

  // ---- brush overview (§B.10) ----
  _buildOverview() {
    if (this._isPhone || !this._overviewH) return;
    const iw = this._iw, ih = this._ih, ovH = this._overviewH, ovY = ih + this._gapOv + 18;
    const ovG = this.g.append("g").attr("class", "anno-overview").attr("transform", `translate(0,${ovY})`);
    const ox = d3.scaleTime().domain(this._fullDomain).range([0, iw]);
    const oy = d3.scaleLinear().domain([0, this._yScale().top]).range([ovH, 0]);
    ovG.append("path").datum(this._all).attr("class", "anno-ov-line").attr("fill", "none").attr("stroke", "var(--ink-fainter)").attr("stroke-width", 1)
      .attr("d", d3.line().x(d => ox(d.t)).y(d => oy(d.v)).curve(d3.curveMonotoneX));
    const brush = d3.brushX().extent([[0, 0], [iw, ovH]]).on("end", (ev) => { if (ev.sourceEvent) this._onBrush(ev); });
    this._brushG = ovG.append("g").attr("class", "anno-brush").call(brush);
    this._brush = brush; this._ox = ox;
    if (this._win) this._brushG.call(brush.move, [ox(this._win[0]), ox(this._win[1])]);
  }
  _onBrush(ev) {
    if (!ev.selection) { this._resetWindow(true); return; }
    let [x0, x1] = ev.selection.map(px => this._ox.invert(px));
    x0 = d3.timeMonth.floor(x0); x1 = d3.timeMonth.ceil(x1);
    if (d3.timeMonth.count(x0, x1) < 6) x1 = d3.timeMonth.offset(x0, 6);    // §B.10 min 6 months
    if (x1 > this._fullDomain[1]) { x1 = this._fullDomain[1]; x0 = d3.timeMonth.offset(x1, -6); }
    this._applyWindow([x0, x1], true);
  }
  _applyWindow(win, animate) {
    this._win = win;
    this._x.domain(win);
    this._completeDraw();
    const dur = animate && !this.ctx.motion.reduced ? 600 : 0;
    this._layoutX(d3.transition().duration(dur).ease(d3.easeCubicInOut));
    this._syncChips();
  }
  _resetWindow(animate) {
    this._win = null;
    if (this._brushG && this._brush) this._brushG.call(this._brush.move, null);
    this._x.domain(this._fullDomain);
    const dur = animate && !this.ctx.motion.reduced ? 600 : 0;
    this._layoutX(d3.transition().duration(dur).ease(d3.easeCubicInOut));
    this._syncChips();
  }
  _presetWindow(kind, animate) {
    const p = this._parse;
    const win = kind === "crisis" ? [p("2021-01"), p("2024-01")] : [p("2019-01"), p("2026-01")];
    if (kind === "full") { this._resetWindow(animate); }
    else {
      this._applyWindow(win, animate);
      if (this._brushG && this._brush && this._ox) this._brushG.call(this._brush.move, [this._ox(win[0]), this._ox(win[1])]);
    }
  }

  // ---- scroll motion ----
  _wireScroll() {
    if (this._unwatch) this._unwatch();
    const chapter = this.container.closest(".chapter");
    this._unwatch = watchChapterProgress(chapter, p => this._onProgress(p));
    // §B.4 neutral on un-pin — only AFTER the chapter has actually been visible (the IO's initial
    // not-yet-in-view callback must not pre-complete the draw).
    if (this._io) this._io.disconnect();
    this._wasVisible = false;
    this._io = new IntersectionObserver((es) => es.forEach(e => {
      if (e.isIntersecting) this._wasVisible = true;
      else if (this._wasVisible) this._neutralView();
    }), { threshold: 0 });
    this._io.observe(chapter);
  }
  _onProgress(p) {
    if (this._win) return;   // exploring a zoom window; scroll-draw is done
    const target = smooth(Math.max(0, Math.min(1, (p - 0.02) / 0.40)));   // draw completes ~step 2
    if (target >= 0.999) this._completeDraw();
    else if (!this._drawComplete && target > this._drawnP) this._revealTo(target);
  }
  _revealTo(np) {
    this._drawnP = Math.max(this._drawnP, np);
    if (this._revealRect) this._revealRect.attr("width", Math.max(0, this._drawnP * this._iw));
    if (this._playhead) {
      const tip = this._tipAt(this._drawnP);
      this._playhead.attr("transform", `translate(${tip.x},${tip.y})`).style("opacity", this._drawnP > 0.01 ? 1 : 0);
    }
  }
  _completeDraw() {
    if (this._drawComplete) return;
    this._drawComplete = true; this._drawnP = 1;
    if (this._revealRect) this._revealRect.attr("width", this._iw);
    if (this._playhead) this._playhead.interrupt().transition().duration(280).style("opacity", 0);   // §B.2 fade out
  }
  _tipAt(np) {
    const all = this._all, iw = this._iw, tipX = Math.max(0, Math.min(1, np)) * iw;
    let lo = all[0], hi = all[all.length - 1];
    for (let k = 0; k < all.length; k++) { const px = this._x(all[k].t); if (px <= tipX) lo = all[k]; else { hi = all[k]; break; } }
    const x0 = this._x(lo.t), x1 = this._x(hi.t), f = x1 > x0 ? (tipX - x0) / (x1 - x0) : 0;
    return { x: tipX, y: this._y(lo.v + (hi.v - lo.v) * f) };
  }

  onStep(index, el) {
    const i = Math.max(0, Math.min(STEPS.length - 1, index));
    const changed = (i !== this._lastStepIdx);
    this._lastStepIdx = i; this._stepIdx = i;
    if (this.container) { this.container.setAttribute("data-active-focus", STEPS[i]); this.container.setAttribute("data-onstep", i); }
    if (i >= DRAW_DONE_STEP) this._completeDraw();     // §B.3 fully drawn from step 2 on
    if (changed && (this._selectedCodes.length || this._win)) { this._resetCountries(); this._resetWindow(true); }   // story rule
    this._applyFocus(i);
  }

  // The peak eyebrow is raised into `_triggersG` for real-click hit-testing (§5.1 fix, see
  // `_flagPopovers`/`_triggersG`), so it's no longer a DOM descendant of `_peakG` and no longer
  // inherits its opacity. Every place that used to set `_peakG`'s opacity now goes through here
  // so the (relocated) eyebrow still fades with the rest of the peak stamp.
  _setPeakOpacity(op, dur) {
    const apply = g => dur ? g.interrupt().transition().duration(dur).style("opacity", op) : g.interrupt().style("opacity", op);
    if (this._peakG) apply(this._peakG);
    if (this._peakEyebrow) apply(this._peakEyebrow);
  }
  // Same story as the peak eyebrow: each band's label is raised into `_triggersG` (§5.1 fix)
  // so it no longer inherits its band `<g>`'s opacity — set both together, always. The label
  // ALSO respects `_labelFits` (set by `_layoutX`'s width check) so a band too narrow to hold
  // its label never shows it, regardless of what `op` this call wants.
  _setBandOpacity(b, op, dur) {
    const apply = (sel, o) => dur ? sel.interrupt().transition().duration(dur).style("opacity", o) : sel.interrupt().style("opacity", o);
    const g = this._bandG.get(b.key);
    if (g) apply(g, op);
    if (b._lbl) apply(b._lbl, b._labelFits === false ? 0 : op);
  }

  _applyFocus(i) {
    const dur = this.ctx.motion.reduced ? 0 : 420;
    this._neutral = false;
    this._bands.forEach(b => this._setBandOpacity(b, i >= b.showAt ? 1 : 0, dur));
    const showPeak = i >= 3;
    this._setPeakOpacity(showPeak ? 1 : 0, dur);
    if (showPeak && !this._peakFired) { this._peakFired = true; this._firePulse(false); }
    // §B.4 last step = FULL line end-to-end (no dim), tail tag + stamp visible.
    const last = i >= 4;
    if (this._lineMain) this._lineMain.interrupt().transition().duration(dur).attr("stroke-opacity", 1);
    if (this._tailG) this._tailG.interrupt().transition().duration(dur).style("opacity", last ? 1 : 0);
  }

  // §B.4 neutral full view (draw complete, everything visible, no dim, playhead gone).
  _neutralView() {
    this._completeDraw();
    this._neutral = true;
    if (this._playhead) this._playhead.style("opacity", 0);
    this._bands.forEach(b => this._setBandOpacity(b, 1));
    if (this._lineMain) this._lineMain.interrupt().attr("stroke-opacity", 1);
    this._setPeakOpacity(1); if (this._peakG && !this._peakFired) { this._peakFired = true; this._firePulse(true); }
    if (this._tailG) this._tailG.interrupt().style("opacity", 1);
    if (this._win) this._resetWindow(false);
  }

  _firePulse(suppress) {
    if (!this._pulseHost || !this._peak) return;
    if (this._pulseGlow == null) this._peakDot.attr("filter", ensureGlow(this.svg, "anno-peak-glow", 3));
    this._pulseGlow = true;
    if (suppress || this.ctx.motion.reduced) return;
    const cx = this._x(this._peak.t), cy = this._y(this._peak.v);
    for (let k = 0; k < 3; k++) this._pulseHost.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 5)
      .attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 2).style("opacity", 0.6)
      .transition().delay(k * 220).duration(900).ease(d3.easeCubicOut).attr("r", 26).style("opacity", 0).remove();
  }

  // §C wire the four clickable info-labels.
  // Move a trigger node into `_triggersG` (raises it above `_hitRect` for real hit-testing —
  // see the note at `_triggersG`'s creation) without touching its x/y/class attributes; D3
  // selections captured elsewhere (e.g. `b._lbl`) keep working since they wrap the node itself.
  _raiseTrigger(node) { if (node && this._triggersG) this._triggersG.node().appendChild(node); }
  _flagPopovers() {
    const seq = getComputedStyle(document.documentElement).getPropertyValue("--seq-target").trim();
    const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink-soft").trim();
    const acc = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    this._bands.forEach(b => { const n = b._lbl.node(); if (n) { this._info.flag(n, b.pop, ink); this._raiseTrigger(n); } });
    if (this._ecbLabel) { this._info.flag(this._ecbLabel.node(), POP.ecb, seq); this._raiseTrigger(this._ecbLabel.node()); }
    if (this._peakEyebrow) { this._info.flag(this._peakEyebrow.node(), POP.peak, acc); this._raiseTrigger(this._peakEyebrow.node()); }
  }

  _wrapText(sel, text, x, y, lh, anchor, cls) {
    const words = text.split(" "); let line = [], n = 0;
    const emit = (str, dy) => sel.append("text").attr("class", cls).attr("x", x).attr("y", y + dy).attr("text-anchor", anchor).text(str);
    words.forEach(w => { line.push(w); if (line.join(" ").length > 26) { line.pop(); emit(line.join(" "), n * lh); n++; line = [w]; } });
    if (line.length) emit(line.join(" "), n * lh);
  }

  // ---- compare controls (chips + preset chips) ----
  _controlsHost() { return document.getElementById(this.container.id + "-controls"); }
  _buildControls() {
    const host = this._controlsHost(); if (!host) return;
    if (host.dataset.wired === "1") { this._renderChips(); this._syncChips(); return; }
    host.dataset.wired = "1";
    const eu = this.data.euAggregateCode();
    const countries = [...this.data.countriesByCode.values()].filter(c => c.code !== eu && this.data.hicpMonthly[c.code]?.CP00).sort((a, b) => a.name.localeCompare(b.name));
    const opts = countries.map(c => `<option value="${c.code}">${c.name}</option>`).join("");
    host.innerHTML =
      `<span class="ac-add"><label for="${this.container.id}-add" class="ac-add-label">Compare</label>` +
      `<select id="${this.container.id}-add" class="ac-select"><option value="">Add a country…</option>${opts}</select></span>` +
      `<span class="ac-chips" role="list"></span>` +
      `<button type="button" class="ac-reset" hidden>Reset</button>` +
      `<span class="ac-zoom" role="group" aria-label="Zoom the timeline">` +
      `<button type="button" class="ac-zoom-btn is-on" data-zoom="full">2019 – 2025</button>` +
      `<button type="button" class="ac-zoom-btn" data-zoom="crisis">2021 – 2023</button></span>`;
    host.querySelector(".ac-select").addEventListener("change", (e) => { const c = e.target.value; e.target.value = ""; if (c) this._addCountry(c); });
    host.querySelector(".ac-reset").addEventListener("click", () => this._resetCountries());
    host.querySelectorAll(".ac-zoom-btn").forEach(b => b.addEventListener("click", () => this._presetWindow(b.dataset.zoom, true)));
    this._renderChips();
  }
  _renderChips() {
    const host = this._controlsHost(); if (!host) return;
    const chips = host.querySelector(".ac-chips"); if (!chips) return;
    chips.innerHTML = this._selectedCodes.map(code => `<span class="ac-chip" role="listitem">${this.data.countryName(code)}<button type="button" class="ac-chip-x" data-code="${code}" aria-label="Remove ${this.data.countryName(code)}">×</button></span>`).join("");
    chips.querySelectorAll(".ac-chip-x").forEach(b => b.addEventListener("click", () => this._removeCountry(b.dataset.code)));
    const reset = host.querySelector(".ac-reset"); if (reset) reset.hidden = !this._selectedCodes.length;
    const sel = host.querySelector(".ac-select"); if (sel) sel.disabled = this._selectedCodes.length >= 4;
  }
  _syncChips() { const host = this._controlsHost(); if (!host) return; const k = this._win ? "crisis" : "full"; host.querySelectorAll(".ac-zoom-btn").forEach(b => b.classList.toggle("is-on", b.dataset.zoom === k)); }
  // §2.1 compare-mode doctrine: chips≥1 = EXPLORE mode — the story narration (peak stamp +
  // leader, tail "back to X%" tag) fades out; bands/labels/ECB line STAY (context, not
  // narration). Restores to whatever the current scroll step dictates when chips return to 0.
  _syncCompareMode() {
    const compare = this._selectedCodes.length > 0;
    if (compare === this._compareMode) return;
    this._compareMode = compare;
    const dur = this.ctx.motion.reduced ? 0 : 280;   // --dur-3
    if (compare) {
      this._setPeakOpacity(0, dur);
      if (this._tailG) this._tailG.interrupt().transition().duration(dur).style("opacity", 0);
    } else {
      this._applyFocus(this._stepIdx);
    }
  }
  _addCountry(code) { if (this._selectedCodes.includes(code) || this._selectedCodes.length >= 4) return; this._selectedCodes.push(code); this._rescaleY(true); this._renderChips(); this._syncCompareMode(); }
  _removeCountry(code) { this._selectedCodes = this._selectedCodes.filter(c => c !== code); this._rescaleY(true); this._renderChips(); this._syncCompareMode(); }
  _resetCountries() { if (!this._selectedCodes.length) return; this._selectedCodes = []; this._rescaleY(true); this._renderChips(); this._syncCompareMode(); }

  destroy() { if (this._unwatch) this._unwatch(); if (this._io) this._io.disconnect(); super.destroy(); }
  onThemeChange() { this.render(); }
}
