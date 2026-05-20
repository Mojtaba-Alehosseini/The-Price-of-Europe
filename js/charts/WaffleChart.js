/* ============================================================
   WaffleChart — 10×10 grid showing purchasing power of €100 since 2019
   Depth:
     1. computation — index ratio, faded cells = power lost
     2. interaction — country + category picker
     3. annotation — large headline number + comparison row
     4. encoding   — waffle (part-to-whole) 100 squares
   ============================================================ */

import { BaseChart } from "./BaseChart.js";

export class WaffleChart extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 30, right: 12, bottom: 30, left: 12 }, aspect: 1.0 });
    this.country = "EU27_2020";
    this.category = "CP00";
    this.controlsEl = document.getElementById("chart-waffle-controls");
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const { width, height } = this.ensureSvg();
    const { width: iw, height: ih } = this.innerSize();

    // Compute ratio
    const p0 = this.data.hicpIndex[this.country]?.[this.category]?.["2019-01"];
    const p1Keys = Object.keys(this.data.hicpIndex[this.country]?.[this.category] || {});
    const p1 = this.data.hicpIndex[this.country]?.[this.category]?.[p1Keys.at(-1)];
    const remaining = (p0 && p1) ? Math.max(0, p0 / p1) : null;        // ratio 0..1
    const pct = remaining == null ? null : remaining * 100;

    // Headline number
    const pal = this.palette();
    this.g.append("text").attr("class", "num")
      .attr("x", iw / 2).attr("y", -8)
      .attr("text-anchor", "middle")
      .attr("font-family", "var(--font-display)").attr("font-weight", 600)
      .attr("font-size", "clamp(2rem, 4vw, 3rem)")
      .attr("fill", "var(--ink)")
      .text(pct == null ? "—" : `€${pct.toFixed(0)}`);

    // 10x10 waffle
    const N = 100;
    const cols = 10;
    const rows = 10;
    const size = Math.min(iw, ih) / cols * 0.88;
    const gap  = 5;
    const totalW = cols * size + (cols - 1) * gap;
    const startX = (iw - totalW) / 2;
    const startY = 12;

    const cells = d3.range(N).map(i => ({
      i,
      col: i % cols,
      row: Math.floor(i / cols)
    }));
    // top-rows-first: fill the visible ones with accent, remaining faded
    const fillN = Math.round((pct ?? 0));
    cells.forEach(c => {
      c.idx = (rows - 1 - c.row) * cols + c.col;  // bottom-up index
      c.on  = c.idx < fillN;
    });

    const sel = this.g.selectAll("rect.waffle-cell").data(cells, d => d.i).join("rect")
      .attr("class", "waffle-cell")
      .attr("x", d => startX + d.col * (size + gap))
      .attr("y", d => startY + d.row * (size + gap))
      .attr("width", size).attr("height", size)
      .attr("rx", 2)
      .attr("fill", d => d.on ? "var(--accent)" : "var(--rule-soft)")
      .attr("opacity", 0);

    if (!this.ctx.motion.reduced) {
      sel.transition().duration(700).delay((d, i) => i * 6).attr("opacity", 1);
    } else {
      sel.attr("opacity", 1);
    }

    // sub-text
    this.g.append("text").attr("x", iw / 2).attr("y", startY + totalW + 20)
      .attr("text-anchor", "middle").attr("font-size", 12)
      .attr("fill", "var(--ink-soft)")
      .text(`${this.data.countryName(this.country)} · ${this.data.categoryLabel(this.category)} · Jan 2019 → latest`);

    // EU comparison row
    if (this.country !== "EU27_2020") {
      const euP0 = this.data.hicpIndex["EU27_2020"]?.[this.category]?.["2019-01"];
      const euP1Keys = Object.keys(this.data.hicpIndex["EU27_2020"]?.[this.category] || {});
      const euP1 = this.data.hicpIndex["EU27_2020"]?.[this.category]?.[euP1Keys.at(-1)];
      if (euP0 && euP1) {
        const euPct = (euP0 / euP1) * 100;
        this.g.append("text").attr("x", iw / 2).attr("y", startY + totalW + 40)
          .attr("text-anchor", "middle").attr("font-size", 11)
          .attr("fill", "var(--ink-faint)")
          .text(`EU-27 average: €${euPct.toFixed(0)}`);
      }
    }

    this._renderControls();
  }

  _renderControls() {
    const c = this.controlsEl;
    if (!c) return;
    if (c.dataset.wired === "1") return;
    c.dataset.wired = "1";

    const allCountries = ["EU27_2020", ...this.data.euCodes()].filter(code =>
      Object.keys(this.data.hicpIndex[code]?.CP00 || {}).length > 0);
    const allCats = ["CP00", "CP01", "CP045", "NRG", "SERV"];

    const optCountry = allCountries.map(code => `<option value="${code}" ${code === this.country ? "selected" : ""}>${code === "EU27_2020" ? "EU-27 avg" : this.data.countryName(code)}</option>`).join("");
    const optCat = allCats.map(cat => `<option value="${cat}" ${cat === this.category ? "selected" : ""}>${this.data.categoryLabel(cat)}</option>`).join("");

    c.innerHTML = `
      <label style="display:flex;gap:6px;align-items:center">Country
        <select data-w-country>${optCountry}</select>
      </label>
      <label style="display:flex;gap:6px;align-items:center">Basket
        <select data-w-cat>${optCat}</select>
      </label>
    `;
    c.querySelector('[data-w-country]').addEventListener("change", e => { this.country = e.target.value; this.render(); });
    c.querySelector('[data-w-cat]').addEventListener("change", e => { this.category = e.target.value; this.render(); });
  }

  onStep(idx) {
    if (idx === 1 && this.country === "EU27_2020") { this.country = "DE"; this.render(); }
    if (idx === 2 && this.category === "CP00")     { this.category = "NRG"; this.render(); }
  }
}
