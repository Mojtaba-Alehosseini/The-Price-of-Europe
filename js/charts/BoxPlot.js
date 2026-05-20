/* ============================================================
   BoxPlot — yearly distribution of EU country annual inflation rates.
   One box per year, with median, IQR, whiskers, outliers.
   Depth:
     1. computation — q1/median/q3/iqr/whiskers per year
     2. interaction — hover box → list outliers + summary
     3. annotation — widest box (2022), narrowest (2020)
     4. encoding   — boxplot
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { watchChapterProgress } from "../modules/ChartMotion.js";

export class BoxPlot extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 30, right: 30, bottom: 32, left: 50 }, aspect: 1.3 });
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const { width, height } = this.ensureSvg();
    const { width: iw, height: ih } = this.innerSize();

    const years = this.data.yearsCP00().filter(y => y >= 2015);
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

    const x = d3.scaleBand().domain(years).range([0, iw]).padding(0.35);
    const yDom = [
      d3.min(stats, s => Math.min(s.minIn, ...s.outliers.map(o => o.v))) - 1,
      d3.max(stats, s => Math.max(s.maxIn, ...s.outliers.map(o => o.v))) + 1
    ];
    const y = d3.scaleLinear().domain(yDom).range([ih, 0]).nice();

    // axes + grid
    this.g.append("g").attr("class", "grid").call(d3.axisLeft(y).tickSize(-iw).ticks(6).tickFormat(""));
    this.g.append("g").attr("class", "axis axis--y").call(d3.axisLeft(y).ticks(6).tickFormat(d => d + "%"));
    this.g.append("g").attr("class", "axis axis--x").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).tickFormat(d => d));
    // ECB target
    this.g.append("line").attr("class", "ref-line")
      .attr("x1", 0).attr("x2", iw).attr("y1", y(2)).attr("y2", y(2))
      .attr("stroke", "var(--seq-target)").attr("stroke-dasharray", "3 4");

    // boxes
    const w = x.bandwidth();
    this.boxes = this.g.selectAll("g.box").data(stats, d => d.year).join("g").attr("class", "box")
      .attr("transform", d => `translate(${x(d.year)}, 0)`);

    // whiskers
    this.boxes.append("line").attr("class", "box-whisker").attr("x1", w / 2).attr("x2", w / 2).attr("y1", d => y(d.minIn)).attr("y2", d => y(d.maxIn));
    this.boxes.append("line").attr("class", "box-whisker").attr("x1", w * 0.25).attr("x2", w * 0.75).attr("y1", d => y(d.maxIn)).attr("y2", d => y(d.maxIn));
    this.boxes.append("line").attr("class", "box-whisker").attr("x1", w * 0.25).attr("x2", w * 0.75).attr("y1", d => y(d.minIn)).attr("y2", d => y(d.minIn));

    // box
    this.boxes.append("rect").attr("class", "box-rect")
      .attr("x", 0).attr("width", w)
      .attr("y", d => y(d.q3)).attr("height", d => y(d.q1) - y(d.q3))
      .attr("fill", "var(--bg-elev)").attr("stroke", "var(--ink-soft)").attr("stroke-width", 1);

    // median
    this.boxes.append("line").attr("class", "box-median")
      .attr("x1", 0).attr("x2", w)
      .attr("y1", d => y(d.med)).attr("y2", d => y(d.med));

    // outliers
    this.boxes.each(function(d) {
      const sel = d3.select(this);
      d.outliers.forEach(o => {
        sel.append("circle").attr("class", "box-outlier")
          .attr("cx", w / 2 + (Math.random() - 0.5) * w * 0.5)
          .attr("cy", y(o.v)).attr("r", 3);
      });
    });

    // annotations — widest box (2022) and narrowest
    const widest = d3.greatest(stats, s => s.q3 - s.q1);
    if (widest) {
      this.g.append("text").attr("x", x(widest.year) + w / 2).attr("y", y(widest.q3) - 10)
        .attr("text-anchor", "middle").attr("font-size", 11).attr("font-weight", 600)
        .attr("fill", "var(--accent)").text("widest spread");
    }

    // hover
    this.boxes.style("cursor", "pointer").on("mouseenter", (e, d) => {
      this.boxes.style("opacity", x => x === d ? 1 : 0.4);
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
    .on("mouseleave", () => { this.boxes.style("opacity", 1); this.ctx.tooltip.hide(); });

    // scroll-tied stagger reveal
    const chapter = this.container.closest(".chapter");
    this._unsub && this._unsub();
    this._unsub = watchChapterProgress(chapter, (p) => {
      this.boxes.each(function(d, i) {
        const start = i * 0.05;
        const t = Math.max(0, Math.min(1, (p - start) / 0.4));
        d3.select(this).style("opacity", t);
      });
    });
  }
}
