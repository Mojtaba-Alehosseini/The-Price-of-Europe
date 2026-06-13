/* ============================================================
   ConnectedScatter — wage growth vs price growth, per country, 2019→2024
   Depth:
     1. computation — cumulative HICP + cumulative wage per year, year-by-year
     2. interaction — hover a country line to highlight + fade rest
     3. annotation — 45° "break-even" diagonal + winners/losers regions
     4. encoding   — paths in 2D, arrowhead at terminal year
   ============================================================ */

import { BaseChart } from "./BaseChart.js";

// Step 0: overview. Step 1: pin Estonia — a "below the line" loser whose path is
//   flat-then-late-vertical (pay only stirred in 2024, still short of prices).
// Step 2: pin Bulgaria — a clear "above the line" winner where pay led the whole way.
// Captions + stamp numbers are written to match the DATA (verified against
//   minimum_wages.json + hicp_index.json, anchored Jan-2019 / 2019-S1):
//     EE — prices +40.9%, wages +28.9% → pay fell 12 pts short (below break-even)
//     BG — prices +31.8%, wages +49.6% → pay ran 18 pts ahead   (above break-even)
//   Earlier captions ("Estonia caught up", "Romania outran prices") were on the
//   wrong side of the diagonal and have been corrected — see audit 10. The `stamp`
//   block drives the editorial annotation card (eyebrow / signed gap / sentence).
const STEP_CONFIG = [
  { focus: null, caption: "cumulative growth since 2019, per country" },
  {
    focus: "EE", caption: "Estonia — prices surged first; pay only stirred in 2024, still short.",
    stamp: { eyebrow: "Prices won", line: "Prices ran +41%. The minimum wage only stirred in 2024, ending +29%." }
  },
  {
    focus: "BG", caption: "Bulgaria — pay ran ahead of prices the whole way.",
    stamp: { eyebrow: "Pay won", line: "Pay rose +50% as prices rose +32% — above the line the whole way." }
  }
];

export class ConnectedScatter extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 96, right: 100, bottom: 48, left: 72 }, aspect: 1.05 });
    this._focusCode = null;
    this._stepCaption = null;
    this._stepStamp = null;     // editorial stamp for the active step (EE / BG)
    this._tapCode = null;       // touch: the path a tap has pinned (acts like hover)
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
    const { width: iw, height: ih } = this.innerSize();
    // Narrow viewports (phone) need fewer ticks, no in-SVG kicker (the HTML <h3>
    // already titles the figure), and a slimmer labelled set — otherwise the
    // x-axis ticks smear into one another and the kicker overprints the header.
    const compact = width < 560;

    // Arrowhead markers (2019 → 2024 direction) live in the chart's own <defs>,
    // re-created each render since clearing the SVG drops them. Two variants:
    // a neutral head for the default-focus paths, an accent head for the
    // hovered / stepped path. marker-end auto-orients to the terminal tangent.
    this._defs = this.svg.append("defs");
    const mk = (id, cls) => {
      const m = this._defs.append("marker")
        .attr("id", id).attr("class", cls)
        .attr("viewBox", "0 0 10 10")
        .attr("refX", 4).attr("refY", 5)
        .attr("markerWidth", 7.5).attr("markerHeight", 7.5)
        .attr("orient", "auto");
      m.append("path").attr("d", "M0,1 L9,5 L0,9 Z");
      return m;
    };
    mk("cs-arrow-default", "cs-arrow cs-arrow--default");
    mk("cs-arrow-focus", "cs-arrow cs-arrow--focus");

    const years = [2019, 2020, 2021, 2022, 2023, 2024];
    const series = [];
    this.data.countriesByCode.forEach((meta, code) => {
      if (!meta.minWage) return;
      const pts = [];
      const p0 = this.data.hicpIndex[code]?.CP00?.["2019-01"];
      const w0 = this.data.minWages[code]?.["2019-S1"] ?? this.data.minWages[code]?.["2019-S2"];
      if (p0 == null || w0 == null) return;
      years.forEach(y => {
        const pi = this.data.hicpIndex[code]?.CP00?.[`${y}-01`];
        const wi = this.data.minWages[code]?.[`${y}-S1`] ?? this.data.minWages[code]?.[`${y}-S2`];
        if (pi != null && wi != null) {
          pts.push({ year: y, price: ((pi - p0) / p0) * 100, wage: ((wi - w0) / w0) * 100 });
        }
      });
      if (pts.length >= 3) series.push({ code, name: meta.name, pts });
    });
    this._series = series;

    const allPts = series.flatMap(s => s.pts);
    const x = d3.scaleLinear().domain([0, d3.max(allPts, d => d.price) * 1.05]).range([0, iw]).nice();
    const y = d3.scaleLinear().domain([0, d3.max(allPts, d => d.wage) * 1.05]).range([ih, 0]).nice();

    // Kicker — suppressed on phone (compact), where it overprints the HTML <h3>
    // header + subtitle. On desktop/tablet it gives the editorial big-number feel
    // and doubles as the active-country readout on hover/step.
    if (!compact) {
      this.kickerG = this.svg.append("g").attr("class", "year-kicker-g").attr("pointer-events", "none");
      this.kickerY = this.kickerG.append("text").attr("class", "year-kicker")
        .attr("x", this.opts.margin.left).attr("y", 50).text("Wages vs prices");
      this.kickerSub = this.kickerG.append("text").attr("class", "year-kicker-sub")
        .attr("x", this.opts.margin.left + 3).attr("y", 72).text(this._stepCaption || "cumulative growth since 2019, per country");
    } else {
      this.kickerG = null; this.kickerY = null; this.kickerSub = null;
    }

    // Top-right legend — now that the two regions are labelled IN SITU along the
    // diagonal, this no longer repeats their meaning; it carries only the unit
    // (legend-title language) so the eye learns "these numbers are cumulative %".
    if (!compact) {
      const lg = this.svg.append("g").attr("class", "anno-legend")
        .attr("transform", `translate(${width - this.opts.margin.right}, 50)`);
      lg.append("text").attr("class", "legend-title")
        .attr("text-anchor", "end").attr("y", 0).text("CUMULATIVE %, 2019 → 2024");
    }

    // gridlines + axes. On phone the default ~12 ticks at every 5% smear into an
    // unreadable band, so drop to ~4 ticks (every ~20%); axisBottom .ticks() is a
    // hint that D3 rounds to "nice" intervals.
    const xTickCount = compact ? 4 : Math.min(8, Math.round(iw / 70));
    const yTickCount = compact ? 5 : 6;
    this.g.append("g").attr("class", "grid").call(d3.axisLeft(y).tickSize(-iw).ticks(yTickCount).tickFormat(""));
    this.g.append("g").attr("class", "axis axis--x").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(xTickCount).tickFormat(d => d + "%"));
    this.g.append("g").attr("class", "axis axis--y").call(d3.axisLeft(y).ticks(yTickCount).tickFormat(d => d + "%"));
    this.g.append("text").attr("class", "cs-axis-label")
      .attr("x", iw / 2).attr("y", ih + 38).attr("text-anchor", "middle")
      .text("Cumulative prices since 2019, %");
    this.g.append("text").attr("class", "cs-axis-label")
      .attr("transform", `translate(-50, ${ih / 2}) rotate(-90)`).attr("text-anchor", "middle")
      .text("Cumulative wages, %");

    // ── The break-even diagonal as the SPINE OF MEANING ──────────────────
    // A point (v, v) lands on this line; above it pay outran prices, below it
    // prices outran pay. Round-1 made the line visible; the elevation makes the
    // MEANING legible without a legend: shade the two regions and label each one
    // *in situ*, angled along the line, so the reader knows the diagonal's job in
    // one glance. The line is drawn UNDER the paths (regions first).
    const xMax = x.domain()[1], yMax = y.domain()[1];
    const m = Math.min(xMax, yMax);
    const dx0 = x(0), dy0 = y(0), dx1 = x(m), dy1 = y(m);
    // Screen angle of the diagonal (not 45° — px/% differs per axis). The region
    // labels ride parallel to it.
    const diagAngle = Math.atan2(dy1 - dy0, dx1 - dx0) * 180 / Math.PI;

    // Shaded regions — full-plot wedges split by the diagonal. Pay-won (above):
    // the upper-left triangle + the slab above y=m if the y-domain overruns x.
    // Prices-won (below): the lower-right triangle + the slab right of x=m.
    this.g.append("polygon").attr("class", "cs-region cs-region--pay")
      .attr("points", `${x(0)},${y(0)} ${x(m)},${y(m)} ${x(xMax)},${y(yMax)} ${x(0)},${y(yMax)}`);
    this.g.append("polygon").attr("class", "cs-region cs-region--prices")
      .attr("points", `${x(0)},${y(0)} ${x(m)},${y(m)} ${x(xMax)},${y(yMax)} ${x(xMax)},${y(0)}`);

    this.g.append("line").attr("class", "cs-diagonal")
      .attr("x1", dx0).attr("y1", dy0).attr("x2", dx1).attr("y2", dy1);

    // In-region meaning labels, angled along the line — so the reader learns the
    // diagonal's job in one glance, no legend. Placed at different points along
    // the line (pay toward the upper-left third, prices toward the lower-right
    // third) and pushed deep into their own region, so they sit in open space and
    // don't crowd each other or the lower-left path cluster. Suppressed on phone
    // (compact) where there's no room — the shaded regions carry the meaning there.
    if (!compact) {
      const rad = diagAngle * Math.PI / 180;
      const nx = Math.sin(rad), ny = -Math.cos(rad);   // unit normal (points "up-left")
      const off = 20;                                  // perpendicular push into the region
      const at = (t, dir, cls, txt) => {
        const px = dx0 + (dx1 - dx0) * t, py = dy0 + (dy1 - dy0) * t;
        this.g.append("text").attr("class", "cs-region-label " + cls)
          .attr("transform", `translate(${px + nx * off * dir}, ${py + ny * off * dir}) rotate(${diagAngle})`)
          .attr("text-anchor", "middle").text(txt);
      };
      at(0.34, +1, "cs-region-label--pay", "↖ pay outran prices");
      at(0.70, -1, "cs-region-label--prices", "prices outran pay ↘");
    }

    // "break-even" tag at the top end of the line (kept; it names the line itself).
    this.g.append("text").attr("class", "cs-diagonal-label")
      .attr("x", dx1 - 6).attr("y", dy1 - 7).attr("text-anchor", "end")
      .text("break-even");

    // paths
    const line = d3.line().x(d => x(d.price)).y(d => y(d.wage)).curve(d3.curveMonotoneX);
    // [Style v95] Default-emphasise 8 "named" countries — top-5 by distance from diagonal
    //  + Big-3 reference economies (DE/FR/ES). The rest stay light so the eye lands on
    //  the meaningful trajectories first.
    const last0 = d => d.pts.at(-1);
    const distance0 = d => Math.abs(last0(d).wage - last0(d).price);
    const rankedDefault = series.slice().sort((a, b) => distance0(b) - distance0(a));
    // On phone the plot is ~250 px wide; 8 named labels collide into mush, so keep
    // only the 4 most extreme deviations there. Desktop/tablet keep the fuller set.
    const defaultLabelCodes = compact
      ? new Set(rankedDefault.slice(0, 4).map(d => d.code))
      : new Set(rankedDefault.slice(0, 5).map(d => d.code).concat(["DE", "FR", "ES"]));
    this._defaultLabelCodes = defaultLabelCodes;

    this.paths = this.g.selectAll("g.cs-line").data(series, d => d.code).join("g")
      .attr("class", "cs-line").attr("data-code", d => d.code)
      .classed("cs-line--default-focus", d => defaultLabelCodes.has(d.code));

    this.paths.append("path").attr("class", "cs-path")
      .attr("d", d => line(d.pts))
      // Arrowhead on the terminal (2024) end of the named paths shows the
      // 2019 → 2024 direction of travel. Background paths stay plain to reduce
      // clutter; the hovered/stepped path swaps to the accent head in _applyFocus.
      .attr("marker-end", d => defaultLabelCodes.has(d.code) ? "url(#cs-arrow-default)" : null);

    this.paths.append("circle").attr("class", "cs-node cs-node--start")
      .attr("cx", d => x(d.pts[0].price)).attr("cy", d => y(d.pts[0].wage)).attr("r", 2.5);

    this.paths.append("circle").attr("class", "cs-node cs-node--end")
      .attr("cx", d => x(d.pts.at(-1).price)).attr("cy", d => y(d.pts.at(-1).wage)).attr("r", 4);

    // End labels are drawn into a SEPARATE, redrawable layer (not per-path) so
    // they can be vertically de-collided with leader lines (the Greece/Spain and
    // Croatia/Latvia clusters overlapped at render time) and so the focused
    // country can be force-labelled on hover/step. See _drawEndLabels.
    this._scales = { x, y, iw, ih };
    this._compact = compact;

    // Tooltip body for a country (shared by hover + tap).
    const tipHtml = d => `<h5>${d.name}</h5>` + d.pts.map(p => `<div class="row"><span class="key">${p.year}</span><span class="val">+${p.price.toFixed(1)}% prices · +${p.wage.toFixed(1)}% wages</span></div>`).join("");

    // Hover (mouse) + tap (touch). The subtitle promises "tap or hover", so a tap
    // must do everything a hover does: pin the path as the figure, swap its
    // arrowhead to accent, raise the stamp, and show the tooltip. We pin via
    // _tapCode (sticky, unlike _hoverCode which clears on mouseleave) so the
    // highlight survives the finger lifting. Tapping the same path again, or
    // empty plot, releases it.
    this.paths.style("cursor", "pointer")
      .on("mouseenter", (e, d) => {
        if (this._touched) return;          // touch fires synthetic mouse events; tap owns state there
        this._hoverCode = d.code;
        this._applyFocus();
        this.ctx.tooltip.show(tipHtml(d), e.clientX, e.clientY);
      })
      .on("mousemove", e => { if (!this._touched) this.ctx.tooltip.move(e.clientX, e.clientY); })
      .on("mouseleave", () => {
        if (this._touched) return;
        this._hoverCode = null;
        this._applyFocus();
        this.ctx.tooltip.hide();
      })
      .on("pointerup", (e, d) => {
        if (e.pointerType !== "touch" && e.pointerType !== "pen") return; // mouse handled above
        e.stopPropagation();
        this._touched = true;               // from now on, ignore synthetic mouse events
        this._hoverCode = null;             // tap is authoritative
        const release = this._tapCode === d.code;
        this._tapCode = release ? null : d.code;
        this._applyFocus();
        if (release) this.ctx.tooltip.hide();
        else this.ctx.tooltip.show(tipHtml(d), e.clientX, e.clientY);
      });

    // Tap on empty plot releases any pinned path (touch only).
    this.svg.on("pointerup", (e) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      this._touched = true;
      this._hoverCode = null;
      if (this._tapCode != null) {
        this._tapCode = null;
        this._applyFocus();
        this.ctx.tooltip.hide();
      }
    });

    // Initial reveal: two-phase trace (field first, spotlight last) + end labels.
    this._initialReveal();
    this._applyFocus();
  }

  // Two-phase reveal that REVEALS STRUCTURE (Reuters/SlopeChart pattern): the calm
  // field traces in first and fast; the spotlight path (the active step's country)
  // traces last and slower, so the protagonist's trajectory lands after its
  // context. The end-dots fade in after each line settles; the spotlight dot gets
  // a brief radius overshoot — the "arrival" beat. Reduced-motion → static.
  _initialReveal() {
    if (!this.paths) return;
    if (this.ctx.motion.reduced) {
      this.paths.selectAll("path.cs-path").attr("stroke-dasharray", null).attr("stroke-dashoffset", null);
      this.paths.selectAll("circle.cs-node").style("opacity", null);
      return;
    }
    const spot = this._activeCode();
    const codes = this._series.map(s => s.code);
    const fieldCodes = codes.filter(c => c !== spot);
    const fieldStagger = 22, fieldDur = 560;
    const fieldSpan = fieldStagger * Math.max(0, fieldCodes.length - 1) + fieldDur;
    const fieldIndex = new Map(fieldCodes.map((c, i) => [c, i]));

    this.paths.selectAll("path.cs-path").each(function (d) {
      const sel = d3.select(this);
      const L = this.getTotalLength?.() || 1;
      const isSpot = d.code === spot;
      const delay = isSpot ? fieldSpan - 120 : (fieldIndex.get(d.code) || 0) * fieldStagger;
      const dur = isSpot ? 900 : fieldDur;
      sel.attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L)
        .transition().delay(delay).duration(dur)
        .ease(isSpot ? d3.easeCubicInOut : d3.easeCubicOut)
        .attr("stroke-dashoffset", 0);
    });

    // End-dots fade in as each line arrives; spotlight dot overshoots its radius.
    this.paths.selectAll("circle.cs-node--end").style("opacity", 0);
    this.paths.each((d, i, nodes) => {
      const g = d3.select(nodes[i]);
      const isSpot = d.code === spot;
      const base = (isSpot ? fieldSpan - 120 : (fieldIndex.get(d.code) || 0) * fieldStagger) + (isSpot ? 900 : fieldDur) - 120;
      const dot = g.select("circle.cs-node--end");
      dot.transition().delay(base).duration(240).style("opacity", null);
      if (isSpot) {
        const r0 = +dot.attr("r") || 4;
        dot.transition().delay(base).duration(300).ease(d3.easeBackOut).attr("r", r0 * 2).transition().duration(240).attr("r", r0);
      }
    });

    if (this._revealSafety) clearTimeout(this._revealSafety);
    const total = fieldSpan + 900 + 400;
    this._revealSafety = setTimeout(() => {
      if (!this.paths) return;
      this.paths.selectAll("path.cs-path").each(function () {
        const sel = d3.select(this);
        const off = +sel.attr("stroke-dashoffset");
        if (Number.isFinite(off) && off > 1) sel.interrupt().attr("stroke-dasharray", null).attr("stroke-dashoffset", null);
      });
      this.paths.selectAll("circle.cs-node--end").each(function () {
        const sel = d3.select(this);
        if (sel.style("opacity") !== "" && +sel.style("opacity") < 1) sel.interrupt().style("opacity", null);
      });
    }, total);
  }

  // Single source of truth for "which path is the figure right now". Priority:
  // a touch-pinned tap → a mouse hover → the active step's focus. One accessor so
  // colour, arrowheads, labels, the stamp and the reveal never disagree.
  _activeCode() { return this._tapCode || this._hoverCode || this._focusCode || null; }

  _applyFocus() {
    if (!this.paths) return;
    const active = this._activeCode();
    this.paths.classed("is-dim", function () {
      return active ? this.getAttribute("data-code") !== active : false;
    });
    this.paths.classed("is-focus", function () {
      return this.getAttribute("data-code") === active;
    });
    // Swap the arrowhead colour to match focus state: the active path gets the
    // accent head (and gains one even if it wasn't a default-named path), all
    // others revert to their render-time default (named → neutral head, else none).
    const defaultSet = this._defaultLabelCodes;
    this.paths.select("path.cs-path").attr("marker-end", function () {
      const code = this.parentNode.getAttribute("data-code");
      if (code === active) return "url(#cs-arrow-focus)";
      return defaultSet && defaultSet.has(code) ? "url(#cs-arrow-default)" : null;
    });
    // Editorial kicker readout (desktop/tablet only).
    if (this.kickerY && this.kickerSub) {
      if (active) {
        const s = this._series?.find(d => d.code === active);
        this.kickerY.text(s ? s.name : active);
        this.kickerSub.text(this._stepCaption || "");
      } else {
        this.kickerY.text("Wages vs prices");
        this.kickerSub.text(this._stepCaption || "cumulative growth since 2019, per country");
      }
    }
    // Redraw the de-collided end-labels (force-labelling the active country) and
    // the editorial stamp for the active step.
    this._drawEndLabels(active);
    this._drawStamp(active);
  }

  // Redrawable end-label layer with greedy 1-D de-collision + leader lines. The
  // default named set always shows; the active country is force-added. Labels are
  // pushed apart vertically (Greece/Spain, Croatia/Latvia overlapped) and linked
  // back to their true endpoint with a hairline when nudged. The active label is
  // accent + bold; the rest keep the side-colour (sage = pay-won, neutral = lost).
  _drawEndLabels(active) {
    if (!this.paths || !this._scales) return;
    const { x, y, iw, ih } = this._scales;
    const codes = new Set(this._defaultLabelCodes);
    if (active) codes.add(active);
    const last = d => d.pts.at(-1);
    const items = this._series.filter(d => codes.has(d.code)).map(d => {
      const l = last(d);
      return { code: d.code, name: d.name, won: l.wage >= l.price, active: d.code === active,
               x0: x(l.price), y0: y(l.wage) };
    });

    this.g.selectAll(".cs-label-layer").remove();
    const layer = this.g.append("g").attr("class", "cs-label-layer").attr("pointer-events", "none");

    const lineH = this._compact ? 11 : 13.5;
    this._layoutColumn(items, lineH, 4, ih - 2);
    items.forEach(it => {
      if (Math.abs(it.yPos - it.y0) > 1.5) {
        layer.append("line").attr("class", "cs-leader" + (it.active ? " is-active" : ""))
          .attr("x1", it.x0 + 4).attr("y1", it.y0).attr("x2", it.x0 + 11).attr("y2", it.yPos);
      }
      layer.append("text")
        .attr("class", "cs-end-label" + (it.active ? " is-active" : (it.won ? " cs-end-label--won" : " cs-end-label--lost")) + (active && !it.active ? " is-dim" : ""))
        .attr("x", it.x0 + 13).attr("y", it.yPos + 3)
        .text(it.name);
    });
  }

  // Greedy 1-D de-collision: sort by desired y, push down any label overlapping
  // its predecessor by < gap, then shift the stack up if it overran the bottom.
  // Mutates each item with `.yPos`. (Same routine SlopeChart uses.)
  _layoutColumn(items, gap, yMin, yMax) {
    items.sort((p, q) => p.y0 - q.y0);
    let prev = -Infinity;
    items.forEach(it => { const pos = Math.max(it.y0, prev + gap); it.yPos = pos; prev = pos; });
    const overflow = (items.length ? items[items.length - 1].yPos : 0) - yMax;
    if (overflow > 0) items.forEach(it => { it.yPos = Math.max(yMin, it.yPos - overflow); });
  }

  // Editorial stamp for the active STEP (Estonia / Bulgaria) — eyebrow + signed
  // gap as a big italic Fraunces number + a word-wrapped human sentence, anchored
  // in the empty lower-right of the plot with a leader line to the focused
  // endpoint. The number IS the takeaway (how many points pay beat/missed prices),
  // so the step lands a fact, not just a highlight. Hover (no step stamp) shows
  // nothing here — the kicker + tooltip carry it, and a stamp would flicker as the
  // mouse sweeps. Suppressed on phone (no room).
  _drawStamp(active) {
    this.g.selectAll(".cs-stamp, .cs-stamp-leader").remove();
    const stamp = this._stepStamp;
    if (!stamp || this._compact || !this._scales) return;
    if (active !== this._focusCode) return;           // only for the scripted step's own country
    const s = this._series?.find(d => d.code === active);
    if (!s) return;
    const { x, y, iw, ih } = this._scales;
    const l = s.pts.at(-1);
    const gap = l.wage - l.price;                      // signed: + = pay won, − = pay lost
    const ex = x(l.price), ey = y(l.wage);

    // Anchor in the bottom-right corner — the most reliably empty zone in this
    // chart (high prices + modest wages is nearly unpopulated). Height is derived
    // from the wrapped line count so the block always sits fully above the x-axis.
    // A dashed leader ties it to the focused endpoint, so the card reads as "this
    // path's verdict" wherever the path ends.
    const W = Math.min(236, iw * 0.5);
    const lineH = 14;
    const lines = this._wrapLines(stamp.line, W);
    const bodyTop = 56;                                // y of the first body line
    const stampH = bodyTop + (lines.length - 1) * lineH + 6;
    const sx = iw - W;
    const sy = Math.max(8, ih - stampH - 4);

    // Leader first (drawn under the stamp text), from focused endpoint to anchor.
    this.g.append("line").attr("class", "cs-stamp-leader")
      .attr("x1", ex).attr("y1", ey).attr("x2", sx).attr("y2", sy - 2);
    // Stamp group appended after the leader, so its text always sits on top.
    const g = this.g.append("g").attr("class", "cs-stamp").attr("pointer-events", "none")
      .attr("transform", `translate(${sx}, ${sy})`);

    g.append("line").attr("class", "cs-stamp-rule").attr("x1", 0).attr("x2", W).attr("y1", 0).attr("y2", 0);
    g.append("text").attr("class", "cs-stamp-eyebrow").attr("x", 0).attr("y", 15).text(stamp.eyebrow.toUpperCase());
    g.append("text").attr("class", "cs-stamp-num" + (gap >= 0 ? " is-won" : " is-lost"))
      .attr("x", 0).attr("y", 47).text(`${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(0)} pts`);
    const sub = g.append("text").attr("class", "cs-stamp-line").attr("x", 0).attr("y", bodyTop);
    lines.forEach((ln, i) => sub.append("tspan").attr("x", 0).attr("dy", i === 0 ? 0 : lineH).text(ln));
  }

  // Word-wrap a sentence into lines on an estimated char budget from the box width
  // (variable-font widths aren't reliably measurable on first paint, so we don't
  // rely on getComputedTextLength here). Returns the array of lines.
  _wrapLines(str, boxW) {
    const charW = 5.6;                                 // ~px per char at the stamp body size
    const max = Math.max(8, Math.floor(boxW / charW));
    const words = str.split(/\s+/);
    const lines = []; let cur = "";
    words.forEach(w => {
      if ((cur + " " + w).trim().length > max) { if (cur) lines.push(cur); cur = w; }
      else cur = (cur + " " + w).trim();
    });
    if (cur) lines.push(cur);
    return lines;
  }

  onStep(idx) {
    const cfg = STEP_CONFIG[Math.max(0, Math.min(STEP_CONFIG.length - 1, idx))];
    this._focusCode = cfg.focus;
    this._stepCaption = cfg.caption;
    this._stepStamp = cfg.stamp || null;
    this._applyFocus();
  }

  onThemeChange() { this.render(); }
}
