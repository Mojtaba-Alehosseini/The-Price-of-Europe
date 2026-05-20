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
import { watchChapterProgress } from "../modules/ChartMotion.js";

export class DivergingBar extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 16, right: 100, bottom: 24, left: 110 }, aspect: 1.05 });
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const { width, height } = this.ensureSvg();
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

    const yScale = d3.scaleBand().domain(rows.map(r => r.code)).range([0, ih]).padding(0.18);
    const xExt = d3.max(rows, r => Math.abs(r.real)) * 1.1;
    const x = d3.scaleLinear().domain([-xExt, xExt]).range([0, iw]);

    // axes
    this.g.append("line").attr("class", "zero-line")
      .attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", ih);
    this.g.append("g").attr("class", "axis axis--x")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d => (d > 0 ? "+" : "") + d + "%"));
    // bars
    this.bars = this.g.selectAll("g.barg").data(rows, d => d.code).join("g")
      .attr("class", "barg")
      .attr("transform", d => `translate(0,${yScale(d.code)})`);

    this.bars.append("rect").attr("class", d => d.real >= 0 ? "bar bar--pos" : "bar bar--neg")
      .attr("x", d => d.real >= 0 ? x(0) : x(d.real))
      .attr("y", 0).attr("height", yScale.bandwidth())
      .attr("width", 0)   // grows on scroll
      .attr("rx", 2);

    this.bars.append("text").attr("class", "row-label")
      .attr("x", d => d.real >= 0 ? x(0) - 8 : x(0) + 8)
      .attr("text-anchor", d => d.real >= 0 ? "end" : "start")
      .attr("y", yScale.bandwidth() / 2 + 4).attr("font-size", 11)
      .attr("fill", "var(--ink-soft)")
      .text(d => d.name);

    this.bars.append("text").attr("class", "value-label")
      .attr("x", d => x(d.real) + (d.real >= 0 ? 6 : -6))
      .attr("text-anchor", d => d.real >= 0 ? "start" : "end")
      .attr("y", yScale.bandwidth() / 2 + 4).attr("font-size", 11)
      .attr("font-weight", 600)
      .attr("fill", d => d.real >= 0 ? "var(--seq-1)" : "var(--seq-4)")
      .text(d => `${d.real >= 0 ? "+" : ""}${d.real.toFixed(1)}%`);

    // tooltip
    this.bars.on("mouseenter", (e, d) => {
      this.ctx.tooltip.show(
        `<h5>${d.name}</h5>
         <div class="row"><span class="key">Min wage 2019</span><span class="val">€${Math.round(d.w0)}</span></div>
         <div class="row"><span class="key">Min wage 2024</span><span class="val">€${Math.round(d.w1)}</span></div>
         <div class="row"><span class="key">Nominal Δ</span><span class="val">+${d.nominal.toFixed(1)}%</span></div>
         <div class="row"><span class="key">HICP Δ</span><span class="val">+${d.hicp.toFixed(1)}%</span></div>
         <div class="row"><span class="key">Real Δ</span><span class="val" style="color:${d.real >= 0 ? "var(--seq-1)" : "var(--seq-4)"}">${d.real >= 0 ? "+" : ""}${d.real.toFixed(1)}%</span></div>`,
        e.clientX, e.clientY);
    })
    .on("mousemove", e => this.ctx.tooltip.move(e.clientX, e.clientY))
    .on("mouseleave", () => this.ctx.tooltip.hide());

    // scroll-tied bar grow
    const chapter = this.container.closest(".chapter");
    this._unsub && this._unsub();
    this._unsub = watchChapterProgress(chapter, (p) => {
      const t = Math.max(0, Math.min(1, (p - 0.05) / 0.45));
      this.bars.select("rect").attr("width", d => {
        const w = Math.abs(x(d.real) - x(0)) * t;
        return w;
      });
    });
  }
}
