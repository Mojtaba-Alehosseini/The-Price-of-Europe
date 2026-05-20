/* ============================================================
   Ridgeline — distribution of EU country inflation rates per year.
   Depth:
     1. computation — KDE per year across 27 countries
     2. interaction — hover a ridge → highlight + tooltip with year stats
     3. annotation — labels for Estonia high / France low in 2022
     4. encoding   — density ridges across time axis
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { staggerReveal, watchChapterProgress } from "../modules/ChartMotion.js";

export class Ridgeline extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 20, right: 80, bottom: 36, left: 50 }, aspect: 1.4 });
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const { width, height } = this.ensureSvg();
    const { width: iw, height: ih } = this.innerSize();

    const years = this.data.yearsCP00().filter(y => y >= 2015);
    const eu = this.data.euAggregateCode();

    // gather samples per year
    const samples = years.map(y => {
      const vals = [];
      this.data.countriesByCode.forEach((meta, code) => {
        const v = this.data.hicpAnnual[code]?.CP00?.[String(y)];
        if (v != null && Number.isFinite(v)) vals.push({ code, v });
      });
      return { year: y, vals };
    });

    // x scale: rate value
    const minV = -2, maxV = Math.ceil(Math.max(...samples.flatMap(s => s.vals.map(d => d.v)))) + 1;
    const x = d3.scaleLinear().domain([minV, maxV]).range([0, iw]);
    const y = d3.scalePoint().domain(years).range([0, ih - 16]).padding(0.5);

    const pal = this.palette();
    const colorByYear = d3.scaleSequential(d3.interpolateRgbBasis([pal.seq[1], pal.seq[2], pal.seq[3], pal.seq[4]]))
      .domain([years[0], years.at(-1)]);

    // KDE
    const kde = kernelDensityEstimator(epanechnikov(1.6), d3.range(minV, maxV + 1, 0.4));

    // Gridlines + axis
    this.g.append("g").attr("class", "axis axis--x")
      .attr("transform", `translate(0,${ih - 8})`)
      .call(d3.axisBottom(x).tickFormat(d => d + "%"));
    this.g.append("text").attr("class", "axis-label")
      .attr("x", iw / 2).attr("y", ih + 30).attr("text-anchor", "middle")
      .attr("fill", "var(--ink-faint)").attr("font-size", 11).attr("text-transform", "uppercase")
      .text("Annual inflation %");

    // ECB target reference
    this.g.append("line").attr("class", "ref-line")
      .attr("x1", x(2)).attr("x2", x(2)).attr("y1", 0).attr("y2", ih - 8)
      .attr("stroke", "var(--seq-target)").attr("stroke-opacity", 0.5);
    this.g.append("text").attr("x", x(2) + 4).attr("y", 12)
      .attr("fill", "var(--seq-target)").attr("font-size", 11).text("ECB 2 %");

    // Build ridges
    this.ridges = this.g.selectAll("g.ridge").data(samples).join("g")
      .attr("class", "ridge")
      .attr("transform", d => `translate(0, ${y(d.year)})`)
      .style("opacity", 0);

    const area = d3.area()
      .x(d => x(d[0]))
      .y0(0).y1(d => -d[1] * 360)
      .curve(d3.curveBasis);

    const dataMgr = this.data;
    this.ridges.each(function(s) {
      const sel = d3.select(this);
      const density = kde(s.vals.map(d => d.v));
      sel.append("path").attr("class", "ridge-area")
        .attr("fill", colorByYear(s.year))
        .attr("d", area(density));
      sel.append("line").attr("class", "ridge-baseline")
        .attr("x1", 0).attr("x2", iw);
      sel.append("text").attr("class", "ridge-label")
        .attr("x", -10).attr("y", 4).attr("text-anchor", "end")
        .attr("font-weight", 600).attr("fill", "var(--ink)").attr("font-size", 12)
        .text(s.year);
      // peak + bottom outliers for high-spread years
      const mx = d3.greatest(s.vals, v => v.v);
      const mn = d3.least(s.vals, v => v.v);
      if (s.year === 2022 && mx && mn) {
        sel.append("text").attr("x", x(mx.v) + 4).attr("y", -4)
          .attr("font-size", 10).attr("fill", "var(--seq-4)").attr("font-weight", 600)
          .text(`${dataMgr.countryName(mx.code)} ${mx.v.toFixed(1)}%`);
        sel.append("text").attr("x", x(mn.v) - 4).attr("y", -4)
          .attr("font-size", 10).attr("fill", "var(--seq-1)").attr("font-weight", 600).attr("text-anchor", "end")
          .text(`${dataMgr.countryName(mn.code)} ${mn.v.toFixed(1)}%`);
      }
    });

    // hover behavior
    this.ridges.on("mouseenter", (event, s) => {
      this.ridges.style("opacity", r => r === s ? 1 : 0.25);
      const sorted = s.vals.slice().sort((a, b) => b.v - a.v);
      const rows = sorted.slice(0, 3).concat(sorted.slice(-2)).map(r =>
        `<div class="row"><span class="key">${this.data.countryName(r.code)}</span><span class="val">${r.v.toFixed(1)}%</span></div>`
      ).join("");
      this.ctx.tooltip.show(`<h5>${s.year}</h5>${rows}`, event.clientX, event.clientY);
    })
    .on("mousemove", e => this.ctx.tooltip.move(e.clientX, e.clientY))
    .on("mouseleave", () => {
      this.ridges.style("opacity", 1);
      this.ctx.tooltip.hide();
    });

    // motion: ridges reveal as chapter scrolls in
    const chapter = this.container.closest(".chapter");
    this._unsub && this._unsub();
    this._unsub = watchChapterProgress(chapter, (p) => {
      // Reveal each ridge with a stagger relative to scroll progress
      this.ridges.each(function(d, i) {
        const start = i * 0.06;
        const t = Math.max(0, Math.min(1, (p - start) / 0.4));
        d3.select(this).style("opacity", t);
      });
    });
  }
}

// ---- KDE helpers --------------------------------------------------
function kernelDensityEstimator(kernel, X) {
  return V => X.map(x => [x, d3.mean(V, v => kernel(x - v))]);
}
function epanechnikov(k) {
  return v => Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
}
