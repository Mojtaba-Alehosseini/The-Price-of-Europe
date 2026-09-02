/* ============================================================
   AnnotatedLine — CH1 "The official story" (REBUILD for AMENDMENT-2 §B).
   Single EU-27 monthly YoY line, Jan 2019 → Dec 2025, x-domain to 2026-01.
   NO kicker (A2 §B.1). [debug 2026-07-06] The line draws in ONCE, complete, the first time the
   chapter scrolls into view — no longer tied to scroll position/step (was: a progressive reveal
   synced to how far the reader had scrolled past the text steps, completing ~step 2; read as the
   line "waiting" on the text card instead of telling its own story). Playhead dot lives only
   during that one-time draw and fades on completion (§B.2). Last step = full line end-to-end;
   un-pin resets to the neutral full view (§B.4). Band labels live INSIDE their band,
   centered, clipped (§B.5). Compare mode adds country lines in cmp colours and
   RESCALES y over all visible series (§B.7/§B.8). Zoom = a d3.brushX overview strip
   + preset chips (§B.10). Info-popovers on COVID/WAR/ECB/peak labels (§C). Native
   <title> tooltip replaced by aria-label in BaseChart (§D.1).
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { ensureGlow } from "../modules/CraftFX.js";
import { getInfoPop } from "../modules/InfoPop.js";

const STEPS = ["calm", "covid", "climb", "peak", "return"];
const DRAW_DUR = 900;   // [debug 2026-07-06] one-time full-line draw-in on first appearance

// §C.2 verbatim popover copy — the executor writes none of these.
const POP = {
  covid: "March 2020: governments shut shops, travel and factories. Spending collapsed — for a few months prices were falling, not rising.",
  war:   "February 2022: Russia invades Ukraine. Europe scrambles to replace Russian gas, and energy bills drag everything else up with them.",
  ecb:   "The European Central Bank aims to keep inflation near 2% a year — slow enough to ignore, positive enough to avoid deflation.",
  peak:  "October 2022: prices 11.5% higher than a year before — the fastest rise the euro area has ever recorded.",
};
// [debug 2026-07-06] Extended 4→10 for the country-groups feature — a shared 10-slot cap across
// individual countries + groups draws from one combined, ordered palette (see _slotColor).
const CMP = ["var(--cmp-1)", "var(--cmp-2)", "var(--cmp-3)", "var(--cmp-4)", "var(--cmp-5)", "var(--cmp-6)", "var(--cmp-7)", "var(--cmp-8)", "var(--cmp-9)", "var(--cmp-10)"];

// [debug 2026-07-06] Country groups for the compare feature. Members are EU-27 codes only — this
// site's whole dataset is Eurostat EU-27, so non-EU members of some real-world groupings (the UK for
// G7; Norway/Iceland for Nordic; Switzerland for DACH) simply aren't representable here and are
// dropped, labelled "(EU members)" so that's not silently misleading. showMembers:false (Eurozone
// only) means the chart draws just its one average line — Eurozone has 20 members, and drawing all
// of them individually on a chart built for ~4-10 lines would be unreadable clutter; every other
// group is small enough (2-5 members) that seeing each one alongside its own average is the point.
const GROUPS = {
  eurozone: { label: "Eurozone",           members: ["AT","BE","HR","CY","EE","FI","FR","DE","EL","IE","IT","LV","LT","LU","MT","NL","PT","SK","SI","ES"], showMembers: false },
  g7:       { label: "G7 (EU members)",    members: ["DE","FR","IT"], showMembers: true },
  nordic:   { label: "Nordic (EU members)",members: ["SE","DK","FI"], showMembers: true },
  benelux:  { label: "Benelux",            members: ["BE","NL","LU"], showMembers: true },
  visegrad: { label: "Visegrád Group",     members: ["PL","HU","CZ","SK"], showMembers: true },
  dach:     { label: "DACH (EU members)",  members: ["DE","AT"], showMembers: true },
  southern: { label: "Southern Europe",    members: ["ES","IT","EL","PT"], showMembers: true },
};

export class AnnotatedLine extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 12, right: 74, bottom: 74, left: 48 }, aspect: 1.5 });
    this._stepIdx = 0; this._lastStepIdx = -1; this._neutral = false;
    this._drawnP = 0; this._drawComplete = false; this._peakFired = false;
    this._introPlayed = false;        // [debug 2026-07-06] the one-time draw-in plays once ever, not per-render (resize-safe)
    this._selectedCodes = [];
    this._selectedGroups = [];        // [debug 2026-07-06] group keys, e.g. "nordic" — see GROUPS
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
  // [debug 2026-07-06] Unweighted mean across a group's member countries, month by month. Only
  // months where EVERY member has data are included (no partial-membership average masquerading as
  // the whole group's figure).
  _groupAverage(members) {
    const byTime = new Map();
    members.forEach(code => this._series(code).forEach(d => {
      if (!byTime.has(d.time)) byTime.set(d.time, { t: d.t, time: d.time, sum: 0, n: 0 });
      const e = byTime.get(d.time); e.sum += d.v; e.n++;
    }));
    return [...byTime.values()].filter(e => e.n === members.length)
      .map(e => ({ t: e.t, time: e.time, v: e.sum / e.n })).sort((a, b) => a.t - b.t);
  }
  _yScale() {   // §B.7 nice domain + explicit ticks so the TOP GRIDLINE (top tick) is always ≥ the data max
    let max = d3.max(this._all, d => d.v) ?? 11.5;
    let min = d3.min(this._all, d => d.v) ?? 0;
    this._selectedCodes.forEach(c => {
      const s = this._series(c);
      const m = d3.max(s, d => d.v); if (m != null && m > max) max = m;
      const n = d3.min(s, d => d.v); if (n != null && n < min) min = n;
    });
    // A group's average is always within its members' own min/max, so bounding on the (raw) members
    // is sufficient regardless of whether they're individually drawn (showMembers) or not.
    this._selectedGroups.forEach(key => {
      const g = GROUPS[key]; if (!g) return;
      g.members.forEach(c => {
        const s = this._series(c);
        const m = d3.max(s, d => d.v); if (m != null && m > max) max = m;
        const n = d3.min(s, d => d.v); if (n != null && n < min) min = n;
      });
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
    // [debug 2026-07-07] margin.top grown from 10/12 -> 40/24 (AMENDMENT-3 §3): the fixed-position
    // .chart-legend reserves its own slot (inset-block-start:44px + ~23px of two-line text) that the
    // plot's own top inset never accounted for, so the top gridline/tick/line sat under the legend
    // text at every step. Measured, not guessed: legend bottom sits ~15px below the plot's old top
    // edge on desktop (1440) and ~34px below it on phone (390, the same fixed-px legend eats a much
    // bigger share of a shorter canvas) — both bumped past that with a small clear buffer. Chart-scoped
    // (this.opts.margin is per-instance), so no other chart's rule or geometry is touched.
    this.opts.margin = isPhone ? { top: 40, right: 18, bottom: 44, left: 40 } : { top: 24, right: 74, bottom: 20, left: 48 };
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
    // [debug 2026-07-06] Two kinds share this array: PERMANENT historical-event bands (covid, war —
    // `showAt`, visible from that step onward forever, per §B.3's original design) and TEMPORARY
    // per-step focus bands (calm/climb — `temporary:true` + `activeStep`, visible ONLY while that
    // exact step is active, gone the moment you scroll to the next one) — unlabeled (no `pop`/`label`)
    // since they're a spotlight, not a named marker; `--event-policy` (oxford, unused elsewhere in
    // this chart) keeps them visually distinct from the historical bands' own event-specific hues.
    // calm matches its step's own eyebrow year exactly; climb runs 2021-06→2022-02 (the pre-war climb,
    // ending exactly where the war band starts, zero gap or overlap).
    // [debug 2026-07-06 — owner: restore "war", remove "return"] A PRIOR session removed "war" as
    // redundant with the chart's own peak stamp (`_peakG`) — the owner has now asked for it BACK,
    // unchanged from its original spec, so the Oct-2022 step again carries both the precise stamp AND
    // the wide band. Separately, the temporary "return" band (2024-01→2026-01, activeStep 4) is REMOVED
    // outright (not just left temporary) — the owner independently flagged it as the same kind of
    // redundancy the OLD "war" removal was based on: the last step already marks the 2024+ story via
    // the chart's own `_tailG` "back to X%" tag + 45° leader (built independently of `_bands`, always
    // present, just faded in on the last step per §B.4) — a plain unlabeled band added nothing beyond
    // that. calm/climb/covid are byte-for-byte unchanged.
    this._bands = [
      { key: "calm",  from: "2019-01", to: "2020-01", fillVar: "--event-policy", temporary: true, activeStep: 0 },
      { key: "covid", from: "2020-03", to: "2021-06", fillVar: "--event-covid",  label: "COVID LOCKDOWNS",  showAt: 1, pop: POP.covid },
      { key: "climb", from: "2021-06", to: "2022-02", fillVar: "--event-policy", temporary: true, activeStep: 2 },
      { key: "war",   from: "2022-02", to: "2023-06", fillVar: "--event-energy", label: "WAR + ENERGY SHOCK", showAt: 3, pop: POP.war },
    ];
    this._bandG = new Map();
    this._bands.forEach(b => {
      const g = this.g.append("g").attr("class", `anno-band anno-band--${b.key}`).attr("data-band", b.key).style("opacity", 0);
      const clipId = `anno-band-${b.key}-${uid}`;
      const bandClip = defs.append("clipPath").attr("id", clipId).append("rect").attr("class", "anno-band-clip");
      g.append("rect").attr("class", "anno-band-rect").attr("y", 0).attr("height", ih).attr("fill", `var(${b.fillVar})`);
      // [debug 2026-07-06] data-band on the label itself (not just the group) keeps it identifiable
      // after being raised elsewhere in the DOM — only SOME bands (the ones with real popover copy)
      // get raised, so .anno-band / .anno-band-label no longer share one predictable DOM order.
      const lbl = g.append("text").attr("class", "anno-band-label").attr("data-band", b.key).attr("y", 15).attr("text-anchor", "middle")
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
        // visible series in draw order — EU average first, then each compared slot (code or group),
        // same shared codes-then-groups CMP index `_drawExtras` uses so tooltip swatches always match
        // the actual line colours. A group contributes its own average PLUS one row per member — but
        // only when `showMembers` (only those members actually have a line drawn to point a dot at).
        const series = [{ key: "eu", name: "EU average", color: "var(--accent)", data: this._all, sw: "ac-sw--eu" }];
        const slots = [
          ...this._selectedCodes.map(code => ({ kind: "code", code })),
          ...this._selectedGroups.map(key => ({ kind: "group", key })),
        ];
        slots.forEach((slot, i) => {
          const color = CMP[i % CMP.length], sw = `ac-sw--c${i % CMP.length}`;
          if (slot.kind === "code") { series.push({ key: slot.code, name: this.data.countryName(slot.code), color, data: this._series(slot.code), sw }); return; }
          const g = GROUPS[slot.key]; if (!g) return;
          series.push({ key: `grp:${slot.key}`, name: g.label, color, data: this._groupAverage(g.members), sw });
          if (g.showMembers) g.members.forEach(code => series.push({ key: `grp:${slot.key}:${code}`, name: this.data.countryName(code), color, data: this._series(code), sw, member: true }));
        });
        const rows = series.map(s => { const rec = nearest(s.data, t); return rec ? { ...s, rec } : null; })
          .filter(r => r && r.rec.t >= dom[0] && r.rec.t <= dom[1]);
        if (!rows.length) { this._ch.style("opacity", 0); this.ctx.tooltip.hide(); return; }
        const anchorT = rows[0].rec.t;
        this._ch.style("opacity", 1).attr("transform", `translate(${this._x(anchorT)},0)`);
        this._hoverDots.selectAll("circle").data(rows, d => d.key).join(
          enter => enter.append("circle").attr("cx", 0).attr("stroke", "var(--bg)").attr("stroke-width", 1.5),
          update => update, exit => exit.remove()
        ).attr("r", d => d.member ? 2.6 : 4).attr("cy", d => this._y(d.rec.v)).attr("fill", d => d.color).attr("fill-opacity", d => d.member ? 0.6 : 1);
        const multi = rows.length > 1;
        const html = `<h5>${d3.timeFormat("%B %Y")(anchorT)}</h5>` + rows.map(r =>
          `<div class="row${r.member ? " row--member" : ""}"><span class="key">${multi ? `<span class="ac-sw ${r.sw}"></span>` : ""}${multi ? r.name : "Inflation"}</span><span class="val">${r.rec.v.toFixed(1)}%</span></div>`
        ).join("");
        this.ctx.tooltip.show(html, event.clientX, event.clientY);
      })
      .on("mouseleave", () => { this._ch.style("opacity", 0); this.ctx.tooltip.hide(); })
      // [P4.3] Touch parity, the house pattern (Heatmap.js / WaffleChart.js): a tap has no
      // hover, so re-run this rect's OWN mousemove listener on a non-mouse pointerdown.
      // `.on("mousemove")` with one argument is d3's getter -- it returns the listener just
      // registered above, so there is exactly one handler body and no risk of the two drifting.
      .on("pointerdown", function (e) { if (e.pointerType !== "mouse") d3.select(this).on("mousemove").call(this, e); });

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
    else {
      this._applyFocus(0);
      this._wireScroll();
      // A resize rebuilds the SVG from scratch (_revealRect included, back at width 0) — if the
      // one-time intro already played earlier in this session, jump straight back to the drawn
      // end-state instead of replaying it (the IO below only re-fires _playIntro on the NEXT
      // visibility change, which would leave the line blank in the meantime).
      if (this._introPlayed) this._completeDraw();
    }

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
      // [P3.6] the clip rect eases WITH its band. It used to jump to the new window immediately,
      // so mid-zoom the label was clipped against a rect that no longer matched the rect the
      // reader could see — the label popped outside its own band for the length of the transition.
      sel(b._clipRect).attr("x", bx).attr("y", 0).attr("width", bw).attr("height", ih);
      // §B.5/§G.8 squish the label to fit inside its band width so its bbox stays inside the band rect.
      sel(b._lbl.attr("textLength", null).attr("lengthAdjust", null)).attr("x", bx + bw / 2);
      // The label used to inherit its band group's opacity (nested opacity multiplies down),
      // so "too narrow to show" (bw<=70) always won even when the group itself was visible.
      // Since §5.1 raised the label out of the group (for real-click hit-testing), that
      // multiplicative safety net is gone — track the width-fit explicitly and combine it with
      // the current step-visibility here so a narrow band never shows an overlapping label.
      b._labelFits = bw > 70;
      const stepOp = this._neutral ? 1 : ((b.temporary ? this._stepIdx === b.activeStep : this._stepIdx >= b.showAt) ? 1 : 0);
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
    // [P3.6] the whole stamp moves with the x window, so it eases with everything else. The
    // sentence is re-wrapped (tspans are rebuilt, they cannot be tweened in place), so it is
    // rebuilt at the PREVIOUS x and its tspans then transition across — otherwise the eyebrow and
    // number would ease while the sentence under them jumped straight to the destination.
    const sxPrev = this._stampX == null ? sx : this._stampX;
    this._stampX = sx;
    sel(this._peakEyebrow).attr("x", sx).attr("y", sy);
    sel(this._peakNum).attr("x", sx).attr("y", sy + 40);
    this._peakSentence.selectAll("*").remove();
    this._wrapText(this._peakSentence, "the fastest prices had ever risen in the euro's lifetime.", t ? sxPrev : sx, sy + 66, 19, "start", "stamp-sentence");
    if (t) sel(this._peakSentence.selectAll("tspan")).attr("x", sx);
    sel(this._peakLeader).attr("x1", sx + 92).attr("y1", sy + 34).attr("x2", x(this._peak.t) - 7).attr("y2", y(this._peak.v) + 3)
      .style("display", this._isPhone ? "none" : null);
    this._drawExtras();
  }

  // §B.7 rescale y over all visible series, transition axis + grid + every path.
  _rescaleY(animate) {
    const ys = this._yScale();
    // [P3.6] Keep the OUTGOING y. _drawExtras rebuilds its paths from scratch (they are joined by
    // slot index, and a slot can appear/disappear mid-rescale), so it cannot transition them in
    // place — but it CAN draw them where they already were and ease to the new domain, which is
    // what the axis, grid and EU line do. Without this the compare lines snapped to the new scale
    // while everything behind them eased for 600ms.
    const yPrev = this._y.copy();
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
    // [debug 2026-07-06] The peak/tail leader lines + tail label track the same y() the dot/line
    // just moved to — previously only _layoutX (x-window changes) repositioned these, so adding or
    // removing a compare country (_rescaleY-only, no _layoutX call) left them pointing at the
    // pre-rescale height while the dot and line moved, visibly disconnecting the leader from its dot.
    const tly = this._y(this._tail.at(-1).v), ly = tly - 46;
    this._tailLeader.transition(t).attr("y1", tly - 3).attr("y2", ly + 3);
    this._tailLabel.transition(t).attr("y", ly);
    this._peakLeader.transition(t).attr("y2", this._y(this._peak.v) + 3);
    this._drawExtras(t, dur ? yPrev : null);
  }

  // [debug 2026-07-06] One shared, ordered "slot" list — individual countries then groups — so
  // every selection (whichever kind) gets its own stable colour from the combined 10-colour CMP
  // palette, matching the shared 10-slot cap. A group with showMembers draws each member as a thin,
  // pale line in the group's own colour (a cohesive cluster, not competing with individual-country
  // colours) plus its average as a bold line labelled with the GROUP's name, not each member's.
  _drawExtras(t, yFrom) {
    if (!this._extraG) return;
    this._extraG.selectAll("*").remove();
    if (this._extraLabels) this._extraLabels.selectAll("*").remove();
    const line = this._line(), x = this._x, y = this._y, domHi = x.domain()[1];
    // [P3.6] When a from-scale is supplied, every rebuilt path is drawn at the OLD y and eased to
    // the new one on the caller's own transition, so the compare lines land with the axis instead
    // of ahead of it. `lineFrom` is the same generator bound to the outgoing scale.
    const lineFrom = yFrom ? d3.line().x(d => x(d.t)).y(d => yFrom(d.v)).curve(d3.curveMonotoneX) : null;
    const setD = (sel, data) => {
      if (lineFrom && t) sel.attr("d", lineFrom(data)).transition(t).attr("d", line(data));
      else sel.attr("d", line(data));
      return sel;
    };
    const labels = [];
    const slots = [
      ...this._selectedCodes.map(code => ({ kind: "code", code })),
      ...this._selectedGroups.map(key => ({ kind: "group", key })),
    ];
    slots.forEach((slot, i) => {
      const col = CMP[i % CMP.length], ci = i % CMP.length;   /* [D93] ci = the slot's palette index, for the label's CSS class */
      if (slot.kind === "code") {
        const ser = this._series(slot.code); if (!ser.length) return;
        setD(this._extraG.append("path").datum(ser).attr("class", "anno-extra-line").attr("fill", "none")
          .attr("stroke", col).attr("stroke-width", 1.5).attr("stroke-opacity", 0.9).attr("stroke-linejoin", "round"), ser);
        const vis = ser.filter(d => d.t <= domHi), end = vis.at(-1) || ser.at(-1);
        labels.push({ text: slot.code, ci, x: x(end.t), y: y(end.v), yFrom: yFrom ? yFrom(end.v) : y(end.v) });
        return;
      }
      const g = GROUPS[slot.key]; if (!g) return;
      if (g.showMembers) g.members.forEach(code => {
        const ser = this._series(code); if (!ser.length) return;
        setD(this._extraG.append("path").datum(ser).attr("class", "anno-extra-line anno-extra-line--member").attr("fill", "none")
          .attr("stroke", col).attr("stroke-width", 1).attr("stroke-opacity", 0.35).attr("stroke-linejoin", "round"), ser);
      });
      const avg = this._groupAverage(g.members); if (!avg.length) return;
      setD(this._extraG.append("path").datum(avg).attr("class", "anno-extra-line anno-extra-line--avg").attr("fill", "none")
        .attr("stroke", col).attr("stroke-width", 2.2).attr("stroke-opacity", 0.95).attr("stroke-linejoin", "round"), avg);
      const vis = avg.filter(d => d.t <= domHi), end = vis.at(-1) || avg.at(-1);
      labels.push({ text: g.label, ci, x: x(end.t), y: y(end.v), yFrom: yFrom ? yFrom(end.v) : y(end.v) });
    });
    // §B.8 end-label collision nudge — stacked codes must never touch.
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 13) labels[i].y = labels[i - 1].y + 13;
    const host = this._extraLabels || this._extraG;
    labels.forEach(l => host.append("text").attr("class", `anno-extra-label anno-extra-label--c${l.ci}`)   /* [D93] slot colour via the class — the fill attr was inert */
      .attr("x", Math.min(l.x + 4, this._iw + 2)).attr("y", (yFrom && t ? l.yFrom : l.y) + 3).attr("text-anchor", "start")
      .attr("paint-order", "stroke").attr("stroke", "var(--bg)").attr("stroke-width", 3).text(l.text));
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
  // [debug 2026-07-06] Watches for the STICKY FIGURE's first appearance (plays the one-time line
  // draw-in, _playIntro) and for its disappearance after having been visible (§B.4 resets to the
  // neutral full view).
  // [debug 2026-07-06 — owner report: "line appears suddenly, no visible motion"] This used to
  // observe the whole `.chapter` at threshold:0 — which fires the instant the chapter's TOP EDGE
  // touches the viewport bottom, long before the STICKY figure itself has scrolled into view (a
  // chapter this tall can be ~5000px; the figure only becomes sticky-engaged partway through that).
  // Playwright-confirmed: introPlayed flipped true while the figure's own top was still ~934px down
  // (off-screen in a 900px-tall viewport, i.e. not visible at all), and the whole 900ms draw-in had
  // finished (_drawComplete) by the time the figure had scrolled up to occupy most of the viewport —
  // so the reader only ever saw the fully-drawn end state, never the wipe. Observing the figure
  // itself, with a real threshold (some of it must actually be on screen, not just a 1px sliver),
  // means the animation starts when there's something to watch it happen ON.
  _wireScroll() {
    const chapter = this.container.closest(".chapter");
    const figure = chapter?.querySelector(".scroller__chart") || chapter;
    if (this._io) this._io.disconnect();
    this._wasVisible = false;
    this._io = new IntersectionObserver((es) => es.forEach(e => {
      if (e.isIntersecting) { this._wasVisible = true; this._playIntro(); }
      else if (this._wasVisible) this._neutralView();
    }), { threshold: 0.3 });
    this._io.observe(figure);
  }
  // [debug 2026-07-06] One-time full-line draw-in, played once ever, the first time the chapter
  // scrolls into view — replaces the old continuous scroll-progress-tied reveal (owner reported it
  // read as the line "waiting" on the text steps instead of just telling its own story). Drives the
  // SAME _revealTo/_completeDraw path the old mechanism used via a fixed-duration tween, so the
  // clip-reveal wipe + playhead travel-and-fade (§B.2) look identical — only the trigger changed,
  // from "how far you've scrolled" to "a fixed-length animation that plays once."
  _playIntro() {
    if (this._introPlayed) return;
    this._introPlayed = true;
    if (this.ctx.motion.reduced) { this._completeDraw(); return; }
    this._revealRect.transition().duration(DRAW_DUR).ease(d3.easeCubicInOut)
      .tween("anno-draw", () => t => this._revealTo(t))
      .on("end", () => this._completeDraw());
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
    if (changed && (this._selectedCodes.length || this._selectedGroups.length || this._win)) { this._resetCompare(); this._resetWindow(true); }   // story rule
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
    // [debug 2026-07-06] Permanent bands (covid/war) stay lit from their trigger step onward;
    // temporary bands (calm/climb/return) light up ONLY on their own exact step and fade the moment
    // you move to another one — a spotlight, not a historical marker.
    this._bands.forEach(b => this._setBandOpacity(b, (b.temporary ? i === b.activeStep : i >= b.showAt) ? 1 : 0, dur));
    const showPeak = i >= 3;
    this._setPeakOpacity(showPeak ? 1 : 0, dur);
    if (showPeak && !this._peakFired) { this._peakFired = true; this._firePulse(false); }
    // §B.4 last step = FULL line end-to-end (no dim), tail tag + stamp visible.
    // [debug 2026-07-06] Named "anno-fade" so this interrupt only cancels a PRIOR anno-fade
    // transition, never the default-named "d"-attribute geometry transition _rescaleY/_layoutX may
    // have just scheduled on this SAME node moments earlier in the same onStep() call (the story
    // rule runs _resetCompare/_resetWindow, THEN _applyFocus, synchronously) — an unnamed
    // .interrupt() cancels ALL transitions on the node regardless of which attribute they target,
    // which was silently freezing the line mid-rescale, never reaching its reset shape.
    const last = i >= 4;
    if (this._lineMain) this._lineMain.interrupt("anno-fade").transition("anno-fade").duration(dur).attr("stroke-opacity", 1);
    if (this._tailG) this._tailG.interrupt().transition().duration(dur).style("opacity", last ? 1 : 0);
  }

  // §B.4 neutral full view (draw complete, everything visible, no dim, playhead gone).
  _neutralView() {
    this._completeDraw();
    this._neutral = true;
    if (this._playhead) this._playhead.style("opacity", 0);
    this._bands.forEach(b => this._setBandOpacity(b, 1));
    if (this._lineMain) this._lineMain.interrupt("anno-fade").attr("stroke-opacity", 1);   // [debug 2026-07-06] named, see _applyFocus
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
    // [debug 2026-07-06] Only bands with real popover copy get flagged — the temporary focus bands
    // (calm/climb/return) have no label/pop, so flagging them would make an invisible, empty text
    // node keyboard-focusable (tabindex, role=button) for no reason.
    this._bands.forEach(b => { const n = b._lbl.node(); if (n && b.pop) { this._info.flag(n, b.pop, ink); this._raiseTrigger(n); } });
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
    // [debug 2026-07-06] Groups listed FIRST (their own <optgroup>), individual countries after.
    const groupOpts = Object.entries(GROUPS).map(([key, g]) => `<option value="group:${key}">${g.label}</option>`).join("");
    const countryOpts = countries.map(c => `<option value="${c.code}">${c.name}</option>`).join("");
    host.innerHTML =
      `<span class="ac-add"><label for="${this.container.id}-add" class="ac-add-label">Compare</label>` +
      `<select id="${this.container.id}-add" class="ac-select"><option value="">Add a country or group…</option>` +
      `<optgroup label="Groups">${groupOpts}</optgroup><optgroup label="Countries">${countryOpts}</optgroup></select></span>` +
      `<span class="ac-chips" role="list"></span>` +
      `<button type="button" class="ac-reset" hidden>Reset</button>` +
      `<span class="ac-zoom" role="group" aria-label="Zoom the timeline">` +
      `<button type="button" class="ac-zoom-btn is-on" data-zoom="full">2019 – 2025</button>` +
      `<button type="button" class="ac-zoom-btn" data-zoom="crisis">2021 – 2023</button></span>`;
    host.querySelector(".ac-select").addEventListener("change", (e) => {
      const v = e.target.value; e.target.value = ""; if (!v) return;
      if (v.startsWith("group:")) this._addGroup(v.slice(6)); else this._addCountry(v);
    });
    host.querySelector(".ac-reset").addEventListener("click", () => this._resetCompare());
    host.querySelectorAll(".ac-zoom-btn").forEach(b => b.addEventListener("click", () => this._presetWindow(b.dataset.zoom, true)));
    this._renderChips();
  }
  // [debug 2026-07-06] slots = countries + groups sharing one 10-item cap, one slot per SELECTION
  // (a 5-member group still costs 1 slot, not 5) — matches the shared CMP colour-by-slot-index in
  // _drawExtras.
  _slotCount() { return this._selectedCodes.length + this._selectedGroups.length; }
  _renderChips() {
    const host = this._controlsHost(); if (!host) return;
    const chips = host.querySelector(".ac-chips"); if (!chips) return;
    // Groups first (chip shows ONLY the group's name, never its member list), then countries.
    const groupChips = this._selectedGroups.map(key => `<span class="ac-chip" role="listitem">${GROUPS[key]?.label || key}<button type="button" class="ac-chip-x" data-group="${key}" aria-label="Remove ${GROUPS[key]?.label || key}">×</button></span>`);
    const codeChips = this._selectedCodes.map(code => `<span class="ac-chip" role="listitem">${this.data.countryName(code)}<button type="button" class="ac-chip-x" data-code="${code}" aria-label="Remove ${this.data.countryName(code)}">×</button></span>`);
    chips.innerHTML = groupChips.join("") + codeChips.join("");
    chips.querySelectorAll(".ac-chip-x[data-code]").forEach(b => b.addEventListener("click", () => this._removeCountry(b.dataset.code)));
    chips.querySelectorAll(".ac-chip-x[data-group]").forEach(b => b.addEventListener("click", () => this._removeGroup(b.dataset.group)));
    const reset = host.querySelector(".ac-reset"); if (reset) reset.hidden = !this._slotCount();
    const sel = host.querySelector(".ac-select"); if (sel) sel.disabled = this._slotCount() >= 10;
  }
  _syncChips() { const host = this._controlsHost(); if (!host) return; const k = this._win ? "crisis" : "full"; host.querySelectorAll(".ac-zoom-btn").forEach(b => b.classList.toggle("is-on", b.dataset.zoom === k)); }
  // §2.1 compare-mode doctrine: chips≥1 = EXPLORE mode — the story narration (peak stamp +
  // leader, tail "back to X%" tag) fades out; bands/labels/ECB line STAY (context, not
  // narration). Restores to whatever the current scroll step dictates when chips return to 0.
  _syncCompareMode() {
    const compare = this._slotCount() > 0;
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
  _addCountry(code) { if (this._selectedCodes.includes(code) || this._slotCount() >= 10) return; this._selectedCodes.push(code); this._rescaleY(true); this._renderChips(); this._syncCompareMode(); }
  _removeCountry(code) { this._selectedCodes = this._selectedCodes.filter(c => c !== code); this._rescaleY(true); this._renderChips(); this._syncCompareMode(); }
  _addGroup(key) { if (!GROUPS[key] || this._selectedGroups.includes(key) || this._slotCount() >= 10) return; this._selectedGroups.push(key); this._rescaleY(true); this._renderChips(); this._syncCompareMode(); }
  _removeGroup(key) { this._selectedGroups = this._selectedGroups.filter(k => k !== key); this._rescaleY(true); this._renderChips(); this._syncCompareMode(); }
  _resetCompare() { if (!this._slotCount()) return; this._selectedCodes = []; this._selectedGroups = []; this._rescaleY(true); this._renderChips(); this._syncCompareMode(); }

  destroy() { if (this._io) this._io.disconnect(); super.destroy(); }
  onThemeChange() { this.render(); }
}
