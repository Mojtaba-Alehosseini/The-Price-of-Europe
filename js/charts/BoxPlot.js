/* ============================================================
   BoxPlot — yearly distribution of EU country annual inflation rates.
   THE FINALE of the essay. One box per year (median, IQR, whiskers,
   outliers, + a faint dot strip of all 27 real values). Over the row of
   boxes the chapter authors the essay's closing arc: a tight distribution
   near the ECB 2 % line for years, the 2022 explosion (Estonia 19.4 % →
   France 5.9 %, a single-currency-union gap of fourteen points), then a
   re-convergence that lands HIGHER than it began.
   Depth:
     1. computation — q1/median/q3/iqr/whiskers/outliers + per-country dots
     2. interaction — hover any column → year summary + highest/lowest country
     3. annotation — 2022 protagonist + a closing stamp that states the takeaway
     4. encoding   — boxplot + a median spine and whisker envelope that make the
                     rise-and-fall arc pre-attentive (the boxes carry the detail)
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { sphereGradient } from "../modules/CraftFX.js";
import { buildCoinGlyph } from "./Hero.js";

// [R2·12] The narrative protagonist. This whole chapter — the last chart in the
// essay — exists to show that in 2022 a tight, uniform inflation distribution
// blew open across a single currency union, then mostly re-closed. So at REST
// (step 0 / reduced-motion / idle) the 2022 box carries the lone terracotta
// accent and the kicker opens ON that thesis, mirroring the protagonist pattern
// of its distribution-sibling (Ridgeline, the chapter directly above) and the
// choropleth capital-dot. Accent keeps its editorial function (CLAUDE.md §4).
const PROTAGONIST = 2022;

// Read a CSS custom-property literal at draw time (D3 cannot use var() in JS).
// Accepts either "--name" or "var(--name)".
function getCSS(name) {
  const m = String(name).match(/var\((--[^)]+)\)/);
  const n = m ? m[1] : name;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}

const STEP_CONFIG = [
  // At rest the chart already opens on the protagonist year, so step 0 names it.
  { focus: null, caption: "Each box is one year. 2022 is when it blew open." },
  { focus: 2022, caption: "Estonia 19.4 %  ·  France 5.9 % — fourteen points apart, one union." },
  { focus: 2024, caption: "The box tightens — but its floor sits above where the decade began." }
];

export class BoxPlot extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 100, right: 34, bottom: 36, left: 60 }, aspect: 1.3 });
    // Idle / reduced-motion state highlights the protagonist so the static chart
    // matches the story rather than showing a neutral "Spread" placeholder.
    this._focusYear = null;
    this._stepCaption = null;
    this._hoverYear = null;
    this._stampShown = false;   // shown↔hidden cache for the idempotent closing stamp
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

    // 2015–2024 only. 2025 exists in the source but is a provisional / partial-year
    // annual figure; rendering it as a finished box (a) contradicts the "2015 – 2024"
    // title + rationale, (b) leaves an un-narrated rightmost box that blunts the
    // "the gap is closing" finale, and (c) spawns a 2nd trailing outlier (RO). The
    // story's last complete year is 2024 — make the chart's last box 2024 too.
    const years = this.data.yearsCP00().filter(y => y >= 2015 && y <= 2024);
    const stats = years.map(y => {
      const vals = [];
      this.data.countriesByCode.forEach((meta, code) => {
        const v = this.data.hicpAnnual[code]?.CP00?.[String(y)];
        if (Number.isFinite(v)) vals.push({ code, name: meta.name, v });
      });
      vals.sort((a, b) => a.v - b.v);
      const arr = vals.map(d => d.v);
      const q1 = d3.quantile(arr, 0.25);
      const med = d3.quantile(arr, 0.5);
      const q3 = d3.quantile(arr, 0.75);
      const iqr = q3 - q1;
      const low = q1 - 1.5 * iqr, high = q3 + 1.5 * iqr;
      const inliers = arr.filter(v => v >= low && v <= high);
      const minIn = Math.max(d3.min(inliers), low);
      const maxIn = Math.min(d3.max(inliers), high);
      const outliers = vals.filter(d => d.v < low || d.v > high);
      return { year: y, q1, med, q3, minIn, maxIn, outliers, all: vals };
    });
    this._stats = stats;

    const x = d3.scaleBand().domain(years).range([0, iw]).padding(0.35);
    const yDom = [
      d3.min(stats, s => Math.min(s.minIn, ...s.outliers.map(o => o.v))) - 1,
      d3.max(stats, s => Math.max(s.maxIn, ...s.outliers.map(o => o.v))) + 1
    ];
    const y = d3.scaleLinear().domain(yDom).range([ih, 0]).nice();
    this._x = x; this._y = y; this._iw = iw; this._ih = ih; this._bw = x.bandwidth();

    // Kicker — opens on the protagonist year (2022), the essay's pivot, instead of
    // a neutral "Spread" placeholder. The big italic Fraunces year is the signature
    // editorial look; the sub-line carries the active step caption or the resting
    // thesis. _applyFocus() swaps both on hover / step change.
    this.kickerG = this.svg.append("g").attr("class", "year-kicker-g").attr("pointer-events", "none");
    this.kickerY = this.kickerG.append("text").attr("class", "year-kicker")
      .attr("x", this.opts.margin.left).attr("y", 52).text(String(PROTAGONIST));
    this.kickerSub = this.kickerG.append("text").attr("class", "year-kicker-sub")
      .attr("x", this.opts.margin.left + 3).attr("y", 76)
      .text(this._stepCaption || STEP_CONFIG[0].caption);

    // axes + grid
    this.g.append("g").attr("class", "grid").call(d3.axisLeft(y).tickSize(-iw).ticks(6).tickFormat(""));
    this.g.append("g").attr("class", "axis axis--y").call(d3.axisLeft(y).ticks(6).tickFormat(d => d + "%"));
    // X axis — thin the year labels when the band is too narrow to fit a 4-digit
    // year (≈26px). Without this the 10 labels collapse into an illegible smear on
    // phone (390px). Always keep the first and last year so the span reads.
    const labelStep = Math.max(1, Math.ceil(34 / x.step()));
    const lastIdx = years.length - 1;
    const xTickYears = years.filter((yr, i) => {
      if (i === 0 || i === lastIdx) return true;          // always show span ends
      if (i >= lastIdx - 1 && labelStep > 1) return false; // avoid colliding with last
      return i % labelStep === 0;
    });
    this.g.append("g").attr("class", "axis axis--x").attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickValues(xTickYears).tickFormat(d => d));
    // ECB target
    this.g.append("line").attr("class", "bp-ref-line")
      .attr("x1", 0).attr("x2", iw).attr("y1", y(2)).attr("y2", y(2));
    // ECB label sits at the LEFT edge: the early-year boxes (2015–16, medians ≈ 0 %)
    // sit far below the 2 % line, so there's clear space there. The right edge is
    // where the post-crisis boxes cluster right on the 2 % line, so a right-anchored
    // label collided with the 2023/2024 boxes.
    this.g.append("text").attr("class", "bp-ref-label")
      .attr("x", 4).attr("y", y(2) - 4).attr("text-anchor", "start").text("ECB 2 %");

    // ── [R2·12 · TOP LIFT] The three-act arc, authored under the boxes ──────────
    // The boxes alone show 10 similar shapes; the rise → 2022 explosion →
    // re-convergence (the essay's whole thesis) is *present in the data but mute in
    // the pixels*. Two faint marks, drawn BEHIND the boxes, make the arc
    // pre-attentive while the boxes keep carrying the honest per-year detail:
    //   • ENVELOPE — a translucent ribbon between each year's drawn whisker bounds
    //     (minIn..maxIn, exactly the marks the box plot already shows). It literally
    //     IS the cheap-to-dear gap; you watch it stay pencil-thin near 2 % for years,
    //     bulge across 2022–23, then pinch back — without reading a word.
    //   • MEDIAN SPINE — a path through the 10 medians. It carries the OTHER half of
    //     the story the gap can't: the floor RISES and never returns to its old
    //     level (2019 ≈ 1.5 % → 2024 ≈ 2.6 %). On reveal it traces left→right.
    // Both use neutral ink washes so they read as context, never competing with the
    // terracotta protagonist (accent restraint, CLAUDE.md §4).
    const cx = d => x(d.year) + x.bandwidth() / 2;
    this.archG = this.g.append("g").attr("class", "bp-arch").attr("pointer-events", "none");

    const envArea = d3.area()
      .x(cx).y0(d => y(d.minIn)).y1(d => y(d.maxIn)).curve(d3.curveMonotoneX);
    this.envPath = this.archG.append("path").attr("class", "bp-envelope")
      .attr("d", envArea(stats));

    const spineLine = d3.line().x(cx).y(d => y(d.med)).curve(d3.curveMonotoneX);
    this.spinePath = this.archG.append("path").attr("class", "bp-spine")
      .attr("d", spineLine(stats));

    // boxes
    const w = x.bandwidth();
    this.boxes = this.g.selectAll("g.box").data(stats, d => d.year).join("g")
      .attr("class", "box").attr("data-year", d => d.year)
      .attr("transform", d => `translate(${x(d.year)}, 0)`);

    // Transparent full-column hit area so hover (tooltip + highlight) works anywhere
    // in the year's column, not only over the few painted pixels of a tiny calm-year
    // box. Drawn first → sits behind the visible marks. Widened beyond the band so
    // adjacent gutters are covered without overlapping the neighbour's centre.
    this.boxes.append("rect").attr("class", "box-hit")
      .attr("x", w / 2 - x.step() * 0.45)
      .attr("width", x.step() * 0.9)
      .attr("y", 0).attr("height", ih)
      .attr("fill", "transparent");

    // whiskers
    this.boxes.append("line").attr("class", "box-whisker").attr("x1", w / 2).attr("x2", w / 2).attr("y1", d => y(d.minIn)).attr("y2", d => y(d.maxIn));
    this.boxes.append("line").attr("class", "box-whisker").attr("x1", w * 0.25).attr("x2", w * 0.75).attr("y1", d => y(d.maxIn)).attr("y2", d => y(d.maxIn));
    this.boxes.append("line").attr("class", "box-whisker").attr("x1", w * 0.25).attr("x2", w * 0.75).attr("y1", d => y(d.minIn)).attr("y2", d => y(d.minIn));

    this.boxes.append("rect").attr("class", "box-rect")
      .attr("x", 0).attr("width", w)
      .attr("y", d => y(d.q3)).attr("height", d => y(d.q1) - y(d.q3));

    this.boxes.append("line").attr("class", "box-median")
      .attr("x1", 0).attr("x2", w)
      .attr("y1", d => y(d.med)).attr("y2", d => y(d.med));

    // [R5·P14] sphereGradient median dot on the protagonist (2022) box — the finale's lit pivot.
    this.boxes.filter(d => d.year === PROTAGONIST).append("circle").attr("class", "bp-median-sphere")
      .attr("cx", w / 2).attr("cy", d => y(d.med)).attr("r", 4.5)
      .attr("fill", sphereGradient(this.svg, "bp-median", getCSS("--accent")));

    // [Style v95 · Priority 1] Jitter strip — show EVERY country's actual value as a
    // small faint dot, jittered horizontally, so the reader sees the real distribution
    // not just summary stats. Deterministic jitter (hash from country code) so the
    // dots don't reshuffle on re-render. Outliers stay drawn on top as larger red dots.
    this.boxes.each(function(d) {
      const sel = d3.select(this);
      const outlierCodes = new Set(d.outliers.map(o => o.code));
      // All non-outlier country dots (jitter strip)
      d.all.forEach(c => {
        if (outlierCodes.has(c.code)) return;
        // Deterministic jitter: hash code chars → ±0.4 width offset
        const h = (c.code.charCodeAt(0) * 31 + (c.code.charCodeAt(1) || 0)) % 100;
        const jit = ((h / 100) - 0.5) * 0.55;
        sel.append("circle").attr("class", "box-strip-dot")
          .attr("cx", w / 2 + jit * w)
          .attr("cy", y(c.v))
          .attr("r", 1.5);
      });
      // Outliers — drawn AFTER so they render on top
      d.outliers.forEach(o => {
        const h = (o.code.charCodeAt(0) * 31 + (o.code.charCodeAt(1) || 0)) % 100;
        const jit = ((h / 100) - 0.5) * 0.55;
        sel.append("circle").attr("class", "box-outlier")
          .attr("cx", w / 2 + jit * w)
          .attr("cy", y(o.v)).attr("r", 3);
      });
    });

    // annotation — the year the story names as the widest gap, now with a short
    // leader down to the box so the label is anchored, not floating.
    // NOTE: by IQR alone 2023 (4.9 pp) edges out 2022 (4.45 pp), so the old
    // `d3.greatest(q3-q1)` silently labelled 2023 while every narrative element
    // (step, kicker, rationale) calls 2022 "the widest box". 2022 IS the widest by
    // the metric the prose actually uses — the whisker-to-whisker GAP (5.9 → 19.4,
    // ~14 pp) — so anchor the callout to 2022 and call it "widest gap" to be both
    // truthful and consistent with the text. Falls back gracefully if 2022 absent.
    const widest = stats.find(s => s.year === 2022) || d3.greatest(stats, s => s.maxIn - s.minIn);
    if (widest && !this.isPhone) {
      const ax = x(widest.year) + w / 2;
      const ayTop = y(widest.q3) - 8;        // just above the box
      const ayLabel = ayTop - 16;
      this.annoG = this.g.append("g").attr("class", "bp-anno-g").attr("pointer-events", "none");
      this.annoG.append("line").attr("class", "bp-anno-leader")
        .attr("x1", ax).attr("x2", ax).attr("y1", ayLabel + 4).attr("y2", ayTop);
      this.annoG.append("text").attr("class", "bp-annotation")
        .attr("x", ax).attr("y", ayLabel).attr("text-anchor", "middle")
        .text("the gap blew open");
    } else if (widest) {
      // Phone: no room for a leader; keep a single compact tag over the box.
      this.g.append("text").attr("class", "bp-annotation")
        .attr("x", x(widest.year) + w / 2).attr("y", y(widest.q3) - 10)
        .attr("text-anchor", "middle").text("widest gap");
    }

    // [R2·12] 2024's lone outlier (Romania, 5.9 %) is the visual proof of "one dot
    // still pokes out from the top" — name it with a tiny tag so the step copy is
    // self-evident on the canvas. Only on desktop/tablet; suppressed on phone.
    const last = stats.find(s => s.year === 2024);
    if (last && !this.isPhone) {
      const ro = last.outliers.find(o => o.code === "RO") || last.outliers[0];
      if (ro) {
        const h = (ro.code.charCodeAt(0) * 31 + (ro.code.charCodeAt(1) || 0)) % 100;
        const jit = ((h / 100) - 0.5) * 0.55;
        const dx = x(last.year) + w / 2 + jit * w;
        this.roTagG = this.g.append("g").attr("class", "bp-rotag-g").attr("pointer-events", "none");
        // Tag sits to the LEFT of the dot (the dot is the rightmost mark on the
        // canvas) so it never runs past the plot's right edge.
        this.roTagG.append("text").attr("class", "bp-rotag")
          .attr("x", dx - 7).attr("y", y(ro.v) + 3).attr("text-anchor", "end")
          .text(`${ro.name} ${ro.v.toFixed(1)} %`);
      }
    }

    // [R2·12 · ENDING BEAT] The closing stamp — the essay's exhale, stated on the
    // canvas (not just in the scroll copy). Shown only on the final step (2024),
    // anchored to the right under the last box. Eyebrow + big italic Fraunces gap
    // figure + a two-line human sentence that delivers the takeaway the marks
    // imply: the fourteen-point gap mostly closed, but the floor never came back
    // down. Re-rendered by _applyFocus so it appears/disappears with the step.
    this.stampG = this.g.append("g").attr("class", "bp-stamp").attr("pointer-events", "none")
      .style("opacity", 0);
    this._stampShown = false;   // fresh empty stamp → the next show must (re)build

    // hover
    this.boxes.style("cursor", "pointer").on("mouseenter", (e, d) => {
      this._hoverYear = d.year;
      this._applyFocus();
      const high = d3.greatest(d.all, p => p.v);
      const low = d3.least(d.all, p => p.v);
      this.ctx.tooltip.show(
        `<h5>${d.year}</h5>
         <div class="row"><span class="key">Median</span><span class="val">${d.med.toFixed(1)}%</span></div>
         <div class="row"><span class="key">Range Q1–Q3</span><span class="val">${d.q1.toFixed(1)} – ${d.q3.toFixed(1)}%</span></div>
         <div class="row"><span class="key">Highest</span><span class="val">${high.name} · ${high.v.toFixed(1)}%</span></div>
         <div class="row"><span class="key">Lowest</span><span class="val">${low.name} · ${low.v.toFixed(1)}%</span></div>`,
        e.clientX, e.clientY);
    })
    .on("mousemove", e => this.ctx.tooltip.move(e.clientX, e.clientY))
    .on("mouseleave", () => {
      this._hoverYear = null;
      this._applyFocus();
      this.ctx.tooltip.hide();
    });

    this._initialReveal();
    this._applyFocus();
  }

  _initialReveal() {
    if (!this.boxes) return;
    const reduced = this.ctx.motion.reduced;
    if (reduced) {
      // Static correct end-state: everything visible, arc + protagonist lit. Clear
      // any inline opacity (null, not "1") so the boxes fall back to CSS-class
      // opacity — otherwise an inline opacity:1 outranks .is-dim and the focus
      // step/hover can never recede the field.
      this.boxes.style("opacity", null).classed("is-revealing", false);
      if (this.archG) this.archG.style("opacity", null);
      return;
    }
    // Boxes reveal year-by-year (time flowing left→right) — the box for the
    // protagonist year lands with a brief accent so the eye is pulled to it.
    // .is-revealing disables the CSS opacity transition for this window so the D3
    // transition is the SOLE driver (no dual-driver smear); on completion each box
    // clears its inline opacity back to null so .is-dim (a class) governs again.
    this.boxes.classed("is-revealing", true).style("opacity", 0).each(function (d, i) {
      d3.select(this).transition().delay(120 + i * 60).duration(460).style("opacity", 1)
        .on("end", function () { d3.select(this).style("opacity", null).classed("is-revealing", false); });
    });
    // The arc spine traces left→right and the envelope fades up underneath, so the
    // rise-and-fall is *drawn* in front of the reader rather than just appearing.
    if (this.spinePath) {
      const L = this.spinePath.node().getTotalLength();
      this.spinePath.attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L)
        .transition().delay(160).duration(1000).ease(d3.easeCubicInOut)
        .attr("stroke-dashoffset", 0);
    }
    if (this.envPath) {
      this.envPath.style("opacity", 0).transition().delay(160).duration(900).style("opacity", 1);
    }
    // The 2022/2024 annotations point at boxes that land LATE in the left→right
    // cascade (2022 ≈ index 7, 2024 ≈ index 9). Left static they pop in at t=0 and
    // float for ~1 s over empty grid before their referent box draws — a label
    // pointing at nothing. Fade each in so it RESOLVES as its box completes
    // (annoG with the 2022 box, roTagG with the 2024 box) — narrative order intact.
    if (this.annoG)  this.annoG.style("opacity", 0).transition().delay(620).duration(340).style("opacity", 1);
    if (this.roTagG) this.roTagG.style("opacity", 0).transition().delay(760).duration(340).style("opacity", 1);
    if (this._revealSafety) clearTimeout(this._revealSafety);
    const n = this.boxes.size();
    this._revealSafety = setTimeout(() => {
      // Land every box on its CSS-class opacity: interrupt any still-running reveal
      // (no-op if already ended), clear the inline opacity → null so .is-dim governs,
      // and drop the transition-suppression class. Then snap the arc + annotations home.
      this.boxes.interrupt().style("opacity", null).classed("is-revealing", false);
      if (this.spinePath) this.spinePath.interrupt().attr("stroke-dashoffset", 0);
      if (this.envPath) this.envPath.interrupt().style("opacity", 1);
      if (this.annoG) this.annoG.interrupt().style("opacity", 1);
      if (this.roTagG) this.roTagG.interrupt().style("opacity", 1);
      this._applyFocus();
    }, 160 + n * 60 + 520);
  }

  _applyFocus() {
    if (!this.boxes) return;
    const hover = this._hoverYear;
    const focus = this._focusYear;
    // Resting state (no hover, no step focus) still spotlights the protagonist so
    // the finale opens on its thesis — but, unlike an active step, it does NOT dim
    // the other boxes (they must all stay readable at rest). Active hover/step both
    // lights the target and recedes the rest.
    const active = hover || focus;            // a year the reader is acting on
    const lit = active || PROTAGONIST;         // which box wears the accent
    const dimOthers = !!active;                // only recede the field when acting

    this.boxes.classed("is-dim", function () {
      return dimOthers && (+this.getAttribute("data-year") !== lit);
    });
    this.boxes.classed("is-focus", function () {
      return (+this.getAttribute("data-year") === lit);
    });
    // The arc recedes a touch while a single year is in focus so the box reads
    // cleanly; at rest it sits at full strength carrying the overall shape.
    if (this.archG) this.archG.classed("is-dim", dimOthers);

    if (this.kickerY && this.kickerSub) {
      this.kickerY.text(String(lit));
      // On HOVER the sub-line would otherwise still assert the step's claim (e.g.
      // "Estonia 19.4 %…") under a different hovered year — incoherent. So while
      // hovering, show a neutral descriptor and let the tooltip carry the specifics;
      // the step caption returns the moment the pointer leaves.
      const sub = hover ? "one box per year — hover for the year's spread"
                        : (this._stepCaption || STEP_CONFIG[0].caption);
      this.kickerSub.text(sub);
    }

    // Closing stamp lands only on the final step (2024) — the essay's exhale.
    this._renderStamp(focus === 2024);
  }

  // ── [R2·12] Closing editorial stamp ─────────────────────────────────────────
  _renderStamp(show) {
    if (!this.stampG) return;
    const reduced = this.ctx.motion.reduced;
    // Idempotent: scrollama re-fires onStepEnter on every boundary jitter and on
    // each reverse re-entry of the same step. Without this guard a re-entry of the
    // final step wiped + rebuilt the stamp and restarted its 0→1 fade — a visible
    // re-blink (probe: opacity dropped to ~6e-5 then re-eased over ~340ms). Only act
    // on a genuine shown↔hidden change; a repeat call in the same state is a no-op.
    if (show === this._stampShown) return;
    this._stampShown = show;
    if (!show) {
      if (reduced) this.stampG.style("opacity", 0);
      else this.stampG.transition().duration(220).style("opacity", 0);
      return;
    }
    // (Re)build content once per show so width/positions track the current size.
    this.stampG.selectAll("*").remove();
    const cmp = this.isPhone;
    if (cmp) { this.stampG.style("opacity", 0); this._stampShown = false; return; } // phone has no room — step copy carries it

    const x = this._x, y = this._y;
    // [scroll-fix §7] The "WHERE IT LANDED / 5 pts / fourteen-point gap…" analysis block has MOVED to
    // the left scroller step card (owner: step text belongs in the card, never floating over the boxes).
    // Only the quiet coin BOOKEND remains — small + tasteful, parked in the clean upper-left air above
    // the low 2015–2019 boxes (a tight 0–3 % band), so it never covers the data.
    const sx = x(2015) + 4;
    const sy = y(18);
    this.stampG.attr("transform", `translate(${sx}, ${sy})`);

    // THE BOOKEND — the essay opened on the hero coin; the finale closes on it, tarnished (DRY:
    // buildCoinGlyph at the Act-V level). Small (34px) so it reads as a quiet closing note, not clutter.
    const coinS = 34;
    const coin = buildCoinGlyph(0.95);
    coin.setAttribute("x", 0); coin.setAttribute("y", 0);
    coin.setAttribute("width", coinS); coin.setAttribute("height", coinS);
    coin.setAttribute("aria-hidden", "true");
    this.stampG.node().appendChild(coin);
    const bk = this.stampG.append("text").attr("class", "bp-stamp__bookend").attr("x", coinS + 12).attr("y", 14);
    bk.append("tspan").attr("x", coinS + 12).text("Five years on, your");
    bk.append("tspan").attr("x", coinS + 12).attr("dy", 18).text("€100 is now ");
    bk.append("tspan").attr("class", "bp-stamp__bookend-num").text("€77.");

    if (reduced) this.stampG.style("opacity", 1);
    else this.stampG.style("opacity", 0).transition().duration(420).style("opacity", 1);
  }

  onStep(idx) {
    const cfg = STEP_CONFIG[Math.max(0, Math.min(STEP_CONFIG.length - 1, idx))];
    this._focusYear = cfg.focus;
    this._stepCaption = cfg.caption;
    this._applyFocus();
  }

  onThemeChange() { this.render(); }
}
