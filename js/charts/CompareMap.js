/* ============================================================
   CompareMap.js — before/after SWIPE-compare choropleth (owner review D1 stage 5).
   Two EU map layers coloured by annual HICP on the green→red ramp: the OLDER year fills the
   LEFT, the NEWER year fills the RIGHT, split by a draggable vertical divider the reader grabs
   and drags. Two <select> year pickers sit above the map (default 2019 vs 2025). The full-screen
   finish of the Choropleth chapter. Reuses the Choropleth projection + colour pattern. The drag is
   user-initiated, so it stays live under prefers-reduced-motion (which only gates auto-animation).
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { getCSS } from "../modules/CraftFX.js";

export class CompareMap extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 0, right: 0, bottom: 0, left: 0 }, aspect: 1.42 });
    const years = data.yearsCP00();
    this.years = years;
    // [owner review] Default to a green→red CONTRAST: 2019 (calm, green) vs 2022 (peak, red).
    // 2025 is also a low-inflation/green year, so a 2019-vs-2025 default showed all-green and never
    // demonstrated the ramp. The pickers still let the reader choose any pair (incl. 2025).
    this.yearA = years.includes(2019) ? 2019 : years[0];                 // older — left (green)
    this.yearB = years.includes(2022) ? 2022 : years[years.length - 1];  // newer — right (red, the peak)
    this.split = 0.5;                                                    // divider fraction [0,1]
    this.controlsEl = document.getElementById("chart-compareMap-controls");
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;

    const topo = this.data.topology;
    this._featCol = topojson.feature(topo, topo.objects.countries || topo.objects.europe);
    const eu = {
      type: "FeatureCollection",
      features: this._featCol.features.filter(d => this.data.countriesByCode.has(this.data.topoToIso(d.id)))
    };
    const proj = d3.geoConicConformal().parallels([35, 65]).rotate([-15, 0])
      .fitExtent([[12, 12], [this.W - 12, this.H - 12]], eu);
    this.path = d3.geoPath(proj);
    this.color = d3.scaleLinear()
      .domain([-2, 0, 2, 5, 10, 17])
      .range(["--seq-1", "--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5"].map(getCSS))
      .clamp(true);
    this._noData = getCSS("--rule-soft");

    // Clip for the RIGHT (newer) layer — its rect x/width track the divider.
    const defs = this.svg.append("defs");
    this._clipRect = defs.append("clipPath").attr("id", "cmp-clip")
      .append("rect").attr("x", 0).attr("y", 0).attr("width", this.W).attr("height", this.H);

    // Layer A (older) underneath, full; Layer B (newer) on top, clipped to the right of the divider.
    this.gA = this.svg.append("g").attr("class", "cmp-map cmp-map--a");
    this.gB = this.svg.append("g").attr("class", "cmp-map cmp-map--b").attr("clip-path", "url(#cmp-clip)");
    this._paint(this.gA, this.yearA);
    this._paint(this.gB, this.yearB);

    // Corner year labels (left = older, right = newer)
    this._labelA = this.svg.append("text").attr("class", "cmp-year-label").attr("x", 16).attr("y", 30);
    this._labelB = this.svg.append("text").attr("class", "cmp-year-label").attr("x", this.W - 16).attr("y", 30).attr("text-anchor", "end");
    this._updateYearLabels();

    // Divider line (the handle is HTML, below)
    this._dividerLine = this.svg.append("line").attr("class", "cmp-divider-line").attr("y1", 0).attr("y2", this.H);

    // Draggable handle (HTML, over the chart-body)
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "cmp-handle";
    handle.setAttribute("aria-label", "Drag to compare the two years");
    handle.innerHTML = `<span class="cmp-handle__grip" aria-hidden="true">‹ ›</span>`;
    this.container.appendChild(handle);
    this._handle = handle;

    this._buildControls();
    this._applySplit(this.split);
    this._wireDrag();
  }

  _paint(g, year) {
    g.selectAll("path.cmp-country").data(this._featCol.features, d => d.id).join("path")
      .attr("class", d => this.data.countriesByCode.has(this.data.topoToIso(d.id)) ? "cmp-country" : "cmp-country is-non-eu")
      .attr("d", this.path)
      .attr("vector-effect", "non-scaling-stroke")
      .attr("fill", d => {
        const v = this.data.hicpAnnual[this.data.topoToIso(d.id)]?.CP00?.[String(year)];
        return v == null ? this._noData : this.color(v);
      });
  }

  _updateYearLabels() {
    if (this._labelA) this._labelA.text(this.yearA);
    if (this._labelB) this._labelB.text(this.yearB);
  }

  /** Move the divider to fraction s ∈ [0,1]; the right (newer) layer is clipped to [s·W, W]. */
  _applySplit(s) {
    this.split = Math.max(0.04, Math.min(0.96, s));
    const dx = this.split * this.W;
    if (this._clipRect) this._clipRect.attr("x", dx).attr("width", this.W - dx);
    if (this._dividerLine) this._dividerLine.attr("x1", dx).attr("x2", dx);
    if (this._handle) this._handle.style.left = (this.split * 100).toFixed(2) + "%";
  }

  _buildControls() {
    if (!this.controlsEl || this.controlsEl.dataset.wired === "1") return;
    this.controlsEl.dataset.wired = "1";
    const opts = sel => this.years.map(y => `<option value="${y}"${y === sel ? " selected" : ""}>${y}</option>`).join("");
    this.controlsEl.innerHTML = `
      <label class="cmp-ctrl">Older&nbsp;<select id="cmp-year-a" aria-label="Older year (left)">${opts(this.yearA)}</select></label>
      <span class="cmp-ctrl-vs">vs</span>
      <label class="cmp-ctrl">Newer&nbsp;<select id="cmp-year-b" aria-label="Newer year (right)">${opts(this.yearB)}</select></label>`;
    this.controlsEl.querySelector("#cmp-year-a").addEventListener("change", e => {
      this.yearA = +e.target.value; this._paint(this.gA, this.yearA); this._updateYearLabels();
    });
    this.controlsEl.querySelector("#cmp-year-b").addEventListener("change", e => {
      this.yearB = +e.target.value; this._paint(this.gB, this.yearB); this._updateYearLabels();
    });
  }

  _wireDrag() {
    const fromX = clientX => {
      const r = this.svg.node().getBoundingClientRect();
      return r.width ? (clientX - r.left) / r.width : 0.5;
    };
    const onMove = e => this._applySplit(fromX(e.clientX));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      this._handle.classList.remove("is-dragging");
    };
    this._handle.addEventListener("pointerdown", e => {
      e.preventDefault();
      this._handle.classList.add("is-dragging");
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
    this._handle.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft")  { this._applySplit(this.split - 0.04); e.preventDefault(); }
      if (e.key === "ArrowRight") { this._applySplit(this.split + 0.04); e.preventDefault(); }
    });
    // Tap/click anywhere on the map jumps the divider there (quick compare).
    this.svg.on("click", e => this._applySplit(fromX(e.clientX)));
  }

  onThemeChange() { if (this.rendered) this.render(); }
  resize() { if (this.rendered) this.render(); }
}
