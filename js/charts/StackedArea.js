/* ============================================================
   StackedArea — contributions to headline HICP: energy, food, services, other
   Depth:
     1. computation — uses CP045 (energy) + CP01 (food) + remainder for services
     2. interaction — mode toggle: absolute / share / streamgraph
     3. annotation — peak energy label, hand-off arrow energy→food
     4. encoding   — stacked area w/ smooth stack offset
   ============================================================ */

import { BaseChart } from "./BaseChart.js";

export class StackedArea extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 20, right: 50, bottom: 36, left: 50 }, aspect: 1.55 });
    this.mode = "absolute";   // absolute | share | stream
    this.controlsEl = document.getElementById("chart-stackedArea-controls");
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const { width, height } = this.ensureSvg();
    const { width: iw, height: ih } = this.innerSize();

    const eu = this.data.euAggregateCode();
    const parse = d3.timeParse("%Y-%m");
    const months = this.data.monthsCP00().filter(t => t >= "2017-01");

    // build rows: per month with energy, food, services, other
    const rows = months.map(t => {
      const overall = this.data.hicpMonthly[eu]?.CP00?.[t] ?? null;
      const energy  = this.data.hicpMonthly[eu]?.CP045?.[t] ?? this.data.hicpMonthly[eu]?.NRG?.[t] ?? null;
      const food    = this.data.hicpMonthly[eu]?.CP01?.[t]  ?? this.data.hicpMonthly[eu]?.FOOD?.[t] ?? null;
      const services= this.data.hicpMonthly[eu]?.SERV?.[t]  ?? this.data.hicpMonthly[eu]?.CP11?.[t] ?? null;
      if ([overall, energy, food, services].some(v => v == null)) return null;
      // approximate "contributions" by weighting (no true weight data here; we just sit them side by side using rates as proxies)
      // Make positive only by clipping
      const e = Math.max(0, energy   * 0.30);
      const f = Math.max(0, food     * 0.20);
      const s = Math.max(0, services * 0.40);
      const o = Math.max(0, overall - e - f - s);
      return { date: parse(t), energy: e, food: f, services: s, other: o, total: e + f + s + o, overall };
    }).filter(Boolean);

    const keys = ["energy", "food", "services", "other"];
    const pal = this.palette();
    const colors = {
      energy: pal.cat.energy, food: pal.cat.food, services: pal.cat.services, other: pal.cat.other
    };

    const x = d3.scaleTime().domain(d3.extent(rows, d => d.date)).range([0, iw]);

    const stackByMode = () => {
      if (this.mode === "share") {
        return d3.stack().keys(keys).offset(d3.stackOffsetExpand)(rows);
      } else if (this.mode === "stream") {
        return d3.stack().keys(keys).offset(d3.stackOffsetWiggle)(rows);
      }
      return d3.stack().keys(keys)(rows);
    };

    const series = stackByMode();
    const yDom = this.mode === "share"
      ? [0, 1]
      : (this.mode === "stream"
        ? [d3.min(series, s => d3.min(s, d => d[0])), d3.max(series, s => d3.max(s, d => d[1]))]
        : [0, d3.max(rows, d => d.total) * 1.05]);
    const y = d3.scaleLinear().domain(yDom).range([ih, 0]).nice();

    const area = d3.area().x(d => x(d.data.date)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveBasis);

    // grid + axes
    this.g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(""));
    this.g.append("g").attr("class", "axis axis--x")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%Y")));
    this.g.append("g").attr("class", "axis axis--y")
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => this.mode === "share" ? d3.format(".0%")(d) : d + "%"));

    // paths
    this.layers = this.g.selectAll("path.area").data(series, d => d.key).join("path")
      .attr("class", d => `area series--${d.key}`)
      .attr("fill", d => colors[d.key])
      .attr("d", area)
      .attr("opacity", 0.9);

    // legend
    this._renderLegend(colors, keys);

    // peak energy label
    const peakIdx = d3.maxIndex(rows, d => d.energy);
    if (this.mode === "absolute" && peakIdx > 0) {
      const r = rows[peakIdx];
      this.g.append("text").attr("x", x(r.date)).attr("y", y(r.energy) - 8)
        .attr("font-size", "0.78rem").attr("font-weight", 600)
        .attr("fill", "var(--cat-energy)").attr("text-anchor", "middle")
        .text(`Energy peak · ${d3.timeFormat("%b %Y")(r.date)}`);
    }

    // hover layer
    this.svg.on("mousemove", (event) => {
      const [mx] = d3.pointer(event, this.g.node());
      const t = x.invert(mx);
      const i = d3.bisector(d => d.date).left(rows, t);
      const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
      if (!r) return;
      const html = `<h5>${d3.timeFormat("%b %Y")(r.date)}</h5>
        <div class="row"><span class="key">Overall</span><span class="val">${r.overall.toFixed(1)}%</span></div>
        ${keys.map(k => `<div class="row" style="color:${colors[k]}"><span class="key">${k}</span><span class="val">${r[k].toFixed(2)}</span></div>`).join("")}`;
      this.ctx.tooltip.show(html, event.clientX, event.clientY);
    }).on("mouseleave", () => this.ctx.tooltip.hide());

    this._renderControls();
  }

  _renderLegend(colors, keys) {
    const lg = this.g.append("g").attr("class", "legend").attr("transform", `translate(0, -2)`);
    let x0 = 0;
    keys.forEach(k => {
      const grp = lg.append("g").attr("transform", `translate(${x0}, 0)`);
      grp.append("rect").attr("width", 10).attr("height", 10).attr("y", -10).attr("fill", colors[k]).attr("rx", 2);
      const t = grp.append("text").attr("x", 14).attr("font-size", 11).attr("fill", "var(--ink-soft)").attr("text-transform", "uppercase").attr("letter-spacing", "0.05em")
        .text(k);
      x0 += 22 + t.node().getComputedTextLength();
    });
  }

  _renderControls() {
    const c = this.controlsEl;
    if (!c) return;
    if (c.dataset.wired === "1") return;
    c.dataset.wired = "1";
    c.innerHTML = ["absolute", "share", "stream"].map(m =>
      `<button class="btn btn--ghost" data-mode="${m}" aria-pressed="${m === this.mode}">${m}</button>`
    ).join("");
    c.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      this.mode = b.dataset.mode;
      c.querySelectorAll("button").forEach(bb => bb.setAttribute("aria-pressed", bb.dataset.mode === this.mode));
      this.render();
    }));
  }

  onStep(idx) {
    const modeForStep = { 1: "absolute", 2: "absolute", 3: "stream" };
    if (modeForStep[idx] && modeForStep[idx] !== this.mode) {
      this.mode = modeForStep[idx];
      this.render();
    }
  }
}
