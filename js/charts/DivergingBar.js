/* ============================================================
   DivergingBar — the ledger: how far each minimum wage FELL, and how far it came back.
   Real % = (1+nominal%) / (1+HICP%) - 1

   [P8.2] Rebuilt from ranked bars to a per-country DUMBBELL. A bar from zero could only ever
   say where a country ended; the story of these six years is that almost everyone went under
   and almost everyone climbed back, and a single endpoint hides both halves. Each row now
   carries a muted claret dot at that country's worst real position during 2022, a connector,
   and a solid dot at its 2019→2025 endpoint (jade above the line, claret below). One chart
   then holds the dip (17 of 21 under water), the recovery (20 back above), and the one that
   never finished the climb.

   Layout condition (owner, S2): country names live in a FIXED LEFT GUTTER — the Housing/D88
   dot-range pattern — never inside the plot. Trough dots sit left of zero, which is exactly
   where names used to be, so the two would collide on the deepest fallers. The x-domain runs
   from below the deepest trough to above the widest gain, and tools/_tmp-p8-overlap.mjs is the
   commit gate at 1440 and 390.
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { sphereGradient, getCSS } from "../modules/CraftFX.js";

// The headline framing ("N gained / N lost") is rendered as a two-camp header in the
// kicker zone and recomputed from the data — never hard-coded — so it can't drift.
//
// [P7.0] This chapter has ONE step in index.html, so the "pos" (winners) and "neg" (losers)
// entries could never be reached: `onStep` clamps the index to the config's own length, and with
// a single `data-step="0"` the only reachable config is the first. Two dead entries kept a whole
// camp-dimming path looking live — the same shape as the boxplot's unreachable closing stamp
// (D108), minus the visible symptom, since this one merely never ran. `_focus` therefore stays
// null for the chart's whole life, and `_applyFocus` is left in place because the scoreboard rows
// still read it: it is the neutral branch that runs, not dead code.
const STEP_CONFIG = [
  { focus: null }
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Signed % for value tags. Guards the "−0.0%" artefact: anything that rounds to 0.0
// shows a clean "0.0%" (Lithuania is −0.02 → break-even, not a glitchy negative zero).
function fmtSigned(v, d = 1) {
  const r = +v.toFixed(d);
  const sign = r > 0 ? "+" : r < 0 ? "−" : "";   // true minus glyph (U+2212), not hyphen
  return `${sign}${Math.abs(r).toFixed(d)}%`;
}

export class DivergingBar extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 92, right: 132, bottom: 40, left: 120 }, aspect: 1.05 });
    this._focus = null;
  }

  // Phone gets a compact header (no giant Fraunces kicker) so the 21 bars get room.
  get compact() { return (this.container?.clientWidth || 600) < 520; }

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
    // Narrower side gutters + a shorter top band on phone so the dense 21-row stack
    // keeps its height (round-1 pixels showed the bars crushed under the kicker).
    const cmp = this.compact;
    // The left margin IS the name gutter. Phone shows ISO codes (2 glyphs) so it needs a
    // fraction of the desktop width, and the space goes to the plot instead.
    this.opts.margin = cmp
      ? { top: 62, right: 74, bottom: 42, left: 46 }
      // Desktop's right margin carries the endpoint value AND, on the widest gain, the
      // "WIDEST GAIN" eyebrow past it — measured at 1440, that pair needs ~150px beyond the
      // dot, and at 118 the eyebrow ran 8.9px off the panel (caught by _tmp-p8-overlap).
      : { top: 92, right: 140, bottom: 46, left: 124 };
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    const { width: iw, height: ih } = this.innerSize();

    // Real-wage rows come from the shared DataManager computation (same one ScoreMap uses in CH9,
    // so the 15/6 split can never diverge between the ledger and the map — brief "do not fork").
    const rows = this.data.realWageRows();
    // [P8.2] Attach each country's 2022 trough. Countries without one (no 2022 wage or price
    // reading) keep `trough === null` and draw as a lone endpoint dot rather than dropping out.
    const troughs = this.data.realWageTrough2022();
    rows.forEach(r => { const t = troughs.get(r.code); r.trough = t ? t.real : null; r.troughMonth = t ? t.month : null; });
    this._rows = rows;

    // Summary stats — the headline framing is derived, never hard-coded.
    const nPos = rows.filter(r => r.real >= 0).length;
    const nNeg = rows.length - nPos;
    const best = rows[0];                 // top of the sort = widest real gain
    const worst = rows[rows.length - 1];  // bottom = deepest real cut
    if (best) best._extreme = "best";
    if (worst) worst._extreme = "worst";
    this._summary = { nPos, nNeg, best, worst };

    const yScale = d3.scaleBand().domain(rows.map(r => r.code)).range([0, ih]).padding(0.18);
    // [P8.2] Domain spans the whole journey — deepest trough to widest gain — not a symmetric
    // range around zero. The old ±max domain spent half the plot on empty negative space
    // because only one country ends below zero; the troughs now fill it with the story.
    const lo = d3.min(rows, r => Math.min(r.real, r.trough ?? r.real));
    const hi = d3.max(rows, r => Math.max(r.real, r.trough ?? r.real));
    const span = hi - lo;
    const x = d3.scaleLinear().domain([lo - span * 0.06, hi + span * 0.04]).range([0, iw]);
    this._x = x;

    // ── Framing header: the win/loss divide IS the story ──────────────────────
    // Two camps, derived counts, colour-matched to the bars. Replaces the floating
    // "Real wages" kicker (round-1 pixels showed it untethered + crushing the phone).
    this._drawHeader(width, cmp);

    // Top-right unit legend (kept tidy; the colour meaning now lives in the header).
    // Suppressed on phone — it would collide with the compact scoreboard at 390px,
    // and the figure subtitle + axis already carry the unit there.
    if (!cmp) {
      const lg = this.svg.append("g").attr("class", "anno-legend db-unit")
        .attr("transform", `translate(${width - this.opts.margin.right}, 44)`);
      lg.append("text").attr("class", "legend-title")
        .attr("text-anchor", "end").attr("y", 0).text("Real change in the minimum wage");
      lg.append("text").attr("class", "legend-tick db-unit-sub")
        .attr("text-anchor", "end").attr("y", 14).text("2019–2025 (after inflation)");
      // Two-dot key — without it the muted dot reads as decoration rather than a second reading.
      const key = lg.append("g").attr("class", "db-key").attr("transform", "translate(0, 32)");
      key.append("text").attr("class", "legend-tick").attr("text-anchor", "end").attr("x", -84).attr("y", 4).text("worst of 2022");
      key.append("circle").attr("class", "db-dot db-dot--trough").attr("cx", -74).attr("cy", 0).attr("r", 4);
      key.append("text").attr("class", "legend-tick").attr("text-anchor", "end").attr("x", -22).attr("y", 4).text("2025");
      key.append("circle").attr("class", "db-dot db-dot--now db-dot--pos").attr("cx", -10).attr("cy", 0).attr("r", 4.6);
    }

    // axes — fewer ticks on narrow viewports so the %-labels never collide.
    const tickCount = iw < 360 ? 3 : iw < 560 ? 5 : 6;
    this.g.append("g").attr("class", "axis axis--x")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(tickCount).tickFormat(d => (d === 0 ? "0" : (d > 0 ? "+" : "") + d) + "%"));

    // The zero line is the spine of the whole chart — give it weight, run it a touch
    // past the bars, and anchor it with a "broke even" tag below the plot (the one
    // place free of the country labels that straddle x=0).
    this.g.append("line").attr("class", "zero-line db-zero-line")
      .attr("x1", x(0)).attr("x2", x(0)).attr("y1", -6).attr("y2", ih + 4);
    const zAnchor = this.g.append("g").attr("class", "db-zero-anchor")
      .attr("transform", `translate(${x(0)}, ${ih + (cmp ? 30 : 34)})`)
      .attr("pointer-events", "none");
    zAnchor.append("text").attr("class", "db-zero-label").attr("text-anchor", "middle")
      .attr("y", 0).text("BROKE EVEN");
    zAnchor.append("text").attr("class", "db-zero-sub").attr("text-anchor", "middle")
      .attr("y", 11).text("pay = prices");
    // ── rows: a fixed name gutter, then the dumbbell ──────────────────────────
    const bw = yScale.bandwidth();
    const midY = bw / 2;
    this.bars = this.g.selectAll("g.barg").data(rows, d => d.code).join("g")
      .attr("class", d => "barg db-bar" + (d._extreme ? " db-bar--extreme" : ""))
      .attr("data-sign", d => d.real >= 0 ? "pos" : "neg")
      .attr("data-code", d => d.code)
      .attr("transform", d => `translate(0,${yScale(d.code)})`);

    // Names sit OUTSIDE the plot, right-aligned against its left edge (owner's condition):
    // a trough dot at −14% lands where a left-of-zero name used to be.
    this.bars.append("text").attr("class", d => "row-label db-name" + (d._extreme ? " db-name--extreme" : ""))
      .attr("x", -10).attr("text-anchor", "end").attr("y", midY + 4)
      .text(d => cmp ? d.code : d.name);

    // Connector — drawn first so both dots sit on top of it. Grows from the trough.
    this.bars.append("line").attr("class", "db-link")
      .attr("x1", d => x(d.trough ?? d.real)).attr("x2", d => x(d.trough ?? d.real))
      .attr("y1", midY).attr("y2", midY);

    // Trough dot — muted claret, hollow-reading. Absent when a country has no 2022 reading.
    this.bars.filter(d => d.trough != null).append("circle").attr("class", "db-dot db-dot--trough")
      .attr("cx", d => x(d.trough)).attr("cy", midY).attr("r", 0);

    // Endpoint dot — the 2025 position, jade above the line and claret below.
    this.bars.append("circle")
      .attr("class", d => "db-dot db-dot--now " + (d.real >= 0 ? "db-dot--pos" : "db-dot--neg") + (d._extreme ? " db-dot--extreme" : ""))
      .attr("cx", d => x(d.real)).attr("cy", midY).attr("r", 0);

    this.bars.append("text").attr("class", d => (d.real >= 0 ? "value-label db-val db-val--pos" : "value-label db-val db-val--neg") + (d._extreme ? " db-val--extreme" : ""))
      .attr("x", d => x(d.real) + 10)
      .attr("text-anchor", "start")
      .attr("y", midY + 4)
      .attr("opacity", 0)
      .text(d => fmtSigned(d.real));

    // Full-width hit row, so hovering anywhere on a country's line opens its tooltip — the
    // dots alone are a 10px target on a 21-row stack.
    this.bars.append("rect").attr("class", "db-hit")
      .attr("x", -this.opts.margin.left).attr("y", 0)
      .attr("width", this.opts.margin.left + iw).attr("height", bw)
      .attr("fill", "transparent");

    // Editorial emphasis on the two bookends — an eyebrow set just past the value,
    // so the eye lands on "the widest gain" and "the deepest cut" without a floating
    // stamp colliding on this dense 21-row stack. Hidden on phone (no room).
    if (!cmp) {
      this.bars.filter(d => d._extreme).append("text")
        .attr("class", "db-extreme-eyebrow")
        .attr("x", d => x(d.real) + 10 + fmtSigned(d.real).length * 7.6 + 9)
        .attr("text-anchor", "start")
        .attr("y", midY + 3.5)
        .attr("opacity", 0)
        .text(d => d._extreme === "best" ? "WIDEST GAIN" : "DEEPEST CUT");
    }

    this.bars.on("mouseenter", (e, d) => {
      d3.select(e.currentTarget).classed("is-hover", true);
      this.ctx.tooltip.show(
        `<h5>${d.name}</h5>
         <div class="row"><span class="key">Min wage 2019</span><span class="val">${Math.round(d.w0).toLocaleString("en-GB")}</span></div>
         <div class="row"><span class="key">Min wage 2025</span><span class="val">${Math.round(d.w1).toLocaleString("en-GB")}</span></div>
         <div class="row"><span class="key">Nominal Δ</span><span class="val">+${d.nominal.toFixed(1)}%</span></div>
         <div class="row"><span class="key">HICP Δ</span><span class="val">+${d.hicp.toFixed(1)}%</span></div>
         ${d.trough == null ? "" : `<div class="row"><span class="key">Worst month</span><span class="val db-tip-val--${d.trough >= 0 ? "pos" : "neg"}">${MONTHS[+d.troughMonth.slice(5) - 1]} 2022, ${fmtSigned(d.trough)}</span></div>`}
         <div class="row"><span class="key">Real Δ</span><span class="val db-tip-val--${d.real >= 0 ? "pos" : "neg"}">${fmtSigned(d.real)}</span></div>`,
        e.clientX, e.clientY);
    })
    .on("mousemove", e => this.ctx.tooltip.move(e.clientX, e.clientY))
    .on("mouseleave", (e) => { d3.select(e.currentTarget).classed("is-hover", false); this.ctx.tooltip.hide(); });

    // [R5·P11] Median reference line (Burn-Murdoch style-fix) — the TYPICAL country's real change,
    // distinct from the bold zero spine. Most countries gained, so the median sits right of zero.
    const med = d3.median(rows, r => r.real);
    const medG = this.g.append("g").attr("class", "db-median").attr("pointer-events", "none");
    medG.append("line").attr("x1", x(med)).attr("x2", x(med)).attr("y1", -4).attr("y2", ih + 2);
    if (!cmp) medG.append("text").attr("class", "db-median-label").attr("x", x(med)).attr("y", -10)
      .attr("text-anchor", "middle").text(`median ${fmtSigned(med)}`);

    // [R5·P11 / P8.2] Bremer sphere shading on the two bookend ENDPOINTS. Previously these were
    // extra circles floating at each extreme bar's tip; now the endpoint dot exists for every
    // country, so the bookends are simply the two that get a sphere gradient instead of a flat
    // fill. One mark, two levels of finish — no duplicate dot to keep in sync.
    [this._summary.best, this._summary.worst].forEach(d => {
      if (!d) return;
      const col = d.real >= 0 ? getCSS("--cat-wages") : getCSS("--accent");
      this.bars.filter(r => r.code === d.code).select(".db-dot--now")
        .attr("fill", sphereGradient(this.svg, `db-${d._extreme}`, col));
    });

    this._initialReveal();
    this._applyFocus();
  }

  // [R5·P11] Two-camp scoreboard count-up on enter (Bremer). Reduced-motion: numbers are already
  // rendered at their final value by _drawHeader, so this no-ops.
  _countUpHeader() {
    if (this.ctx.motion.reduced || !this.headerG) return;
    const { nPos, nNeg } = this._summary;
    const tween = (sel, target) => sel.each(function () {
      const t = d3.select(this);
      t.transition().duration(820).ease(d3.easeCubicOut).tween("n", () => {
        const i = d3.interpolateRound(0, target); return s => t.text(i(s));
      });
    });
    if (this.compact) {
      tween(this.headerG.selectAll(".db-head-c--pos"), nPos);
      tween(this.headerG.selectAll(".db-head-c--neg"), nNeg);
    } else {
      tween(this.headerG.selectAll(".db-head-num--pos"), nPos);
      tween(this.headerG.selectAll(".db-head-num--neg"), nNeg);
    }
  }

  /** Two-camp scoreboard in the kicker zone — the win/loss divide as the headline.
   *  Big italic-Fraunces counts (sage gained / terra lost) teach the bar colours and
   *  state the takeaway; the active camp brightens as the reader scrolls each step. */
  _drawHeader(width, cmp) {
    const { nPos, nNeg } = this._summary;
    const left = this.opts.margin.left;
    const g = this.svg.append("g").attr("class", "db-header").attr("pointer-events", "none");
    this.headerG = g;

    if (cmp) {
      // Phone: one tight line — "15 gained · 6 lost" — so the bars keep their height.
      const t = g.append("text").attr("class", "db-head-compact").attr("x", left).attr("y", 34);
      t.append("tspan").attr("class", "db-head-c db-head-c--pos").text(nPos);
      t.append("tspan").attr("class", "db-head-cl").text(" gained");
      t.append("tspan").attr("class", "db-head-dot").text("  ·  ");
      t.append("tspan").attr("class", "db-head-c db-head-c--neg").text(nNeg);
      t.append("tspan").attr("class", "db-head-cl").text(" lost");
      this.headRows = null;
      return;
    }

    const rowY = [30, 84];   // wider gap so the two big scoreboard numbers' boxes never touch (§2b)
    const numX = left, labX = left + 56;
    const mk = (i, sign, n, verb, dir) => {
      const row = g.append("g").attr("class", `db-head-row db-head-row--${sign}`).attr("data-sign", sign);
      row.append("text").attr("class", `db-head-num db-head-num--${sign}`)
        .attr("x", numX).attr("y", rowY[i]).text(n);
      const lab = row.append("text").attr("class", "db-head-label").attr("x", labX).attr("y", rowY[i] - 12);
      lab.append("tspan").attr("class", "db-head-strong").text(verb);
      row.append("text").attr("class", "db-head-sub").attr("x", labX).attr("y", rowY[i] + 8)
        .text(sign === "pos" ? "pay outran prices  ▸" : "◂  prices outran pay");
      return row;
    };
    this.headRows = {
      pos: mk(0, "pos", nPos, "gained ground", 1),
      neg: mk(1, "neg", nNeg, "lost ground", -1)
    };
  }

  _initialReveal() {
    if (!this.bars) return;
    const reduced = this.ctx.motion.reduced;
    const x = this._x;
    // [P8.2] The reveal now tells the row's story in its own order: the trough dot lands first
    // (where the country fell to), the connector grows from it, and the endpoint dot arrives at
    // the far end. Reversing that — endpoint first — would read as "here is the result, and here
    // is some history", which is the reading the bar chart already gave.
    if (reduced) {
      this.bars.select(".db-dot--trough").attr("r", 4);
      this.bars.select(".db-link").attr("x2", d => x(d.real));
      this.bars.select(".db-dot--now").attr("r", 5.4);
      this.bars.select(".db-val").attr("opacity", 1);
      this.bars.select(".db-extreme-eyebrow").attr("opacity", 1);
      return;
    }
    this.bars.each(function (d, i) {
      const sel = d3.select(this);
      const t0 = i * 22;
      sel.select(".db-dot--trough").transition().delay(t0).duration(280).ease(d3.easeBackOut).attr("r", 4);
      sel.select(".db-link").transition().delay(t0 + 180).duration(520).ease(d3.easeCubicOut).attr("x2", x(d.real));
      sel.select(".db-dot--now").transition().delay(t0 + 620).duration(300).ease(d3.easeBackOut).attr("r", 5.4);
      sel.select(".db-val").transition().delay(t0 + 760).duration(260).attr("opacity", 1);
      sel.select(".db-extreme-eyebrow").transition().delay(t0 + 900).duration(300).attr("opacity", 1);
    });
    this._countUpHeader();
    if (this._revealSafety) clearTimeout(this._revealSafety);
    const n = this.bars.size();
    this._revealSafety = setTimeout(() => {
      const x2 = this._x;
      this.bars.each(function (d) {
        const sel = d3.select(this);
        const live = +sel.select(".db-link").attr("x2");
        if (!Number.isFinite(live) || Math.abs(live - x2(d.real)) > 1) {
          sel.select(".db-dot--trough").interrupt().attr("r", 4);
          sel.select(".db-link").interrupt().attr("x2", x2(d.real));
          sel.select(".db-dot--now").interrupt().attr("r", 5.4);
          sel.select(".db-val").interrupt().attr("opacity", 1);
          sel.select(".db-extreme-eyebrow").interrupt().attr("opacity", 1);
        }
      });
      // [P3.5] The scoreboard count-up rides the same rAF clock as the bars, so it needs the same
      // safety net: an 820ms interpolateRound that never ticks (background tab / rAF stall) would
      // leave the two headline numbers frozen at 0 while every bar behind them is fully drawn.
      const { nPos, nNeg } = this._summary;
      if (this.headerG) {
        this.headerG.selectAll(".db-head-c--pos,.db-head-num--pos").interrupt().text(String(nPos));
        this.headerG.selectAll(".db-head-c--neg,.db-head-num--neg").interrupt().text(String(nNeg));
      }
    }, n * 22 + 1250);
  }

  _applyFocus() {
    if (!this.bars) return;
    const f = this._focus;
    this.bars.style("opacity", function () {
      const sign = this.getAttribute("data-sign");
      if (!f) return 1;
      return sign === f ? 1 : 0.16;
    });
    // Brighten the active camp's scoreboard row; dim the other (ties scroll → framing).
    if (this.headRows) {
      this.headRows.pos.style("opacity", !f ? 1 : (f === "pos" ? 1 : 0.32));
      this.headRows.neg.style("opacity", !f ? 1 : (f === "neg" ? 1 : 0.32));
    }
  }

  onStep(idx) {
    const cfg = STEP_CONFIG[Math.max(0, Math.min(STEP_CONFIG.length - 1, idx))];
    this._focus = cfg.focus;
    if (this.container) this.container.setAttribute("data-onstep", idx);   // scroll-sync hook (§8.2 probe)
    this._applyFocus();
  }

  // [P3.5] The reveal safety timeout outlives the chart without this.
  destroy() { clearTimeout(this._revealSafety); super.destroy(); }
  onThemeChange() { this.render(); }
}
