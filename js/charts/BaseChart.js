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
      // [A2 §D.1] Accessible name via aria-label, NOT a child <title> — an SVG <title> renders as a
      // native browser hover tooltip (owner: confusing). aria-label keeps the a11y name, no tooltip.
      const figure  = this.container.closest("figure");
      const chapter = this.container.closest(".chapter");
      const titleText = figure?.querySelector("h3")?.textContent
                     || chapter?.querySelector("h3")?.textContent
                     || "Chart";
      this.svg = d3.select(this.container)
        .append("svg")
        .attr("class", "chart-svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .attr("role", "img")
        .attr("aria-label", titleText);
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

  // [A2 §B.4] Run resetFn when the chapter un-pins (scrolls out of view), but ONLY after it has been
  // visible — the IO's initial not-yet-in-view callback must never fire the reset (that would
  // pre-complete/neutralise the chart before the reader ever reaches it).
  _watchUnpin(chapterEl, resetFn) {
    if (!chapterEl) return;
    if (this._unpinIO) this._unpinIO.disconnect();
    this._unpinSeen = false;
    this._unpinIO = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) this._unpinSeen = true;
      else if (this._unpinSeen) { try { resetFn(); } catch (err) { /* neutral reset failed; ignore */ } }
    }), { threshold: 0 });
    this._unpinIO.observe(chapterEl);
  }

  destroy() {
    this._themeUnsub && this._themeUnsub();
    // [P3.5] `_unsub` is a dead net and the old comment claimed otherwise: NO chart sets it. Every
    // chart that subscribes to watchChapterProgress stores the unsubscribe as `_unwatch` and
    // releases it in its own destroy() override (Housing, RaceChart, RateLevel, Heatmap, ScoreMap,
    // SmallMultiplesLine, Choropleth). Kept as a no-op hook rather than deleted so a future chart
    // can opt in, but it catches nothing today — do not rely on it.
    this._unsub && this._unsub();
    this._unpinIO && this._unpinIO.disconnect();
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
