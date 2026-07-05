/* ============================================================
   ScoreMap — CH9 "The scoreboard" (NEW, brief §6 CH9).
   The EU map, two-tone by the SAME real-wage computation the DivergingBar ledger
   uses (DataManager.realWageRows — never forked): jade where the minimum wage buys
   MORE than in 2019 (real change ≥ 0), claret where it buys LESS, neutral for the
   six countries that bargain instead of legislating a floor. 15 jade, 6 claret.
     motion: countries fill in a west→east stagger sweep on scroll (latched)
     step 1: the six claret countries pulse once
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { watchChapterProgress, smooth } from "../modules/ChartMotion.js";

function getCSS(name) { const m = name.match(/var\((--[^)]+)\)/); const n = m ? m[1] : name; return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

export class ScoreMap extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 0, right: 0, bottom: 0, left: 0 }, aspect: 0.92 });
    this._view = "map";
    this._revealP = 0;
  }

  size() {
    const w = this.container?.clientWidth || 620;
    const aspectH = Math.round(w / this.opts.aspect);
    const ch = this.container?.clientHeight || 0;
    return { width: w, height: (ch > 0 && ch < aspectH) ? ch : aspectH };
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    this.svg.attr("aria-label", "A map of the EU: green where the minimum wage buys more than in 2019 (fifteen countries), claret where it buys less (six), grey for the six countries with no statutory minimum wage.");

    // geo plumbing (reuse Choropleth's projection recipe)
    this.featCol = topojson.feature(this.data.topology, this.data.topology.objects.countries || this.data.topology.objects.europe);
    const euFeats = { type: "FeatureCollection", features: this.featCol.features.filter(d => this.data.countriesByCode.has(this.data.topoToIso(d.id))) };
    const proj = d3.geoConicConformal().parallels([35, 65]).rotate([-15, 0]).fitExtent([[8, 10], [width - 8, height - 10]], euFeats);
    this.path = d3.geoPath(proj); this.proj = proj;

    // real-wage rows (shared with DivergingBar) → code -> {real}
    const rows = this.data.realWageRows();
    const byCode = new Map(rows.map(r => [r.code, r]));
    this._byCode = byCode;
    const jade = getCSS("--cat-wages"), claret = getCSS("--accent"), other = getCSS("--cat-other"), grey = getCSS("--rule-soft");
    const target = (code) => { const r = byCode.get(code); return r == null ? other : (r.real >= 0 ? jade : claret); };
    this._target = target; this._grey = grey; this._other = other; this._claretHex = claret;
    const nPos = rows.filter(r => r.real >= 0).length, nNeg = rows.length - nPos;
    this._nPos = nPos; this._nNeg = nNeg;
    this._losers = rows.filter(r => r.real < 0).map(r => r.code);

    // longitude stagger (west→east)
    const cents = new Map();
    this.featCol.features.forEach(d => cents.set(d.id, d3.geoCentroid(d)));
    const euLons = euFeats.features.map(d => cents.get(d.id)[0]);
    const lonScale = d3.scaleLinear().domain([d3.min(euLons), d3.max(euLons)]).range([0, 0.7]).clamp(true);
    this._stagger = (d) => this.data.countriesByCode.has(this.data.topoToIso(d.id)) ? lonScale(cents.get(d.id)[0]) : 0;
    this._cents = cents;

    const gMap = this.svg.append("g").attr("class", "sc-map-layer");
    this._paths = gMap.selectAll("path.sc-country").data(this.featCol.features, d => d.id).join("path")
      .attr("class", d => this.data.countriesByCode.has(this.data.topoToIso(d.id)) ? "sc-country" : "sc-country sc-non-eu")
      .attr("d", this.path).attr("fill", grey).attr("vector-effect", "non-scaling-stroke")
      .on("mouseenter", (e, d) => this._hover(e, d))
      .on("mousemove", (e) => this.ctx.tooltip.move(e.clientX, e.clientY))
      .on("mouseleave", () => this.ctx.tooltip.hide());
    this._pulseLayer = this.svg.append("g").attr("class", "sc-pulse-layer").attr("pointer-events", "none");

    // kicker + legend
    this._kickNum = this.svg.append("text").attr("class", "kick-num").attr("x", 22).attr("y", 50).style("font-size", "44px").attr("fill", jade).text(String(nPos));
    this._kickLabel = this.svg.append("text").attr("class", "kick-label").attr("x", 24).attr("y", 82).text("BUY MORE THAN IN 2019");
    // legend (bottom-left)
    const lg = this.svg.append("g").attr("class", "sc-legend").attr("transform", `translate(22, ${height - 42})`);
    [["jade", jade, "buys more"], ["claret", claret, "buys less"], ["other", other, "no statutory floor"]].forEach(([k, col, lab], i) => {
      const row = lg.append("g").attr("transform", `translate(0, ${i * 15})`);
      row.append("rect").attr("width", 11).attr("height", 11).attr("rx", 2).attr("fill", col).attr("stroke", "var(--bg)").attr("stroke-width", 0.5);
      row.append("text").attr("class", "sc-legend-text").attr("x", 16).attr("y", 9.5).text(lab);
    });

    // motion
    this._revealP = 0;
    if (this.ctx.motion.reduced) { this._applyReveal(1); this._setView("map"); }
    else { this._applyReveal(0); this._wireScroll(); }
  }

  _wireScroll() { if (this._unwatch) this._unwatch(); const chapter = this.container.closest(".chapter"); this._unwatch = watchChapterProgress(chapter, p => this._onProgress(p)); this._watchUnpin(chapter, () => { this._applyReveal(1); this._setView("map"); }); }   /* [A2 §B.4] */
  _onProgress(p) { const t = smooth(Math.max(0, Math.min(1, p / 0.4))); if (t > this._revealP) this._applyReveal(t); }

  _applyReveal(np) {
    this._revealP = Math.max(this._revealP, np);
    const rp = this._revealP;
    const self = this;
    this._paths.each(function (d) {
      const el = d3.select(this);
      if (!self.data.countriesByCode.has(self.data.topoToIso(d.id))) return;   // non-EU stays base
      const lit = rp >= self._stagger(d);
      el.attr("fill", lit ? self._target(self.data.topoToIso(d.id)) : self._grey);
    });
  }

  onStep(index, el) {
    const view = (el && el.dataset.view) || ["map", "losers"][Math.max(0, Math.min(1, index))];
    if (this.container) { this.container.setAttribute("data-active-view", view); this.container.setAttribute("data-onstep", index); }
    this._setView(view);
  }

  _setView(view) {
    this._view = view;
    if (view === "losers") {
      this._kickNum.text(String(this._nNeg)).attr("fill", this._claretHex);
      this._kickLabel.text("STILL BUY LESS THAN IN 2019");
      this._pulseLosers();
    } else {
      this._kickNum.text(String(this._nPos)).attr("fill", getCSS("--cat-wages"));
      this._kickLabel.text("BUY MORE THAN IN 2019");
    }
  }

  _pulseLosers() {
    if (this.ctx.motion.reduced || !this._pulseLayer) return;
    this._pulseLayer.selectAll("*").remove();
    this._losers.forEach(code => {
      const iso = this.data.isoToTopo(code);
      const feat = this.featCol.features.find(f => f.id === iso || this.data.topoToIso(f.id) === code);
      if (!feat) return;
      const [cx, cy] = this.proj(d3.geoCentroid(feat));
      for (let k = 0; k < 2; k++) this._pulseLayer.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 4).attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 2).style("opacity", 0.7)
        .transition().delay(k * 260).duration(1000).ease(d3.easeCubicOut).attr("r", 20).style("opacity", 0).remove();
    });
  }

  _hover(e, d) {
    const code = this.data.topoToIso(d.id);
    if (!this.data.countriesByCode.has(code)) return;
    const r = this._byCode.get(code);
    const val = r == null ? `<div class="row"><span class="key">Minimum wage</span><span class="val">no statutory floor</span></div>`
      : `<div class="row"><span class="key">Real change vs 2019</span><span class="val">${r.real >= 0 ? "+" : ""}${r.real.toFixed(1)}%</span></div>`;
    this.ctx.tooltip.show(`<h5>${this.data.countryName(code)}</h5>${val}`, e.clientX, e.clientY);
  }

  destroy() { if (this._unwatch) this._unwatch(); super.destroy(); }
  resize() { if (this.rendered) this.render(); }
  onThemeChange() { this.render(); }
}
