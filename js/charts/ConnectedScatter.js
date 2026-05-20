/* ============================================================
   ConnectedScatter — wage growth vs price growth, per country, 2019→2024
   Depth:
     1. computation — cumulative HICP + cumulative wage per year, year-by-year
     2. interaction — hover a country line to highlight + fade rest
     3. annotation — 45° "break-even" diagonal + winners/losers regions
     4. encoding   — paths in 2D, arrowhead at terminal year
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { tracePath, watchChapterProgress } from "../modules/ChartMotion.js";

export class ConnectedScatter extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 24, right: 90, bottom: 40, left: 60 }, aspect: 1.05 });
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const { width, height } = this.ensureSvg();
    const { width: iw, height: ih } = this.innerSize();

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

    const allPts = series.flatMap(s => s.pts);
    const x = d3.scaleLinear().domain([0, d3.max(allPts, d => d.price) * 1.05]).range([0, iw]).nice();
    const y = d3.scaleLinear().domain([0, d3.max(allPts, d => d.wage) * 1.05]).range([ih, 0]).nice();

    // gridlines + axes
    this.g.append("g").attr("class", "grid").call(d3.axisLeft(y).tickSize(-iw).ticks(6).tickFormat(""));
    this.g.append("g").attr("class", "axis axis--x").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).tickFormat(d => d + "%"));
    this.g.append("g").attr("class", "axis axis--y").call(d3.axisLeft(y).tickFormat(d => d + "%"));
    this.g.append("text").attr("x", iw / 2).attr("y", ih + 34).attr("text-anchor", "middle")
      .attr("font-size", 11).attr("fill", "var(--ink-faint)").attr("text-transform", "uppercase").attr("letter-spacing", "0.06em")
      .text("Cumulative prices since 2019, %");
    this.g.append("text").attr("transform", `translate(-44, ${ih / 2}) rotate(-90)`).attr("text-anchor", "middle")
      .attr("font-size", 11).attr("fill", "var(--ink-faint)").attr("text-transform", "uppercase").attr("letter-spacing", "0.06em")
      .text("Cumulative wages, %");

    // diagonal break-even
    const xMax = x.domain()[1], yMax = y.domain()[1];
    const m = Math.min(xMax, yMax);
    this.g.append("line").attr("class", "ref-line")
      .attr("x1", x(0)).attr("y1", y(0)).attr("x2", x(m)).attr("y2", y(m))
      .attr("stroke", "var(--ink-faint)").attr("stroke-dasharray", "3 4");
    this.g.append("text").attr("x", x(m) - 6).attr("y", y(m) - 6).attr("text-anchor", "end")
      .attr("font-size", 11).attr("fill", "var(--ink-faint)").text("break-even");

    // shaded regions: above = pay won, below = prices won
    this.g.append("polygon")
      .attr("points", `${x(0)},${y(0)} ${x(m)},${y(m)} ${x(0)},${y(m)}`)
      .attr("fill", "var(--seq-1)").attr("fill-opacity", 0.05);
    this.g.append("polygon")
      .attr("points", `${x(0)},${y(0)} ${x(m)},${y(m)} ${x(m)},${y(0)}`)
      .attr("fill", "var(--seq-4)").attr("fill-opacity", 0.05);

    // paths
    const line = d3.line().x(d => x(d.price)).y(d => y(d.wage)).curve(d3.curveMonotoneX);
    this.paths = this.g.selectAll("g.cs-line").data(series, d => d.code).join("g").attr("class", "cs-line");

    this.paths.append("path").attr("class", "cs-path")
      .attr("d", d => line(d.pts))
      .attr("stroke", "var(--ink-faint)").attr("stroke-opacity", 0.45);

    // start dot
    this.paths.append("circle").attr("class", "cs-node cs-node--start")
      .attr("cx", d => x(d.pts[0].price)).attr("cy", d => y(d.pts[0].wage)).attr("r", 2.5);

    // end dot
    this.paths.append("circle").attr("class", "cs-node cs-node--end")
      .attr("cx", d => x(d.pts.at(-1).price)).attr("cy", d => y(d.pts.at(-1).wage)).attr("r", 4);

    // end labels for select countries
    const last = d => d.pts.at(-1);
    const distance = d => Math.abs(last(d).wage - last(d).price);
    const ranked = series.slice().sort((a, b) => distance(b) - distance(a));
    const labelCodes = new Set(ranked.slice(0, 5).map(d => d.code).concat(["DE", "FR", "ES"]));
    this.paths.filter(d => labelCodes.has(d.code))
      .append("text").attr("class", "end-label")
      .attr("x", d => x(last(d).price) + 6).attr("y", d => y(last(d).wage) + 3)
      .attr("font-size", 11).attr("font-weight", 600)
      .attr("fill", d => last(d).wage >= last(d).price ? "var(--seq-1)" : "var(--seq-4)")
      .text(d => d.name);

    // hover
    this.paths.style("cursor", "pointer").on("mouseenter", (e, d) => {
      this.paths.style("opacity", x => x === d ? 1 : 0.15);
      d3.select(e.currentTarget).select(".cs-path").attr("stroke", "var(--accent)").attr("stroke-opacity", 0.9).attr("stroke-width", 2.2);
      const html = `<h5>${d.name}</h5>` + d.pts.map(p => `<div class="row"><span class="key">${p.year}</span><span class="val">+${p.price.toFixed(1)}% prices · +${p.wage.toFixed(1)}% wages</span></div>`).join("");
      this.ctx.tooltip.show(html, e.clientX, e.clientY);
    })
    .on("mousemove", e => this.ctx.tooltip.move(e.clientX, e.clientY))
    .on("mouseleave", () => {
      this.paths.style("opacity", 1).select(".cs-path").attr("stroke", "var(--ink-faint)").attr("stroke-opacity", 0.45).attr("stroke-width", 1.6);
      this.ctx.tooltip.hide();
    });

    // scroll-tied path trace
    const chapter = this.container.closest(".chapter");
    this._unsub && this._unsub();
    this._unsub = watchChapterProgress(chapter, (p) => {
      const t = Math.max(0, Math.min(1, (p - 0.1) / 0.5));
      this.paths.selectAll("path.cs-path").each(function() {
        const L = this.getTotalLength();
        d3.select(this).attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L * (1 - t));
      });
    });
  }
}
