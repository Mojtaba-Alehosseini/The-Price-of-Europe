/* ============================================================
   SlopeChart — electricity price H1 2019 → H1 2024 by country.
   Depth:
     1. computation — % change per country, ranks, extremes
     2. interaction — hover any slope to highlight; click to pin
     3. annotation — Czech / Romania highest, Spain/PT capped
     4. encoding   — two-axis slope, color by direction + magnitude
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { tracePath, watchChapterProgress } from "../modules/ChartMotion.js";

export class SlopeChart extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 30, right: 130, bottom: 30, left: 130 }, aspect: 1.1 });
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const { width, height } = this.ensureSvg();
    const { width: iw, height: ih } = this.innerSize();

    // pick the cheapest available H1 reading for 2019 and the latest for 2024
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

    const y = d3.scaleLinear()
      .domain([d3.min(rows, d => Math.min(d.a, d.b)) * 0.95, d3.max(rows, d => Math.max(d.a, d.b)) * 1.05])
      .range([ih, 0]);

    const pal = this.palette();
    const colorFor = d => d.pct > 60 ? "var(--seq-4)" : d.pct > 30 ? "var(--seq-3)" : d.pct > 0 ? pal.cat.housing : "var(--seq-1)";

    // axes
    this.g.append("text").attr("x", 0).attr("y", -8).attr("font-size", 11)
      .attr("fill", "var(--ink-faint)").attr("text-transform", "uppercase").attr("letter-spacing", "0.06em")
      .text("H1 2019");
    this.g.append("text").attr("x", iw).attr("y", -8).attr("text-anchor", "end").attr("font-size", 11)
      .attr("fill", "var(--ink-faint)").attr("text-transform", "uppercase").attr("letter-spacing", "0.06em")
      .text("H1 2024");

    this.g.append("line").attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", ih).attr("stroke", "var(--rule)");
    this.g.append("line").attr("x1", iw).attr("x2", iw).attr("y1", 0).attr("y2", ih).attr("stroke", "var(--rule)");

    // Y-axis ticks (price label)
    [0.10, 0.20, 0.30, 0.40, 0.50].forEach(v => {
      if (v > y.domain()[0] && v < y.domain()[1]) {
        this.g.append("line").attr("x1", -4).attr("x2", 0).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", "var(--rule)");
        this.g.append("text").attr("x", -8).attr("y", y(v) + 3).attr("text-anchor", "end").attr("font-size", 10)
          .attr("fill", "var(--ink-faint)").text(`€${v.toFixed(2)}`);
      }
    });

    // draw slopes
    this.slopes = this.g.selectAll("g.slope").data(rows).join("g").attr("class", "slope")
      .style("cursor", "pointer");
    this.slopes.append("line").attr("class", "slope-line")
      .attr("x1", 0).attr("x2", iw).attr("y1", d => y(d.a)).attr("y2", d => y(d.b))
      .attr("stroke", colorFor).attr("stroke-width", 1.6).attr("opacity", 0.75);
    this.slopes.append("circle").attr("cx", 0).attr("cy", d => y(d.a)).attr("r", 3.5)
      .attr("fill", "var(--bg-elev)").attr("stroke", colorFor).attr("stroke-width", 1.5);
    this.slopes.append("circle").attr("cx", iw).attr("cy", d => y(d.b)).attr("r", 3.5)
      .attr("fill", colorFor);

    // start label (only for extremes to reduce crowding)
    const extremes = new Set([rows.slice(0, 4).map(d => d.code), rows.slice(-3).map(d => d.code)].flat());
    this.slopes.filter(d => extremes.has(d.code))
      .append("text").attr("class", "slope-end-label")
      .attr("x", -8).attr("y", d => y(d.a) + 3).attr("text-anchor", "end")
      .attr("fill", "var(--ink)").attr("font-weight", 600).attr("font-size", 11)
      .text(d => d.name);
    this.slopes.filter(d => extremes.has(d.code))
      .append("text").attr("class", "slope-end-label")
      .attr("x", iw + 8).attr("y", d => y(d.b) + 3).attr("font-size", 11)
      .attr("fill", colorFor).attr("font-weight", 600)
      .text(d => `${d.name} · ${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(0)}%`);

    // hover
    this.slopes.on("mouseenter", (e, d) => {
      this.slopes.style("opacity", x => x === d ? 1 : 0.18);
      this.ctx.tooltip.show(
        `<h5>${d.name}</h5>
         <div class="row"><span class="key">H1 2019</span><span class="val">€${d.a.toFixed(3)}/kWh</span></div>
         <div class="row"><span class="key">H1 2024</span><span class="val">€${d.b.toFixed(3)}/kWh</span></div>
         <div class="row"><span class="key">Change</span><span class="val">${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(1)}%</span></div>`,
        e.clientX, e.clientY);
    })
    .on("mousemove", e => this.ctx.tooltip.move(e.clientX, e.clientY))
    .on("mouseleave", () => {
      this.slopes.style("opacity", 1);
      this.ctx.tooltip.hide();
    });

    // motion: draw slopes left-to-right on scroll-in
    const chapter = this.container.closest(".chapter");
    this._unsub && this._unsub();
    this._unsub = watchChapterProgress(chapter, (p) => {
      // map [0.05..0.5] of chapter scroll to slope draw 0..1
      const t = Math.max(0, Math.min(1, (p - 0.05) / 0.4));
      this.slopes.selectAll("line").each(function(d) {
        const path = d3.select(this);
        path.attr("stroke-dasharray", null);
        // animate x2 from 0 to iw
        const targetX2 = +path.attr("x2") || iw;
        path.attr("x2", iw * t);
      });
    });
  }
}
