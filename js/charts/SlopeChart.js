/* ============================================================
   SlopeChart — household electricity price H1 2019 → H1 2024 by country.
   Depth:
     1. computation — % change per country, ranks, extremes
     2. interaction — hover any slope to highlight; tooltip shows then/now/Δ
     3. annotation — steepest climbers + flat (capped) exceptions, de-collided
     4. encoding   — two-axis slope, colour by direction + magnitude band
   Values come from DataManager.electricity, which now collapses the mixed-band /
   mixed-currency nrg_pc_204 dump to a median EUR/kWh per (geo, semester). See the
   long note in DataManager._buildIndexes — the raw band split was lost upstream.
   ============================================================ */

import { BaseChart } from "./BaseChart.js";

// Per chapter 6 narrative: step 0 idle (the protagonist climbers already carry
// the story), step 1 names the steepest climbs, step 2 the flat / capped Iberia.
// Focus codes are validated against the data at render time (see _resolveFocus);
// any code missing from the EUR-median series is dropped so a stale pick can never
// silently highlight nothing.
const STEP_CONFIG = [
  { focus: null,               kicker: "Some bills doubled", caption: "Each line one country. Steepest = hardest hit." },
  { focus: ["LT", "CZ", "AT"], kicker: "Baltic + Central",   caption: "Lithuania, Czechia, Austria climbed hardest — gas-fired power, low starting base." },
  { focus: ["ES", "PT"],       kicker: "Iberia held",        caption: "The EU-approved gas-price cap fed into Iberian electricity from mid-2022 — barely a rise." }
];

// The idle protagonists: the three steepest risers carry the headline even before
// any step focus. Resolved against the live ranking at render time, never hardcoded.
const IDLE_TOP_N = 3;

export class SlopeChart extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 96, right: 150, bottom: 30, left: 150 }, aspect: 1.1 });
    this._focusCodes = STEP_CONFIG[0].focus;     // idle state (no scroll yet)
    this._stepCaption = STEP_CONFIG[0].caption;
    this._stepKicker = STEP_CONFIG[0].kicker;
    this._topRisers = new Set();   // idle protagonists (steepest risers)
    // [R3 motion · #A] Last step index actually applied by onStep. scrollama
    // re-fires onStepEnter on boundary jitter AND on every reverse-scroll
    // re-entry of the SAME step; without this guard each re-fire tears down +
    // rebuilds the whole label layer and runs _fitKicker (two forced reflows)
    // for an identical result. Sentinel = "nothing applied yet" so the first
    // onStep after every render() always paints. render() resets it (SVG wiped).
    this._appliedStep = undefined;
  }

  // Margins must adapt: on a phone the fixed 150px side gutters consumed the
  // whole plot. Scale the side room to the available width so labels still fit
  // but the slopes get real horizontal space.
  _computeMargin(width) {
    const narrow = width < 560;
    const side = narrow ? Math.max(64, Math.round(width * 0.20)) : 150;
    return { top: narrow ? 84 : 96, right: side, bottom: 30, left: side };
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
    // [R3 motion · #A] SVG is wiped below — invalidate the applied-step cache so
    // the next onStep re-paints the kicker/labels onto the fresh SVG (theme
    // change, resize, and remount all route through render()).
    this._appliedStep = undefined;
    // Recompute responsive margins BEFORE the svg/inner size is read.
    const w0 = this.container.clientWidth || 600;
    this.opts.margin = this._computeMargin(w0);
    this._narrow = w0 < 560;
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    const { width: iw, height: ih } = this.innerSize();
    this._iw = iw;

    // Two H1 readings: H1 2019 vs H1 2024 (fall back to 2023-S2 if 2024 missing).
    const t0 = "2019-S1", t1 = "2024-S1";
    const rows = [];
    this.data.countriesByCode.forEach((meta, code) => {
      const a = this.data.electricity[code]?.[t0];
      const b = this.data.electricity[code]?.[t1] ?? this.data.electricity[code]?.["2023-S2"];
      if (a != null && b != null) {
        rows.push({ code, name: meta.name, a, b, pct: ((b - a) / a) * 100 });
      }
    });
    rows.sort((x, y) => y.pct - x.pct);
    this._rows = rows;

    // Idle protagonists — the steepest risers carry the headline before any step
    // focus, so the resting state already reads as a story (Reuters slopegraph).
    this._topRisers = new Set(rows.filter(d => d.pct > 0).slice(0, IDLE_TOP_N).map(d => d.code));

    const y = d3.scaleLinear()
      .domain([d3.min(rows, d => Math.min(d.a, d.b)) * 0.95, d3.max(rows, d => Math.max(d.a, d.b)) * 1.05])
      .range([ih, 0]);
    this._y = y;

    // Direction encoding (colourblind-safe, never red/green):
    //   • risers  → calm warm ink (context) — the field
    //   • fallers → steel blue (--seq-target): cool, "this bill got cheaper"
    //   • spotlight (idle top-3, or the step focus) → terracotta accent (figure)
    // Accent is reserved for the protagonist so it never loses its meaning.
    const colorFor = (d, spotlight) =>
      spotlight ? "var(--accent)"
        : d.pct < 0 ? "var(--seq-target)"
        : "var(--ink-faint)";
    this._colorFor = colorFor;

    // Kicker (top-left). The redundant top-right legend was removed — it
    // overprinted this sub-caption. The unit now lives only here + the subtitle.
    this.kickerG = this.svg.append("g").attr("class", "year-kicker-g").attr("pointer-events", "none");
    this.kickerY = this.kickerG.append("text").attr("class", "year-kicker")
      .attr("x", this.opts.margin.left).attr("y", this._narrow ? 46 : 50).text("€ / kWh");
    this.kickerSub = this.kickerG.append("text").attr("class", "year-kicker-sub")
      .attr("x", this.opts.margin.left + 3).attr("y", this._narrow ? 66 : 74)
      .text(this._stepCaption || "household electricity, H1 2019 → H1 2024");

    // Top-right direction key (legend-title language). Small, right-aligned,
    // above the plot — never overprints the kicker sub which sits far left.
    this._drawDirectionKey();

    // axes
    this.g.append("text").attr("class", "slope-axis-label")
      .attr("x", 0).attr("y", -8).text("H1 2019");
    this.g.append("text").attr("class", "slope-axis-label")
      .attr("x", iw).attr("y", -8).attr("text-anchor", "end").text("H1 2024");

    this.g.append("line").attr("class", "slope-axis-rule")
      .attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", ih);
    this.g.append("line").attr("class", "slope-axis-rule")
      .attr("x1", iw).attr("x2", iw).attr("y1", 0).attr("y2", ih);

    // Y-axis ticks (price label)
    [0.10, 0.20, 0.30, 0.40, 0.50].forEach(v => {
      if (v > y.domain()[0] && v < y.domain()[1]) {
        this.g.append("line").attr("class", "slope-y-tick")
          .attr("x1", -4).attr("x2", 0).attr("y1", y(v)).attr("y2", y(v));
        this.g.append("text").attr("class", "slope-y-label")
          .attr("x", -8).attr("y", y(v) + 3).attr("text-anchor", "end").text(`€${v.toFixed(2)}`);
      }
    });

    // draw slopes — colour/weight/opacity are set by _paintSlopes (driven by the
    // current spotlight set) so figure-ground stays in sync with labels + motion.
    this.slopes = this.g.selectAll("g.slope").data(rows).join("g")
      .attr("class", "slope").attr("data-code", d => d.code)
      .style("cursor", "pointer");
    this.slopes.append("line").attr("class", "slope-line")
      .attr("x1", 0).attr("x2", iw).attr("y1", d => y(d.a)).attr("y2", d => y(d.b))
      .attr("fill", "none");
    this.slopes.append("circle").attr("class", "slope-dot slope-dot--a")
      .attr("cx", 0).attr("cy", d => y(d.a))
      .attr("fill", "var(--bg-elev)").attr("stroke-width", 1.5);
    this.slopes.append("circle").attr("class", "slope-dot slope-dot--b")
      .attr("cx", iw).attr("cy", d => y(d.b));

    // Curated label set: top-3 climbers + bottom-3 (phone: 2 + 2), de-collided,
    // with leader lines. Right labels always carry the static % change so the
    // key number is keyboard/touch/screenshot accessible (WCAG 1.4.13) — not
    // hover-only. Focus codes are merged in by _applyFocus at step time.
    const k = this._narrow ? 2 : 3;
    this._baseLabelCodes = new Set(
      [rows.slice(0, k).map(d => d.code), rows.slice(-k).map(d => d.code)].flat()
    );

    // hover
    this.slopes.on("mouseenter", (e, d) => {
      this._hoverCode = d.code;
      this._applyFocus();
      this.ctx.tooltip.show(
        `<h5>${d.name}</h5>
         <div class="row"><span class="key">H1 2019</span><span class="val">€${d.a.toFixed(3)}/kWh</span></div>
         <div class="row"><span class="key">H1 2024</span><span class="val">€${d.b.toFixed(3)}/kWh</span></div>
         <div class="row"><span class="key">Change</span><span class="val">${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(1)}%</span></div>`,
        e.clientX, e.clientY);
    })
    .on("mousemove", e => this.ctx.tooltip.move(e.clientX, e.clientY))
    .on("mouseleave", () => {
      this._hoverCode = null;
      this._applyFocus();
      this.ctx.tooltip.hide();
    });

    // Paint the resting state, then reveal with a two-phase trace.
    this._paintSlopes();
    this._initialReveal();
    this._applyFocus();

    // Variable fonts may not be measurable on first paint (getComputedTextLength
    // returns 0), so the kicker can't be sized against the direction key yet.
    // Re-fit once fonts settle so the kicker never overprints the key.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (this.rendered && this.kickerY) this._fitKicker(); });
    }
  }

  // The codes that are the figure (terracotta + emphasised) right now. Priority:
  // hover (single) → step focus → idle top-3 risers. One source of truth so
  // colour, stroke weight, opacity and labels never disagree.
  _spotlightSet() {
    if (this._hoverCode) return new Set([this._hoverCode]);
    const focus = this._resolveFocus();
    if (focus.length) return new Set(focus);
    return new Set(this._topRisers);
  }

  // Two-phase reveal that *reveals structure*: the calm field traces in first and
  // fast; the spotlight climbers trace last, slower, so the story lands after its
  // context. Reduced-motion shows the static end-state (gated below).
  _initialReveal() {
    if (!this.slopes) return;
    if (this.ctx.motion.reduced) return;
    const spot = this._spotlightSet();
    const fieldRows = this._rows.filter(d => !spot.has(d.code));
    const spotRows  = this._rows.filter(d =>  spot.has(d.code));
    const fieldStagger = 14, fieldDur = 520;
    const fieldSpan = fieldStagger * Math.max(0, fieldRows.length - 1) + fieldDur;
    const fieldIndex = new Map(fieldRows.map((d, i) => [d.code, i]));
    const spotIndex  = new Map(spotRows.map((d, i) => [d.code, i]));

    this.slopes.selectAll("line.slope-line").each((d, i, nodes) => {
      const sel = d3.select(nodes[i]);
      const L = Math.hypot(+sel.attr("x2") - +sel.attr("x1"), +sel.attr("y2") - +sel.attr("y1"));
      const isSpot = spot.has(d.code);
      const delay = isSpot
        ? fieldSpan - 120 + (spotIndex.get(d.code) || 0) * 90
        : (fieldIndex.get(d.code) || 0) * fieldStagger;
      const dur = isSpot ? 780 : fieldDur;
      sel.attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L)
        .transition().delay(delay).duration(dur)
        .ease(isSpot ? d3.easeCubicInOut : d3.easeCubicOut)
        .attr("stroke-dashoffset", 0);
    });
    // Endpoint dots fade in after their line settles; the 2024 (right) spotlight
    // dot gets a brief radius overshoot — the "arrival" beat.
    this.slopes.selectAll("circle.slope-dot").style("opacity", 0);
    this.slopes.each((d, i, nodes) => {
      const g = d3.select(nodes[i]);
      const isSpot = spot.has(d.code);
      const base = isSpot ? fieldSpan + (spotIndex.get(d.code) || 0) * 90 + 360 : (fieldIndex.get(d.code) || 0) * fieldStagger + 360;
      g.selectAll("circle.slope-dot").transition().delay(base).duration(260).style("opacity", 1);
      if (isSpot) {
        const r = this._narrow ? 3.5 : 4;
        g.select("circle.slope-dot--b").transition().delay(base).duration(300).ease(d3.easeBackOut)
          .attr("r", r * 1.9).transition().duration(220).attr("r", r);
      }
    });

    // Safety net — same rAF-stall pattern as other charts
    const total = fieldSpan + spotRows.length * 90 + 1100;
    if (this._revealSafety) clearTimeout(this._revealSafety);
    this._revealSafety = setTimeout(() => {
      if (!this.slopes) return;
      this.slopes.selectAll("line.slope-line").each(function () {
        const sel = d3.select(this);
        const off = +sel.attr("stroke-dashoffset");
        if (Number.isFinite(off) && off > 1) sel.interrupt().attr("stroke-dasharray", null).attr("stroke-dashoffset", null);
      });
      this.slopes.selectAll("circle.slope-dot").each(function () {
        const sel = d3.select(this);
        if (sel.style("opacity") !== "1") sel.interrupt().style("opacity", 1);
      });
    }, total);
  }

  // Keep only focus codes that actually exist in the rendered (EUR-median) data,
  // so a stale STEP_CONFIG pick can never dim everything to nothing.
  _resolveFocus() {
    const f = this._focusCodes;
    if (!f || !f.length || !this._rows) return [];
    const present = new Set(this._rows.map(r => r.code));
    return f.filter(c => present.has(c));
  }

  // Paint stroke colour, weight + opacity and dot fills from the current spotlight.
  // Spotlight = terracotta + thicker + full opacity; everything else = its calm
  // direction colour, thin, and dimmed when a spotlight is active.
  _paintSlopes() {
    if (!this.slopes) return;
    const spot = this._spotlightSet();
    const active = spot.size > 0 && spot.size < this._rows.length;
    this.slopes.each((d, i, nodes) => {
      const g = d3.select(nodes[i]);
      const isSpot = spot.has(d.code);
      const col = this._colorFor(d, isSpot);
      g.select("line.slope-line")
        .attr("stroke", col)
        .attr("stroke-width", isSpot ? 2.6 : 1.4);
      g.selectAll("circle.slope-dot").attr("r", isSpot ? (this._narrow ? 3.5 : 4) : 3);
      g.select("circle.slope-dot--a").attr("stroke", col);
      g.select("circle.slope-dot--b").attr("fill", col);
      // Opacity: spotlight always full; field calm; dimmed further when a focus
      // narrows the story so the protagonist clearly wins figure-ground.
      g.style("opacity", isSpot ? 1 : active ? 0.2 : 0.62);
    });
  }

  _applyFocus() {
    if (!this.slopes) return;
    const focus = this._resolveFocus();
    const focusSet = this._spotlightSet();
    this._paintSlopes();
    // Re-label so the spotlit countries are always named + de-collided, even if
    // they are not in the always-on top/bottom set.
    this._drawLabels(focusSet);
    // Kicker text — always an editorial phrase (the step kicker), with the unit
    // demoted to the sub-line. Falls back to country names only if a step gave
    // a focus but no short label.
    if (this.kickerY && this.kickerSub) {
      const names = focus.map(c => this._rows?.find(r => r.code === c)?.name).filter(Boolean);
      const label = this._stepKicker || (names.length ? names.slice(0, 2).join(" + ") : "€ / kWh");
      this.kickerY.text(label);
      this.kickerSub.text(this._stepCaption || "household electricity · € / kWh · H1 2019 → 2024");
      this._fitKicker();
    }
  }

  // The focused-name kicker ("Lithuania + Czechia + Austria") can be far wider
  // than the "€ / kWh" default and used to run off the right edge. Shrink the
  // font-size until the rendered text fits the panel width (never below 22px).
  _fitKicker() {
    const node = this.kickerY?.node();
    if (!node) return;
    // Reserve the top-right direction-key zone so the kicker never collides with
    // it (measured at draw time; falls back to a safe constant).
    const keyGutter = this._dirKeyLeft != null
      ? Math.max(0, (this.W || 600) - this._dirKeyLeft + 14)
      : (this._narrow ? 16 : 124);   // no key on narrow → only edge padding
    const avail = (this.W || 600) - this.opts.margin.left - keyGutter;
    this.kickerY.attr("font-size", null);            // reset to CSS default first
    let size = parseFloat(getComputedStyle(node).fontSize) || 58;
    let w = node.getComputedTextLength();
    if (w > avail && w > 0) {
      size = Math.max(22, Math.floor(size * (avail / w)));
      this.kickerY.attr("font-size", size + "px");
    }
  }

  // Top-right direction key: two tiny swatch+label rows ("rose" / "fell") in the
  // legend-title system. Anchored to the right edge, above the plot — it lives in
  // a band the kicker sub (far left) never reaches, so no overprint.
  _drawDirectionKey() {
    // On a phone the panel is ~336px wide — the key would crowd the kicker and
    // steal space the slopes need. Drop it there; the lone blue fallers at the
    // bottom are self-evident, and the spotlight value pairs carry the detail.
    this._dirKeyLeft = null;
    if (this._narrow) return;
    const x = this.W - 16;                       // right edge of the panel
    const yTop = 36;
    const g = this.svg.append("g").attr("class", "slope-dir-key").attr("pointer-events", "none");
    let minLeft = x - 26;
    const row = (yy, col, txt) => {
      g.append("line").attr("class", "slope-dir-key__mark")
        .attr("x1", x - 26).attr("x2", x - 14).attr("y1", yy - 3).attr("y2", yy - 3)
        .attr("stroke", col);
      const t = g.append("text").attr("class", "slope-dir-key__label")
        .attr("x", x - 32).attr("y", yy).attr("text-anchor", "end").text(txt);
      const len = t.node()?.getComputedTextLength?.() || 0;
      minLeft = Math.min(minLeft, x - 32 - len);
    };
    // Key describes the FIELD's direction encoding (always true). Accent =
    // "highlighted" is a universal convention and intentionally not legended, so
    // the key stays honest under every step focus (incl. modest Iberian risers).
    row(yTop, "var(--ink-faint)", "rose");
    row(yTop + 15, "var(--seq-target)", "got cheaper");
    this._dirKeyLeft = minLeft;     // used by _fitKicker to avoid overprint
  }

  // Draw both label columns with vertical de-collision + leader lines.
  // `extra` is an optional Set of codes to label in addition to the base set —
  // these are the SPOTLIGHT codes, which get the full then→now value treatment.
  _drawLabels(extra) {
    if (!this.slopes || !this._y) return;
    const y = this._y, iw = this._iw;
    const spot = extra && extra.size ? extra : new Set(this._topRisers);
    const codes = new Set(this._baseLabelCodes);
    spot.forEach(c => codes.add(c));
    const labeled = this._rows.filter(d => codes.has(d.code));

    // Remove any previous label layer (cheap; runs only on step/hover/render).
    this.g.selectAll(".slope-label-layer").remove();
    const layer = this.g.append("g").attr("class", "slope-label-layer")
      .attr("pointer-events", "none");

    // Spotlight right-labels carry a 2nd mono line (then→now €/kWh) so they need
    // more vertical room; the de-collision gap accounts for that.
    const lineH = this._narrow ? 11 : 13;
    const yTop = y.range()[1], yBot = y.range()[0];   // 0 .. innerHeight
    const fmt = v => v.toFixed(this._narrow ? 2 : 3);

    // RIGHT column: country name + % badge; spotlight adds a mono then→now line.
    const right = labeled.map(d => ({ d, y0: y(d.b), spot: spot.has(d.code) }));
    this._layoutColumn(right, lineH, yTop, yBot, it => it.spot ? lineH + 11 : lineH);
    right.forEach(({ d, yPos, y0, spot: isSpot }) => {
      if (Math.abs(yPos - y0) > 1.5) {
        layer.append("line").attr("class", "slope-leader" + (isSpot ? " is-spot" : ""))
          .attr("x1", iw + 4).attr("y1", y0).attr("x2", iw + 12).attr("y2", yPos);
      }
      const dim = isSpot ? "" : " is-dim";
      layer.append("text")
        .attr("class", "slope-end-label slope-end-label--right" + dim)
        .attr("x", iw + 14).attr("y", yPos + 3)
        .attr("fill", this._colorFor(d, isSpot))
        .text(`${d.name}  ${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(0)}%`);
      if (isSpot) {                       // mono then→now beneath the name
        layer.append("text")
          .attr("class", "slope-value-pair")
          .attr("x", iw + 14).attr("y", yPos + 15)
          .text(`€${fmt(d.a)} → €${fmt(d.b)}`);
      }
    });

    // LEFT column: ONLY the spotlight countries (name + their 2019 €/kWh). The
    // field/bottom countries are already named on the right, so labelling them
    // again on the left only crowded the cheap-end cluster — Reuters labels the
    // protagonist at both ends, context once.
    const left = this._rows.filter(d => spot.has(d.code)).map(d => ({ d, y0: y(d.a), spot: true }));
    this._layoutColumn(left, lineH + 11, yTop, yBot);
    left.forEach(({ d, yPos, y0 }) => {
      if (Math.abs(yPos - y0) > 1.5) {
        layer.append("line").attr("class", "slope-leader is-spot")
          .attr("x1", -4).attr("y1", y0).attr("x2", -12).attr("y2", yPos);
      }
      layer.append("text")
        .attr("class", "slope-end-label slope-end-label--left")
        .attr("x", -14).attr("y", yPos + 3).attr("text-anchor", "end")
        .attr("fill", this._colorFor(d, true))
        .text(d.name);
      layer.append("text")
        .attr("class", "slope-value-pair slope-value-pair--left")
        .attr("x", -14).attr("y", yPos + 15).attr("text-anchor", "end")
        .text(`€${fmt(d.a)}`);
    });
  }

  // Greedy 1-D de-collision: sort by desired y, then push down any label that
  // overlaps its predecessor by < gap. Clamps into [yMin, yMax]. Mutates items
  // by assigning `.yPos`.
  // `gapFn(prevItem)` may override the minimum gap that an item's predecessor
  // requires (e.g. a two-line spotlight label needs more room beneath it).
  _layoutColumn(items, gap, yMin, yMax, gapFn) {
    items.sort((p, q) => p.y0 - q.y0);
    let prev = -Infinity, prevItem = null;
    items.forEach(it => {
      const g = prevItem && gapFn ? gapFn(prevItem) : gap;
      const pos = Math.max(it.y0, prev + g);
      it.yPos = pos;
      prev = pos; prevItem = it;
    });
    // If the stack ran past the bottom, shift it up (but not above the top).
    const overflow = (items.length ? items[items.length - 1].yPos : 0) - yMax;
    if (overflow > 0) {
      items.forEach(it => { it.yPos = Math.max(yMin, it.yPos - overflow); });
    }
  }

  onStep(idx) {
    const i = Math.max(0, Math.min(STEP_CONFIG.length - 1, idx));
    // [R3 motion · #A] Idempotent re-entry: a re-fire of the step already on
    // screen would rebuild an identical label layer + re-fit the kicker for no
    // visible change. Skip it. Hover paints via _applyFocus directly (not
    // onStep), so this never strands a hover highlight. render() clears the
    // cache, so a genuine step change or a rebuild always repaints.
    if (i === this._appliedStep) return;
    const cfg = STEP_CONFIG[i];
    this._focusCodes = cfg.focus;
    this._stepCaption = cfg.caption;
    this._stepKicker = cfg.kicker;
    this._applyFocus();
    this._appliedStep = i;
  }

  onThemeChange() { this.render(); }
}
