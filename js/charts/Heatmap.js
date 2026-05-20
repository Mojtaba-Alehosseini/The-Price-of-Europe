/* ============================================================
   Heatmap — country (rows) × category (cols), annual mean YoY.
   Depth:
     1. computation — annual means per (country, category)
     2. interaction — year slider; click column header to sort
     3. annotation — peak cell auto-labelled
     4. encoding   — diverging seq cells
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { KEY_CATEGORIES } from "../modules/DataManager.js";

export class Heatmap extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 60, right: 12, bottom: 24, left: 110 }, aspect: 0.85 });
    this.year = null;
    this.sortBy = "CP00";  // default sort
    this.controlsEl = document.getElementById("chart-heatmap-controls");
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const { width, height } = this.ensureSvg();
    const { width: iw, height: ih } = this.innerSize();

    const years = this.data.yearsCP00().filter(y => y >= 2018);
    if (this.year == null) this.year = years.at(-2) || years.at(-1);
    const cats = KEY_CATEGORIES;
    const codes = this.data.euCodes();

    // build matrix
    const matrix = codes.map(code => {
      const row = { code, name: this.data.countryName(code) };
      cats.forEach(c => { row[c] = this.data.hicpAnnual[code]?.[c]?.[String(this.year)] ?? null; });
      return row;
    }).filter(r => Number.isFinite(r[this.sortBy]) || cats.some(c => Number.isFinite(r[c])));

    // sort
    matrix.sort((a, b) => (b[this.sortBy] ?? -Infinity) - (a[this.sortBy] ?? -Infinity));

    const x = d3.scaleBand().domain(cats).range([0, iw]).padding(0.06);
    const y = d3.scaleBand().domain(matrix.map(r => r.code)).range([0, ih]).padding(0.06);

    const pal = this.palette();
    const color = d3.scaleLinear()
      .domain([-2, 0, 2, 5, 10, 18])
      .range([pal.seq[0], pal.seq[0], pal.seq[1], pal.seq[2], pal.seq[3], pal.seq[4]])
      .clamp(true);

    // column headers
    this.g.selectAll("g.col-head").data(cats).join("g").attr("class", "col-head")
      .attr("transform", c => `translate(${x(c) + x.bandwidth() / 2}, -8)`)
      .each((c, i, nodes) => {
        const g = d3.select(nodes[i]);
        const label = this.data.categoryLabel(c);
        g.append("text").attr("transform", "rotate(-32)")
          .attr("font-size", 11).attr("text-anchor", "start")
          .attr("fill", c === this.sortBy ? "var(--accent)" : "var(--ink-soft)")
          .attr("font-weight", c === this.sortBy ? 600 : 500)
          .text(label);
        g.append("rect").attr("x", -x.bandwidth() / 2).attr("y", -42)
          .attr("width", x.bandwidth()).attr("height", 50)
          .attr("fill", "transparent").style("cursor", "pointer")
          .on("click", () => { this.sortBy = c; this.render(); });
      });

    // row labels
    this.g.selectAll("text.row-label").data(matrix).join("text")
      .attr("class", "row-label")
      .attr("x", -8).attr("y", d => y(d.code) + y.bandwidth() / 2 + 3).attr("text-anchor", "end")
      .attr("font-size", 11).attr("fill", "var(--ink-soft)")
      .text(d => d.name);

    // cells
    const cellData = [];
    matrix.forEach(r => cats.forEach(c => cellData.push({ code: r.code, cat: c, v: r[c], name: r.name })));
    const cells = this.g.selectAll("rect.cell").data(cellData, d => `${d.code}-${d.cat}`).join("rect")
      .attr("class", "cell")
      .attr("x", d => x(d.cat)).attr("y", d => y(d.code))
      .attr("width", x.bandwidth()).attr("height", y.bandwidth())
      .attr("fill", d => d.v == null ? "var(--rule-soft)" : color(d.v))
      .attr("rx", 1);

    cells.on("mouseenter", (e, d) => {
      this.ctx.tooltip.show(
        `<h5>${d.name}</h5>
         <div class="row"><span class="key">${this.data.categoryLabel(d.cat)}</span><span class="val">${d.v == null ? "—" : d.v.toFixed(1) + "%"}</span></div>
         <div class="row"><span class="key">Year</span><span class="val">${this.year}</span></div>`,
        e.clientX, e.clientY);
    })
    .on("mousemove", e => this.ctx.tooltip.move(e.clientX, e.clientY))
    .on("mouseleave", () => this.ctx.tooltip.hide());

    // Peak label
    const peak = d3.greatest(cellData, d => d.v ?? -Infinity);
    if (peak) {
      this.g.append("circle").attr("cx", x(peak.cat) + x.bandwidth() / 2)
        .attr("cy", y(peak.code) + y.bandwidth() / 2)
        .attr("r", x.bandwidth() / 2 + 2)
        .attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 2);
    }

    this._renderControls(years);
  }

  _renderControls(years) {
    const c = this.controlsEl;
    if (!c) return;
    if (c.dataset.wired === "1") {
      c.querySelector('[data-year-lbl]').textContent = this.year;
      c.querySelector('input').value = this.year;
      return;
    }
    c.dataset.wired = "1";
    c.innerHTML = `
      <input type="range" min="${years[0]}" max="${years.at(-1)}" value="${this.year}" step="1" aria-label="Year" />
      <span class="num" data-year-lbl style="font-family:var(--font-display);font-weight:600;color:var(--ink)"></span>
      <span class="caption">click column to sort</span>
    `;
    c.querySelector('[data-year-lbl]').textContent = this.year;
    c.querySelector('input').addEventListener("input", e => {
      this.year = +e.target.value;
      this.render();
    });
  }

  onStep(idx, el) {
    if (idx === 2) {
      // hint: sort by housing
      this.sortBy = "CP04";
      this.render();
    }
  }
}
