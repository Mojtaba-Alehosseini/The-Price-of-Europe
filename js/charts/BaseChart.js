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
    // Clamp to >=0. During a transient relayout (e.g. a browser fullPage capture, or an
    // orientation flip mid-transition) the sticky panel can momentarily measure a few px wide,
    // which would make width-margins NEGATIVE → charts then set <rect width="-33"> and the
    // browser logs an invalid-attribute console error. max(0,...) is a no-op in every normal
    // case (width >> margins); in the degenerate frame the chart draws harmless 0-size marks and
    // the next (settled) resize re-renders it correctly. Keeps zero_console_errors honest.
    return { width: Math.max(0, width - m.left - m.right), height: Math.max(0, height - m.top - m.bottom) };
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
    this._unsub && this._unsub();   // BUG-2/BUG-8 — cancel ChartMotion.watchChapterProgress scroll/resize listeners
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

  // -- Editorial chart language (round-4 · shared, OPT-IN) ------------
  // These emit the project's canonical editorial markup so every chart that adopts them reads as one
  // designed family: top-left italic-Fraunces kicker, top-right unit legend, capital-dot peak, focus/
  // dim (accent reserved for the focused element), and reveal. Pure presentation — NO data logic. The
  // CSS already exists in css/charts.css (.year-kicker/-sub, .legend-title, .capital-dot/.is-focus,
  // .is-dim/.is-focus, .reveal/.is-in) so there is ONE source of truth. Charts migrate to these over
  // the per-chart polish phases; nothing is forced (these have no callers until a chart opts in).

  /** Top-left italic-Fraunces kicker: a big number/word + optional sub-caption.
   *  Returns the <g> so the caller can position or animate it. */
  editorialKicker(layer, { num = "", sub = "", x = 0, y = 0, anchor = "start" } = {}) {
    const g = layer.append("g").attr("class", "chart-kicker").attr("transform", `translate(${x}, ${y})`);
    g.append("text").attr("class", "year-kicker").attr("text-anchor", anchor).text(num);
    if (sub) {
      g.append("text").attr("class", "year-kicker-sub").attr("text-anchor", anchor)
        .attr("dy", "1.5em").text(sub);
    }
    return g;
  }

  /** Top-right unit legend, e.g. "ANNUAL %" or "EUR / kWh" (uppercase, tracked). */
  unitLegend(layer, text, { x = 0, y = 0 } = {}) {
    return layer.append("text").attr("class", "legend-title")
      .attr("text-anchor", "end").attr("x", x).attr("y", y).text(text);
  }

  /** Capital-style dot at a data peak (faint ink by default; accent + pulse when focused). */
  peakDot(layer, x, y, { r = 4, focus = true } = {}) {
    return layer.append("circle")
      .attr("class", focus ? "capital-dot is-focus" : "capital-dot")
      .attr("cx", x).attr("cy", y).attr("r", r);
  }

  /** Reserve the accent for one element: mark every node in `selection` .is-dim (grey-down, house
   *  --dim-nonfocus level) except those matching isFocus(d,i), which get .is-focus (accent). */
  focusOne(selection, isFocus) {
    return selection
      .classed("is-dim",   (d, i) => !isFocus(d, i))
      .classed("is-focus", (d, i) => !!isFocus(d, i));
  }
  /** Clear all focus/dim state from a selection. */
  clearFocus(selection) { return selection.classed("is-dim", false).classed("is-focus", false); }

  /** Reveal helpers — hide (.reveal → opacity 0), then play in (.is-in → opacity 1). Reduced-motion
   *  is handled by base.css (transition-duration → 0ms) so the end-state lands instantly. */
  markReveal(selection) { return selection.classed("reveal", true).classed("is-in", false); }
  playReveal(selection) { return selection.classed("reveal", true).classed("is-in", true); }
}
