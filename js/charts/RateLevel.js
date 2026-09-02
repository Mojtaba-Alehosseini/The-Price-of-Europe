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
    // [P2.4] The thesis number, derived ONCE. It used to be the literal "129.7" in six places
    // (label, kicker ×4, aria-label) beside the computed `endLevel` that nothing read — so a data
    // re-fetch would have silently left the chart's own headline lying, exactly the class of bug
    // Phase 1 spent a session undoing elsewhere.
    const endLevel = level.at(-1).v;
    this._endTxt = endLevel.toFixed(1);
    this.svg.attr("aria-label", `Two views of the same years: the top panel shows inflation's monthly rate returning to about 2% by 2025, while the bottom panel shows the price level rebased to 100 in 2019 rising to ${this._endTxt} and staying there.`);

    const x = d3.scaleTime().domain([parse("2019-01"), parse("2025-12")]).range([0, iw]);
    // [P3.6] Domains derived from the data with headroom, not typed in. The hardcoded [0,12] and
    // [98,132] happen to fit today's series (peak 11.5, end 129.7) but a re-fetch that pushed
    // either past its ceiling would have clipped the KEY chart's own headline against the top of
    // its panel with nothing to warn anyone — the same class of failure as the literal 129.7 this
    // file carried until P2.4. Rounded out to the axis step so the tick tables below still land on
    // real gridlines, and floored at the old values so today's composition is unchanged — verified:
    // sentinel 0% on rateLevel. The headroom term only bites once the data actually approaches a
    // ceiling (11.5 -> 12 and 129.7 -> 132 both still land on the authored domain).
    const rMax = d3.max(rate, d => d.v) ?? 12;
    const lMin = d3.min(level, d => d.v) ?? 98, lMax = d3.max(level, d => d.v) ?? 132;
    const yTop = d3.scaleLinear().domain([0, Math.max(12, Math.ceil((rMax + 0.5) / 2) * 2)]).range([topH, 0]);
    const yBot = d3.scaleLinear().domain([Math.min(98, Math.floor(lMin / 2) * 2), Math.max(132, Math.ceil((lMax + 2) / 2) * 2)]).range([botH, 0]);
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
    // [§C.1] left end, clear of the rate line's crossings. [D93] the fill attr here was inert (the
    // shared `.chart-svg text` default beat it); deleted rather than promoted to CSS so this label
    // matches its AnnotatedLine twin, which §D.3 deliberately unified to ink-soft back in D52.
    gTop.append("text").attr("class", "rl-ref-label").attr("x", x(parse("2019-07"))).attr("y", yTop(2) - 5).attr("text-anchor", "start").text("ECB target 2%");
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
      // [P2.4] The tag carries the trace clip on ITSELF, not just via _peakG. _flagPopovers raises
      // it out of this group into _triggersG for real hit-testing, and a clip inherited from a
      // parent does not survive re-parenting — so the reveal's punchline used to sit there fully
      // drawn from frame 0, before the line had climbed anywhere near October 2022. Same pattern as
      // AnnotatedLine's band labels, which carry their own clip for exactly this reason.
      // _triggersG shares gTop's transform, so the clip resolves in the same user space either way.
      this._peakG.append("text").attr("class", "rl-peak-tag").attr("x", x(peak.t) + 6).attr("y", yTop(peak.v) + 2).attr("text-anchor", "start")
        .attr("clip-path", `url(#rl-topclip-${uid})`).text("11.5% peak");
    }

    // ── BOTTOM PANEL ───────────────────────────────────────────
    const gBot = this.svg.append("g").attr("class", "rl-bot").attr("transform", `translate(${M.left},${botY0})`).style("opacity", 0);
    this._gBot = gBot;
    gBot.append("g").attr("class", "grid").call(d3.axisLeft(yBot).tickSize(-iw).tickValues([100, 110, 120, 130]).tickFormat("")).lower();
    gBot.append("g").attr("class", "axis axis--y").call(d3.axisLeft(yBot).tickValues([100, 110, 120, 130]).tickFormat(d => d));
    // baseline at 100 (emphasised)
    gBot.append("line").attr("class", "rl-baseline").attr("x1", 0).attr("x2", iw).attr("y1", yBot(100)).attr("y2", yBot(100));
    // [§C.1] Below the baseline, because the level line is always >=100 so that side is free.
    // [P8.6] Except on phone, where it is NOT free: measured at 390, the gap between the baseline
    // and the x-axis domain path is 9.8px and this label's box is 11px, so the axis rule ran
    // straight through the text and it read as a strikethrough. (Desktop has 20.6px — hence a
    // defect that only ever appeared on the narrow layout.) The label cannot shrink into 9.8px and
    // stay readable, so on phone it moves to the top-left of the same panel, which is empty by
    // construction: the level starts AT 100 on the left and climbs to the right, so the air above
    // the line's left end is the one reliably clear region in this panel. Parked in the band
    // BETWEEN the 120 and 130 gridlines rather than at the panel's very top, because the top is
    // where the 130 gridline runs and the first placement simply swapped one rule through the
    // text for another (caught by the probe, not by eye). It still sits beside the
    // y-axis, whose bottom tick is the 100 it names — and on phone the rotated y-title that would
    // otherwise carry "2019 = 100" is suppressed, so this label is the only place that says it.
    gBot.append("text").attr("class", "rl-baseline-label")
      .attr("x", 2).attr("y", isPhone ? yBot(125) + 4 : yBot(100) + 14)
      .attr("text-anchor", "start").text("2019 = 100");
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
    // [§C.1] Desktop: in the right margin, off the line end. [P4.5] PHONE: inside the plot instead,
    // right-aligned and tucked under the end dot. It used to be display:none at <=768 with a
    // documented reason -- "runs off the narrow phone right margin" -- and that reason was real:
    // measured at 390 the label started at x=344 in a 357px-wide svg and needed ~66px, so ~53px of
    // it sat outside the canvas. Dropping it cost phone readers the anchor between the chapter's
    // thesis number and the point on the curve it describes (the kicker still printed the number,
    // but nothing tied it to the line). Repositioning removes the reason to hide it: at
    // text-anchor:end, x = iw-4, the label spans ~221..287 of a 0..291 plot, and y = end + 22 puts
    // it clear of both the end dot (y~12) and the plateau bracket (y~0) that crowd the top. 22px
    // put the label's 4px stroke halo within a pixel of the dot's own stroke; 28 leaves ~6px.
    const endLabelPhone = isPhone;
    this._endLabel = gBot.append("text").attr("class", "rl-end-label")
      .attr("x", endLabelPhone ? iw - 4 : x(endD.t) + 7)
      .attr("y", yBot(endD.v) + (endLabelPhone ? 28 : 4))
      .attr("text-anchor", endLabelPhone ? "end" : "start")
      .text(this._endTxt);

    // ── shared x-axis (bottom of the lower panel) ──────────────
    this.svg.append("g").attr("class", "axis axis--x").attr("transform", `translate(${M.left},${botY0 + botH})`)
      .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")));

    // ── kicker (flips 2% → the end level — the thesis) ─────────
    // The kicker flips 2% (the rate story) → the level truth — the whole thesis in one number.
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
      .on("mouseleave", () => { this._hoverMonth = null; this.ctx.tooltip.hide(); this._restoreCursor(); })
      // [P4.3] Touch parity, the house pattern (Heatmap.js / WaffleChart.js): a tap has no
      // hover, so re-run this rect's OWN mousemove listener on a non-mouse pointerdown.
      // `.on("mousemove")` with one argument is d3's getter -- it returns the listener just
      // registered above, so there is exactly one handler body and no risk of the two drifting.
      .on("pointerdown", function (e) { if (e.pointerType !== "mouse") d3.select(this).on("mousemove").call(this, e); });

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
  // `_triggersG`'s creation). [P2.4] The old comment here claimed neither label's opacity is
  // animated — it is: _setView dims the whole top panel to 0.5 on the "both"/"cursor" steps, and
  // once these two are raised out of gTop they stop inheriting that. _setTopOpacity now drives
  // gTop and _triggersG together, so the raised labels fade with the panel they belong to.
  _raiseTrigger(node) { if (node && this._triggersG) this._triggersG.node().appendChild(node); }

  _wireScroll() {
    if (this._unwatch) this._unwatch();
    this._triggerYs = null;   // [P3.6] chapter geometry just changed — re-measure the step triggers
    const chapter = this.container.closest(".chapter");
    this._unwatch = watchChapterProgress(chapter, p => this._onProgress(p));
    this._watchUnpin(chapter, () => this._neutralView());   // [A2 §B.4]
  }
  // [A2 §B.4] neutral full view — both panels revealed, cursor locked at the end, kicker at the end level.
  _neutralView() {
    this._revealTop(1); this._revealBot(1);
    this._gBot.style("opacity", 1);
    this._bracketG.style("opacity", 1);
    this._setView("cursor");
    this._sweep = 1; this._drawCursor(this._months.at(-1));
    this._kickNum.text(this._endTxt);
  }

  // [P3.6] Ported from SmallMultiplesLine._stepTriggerYs. The reveal used to be timed by five magic
  // fractions of chapter-wide progress (0.14 / 0.30 / 0.22 / 0.58 / 0.30) — a mechanism that file's
  // own comment calls fragile, because those fractions encode where the step CARDS happen to sit.
  // Any copy edit that reflows a card silently re-times the KEY chart. Anchoring to the real step
  // elements ties each phase to the step whose words describe it, whatever length that text is.
  _stepTriggerYs() {
    const chapter = this.container?.closest(".chapter");
    const steps = chapter ? [...chapter.querySelectorAll(".scroller__step")] : [];
    return steps.map(el => el.getBoundingClientRect().top + scrollY - innerHeight * 0.55);
  }
  // Fraction of the way from step i's trigger line to step i+1's, clamped to [0,1]. Falls back to
  // the old chapter-wide fractions if the steps cannot be measured (never seen, but a 0-height
  // chapter mid-reflow would otherwise divide by zero).
  _phase(i, fallback) {
    const ys = this._triggerYs || (this._triggerYs = this._stepTriggerYs());
    if (ys.length < 3 || !(ys[i + 1] > ys[i])) return fallback;
    return Math.max(0, Math.min(1, (scrollY - ys[i]) / (ys[i + 1] - ys[i])));
  }

  _onProgress(p) {
    // top trace draws across step 0; bottom reveal across step 1; cursor sweep across step 2 (latched).
    const tt = smooth(this._phase(0, Math.max(0, Math.min(1, p / 0.14))));
    if (tt > this._topDrawn) this._revealTop(tt);
    const bt = smooth(this._phase(1, Math.max(0, Math.min(1, (p - 0.30) / 0.22))));
    if (bt > this._botDrawn) { this._revealBot(bt); this._gBot.style("opacity", Math.max(this._gBot.style("opacity") || 0, bt)); }
    const sw = smooth(this._phase(2, Math.max(0, Math.min(1, (p - 0.58) / 0.30))));
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
    if (frac >= 0.999 && !this._pulsed) { this._pulsed = true; this._pulseEnd(); this._kickNum.text(this._endTxt); }
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

  /* [P2.4] The top panel's opacity now covers the two labels raised out of it into _triggersG
     (see _raiseTrigger) — they are visually part of gTop and must dim with it. */
  _setTopOpacity(o) {
    const reduced = this.ctx.motion.reduced;
    [this._gTop, this._triggersG].forEach(sel => {
      if (!sel) return;
      if (reduced) sel.style("opacity", o);
      else sel.interrupt().transition().duration(420).style("opacity", o);
    });
  }

  _setView(view) {
    this._view = view;
    const reduced = this.ctx.motion.reduced;
    if (view === "rate") {
      this._setTopOpacity(1);
      this._kickNum.text("2%");
    } else if (view === "both") {
      this._setTopOpacity(0.5);
      this._kickNum.text(this._endTxt);
    } else if (view === "cursor") {
      this._setTopOpacity(0.5);
      if (this._pulsed || reduced) this._kickNum.text(this._endTxt);
    }
  }

  destroy() { if (this._unwatch) this._unwatch(); super.destroy(); }
  onThemeChange() { this.render(); }
}
