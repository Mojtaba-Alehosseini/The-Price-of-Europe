/* ============================================================
   BaseChart — common SVG container w/ margin convention
   ============================================================ */

import { readPalette } from "./palette.js";

export class BaseChart {
  constructor(selector, data, ctx, opts = {}) {
    this.selector = selector;
    this.container = document.querySelector(selector);
    this.data = data;
    this.ctx  = ctx;
    this.opts = Object.assign({
      margin: { top: 20, right: 24, bottom: 36, left: 44 },
      aspect: 1.6
    }, opts);

    this.rendered = false;
    this.svg = null;
    this.g   = null;

    // Re-render on theme change (D3 reads CSS vars at draw time)
    if (this.ctx?.theme) {
      this._themeUnsub = this.ctx.theme.onChange(() => {
        if (this.rendered) this.onThemeChange();
      });
    }
  }

  // -- size helpers ----------------------------------------------------
  size() {
    if (!this.container) return { width: 600, height: 360 };
    const w = this.container.clientWidth || 600;
    const h = Math.round(w / this.opts.aspect);
    return { width: w, height: h };
  }

  innerSize() {
    const { width, height } = this.size();
    const m = this.opts.margin;
    return { width: width - m.left - m.right, height: height - m.top - m.bottom };
  }

  // -- svg scaffold ----------------------------------------------------
  ensureSvg() {
    const { width, height } = this.size();
    // If the svg was detached (e.g. parent innerHTML="" wiped it) drop the stale ref.
    if (this.svg && !this.svg.node()?.isConnected) { this.svg = null; this.g = null; }
    if (!this.svg) {
      const titleId = `${this.selector.replace(/[^\w]/g, "")}-title`;
      this.svg = d3.select(this.container)
        .append("svg")
        .attr("class", "chart-svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .attr("role", "img")
        .attr("aria-labelledby", titleId);
      // Prefer the figure's own h3 (chart title); fall back to first h3 in chapter
      const figure  = this.container.closest("figure");
      const chapter = this.container.closest(".chapter");
      const titleText = figure?.querySelector("h3")?.textContent
                     || chapter?.querySelector("h3")?.textContent
                     || "Chart";
      this.svg.append("title").attr("id", titleId).text(titleText);
      this.g = this.svg.append("g")
        .attr("transform", `translate(${this.opts.margin.left},${this.opts.margin.top})`);
    } else {
      this.svg.attr("viewBox", `0 0 ${width} ${height}`);
    }
    return { width, height };
  }

  palette() { return readPalette(); }

  // -- lifecycle hooks (subclasses override) --------------------------
  render() { /* abstract */ this.rendered = true; }
  resize() { if (this.rendered) this.render(); }
  onStep(index, element) { /* default: no-op */ }
  onThemeChange() { if (this.rendered) this.render(); }

  destroy() {
    this._themeUnsub && this._themeUnsub();
    if (this.container) this.container.innerHTML = "";
    this.svg = null;
    this.g = null;
    this.rendered = false;
  }

  // -- helpers --------------------------------------------------------
  formatPct(v, d = 1) { return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)} %`; }
  formatPctSimple(v, d = 1) { return v == null ? "—" : `${v.toFixed(d)} %`; }
  formatEur(v, d = 2) { return v == null ? "—" : new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR", maximumFractionDigits: d }).format(v); }
  formatNum(v, d = 0) { return v == null ? "—" : v.toLocaleString("en-EU", { maximumFractionDigits: d }); }
}
