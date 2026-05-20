/* ============================================================
   BumpChart — country rankings of electricity prices, 2019→2024
   Depth:
     1. computation — rank per year from electricity[geo][year-S2]
     2. interaction — hover a country to highlight + tooltip
     3. annotation — Czech climb label, Spain/PT flat label
     4. encoding   — bump chart w/ monotone curves
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { watchChapterProgress } from "../modules/ChartMotion.js";

export class BumpChart extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 30, right: 130, bottom: 30, left: 130 }, aspect: 1.0 });
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const { width, height } = this.ensureSvg();
    const { width: iw, height: ih } = this.innerSize();

    const years = [2019, 2020, 2021, 2022, 2023, 2024];
    // gather mid-year price snapshot per country
    const rows = [];
    this.data.countriesByCode.forEach((meta, code) => {
      const vals = years.map(y => ({
        year: y,
        v: this.data.electricity[code]?.[`${y}-S2`] ?? this.data.electricity[code]?.[`${y}-S1`]
      }));
      if (vals.every(v => v.v != null)) rows.push({ code, name: meta.name, vals });
    });

    // compute ranks per year (1 = most expensive)
    const ranksByYear = {};
    years.forEach(y => {
      const sorted = rows.slice().sort((a, b) => {
        const av = a.vals.find(d => d.year === y).v;
        const bv = b.vals.find(d => d.year === y).v;
        return bv - av;
      });
      ranksByYear[y] = new Map(sorted.map((r, i) => [r.code, i + 1]));
    });

    const x = d3.scalePoint().domain(years).range([0, iw]).padding(0.1);
    const y = d3.scaleLinear().domain([1, rows.length]).range([0, ih]);

    // axes
    this.g.append("g").attr("transform", `translate(0,${ih + 4})`)
      .call(d3.axisBottom(x).tickFormat(d => d))
      .selectAll("text").attr("font-size", 11);

    // build path per country
    const line = d3.line().x(d => x(d.year)).y(d => y(d.rank)).curve(d3.curveMonotoneX);
    const series = rows.map(r => ({
      ...r,
      points: years.map(yr => ({ year: yr, rank: ranksByYear[yr].get(r.code) }))
    }));

    // color: focus 4 "movers"
    const focus = new Set(["CZ", "RO", "ES", "PT", "DE", "FR"]);
    const colorFor = d => focus.has(d.code) ? "var(--accent)" : "var(--ink-faint)";

    this.lines = this.g.selectAll("g.bump").data(series, d => d.code).join("g").attr("class", "bump");
    this.lines.append("path").attr("class", "bump-line")
      .attr("d", d => line(d.points))
      .attr("stroke", colorFor)
      .attr("stroke-opacity", d => focus.has(d.code) ? 0.95 : 0.35)
      .attr("stroke-width", d => focus.has(d.code) ? 2.2 : 1.2);

    // nodes
    this.lines.selectAll("circle.bump-node").data(d => d.points.map(p => ({ ...p, code: d.code, name: d.name }))).join("circle")
      .attr("class", "bump-node")
      .attr("cx", d => x(d.year)).attr("cy", d => y(d.rank))
      .attr("r", 3.2)
      .attr("fill", d => focus.has(d.code) ? "var(--accent)" : "var(--bg-elev)")
      .attr("stroke", d => focus.has(d.code) ? "var(--accent)" : "var(--ink-faint)")
      .attr("stroke-width", 1.2);

    // end labels (left + right)
    this.lines.append("text").attr("class", "bump-label")
      .attr("x", d => x(years[0]) - 8).attr("y", d => y(d.points[0].rank) + 3)
      .attr("text-anchor", "end").attr("font-size", 11)
      .attr("fill", colorFor).attr("font-weight", d => focus.has(d.code) ? 600 : 400)
      .text(d => `${d.points[0].rank}. ${d.name}`);
    this.lines.append("text").attr("class", "bump-label")
      .attr("x", d => x(years.at(-1)) + 8).attr("y", d => y(d.points.at(-1).rank) + 3)
      .attr("font-size", 11)
      .attr("fill", colorFor).attr("font-weight", d => focus.has(d.code) ? 600 : 400)
      .text(d => `${d.points.at(-1).rank}. ${d.name}`);

    // hover
    this.lines.style("cursor", "pointer").on("mouseenter", (e, d) => {
      this.lines.style("opacity", x => x === d ? 1 : 0.15);
      this.ctx.tooltip.show(
        `<h5>${d.name}</h5>` + d.points.map(p =>
          `<div class="row"><span class="key">${p.year}</span><span class="val">#${p.rank}</span></div>`).join(""),
        e.clientX, e.clientY);
    })
    .on("mousemove", e => this.ctx.tooltip.move(e.clientX, e.clientY))
    .on("mouseleave", () => {
      this.lines.style("opacity", 1);
      this.ctx.tooltip.hide();
    });

    // scroll-tied reveal — lines draw left to right with stagger
    const chapter = this.container.closest(".chapter");
    this._unsub && this._unsub();
    this._unsub = watchChapterProgress(chapter, (p) => {
      const t = Math.max(0, Math.min(1, (p - 0.05) / 0.45));
      this.lines.selectAll("path.bump-line").each(function(d) {
        const L = this.getTotalLength();
        d3.select(this).attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L * (1 - t));
      });
    });
  }

  onStep(idx) {
    if (idx === 1) {
      // emphasize Czech line
      this.lines && this.lines.style("opacity", d => d.code === "CZ" ? 1 : 0.2);
    } else if (idx === 2) {
      this.lines && this.lines.style("opacity", d => ["FR", "DE", "BG"].includes(d.code) ? 1 : 0.2);
    } else {
      this.lines && this.lines.style("opacity", 1);
    }
  }
}
