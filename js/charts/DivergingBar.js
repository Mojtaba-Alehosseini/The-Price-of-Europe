/* ============================================================
   DivergingBar — real minimum-wage change 2019 → 2024.
   Real % = (1+nominal%) / (1+HICP%) - 1
   Depth:
     1. computation — composes nominal wage change w/ cumulative HICP
     2. interaction — hover bar reveals breakdown
     3. annotation — winners (top 3) + losers (bottom 3) labelled
     4. encoding   — diverging horizontal bars from zero axis
   ============================================================ */

import { BaseChart } from "./BaseChart.js";

// Step focus: null (all), "pos" (winners), "neg" (losers).
// The headline framing ("N gained / N lost") is rendered as a two-camp header in the
// kicker zone and recomputed from the data — never hard-coded — so it can't drift.
const STEP_CONFIG = [
  { focus: null },
  { focus: "pos" },
  { focus: "neg" }
];

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
    this.opts.margin = cmp
      ? { top: 62, right: 86, bottom: 36, left: 92 }
      : { top: 92, right: 132, bottom: 40, left: 120 };
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    const { width: iw, height: ih } = this.innerSize();

    const rows = [];
    this.data.countriesByCode.forEach((meta, code) => {
      if (!meta.minWage) return;
      const w0 = this.data.minWages[code]?.["2019-S1"] ?? this.data.minWages[code]?.["2019-S2"];
      const w1 = this.data.minWages[code]?.["2024-S1"] ?? this.data.minWages[code]?.["2024-S2"] ?? this.data.minWages[code]?.["2023-S2"];
      const p0 = this.data.hicpIndex[code]?.CP00?.["2019-01"];
      const p1 = this.data.hicpIndex[code]?.CP00?.["2024-01"] ?? this.data.hicpIndex[code]?.CP00?.["2023-12"];
      if ([w0, w1, p0, p1].some(v => v == null)) return;
      const nom = ((w1 - w0) / w0);
      const hicp = ((p1 - p0) / p0);
      const real = ((1 + nom) / (1 + hicp) - 1) * 100;
      rows.push({ code, name: meta.name, nominal: nom * 100, hicp: hicp * 100, real, w0, w1 });
    });
    rows.sort((a, b) => b.real - a.real);
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
    const xExt = d3.max(rows, r => Math.abs(r.real)) * 1.1;
    const x = d3.scaleLinear().domain([-xExt, xExt]).range([0, iw]);
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
        .attr("text-anchor", "end").attr("y", 0).text("REAL Δ · 2019 → 2024");
      lg.append("text").attr("class", "legend-tick db-unit-sub")
        .attr("text-anchor", "end").attr("y", 14).text("minimum wage, after inflation");
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
      .attr("transform", `translate(${x(0)}, ${ih + (cmp ? 22 : 26)})`)
      .attr("pointer-events", "none");
    zAnchor.append("text").attr("class", "db-zero-label").attr("text-anchor", "middle")
      .attr("y", 0).text("BROKE EVEN");
    zAnchor.append("text").attr("class", "db-zero-sub").attr("text-anchor", "middle")
      .attr("y", 13).text("pay = prices");
    // bars
    const bw = yScale.bandwidth();
    this.bars = this.g.selectAll("g.barg").data(rows, d => d.code).join("g")
      .attr("class", d => "barg db-bar" + (d._extreme ? " db-bar--extreme" : ""))
      .attr("data-sign", d => d.real >= 0 ? "pos" : "neg")
      .attr("transform", d => `translate(0,${yScale(d.code)})`);

    this.bars.append("rect").attr("class", d => (d.real >= 0 ? "bar bar--pos db-rect" : "bar bar--neg db-rect") + (d._extreme ? " db-rect--extreme" : ""))
      .attr("x", d => d.real >= 0 ? x(0) : x(d.real))
      .attr("y", 0).attr("height", bw)
      .attr("width", 0)   // grows on initial reveal
      .attr("rx", Math.min(2.5, bw / 2));

    this.bars.append("text").attr("class", d => "row-label db-name" + (d._extreme ? " db-name--extreme" : ""))
      .attr("x", d => d.real >= 0 ? x(0) - 7 : x(0) + 7)
      .attr("text-anchor", d => d.real >= 0 ? "end" : "start")
      .attr("y", bw / 2 + 4)
      .text(d => cmp ? d.code : d.name);   // ISO codes on phone — full names overlap bars at 390px

    this.bars.append("text").attr("class", d => (d.real >= 0 ? "value-label db-val db-val--pos" : "value-label db-val db-val--neg") + (d._extreme ? " db-val--extreme" : ""))
      .attr("x", d => x(d.real) + (d.real >= 0 ? 7 : -7))
      .attr("text-anchor", d => d.real >= 0 ? "start" : "end")
      .attr("y", bw / 2 + 4)
      .attr("opacity", 0)
      .text(d => fmtSigned(d.real));

    // Editorial emphasis on the two bookends — an eyebrow set just past the value,
    // so the eye lands on "the widest gain" and "the deepest cut" without a floating
    // stamp colliding on this dense 21-row stack. Hidden on phone (no room).
    if (!cmp) {
      this.bars.filter(d => d._extreme).append("text")
        .attr("class", "db-extreme-eyebrow")
        .attr("x", d => {
          const pad = 7 + fmtSigned(d.real).length * 7.6 + 9;
          return d.real >= 0 ? x(d.real) + pad : x(d.real) - pad;
        })
        .attr("text-anchor", d => d.real >= 0 ? "start" : "end")
        .attr("y", bw / 2 + 3.5)
        .attr("opacity", 0)
        .text(d => d._extreme === "best" ? "WIDEST GAIN" : "DEEPEST CUT");
    }

    this.bars.on("mouseenter", (e, d) => {
      d3.select(e.currentTarget).classed("is-hover", true);
      this.ctx.tooltip.show(
        `<h5>${d.name}</h5>
         <div class="row"><span class="key">Min wage 2019</span><span class="val">€${Math.round(d.w0)}</span></div>
         <div class="row"><span class="key">Min wage 2024</span><span class="val">€${Math.round(d.w1)}</span></div>
         <div class="row"><span class="key">Nominal Δ</span><span class="val">+${d.nominal.toFixed(1)}%</span></div>
         <div class="row"><span class="key">HICP Δ</span><span class="val">+${d.hicp.toFixed(1)}%</span></div>
         <div class="row"><span class="key">Real Δ</span><span class="val db-tip-val--${d.real >= 0 ? "pos" : "neg"}">${fmtSigned(d.real)}</span></div>`,
        e.clientX, e.clientY);
    })
    .on("mousemove", e => this.ctx.tooltip.move(e.clientX, e.clientY))
    .on("mouseleave", (e) => { d3.select(e.currentTarget).classed("is-hover", false); this.ctx.tooltip.hide(); });

    this._initialReveal();
    this._applyFocus();
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

    const rowY = [40, 76];
    const numX = left, labX = left + 56;
    const mk = (i, sign, n, verb, dir) => {
      const row = g.append("g").attr("class", `db-head-row db-head-row--${sign}`).attr("data-sign", sign);
      row.append("text").attr("class", `db-head-num db-head-num--${sign}`)
        .attr("x", numX).attr("y", rowY[i]).text(n);
      const lab = row.append("text").attr("class", "db-head-label").attr("x", labX).attr("y", rowY[i] - 9);
      lab.append("tspan").attr("class", "db-head-strong").text(verb);
      row.append("text").attr("class", "db-head-sub").attr("x", labX).attr("y", rowY[i] + 4)
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
    if (reduced) {
      this.bars.select("rect").attr("width", d => Math.abs(x(d.real) - x(0)));
      this.bars.select(".db-val").attr("opacity", 1);
      this.bars.select(".db-extreme-eyebrow").attr("opacity", 1);
      return;
    }
    this.bars.each(function (d, i) {
      const sel = d3.select(this);
      const targetW = Math.abs(x(d.real) - x(0));
      sel.select("rect").transition().delay(i * 22).duration(660).ease(d3.easeCubicOut)
        .attr("width", targetW);
      sel.select(".db-val").transition().delay(i * 22 + 460).duration(260).attr("opacity", 1);
      sel.select(".db-extreme-eyebrow").transition().delay(i * 22 + 640).duration(300).attr("opacity", 1);
    });
    if (this._revealSafety) clearTimeout(this._revealSafety);
    const n = this.bars.size();
    this._revealSafety = setTimeout(() => {
      const x2 = this._x;
      this.bars.each(function (d) {
        const sel = d3.select(this);
        const targetW = Math.abs(x2(d.real) - x2(0));
        const live = +sel.select("rect").attr("width");
        if (!Number.isFinite(live) || live < targetW - 1) {
          sel.select("rect").interrupt().attr("width", targetW);
          sel.select(".db-val").interrupt().attr("opacity", 1);
          sel.select(".db-extreme-eyebrow").interrupt().attr("opacity", 1);
        }
      });
    }, n * 22 + 700);
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
    this._applyFocus();
  }

  onThemeChange() { this.render(); }
}
