/* ============================================================
   SmallMultiplesLine — CH2 "The trap and the spark" (REBUILD, brief §5 CH2).
   A 2×3 grid (3 cols × 2 rows desktop, 1-col phone) of monthly YoY by category,
   WINDOW Jan 2019 – Dec 2021 only, on ONE shared y-scale with a marked zero line.
   The shared scale is the point: energy (and transport) tower while the rest sit
   flat — "COVID loaded the spring".
     reveal: panels stagger-draw on scroll (latched)
     steps:  freeze → pulse the flat Overall panel · spark → light Energy+Transport, dim rest
     click:  a panel enlarges to fill the body (Esc / click-out / Enter returns)
     hover:  nearest-month cursor + tooltip (category · month · value)
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { watchChapterProgress, smooth } from "../modules/ChartMotion.js";
import { getCSS } from "../modules/CraftFX.js";

// 3 cols × 2 rows. Order places Energy (0,1) directly above Transport (1,1) so the
// "spark" highlight of the two lights one column. CP11 has no dedicated --cat token
// (restaurants ⊂ services), so it borrows --cat-housing as its distinct 6th hue.
const CATS = [
  { code: "CP00", label: "Overall",     cls: "overall"   },
  { code: "NRG",  label: "Energy",      cls: "energy"    },
  { code: "FOOD", label: "Food",        cls: "food"      },
  { code: "SERV", label: "Services",    cls: "services"  },
  { code: "CP07", label: "Transport",   cls: "transport" },
  { code: "CP11", label: "Restaurants", cls: "housing"   },
];
const COLS = 3, ROWS = 2;

// Step focus → panel emphasis (brief §5 CH2 motion).
const STEPS = {
  freeze:   { highlight: [],             pulse: "CP00", kicker: "FROZEN",   sub: "spring 2020" },
  pressure: { highlight: [],             pulse: null,   kicker: "PRESSURE", sub: "2020 – 2021" },
  spark:    { highlight: ["NRG","CP07"], pulse: null,   kicker: "ENERGY",   sub: "the fuse lights first" },
};
const STEP_ORDER = ["freeze", "pressure", "spark"];

export class SmallMultiplesLine extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 64, right: 20, bottom: 34, left: 46 }, aspect: 1.5 });
    this._focus = "freeze";
    this._enlarged = null;
    this._drawn = {};        // per-cat latched draw fraction
  }

  size() {
    if (!this.container) return { width: 640, height: 560 };
    const w = this.container.clientWidth || 640;
    const h = this.container.clientHeight || Math.round(w / this.opts.aspect);
    return { width: w, height: Math.max(340, h) };
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const isPhone = this.size().width < 560;
    this._isPhone = isPhone;
    this.opts.margin = isPhone
      ? { top: 52, right: 14, bottom: 30, left: 40 }
      : { top: 64, right: 20, bottom: 34, left: 46 };
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    this.svg.attr("aria-label", "Monthly inflation by category 2019–2021 on one shared scale: energy and transport tower over food, services and restaurants which stay near zero.");
    const M = this.opts.margin;
    const iw = width - M.left - M.right, ih = height - M.top - M.bottom;
    this._iw = iw; this._ih = ih;

    const eu = this.data.euAggregateCode();
    const parse = d3.timeParse("%Y-%m");
    this._parse = parse;
    // grid geometry (phone = 1 col × 6 rows)
    const cols = isPhone ? 1 : COLS, rows = isPhone ? CATS.length : ROWS;
    const gapX = isPhone ? 0 : 30, gapY = isPhone ? 12 : 26;
    const cellW = (iw - gapX * (cols - 1)) / cols;
    const cellH = (ih - gapY * (rows - 1)) / rows;
    this._cols = cols; this._rows = rows; this._cellW = cellW; this._cellH = cellH; this._gapX = gapX; this._gapY = gapY;

    // series per category, window 2019-2021, shared y
    this._series = new Map();
    CATS.forEach(c => {
      const rows2 = [];
      for (const t of this.data.monthsCP00()) {
        if (t < "2019-01" || t > "2021-12") continue;
        const v = this.data.hicpMonthly[eu]?.[c.code]?.[t];
        if (Number.isFinite(v)) rows2.push({ t: parse(t), time: t, v });
      }
      rows2.sort((a, b) => a.t - b.t);
      this._series.set(c.code, rows2);
    });
    const x = d3.scaleTime().domain([parse("2019-01"), parse("2021-12")]).range([0, cellW - 34]);  // [§C.1] right gutter so the end tag clears the line end
    const y = d3.scaleLinear().domain([-12, 26]).range([cellH, 0]);
    this._x = x; this._y = y;

    // kicker (big italic word) top-left
    this._kickNum = this.svg.append("text").attr("class", "kick-num")
      .attr("x", M.left - 2).attr("y", isPhone ? 36 : 46)
      .style("font-size", isPhone ? "26px" : "34px").text(STEPS.freeze.kicker);
    // top-right unit legend
    const lg = this.svg.append("g").attr("transform", `translate(${width - M.right}, ${isPhone ? 22 : 30})`);
    lg.append("text").attr("class", "legend-title").attr("text-anchor", "end").text("ANNUAL %");
    if (!isPhone) lg.append("text").attr("class", "legend-tick").attr("text-anchor", "end").attr("y", 14).text("shared scale · 2019–21");

    // panels
    this._panelG = new Map();
    CATS.forEach((c, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const tx = M.left + col * (cellW + gapX);
      const ty = M.top + row * (cellH + gapY);
      const cell = this.svg.append("g").attr("class", "sm-panel").attr("data-cat", c.code)
        .attr("transform", `translate(${tx},${ty})`)
        .attr("role", "button").attr("tabindex", 0)
        .attr("aria-label", `${c.label} — click to enlarge`)
        .style("cursor", "pointer");
      this._panelG.set(c.code, cell);
      this._drawPanel(cell, c, col, row);
      cell.on("click", () => this._toggleEnlarge(c.code));
      cell.on("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this._toggleEnlarge(c.code); } });
    });

    // hero layer (enlarge overlay) on top
    this._heroG = this.svg.append("g").attr("class", "sm-hero-layer");

    // reveal + focus
    this._drawn = {};
    if (this.ctx.motion.reduced) {
      CATS.forEach(c => this._drawCat(c.code, 1));
      this._applyFocus("spark");   // final legible state (all lit, energy word)
      this._kickNum.text(STEPS.spark.kicker);
    } else {
      this._applyFocus(this._focus);
      this._wireScroll();
    }
  }

  _drawPanel(cell, c, col, row) {
    const { _cellW: w, _cellH: h, _x: x, _y: y } = this;
    const isLeftCol = col === 0, isBottomRow = row === this._rows - 1;
    const color = getCSS(`--cat-${c.cls}`);
    // gridlines + shared y ticks (left column only; thinned on phone) + zero line
    y.ticks(this._isPhone ? 2 : 4).forEach(t => {
      cell.append("line").attr("class", t === 0 ? "sm-zero" : "sm-grid")
        .attr("x1", 0).attr("x2", w).attr("y1", y(t)).attr("y2", y(t));
      if (isLeftCol) cell.append("text").attr("class", "sm-ytick")
        .attr("x", -7).attr("y", y(t) + 3).attr("text-anchor", "end").text(`${t}%`);
    });
    // x labels (year starts) — bottom row only, so top-row labels never hit the row below's titles
    if (isBottomRow) ["2019", "2020", "2021"].forEach((yr, k) => cell.append("text").attr("class", "sm-xtick")
      .attr("x", x(this._parse(`${yr}-01`))).attr("y", h + 14)
      .attr("text-anchor", k === 0 ? "start" : k === 2 ? "end" : "middle").text(yr));

    // body clip so the line never bleeds past the cell
    const clipId = `sm-clip-${c.code}`;
    let defs = this.svg.select("defs"); if (defs.empty()) defs = this.svg.append("defs");
    defs.append("clipPath").attr("id", clipId).append("rect").attr("x", 0).attr("y", 0).attr("width", w).attr("height", h);

    const line = d3.line().x(d => x(d.t)).y(d => y(d.v)).curve(d3.curveMonotoneX);
    const s = this._series.get(c.code);
    cell.append("path").datum(s).attr("class", "sm-line").attr("data-cat", c.code)
      .attr("fill", "none").attr("stroke", color).attr("stroke-width", 2)
      .attr("stroke-linejoin", "round").attr("stroke-linecap", "round").attr("d", line)
      .attr("clip-path", `url(#${clipId})`);

    // title INSIDE top-left (halo keeps it legible over the line); end tag rides the line's end point
    cell.append("text").attr("class", "sm-title").attr("x", 3).attr("y", 13).text(c.label.toUpperCase());
    const last = s.at(-1);
    if (last) {
      cell.append("circle").attr("class", "sm-end-dot").attr("cx", x(last.t)).attr("cy", y(last.v)).attr("r", 2.6).attr("fill", color);
      cell.append("text").attr("class", "sm-end-tag").attr("x", w - 2).attr("y", Math.max(12, y(last.v) - 7)).attr("text-anchor", "end")
        .attr("fill", color).text(`${last.v >= 0 ? "+" : ""}${last.v.toFixed(0)}%`);
    }
    // per-panel hover
    const hit = cell.append("rect").attr("class", "sm-hit").attr("x", 0).attr("y", 0).attr("width", w).attr("height", h).attr("fill", "transparent");
    const cur = cell.append("g").attr("class", "sm-cursor").attr("pointer-events", "none").style("opacity", 0);
    cur.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", h);
    const cdot = cur.append("circle").attr("r", 3.5).attr("fill", color).attr("stroke", "var(--bg)").attr("stroke-width", 1.4);
    const bisect = d3.bisector(d => d.t).left;
    hit.on("mousemove", (event) => {
      const [mx] = d3.pointer(event, cell.node());
      const t = x.invert(mx); const i = bisect(s, t);
      const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i)];
      const rec = (!a || (b && (t - a.t) > (b.t - t))) ? b : a; if (!rec) return;
      cur.style("opacity", 1).attr("transform", `translate(${x(rec.t)},0)`);
      cdot.attr("cx", 0).attr("cy", y(rec.v));
      this.ctx.tooltip.show(`<h5>${c.label}</h5><div class="row"><span class="key">${d3.timeFormat("%b %Y")(rec.t)}</span><span class="val">${rec.v >= 0 ? "+" : ""}${rec.v.toFixed(1)}%</span></div>`, event.clientX, event.clientY);
    }).on("mouseleave", () => { cur.style("opacity", 0); this.ctx.tooltip.hide(); });

    cell.datum({ c, line, s });
  }

  // latched per-panel line draw (dasharray). frac 0..1.
  _drawCat(code, frac) {
    this._drawn[code] = Math.max(this._drawn[code] || 0, frac);
    const path = this._panelG.get(code)?.select(".sm-line");
    if (!path || path.empty()) return;
    const node = path.node(); const L = node.getTotalLength ? node.getTotalLength() : 0;
    path.attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L * (1 - this._drawn[code]));
  }

  _wireScroll() {
    if (this._unwatch) this._unwatch();
    const chapter = this.container.closest(".chapter");
    this._unwatch = watchChapterProgress(chapter, p => this._onProgress(p));
    this._watchUnpin(chapter, () => this._neutralView());   // [A2 §B.4]
  }
  // [A2 §B.4] neutral full view — every panel drawn + un-dimmed (no lingering spark-step dim).
  _neutralView() { CATS.forEach(c => this._drawCat(c.code, 1)); if (this._panelG) this._panelG.forEach(g => g.interrupt().style("opacity", 1)); }

  // stagger the 6 panels across p=0..0.42 (latched); done well before the spark step.
  _onProgress(p) {
    CATS.forEach((c, i) => {
      const start = i * 0.05;
      const frac = smooth(Math.max(0, Math.min(1, (p - start) / 0.30)));
      if (frac > (this._drawn[c.code] || 0)) this._drawCat(c.code, frac);
    });
  }

  onStep(index, el) {
    const focus = (el && el.dataset.focus) || STEP_ORDER[Math.max(0, Math.min(STEP_ORDER.length - 1, index))];
    this._focus = focus;
    if (this.container) { this.container.setAttribute("data-active-focus", focus); this.container.setAttribute("data-onstep", index); }
    if (this._enlarged) return;   // don't fight an open enlarge
    const cfg = STEPS[focus] || STEPS.freeze;
    this._kickNum.text(cfg.kicker);
    this._applyFocus(focus);
  }

  _applyFocus(focus) {
    const cfg = STEPS[focus] || STEPS.freeze;
    const dur = this.ctx.motion.reduced ? 0 : 420;
    const hi = cfg.highlight;
    CATS.forEach(c => {
      const g = this._panelG.get(c.code); if (!g) return;
      const dim = hi.length && !hi.includes(c.code);
      g.interrupt().transition().duration(dur).style("opacity", dim ? getCSS("--dim-nonfocus") || 0.25 : 1);
    });
    if (cfg.pulse && !this.ctx.motion.reduced) this._pulse(cfg.pulse);
  }

  // one-shot pulse rings on a panel's end dot (the "flat overall" at the freeze step)
  _pulse(code) {
    const g = this._panelG.get(code); if (!g) return;
    const dot = g.select(".sm-end-dot"); if (dot.empty()) return;
    const cx = +dot.attr("cx"), cy = +dot.attr("cy");
    for (let k = 0; k < 3; k++) {
      g.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 4).attr("fill", "none")
        .attr("stroke", getCSS(`--cat-overall`)).attr("stroke-width", 1.6).style("opacity", 0.5)
        .transition().delay(k * 240).duration(900).ease(d3.easeCubicOut).attr("r", 22).style("opacity", 0).remove();
    }
  }

  // ── click-to-enlarge ──────────────────────────────────────────────
  _toggleEnlarge(code) {
    if (this._enlarged === code) return this._collapse();
    this._enlarged = code;
    if (this.container) this.container.setAttribute("data-enlarged", code);
    // dim grid to a faint ghost, lift the big panel
    this._panelG.forEach(g => g.interrupt().style("opacity", 0));
    this._heroG.selectAll("*").remove();
    this._drawBig(code);
    if (!this._escBound) { this._escHandler = (e) => { if (e.key === "Escape") this._collapse(); }; document.addEventListener("keydown", this._escHandler); this._escBound = true; }
  }

  _collapse() {
    this._enlarged = null;
    if (this.container) this.container.removeAttribute("data-enlarged");
    this._heroG.selectAll("*").remove();
    this._applyFocus(this._focus);
    const cfg = STEPS[this._focus] || STEPS.freeze;
    this._kickNum.text(cfg.kicker);
    if (this._escBound) { document.removeEventListener("keydown", this._escHandler); this._escBound = false; }
  }

  _drawBig(code) {
    const c = CATS.find(k => k.code === code);
    const s = this._series.get(code) || [];
    if (!s.length) return;
    const M = this.opts.margin;
    const x0 = M.left, y0 = M.top, w = this._iw, h = this._ih;
    const color = getCSS(`--cat-${c.cls}`);
    // scrim (click-out to collapse)
    this._heroG.append("rect").attr("class", "sm-scrim").attr("x", 0).attr("y", 0).attr("width", this.W).attr("height", this.H)
      .attr("fill", "var(--bg)").attr("opacity", 1).style("cursor", "zoom-out").on("click", () => this._collapse());
    const g = this._heroG.append("g").attr("transform", `translate(${x0},${y0})`);
    const xs = d3.scaleTime().domain([this._parse("2019-01"), this._parse("2021-12")]).range([0, w]);
    const vmax = d3.max(s, d => d.v), vmin = Math.min(0, d3.min(s, d => d.v));
    const ys = d3.scaleLinear().domain([vmin, Math.ceil(vmax * 1.08)]).range([h, 0]).nice();
    // axes
    ys.ticks(6).forEach(t => {
      g.append("line").attr("class", t === 0 ? "sm-zero" : "sm-grid").attr("x1", 0).attr("x2", w).attr("y1", ys(t)).attr("y2", ys(t));
      g.append("text").attr("class", "sm-ytick").attr("x", -8).attr("y", ys(t) + 3).attr("text-anchor", "end").text(`${t}%`);
    });
    ["2019", "2020", "2021"].forEach((yr, k) => g.append("text").attr("class", "sm-xtick")
      .attr("x", xs(this._parse(`${yr}-01`))).attr("y", h + 16).attr("text-anchor", k === 0 ? "start" : "middle").text(yr));
    // area + line
    const gradId = `sm-big-grad-${code}`;
    let defs = this.svg.select("defs"); if (defs.empty()) defs = this.svg.append("defs");
    if (defs.select(`#${gradId}`).empty()) {
      const lg = defs.append("linearGradient").attr("id", gradId).attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 1);
      lg.append("stop").attr("offset", "0%").attr("stop-color", color).attr("stop-opacity", 0.32);
      lg.append("stop").attr("offset", "100%").attr("stop-color", color).attr("stop-opacity", 0.02);
    }
    const area = d3.area().x(d => xs(d.t)).y0(ys(0)).y1(d => ys(d.v)).curve(d3.curveMonotoneX);
    g.append("path").datum(s).attr("class", "sm-big-area").attr("d", area).attr("fill", `url(#${gradId})`);
    const line = d3.line().x(d => xs(d.t)).y(d => ys(d.v)).curve(d3.curveMonotoneX);
    g.append("path").datum(s).attr("class", "sm-big-line").attr("d", line).attr("fill", "none").attr("stroke", color).attr("stroke-width", 2.8).attr("stroke-linejoin", "round");
    // peak + end tags
    const peak = d3.greatest(s, d => d.v), last = s.at(-1);
    g.append("circle").attr("cx", xs(peak.t)).attr("cy", ys(peak.v)).attr("r", 5).attr("fill", color).attr("stroke", "var(--bg)").attr("stroke-width", 1.6);
    g.append("text").attr("class", "sm-big-peak").attr("x", xs(peak.t)).attr("y", ys(peak.v) - 10).attr("text-anchor", "middle").text(`peak ${peak.v.toFixed(1)}%`);
    g.append("text").attr("class", "sm-big-end").attr("x", xs(last.t) - 6).attr("y", ys(last.v) - 8).attr("text-anchor", "end").text(`${last.v >= 0 ? "+" : ""}${last.v.toFixed(1)}% by Dec 2021`);
    g.append("text").attr("class", "sm-big-hint").attr("x", w).attr("y", h - 4).attr("text-anchor", "end").text("Esc or click to go back");
    // category title ABOVE the scrim (the global kicker sits hidden behind it during the enlarge)
    this._heroG.append("text").attr("class", "kick-num").attr("x", M.left - 2).attr("y", this._isPhone ? 36 : 46)
      .style("font-size", this._isPhone ? "26px" : "34px").text(c.label.toUpperCase());
  }

  destroy() { if (this._unwatch) this._unwatch(); if (this._escBound) document.removeEventListener("keydown", this._escHandler); super.destroy(); }
  onThemeChange() { this.render(); }
}
