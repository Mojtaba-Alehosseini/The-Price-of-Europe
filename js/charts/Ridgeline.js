/* ============================================================
   Ridgeline — distribution of EU country inflation rates per year.
   Depth:
     1. computation — Epanechnikov KDE (bw 1.6) per year across 27 countries
     2. interaction — hover a ridge → it becomes the terracotta protagonist +
                      tooltip with year stats; scroll steps focus 2019/2022/2024
     3. annotation — protagonist year (2022 at rest), median tick (the BULK read),
                     extreme-country plates (the TAIL read), one-line kicker
     4. encoding   — density ridges across time; AMPLITUDE encodes dispersion,
                     COLOUR is reserved for the single active/protagonist ridge

   [R2·04] Elevation: the chart now opens ON its insight ("2022 — the year the
   distribution broke"). The 2022 ridge is the resting protagonist in terracotta;
   every other ridge recedes to a calm ink wash (the old year-sequential ramp
   painted the CALM years the hottest colour, misdirecting the eye). A faint strip
   of the 27 REAL country dots under each ridge grounds the smoothed KDE in its
   observations (Cairo truthfulness). A median tick shows the bulk slid right, not
   just two outliers. Ridges cascade up from their baselines like time passing.

   Scroll behaviour: step-driven (chapter 4 narrative explicitly references
   years 2019, 2022, 2024). Replaces previous scroll-progress reveal that
   left ridges invisible in iframes / throttled tabs.
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { sphereGradient, defsOnce } from "../modules/CraftFX.js";

// Step → focus year. Index 0 = idle, then per-year focus.
const STEP_CONFIG = [
  // Step 0 caption is null so the kicker falls through to the resting protagonist
  // sub-line (the idle chart already opens on the 2022 story, not a placeholder).
  { focus: null, caption: null },
  { focus: 2019, caption: "A narrow tidy ridge — Europe was a uniform inflation environment." },
  { focus: 2022, caption: "Estonia 19.4 %  ·  France 5.9 % — the same currency union, fourteen points apart." },
  { focus: 2024, caption: "The ridge tightens — but it has not snapped back to its old shape." }
];

// [R2·04] The narrative protagonist. This whole chapter exists to show that in
// 2022 the distribution stopped being a tight peak and lurched right across half
// the chart. So at REST the 2022 ridge carries the lone terracotta accent (like
// the Estonia capital-dot in the choropleth / the CP045 panel in smallMultiples)
// and every other ridge draws in a calm ink wash. The takeaway is pre-attentive
// before a word is read; the accent keeps its editorial function (CLAUDE.md §4).
const PROTAGONIST = 2022;

// Read a CSS custom property literal at draw time (D3 cannot use var() in JS).
function getCSS(name) {
  const m = String(name).match(/var\((--[^)]+)\)/);
  const n = m ? m[1] : name;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888";
}

export class Ridgeline extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 108, right: 84, bottom: 40, left: 64 }, aspect: 1.4 });
    // [R2·04] Idle / reduced-motion state already highlights the protagonist year
    // so the static chart matches the story instead of a neutral "Distribution".
    this._focusYear = null;          // step focus (null until scrollama fires)
    this._stepCaption = null;
    this._hoverYear = null;
    this._appliedActive = null;      // [R3 motion] last active year a step applied (re-enter guard)
  }

  size() {
    if (!this.container) return { width: 600, height: 600 };
    const w = this.container.clientWidth || 600;
    const hAvail = this.container.clientHeight || 0;
    const hMin = Math.round(w / this.opts.aspect);
    return { width: w, height: Math.max(420, hAvail || hMin) };
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    this.isPhone = width < 480;
    const { width: iw, height: ih } = this.innerSize();
    this._iw = iw; this._ih = ih;

    const years = this.data.yearsCP00().filter(y => y >= 2015);
    this._years = years;

    // gather samples per year
    const samples = years.map(y => {
      const vals = [];
      this.data.countriesByCode.forEach((meta, code) => {
        const v = this.data.hicpAnnual[code]?.CP00?.[String(y)];
        if (v != null && Number.isFinite(v)) vals.push({ code, v });
      });
      return { year: y, vals };
    });
    this._samples = samples;

    // x scale: rate value
    const minV = -2, maxV = Math.ceil(d3.max(samples.flatMap(s => s.vals.map(d => d.v))) ?? 18) + 1;
    const x = d3.scaleLinear().domain([minV, maxV]).range([0, iw]);
    // padTop reserves headroom so the upward-reaching top ridges (2015–17) clear
    // the kicker + legend that sit above the plot. [R2·04] Raised so the tall
    // narrow peaks (2019/2024) stop poking into the italic kicker.
    const padTop = 54;
    const y = d3.scalePoint().domain(years).range([padTop, ih - 30]).padding(0.5);
    this._x = x; this._y = y;

    // [R2·04] Per-year median + spread — drive the stamp copy and (subtly) the
    // resting warmth so the chart's colour encodes the STORY, not chronology.
    samples.forEach(s => {
      const v = s.vals.map(d => d.v).sort(d3.ascending);
      s.median = d3.median(v);
      s.spread = (d3.max(v) - d3.min(v));
    });
    // [R2·04] Resting palette: a single calm ink wash for every ridge. The
    // amplitude (width) of each ridge already carries the dispersion — colour is
    // therefore reserved for the ONE protagonist/focused ridge (terracotta). The
    // old year-sequential ramp painted the CALM years (2024–25) the darkest wine,
    // pulling the eye to exactly the wrong place. getCSS reads the live token so
    // light/dark themes and a11y both stay correct.
    this._inkRest = getCSS("var(--ink-soft)");
    this._accent  = getCSS("var(--accent)");
    const colorFor = (year) => year === PROTAGONIST ? this._accent : this._inkRest;
    this._colorFor = colorFor;

    // [R5·P7] Craft: the ONE active/protagonist ridge is filled with a vertical claret gradient
    // (deep at the wave crest → light at the baseline) so it reads as a lit warm wave, not a flat
    // block. Non-active ridges stay the calm ink wash (the six-test bar: claret reserved for the
    // focus; everyone else is calm grey context). stop-color is a hex token (var() resolves in
    // CSS → no d3 colour-parse, D15-safe). Rebuilt each render into the fresh <defs>.
    const fdefs = defsOnce(this.svg);
    const fg = fdefs.append("linearGradient").attr("id", "rdg-focus-grad")
      .attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 1);
    fg.append("stop").attr("offset", "0%").attr("stop-color", "var(--accent)").attr("stop-opacity", 0.95);
    fg.append("stop").attr("offset", "100%").attr("stop-color", "var(--accent)").attr("stop-opacity", 0.40);
    this._focusFill = "url(#rdg-focus-grad)";

    // KDE — Epanechnikov, bandwidth 1.6 (the disclosed methodology number is
    // UNCHANGED). [R2·04] The evaluation grid is refined 0.4→0.2 so the curve is
    // sampled twice as densely: this removes the faceted "lumps" round-1 saw in
    // the 2022 tail WITHOUT touching the bandwidth — it is purely a rendering
    // resolution change, fully honest about the smoothing. curveBasis then reads
    // as a clean ridge instead of a polyline.
    const kde = kernelDensityEstimator(epanechnikov(1.6), d3.range(minV, maxV + 1, 0.2));

    // Kicker (top-left). [R2·04] At rest it already names the protagonist year
    // and its takeaway (the chart opens ON the insight), not a neutral
    // "Distribution" placeholder that made the reader hunt for the point.
    this.kickerG = this.svg.append("g").attr("class", "year-kicker-g").attr("pointer-events", "none");
    this.kickerY = this.kickerG.append("text").attr("class", "year-kicker")
      .attr("x", this.opts.margin.left).attr("y", 52);
    this.kickerSub = this.kickerG.append("text").attr("class", "year-kicker-sub")
      .attr("x", this.opts.margin.left + 3).attr("y", 74);

    // Top-right legend
    const lg = this.svg.append("g").attr("class", "anno-legend")
      .attr("transform", `translate(${width - this.opts.margin.right}, 50)`);
    lg.append("text").attr("class", "legend-title")
      .attr("text-anchor", "end").attr("y", 0).text("ANNUAL HICP %");
    lg.append("text").attr("class", "legend-tick")
      .attr("text-anchor", "end").attr("y", 16).text("27 EU countries · 2015–2025");

    // Stamp layer (above ridges; below kicker is fine). Names the protagonist year.
    this.stampG = this.svg.append("g").attr("class", "rdg-stamp-layer").attr("pointer-events", "none");

    // Gridlines + axis — tick density adapts to width so labels never collide.
    // ~64px per tick keeps "18%" etc. from smearing together on phones.
    const tickCount = Math.max(4, Math.min(12, Math.floor(iw / 64)));
    this.g.append("g").attr("class", "axis axis--x")
      .attr("transform", `translate(0,${ih - 8})`)
      .call(d3.axisBottom(x).ticks(tickCount).tickFormat(d => d + "%"));
    this.g.append("text").attr("class", "ridge-axis-label")
      .attr("x", iw / 2).attr("y", ih + 30).attr("text-anchor", "middle")
      .text("Annual inflation %");

    // ECB target reference (vertical line at 2%)
    this.g.append("line").attr("class", "ridge-ref-line")
      .attr("x1", x(2)).attr("x2", x(2)).attr("y1", 0).attr("y2", ih - 8);
    this.g.append("text").attr("class", "ridge-ref-label")
      .attr("x", x(2) + 4).attr("y", 12).text("ECB 2 %");

    // Build ridges
    this.ridges = this.g.selectAll("g.ridge").data(samples).join("g")
      .attr("class", "ridge")
      .attr("data-year", d => d.year)
      .attr("transform", d => `translate(0, ${y(d.year)})`)
      .style("opacity", 0);

    // Amplitude scaled to row height; basis curve smooths the KDE. [R2·04]
    // Trimmed 18→15.5 so the spiky narrow ridges sit lower (calmer, and they no
    // longer reach the kicker) while the wide 2022 ridge keeps its presence.
    const rowH = (ih - 30) / years.length;
    const area = d3.area()
      .x(d => x(d[0]))
      .y0(0).y1(d => -d[1] * rowH * 15.5)
      .curve(d3.curveBasis);

    const dataMgr = this.data;
    this._rowH = rowH;
    const paintFor = this._colorFor;
    this.ridges.each(function(s) {
      const sel = d3.select(this);
      const density = kde(s.vals.map(d => d.v));
      // [R5·P7] crest (mode) of this ridge — where the sphere dot lands on the active ridge.
      let mxd = -1, modeX = 0;
      density.forEach(p => { if (p[1] > mxd) { mxd = p[1]; modeX = p[0]; } });
      s.mode = modeX;
      s.peakY = -mxd * rowH * 15.5;
      // Transparent hit target spanning the whole row band (peak above baseline
      // to a little below) so hover fires reliably, not only over the thin path.
      sel.append("rect").attr("class", "ridge-hit")
        .attr("x", 0).attr("y", -rowH * 2.0)
        .attr("width", iw).attr("height", rowH * 2.6);
      sel.append("path").attr("class", "ridge-area")
        .attr("fill", paintFor(s.year))
        .attr("stroke", getCSS("var(--bg)"))
        .attr("stroke-width", 0.75)
        .attr("stroke-linejoin", "round")
        .classed("is-protagonist", s.year === PROTAGONIST)
        .attr("d", area(density));
      sel.append("line").attr("class", "ridge-baseline")
        .attr("x1", 0).attr("x2", iw);

      // [R2·04] Country-dot strip — the 27 REAL observations that produced the
      // smoothed KDE, plotted just under the baseline (Cairo truthfulness: a
      // ridgeline is a kernel ESTIMATE; grounding it in points is honest + is the
      // single move that reads as Pudding-grade craft rather than a textbook KDE).
      // Vertical jitter is deterministic (seeded by code-hash) so the strip is
      // identical across re-renders; horizontal position is the true rate. The
      // two extremes get a hairline ring so on focus they read as the named pair.
      const mx = d3.greatest(s.vals, v => v.v);
      const mn = d3.least(s.vals, v => v.v);
      const dotsG = sel.append("g").attr("class", "rdg-dots");
      s.vals.forEach(d => {
        const h = hashStr(d.code);
        const jitter = 2 + (h % 100) / 100 * 5.5;   // 2–7.5px below baseline
        const isExt = d.code === mx.code || d.code === mn.code;
        dotsG.append("circle")
          .attr("class", "rdg-dot" + (isExt ? " rdg-dot--extreme" : ""))
          .attr("cx", x(d.v)).attr("cy", jitter)
          .attr("r", isExt ? 2.4 : 1.7);
      });

      sel.append("text").attr("class", "ridge-label")
        .attr("x", -12).attr("y", 4).attr("text-anchor", "end")
        .text(s.year);

      // Extreme-country callouts as small filled PLATES (round-1 P2: bare text on
      // a saturated fill was low-contrast). Built once, shown only on focus/hover.
      // Hi sits to the right of its dot; lo to the left of its dot; both lifted
      // ~16px above the baseline so they clear the year label + the dot strip.
      buildExtreme(sel, "hi", dataMgr.countryName(mx.code), mx.v, x(mx.v), 1);
      buildExtreme(sel, "lo", dataMgr.countryName(mn.code), mn.v, x(mn.v), -1);
    });

    // hover behaviour — temporarily isolate one ridge
    this.ridges.on("mouseenter", (event, s) => {
      this._hoverYear = s.year;
      this._applyOpacities({ animate: true });
      this._setKicker(this._activeYear());
      const sorted = s.vals.slice().sort((a, b) => b.v - a.v);
      const rows = sorted.slice(0, 3).concat(sorted.slice(-2)).map(r =>
        `<div class="row"><span class="key">${this.data.countryName(r.code)}</span><span class="val">${r.v.toFixed(1)}%</span></div>`
      ).join("");
      this.ctx.tooltip.show(`<h5>${s.year}</h5>${rows}`, event.clientX, event.clientY);
    })
    .on("mousemove", e => this.ctx.tooltip.move(e.clientX, e.clientY))
    .on("mouseleave", () => {
      this._hoverYear = null;
      this._applyOpacities({ animate: true });
      this._setKicker(this._activeYear());   // restore step / resting protagonist
      this.ctx.tooltip.hide();
    });

    // Initial reveal — sequential cascade with safety net
    this._initialReveal();
    // Seed fill/raise/median for the resting (protagonist) state, but let the
    // cascade transition own opacity so the reveal isn't snapped to its end value.
    this._applyOpacities({ skipOpacity: true });
    this._setKicker(this._activeYear());
    // [R3 motion] Record the active year the resting state painted, so the FIRST
    // scrollama re-fire of step 0 (focus:null → protagonist) is recognised as
    // already-applied and doesn't needlessly rebuild the median tick.
    this._appliedActive = this._activeYear();
  }

  // The ridge that is currently "the one": hover wins, then step focus, then the
  // resting protagonist (so the idle chart already tells the 2022 story).
  _activeYear() {
    if (this._hoverYear != null) return this._hoverYear;
    if (this._focusYear != null) return this._focusYear;
    return PROTAGONIST;
  }

  _initialReveal() {
    const reduced = this.ctx.motion.reduced;
    if (reduced) {
      this.ridges.style("opacity", 1);
      this.ridges.selectAll(".ridge-area, .rdg-dots").attr("transform", null);
      return;
    }
    // [R2·04] Cascade reads as time flowing down the page: 2015 (top) reveals
    // first, the present (bottom) last. Each ridge GROWS up from its baseline
    // (scaleY 0→1, origin at the baseline) while fading in to its RESTING opacity
    // (the protagonist lands at 1, the rest at 0.34) — the joyplot builds itself
    // year by year instead of all rows blinking on together. Growth applies to
    // the area + dot strip only (labels/baseline stay put). Targeting the resting
    // opacity here (not a flat 1) means the immediate _applyOpacities() that
    // follows agrees with the transition rather than snapping it to a hard value.
    const active = this._activeYear();
    this.ridges.each(function(d, i) {
      const sel = d3.select(this);
      const target = d.year === active ? 1 : 0.34;
      sel.style("opacity", 0);
      const grow = sel.selectAll(".ridge-area, .rdg-dots")
        .attr("transform", "scale(1,0.04)");
      // [R5·P7] Stagger tightened to ≤500ms total (PART 8.4: stagger ≤500ms) — 11 ridges × 40ms
      // = a 400ms cascade span; the per-ridge grow still eases over ~600ms so each wave settles.
      sel.transition("reveal").delay(i * 40).duration(600).ease(d3.easeCubicOut)
        .style("opacity", target);
      grow.transition("reveal").delay(i * 40).duration(640).ease(d3.easeCubicOut)
        .attr("transform", "scale(1,1)");
    });
    // [CH4-C1] rAF-stall safety net — force the end-state if transitions don't tick
    if (this._revealSafety) clearTimeout(this._revealSafety);
    this._revealSafety = setTimeout(() => {
      this.ridges.each(function () {
        const sel = d3.select(this);
        if (sel.style("opacity") !== "1") sel.interrupt().style("opacity", 1);
        sel.selectAll(".ridge-area, .rdg-dots").each(function () {
          const t = d3.select(this).attr("transform");
          if (t && t !== "scale(1,1)") d3.select(this).interrupt().attr("transform", "scale(1,1)");
        });
      });
      this._applyOpacities();
    }, this.ridges.size() * 40 + 700);
  }

  // Decide opacity + colour per ridge based on hover → step focus → protagonist.
  // Exactly ONE ridge is "active" at a time and it is the only terracotta shape;
  // all others recede to a calm ink wash (CLAUDE.md §4 accent restraint).
  //   opts.skipOpacity — leave opacity to the in-flight reveal transition.
  //   opts.animate      — tween the dim/raise on a scroll-step change (smoother
  //                       than snapping when the reader moves between years).
  _applyOpacities(opts = {}) {
    if (!this.ridges) return;
    const active = this._activeYear();
    const reduced = this.ctx.motion.reduced;
    const accent = this._accent || getCSS("var(--accent)");
    const ink = this._inkRest || getCSS("var(--ink-soft)");
    const focusFill = this._focusFill || accent;   // [R5·P7] gradient on the active ridge
    if (!opts.skipOpacity) {
      const op = (d) => d.year === active ? 1 : 0.34;
      if (opts.animate && !reduced) {
        this.ridges.transition("dim").duration(380).ease(d3.easeCubicOut).style("opacity", op);
      } else {
        this.ridges.interrupt("dim").style("opacity", op);
      }
    }
    this.ridges.each(function (d) {
      const on = d.year === active;
      const sel = d3.select(this);
      // Repaint: the active ridge is a claret gradient; everyone else is the calm ink wash.
      // (Fill changes are instant — the eye should read the protagonist immediately.)
      sel.select(".ridge-area")
        .attr("fill", on ? focusFill : ink)
        .classed("is-focus", on)
        .classed("is-protagonist", d.year === PROTAGONIST);
      sel.classed("is-active", on);
      sel.select(".ridge-label").classed("is-focus", on);
      // [R5·P7 / DESIGN-REVIEW #15] The real country-dot strip shows ONLY under the active ridge
      // (the protagonist gets its real observations; the others stay clean waves — no perma-clutter).
      sel.select(".rdg-dots").style("opacity", on ? 1 : 0);
    });
    // Raise the active ridge so its (near-opaque) shape, dots + plates aren't
    // clipped by rows painted on top of it.
    this.ridges.filter(d => d.year === active).each(function () { this.parentNode.appendChild(this); });
    // Stamp + extreme plates follow the active year (kept above the stack).
    if (this.stampG) this.svg.node().appendChild(this.stampG.node());
    this.ridges.selectAll(".rdg-extreme")
      .style("opacity", function () {
        const yr = +this.parentNode.getAttribute("data-year");
        return yr === active ? 1 : 0;
      });
    this._renderMedianMark(active);
  }

  // Editorial kicker. At rest (active === protagonist and no scroll step yet) it
  // names the protagonist year + its one-line takeaway; on a focus step it shows
  // that year + the step caption. Always italic Fraunces year (the signature look).
  _setKicker(activeYear) {
    if (!this.kickerY || !this.kickerSub) return;
    const restingSub = {
      2022: "the year the spread blew open — fourteen points across one union"
    };
    let sub;
    // The step caption only describes the step's OWN focus year. When the reader
    // hovers a DIFFERENT year, fall back to that year's spread read so the kicker
    // never shows a year number with a caption about another year.
    if (this._stepCaption && activeYear === this._focusYear) {
      sub = this._stepCaption;
    } else {
      const s = this._samples && this._samples.find(d => d.year === activeYear);
      sub = restingSub[activeYear]
        || (s ? `median ${s.median.toFixed(1)}% · ${s.spread.toFixed(0)}-point spread across 27 countries`
              : "country-level inflation, one ridge per year");
    }
    this.kickerY.text(String(activeYear));
    this.kickerSub.text(sub);
  }

  // [R2·04] Median marker on the active ridge. The Estonia/France extreme plates
  // tell the TAIL story; the median tick tells the BULK story — for 2022 the
  // median sits at 9.3% (the typical country), miles right of the ECB 2% line, so
  // the reader sees that the WHOLE distribution slid right, not just two outliers.
  // This is genuinely additive editorial information the kicker can't carry, and
  // it works for every focus year (2019's median hugs 2%; 2024's drifts back).
  // A single mark, not a card — keeps the top of the chart uncluttered.
  _renderMedianMark(activeYear) {
    if (!this.stampG) return;
    this.stampG.selectAll("*").remove();
    // [R2·04] On phone the top band is already crowded (kicker + extremes + axis
    // in ~330px); the median tick would tangle with the year labels + ECB line.
    // The kicker + step text carry the read there, so suppress the mark on phone.
    if (this.isPhone) return;
    const s = this._samples.find(d => d.year === activeYear);
    if (!s || s.median == null) return;
    const reduced = this.ctx.motion.reduced;
    const yBase = this._y(activeYear);
    const mx = this._x(s.median);
    // The mark lives in absolute (margin-translated) coords so it rides above the
    // raised active ridge. Tick rises from the baseline; label sits at its top.
    const g = this.stampG.append("g")
      .attr("transform", `translate(${this.opts.margin.left + mx}, ${this.opts.margin.top + yBase})`)
      .style("opacity", reduced ? 1 : 0);
    g.append("line").attr("class", "rdg-median-tick")
      .attr("x1", 0).attr("x2", 0).attr("y1", 2).attr("y2", -42)
      .attr("stroke", getCSS("var(--ink)")).attr("stroke-width", 1.2);
    g.append("circle").attr("cx", 0).attr("cy", 2).attr("r", 1.8)
      .attr("fill", getCSS("var(--ink)"));
    g.append("text").attr("class", "rdg-stamp-spread")
      .attr("x", 0).attr("y", -47).attr("text-anchor", "middle")
      .attr("fill", getCSS("var(--ink)"))
      .text(`median ${s.median.toFixed(1)}%`);
    // [R5·P7] A lit accent sphere on the active ridge's CREST (its mode — the most common rate
    // that year). Bremer craft: it punctuates the protagonist wave's peak. Distinct from the
    // median tick (the bulk read) — the crest is the distribution's apex.
    if (s.mode != null && s.peakY != null) {
      const sphere = this.stampG.append("circle").attr("class", "rdg-crest-sphere")
        .attr("cx", this.opts.margin.left + this._x(s.mode))
        .attr("cy", this.opts.margin.top + yBase + s.peakY)
        .attr("r", 5)
        .attr("fill", sphereGradient(this.svg, "rdg-crest", getCSS("var(--accent)")))
        .attr("stroke", getCSS("var(--bg)")).attr("stroke-width", 1.2)
        .style("opacity", reduced ? 1 : 0);
      if (!reduced) sphere.transition().delay(220).duration(300).style("opacity", 1);
    }
    if (!reduced) {
      g.transition().delay(160).duration(360).style("opacity", 1);
      if (this._stampSafety) clearTimeout(this._stampSafety);
      this._stampSafety = setTimeout(() => {
        if (!g.empty() && g.style("opacity") !== "1") g.interrupt().style("opacity", 1);
      }, 700);
    }
  }

  onStep(index, el) {
    const cfg = STEP_CONFIG[Math.max(0, Math.min(STEP_CONFIG.length - 1, index))];
    // [R3 motion · #3/#A] Idempotent re-enter guard. scrollama re-fires onStepEnter on
    // boundary jitter AND every reverse-scroll re-entry of the SAME step. Without this,
    // each re-fire re-ran _renderMedianMark (which removes + re-fades the median tick from
    // opacity 0 over ~520ms) — so the "median 9.3%" annotation BLINKED whenever the reader
    // oscillated across a step line (proven: median computed-opacity 1→0→0.96 on a same-step
    // re-fire while ridge opacities stayed flat). The ridge dim/raise was already idempotent
    // (it re-targets identical values, so D3 makes no visible change), but the median rebuild
    // was not. Early-return when the focus state is unchanged AND no hover is overriding —
    // hover transitions still drive their own _applyOpacities/_renderMedianMark via the
    // mouseenter/leave handlers, so this only skips a genuinely redundant step re-application.
    if (cfg.focus === this._focusYear && cfg.caption === this._stepCaption
        && this._hoverYear == null && this._appliedActive === this._activeYear()) {
      return;
    }
    this._focusYear = cfg.focus;
    this._stepCaption = cfg.caption;
    this._appliedActive = this._activeYear();
    this._applyOpacities({ animate: true });   // smooth dim/raise between years
    this._setKicker(this._activeYear());
  }

  onThemeChange() { this.render(); }
}

// ---- KDE helpers --------------------------------------------------
function kernelDensityEstimator(kernel, X) {
  return V => X.map(x => [x, d3.mean(V, v => kernel(x - v))]);
}
function epanechnikov(k) {
  return v => Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
}

// ---- render helpers -----------------------------------------------
// Deterministic small hash so the country-dot jitter is stable across renders
// (a fresh Math.random() each render would make the strip jump on resize/theme).
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return h;
}

// Build a focus-only extreme callout (plate + mono label) as a child <g> of the
// ridge group. dir +1 = high (anchor start, to the right of its dot); -1 = low
// (anchor end, to the left). Lifted ~17px above the baseline so it clears the
// year label + dot strip. Plate width is measured after the text lays out.
function buildExtreme(sel, kind, name, value, cx, dir) {
  const g = sel.append("g").attr("class", `rdg-extreme rdg-extreme--${kind}`)
    .style("opacity", 0);
  const padX = 4, ty = -17;
  const anchor = dir > 0 ? "start" : "end";
  const plate = g.append("rect").attr("class", "rdg-extreme-plate").attr("rx", 3);
  const txt = g.append("text").attr("class", `rdg-extreme-text rdg-extreme-text--${kind === "hi" ? "hi" : "lo"}`)
    .attr("x", cx + dir * (padX + 2)).attr("y", ty + 4).attr("text-anchor", anchor)
    .text(`${name} ${value.toFixed(1)}%`);
  // Size the plate to the text box.
  const node = txt.node();
  let bb;
  try { bb = node.getBBox(); } catch (e) { bb = { x: cx, y: ty - 5, width: 60, height: 13 }; }
  plate.attr("x", bb.x - padX).attr("y", bb.y - 2)
    .attr("width", bb.width + padX * 2).attr("height", bb.height + 4);
}
