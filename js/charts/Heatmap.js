/* ============================================================
   Heatmap — CH4 "The cruel lag" (REBUILD, brief §5 CH4).
   rows = categories (Energy, Food, Services, Transport, Overall);
   cols = months Jan 2021 – Dec 2024; cell colour = monthly YoY rate
   on the --seq green→red ramp (HEX only — D15). Reads as five stacked
   time-ribbons: the energy ribbon runs red-hot through 2022, then cools
   while food stays hot — "Energy let go. Food never did."
     reveal: columns sweep in left→right on scroll (latched clip)
     steps:  a claret column-FRAME moves 2022 → spring 2023 → 2024
     hover:  cell tooltip (category · month · rate); row label dims other rows
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { watchChapterProgress, smooth } from "../modules/ChartMotion.js";

const ROWS = [
  { code: "NRG",  label: "Energy" },
  { code: "FOOD", label: "Food" },
  { code: "SERV", label: "Services" },
  { code: "CP07", label: "Transport" },
  { code: "CP00", label: "Overall" },
];

// Step → the claret column-frame range (inclusive month keys) + kicker word.
const FRAMES = {
  "2022":   { from: "2022-01", to: "2022-12", kicker: "2022" },
  "2023H1": { from: "2023-01", to: "2023-06", kicker: "2023" },
  "2024":   { from: "2024-01", to: "2024-12", kicker: "2024" },
};
const FRAME_ORDER = ["2022", "2023H1", "2024"];

export class Heatmap extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 60, right: 20, bottom: 30, left: 96 }, aspect: 1.5 });
    this._frame = "2022";
    this._drawn = 0;
  }

  // seq green→red ramp. Domain spans −3…41 (energy peaks ~41); good resolution in the busy
  // 0–15 band, red parked for the 25+ energy spikes.
  static DOMAIN = [-3, 0, 4, 8, 15, 25, 41];
  static TICKS = [{ v: 0, t: "0" }, { v: 10, t: "10" }, { v: 20, t: "20" }, { v: 41, t: "40+" }];
  _colorScale(pal) {
    const s = pal.seq;
    return d3.scaleLinear().domain(Heatmap.DOMAIN)
      .range([s[0], s[0], s[1], s[2], s[3], d3.interpolateLab(s[3], s[4])(0.5), s[4]])
      .interpolate(d3.interpolateLab).clamp(true);
  }

  size() {
    if (!this.container) return { width: 700, height: 480 };
    const w = this.container.clientWidth || 700;
    const h = this.container.clientHeight || Math.round(w / this.opts.aspect);
    return { width: w, height: Math.max(320, h) };
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const isPhone = this.size().width < 560;
    this._isPhone = isPhone;
    this.opts.margin = isPhone
      ? { top: 50, right: 12, bottom: 28, left: 62 }
      : { top: 60, right: 20, bottom: 30, left: 96 };
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    this.svg.attr("aria-label", "Monthly inflation by category, 2021–2024: the energy row runs red-hot through 2022 then cools, while food stays hot into 2023 and services linger.");
    const M = this.opts.margin;
    const iw = width - M.left - M.right, ih = height - M.top - M.bottom;
    this._iw = iw; this._ih = ih;

    const eu = this.data.euAggregateCode();
    const months = [];
    for (const t of this.data.monthsCP00()) if (t >= "2021-01" && t <= "2024-12") months.push(t);
    months.sort();
    this._months = months;
    const parse = d3.timeParse("%Y-%m");
    this._parse = parse;

    const x = d3.scaleBand().domain(months).range([0, iw]).padding(0);
    const y = d3.scaleBand().domain(ROWS.map(r => r.code)).range([0, ih]).padding(0.06);
    this._x = x; this._y = y;
    this.color = this._colorScale(this.palette());

    // cell matrix
    const bg = getCSS("--bg"), ink = getCSS("--ink"), noData = getCSS("--rule-soft");
    const cells = [];
    ROWS.forEach(r => months.forEach(t => cells.push({ code: r.code, label: r.label, t, v: this.data.hicpMonthly[eu]?.[r.code]?.[t] })));
    this._cellData = cells;

    // defs — reveal clip (latched L→R column sweep)
    const uid = this.selector.replace(/[^\w]/g, "");
    const defs = this.svg.append("defs");
    const revealId = `hm-reveal-${uid}`;
    this._revealRect = defs.append("clipPath").attr("id", revealId)
      .append("rect").attr("x", -1).attr("y", -6).attr("width", 0).attr("height", ih + 12);

    const gCells = this.g.append("g").attr("clip-path", `url(#${revealId})`);
    this.cells = gCells.selectAll("rect.hm-cell").data(cells, d => `${d.code}-${d.t}`).join("rect")
      .attr("class", "hm-cell")
      .attr("x", d => x(d.t)).attr("y", d => y(d.code))
      .attr("width", x.bandwidth()).attr("height", y.bandwidth())
      .attr("fill", d => d.v == null ? noData : this.color(d.v))
      .attr("stroke", bg).attr("stroke-width", 1)
      .on("mouseenter", (e, d) => this._hoverCell(e.currentTarget, d, e))
      .on("mousemove", e => this.ctx.tooltip.move(e.clientX, e.clientY))
      .on("mouseleave", e => this._blurCell(e.currentTarget))
      .on("pointerdown", (e, d) => { if (e.pointerType !== "mouse") this._hoverCell(e.currentTarget, d, e); });

    // thin year separator rules (left edge of each year)
    ["2022-01", "2023-01", "2024-01"].forEach(t => {
      this.g.append("line").attr("class", "hm-year-sep")
        .attr("x1", x(t)).attr("x2", x(t)).attr("y1", -4).attr("y2", ih + 4);
    });

    // row labels (left, caps) — hover dims other rows
    this.g.selectAll("text.hm-row-label").data(ROWS).join("text")
      .attr("class", "hm-row-label").attr("text-anchor", "end")
      .attr("x", -10).attr("y", d => y(d.code) + y.bandwidth() / 2 + 4)
      .style("cursor", "pointer")
      .text(d => isPhone ? d.label.slice(0, 4) : d.label)
      .on("mouseenter", (e, d) => this._dimRows(d.code))
      .on("mouseleave", () => this._dimRows(null));

    // column labels at year starts only
    ["2021", "2022", "2023", "2024"].forEach(yr => {
      const t = `${yr}-01`;
      this.g.append("text").attr("class", "hm-col-head")
        .attr("x", x(t) + x.bandwidth() / 2).attr("y", ih + 16).attr("text-anchor", "start").text(yr);
    });

    // claret column-frame (moves per step)
    this._frameRect = this.g.append("rect").attr("class", "hm-frame")
      .attr("y", -4).attr("height", ih + 8).attr("rx", 2).style("opacity", 0);

    // kicker + legend
    this._kickNum = this.svg.append("text").attr("class", "kick-num")
      .attr("x", M.left - 2).attr("y", isPhone ? 34 : 42)
      .style("font-size", isPhone ? "26px" : "34px").text(FRAMES[this._frame].kicker);
    this._drawScaleLegend(width - M.right, isPhone ? 20 : 26, isPhone);

    // reveal + frame
    this._drawn = 0;
    if (this.ctx.motion.reduced) {
      this._revealTo(1);
      this._moveFrame("2024", true);
      this._kickNum.text(FRAMES["2024"].kicker);
    } else {
      this._moveFrame(this._frame, true);
      this._wireScroll();
    }
  }

  _wireScroll() {
    if (this._unwatch) this._unwatch();
    const chapter = this.container.closest(".chapter");
    this._unwatch = watchChapterProgress(chapter, p => this._onProgress(p));
    this._watchUnpin(chapter, () => { this._revealTo(1); this._moveFrame("2024", true); this._kickNum.text(FRAMES["2024"].kicker); });   // [A2 §B.4]
  }

  _revealTo(np) {
    this._drawn = Math.max(this._drawn || 0, np);
    if (this._revealRect) this._revealRect.attr("width", Math.max(0, this._drawn * (this._iw + 2)));
  }

  _onProgress(p) {
    // The column sweep is the chapter's ENTRANCE — complete it early (by ~p=0.14) so the whole grid
    // is drawn before the first frame step activates (~p=0.22); otherwise the claret 2022 frame would
    // sit over still-blank columns. Latched, so re-scrolling never un-draws it.
    const target = smooth(Math.max(0, Math.min(1, p / 0.14)));
    if (target > this._drawn) this._revealTo(target);
  }

  onStep(index, el) {
    const frame = (el && el.dataset.frame) || FRAME_ORDER[Math.max(0, Math.min(FRAME_ORDER.length - 1, index))];
    this._frame = frame;
    if (this.container) { this.container.setAttribute("data-active-frame", frame); this.container.setAttribute("data-onstep", index); }
    if (this._kickNum) this._kickNum.text(FRAMES[frame]?.kicker || "");
    this._moveFrame(frame, false);
  }

  _moveFrame(frame, immediate) {
    const f = FRAMES[frame]; if (!f || !this._frameRect) return;
    const x = this._x;
    const x0 = x(f.from), x1 = x(f.to) + x.bandwidth();
    const sel = immediate || this.ctx.motion.reduced ? this._frameRect : this._frameRect.interrupt().transition().duration(600).ease(d3.easeCubicInOut);
    sel.attr("x", x0 - 1).attr("width", (x1 - x0) + 2).style("opacity", 1);
  }

  _dimRows(code) {
    if (!this.cells) return;
    this.cells.interrupt("dim").transition("dim").duration(200)
      .attr("opacity", d => !code || d.code === code ? 1 : 0.18);
    this.g.selectAll("text.hm-row-label").classed("hm-row-label--peak", d => code && d.code === code);
  }

  _hoverCell(node, d, ev) {
    d3.select(node).raise().classed("hm-cell--focus", true);
    const dt = d3.timeFormat("%B %Y")(this._parse(d.t));
    this.ctx.tooltip.show(
      `<h5>${d.label}</h5><div class="row"><span class="key">${dt}</span><span class="val">${d.v == null ? "—" : (d.v >= 0 ? "+" : "") + d.v.toFixed(1) + "%"}</span></div>`,
      ev?.clientX ?? 0, ev?.clientY ?? 0);
  }
  _blurCell(node) { d3.select(node).classed("hm-cell--focus", false); this.ctx.tooltip.hide(); }

  _drawScaleLegend(xRight, yTop, isPhone) {
    const barW = isPhone ? 96 : 128, barH = 8;
    const g = this.svg.append("g").attr("class", "hm-scale-legend")
      .attr("transform", `translate(${xRight - barW}, ${yTop})`).attr("pointer-events", "none");
    g.append("text").attr("class", "hm-scale-unit").attr("x", barW).attr("y", -5).attr("text-anchor", "end").text("ANNUAL %");
    const D = Heatmap.DOMAIN, lo = D[0], hi = D[D.length - 1];
    const px = v => ((v - lo) / (hi - lo)) * barW;
    const gradId = `hm-grad-${this.selector.replace(/[^\w]/g, "")}`;
    const grad = g.append("defs").append("linearGradient").attr("id", gradId).attr("x1", "0%").attr("x2", "100%");
    const N = 24;
    for (let i = 0; i <= N; i++) grad.append("stop").attr("offset", `${(i / N) * 100}%`).attr("stop-color", this.color(lo + (hi - lo) * (i / N)));
    g.append("rect").attr("class", "hm-scale-bar").attr("x", 0).attr("y", 0).attr("width", barW).attr("height", barH).attr("rx", 1.5).attr("fill", `url(#${gradId})`);
    Heatmap.TICKS.forEach(s => {
      const tx = px(s.v);
      g.append("line").attr("class", "hm-scale-tickmark").attr("x1", tx).attr("x2", tx).attr("y1", 0).attr("y2", barH + 2);
      g.append("text").attr("class", "hm-scale-tick").attr("x", tx).attr("y", barH + 12)
        .attr("text-anchor", s.v === lo ? "start" : (s.v === hi ? "end" : "middle")).text(s.t);
    });
  }

  destroy() { if (this._unwatch) this._unwatch(); super.destroy(); }
  onThemeChange() { this.render(); }
}

function getCSS(name) { const m = name.match(/var\((--[^)]+)\)/); const n = m ? m[1] : name; return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
