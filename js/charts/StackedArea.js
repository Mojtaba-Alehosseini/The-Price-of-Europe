/* ============================================================
   StackedArea — contributions to headline HICP: energy, food, services, other
   Depth:
     1. computation — uses CP045 (energy) + CP01 (food) + remainder for services
     2. interaction — mode toggle: absolute / share  (streamgraph CUT — DESIGN-REVIEW #3)
     3. annotation — peak energy label, hand-off arrow energy→food
     4. encoding   — stacked area w/ smooth stack offset
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { watchChapterProgress, smooth } from "../modules/ChartMotion.js";

// Step → focused band. Idle = null (all visible).
const STEP_CONFIG = [
  { focus: null,       caption: "Energy, food, services and the rest, stacked over time." },
  { focus: "energy",   caption: "Late 2021 → 2022 — energy alone accounts for more than half of headline." },
  { focus: "food",     caption: "Spring 2023 — energy fades; food holds the headline above 7 %." },
  { focus: "services", caption: "2024 — services refuses to drop below the ECB target." }
];

const KEYS = ["energy", "food", "services", "other"];

// [R2 ELEVATE] Per-band editorial stamp. The stacked geometry hides each band's
// *dominance over time* (a top band's thickness is the signal, but the eye reads
// height, which the lower bands own). When a step focuses a band we (a) un-stack
// that band to a zero-anchored line so its magnitude reads against the y-axis,
// and (b) print this stamp naming the band's peak SHARE of the headline — the
// real insight, derived live from the data (numbers below are documentation, the
// code computes them so they never drift). Honest because share = pts ÷ headline.
//   energy   → 74 % of the Oct-2022 peak  (8.55 of 11.5)
//   food     → 41 % at the Mar-2023 hand-off
//   services → ~64 % of 2024's (much smaller) headline — the last driver standing
const BAND_META = {
  energy:   { eyebrow: "AT THE PEAK",   label: "Energy",
              line: y => `of the Oct 2022 peak\nwas the energy bill.` },
  food:     { eyebrow: "THE HAND-OFF",  label: "Food",
              line: y => `of headline by spring 2023 —\nyesterday's energy, today's food.` },
  services: { eyebrow: "WHAT'S LEFT",   label: "Services",
              line: y => `of 2024's headline is services.\nThe last driver still standing.` },
  other:    { eyebrow: "THE REMAINDER", label: "Other",
              line: y => `goods, transport and the rest\nof the basket.` }
};

export class StackedArea extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 96, right: 50, bottom: 36, left: 60 }, aspect: 1.55 });
    this.mode = "absolute";   // absolute | share  (streamgraph CUT — DESIGN-REVIEW #3)
    this.controlsEl = document.getElementById("chart-stackedArea-controls");
    this._focusBand = null;
    this._stepCaption = null;
    // [R3 MOTION · #A] Last band state actually *drawn* by _applyBandFocus. Lets
    // onStep early-return on a no-op re-enter so the focus overlay never re-traces.
    // `undefined` = nothing drawn yet (forces the first apply through).
    this._appliedFocus = undefined;
  }

  size() {
    if (!this.container) return { width: 600, height: 600 };
    const w = this.container.clientWidth || 600;
    const hAvail = this.container.clientHeight || 0;
    const hMin = Math.round(w / this.opts.aspect);
    // [AUDIT 05] Previously floored the viewBox height at 420 even when the sticky
    // panel only gave the chart-body ~181 px (phone). With preserveAspectRatio
    // "meet", a 336×420 viewBox squeezed into a 336×181 box letterboxed the chart
    // to a tiny centred strip with huge empty margins. Match the viewBox to the
    // REAL available height when the container is laid out, so the chart fills the
    // panel; only fall back to the aspect-derived height before first layout.
    if (hAvail > 0) return { width: w, height: Math.max(220, hAvail) };
    return { width: w, height: hMin };
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    // [R3 MOTION · #A] A full render() wipes the SVG (overlay + trace included), so
    // the next _applyBandFocus MUST rebuild regardless of focus. Invalidate the
    // applied-state cache here; _applyBandFocus re-stamps it after it draws.
    this._appliedFocus = undefined;
    // [AUDIT 05] Adapt the top kicker margin to the available height. On a short
    // sticky panel (phone) the fixed 96 px top crushed the plot; shrink it (and
    // the kicker font, via CSS) so the chart keeps a usable plot area. margin.top
    // is recomputed deterministically from height every render, so no restore is
    // needed — desktop (height >= 420) always resolves back to the full 96 px.
    const probe = this.size();
    const baseTop = 96;
    this.opts.margin.top = probe.height < 420
      ? Math.max(54, Math.round(probe.height * 0.16))
      : baseTop;
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    const { width: iw, height: ih } = this.innerSize();
    const compact = height < 420;   // phone / short panel → trim chrome

    const eu = this.data.euAggregateCode();
    const parse = d3.timeParse("%Y-%m");
    const months = this.data.monthsCP00().filter(t => t >= "2017-01");

    // Build rows: per month, decompose the headline rate into energy / food /
    // services / other contributions.
    //
    // [AUDIT 05 · DATA TRUTHFULNESS] We have no official HICP weights in this
    // dataset, so we approximate each category's *contribution* (weight × rate)
    // with a proxy weight, then NORMALISE so the four bands ALWAYS sum to the
    // real headline rate (CP00). The previous version multiplied the raw category
    // YoY rates by 0.30/0.20/0.40 and took `other = max(0, overall − e − f − s)`,
    // which let the energy band alone (53.9 % × 0.30 ≈ 16 pts) overshoot the true
    // 10.6 % headline — the stack peaked at ~21.75 % on a "% YoY" axis and the
    // tooltip's parts (e+f+s) exceeded "Overall". The proportional rescale below
    // keeps the relative story (energy dominant in 2022, food 2023, services 2024)
    // while making the total honest: energy + food + services + other === overall.
    const W = { energy: 0.30, food: 0.20, services: 0.40 };
    const rows = months.map(t => {
      const overall = this.data.hicpMonthly[eu]?.CP00?.[t] ?? null;
      const energy  = this.data.hicpMonthly[eu]?.CP045?.[t] ?? this.data.hicpMonthly[eu]?.NRG?.[t] ?? null;
      const food    = this.data.hicpMonthly[eu]?.CP01?.[t]  ?? this.data.hicpMonthly[eu]?.FOOD?.[t] ?? null;
      const services= this.data.hicpMonthly[eu]?.SERV?.[t]  ?? this.data.hicpMonthly[eu]?.CP11?.[t] ?? null;
      if ([overall, energy, food, services].some(v => v == null)) return null;
      // Raw proxy contributions (non-negative — a deflating category contributes 0
      // to the *positive* stack; its drag is absorbed into "other").
      const e0 = Math.max(0, energy   * W.energy);
      const f0 = Math.max(0, food     * W.food);
      const s0 = Math.max(0, services * W.services);
      const sum3 = e0 + f0 + s0;
      const headline = Math.max(0, overall);   // stack the positive headline
      let e, f, s, o;
      if (sum3 > headline && sum3 > 0) {
        // The three categories over-explain the headline (e.g. energy spiking while
        // other prices fall). Rescale them proportionally to fit exactly; no residual.
        const k = headline / sum3;
        e = e0 * k; f = f0 * k; s = s0 * k; o = 0;
      } else {
        // The three under-explain; the remainder is a genuine "other" residual.
        e = e0; f = f0; s = s0; o = headline - sum3;
      }
      return { date: parse(t), energy: e, food: f, services: s, other: o,
               total: e + f + s + o, overall };
    }).filter(Boolean);
    this._rows = rows;

    const pal = this.palette();
    const colors = {
      energy: pal.cat.energy, food: pal.cat.food, services: pal.cat.services, other: pal.cat.other
    };
    this._colors = colors;

    const x = d3.scaleTime().domain(d3.extent(rows, d => d.date)).range([0, iw]);
    // [Style v95] expose for peak-band callout in _applyBandFocus
    this._xScale = x;
    this._innerH = ih;

    // [R5·P8] Two modes only (streamgraph CUT — DESIGN-REVIEW #3: a centred baseline hides
    // magnitude). absolute = stacked YoY pts; share = expanded to 100% of headline.
    const series = this.mode === "share"
      ? d3.stack().keys(KEYS).offset(d3.stackOffsetExpand)(rows)
      : d3.stack().keys(KEYS)(rows);
    const yDom = this.mode === "share" ? [0, 1] : [0, d3.max(rows, d => d.total) * 1.05];
    const y = d3.scaleLinear().domain(yDom).range([ih, 0]).nice();

    // curveMonotoneX passes through the data and never overshoots — important in
    // share/stream modes where curveBasis overshot past the 0–100 % expand band,
    // leaving spurious "other" spikes dropping from the top of the chart. [AUDIT 05]
    const area = d3.area().x(d => x(d.data.date)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveMonotoneX);

    // Kicker (top-left). Baselines adapt to the (possibly trimmed) top margin so
    // the kicker doesn't overshoot the plot on a short panel. [AUDIT 05]
    const kickerY  = compact ? Math.round(this.opts.margin.top * 0.58) : 50;
    const kickerSY = kickerY + (compact ? 16 : 22);
    this.kickerG = this.svg.append("g").attr("class", "year-kicker-g").attr("pointer-events", "none");
    this.kickerY = this.kickerG.append("text").attr("class", "year-kicker")
      .attr("x", this.opts.margin.left).attr("y", kickerY).text("Composition");
    this._compact = compact;
    this.kickerSub = this.kickerG.append("text").attr("class", "year-kicker-sub")
      .attr("x", this.opts.margin.left + 3).attr("y", kickerSY)
      // On compact panels the sub is dropped (no room); the kicker word stands alone.
      .text(compact ? "" : (this._stepCaption || "energy + food + services + other, proxy weights"));

    // Top-right unit cap. [R2 ELEVATE] Mode-honest label: in stream mode the y-axis
    // is a wiggle offset, not "YoY %", so name it neutrally rather than mislabel it.
    const unitCap = this.mode === "share" ? "% OF HEADLINE" : "MONTHLY YoY %";
    const lgRight = this.svg.append("g").attr("class", "anno-legend")
      .attr("transform", `translate(${width - this.opts.margin.right}, ${kickerY})`);
    lgRight.append("text").attr("class", "legend-title")
      .attr("text-anchor", "end").attr("y", 0)
      .text(unitCap);
    lgRight.append("text").attr("class", "legend-tick")
      .attr("text-anchor", "end").attr("y", 15)
      .text(`Euro area · ${this.mode} mode`);
    // [R2 ELEVATE] Top-right color key (vertical, right-aligned) — replaces the
    // centred swatch row that collided with the kicker subtitle. Each band's swatch
    // + name lives in the open top-right gutter, well clear of the kicker. On a
    // compact panel there's no room, so the band colours + tooltip carry identity.
    if (!compact) {
      const keyG = lgRight.append("g").attr("class", "sa-key")
        .attr("transform", `translate(0, ${28})`);
      KEYS.forEach((k, i) => {
        const row = keyG.append("g").attr("transform", `translate(0, ${i * 13})`)
          .attr("data-key", k).attr("class", "sa-key__row");
        row.append("text").attr("class", "sa-key__name").attr("text-anchor", "end")
          .attr("x", -12).attr("y", 0).text(k);
        row.append("rect").attr("class", "sa-key__swatch")
          .attr("x", -9).attr("y", -7).attr("width", 8).attr("height", 8)
          .attr("fill", colors[k]);
      });
      this._keyG = keyG;
    }

    // grid + axes
    this.g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(""));
    this.g.append("g").attr("class", "axis axis--x")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(compact ? 5 : 9).tickFormat(d3.timeFormat("%Y")));
    this.g.append("g").attr("class", "axis axis--y")
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => this.mode === "share" ? d3.format(".0%")(d) : d + "%"));

    // [R2 ELEVATE] ECB 2 % target reference (absolute mode only — share/stream have
    // a different y-meaning). The step copy says services "refuses to drop below the
    // ECB's target", but the chart never drew that target. Now it does: a steel
    // dashed line at 2 % with a small label, so "above / below target" is visible.
    if (this.mode === "absolute" && yDom[1] > 2) {
      const tg = this.g.append("g").attr("class", "sa-target").attr("pointer-events", "none");
      tg.append("line").attr("class", "sa-target__line")
        .attr("x1", 0).attr("x2", iw).attr("y1", y(2)).attr("y2", y(2));
      tg.append("text").attr("class", "sa-target__label")
        .attr("x", 4).attr("y", y(2) - 4).text("ECB target · 2%");
    }

    // [R5·P8] Reveal clip — the "orange wall" BUILDS FROM THE BASELINE UP as the reader scrolls
    // into the chapter (energy is the bottom band, so it rises first; the signature motion). The
    // clip-rect grows upward from y=ih; latched (max-progress) so reverse never un-builds.
    // watchChapterProgress drives it (deferred init at the end of render); reduced = full at once.
    const revealId = `sa-reveal-${this.selector.replace(/[^\w]/g, "")}`;
    const saDefs = this.svg.select("defs").empty() ? this.svg.append("defs") : this.svg.select("defs");
    this._revealRect = saDefs.append("clipPath").attr("id", revealId)
      .append("rect").attr("x", 0).attr("y", ih).attr("width", iw).attr("height", 0);
    this._ihRef = ih;
    this._stackClipG = this.g.append("g").attr("clip-path", `url(#${revealId})`);

    // paths — the full stacked composition (the stable substrate), inside the reveal clip.
    // [R2 ELEVATE] Thin band separators: stroke each area in the page background so
    // the four bands read as discrete even where adjacent colours are close.
    this.layers = this._stackClipG.selectAll("path.area").data(series, d => d.key).join("path")
      .attr("class", d => `area series--${d.key} stacked-band stacked-band--${d.key}`)
      .attr("data-key", d => d.key)
      .attr("fill", d => colors[d.key])
      .attr("stroke", pal.bg)
      .attr("stroke-width", 0.6)
      .attr("d", area)
      .attr("opacity", 0.92);

    // [R2 ELEVATE · #1 LIFT] Un-stacked overlay group. A stacked top/middle band's
    // *thickness* is its value, but the eye reads height — so services (top band)
    // looks like a thin skin on the 2022 energy mountain and its 2024 dominance is
    // invisible. When a step focuses a band we draw that band's contribution as a
    // ZERO-ANCHORED line here, so its magnitude reads directly against the y-axis
    // and its trajectory over time is legible. Built in _applyBandFocus.
    this._overlayG = this.g.append("g").attr("class", "sa-overlay").attr("pointer-events", "none");
    this._yScale = y;

    // hover layer
    this.svg.on("mousemove", (event) => {
      const [mxAbs] = d3.pointer(event, this.g.node());
      const t = x.invert(mxAbs);
      const i = d3.bisector(d => d.date).left(rows, t);
      const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
      if (!r) return;
      // Contributions are estimated percentage-point shares that sum to the
      // headline rate (see decomposition note above). Label them "pts", and show
      // each band's SHARE of the headline so the composition reads at a glance —
      // the same insight the focus overlay encodes. Colour swatch via class only
      // (never an inline style=, CLAUDE.md §6).
      const sh = k => r.overall > 0.05 ? `${Math.round(100 * r[k] / r.overall)}%` : "—";
      const html = `<h5>${d3.timeFormat("%b %Y")(r.date)}</h5>
        <div class="row"><span class="key">Headline</span><span class="val">${r.overall.toFixed(1)}%</span></div>
        ${KEYS.map(k => `<div class="row sa-tip-row sa-tip-row--${k}"><span class="key">${k}</span><span class="val">${r[k].toFixed(2)} pts <span class="sa-tip-share">${sh(k)}</span></span></div>`).join("")}
        <p class="sa-tip-foot">est. contributions · sum = headline</p>`;
      this.ctx.tooltip.show(html, event.clientX, event.clientY);
    }).on("mouseleave", () => this.ctx.tooltip.hide());

    this._renderControls();
    this._applyBandFocus();

    // [R5·P8] Reveal init — reduced shows the full wall; otherwise the scroll watcher drives the
    // latched baseline-up build. compute() fires immediately, so a toggle re-render (reader already
    // deep in the chapter) lands the wall at ~full at once rather than re-building from zero.
    this._drawnP = 0;
    if (this.ctx.motion.reduced) this._revealTo(1);
    else this._wireScroll();
  }

  _wireScroll() {
    if (this._unwatch) this._unwatch();
    const chapter = this.container.closest(".chapter");
    this._unwatch = watchChapterProgress(chapter, p => this._onProgress(p));
  }
  _onProgress(p) {
    const target = smooth(Math.max(0, Math.min(1, (p - 0.05) / 0.55)));
    if (target > (this._drawnP || 0)) this._revealTo(target);
  }
  _revealTo(np) {
    this._drawnP = Math.max(this._drawnP || 0, np);
    const ih = this._ihRef || this._innerH || 0;
    if (this._revealRect) this._revealRect.attr("y", ih * (1 - this._drawnP)).attr("height", ih * this._drawnP);
  }

  // [R2 ELEVATE] Compute a band's headline-share to feature in the stamp. energy &
  // food peak as a single dramatic month (the spike / the hand-off); services and
  // other are about a *period* (2024 "what's left"), so we average their share over
  // 2024 where the headline is small but services dominates it. Returns {share,row}.
  _bandShare(key) {
    const rows = this._rows || [];
    if (!rows.length) return { share: 0, row: null };
    if (key === "services" || key === "other") {
      const seg = rows.filter(r => r.date >= new Date(2024, 0, 1) && r.date <= new Date(2024, 11, 31) && r.overall > 0.05);
      if (seg.length) {
        const mean = d3.mean(seg, r => r[key] / r.overall);
        const mid = seg[Math.floor(seg.length / 2)];
        return { share: mean, row: mid };
      }
    }
    const peak = d3.greatest(rows, r => r[key]);
    return { share: peak && peak.overall > 0.05 ? peak[key] / peak.overall : 0, row: peak };
  }

  _renderControls() {
    const c = this.controlsEl;
    if (!c) return;
    if (c.dataset.wired === "1") {
      c.querySelectorAll("button").forEach(b =>
        b.setAttribute("aria-pressed", b.dataset.mode === this.mode));
      return;
    }
    c.dataset.wired = "1";
    c.innerHTML = ["absolute", "share"].map(m =>   // streamgraph CUT (DESIGN-REVIEW #3: centered baseline hides magnitude)
      `<button class="btn btn--ghost" data-mode="${m}" aria-pressed="${m === this.mode}">${m}</button>`
    ).join("");
    c.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      this.mode = b.dataset.mode;
      c.querySelectorAll("button").forEach(bb => bb.setAttribute("aria-pressed", bb.dataset.mode === this.mode));
      this.render();
      // [R5·P8] A deliberate toggle means the reader has engaged — reveal the full stack (latched).
      // Without this the baseline-up clip-wipe (reset by render) would clip share mode (which always
      // fills 0–100%) to a thin bottom slice.
      this._revealTo(1);
    }));
  }

  _applyBandFocus() {
    if (!this.layers) return;
    const focus = this._focusBand;
    // [R3 MOTION · #A] Record the focus we're about to draw. Set once here so every
    // exit path (band-dim only, or band-dim + overlay/trace) leaves the cache honest;
    // onStep reads it to skip a no-op re-enter that would otherwise restart the trace.
    this._appliedFocus = focus;
    // Recede non-focused bands so the focused one leads. 0.5 (not 0.22) keeps the
    // surrounding composition readable AA-wise while the overlay carries the story.
    this.layers.attr("opacity", function () {
      const k = this.getAttribute("data-key");
      if (!focus) return 0.92;
      return k === focus ? 0.95 : 0.5;
    });
    // Dim the matching legend rows too, so the key tracks the focus.
    if (this._keyG) this._keyG.selectAll(".sa-key__row")
      .attr("opacity", function () {
        return !focus ? 1 : (this.getAttribute("data-key") === focus ? 1 : 0.4);
      });

    // Kicker word. The subtitle is suppressed on compact panels (no room).
    if (this.kickerY && this.kickerSub) {
      const subText = this._compact ? "" : null;
      const KEY_LABEL = { energy: "Energy", food: "Food", services: "Services", other: "Other" };
      this.kickerY.text(focus ? KEY_LABEL[focus] : "Composition");
      this.kickerSub.text(subText ?? (this._stepCaption
        || (focus ? "" : "energy + food + services + other")));
    }

    // ── [R2 ELEVATE · #1 LIFT] Un-stacked overlay + editorial stamp ──────────
    if (this._overlayG) this._overlayG.selectAll("*").remove();
    this.g.selectAll(".sa-stamp").remove();
    this.g.selectAll(".sa-peak-label").remove();
    const rows = this._rows;
    const y = this._yScale, x = this._xScale;

    // Idle (no focus): mark the energy mountain apex so the eye lands on Oct 2022.
    // Hidden once a band is focused — the stamp + overlay then carry the story.
    if (!focus && this.mode === "absolute" && rows && rows.length && y && x) {
      const pk = d3.greatest(rows, d => d.energy);
      if (pk) this.g.append("text").attr("class", "sa-peak-label")
        .attr("x", x(pk.date)).attr("y", y(pk.total) - 10).attr("text-anchor", "middle")
        .text(`Energy peak · ${d3.timeFormat("%b %Y")(pk.date)}`);
    }
    // Overlay only makes sense in absolute mode (pts read against the % axis). In
    // share mode the band IS its share already; in stream the y is a wiggle offset.
    if (!(focus && this.mode === "absolute" && rows && rows.length && y && x)) return;

    const col = this._colors[focus];
    // Zero-anchored area (faint) + bold top line for the focused band's true
    // magnitude. Now height = the value, so services reads ~1.8 pts through 2024
    // while energy's line craters from 8.5 — the "last driver standing" picture.
    const lineGen = d3.line().x(d => x(d.date)).y(d => y(d[focus])).curve(d3.curveMonotoneX);
    const areaGen = d3.area().x(d => x(d.date)).y0(y(0)).y1(d => y(d[focus])).curve(d3.curveMonotoneX);
    this._overlayG.append("path").attr("class", "sa-focus-fill")
      .attr("fill", col).attr("d", areaGen(rows));
    const path = this._overlayG.append("path").attr("class", "sa-focus-line")
      .attr("stroke", col).attr("d", lineGen(rows));

    // Peak / featured marker + a small tag at the focused band's peak month.
    const peak = d3.greatest(rows, d => d[focus]);
    if (peak) {
      this._overlayG.append("circle").attr("class", "sa-focus-dot")
        .attr("cx", x(peak.date)).attr("cy", y(peak[focus])).attr("r", 3.4)
        .attr("fill", col);
      // [R5·P8 / Burn-Murdoch] peak-band callout: the band's value in pts + its month, ON the data
      // (this block is absolute-only, so "pts" is meaningful). e.g. "8.6 pts · Oct 2022".
      const iwNow = this._xScale.range()[1];
      const late = x(peak.date) > iwNow - 120;
      this._overlayG.append("text").attr("class", "sa-focus-peaklabel")
        .attr("x", x(peak.date) + (late ? -8 : 8)).attr("y", y(peak[focus]) - 8)
        .attr("text-anchor", late ? "end" : "start").attr("fill", col)
        .text(`${peak[focus].toFixed(1)} pts · ${d3.timeFormat("%b %Y")(peak.date)}`);
    }
    // Latest-value dot (right edge) — anchors the "where it ends up" reading.
    const last = rows[rows.length - 1];
    this._overlayG.append("circle").attr("class", "sa-focus-dot sa-focus-dot--last")
      .attr("cx", x(last.date)).attr("cy", y(last[focus])).attr("r", 2.6)
      .attr("fill", col);

    // Trace the line on step-enter (reduced-motion → instant).
    const node = path.node();
    if (node) {
      const L = node.getTotalLength();
      const reduced = this.ctx?.motion?.reduced;
      if (reduced) {
        node.style.strokeDasharray = "none"; node.style.strokeDashoffset = "0";
      } else {
        node.style.strokeDasharray = `${L} ${L}`;
        node.style.strokeDashoffset = `${L}`;
        node.getBoundingClientRect();   // force layout before transition
        node.style.transition = "stroke-dashoffset 900ms cubic-bezier(.2,.7,.2,1)";
        node.style.strokeDashoffset = "0";
      }
    }

    // Editorial stamp: eyebrow + big italic Fraunces SHARE % + word-wrapped insight.
    // This names the takeaway (energy 74 % of the peak; services ~64 % of 2024),
    // which the stacked geometry alone cannot show. Placed top-left under the kicker.
    const meta = BAND_META[focus];
    const { share, row } = this._bandShare(focus);
    if (meta && share > 0) {
      // this.g is already translated by (margin.left, margin.top); place the stamp
      // just below the kicker in that local space (negative y = up into the kicker
      // band). sy is the absolute SVG baseline we want; subtract margin.top.
      const cmp = this._compact;
      const sy = (cmp ? this.opts.margin.top * 0.82 : 88);
      const sx = cmp ? 4 : 8;   // clear the y-axis tick labels at the plot's left edge
      const numDy = cmp ? 22 : 30;
      const sentDy = cmp ? 36 : 50;
      const lineH = cmp ? 12 : 15;
      const stamp = this.g.append("g")
        .attr("class", "sa-stamp" + (cmp ? " sa-stamp--compact" : ""))
        .attr("transform", `translate(${sx}, ${sy - this.opts.margin.top})`)
        .attr("pointer-events", "none");
      stamp.append("text").attr("class", "sa-stamp__eyebrow").attr("x", 0).attr("y", 0)
        .text(meta.eyebrow);
      // Big number carries the focused band's own colour so the eye ties the
      // share to its line/band (energy terra, food sage, services violet).
      stamp.append("text").attr("class", `sa-stamp__num sa-stamp__num--${focus}`)
        .attr("x", 0).attr("y", numDy)
        .text(`${Math.round(share * 100)}%`);
      // On a phone the two-line sentence eats the small plot; show one tight line.
      const lines = cmp ? [meta.line(row).split("\n")[0]] : meta.line(row).split("\n");
      const sentG = stamp.append("text").attr("class", "sa-stamp__sentence").attr("x", 0).attr("y", sentDy);
      lines.forEach((ln, i) => sentG.append("tspan").attr("x", 0).attr("dy", i === 0 ? 0 : lineH).text(ln));
    }
  }

  onStep(idx) {
    const cfg = STEP_CONFIG[Math.max(0, Math.min(STEP_CONFIG.length - 1, idx))];
    // [R3 MOTION · #A — idempotent re-enter] scrollama re-fires onStepEnter on every
    // boundary jitter AND every reverse-scroll re-entry of the SAME step. Re-running
    // _applyBandFocus rebuilds the un-stacked overlay and RESTARTS its 900ms stroke
    // trace from full length — the focus line blinked away and re-drew on each re-fire
    // (proven: dashoffset reset 0 → 1064px on a same-step re-enter). Skip the rebuild
    // when nothing changed: the focus band is the same AND it's already the drawn
    // state (_appliedFocus). A render() (mode/theme/resize) clears _appliedFocus, so
    // a genuine redraw still passes. The caption is purely derived from focus here
    // (STEP_CONFIG pairs them), so an unchanged focus implies an unchanged caption.
    if (cfg.focus === this._focusBand && cfg.focus === this._appliedFocus) {
      this._stepCaption = cfg.caption;
      return;
    }
    this._focusBand = cfg.focus;
    this._stepCaption = cfg.caption;
    this._applyBandFocus();
  }

  destroy() {
    if (this._unwatch) this._unwatch();
    super.destroy();
  }

  onThemeChange() { this.render(); }
}
