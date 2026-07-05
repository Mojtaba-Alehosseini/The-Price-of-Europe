/* ============================================================
   RateLevel — CH5 "The end that isn't" · THE KEY CHART (NEW, brief §5 CH5).
   Two stacked panels on a shared x (Jan 2019 – Dec 2025), one linked cursor.
     TOP   "climb speed" — monthly YoY % (CP00): the mountain that came home to 2%.
     BOTTOM "how high prices sit" — index rebased 2019-01 = 100, ending 129.7:
            the altitude that never came back down.
   The essay's thesis lives in the gap between the two: the RATE returned to 2%,
   the LEVEL stayed ~30% up. The kicker flips 2% → 129.7 to say exactly that.
     step 0 draws the top only · step 1 reveals the bottom rising from baseline
     step 2 sweeps ONE shared cursor 2019→2025, locks at Dec 2025, bracket pulses.
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { watchChapterProgress, smooth } from "../modules/ChartMotion.js";
import { ensureGlow } from "../modules/CraftFX.js";
import { getInfoPop } from "../modules/InfoPop.js";

const STEPS = ["rate", "both", "cursor"];

export class RateLevel extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 52, right: 76, bottom: 30, left: 66 }, aspect: 1.0 });
    this._view = "rate";
    this._topDrawn = 0; this._botDrawn = 0; this._sweep = 0;
    this._hoverMonth = null;
    this._info = getInfoPop();   // [A2 §C.3] shared info-popover
  }

  size() {
    if (!this.container) return { width: 680, height: 640 };
    const w = this.container.clientWidth || 680;
    const h = this.container.clientHeight || Math.round(w / this.opts.aspect);
    return { width: w, height: Math.max(420, h) };
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const isPhone = this.size().width < 560;
    this._isPhone = isPhone;
    this.opts.margin = isPhone
      ? { top: 46, right: 20, bottom: 28, left: 46 }
      : { top: 52, right: 78, bottom: 30, left: 66 };
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    this.svg.attr("aria-label", "Two views of the same years: the top panel shows inflation's monthly rate returning to about 2% by 2025, while the bottom panel shows the price level rebased to 100 in 2019 rising to 129.7 and staying there.");
    const M = this.opts.margin;
    const iw = width - M.left - M.right;
    const totalH = height - M.top - M.bottom;
    const gap = isPhone ? 30 : 42;
    const topH = Math.round((totalH - gap) * 0.44);
    const botH = (totalH - gap) - topH;
    const topY0 = M.top, botY0 = M.top + topH + gap;
    this._iw = iw; this._topH = topH; this._botH = botH; this._botY0 = botY0; this._topY0 = topY0;
    this._midGapY = topY0 + topH + gap / 2 + 3;   // cursor month-label rides the gap between panels

    const eu = this.data.euAggregateCode();
    const parse = d3.timeParse("%Y-%m");
    this._parse = parse;
    const months = this.data.monthsCP00().filter(t => t >= "2019-01" && t <= "2025-12").sort();
    this._months = months;

    // TOP: monthly YoY. BOTTOM: index rebased to 2019-01 = 100.
    const idxObj = this.data.hicpIndex[eu]?.CP00 || {};
    const base = idxObj["2019-01"];
    const rate = months.map(t => ({ t: parse(t), time: t, v: this.data.hicpMonthly[eu]?.CP00?.[t] })).filter(d => Number.isFinite(d.v));
    const level = months.map(t => ({ t: parse(t), time: t, v: (base && Number.isFinite(idxObj[t])) ? idxObj[t] / base * 100 : null })).filter(d => d.v != null);
    this._rate = rate; this._level = level;
    this._rateAt = t => this.data.hicpMonthly[eu]?.CP00?.[t];
    this._levelAt = t => (base && Number.isFinite(idxObj[t])) ? idxObj[t] / base * 100 : null;
    const endLevel = level.at(-1).v;   // 129.66 → label 129.7

    const x = d3.scaleTime().domain([parse("2019-01"), parse("2025-12")]).range([0, iw]);
    const yTop = d3.scaleLinear().domain([0, 12]).range([topH, 0]);
    const yBot = d3.scaleLinear().domain([98, 132]).range([botH, 0]);
    this._x = x; this._yTop = yTop; this._yBot = yBot;

    const uid = this.selector.replace(/[^\w]/g, "");
    const defs = this.svg.append("defs");
    // per-panel trace clips
    const topClip = defs.append("clipPath").attr("id", `rl-topclip-${uid}`).append("rect").attr("x", -2).attr("y", -6).attr("width", 0).attr("height", topH + 12);
    const botClip = defs.append("clipPath").attr("id", `rl-botclip-${uid}`).append("rect").attr("x", -2).attr("y", -6).attr("width", 0).attr("height", botH + 12);
    this._topClip = topClip; this._botClip = botClip;

    // ── TOP PANEL ──────────────────────────────────────────────
    const gTop = this.svg.append("g").attr("class", "rl-top").attr("transform", `translate(${M.left},${topY0})`);
    this._gTop = gTop;
    gTop.append("g").attr("class", "grid").call(d3.axisLeft(yTop).tickSize(-iw).ticks(4).tickFormat("")).lower();
    gTop.append("g").attr("class", "axis axis--y").call(d3.axisLeft(yTop).ticks(4).tickFormat(d => d + "%"));
    // 2% reference
    gTop.append("line").attr("class", "rl-ref").attr("x1", 0).attr("x2", iw).attr("y1", yTop(2)).attr("y2", yTop(2))
      .attr("stroke", "var(--seq-target)").attr("stroke-width", 1).attr("stroke-dasharray", "3 4").attr("stroke-opacity", 0.8);
    gTop.append("text").attr("class", "rl-ref-label").attr("x", x(parse("2019-07"))).attr("y", yTop(2) - 5).attr("text-anchor", "start").attr("fill", "var(--seq-target)").text("ECB target 2%");  // [§C.1] left end, clear of the rate line's crossings
    // panel y-title
    if (!isPhone) gTop.append("text").attr("class", "rl-ytitle").attr("transform", `translate(${-M.left + 14},${topH / 2}) rotate(-90)`).attr("text-anchor", "middle").text("CLIMB SPEED (% PER YEAR)");
    // traced line
    const lineTop = d3.line().x(d => x(d.t)).y(d => yTop(d.v)).curve(d3.curveMonotoneX);
    gTop.append("path").datum(rate).attr("class", "rl-line-rate").attr("clip-path", `url(#rl-topclip-${uid})`)
      .attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 2.4).attr("stroke-linejoin", "round").attr("stroke-linecap", "round").attr("d", lineTop);
    // peak marker (the mountain top)
    const peak = rate.find(d => d.time === "2022-10");
    if (peak) {
      this._peakG = gTop.append("g").attr("class", "rl-peak-g").attr("clip-path", `url(#rl-topclip-${uid})`);
      this._peakG.append("circle").attr("cx", x(peak.t)).attr("cy", yTop(peak.v)).attr("r", 3.5).attr("fill", "var(--accent)").attr("stroke", "var(--bg)").attr("stroke-width", 1.4);
      this._peakG.append("text").attr("class", "rl-peak-tag").attr("x", x(peak.t) + 6).attr("y", yTop(peak.v) + 2).attr("text-anchor", "start").text("11.5% peak");
    }

    // ── BOTTOM PANEL ───────────────────────────────────────────
    const gBot = this.svg.append("g").attr("class", "rl-bot").attr("transform", `translate(${M.left},${botY0})`).style("opacity", 0);
    this._gBot = gBot;
    gBot.append("g").attr("class", "grid").call(d3.axisLeft(yBot).tickSize(-iw).tickValues([100, 110, 120, 130]).tickFormat("")).lower();
    gBot.append("g").attr("class", "axis axis--y").call(d3.axisLeft(yBot).tickValues([100, 110, 120, 130]).tickFormat(d => d));
    // baseline at 100 (emphasised)
    gBot.append("line").attr("class", "rl-baseline").attr("x1", 0).attr("x2", iw).attr("y1", yBot(100)).attr("y2", yBot(100));
    gBot.append("text").attr("class", "rl-baseline-label").attr("x", 2).attr("y", yBot(100) + 14).attr("text-anchor", "start").text("2019 = 100");  // [§C.1] below the baseline (the level line is always ≥100)
    if (!isPhone) gBot.append("text").attr("class", "rl-ytitle").attr("transform", `translate(${-M.left + 14},${botH / 2}) rotate(-90)`).attr("text-anchor", "middle").text("HOW HIGH PRICES SIT (2019 = 100)");
    // area fill (--accent-veil is CSS-only → set via class, NEVER fed to d3) + line, both trace-clipped
    const area = d3.area().x(d => x(d.t)).y0(yBot(100)).y1(d => yBot(d.v)).curve(d3.curveMonotoneX);
    const lineBot = d3.line().x(d => x(d.t)).y(d => yBot(d.v)).curve(d3.curveMonotoneX);
    gBot.append("path").datum(level).attr("class", "rl-area").attr("clip-path", `url(#rl-botclip-${uid})`).attr("d", area);
    gBot.append("path").datum(level).attr("class", "rl-line-level").attr("clip-path", `url(#rl-botclip-${uid})`)
      .attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 2.6).attr("stroke-linejoin", "round").attr("stroke-linecap", "round").attr("d", lineBot);
    // plateau bracket over 2024–25
    const bx0 = x(parse("2024-01")), bx1 = x(parse("2025-12"));
    const byy = yBot(endLevel) - 12;
    this._bracketG = gBot.append("g").attr("class", "rl-bracket-g").style("opacity", 0);
    this._bracketG.append("path").attr("class", "rl-bracket").attr("fill", "none")
      .attr("d", `M ${bx0} ${byy + 6} L ${bx0} ${byy} L ${bx1} ${byy} L ${bx1} ${byy + 6}`);
    if (!isPhone) this._bracketG.append("text").attr("class", "rl-bracket-label").attr("x", bx0 + 2).attr("y", byy - 5).attr("text-anchor", "start").text("the plateau");
    // end dot + label
    const endD = level.at(-1);
    this._endDot = gBot.append("circle").attr("class", "rl-end-dot").attr("cx", x(endD.t)).attr("cy", yBot(endD.v)).attr("r", 4.5).attr("fill", "var(--accent)").attr("stroke", "var(--bg)").attr("stroke-width", 1.6);
    this._endLabel = gBot.append("text").attr("class", "rl-end-label").attr("x", x(endD.t) + 7).attr("y", yBot(endD.v) + 4).attr("text-anchor", "start").text("129.7");  // [§C.1] in the right margin, off the line end

    // ── shared x-axis (bottom of the lower panel) ──────────────
    this.svg.append("g").attr("class", "axis axis--x").attr("transform", `translate(${M.left},${botY0 + botH})`)
      .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")));

    // ── kicker (flips 2% → 129.7 — the thesis) ─────────────────
    // The kicker flips 2% (the rate story) → 129.7 (the level truth) — the whole thesis in one number.
    this._kickNum = this.svg.append("text").attr("class", "kick-num").attr("x", M.left - 2).attr("y", isPhone ? 40 : 48).style("font-size", isPhone ? "30px" : "42px").text("2%");

    // ── linked cursor (spans both panels) ──────────────────────
    this._cursorG = this.svg.append("g").attr("class", "rl-cursor-g").attr("pointer-events", "none").style("opacity", 0);
    this._cursorLine = this._cursorG.append("line").attr("class", "rl-cursor-line").attr("y1", topY0 - 4).attr("y2", botY0 + botH + 4);
    this._cursorTopDot = this._cursorG.append("circle").attr("class", "rl-cursor-dot").attr("r", 4);
    this._cursorBotDot = this._cursorG.append("circle").attr("class", "rl-cursor-dot").attr("r", 4);
    this._cursorLabel = this._cursorG.append("text").attr("class", "rl-cursor-label").attr("y", this._midGapY).attr("text-anchor", "middle");

    // hover overlay spanning both panels
    const bisect = d3.bisector(d => d.t).left;
    this.svg.append("rect").attr("x", M.left).attr("y", topY0).attr("width", iw).attr("height", botY0 + botH - topY0).attr("fill", "transparent")
      .on("mousemove", (event) => {
        const [mx] = d3.pointer(event, this._gTop.node());
        const t = x.invert(mx); const i = bisect(rate, t);
        const a = rate[Math.max(0, i - 1)], b = rate[Math.min(rate.length - 1, i)];
        const rec = (!a || (b && (t - a.t) > (b.t - t))) ? b : a; if (!rec) return;
        this._hoverMonth = rec.time; this._drawCursor(rec.time); this._showTip(rec.time, event);
      })
      .on("mouseleave", () => { this._hoverMonth = null; this.ctx.tooltip.hide(); this._restoreCursor(); });

    // [AMENDMENT-3 §5.1 real-click fix] SVG paints/hit-tests in document order — a later
    // sibling always wins over an earlier subtree, however deep it's nested. The hover overlay
    // rect above is a sibling of `gTop` (appended straight to the svg root) and comes AFTER it,
    // so it sat on top of the ECB label + peak tag despite them being visually "under" nothing —
    // a real mouse click landed on the invisible hover rect, not the label. Fix: a dedicated
    // group appended AFTER the hover rect, sharing `gTop`'s transform so nothing visually moves;
    // `_flagPopovers()` raises each trigger node into it once flagged.
    this._triggersG = this.svg.append("g").attr("class", "rl-popover-triggers").attr("transform", `translate(${M.left},${topY0})`);

    // ── motion ─────────────────────────────────────────────────
    this._topDrawn = 0; this._botDrawn = 0; this._sweep = 0; this._pulsed = false;
    if (this.ctx.motion.reduced) {
      this._neutralView();
    } else {
      this._setView("rate");
      this._wireScroll();
    }
    this._flagPopovers();   // [A2 §C.3] reuse the ECB + peak popovers
  }

  // [A2 §C.3] the top panel carries the same ECB-2% reference line and the Oct-2022 peak as CH1 —
  // reuse the two VERBATIM popover texts on those labels.
  _flagPopovers() {
    if (!this._info) return;
    const seq = getComputedStyle(document.documentElement).getPropertyValue("--seq-target").trim();
    const acc = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    const ref = this._gTop && this._gTop.select(".rl-ref-label").node();
    if (ref) { this._info.flag(ref, "The European Central Bank aims to keep inflation near 2% a year — slow enough to ignore, positive enough to avoid deflation.", seq); this._raiseTrigger(ref); }
    const pk = this._peakG && this._peakG.select(".rl-peak-tag").node();
    if (pk) { this._info.flag(pk, "October 2022: prices 11.5% higher than a year before — the fastest rise the euro area has ever recorded.", acc); this._raiseTrigger(pk); }
  }
  // Raise a trigger node above the hover-overlay rect for real hit-testing (§5.1 fix, see
  // `_triggersG`'s creation). Neither label's opacity is otherwise animated in this chart, so —
  // unlike AnnotatedLine's peak stamp — there's no parent-opacity to keep in sync here.
  _raiseTrigger(node) { if (node && this._triggersG) this._triggersG.node().appendChild(node); }

  _wireScroll() {
    if (this._unwatch) this._unwatch();
    const chapter = this.container.closest(".chapter");
    this._unwatch = watchChapterProgress(chapter, p => this._onProgress(p));
    this._watchUnpin(chapter, () => this._neutralView());   // [A2 §B.4]
  }
  // [A2 §B.4] neutral full view — both panels revealed, cursor locked at the end, kicker 129.7.
  _neutralView() {
    this._revealTop(1); this._revealBot(1);
    this._gBot.style("opacity", 1);
    this._bracketG.style("opacity", 1);
    this._setView("cursor");
    this._sweep = 1; this._drawCursor(this._months.at(-1));
    this._kickNum.text("129.7");
  }

  _onProgress(p) {
    // top trace done early; bottom reveal in step-1's band; cursor sweep in step-2's band (latched).
    const tt = smooth(Math.max(0, Math.min(1, p / 0.14)));
    if (tt > this._topDrawn) this._revealTop(tt);
    const bt = smooth(Math.max(0, Math.min(1, (p - 0.30) / 0.22)));
    if (bt > this._botDrawn) { this._revealBot(bt); this._gBot.style("opacity", Math.max(this._gBot.style("opacity") || 0, bt)); }
    const sw = smooth(Math.max(0, Math.min(1, (p - 0.58) / 0.30)));
    if (sw > this._sweep) { this._sweep = sw; if (!this._hoverMonth) this._sweepCursor(sw); }
  }

  _revealTop(np) { this._topDrawn = Math.max(this._topDrawn, np); this._topClip.attr("width", Math.max(0, this._topDrawn * (this._iw + 4))); }
  _revealBot(np) { this._botDrawn = Math.max(this._botDrawn, np); this._botClip.attr("width", Math.max(0, this._botDrawn * (this._iw + 4))); }

  _sweepCursor(frac) {
    const n = this._months.length;
    const i = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
    const month = this._months[i];
    this._drawCursor(month);
    // kicker counts the LEVEL up as the cursor sweeps
    const lv = this._levelAt(month);
    if (lv != null && this._view === "cursor") this._kickNum.text(lv.toFixed(1));
    if (frac >= 0.999 && !this._pulsed) { this._pulsed = true; this._pulseEnd(); this._kickNum.text("129.7"); }
  }

  _drawCursor(month) {
    if (!this._cursorG) return;
    const x = this._x, px = x(this._parse(month));
    const rv = this._rateAt(month), lv = this._levelAt(month);
    this._cursorG.style("opacity", 1);
    this._cursorLine.attr("x1", this.opts.margin.left + px).attr("x2", this.opts.margin.left + px);
    if (rv != null) this._cursorTopDot.attr("cx", this.opts.margin.left + px).attr("cy", this._topY0 + this._yTop(rv)).style("opacity", 1); else this._cursorTopDot.style("opacity", 0);
    if (lv != null) this._cursorBotDot.attr("cx", this.opts.margin.left + px).attr("cy", this._botY0 + this._yBot(lv)).style("opacity", this._gBot.style("opacity") > 0.3 ? 1 : 0); else this._cursorBotDot.style("opacity", 0);
    const lblAnchor = px > this._iw - 44 ? "end" : (px < 44 ? "start" : "middle");
    this._cursorLabel.attr("x", this.opts.margin.left + px).attr("text-anchor", lblAnchor).text(d3.timeFormat("%b %Y")(this._parse(month)));
  }

  _restoreCursor() {
    if (this._sweep > 0) this._sweepCursor(this._sweep);
    else this._cursorG.style("opacity", 0);
  }

  _showTip(month, event) {
    const rv = this._rateAt(month), lv = this._levelAt(month);
    this.ctx.tooltip.show(
      `<h5>${d3.timeFormat("%B %Y")(this._parse(month))}</h5>
       <div class="row"><span class="key">Climb speed</span><span class="val">${rv == null ? "—" : (rv >= 0 ? "+" : "") + rv.toFixed(1) + "%"}</span></div>
       <div class="row"><span class="key">Price level</span><span class="val">${lv == null ? "—" : lv.toFixed(1)}</span></div>`,
      event.clientX, event.clientY);
  }

  _pulseEnd() {
    if (this.ctx.motion.reduced) { this._bracketG.style("opacity", 1); return; }
    this._bracketG.interrupt().transition().duration(300).style("opacity", 1);
    this._endDot.attr("filter", ensureGlow(this.svg, "rl-end-glow", 3));
    const cx = +this._endDot.attr("cx"), cy = +this._endDot.attr("cy");
    for (let k = 0; k < 2; k++) {
      this._gBot.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 5).attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 2).style("opacity", 0.6)
        .transition().delay(k * 220).duration(850).ease(d3.easeCubicOut).attr("r", 24).style("opacity", 0).remove();
    }
  }

  onStep(index, el) {
    const view = (el && el.dataset.view) || STEPS[Math.max(0, Math.min(STEPS.length - 1, index))];
    if (this.container) { this.container.setAttribute("data-active-view", view); this.container.setAttribute("data-onstep", index); }
    this._setView(view);
  }

  _setView(view) {
    this._view = view;
    const reduced = this.ctx.motion.reduced;
    const dim = (sel, o) => reduced ? sel.style("opacity", o) : sel.interrupt().transition().duration(420).style("opacity", o);
    if (view === "rate") {
      dim(this._gTop, 1);
      this._kickNum.text("2%");
    } else if (view === "both") {
      dim(this._gTop, 0.5);
      this._kickNum.text("129.7");
    } else if (view === "cursor") {
      dim(this._gTop, 0.5);
      if (this._pulsed || reduced) this._kickNum.text("129.7");
    }
  }

  destroy() { if (this._unwatch) this._unwatch(); super.destroy(); }
  onThemeChange() { this.render(); }
}
