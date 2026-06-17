/* ============================================================
   Choropleth — editorial European inflation map
   Year kicker, capital dots, pulse rings, scroll-camera, stamp
   annotation, top-3 labels, integrated mini-area-chart timeline.
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import {
  watchChapterProgress, progressBetween, smooth, lerp, tracePath
} from "../modules/ChartMotion.js";

// Event markers shown on top-3 sparklines during the bar-morph (Steps 5–6).
// Month indices are relative to "2019-01" (0).
const BAR_EVENT_MARKERS = [
  { idx: 37, label: "Russia invades Ukraine", date: "Feb 2022" },
  { idx: 42, label: "First ECB rate hike",    date: "Jul 2022" },
  { idx: 56, label: "ECB peaks at 4.5 %",     date: "Sep 2023" },
  { idx: 65, label: "First ECB rate cut",     date: "Jun 2024" }
];

const CAPITALS = {
  AT: [16.37, 48.21], BE: [4.35, 50.85], BG: [23.32, 42.70],
  HR: [15.97, 45.81], CY: [33.36, 35.17], CZ: [14.42, 50.07],
  DK: [12.57, 55.68], EE: [24.75, 59.44], FI: [24.93, 60.17],
  FR: [2.35, 48.85], DE: [13.40, 52.52], EL: [23.72, 37.98],
  HU: [19.04, 47.50], IE: [-6.26, 53.34], IT: [12.49, 41.90],
  LV: [24.10, 56.95], LT: [25.27, 54.69], LU: [6.13, 49.61],
  MT: [14.51, 35.90], NL: [4.90, 52.37], PL: [21.01, 52.23],
  PT: [-9.14, 38.72], RO: [26.10, 44.43], SK: [17.11, 48.15],
  SI: [14.50, 46.06], ES: [-3.70, 40.42], SE: [18.07, 59.33],
};

// [R2-elevate · narrative-true focus] Step 2 ("The map turns red") now uses focus:null so
// the WHOLE 2022 map blazes red/wine with no dimming or zoom — matching the copy ("11.5 %
// across the EU-27 … hardly any country closed below five percent"). Round-1 pixels showed
// the old focus:"EE" desaturating all of Europe to spotlight one country, which read as a grey
// field with a single red dot — the opposite of the narrative. The Baltic trio is already the
// emphasis of step 1; the peak step is about the continent-wide blaze.
const STEP_CONFIG = [
  { year: 2019, focus: null,                  caption: null,        pulse: false },
  { year: 2021, focus: ["EE", "LT", "LV"],    caption: "Estonia, Lithuania and Latvia peeled away first.", pulse: false },
  { year: 2022, focus: null,                  caption: null,        pulse: false },
  { year: 2024, focus: "ES",                  caption: "Spain cooled near the ECB target.", pulse: false },
  { year: 2025, focus: null,                  caption: null,        pulse: false },
];

function getCSS(name) {
  const m = name.match(/var\((--[^)]+)\)/); const n = m ? m[1] : name;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888";
}

function sparkPath(data, w, h) {
  if (!data || !data.length) return { d: "", lastX: 0, lastY: h, zeroY: h - 2, length: 0 };
  const x = d3.scaleLinear().domain([0, data.length - 1]).range([2, w - 2]);
  const ext = d3.extent(data, d => d.value);
  const y = d3.scaleLinear().domain([Math.min(0, ext[0]), Math.max(ext[1], 2)]).range([h - 2, 2]);
  const line = d3.line().x((_, i) => x(i)).y(d => y(d.value)).curve(d3.curveMonotoneX);
  const d = line(data);
  const last = data[data.length - 1];
  const tmp = document.createElementNS("http://www.w3.org/2000/svg", "path");
  tmp.setAttribute("d", d);
  const length = tmp.getTotalLength ? tmp.getTotalLength() : w;
  return { d, lastX: x(data.length - 1), lastY: y(last.value), zeroY: y(0), length };
}

export class Choropleth extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 0, right: 0, bottom: 0, left: 0 }, aspect: 0.9 });
    // On a short container (mobile), fall back to the actual container height instead of
    // the aspect-derived height — keeps the viewBox 1:1 with the rendered SVG so the map
    // doesn't get scaled into a sliver. Phase 4 mobile fix.
    this.size = function () {
      const w = this.container?.clientWidth || 600;
      const aspectH = Math.round(w / this.opts.aspect);
      const ch = this.container?.clientHeight || 0;
      const h = (ch > 0 && ch < aspectH) ? ch : aspectH;
      return { width: w, height: h };
    };
    this.controlsEl = document.getElementById("chart-choropleth-controls");
    this.years = (data.yearsCP00 ? data.yearsCP00() : []).filter(y => y >= 2015 && y <= 2025);
    if (!this.years.length) this.years = [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024];
    // [R2-elevate · entry coherence] First paint = 2019, the year of the opening narrative
    // step ("A continent on cruise control · 1.4 %"). Round-1 pixels showed the kicker/map
    // landing on a stale later year (e.g. 2022) before onStep(0) fired as the chapter scrolled
    // in — kicker, map fill, scrubber and narrative all disagreed at the reader's FIRST glance.
    // Anchoring to 2019 (falling back to the first available year) makes the entry frame
    // self-consistent regardless of scrollama trigger timing.
    this.year = this.years.includes(2019) ? 2019 : this.years[0];
    this.month = 11;   // December — matches the "year-end rate" framing + the scrubber default
    this.focusCode = null; this.lockedCode = null;
    this.playing = false; this._playTimer = null;
    this._stepCaption = null; this._stepPulse = false;
    this._kickerSeq = 0; this._camSeq = 0;
    this._centroidCache = new Map();
    // EU avg comes straight from the EU27_2020 aggregate (real Eurostat data, refreshed
    // by preprocessing/process_data.py). The hardcoded fallback below is a safety net
    // in case the dataset is rebuilt without the EU aggregate filter.
    const FALLBACK_EU27_ANNUAL_HICP = {
      2015: 0.1, 2016: 0.2, 2017: 1.6, 2018: 1.8, 2019: 1.4,
      2020: 0.7, 2021: 2.9, 2022: 9.2, 2023: 6.4, 2024: 2.6, 2025: 2.5
    };
    this._euAnnual = this.years.map(y => ({
      year: y,
      value: data.hicpAnnual["EU27_2020"]?.CP00?.[String(y)]
          ?? data.hicpAnnual["EA"]?.CP00?.[String(y)]
          ?? FALLBACK_EU27_ANNUAL_HICP[y]
          ?? this._meanAnnual(y)
    }));

    // Monthly EU average for the timeline line (smoother than annual dots)
    this._euMonthly = data.monthsCP00()
      .filter(t => { const y = +t.slice(0, 4); return y >= 2015 && y <= 2025; })
      .map(t => {
        const yr = +t.slice(0, 4), mo = +t.slice(5, 7);
        const v = data.hicpMonthly["EU27_2020"]?.CP00?.[t]
               ?? data.hicpMonthly["EU"]?.CP00?.[t]
               ?? this._meanMonthly(t);
        return v != null ? { time: t, year: yr, timeNum: yr + (mo - 1) / 12, value: v } : null;
      })
      .filter(Boolean);
  }

  _meanAnnual(year) {
    const vals = [];
    this.data.countriesByCode.forEach((meta, code) => {
      const v = this.data.hicpAnnual[code]?.CP00?.[String(year)];
      if (Number.isFinite(v)) vals.push(v);
    });
    return vals.length ? d3.mean(vals) : null;
  }

  _meanMonthly(time) {
    const vals = [];
    this.data.countriesByCode.forEach((meta, code) => {
      const v = this.data.hicpMonthly[code]?.CP00?.[time];
      if (Number.isFinite(v)) vals.push(v);
    });
    return vals.length ? d3.mean(vals) : null;
  }
  _euAvg(y) { return this._euAnnual.find(d => d.year === y)?.value ?? null; }
  _codeToFeatId(code) { return this.data.isoToTopo(code); }

  // [CH1-R1] return highest- and lowest-inflation EU country for a given year.
  // Returns { hi: {code, value, name}, lo: {code, value, name} } or null entries.
  _yearExtremes(year) {
    let hi = null, lo = null;
    this.data.countriesByCode.forEach((meta, code) => {
      const v = this.data.hicpAnnual[code]?.CP00?.[String(year)];
      if (!Number.isFinite(v)) return;
      if (hi == null || v > hi.value) hi = { code, value: v, name: this.data.countryName(code) };
      if (lo == null || v < lo.value) lo = { code, value: v, name: this.data.countryName(code) };
    });
    return { hi, lo };
  }

  // Refresh the kicker extremes text for the current year. Skips silently if the
  // elements haven't been created yet (e.g. before first render).
  _renderKickerExtremes() {
    if (!this.kickerHi || !this.kickerLo) return;
    const { hi, lo } = this._yearExtremes(this.year);
    const hiTxt = hi ? `▲ ${hi.code}  ${hi.value.toFixed(1)} %` : "";
    const loTxt = lo ? `▼ ${lo.code}  ${lo.value.toFixed(1)} %` : "";
    this.kickerHi.text(hiTxt);
    this.kickerLo.text(loTxt);
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    this._mapCardEl = null;  // stale reference — innerHTML wiped the previous card
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;

    this.featCol = topojson.feature(this.data.topology,
      this.data.topology.objects.countries || this.data.topology.objects.europe);
    const eu27Feats = {
      type: "FeatureCollection",
      features: this.featCol.features.filter(d => this.data.countriesByCode.has(this.data.topoToIso(d.id)))
    };
    // Lambert Conic Conformal — the standard editorial projection for Europe (lower
    // polar distortion than Mercator). A modest 1.15× zoom around the centre keeps
    // EU well-fit inside chart-body so the country fills are crisp; the vignette
    // mask on the SVG (see scrollytelling.css) does the work of softly dissolving
    // the rectangular frame so there's no hard square edge anywhere.
    const proj = d3.geoConicConformal()
      .parallels([35, 65])
      .rotate([-15, 0])
      .fitExtent([[6, 8], [this.W - 6, this.H - 6]], eu27Feats);
    const [tx0, ty0] = proj.translate();
    const k = 1.15;
    const cx = this.W / 2, cy = this.H / 2;
    proj.scale(proj.scale() * k);
    proj.translate([cx + (tx0 - cx) * k, cy + (ty0 - cy) * k]);
    this.proj = proj;
    this.path = d3.geoPath(proj);
    this.color = d3.scaleLinear()
      .domain([-2, 0, 2, 5, 10, 17])
      .range(["var(--seq-1)","var(--seq-1)","var(--seq-2)","var(--seq-3)","var(--seq-4)","var(--seq-5)"].map(getCSS))
      .clamp(true);

    const defs = this.svg.append("defs");
    const glow = defs.append("filter").attr("id", "country-glow")
      .attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    glow.append("feGaussianBlur").attr("stdDeviation", "1.5").attr("result", "b");
    const m = glow.append("feMerge");
    m.append("feMergeNode").attr("in", "b");
    m.append("feMergeNode").attr("in", "SourceGraphic");
    defs.append("filter").attr("id", "country-desat")
      .append("feColorMatrix").attr("type", "saturate").attr("values", "0.18");
    defs.append("clipPath").attr("id", "choro-map-clip")
      .append("rect").attr("x", 0).attr("y", 0).attr("width", this.W).attr("height", this.H);

    this.g.attr("transform", null);
    this._cam = { tx: 0, ty: 0, k: 1, side: null };
    this.svg.classed("is-pannable", true);

    // year kicker
    this.kickerG = this.svg.append("g").attr("class", "year-kicker-g").attr("pointer-events", "none");
    this.kickerYear = this.kickerG.append("text").attr("class", "year-kicker")
      .attr("x", 22).attr("y", 56).text(this.year);
    this.kickerSub = this.kickerG.append("text").attr("class", "year-kicker-sub")
      .attr("x", 26).attr("y", 76);
    // [CH1-R1] story-density extremes — highest / lowest country for the focused year
    this.kickerHi = this.kickerG.append("text").attr("class", "year-kicker-extreme year-kicker-extreme--hi")
      .attr("x", 26).attr("y", 96);
    this.kickerLo = this.kickerG.append("text").attr("class", "year-kicker-extreme year-kicker-extreme--lo")
      .attr("x", 26).attr("y", 112);
    const avg0 = this._euAvg(this.year);
    this.kickerSub.text(`EU avg · ${avg0 != null ? avg0.toFixed(1) + "%" : "—"}`);
    this._renderKickerExtremes();

    this._renderLegend();

    // No hard SVG clip — the chart-body has a CSS mask that fades the edges softly.
    this.gMap = this.svg.append("g").attr("class", "map-layer");
    const graticule = d3.geoGraticule().step([5, 5]);
    this.gMap.append("path").attr("class", "graticule")
      .attr("d", this.path(graticule()))
      .attr("fill", "none").attr("stroke", "var(--accent)")
      .attr("vector-effect", "non-scaling-stroke")
      .attr("stroke-width", 0.4).attr("opacity", 0.05);

    this.featCol.features.forEach(d => {
      if (!this._centroidCache.has(d.id)) this._centroidCache.set(d.id, d3.geoCentroid(d));
    });
    const euLons = this.featCol.features
      .filter(d => this.data.countriesByCode.has(this.data.topoToIso(d.id)))
      .map(d => this._centroidCache.get(d.id)[0]);
    this.lonStagger = d3.scaleLinear().domain([d3.min(euLons), d3.max(euLons)]).range([0, 480]).clamp(true);

    const noDataColor = getCSS("--rule-soft");
    this._noDataColor = noDataColor;
    this.countryPaths = this.gMap.selectAll("path.country")
      .data(this.featCol.features, d => d.id).join("path")
      .attr("class", d => this.data.countriesByCode.has(this.data.topoToIso(d.id)) ? "country" : "country is-non-eu")
      .attr("d", this.path)
      .attr("fill", noDataColor)
      .attr("vector-effect", "non-scaling-stroke")
      .on("mouseenter", (e, d) => {
        if (this.data.countriesByCode.has(this.data.topoToIso(d.id))) this._mouseInCountry = true;
      })
      .on("mousemove", (e, d) => this._hover(e, d))
      .on("mouseleave", () => { this._mouseInCountry = false; this._unhover(); })
      .on("click", (e, d) => {
        e.stopPropagation();
        if (this._lastDragEnd && (performance.now() - this._lastDragEnd) < 80) return;
        this._click(d);
      });

    // Scroll-zoom — only intercept wheel when Alt is held, so normal page scrolling is not hijacked.
    this.svg.on("wheel", (event) => {
      if (!event.altKey) return;
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      const t = this._cam || { tx: 0, ty: 0, k: 1 };
      const newK = Math.max(0.9, Math.min(8, t.k * factor));
      const [mx, my] = d3.pointer(event, this.svg.node());
      const wx = (mx - t.tx) / t.k;
      const wy = (my - t.ty) / t.k;
      this._cam = { tx: mx - wx * newK, ty: my - wy * newK, k: newK, side: t.side };
      this.gMap.interrupt("camera")
        .attr("transform", `translate(${this._cam.tx}, ${this._cam.ty}) scale(${this._cam.k})`);
    }, { passive: false });

    // Pan — mousedown on country starts drag; mouse delta updates _cam.tx/ty.
    // 4 px threshold distinguishes click from drag; drag suppresses the country-click handler.
    this._panState = null;
    this.countryPaths.on("mousedown.pan", (event, d) => {
      if (event.button !== 0) return;
      if (!this.data.countriesByCode.has(this.data.topoToIso(d.id))) return;
      const t = this._cam || { tx: 0, ty: 0, k: 1 };
      this._panState = {
        mx: event.clientX, my: event.clientY,
        tx: t.tx, ty: t.ty,
        moved: false,
        startTime: performance.now()
      };
      this.svg.classed("is-panning", true);
      event.preventDefault();
    });
    if (this._winPanMove) {
      window.removeEventListener("mousemove", this._winPanMove);
      window.removeEventListener("mouseup", this._winPanUp);
    }
    // Pan threshold: 6px in any direction. Short interactions = click, longer = drag.
    this._winPanMove = (e) => {
      if (!this._panState) return;
      const dx = e.clientX - this._panState.mx;
      const dy = e.clientY - this._panState.my;
      if (!this._panState.moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) this._panState.moved = true;
      if (!this._panState.moved) return;
      this._cam.tx = this._panState.tx + dx;
      this._cam.ty = this._panState.ty + dy;
      this.gMap.interrupt("camera")
        .attr("transform", `translate(${this._cam.tx}, ${this._cam.ty}) scale(${this._cam.k})`);
    };
    this._winPanUp = () => {
      if (!this._panState) return;
      // Time-based safeguard: <200ms presses are clicks even if cursor jittered past 6px
      const duration = performance.now() - this._panState.startTime;
      const wasDrag = this._panState.moved && duration > 200;
      this._panState = null;
      this.svg.classed("is-panning", false);
      if (wasDrag) this._lastDragEnd = performance.now();
    };
    window.addEventListener("mousemove", this._winPanMove);
    window.addEventListener("mouseup", this._winPanUp);

    // Capital dots removed for editorial clarity — the country fill already encodes magnitude,
    // and pulse rings on peak years obscured the country shapes. Keep an empty selection so the
    // existing call sites (`this.capSel.attr/filter/classed`) still work without conditionals.
    this.pulseG = this.gMap.append("g").attr("class", "pulses").attr("pointer-events", "none");
    this.capG = this.gMap.append("g").attr("class", "capitals").attr("pointer-events", "none");
    this.capSel = this.capG.selectAll("circle.capital-dot");

    this.labelG = this.gMap.append("g").attr("class", "top-labels").attr("pointer-events", "none");
    this.detailEl = document.getElementById("choropleth-detail");

    this.svg.on("click", () => this._click(null));

    this._buildControls();
    this._initialPaint();
    if (this.focusCode || this.lockedCode) {
      this._applyFocus();
      this._cameraTo(this.lockedCode || this.focusCode, false);
    }

    // Build the diverging-bar overlay layer (Step 5–6 morph target) and
    // subscribe to chapter scroll progress to drive the morph.
    this._buildBarLayer();
    if (this._chapterUnsub) { this._chapterUnsub(); this._chapterUnsub = null; }
    if (this.ctx?.motion?.reduced) {
      this._tickMorph(0);   // stay on map; reduced-motion users don't get the morph
    } else {
      const chapter = this.container.closest(".chapter");
      this._chapterUnsub = watchChapterProgress(chapter, p => this._tickMorph(p));
    }

    // [CH1 layout fix] _buildControls() (the ~132px timeline scrubber) lays out AFTER size()
    // was read at the top of render(), so on the FIRST mount the chart-body 1fr row is
    // transiently taller (controls row still empty) and the SVG baked a too-tall viewBox →
    // the map LETTERBOXED (rendered scaled-down, ~0.73×, floating with dead space). Once this
    // render settles, re-read the available height; if it changed, re-render ONCE at the
    // correct height so the viewBox matches the display and the map fills its panel. Charts
    // mount 400px before they enter the viewport (ScrollController IO rootMargin), so this
    // single reflow happens off-screen — no visible flash. Guarded so it can never loop.
    if (!this._reflowGuard) {
      requestAnimationFrame(() => {
        if (!this.rendered || !this.svg) return;
        const settledH = this.size().height;
        if (Math.abs(settledH - this.H) > 8) {
          this._reflowGuard = true;
          try { this.render(); } finally { this._reflowGuard = false; }
        }
      });
    }
  }

  _renderLegend() {
    const slot = document.getElementById("choro-legend-slot");
    const target = slot || this.container;
    target.querySelectorAll(".choro-legend-html").forEach(el => el.remove());

    // Build CSS gradient matching the color scale domain [-2, 0, 2, 5, 10, 17]
    const domainPts = [-2, 0, 2, 5, 10, 17];
    const dMin = domainPts[0], dMax = domainPts[domainPts.length - 1];
    const toPct = v => ((v - dMin) / (dMax - dMin) * 100).toFixed(1);
    const gradientStops = domainPts.map(v => `${this.color(v)} ${toPct(v)}%`).join(", ");

    const ticks = [
      { v: dMin, label: "< 0 %", anchor: "start" },
      { v: 2,    label: "2 %",   anchor: "center" },
      { v: 5,    label: "5 %",   anchor: "center" },
      { v: 10,   label: "10 %",  anchor: "center" },
      { v: dMax, label: "≥ 15 %", anchor: "end" },
    ];
    const tickHtml = ticks.map(t => {
      const xf = t.anchor === "start" ? "translateX(0)" : t.anchor === "end" ? "translateX(-100%)" : "translateX(-50%)";
      return `<span class="choro-legend-tick-label" style="left:${toPct(t.v)}%;transform:${xf}">${t.label}</span>`;
    }).join("");

    const div = document.createElement("div");
    div.className = "choro-legend-html";
    div.setAttribute("aria-hidden", "true");
    div.innerHTML = `
      <div class="choro-legend-bar-wrap">
        <div class="choro-legend-bar" style="background:linear-gradient(to right,${gradientStops})"></div>
        <div class="choro-legend-ticks">${tickHtml}</div>
      </div>`;
    target.appendChild(div);
  }

  _buildControls() {
    if (!this.controlsEl) return;
    if (this.controlsEl.dataset.wired === "1") {
      // BUG-CH-4 — re-sync the play-button icon to `this.playing` on every render path,
      // otherwise a theme change mid-play leaves the button visually paused.
      if (this.playBtn) this.playBtn.classList.toggle("is-playing", !!this.playing);
      this._buildTimeline();
      return;
    }
    this.controlsEl.dataset.wired = "1";
    this.controlsEl.innerHTML = `
      <div class="map-timeline-wrap">
        <svg class="map-timeline" viewBox="0 0 600 80" preserveAspectRatio="none" aria-hidden="true"></svg>
        <div class="map-timeline-years" aria-hidden="true"></div>
        <input type="range" id="chor-slider" class="vis-hidden" min="${this.years[0]}" max="${this.years.at(-1)}" step="1" value="${this.year}" aria-label="Year">
      </div>
      <div class="map-timeline-foot">
        <button class="play-btn" id="chor-play" aria-label="Play timeline" title="Play / pause">
          <span class="play-icon"><svg viewBox="0 0 12 12" width="11" height="11"><path d="M2.5 1.2 L10 6 L2.5 10.8 Z" fill="currentColor"/></svg></span>
        </button>
        <span class="map-zoom-group" role="group" aria-label="Map zoom">
          <button class="zoom-btn" id="chor-zoom-out" aria-label="Zoom out" title="Zoom out (Alt+wheel −)">
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true"><path d="M3 7 H11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>
          </button>
          <button class="zoom-btn" id="chor-zoom-in" aria-label="Zoom in" title="Zoom in (Alt+wheel +)">
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true"><path d="M3 7 H11 M7 3 V11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>
          </button>
        </span>
        <span class="ctrl-src">Source · Eurostat HICP (prc_hicp_manr) · annual rates</span>
      </div>`;
    this.sl = this.controlsEl.querySelector("#chor-slider");
    this.playBtn = this.controlsEl.querySelector("#chor-play");
    // Zoom in/out buttons — step the camera scale in 1.35× increments around the SVG center
    const zoomBy = (factor) => {
      const t = this._cam || { tx: 0, ty: 0, k: 1, side: null };
      const newK = Math.max(0.9, Math.min(8, t.k * factor));
      if (newK === t.k) return;
      const cx = this.W / 2, cy = this.H / 2;
      // Keep the point under the SVG center fixed while scaling
      const wx = (cx - t.tx) / t.k, wy = (cy - t.ty) / t.k;
      this._cam = { tx: cx - wx * newK, ty: cy - wy * newK, k: newK, side: t.side };
      const targetTransform = `translate(${this._cam.tx}, ${this._cam.ty}) scale(${newK})`;
      this.gMap.interrupt("camera")
        .transition("camera-zoom").duration(220).ease(d3.easeCubicOut)
        .attr("transform", targetTransform);
      // [CH1-W6] rAF-stall safety net — if d3 transition fails to tick (iframe / background
      // tab) force the final transform so the zoom button is never a visual no-op.
      if (this._zoomSafety) clearTimeout(this._zoomSafety);
      this._zoomSafety = setTimeout(() => {
        const live = this.gMap?.node()?.getAttribute("transform");
        if (live !== targetTransform) this.gMap.interrupt("camera").attr("transform", targetTransform);
      }, 280);
    };
    this.controlsEl.querySelector("#chor-zoom-in")?.addEventListener("click", () => zoomBy(1.35));
    this.controlsEl.querySelector("#chor-zoom-out")?.addEventListener("click", () => zoomBy(1 / 1.35));
    this.sl.addEventListener("input", () => {
      if (this.playing) this._togglePlay(false);
      const prev = this.year; this.year = +this.sl.value;
      this._animateYearChange(prev); this._updatePlayhead();
    });
    this.playBtn.addEventListener("click", () => this._togglePlay());
    this._buildTimeline();
  }
  _buildTimeline() {
    const svgEl = this.controlsEl && this.controlsEl.querySelector(".map-timeline");
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    const W = 600, H = 80, padT = 18, padB = 26;
    const monthly = this._euMonthly;
    const x = d3.scaleLinear().domain([this.years[0], this.years.at(-1)]).range([10, W - 10]);
    const yMax = Math.max((d3.max(monthly, d => d.value || 0) || 12) * 1.08, 12);
    const y = d3.scaleLinear().domain([0, yMax]).range([H - padB, padT]);
    this._timeX = x;
    this._timelineSvg = svg;
    this._yTimeline = y;
    svg.append("line").attr("class", "tl-target").attr("x1", 0).attr("x2", W).attr("y1", y(2)).attr("y2", y(2));
    svg.append("line").attr("class", "tl-base").attr("x1", 0).attr("x2", W).attr("y1", y(0)).attr("y2", y(0));
    const area = d3.area().x(d => x(d.timeNum)).y0(y(0)).y1(d => y(d.value || 0)).curve(d3.curveMonotoneX);
    const line = d3.line().x(d => x(d.timeNum)).y(d => y(d.value || 0)).curve(d3.curveMonotoneX);
    svg.append("path").attr("class", "tl-area").attr("d", area(monthly));
    svg.append("path").attr("class", "tl-line").attr("d", line(monthly));
    // [owner review D1] Year labels are HTML (positioned by %), NOT stretched SVG <text>: the
    // timeline SVG uses preserveAspectRatio="none", which squished/distorted SVG text. HTML stays crisp.
    const yearsDiv = this.controlsEl && this.controlsEl.querySelector(".map-timeline-years");
    if (yearsDiv) {
      yearsDiv.innerHTML = this.years.map(yr => {
        const isMajor = yr % 2 === 0 || yr === this.years.at(-1) || yr === this.years[0];
        const left = (x(yr) / W * 100).toFixed(2);
        return `<span class="map-timeline-year${isMajor ? " map-timeline-year--major" : ""}" style="left:${left}%">${isMajor ? yr : "·"}</span>`;
      }).join("");
    }
    const ph = svg.append("g").attr("class", "tl-playhead");
    ph.append("line").attr("class", "tl-playhead-line").attr("y1", padT - 12).attr("y2", H - padB);
    ph.append("circle").attr("class", "tl-playhead-dot").attr("r", 6).attr("cy", H - padB);
    // playhead-num removed — year is already shown by the big kicker on the map
    ph.append("text").attr("class", "tl-playhead-val").attr("y", padT - 4).attr("text-anchor", "middle");
    this._playhead = ph;

    // Scrub: month-level granularity. The fractional year position maps to a (year, month)
    // pair — the map only redraws when the year changes (annual data), but the playhead
    // label and position update smoothly each frame.
    const onScrub = (e) => {
      const [vbX] = d3.pointer(e, svgEl);
      const yrFrac = Math.max(this.years[0], Math.min(this.years.at(-1) + 11/12, x.invert(vbX)));
      const yrInt = Math.floor(yrFrac);
      const moIdx = Math.max(0, Math.min(11, Math.round((yrFrac - yrInt) * 12)));
      if (this.playing) this._togglePlay(false);
      const monthChanged = (this.month !== moIdx);
      const yearChanged = (yrInt !== this.year);
      this.month = moIdx;
      this._scrubFrac = yrInt + moIdx / 12;     // continuous position for the playhead
      if (yearChanged) {
        const prev = this.year; this.year = yrInt;
        if (this.sl) this.sl.value = yrInt;
        this._animateYearChange(prev);
      }
      if (yearChanged || monthChanged) this._updatePlayhead();
    };

    // Window-level drag so scrubbing works even when mouse leaves the SVG
    let dragging = false;
    if (this._tlWinMove) window.removeEventListener("mousemove", this._tlWinMove);
    if (this._tlWinUp)   window.removeEventListener("mouseup",   this._tlWinUp);
    this._tlWinMove = (e) => { if (dragging) onScrub(e); };
    this._tlWinUp   = ()  => { dragging = false; };
    window.addEventListener("mousemove", this._tlWinMove);
    window.addEventListener("mouseup",   this._tlWinUp);

    svg.on("mousedown", (e) => { dragging = true; onScrub(e); });
    svg.on("click", onScrub);
    svg.style("cursor", "pointer");

    // Phase 6 (C1) — keyboard arrow scrub when the timeline is focused.
    // Tab makes the SVG focusable; ←/→ step year, Home/End jump to first/last.
    svg.attr("tabindex", "0").attr("role", "slider")
      .attr("aria-label", "Year scrubber")
      .attr("aria-valuemin", this.years[0])
      .attr("aria-valuemax", this.years.at(-1))
      .attr("aria-valuenow", this.year);
    svg.on("keydown", (e) => {
      const step =
        e.key === "ArrowRight" || e.key === "ArrowUp"   ? +1
      : e.key === "ArrowLeft"  || e.key === "ArrowDown" ? -1
      : 0;
      let target = null;
      if (step) target = Math.max(this.years[0], Math.min(this.years.at(-1), this.year + step));
      else if (e.key === "Home") target = this.years[0];
      else if (e.key === "End")  target = this.years.at(-1);
      if (target == null || target === this.year) return;
      e.preventDefault();
      if (this.playing) this._togglePlay(false);
      const prev = this.year; this.year = target;
      if (this.sl) this.sl.value = target;
      svg.attr("aria-valuenow", target);
      this._animateYearChange(prev);
      this._updatePlayhead();
    });

    this._updatePlayhead();
  }

  _updatePlayhead() {
    if (!this._playhead || !this._timeX) return;
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const moIdx = (this.month != null) ? this.month : 11;       // default to Dec when not scrubbing
    const frac = this._scrubFrac != null ? this._scrubFrac : (this.year + moIdx / 12);
    const tx = this._timeX(frac);

    // Pull the monthly EU value (smoother than annual jumps as the user scrubs)
    const timeKey = `${this.year}-${String(moIdx + 1).padStart(2, "0")}`;
    const monthly = this._euMonthly?.find(d => d.time === timeKey);
    const vEU = monthly?.value;

    this._playhead.transition("ph").duration(280).ease(d3.easeCubicOut).attr("transform", `translate(${tx}, 0)`);

    // Combined label — eliminates the old EU/country overlap by stacking both in one block.
    // Country line is shown via _renderCountryLine when a country is locked or focused.
    const code = this.lockedCode || (Array.isArray(this.focusCode) ? null : this.focusCode);
    const vCtr = code ? this.data.hicpAnnual[code]?.CP00?.[String(this.year)] : null;
    let label = `${MONTHS[moIdx]} ${this.year}  ·  EU ${vEU != null ? vEU.toFixed(1) : "—"}%`;
    if (code && vCtr != null) label += `  ·  ${this.data.countryName(code).toUpperCase()} ${vCtr.toFixed(1)}%`;
    // Keep the long combined label inside the timeline bounds — flip anchor as the
    // playhead approaches the right edge so the text doesn't run off-screen.
    const anchor = frac > this.years.at(-1) - 1.2 ? "end" : (frac < this.years[0] + 1.2 ? "start" : "middle");
    const valSel = this._playhead.select(".tl-playhead-val");

    // [R3-motion · CH1 defect A — kicker/playhead phase-lock] The scrubber readout used to
    // slam its text SYNCHRONOUSLY while the year-kicker cross-faded over ~360 ms (+800 ms
    // fallback). At a scroll-step boundary a settled frame therefore caught the two readouts
    // disagreeing — kicker "2024" beside playhead "DEC 2022 · EU 10.4%" (film up/004838.png),
    // and on the down boundary the playhead jumped to DEC 2024 while the map still read 2022
    // (down/005594.png). Fix: when the YEAR changes, cross-fade the readout on the SAME
    // 180/280 ms rhythm as the kicker sub (see _swapKicker) so both flip together and never
    // show a contradictory year+value pair. Intra-year scrubs and idempotent re-enters keep
    // the instant update (no gratuitous re-fade → replay-safe on reverse scroll, taxonomy #4).
    const yearChanged = (this._phYear != null && this._phYear !== this.year);
    this._phYear = this.year;
    if (yearChanged && !this.ctx?.motion?.reduced) {
      this._phSeq = (this._phSeq || 0) + 1;
      const seq = this._phSeq;
      valSel.interrupt("phv-out").interrupt("phv-in");
      valSel.transition("phv-out").duration(180).style("opacity", 0).on("end", () => {
        valSel.attr("text-anchor", anchor).text(label)
          .transition("phv-in").duration(280).style("opacity", 1);
      });
      // Hard floor — if the d3 transition stalls (offscreen/background tab) force the final
      // text+opacity so the readout can never freeze on the previous year. Mirrors the
      // kicker's 800 ms safety net so the two stay phase-locked even when rAF is starved.
      clearTimeout(this._phValTimer);
      this._phValTimer = setTimeout(() => {
        if (seq !== this._phSeq) return;
        valSel.interrupt("phv-out").interrupt("phv-in");
        if (valSel.text() !== label) valSel.attr("text-anchor", anchor).text(label);
        valSel.style("opacity", 1);
      }, 700);
    } else {
      // Position-only update (intra-year scrub) or reduced-motion — set text instantly.
      valSel.interrupt("phv-out").interrupt("phv-in");
      valSel.attr("text-anchor", anchor).text(label).style("opacity", 1);
    }

    this._timelineSvg?.attr("aria-valuenow", this.year);
    this._timelineSvg?.attr("aria-valuetext", `${MONTHS[moIdx]} ${this.year}`);
  }

  _togglePlay(forceOn) {
    const want = forceOn != null ? forceOn : !this.playing;
    if (this.playing && !want) { clearInterval(this._playTimer); this.playing = false; }
    else if (!this.playing && want) {
      this.playing = true;
      this._playTimer = setInterval(() => {
        const idx = this.years.indexOf(this.year);
        const next = this.years[(idx + 1) % this.years.length];
        const prev = this.year; this.year = next;
        if (this.sl) this.sl.value = next;
        this._animateYearChange(prev); this._updatePlayhead();
      }, 1300);
    }
    if (!this.playBtn) return;
    this.playBtn.classList.toggle("is-playing", this.playing);
    const ic = this.playBtn.querySelector(".play-icon");
    ic.innerHTML = this.playing
      ? '<svg viewBox="0 0 12 12" width="11" height="11"><rect x="2.5" y="1.5" width="2.5" height="9" fill="currentColor"/><rect x="7" y="1.5" width="2.5" height="9" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 12 12" width="11" height="11"><path d="M2.5 1.2 L10 6 L2.5 10.8 Z" fill="currentColor"/></svg>';
  }

  _yearValues() {
    const m = new Map();
    this.data.countriesByCode.forEach((meta, code) => {
      const v = this.data.hicpAnnual[code]?.CP00?.[String(this.year)];
      if (Number.isFinite(v)) m.set(code, v);
    });
    return m;
  }

  _initialPaint() {
    const m = this._yearValues();
    const euSel = this.countryPaths.filter(d => this.data.countriesByCode.has(this.data.topoToIso(d.id)));
    // Set fill immediately (no transition) — fixes a d3-transition timing edge case
    // where the scheduled fill tween never starts on first paint of an offscreen-mounted SVG.
    euSel.attr("fill", d => {
      const v = m.get(this.data.topoToIso(d.id));
      return v == null ? this._noDataColor : this.color(v);
    });
    const sizeFor = code => { const v = m.get(code); return v == null ? 0 : Math.max(1.6, Math.sqrt(Math.abs(v)) * 1.6); };
    this.capSel.attr("r", d => sizeFor(d[0]));
    this._renderTopLabels(m);
  }

  _animateYearChange(prevYear) {
    const m = this._yearValues();
    const euSel = this.countryPaths.filter(d => this.data.countriesByCode.has(this.data.topoToIso(d.id)));
    euSel.attr("fill", d => {
      const v = m.get(this.data.topoToIso(d.id));
      return v == null ? this._noDataColor : this.color(v);
    });
    const sizeFor = code => { const v = m.get(code); return v == null ? 0 : Math.max(1.6, Math.sqrt(Math.abs(v)) * 1.6); };
    this.capSel.attr("r", d => sizeFor(d[0]));
    this._swapKicker(prevYear, this.year);
    this._renderTopLabels(m);
    this._renderDetail();
    this._updateCountryLabel();
    const labelCode = this.lockedCode || this.focusCode;
    if (Array.isArray(labelCode)) {
      this._renderMultiLabels(labelCode);
    } else if (labelCode && this._mapCardEl) {
      this._updateMapLabelValue(labelCode);
    }
  }

  _swapKicker(prev, next) {
    const goingUp = next > prev;
    const t = this.kickerYear;
    this._kickerSeq++;
    const seq = this._kickerSeq;

    // [R3-motion · CH1 defect C — reduced-motion kicker snap] The kicker (year + EU-avg sub +
    // extremes) used to run its cross-fade transitions UNCONDITIONALLY, so under
    // prefers-reduced-motion a scroll-step year change still animated — and the film caught the
    // kicker mid-fade showing a STALE year beside an already-updated map/scrubber
    // (reduced down/005594.png: ghost "2022" over the Spain-2024 card). Reduced-motion must jump
    // straight to the end state (CLAUDE.md §4 / taxonomy #11). Bumping _kickerSeq above already
    // voids any in-flight transition's late callbacks/timeouts; here we hard-set the end state.
    if (this.ctx?.motion?.reduced) {
      t.interrupt("kicker-out").interrupt("kicker-in")
        .text(next).attr("transform", "translate(0, 0)").style("opacity", 1);
      const v = this._euAvg(next);
      this.kickerSub.interrupt("ks-out").interrupt("ks-in")
        .text(`EU avg · ${v != null ? v.toFixed(1) + "%" : "—"}`).style("opacity", 1);
      if (this.kickerHi && this.kickerLo) {
        this.kickerHi.interrupt("ke-out").interrupt("ke-in");
        this.kickerLo.interrupt("ke-out").interrupt("ke-in");
        this._renderKickerExtremes();
        this.kickerHi.style("opacity", 1);
        this.kickerLo.style("opacity", 1);
      }
      return;
    }

    t.interrupt("kicker-out").interrupt("kicker-in");
    t.transition("kicker-out").duration(200).ease(d3.easeCubicIn)
      .attr("transform", `translate(0, ${goingUp ? -14 : 14})`).style("opacity", 0)
      .on("end", function () {
        d3.select(this).text(next)
          .attr("transform", `translate(0, ${goingUp ? 14 : -14})`)
          .transition("kicker-in").duration(360).ease(d3.easeCubicOut)
          .attr("transform", "translate(0, 0)").style("opacity", 1);
      });
    setTimeout(() => {
      if (seq !== this._kickerSeq) return;
      if (t.text() !== String(next)) t.text(next);
      t.attr("transform", "translate(0, 0)").style("opacity", 1);
    }, 800);
    const v = this._euAvg(next);
    const txt = `EU avg · ${v != null ? v.toFixed(1) + "%" : "—"}`;
    this.kickerSub.interrupt("ks-out").interrupt("ks-in");
    this.kickerSub.transition("ks-out").duration(180).style("opacity", 0).on("end", () => {
      this.kickerSub.text(txt).transition("ks-in").duration(280).style("opacity", 1);
    });
    setTimeout(() => {
      if (seq !== this._kickerSeq) return;
      if (this.kickerSub.text() !== txt) this.kickerSub.text(txt);
      this.kickerSub.style("opacity", 1);
    }, 700);
    // [CH1-R1] cross-fade the extremes lines together with the subline
    if (this.kickerHi && this.kickerLo) {
      this.kickerHi.interrupt("ke-out").interrupt("ke-in");
      this.kickerLo.interrupt("ke-out").interrupt("ke-in");
      this.kickerHi.transition("ke-out").duration(180).style("opacity", 0);
      this.kickerLo.transition("ke-out").duration(180).style("opacity", 0).on("end", () => {
        this._renderKickerExtremes();
        this.kickerHi.transition("ke-in").duration(280).style("opacity", 1);
        this.kickerLo.transition("ke-in").duration(280).style("opacity", 1);
      });
      setTimeout(() => {
        if (seq !== this._kickerSeq) return;
        this._renderKickerExtremes();
        this.kickerHi.style("opacity", 1);
        this.kickerLo.style("opacity", 1);
      }, 700);
    }
  }

  _applyFocus() {
    // focusCode can be a single ISO string OR an array (multi-country narrative step).
    // lockedCode (from clicking) always takes precedence and is always a single code.
    const codeRaw = this.lockedCode || this.focusCode;
    const codes = codeRaw == null ? [] : (Array.isArray(codeRaw) ? codeRaw : [codeRaw]);
    const codeSet = new Set(codes);
    this.countryPaths.classed("is-dim", false).classed("is-focus", false);
    this.capSel.classed("is-focus", false);
    if (codes.length) {
      this.countryPaths.filter(d => this.data.countriesByCode.has(this.data.topoToIso(d.id)))
        .classed("is-dim", d => !codeSet.has(this.data.topoToIso(d.id)));
      this.countryPaths.filter(d => codeSet.has(this.data.topoToIso(d.id))).classed("is-focus", true).raise();
    }
    if (this.labelG) this.labelG.transition("tl-vis").duration(280).style("opacity", codes.length ? 0 : 1);
  }

  _computeCamera(code) {
    if (!code) return { tx: 0, ty: 0, k: 1, side: null };
    const featId = this._codeToFeatId(code);
    const feat = this.featCol.features.find(f => f.id === featId || this.data.topoToIso(f.id) === code);
    if (!feat) return { tx: 0, ty: 0, k: 1, side: null };
    const b = this.path.bounds(feat);
    const fw = Math.max(1, b[1][0] - b[0][0]);
    const fh = Math.max(1, b[1][1] - b[0][1]);
    const cx = (b[0][0] + b[1][0]) / 2;
    const cy = (b[0][1] + b[1][1]) / 2;
    const W = this.W, H = this.H;
    const countryIsEast = cx > W * 0.5;
    const stampOnRight = !countryIsEast;
    const targetCx = stampOnRight ? W * 0.34 : W * 0.66;
    const targetCy = H * 0.55;
    // [S1-3] Cap max zoom at 2.5 so the rest of Europe stays in the frame for
    // geographic context. A 3.2x zoom on a small country (e.g. Estonia) hid
    // every neighbour off-screen and broke the "where in Europe" narrative.
    const k = Math.min((W * 0.42) / fw, (H * 0.55) / fh, 2.5);
    const kFinal = Math.max(1.4, k);
    return { tx: targetCx - cx * kFinal, ty: targetCy - cy * kFinal, k: kFinal, side: stampOnRight ? "right" : "left" };
  }

  // Bounding-box camera for a SET of countries (used by multi-country narrative steps).
  _computeCameraMulti(codes) {
    if (!codes || !codes.length) return { tx: 0, ty: 0, k: 1, side: null };
    let xs = [], ys = [];
    codes.forEach(code => {
      const featId = this._codeToFeatId(code);
      const feat = this.featCol.features.find(f => f.id === featId || this.data.topoToIso(f.id) === code);
      if (!feat) return;
      const b = this.path.bounds(feat);
      xs.push(b[0][0], b[1][0]);
      ys.push(b[0][1], b[1][1]);
    });
    if (!xs.length) return { tx: 0, ty: 0, k: 1, side: null };
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const fw = Math.max(1, maxX - minX);
    const fh = Math.max(1, maxY - minY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const W = this.W, H = this.H;
    const targetCx = W * 0.66;   // cluster on the right; narrative card sits left
    const targetCy = H * 0.55;
    // [S1-3] Multi-country focus — cap max zoom at 2.0 (less aggressive than
    // single-country) since a cluster already takes more area.
    const k = Math.min((W * 0.42) / fw, (H * 0.60) / fh, 2.0);
    const kFinal = Math.max(1.2, k);
    return { tx: targetCx - cx * kFinal, ty: targetCy - cy * kFinal, k: kFinal, side: "left" };
  }

  _cameraTo(code, animate = true) {
    if (!this.gMap) return;
    this._camSeq++;
    const seq = this._camSeq;
    const target = Array.isArray(code) ? this._computeCameraMulti(code) : this._computeCamera(code);
    const duration = animate && !this.ctx.motion.reduced ? 1100 : 0;
    const targetTransform = `translate(${target.tx}, ${target.ty}) scale(${target.k})`;
    this.gMap.interrupt("camera");
    this.gMap.transition("camera").duration(duration).ease(d3.easeCubicInOut)
      .attr("transform", targetTransform)
      .on("end", () => {
        if (seq !== this._camSeq) return;
        this._cam = target;
        if (this._stepPulse && code) this._emitPulse(code);
      });
    // [CH1-W2] rAF-stall safety net — in iframes / background tabs d3 transitions can
    // sit in CREATED state forever and the camera never moves. After the transition
    // would have completed, force the final transform + _cam state so label positioning
    // and subsequent interactions remain consistent.
    if (this._camSafety) clearTimeout(this._camSafety);
    this._camSafety = setTimeout(() => {
      if (seq !== this._camSeq) return;
      if (this._cam !== target) {
        this.gMap.interrupt("camera").attr("transform", targetTransform);
        this._cam = target;
      }
    }, duration + 80);
    if (!animate) { this._cam = target; }
    this._renderDetail();
  }

  _emitPulse(code) {
    // Pulse rings disabled — they competed with the country fill and obscured the shapes at peak years.
    // The peak country is already emphasized through camera zoom + focus stroke + map label.
    return;
  }

  _renderDetail() {
    const el = this.detailEl || (this.detailEl = document.getElementById("choropleth-detail"));
    if (!el) return;
    // Detail panel shows ONE country. For multi-country narrative steps (focus is an
    // array), suppress the detail panel — the map's multi-labels carry the message.
    const codeRaw = this.lockedCode || this.focusCode;
    const code = (codeRaw && !Array.isArray(codeRaw)) ? codeRaw : null;
    if (!code) {
      el.setAttribute("data-active", "false");
      return;
    }
    const v = this.data.hicpAnnual[code]?.CP00?.[String(this.year)];
    // [CH1-W1] Step caption is editorial annotation for the AUTO-focused country only.
    // When the user manually locks a different country, the caption no longer applies.
    const focusSingle = (this.focusCode && !Array.isArray(this.focusCode)) ? this.focusCode : null;
    const captionApplies = this._stepCaption && (this.lockedCode == null
      || (focusSingle && this.lockedCode === focusSingle));
    const sentence = captionApplies ? this._stepCaption : `Annual HICP inflation in ${this.year}.`;
    const arr = Object.entries(this.data.hicpMonthly[code]?.CP00 || {})
      .map(([time, value]) => ({ time, value }))
      .filter(d => Number.isFinite(d.value))
      .sort((a, b) => a.time.localeCompare(b.time))
      .slice(-84);
    let sparkSvg = "";
    if (arr.length > 12) {
      const sw = 260, sh = 44, axisH = 14;
      const totalH = sh + axisH;
      const sp = sparkPath(arr, sw, sh);
      const xScale = d3.scaleLinear().domain([0, arr.length - 1]).range([2, sw - 2]);
      const yearTicks = [];
      let lastYr = null;
      arr.forEach((d, i) => {
        const yr = d.time.slice(0, 4);
        if (yr !== lastYr) { yearTicks.push({ yr, x: xScale(i) }); lastYr = yr; }
      });
      const tickEls = yearTicks.map(t =>
        `<text class="ms-tick" x="${t.x.toFixed(1)}" y="${sh + 11}">${t.yr}</text>`
      ).join("");
      sparkSvg = `
        <svg class="map-detail__spark" viewBox="0 0 ${sw} ${totalH}" preserveAspectRatio="none">
          <path class="ms-zero" d="M 0 ${sp.zeroY} L ${sw} ${sp.zeroY}" />
          <path class="ms-line" d="${sp.d}" pathLength="1"
                style="stroke-dasharray:1;stroke-dashoffset:1;animation:msTrace 900ms var(--ease-out) 120ms forwards;" />
          <circle class="ms-dot" cx="${sp.lastX}" cy="${sp.lastY}" r="0"
                  style="animation:msDot 320ms var(--ease-out) 900ms forwards;" />
          ${tickEls}
        </svg>`;
    }
    el.innerHTML = `
      <button class="map-detail__close" type="button" aria-label="Close detail">×</button>
      <div class="map-detail__eyebrow">${code} · ${this.data.countryName(code).toUpperCase()}</div>
      <div class="map-detail__num is-flip" key="${code}-${this.year}">${v == null ? "—" : v.toFixed(1) + "%"}</div>
      <p class="map-detail__sentence">${sentence}</p>
      <div class="map-detail__sub">Monthly trend · last 7 years</div>
      ${sparkSvg}`;
    el.setAttribute("data-active", "true");
    el.querySelector(".map-detail__close")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.lockedCode = null;
      this.focusCode = null;
      this._stepCaption = null;
      this._applyFocus();
      this._cameraTo(null);
    });
  }

  _renderTopLabels(m) {
    // Disabled — the auto-rendered "top-3 worst countries" percentages on the map
    // were distracting during timeline scrubbing. Country values are now revealed
    // on hover (light tooltip) and click (full card).
    if (this.labelG) this.labelG.selectAll("*").remove();
  }

  _click(d) {
    if (!d) {
      this.lockedCode = null;
    } else {
      const iso = this.data.topoToIso(d.id);
      if (!this.data.countriesByCode.has(iso)) {
        // Click on ocean / non-EU country → reset
        this.lockedCode = null;
      } else {
        this.lockedCode = (this.lockedCode === iso) ? null : iso;
      }
    }
    this._applyFocus();
    this._cameraTo(this.lockedCode || this.focusCode);
    this._renderCountryLine(this.lockedCode);

    // Label: remove immediately, show after camera settles
    this._removeMapLabel();
    clearTimeout(this._labelTimeout);
    if (this.lockedCode) {
      const code = this.lockedCode;
      const delay = !this.ctx.motion.reduced ? 1150 : 0;
      this._labelTimeout = setTimeout(() => { if (this.lockedCode === code) this._renderMapLabel(code); }, delay);
    }
  }

  _removeMapLabel() {
    if (this._mapCardEl) {
      this._mapCardEl.remove();
      this._mapCardEl = null;
    }
    // Also clear any legacy SVG-based label
    this.svg?.selectAll(".map-country-label-g").remove();
  }

  _renderMapLabel(code) {
    this._removeMapLabel();
    if (!code || !this.featCol || !this.container) return;
    const featId = this._codeToFeatId(code);
    const feat = this.featCol.features.find(f => f.id === featId || this.data.topoToIso(f.id) === code);
    if (!feat) return;

    const v = this.data.hicpAnnual[code]?.CP00?.[String(this.year)];
    const name = this.data.countryName(code).toUpperCase();
    const valText = v != null ? v.toFixed(1) + " %" : "—";
    const swatchColor = v != null ? this.color(v) : this._noDataColor;

    // Compute the country centroid in CSS pixels relative to chart-body.
    // The SVG scales its viewBox; we convert SVG units → screen pixels via getBoundingClientRect.
    const [gx, gy] = this.proj(d3.geoCentroid(feat));
    const cam = this._cam || { tx: 0, ty: 0, k: 1 };
    const svgX = gx * cam.k + cam.tx;
    const svgY = gy * cam.k + cam.ty;

    const svgEl = this.svg.node();
    const svgRect = svgEl.getBoundingClientRect();
    const cbRect = this.container.getBoundingClientRect();
    const scaleX = svgRect.width / this.W;
    const scaleY = svgRect.height / this.H;
    const pxX = (svgRect.left - cbRect.left) + svgX * scaleX;
    const pxY = (svgRect.top - cbRect.top) + svgY * scaleY;

    // Phase 6 (A3) — country rank within the EU for the current year
    const rankText = this._rankLabel(code, this.year);

    const card = document.createElement("div");
    card.className = "map-country-card";
    card.innerHTML = `
      <div class="map-country-card__head">
        <span class="map-country-card__dot" style="background:${swatchColor}"></span>
        <span class="map-country-card__name">${name}</span>
      </div>
      <div class="map-country-card__val">${valText}</div>
      <div class="map-country-card__rank">${rankText}</div>
      <svg class="map-country-card__spark" width="92" height="26" viewBox="0 0 92 26" aria-hidden="true"></svg>
    `;
    this.container.appendChild(card);
    this._mapCardEl = card;
    this._drawCardSparkline(code);

    // Position above the centroid; clamp to chart-body inner area so the card never clips out.
    const cardW = card.offsetWidth;
    const cardH = card.offsetHeight;
    const cbW = cbRect.width, cbH = cbRect.height;
    const padX = 14;
    const padY = 14;
    const left = Math.max(padX, Math.min(cbW - cardW - padX, pxX - cardW / 2));
    const top  = Math.max(padY, Math.min(cbH - cardH - padY, pxY - cardH - 22));

    card.style.left = `${left}px`;
    card.style.top  = `${top}px`;

    requestAnimationFrame(() => card.classList.add("is-in"));
  }

  _updateMapLabelValue(code) {
    if (!this._mapCardEl) return;
    const v = this.data.hicpAnnual[code]?.CP00?.[String(this.year)];
    const swatchColor = v != null ? this.color(v) : this._noDataColor;
    const valEl = this._mapCardEl.querySelector(".map-country-card__val");
    const dotEl = this._mapCardEl.querySelector(".map-country-card__dot");
    const rankEl = this._mapCardEl.querySelector(".map-country-card__rank");
    if (!valEl) return;
    valEl.classList.add("is-flipping");
    clearTimeout(this._valFlipTimer);
    this._valFlipTimer = setTimeout(() => {
      valEl.textContent = v != null ? v.toFixed(1) + " %" : "—";
      if (dotEl) dotEl.style.background = swatchColor;
      if (rankEl) rankEl.textContent = this._rankLabel(code, this.year);
      valEl.classList.remove("is-flipping");
      // Move the current-year highlight on the inline sparkline
      this._updateCardSparklineDot(code);
    }, 180);
  }

  // Phase 6 (A3) — country's EU rank for a given year, formatted as "Nth of 27"
  _rankLabel(code, year) {
    const entries = [];
    this.data.countriesByCode.forEach((_, c) => {
      const v = this.data.hicpAnnual[c]?.CP00?.[String(year)];
      if (Number.isFinite(v)) entries.push({ code: c, value: v });
    });
    if (!entries.length) return "";
    entries.sort((a, b) => b.value - a.value);    // highest first
    const idx = entries.findIndex(e => e.code === code);
    if (idx < 0) return "";
    const rank = idx + 1, total = entries.length;
    const suffix = (n => {
      const m = n % 100;
      if (m >= 11 && m <= 13) return "th";
      switch (n % 10) { case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th"; }
    })(rank);
    return `${rank}${suffix} of ${total} in the EU`;
  }

  // Phase 5 improvement (Option C) — tiny 92×26 annual-trajectory sparkline in the card.
  // 2015→2025 annual values, baseline at 0, accent-color dot at the current year.
  _drawCardSparkline(code) {
    if (!this._mapCardEl) return;
    const svgEl = this._mapCardEl.querySelector(".map-country-card__spark");
    if (!svgEl) return;
    const W = 92, H = 26, padX = 4, padY = 4;
    const annual = this.data.hicpAnnual[code]?.CP00 || {};
    const series = this.years.map(y => ({ year: y, value: Number.isFinite(annual[String(y)]) ? annual[String(y)] : null }));
    const valid = series.filter(d => d.value != null);
    if (valid.length < 2) return;

    const vMin = Math.min(0, d3.min(valid, d => d.value));
    const vMax = Math.max(2, d3.max(valid, d => d.value));
    const x = d3.scaleLinear().domain([this.years[0], this.years.at(-1)]).range([padX, W - padX]);
    const y = d3.scaleLinear().domain([vMin, vMax]).range([H - padY, padY]);

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    // Faint baseline at zero (only if 0 is inside the domain)
    if (vMin <= 0 && vMax >= 0) {
      svg.append("line").attr("class", "map-country-card__spark-base")
        .attr("x1", padX).attr("x2", W - padX).attr("y1", y(0)).attr("y2", y(0));
    }
    const line = d3.line()
      .defined(d => d.value != null)
      .x(d => x(d.year))
      .y(d => y(d.value))
      .curve(d3.curveMonotoneX);
    svg.append("path").attr("class", "map-country-card__spark-line").attr("d", line(series));
    // Current-year highlight dot
    svg.append("circle").attr("class", "map-country-card__spark-dot")
      .attr("r", 2.5).attr("cx", x(this.year)).attr("cy", y(annual[String(this.year)] ?? 0));
    // Stash the scales so the dot can be repositioned without redrawing the whole spark
    this._sparkScales = { x, y, code };
  }

  _updateCardSparklineDot(code) {
    const svgEl = this._mapCardEl?.querySelector(".map-country-card__spark");
    if (!svgEl || !this._sparkScales || this._sparkScales.code !== code) {
      this._drawCardSparkline(code);
      return;
    }
    const { x, y } = this._sparkScales;
    const v = this.data.hicpAnnual[code]?.CP00?.[String(this.year)];
    const dot = d3.select(svgEl).select(".map-country-card__spark-dot");
    // CSS transition on cx/cy handles the smooth glide (more reliable than d3.transition in headless)
    dot.attr("cx", x(this.year)).attr("cy", y(v ?? 0));
  }

  _renderCountryLine(code) {
    if (!this._timelineSvg) return;
    const existing = this._timelineSvg.selectAll(".ctr-line-g");
    if (!code) {
      this._ctrCode = null;
      existing.transition("ctr-exit").duration(350).style("opacity", 0)
        .on("end", function () { d3.select(this).remove(); });
      return;
    }
    existing.remove();
    this._ctrCode = code;

    const data = this.years.map(yr => ({
      year: yr,
      value: this.data.hicpAnnual[code]?.CP00?.[String(yr)] ?? null
    }));
    if (!data.some(d => d.value != null)) return;

    const x = this._timeX, y = this._yTimeline;
    if (!x || !y) return;

    const lineGen = d3.line()
      .x(d => x(d.year)).y(d => y(d.value))
      .defined(d => d.value != null)
      .curve(d3.curveMonotoneX);

    const g = this._timelineSvg.append("g").attr("class", "ctr-line-g");
    const path = g.append("path").attr("class", "ctr-line")
      .attr("d", lineGen(data)).attr("fill", "none");

    const L = path.node()?.getTotalLength() || 0;
    path.attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L)
      .transition("ctr-draw").duration(900).ease(d3.easeCubicOut)
      .attr("stroke-dashoffset", 0);

    this._updateCountryLabel();
  }

  _updateCountryLabel() {
    // The standalone country-on-timeline text label has been merged into the playhead val
    // (see _updatePlayhead) so the EU figure and the country figure never overlap. The
    // purple country line itself still draws via _renderCountryLine — only its inline
    // text annotation is removed.
    if (!this._timelineSvg) return;
    this._timelineSvg.selectAll(".ctr-label").remove();
  }

  _hover(event, d) {
    // Light hover — just country name + current-year value. Clicking the country
    // promotes it to the full card with rank + sparkline (see _renderMapLabel).
    const iso = this.data.topoToIso(d.id);
    if (!this.data.countriesByCode.has(iso)) { this.ctx.tooltip.hide(); return; }
    const v = this.data.hicpAnnual[iso]?.CP00?.[String(this.year)];
    const html = `<h5>${this.data.countryName(iso)}</h5>
      <div class="row"><span class="key">${this.year}</span><span class="val">${v == null ? "—" : v.toFixed(1) + " %"}</span></div>`;
    this.ctx.tooltip.show(html, event.clientX, event.clientY);
  }
  _unhover() { this.ctx.tooltip.hide(); }

  onStep(index, el) {
    const cfg = STEP_CONFIG[Math.max(0, Math.min(STEP_CONFIG.length - 1, index))];
    if (this.playing) this._togglePlay(false);
    const prev = this.year;
    this.year = cfg.year;
    if (this.sl) this.sl.value = cfg.year;
    this.focusCode = cfg.focus;
    this._stepCaption = cfg.caption;
    this._stepPulse = !!cfg.pulse;
    this.lockedCode = null;
    this._animateYearChange(prev);
    this._updatePlayhead();
    this._applyFocus();
    this._cameraTo(this.focusCode);

    // Auto-label the focused country so it stays in sync with the narrative.
    // - Single string (e.g. "EE"): full editorial card (name + value + rank + sparkline).
    // - Array (e.g. ["EE","LT","LV"]): light text labels at each centroid, one per country.
    this._removeMapLabel();
    this.svg?.selectAll(".multi-label-text").remove();
    clearTimeout(this._labelTimeout);
    if (this.focusCode) {
      const code = this.focusCode;
      const delay = !this.ctx.motion.reduced ? 1150 : 0;
      this._labelTimeout = setTimeout(() => {
        if (this.focusCode !== code || this.lockedCode) return;
        if (Array.isArray(code)) this._renderMultiLabels(code);
        else this._renderMapLabel(code);
      }, delay);
    }
  }

  // ============================================================
  // Steps 5–6 morph — map of Europe → diverging bar of cumulative
  // HICP since Jan 2019, ranked around the EU27 mean.
  // Builds a sibling SVG inside chart-body (NO mask, so the bars are
  // fully crisp), driven by scroll progress 0..1 on the chapter.
  // ============================================================

  _buildBarLayer() {
    // Remove any previous layer (re-render scenario)
    this.container?.querySelectorAll(".choro-bars-wrap").forEach(el => el.remove());
    const chapter = this.container?.closest(".chapter");
    chapter?.querySelectorAll(".choro-bars-wrap").forEach(el => el.remove());
    if (!this.container || !chapter) return;

    const data = this.data;
    const months = data.monthsCP00();
    const latest = months.filter(t => t >= "2019-01").at(-1) || months.at(-1);
    const start  = "2019-01";
    const eu     = data.euAggregateCode();
    const pct    = (b, a) => (b == null || a == null) ? null : (b / a - 1) * 100;
    const euVal  = pct(
      data.hicpIndex[eu]?.CP00?.[latest] ?? data.hicpIndex["EA"]?.CP00?.[latest],
      data.hicpIndex[eu]?.CP00?.[start]  ?? data.hicpIndex["EA"]?.CP00?.[start]
    ) ?? 25;

    const monthsFrom2019 = months.filter(t => t >= start && t <= latest);
    // [owner review D1 4b] EU-27 index series over the same months — overlaid on the hover mini-chart.
    const euIdxSeries = data.hicpIndex[eu]?.CP00 || data.hicpIndex["EA"]?.CP00 || {};
    const euSeries = monthsFrom2019.map(t => euIdxSeries[t] ?? null);
    const codes = data.euCodes();
    const barRows = codes.map(code => {
      const iso = data.topoToIso(code).toLowerCase();
      const idx = data.hicpIndex[code]?.CP00 || {};
      const cumPct = pct(idx[latest], idx[start]);
      const series = monthsFrom2019.map(t => idx[t] ?? null);
      // Country centroid in choropleth's projection coords (before camera)
      const featId = this._codeToFeatId(code);
      const feat = this.featCol?.features?.find(f => f.id === featId || data.topoToIso(f.id) === code);
      const centroid = feat ? this.proj(d3.geoCentroid(feat)) : [this.W / 2, this.H / 2];
      return { code, iso, name: data.countryName(code), cumPct, series, centroid };
    }).filter(r => Number.isFinite(r.cumPct));
    barRows.sort((a, b) => (b.cumPct - euVal) - (a.cumPct - euVal));

    const xExt = Math.max(1, d3.max(barRows, r => Math.abs(r.cumPct - euVal)) || 1) * 1.05;  // [owner D1 4b] tighter pad → fuller bars, smaller gap

    // --- FULL-CHAPTER overlay (covers both grid columns, sticky to viewport) ---
    // The wrap is sticky inside the chapter so as the user scrolls into the morph
    // steps the bar canvas sits on top of the entire chapter — the text column too.
    const wrap = document.createElement("div");
    wrap.className = "choro-bars-wrap";
    chapter.appendChild(wrap);

    // [Morph-v2] Inner stage constrains the SVG to a comfortable max-width and centers it.
    // Without this the bar canvas would span the full monitor (~1440+ px) on wide screens.
    const stage = document.createElement("div");
    stage.className = "choro-bars-stage";
    wrap.appendChild(stage);

    // Layout sized to the STAGE (not the full viewport) so bars stay inside the frame on big monitors.
    const W = stage.clientWidth || 1180;
    const H = stage.clientHeight || (wrap.clientHeight || 700);
    // Tighter margins than v1 — extra top: 92 reserves room for the editorial text box.
    // [R2-elevate] Threshold raised 480→820 so TABLET (768) also gets the compact morph layout
    // (ISO codes + slim margins). At 768 with full country names + sparklines + the closing prose
    // the bars crowded and the closing overlapped them (pixel-confirmed tablet-06). Tablet now
    // reads like the phone morph: dense but clean.
    const isMobile = W < 820;
    // [FULL-SITE AUDIT · C1 fix] Reserve top room for the centered title + eu-zero
    // label, and bottom room for the closing-insight box, so neither overlaps the
    // top/bottom bars (overlap was pixel-confirmed on desktop + phone).
    // [R2-elevate] Mobile top margin 132→156: the title now wraps to ~3 lines
    // ("…above or below the EU-27 average since January 2019"). The disambiguating note line
    // is hidden ≤1100px (responsive.css) since the title + axis tag carry the framing on small
    // screens, so 156 (not 176) cleanly clears the 3-line title without orphan whitespace.
    const m = isMobile
      ? { top: 156, right: 50, bottom: 108, left: 72 }    // [owner D1 4b] left 92->72: tighter label→bar gutter
      : { top: 156, right: 150, bottom: 140, left: 150 };  // [owner D1 4b] left 200->150: tighter label→bar gutter
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;
    const yBand = d3.scaleBand().domain(barRows.map(r => r.code)).range([0, ih]).padding(0.18);
    const xLin  = d3.scaleLinear().domain([-xExt, xExt]).range([0, iw]);
    const pal   = this.palette();
    const barColor = d3.scaleLinear()
      .domain([-15, -5, 0, 5, 15, 30])
      .range([pal.seq[0], pal.seq[1], pal.seq[2], pal.seq[3], pal.seq[4], pal.seq[4]])
      .clamp(true);

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "choro-bars-svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.cssText = "display:block; width:100%; height:100%;";
    stage.appendChild(svg);
    this._barsStage = stage;

    // [Morph-v2 · Task 3] Top editorial text box — kicker + Fraunces italic title
    const textbox = document.createElement("div");
    textbox.className = "bars-textbox bars-textbox--top";
    // [R2-elevate · deviation signpost] Name the encoding in the title itself. Round-1 flagged
    // that "+33.9 %" beside Hungary, under a title reading "Cumulative HICP since 2019", invites
    // the misread "Hungary's prices rose 34 %" (its true cumulative rise is ~64 %). The title now
    // states the bars are a DEVIATION from the EU-27 average, and the axis caption + closing line
    // anchor the absolute figure so the two framings can't be confused.
    const euTitle = Number.isFinite(euVal) ? `+${euVal.toFixed(1)} %` : "the EU-27 average";
    textbox.innerHTML = `
      <div class="bars-textbox__title">How far above or below the <em>EU-27 average</em></div>
      <div class="bars-textbox__note">Each bar is a country's gap from the EU-27 average since 2019 (${euTitle}).</div>`;
    stage.appendChild(textbox);
    this._bars_textbox = textbox;

    // [Morph-v2 · Task 4] Inline legend — top-right, EU27 line + sparkline key
    const legend = document.createElement("div");
    legend.className = "bars-legend";
    const euValRound = Number.isFinite(euVal) ? `+${euVal.toFixed(1)}%` : "";
    legend.innerHTML = `
      <div class="bars-legend__row"><span class="bars-legend__dash"></span> EU-27 cumulative · ${euValRound}</div>
      <div class="bars-legend__row"><span class="bars-legend__line"></span> 84-month sparkline · ticks = Ukraine + ECB cycle</div>`;
    stage.appendChild(legend);
    this._bars_legend = legend;

    // [user-fix · post-morph insight] Closing text box — fades in after the bars are
    // fully revealed, gives the reader a moment to absorb the chart with a data insight
    // computed from the same barRows. Positioned bottom-center of the stage.
    // Compute extremes (highest and lowest deviation) for the insight text.
    // [owner review D1] The closing analysis paragraph below the chart was DELETED (owner: "delete
    // the analysis paragraph below the chart … shorten the texts"). The top note carries the one-line
    // framing; the bar lengths + axis cues tell the rest. Null keeps the _tickMorph guard happy.
    this._bars_closing = null;

    // [R4 fix · Reuters/Professor] In-overlay source attribution. The morph wrap is
    // fixed-position fullscreen, so a reader who anchor-jumps in may never see the
    // chapter-source paragraph below the chart. Mirror it inside the overlay.
    const sourceEl = document.createElement("div");
    sourceEl.className = "bars-source";
    sourceEl.textContent = "Source · Eurostat HICP (prc_hicp_aind)";
    stage.appendChild(sourceEl);
    this._bars_source = sourceEl;

    const root = d3.select(svg).append("g").attr("transform", `translate(${m.left}, ${m.top})`);

    // Section title — appears centered above the bars
    // [Morph-v2 user-fix] Removed the SVG .bars-title — replaced by the HTML
    // .bars-textbox--top text overlay (which doesn't overlap, supports Fraunces italic,
    // and is positioned outside the chart drawing area).

    // EU27 zero rule
    root.append("line").attr("class", "bars-eu-zero")
      .attr("x1", xLin(0)).attr("x2", xLin(0))
      .attr("y1", 0).attr("y2", ih)
      .attr("stroke", "var(--ink)")
      .attr("stroke-dasharray", "4 4")
      .attr("stroke-opacity", 0.55);
    // [R2-elevate · kill the title bleed] The old top-anchored .bars-eu-label sat at the
    // zero line (chart centre, y:-2) directly BEHIND the centred HTML title — pixel-confirmed
    // garbled overlap in EVERY morph frame (round-1 before 07-10, light + dark). The EU-27 line
    // is now identified by (a) a small tag at the BOTTOM of the zero rule, in empty space, and
    // (b) directional axis cues below the bars — together making the deviation framing explicit
    // without ever colliding with the title.
    // EU-27 tag sits centred directly under the zero rule. The directional cues are pushed to
    // the FAR ENDS of the axis (under the most-negative / most-positive bars) so they never
    // collide with the centred tag. Two stacked rows keep everything legible.
    root.append("text").attr("class", "bars-eu-tag")
      .attr("x", xLin(0)).attr("y", ih + 17).attr("text-anchor", "middle")
      .style("opacity", 0)
      .text(`EU-27 average · +${euVal.toFixed(1)} %`);
    // Directional axis cues — far left = cooler than EU, far right = hotter than EU.
    root.append("text").attr("class", "bars-axis-dir bars-axis-dir--lo")
      .attr("x", 0).attr("y", ih + 17).attr("text-anchor", "start")
      .style("opacity", 0)
      .text("← cooler");
    root.append("text").attr("class", "bars-axis-dir bars-axis-dir--hi")
      .attr("x", iw).attr("y", ih + 17).attr("text-anchor", "end")
      .style("opacity", 0)
      .text("hotter →");

    const rowH = yBand.bandwidth();
    const SPARK_W = 140, SPARK_H = 16;

    // Compute each country's START position in this bar-layer's SVG coords.
    // Captured at build time; valid as long as the choropleth's layout doesn't change.
    const startPositions = this._computeStartPositions(barRows, wrap, m.left, m.top);

    // Group per row — positioned at FINAL bar y. Migration happens inside via translate.
    const rowG = root.selectAll("g.bar-row").data(barRows, d => d.code).join("g")
      .attr("class", "bar-row")
      .attr("data-code", d => d.code)
      .attr("transform", d => `translate(0, ${yBand(d.code)})`);

    rowG.each((d, i, nodes) => {
      const g = d3.select(nodes[i]);
      const dev = d.cumPct - euVal;
      const xZero = xLin(0);
      const xDev  = xLin(dev);
      const barX  = dev >= 0 ? xZero : xDev;
      const barW  = Math.max(0.5, Math.abs(xDev - xZero));
      const fill  = barColor(dev);

      // Migrating marker — starts at country centroid, ends at flag position.
      // x and y here are in the row's local coords, but for clean math we render
      // the marker in root coords (no row transform) and migrate via cx/cy.
      const flagX = -m.left + 22 + 7;          // flag center x (rel. to row's x=0 at xLin(0))
      const flagY = rowH / 2;                   // flag center y within row

      // Country flag
      g.append("image").attr("class", "bar-flag")
        .attr("href", `assets/flags/${d.iso}.svg`)
        .attr("x", flagX - 7).attr("y", flagY - 5)
        .attr("width", 14).attr("height", 9)
        .style("opacity", 0);

      // Country name — full name on desktop, ISO code on mobile (S3-3)
      g.append("text").attr("class", "bar-name")
        .attr("x", flagX + 12).attr("y", flagY + 4)
        .text(isMobile ? d.code : d.name)
        .style("opacity", 0);

      // Bar rect
      g.append("rect").attr("class", "bar-rect")
        .attr("x", barX).attr("y", 1)
        .attr("width", 0)
        .attr("height", rowH - 2)
        .attr("rx", 2)
        .attr("fill", fill)
        .attr("data-target-width", barW)
        .attr("data-target-x", barX);

      // Value label
      g.append("text").attr("class", "bar-value")
        .attr("y", flagY + 4)
        .attr("text-anchor", dev >= 0 ? "start" : "end")
        .attr("x", dev >= 0 ? xDev + 6 : xDev - 6)
        .attr("fill", "var(--ink-soft)")   /* readable neutral — bar colour carries sign/heat; --seq-1 negatives were near-invisible */
        .style("opacity", 0)
        .text(`${dev >= 0 ? "+" : ""}${dev.toFixed(1)}%`);

      // Sparkline group
      const sparkG = g.append("g").attr("class", "bar-spark")
        .attr("transform", `translate(${iw + 16}, ${flagY - SPARK_H / 2})`)
        .style("opacity", 0);
      const valid = d.series.filter(v => v != null);
      if (valid.length >= 2) {
        const sx = d3.scaleLinear().domain([0, d.series.length - 1]).range([0, SPARK_W]);
        const sy = d3.scaleLinear().domain([d3.min(valid), d3.max(valid)]).range([SPARK_H, 0]);
        const line = d3.line()
          .defined(v => v != null)
          .x((_, i) => sx(i))
          .y(v => sy(v))
          .curve(d3.curveMonotoneX);
        sparkG.append("path").attr("class", "bar-spark-line")
          .attr("d", line(d.series))
          .attr("fill", "none")
          .attr("stroke", fill)
          .attr("stroke-width", 1.2)
          .attr("stroke-opacity", 0.85);
        const lastIdx = d.series.length - 1;
        const lastVal = d.series[lastIdx];
        if (lastVal != null) {
          sparkG.append("circle").attr("class", "bar-spark-dot")
            .attr("cx", sx(lastIdx)).attr("cy", sy(lastVal))
            .attr("r", 1.8).attr("fill", "var(--accent)");
        }
      }

      // [owner review D1 4b] full-row hover target → highlight this row + enlarged 2-line mini-chart
      // (the country's 2019→now index vs the EU-27 average) in the shared tooltip. Appended last.
      g.append("rect").attr("class", "bar-hit")
        .attr("x", -m.left + 4).attr("y", 0)
        .attr("width", Math.max(0, m.left + iw + m.right - 8)).attr("height", rowH)
        .attr("fill", "transparent").style("cursor", "pointer")
        .on("mouseenter", (e) => this._barRowHover(e, d))
        .on("mousemove", (e) => this.ctx.tooltip.move(e.clientX, e.clientY))
        .on("mouseleave", () => this._barRowHoverOut());
    });

    // Markers — separate group at root level (no row transform).
    // Each marker is a small colored disc that flies from the country's map centroid
    // to its bar's flag position. Then it fades out as the proper flag/name appear.
    const markersG = root.append("g").attr("class", "bar-markers");
    barRows.forEach(d => {
      const dev = d.cumPct - euVal;
      const xDev = xLin(dev);
      const barX = dev >= 0 ? xLin(0) : xDev;
      const fill = barColor(dev);
      const startP = startPositions.get(d.code) || [iw / 2, ih / 2];
      // Marker target (in root coords) = flag center
      const flagX = -m.left + 22 + 7;
      const targetX = flagX + 0;                          // (in root coords; row transform doesn't apply)
      const targetY = yBand(d.code) + rowH / 2;
      markersG.append("circle")
        .attr("class", "bar-marker")
        .attr("data-code", d.code)
        .attr("data-sx", startP[0]).attr("data-sy", startP[1])
        .attr("data-tx", targetX).attr("data-ty", targetY)
        .attr("data-bar-x", barX)
        .attr("data-bar-target-width", Math.max(0.5, Math.abs(xDev - xLin(0))))
        .attr("cx", startP[0]).attr("cy", startP[1])
        .attr("r", 6)
        .attr("fill", fill)
        .attr("stroke", "var(--bg-elev)").attr("stroke-width", 1.2)
        .style("opacity", 0);
    });

    // Event ticks on top-5 deviation rows
    const topByMag = [...barRows].sort((a, b) =>
      Math.abs(b.cumPct - euVal) - Math.abs(a.cumPct - euVal)).slice(0, 5);
    const tickCodes = new Set(topByMag.map(r => r.code));
    rowG.each((d, i, nodes) => {
      if (!tickCodes.has(d.code)) return;
      const sparkG = d3.select(nodes[i]).select("g.bar-spark");
      if (sparkG.empty()) return;
      const sx = d3.scaleLinear().domain([0, d.series.length - 1]).range([0, SPARK_W]);
      BAR_EVENT_MARKERS.forEach(e => {
        if (e.idx < 0 || e.idx >= d.series.length) return;
        sparkG.append("line").attr("class", "bar-spark-event")
          .attr("x1", sx(e.idx)).attr("x2", sx(e.idx))
          .attr("y1", 0).attr("y2", SPARK_H)
          .attr("stroke", "var(--ink-faint)")
          .attr("stroke-width", 0.6)
          .attr("opacity", 0.6);
      });
    });

    // [Morph-v2 · Task 6] Build country path clones + flubber interpolators
    const clonesData = this._buildCountryClones(barRows, root, m, yBand, xLin, rowH, stage, W, H, euVal);

    this._bars = {
      wrap, svg, root, markersG, barRows, yBand, xLin, euVal, iw, ih, rowH,
      W, H, margin: m,
      euSeries, barColor,                       // [owner review D1 4b] hover mini-chart needs these
      clones: clonesData ? clonesData.clones : []
    };

    // [S1-5] IntersectionObserver fallback — hides the morph wrap when the
    // chapter scrolls completely out of viewport, even without a scroll event
    // (e.g. anchor jumps, programmatic scroll, hash navigation). The existing
    // watchChapterProgress callback handles the smooth-scroll case but only
    // fires on actual scroll events.
    if (this._chapterIO) this._chapterIO.disconnect();
    this._chapterIO = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) {
          wrap.style.opacity = "0";
          wrap.style.pointerEvents = "none";
          wrap.style.visibility = "hidden";
          wrap.classList.remove("is-active");
        }
      });
    }, { threshold: 0 });
    this._chapterIO.observe(chapter);
  }

  // [Morph-v2 · Task 6] Build SVG <path> clones of each EU country inside the morph SVG,
  // alongside flubber interpolators that morph the country shape → square as it travels
  // toward its bar slot. Returns null if flubber failed to load (fallback path stays empty).
  _buildCountryClones(barRows, root, m, yBand, xLin, rowH, stage, stageW, stageH, euVal) {
    if (typeof flubber === "undefined" || !flubber.interpolate) {
      // flubber not loaded — country clones disabled; silent fallback to circle markers (§6: no console in prod).
      return null;
    }
    const clonesG = root.append("g").attr("class", "country-clones");
    const clones = [];

    // Edge length of the target square — matches the flag glyph bbox so the morph lands cleanly.
    const SQ = 14;

    // Geometry conversions: country centroids are in CHOROPLETH-SVG coords.
    // We need them in MORPH-SVG-ROOT coords. The morph SVG uses a viewBox = "0 0 W H"
    // and is sized to the stage's actual pixel dims. The root <g> has translate(m.left, m.top).
    const choroSvg = this.svg?.node();
    const choroRect = choroSvg?.getBoundingClientRect();
    const stageRect = stage?.getBoundingClientRect();
    if (!choroRect || !stageRect) return null;
    const cam = this._cam || { tx: 0, ty: 0, k: 1 };
    const sX = choroRect.width / this.W;
    const sY = choroRect.height / this.H;

    barRows.forEach(d => {
      const featId = this._codeToFeatId(d.code);
      const feat = this.featCol?.features?.find(f => f.id === featId || this.data.topoToIso(f.id) === d.code);
      if (!feat) return;

      // Country path in choropleth SVG coords
      const fromD = this.path(feat);
      if (!fromD) return;

      // Target square center in ROOT coords (root has translate(m.left, m.top))
      // The flag glyph sits at flagX = -m.left + 22 + 7 (same constant used by _buildBarLayer)
      const flagX = -m.left + 22 + 7;
      const targetCx = flagX;
      const targetCy = yBand(d.code) + rowH / 2;
      const sqHalf = SQ / 2;
      // Build target square path centered on the flag position
      const toD = `M${targetCx - sqHalf},${targetCy - sqHalf}` +
                  ` L${targetCx + sqHalf},${targetCy - sqHalf}` +
                  ` L${targetCx + sqHalf},${targetCy + sqHalf}` +
                  ` L${targetCx - sqHalf},${targetCy + sqHalf} Z`;

      // Store country's centroid in CHOROPLETH-SVG units (scroll-invariant).
      // Actual start position in morph-SVG-root coords is computed per-tick in
      // _tickMorph (since the choropleth's screen position changes with scroll).
      const [cx, cy] = d.centroid;
      const startCx = 0;   // placeholder — set per-tick
      const startCy = 0;

      // flubber interpolator — wrap in try/catch in case the path is unusual (multi-polygon)
      let interp;
      try {
        interp = flubber.interpolate(fromD, toD, { maxSegmentLength: 8 });
      } catch (err) {
        // flubber failed for this country — skip its clone (silent fallback; §6: no console in prod).
        return;
      }

      // Each clone's path starts in its own ROOT-local coords (we translate it into place via transform).
      // Color it by the deviation sign so the visual reads with the same palette as the bars.
      const fill = d.cumPct - euVal >= 0 ? "var(--seq-4)" : "var(--seq-1)";
      const pathEl = clonesG.append("path")
        .attr("class", "country-clone")
        .attr("data-code", d.code)
        .attr("d", fromD)
        .attr("fill", fill)
        .attr("stroke", "var(--bg-elev)")
        .attr("stroke-width", 0.5)
        .attr("opacity", 0)
        .node();

      clones.push({
        code: d.code, pathEl, fromD, toD, interp,
        startCx, startCy, targetCx, targetCy,
        geoCx: cx, geoCy: cy            // [Morph-v2 fix] keep geo coords for per-tick remap
      });
    });

    return { clonesG, clones };
  }

  // Compute each country's start position (centroid) in the bar-layer's root coords.
  // The root <g> has transform translate(margin.left, margin.top); so to feed start
  // coords directly to circle cx/cy of markers placed inside that <g>, we subtract
  // those margins from the wrap-local pixel coords.
  _computeStartPositions(barRows, wrap, marginLeft, marginTop) {
    const out = new Map();
    if (!this.svg || !wrap) return out;
    const choroSvg = this.svg.node();
    const choroRect = choroSvg.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const sX = choroRect.width / this.W;
    const sY = choroRect.height / this.H;
    const cam = this._cam || { tx: 0, ty: 0, k: 1 };
    barRows.forEach(d => {
      const [cx, cy] = d.centroid;
      const inSvgX = cx * cam.k + cam.tx;
      const inSvgY = cy * cam.k + cam.ty;
      const pxX = choroRect.left + inSvgX * sX;
      const pxY = choroRect.top  + inSvgY * sY;
      out.set(d.code, [
        pxX - wrapRect.left - marginLeft,
        pxY - wrapRect.top  - marginTop
      ]);
    });
    return out;
  }

  // [owner review D1 4b] Hover a bar row → dim the others + show an enlarged 2-line mini-chart
  // (the country's 2019→now index vs the EU-27 average) in the shared singleton tooltip.
  _barRowHover(event, d) {
    if (!this._bars) return;
    this._bars.root.selectAll("g.bar-row").style("opacity", r => (r.code === d.code ? 1 : 0.3));
    this.ctx.tooltip.show(this._barMiniChart(d), event.clientX, event.clientY);
  }
  _barRowHoverOut() {
    if (this._bars) this._applyBarSpotlight(this._spotlightCodes);   // restore the scroll-highlight state
    this.ctx.tooltip.hide();
  }
  /** Spotlight a set of bar rows (others dimmed to 0.28); null/empty → all visible. Shared by the
   *  scroll-highlight sequence and by hover-out restore so the two never fight. */
  _applyBarSpotlight(codes) {
    if (!this._bars) return;
    const set = codes && codes.length ? new Set(codes) : null;
    this._bars.root.selectAll("g.bar-row").style("opacity", r => (!set || set.has(r.code)) ? 1 : 0.28);
  }
  /** Tooltip HTML: country name + an inline 2-line SVG (country vs EU-27, both indexed to 100 at
   *  Jan-2019 so they're comparable) + the two cumulative figures. Enlarged vs the inline sparkline. */
  _barMiniChart(d) {
    const eu = this._bars?.euSeries || [];
    const cs = d.series || [];
    const n = Math.max(cs.length, eu.length);
    const base = cs.find(v => v != null) || 100;
    const euBase = eu.find(v => v != null) || 100;
    const cN = cs.map(v => (v == null ? null : v / base * 100));
    const eN = eu.map(v => (v == null ? null : v / euBase * 100));
    const W = 248, H = 92, P = 8;
    const all = cN.concat(eN).filter(v => v != null);
    const lo = all.length ? Math.min(...all) : 100;
    const hi = all.length ? Math.max(...all) : 100;
    const X = i => P + (n <= 1 ? 0 : i / (n - 1) * (W - 2 * P));
    const Y = v => H - P - (hi === lo ? 0 : (v - lo) / (hi - lo) * (H - 2 * P));
    const toPath = arr => { let s = "", pen = false; arr.forEach((v, i) => { if (v == null) { pen = false; return; } s += (pen ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1) + " "; pen = true; }); return s; };
    const col = this._bars.barColor(d.cumPct - this._bars.euVal);
    const cum = d.cumPct, euCum = this._bars.euVal;
    return `<h5>${d.name}</h5>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;margin:2px 0 5px">
        <path d="${toPath(eN)}" fill="none" stroke="var(--ink-faint)" stroke-width="1.4" stroke-dasharray="3 3"/>
        <path d="${toPath(cN)}" fill="none" stroke="${col}" stroke-width="2"/>
      </svg>
      <div class="row"><span class="key">${d.name} · since 2019</span><span class="val">${cum >= 0 ? "+" : ""}${cum.toFixed(0)}%</span></div>
      <div class="row"><span class="key">EU-27 average</span><span class="val">${euCum >= 0 ? "+" : ""}${euCum.toFixed(0)}%</span></div>`;
  }

  // ============================================================
  // The scroll-driven morph.
  //   mPrep    ≈ 0.55-0.62 — markers appear at country centroids on the map
  //   mMigrate ≈ 0.62-0.82 — markers fly to bar positions; map fades behind them
  //   mBars    ≈ 0.78-0.92 — bars grow horizontally from the arrived markers
  //   mTrail   ≈ 0.88-1.00 — sparklines + values + names + flags reveal; markers fade
  //                          as the proper flag glyphs take their place
  // ============================================================
  // [Morph-v2 · Task 7] Five-phase scroll-driven morph:
  //   Calm  (0.00–0.55) — map only
  //   Rise  (0.55–0.62) — country clones fade in + lift slightly
  //   Fly   (0.62–0.80) — clones path-morph to squares + translate to bar slot
  //   Land  (0.80–0.88) — squares pulse, crossfade to flag images
  //   Bars  (0.88–1.00) — bars grow, names/values/sparklines reveal
  _tickMorph(p) {
    if (!this._bars) return;
    this._morphState = p;

    // Chapter-in-viewport gate (unchanged from v1)
    const chapter = this.container?.closest(".chapter");
    if (chapter) {
      const r = chapter.getBoundingClientRect();
      const inViewport = r.bottom > 80 && r.top < innerHeight - 80;
      if (!inViewport) {
        this._bars.wrap.style.opacity = "0";
        this._bars.wrap.style.visibility = "hidden";
        this._bars.wrap.classList.remove("is-active");
        return;
      }
    }

    const { wrap, root, barRows, clones = [] } = this._bars;

    // [Task 10] prefers-reduced-motion — snap to end state, skip animation
    if (this.ctx?.motion?.reduced) {
      const onScreen = p > 0.55;
      wrap.style.opacity = onScreen ? "1" : "0";
      wrap.style.pointerEvents = onScreen ? "auto" : "none";
      wrap.style.visibility = onScreen ? "visible" : "hidden";
      wrap.classList.toggle("is-active", onScreen);
      if (this._bars_textbox) this._bars_textbox.style.opacity = onScreen ? "1" : "0";
      if (this._bars_legend)  this._bars_legend.style.opacity  = onScreen ? "1" : "0";
      if (this._bars_source)  this._bars_source.style.opacity  = onScreen ? "1" : "0";
      if (this.gMap)    this.gMap.style("opacity", onScreen ? 0 : 1);
      if (this.kickerG) this.kickerG.style("opacity", onScreen ? 0 : 1);
      if (this.labelG)  this.labelG.style("opacity", onScreen ? 0 : 1);
      if (this._mapCardEl) this._mapCardEl.style.opacity = onScreen ? 0 : 1;
      clones.forEach(c => {
        c.pathEl.setAttribute("opacity", "0");
        c.pathEl.setAttribute("d", c.toD);
        c.pathEl.setAttribute("transform", "translate(0,0)");
      });
      root.selectAll("image.bar-flag").style("opacity", onScreen ? 1 : 0);
      root.selectAll("rect.bar-rect").each(function () {
        const sel = d3.select(this);
        sel.attr("width", onScreen ? +sel.attr("data-target-width") : 0);
      });
      root.selectAll("text.bar-name, text.bar-value").style("opacity", onScreen ? 1 : 0);
      root.selectAll("g.bar-spark").style("opacity", onScreen ? 1 : 0);
      root.selectAll("text.bars-eu-tag, text.bars-axis-dir").style("opacity", onScreen ? 1 : 0);
      root.select("line.bars-eu-zero").style("opacity", onScreen ? 1 : 0);
      return;
    }

    // Phase progress (smoothstep eased)
    // [user-feedback] Map stays fully visible through narrative steps 0–4 (calm
    // through p=0.65). Morph compressed into 0.65–0.88, leaving a DWELL phase
    // 0.88–1.00 where bars stay visible + closing insight text appears,
    // so the reader has scroll-room to absorb the chart before the next chapter.
    // [R2-elevate · smoother morph] Round-1 pixels showed the title painting over still-map-like
    // clones (frame 07) and a stiff mid-flight beat. We give the FLY phase more scroll-room so the
    // country shapes read as a continuous flow into the bar column, then land → bars → trail follow
    // in a gentle cascade, and the title (textOp below) holds off until the shapes have arrived.
    const rise  = smooth(progressBetween(p, 0.64, 0.70));
    const fly   = smooth(progressBetween(p, 0.69, 0.81));
    const land  = smooth(progressBetween(p, 0.80, 0.85));
    const bars  = smooth(progressBetween(p, 0.84, 0.90));
    const trail = smooth(progressBetween(p, 0.88, 0.93));
    // [FULL-SITE AUDIT · C1 fix] Fade the map + year-kicker out EARLIER (done by
    // p=0.72) so the leftover SVG kicker/labels never bleed through behind the
    // HTML morph title, which fades in afterwards (textOp below).
    const mapFade = smooth(progressBetween(p, 0.64, 0.72));
    const show  = Math.max(rise, fly, land, bars);
    // Closing-text opacity — fades in once bars are complete (p ≥ 0.93)
    const closingOp = Math.max(0, Math.min(1, (p - 0.93) / 0.04));

    // Bar wrap opacity + active visibility
    wrap.style.opacity = String(show);
    wrap.style.pointerEvents = show > 0.5 ? "auto" : "none";
    // [user-reported fix] hide via visibility when fully transparent so the fixed
    // overlay can never visually block the choropleth map below.
    wrap.style.visibility = show > 0.001 ? "visible" : "hidden";
    wrap.classList.toggle("is-active", show > 0.05);

    // [Task 5] Text box + legend opacity tied to scroll
    // [R2-elevate] Title holds off until the shapes have arrived (fly ~done at 0.81) so it lands
    // over the forming bar column, never over the still-flying map clones. Legend follows the bars.
    const textOp = Math.max(0, Math.min(1, (p - 0.81) / 0.06));
    const legendOp = Math.max(0, Math.min(1, (p - 0.94) / 0.05));
    if (this._bars_textbox) this._bars_textbox.style.opacity = String(textOp);
    if (this._bars_legend)  this._bars_legend.style.opacity  = String(legendOp);
    if (this._bars_closing) this._bars_closing.style.opacity = String(closingOp);
    if (this._bars_source)  this._bars_source.style.opacity  = String(legendOp);

    // Fade the choropleth ornaments as the morph takes over
    if (this.gMap)       this.gMap.style("opacity", 1 - mapFade);
    if (this.kickerG)    this.kickerG.style("opacity", 1 - mapFade);
    if (this.labelG)     this.labelG.style("opacity", (1 - mapFade) * (this.focusCode ? 0 : 1));
    if (this._mapCardEl) this._mapCardEl.style.opacity = (1 - mapFade);

    // ===== Phases Rise + Fly =====
    // [Morph-v2 fix] Recompute clone start positions THIS TICK using the choropleth's
    // current screen position. The choropleth scrolls with the page, so the country's
    // pixel coordinates change every frame. Build-time positions would be stale.
    const choroSvg = this.svg?.node();
    const choroRect = choroSvg?.getBoundingClientRect();
    const stage = this._barsStage;
    const stageRect = stage?.getBoundingClientRect();
    const cam = this._cam || { tx: 0, ty: 0, k: 1 };
    const m = this._bars.margin;
    const stageW = this._bars.W, stageH = this._bars.H;
    if (choroRect && stageRect) {
      const sX = choroRect.width  / this.W;
      const sY = choroRect.height / this.H;
      clones.forEach(c => {
        const inSvgX = c.geoCx * cam.k + cam.tx;
        const inSvgY = c.geoCy * cam.k + cam.ty;
        const pxX = choroRect.left + inSvgX * sX;
        const pxY = choroRect.top  + inSvgY * sY;
        const svgX = (pxX - stageRect.left) * stageW / stageRect.width;
        const svgY = (pxY - stageRect.top)  * stageH / stageRect.height;
        c.startCx = svgX - m.left;
        c.startCy = svgY - m.top;
      });
    }

    // [Morph-v2 fix] flubber.interpolate(fromD, toD) returns a path that morphs through
    // BOTH shape AND position (from country path coords → square path at target coords).
    // So we do NOT translate via transform — flubber already handles the position.
    // We only use transform for the subtle "rise lift" (translateY) and the scale pulse.
    //
    // However, the country path d is in CHOROPLETH-SVG coords, which only align with the
    // morph SVG if the choropleth happens to sit at the same screen position. Since the
    // morph SVG is full-viewport and the choropleth is in its own sticky panel, we need
    // to apply a per-tick offset to align the path's start position with the country's
    // current on-screen position.
    clones.forEach(c => {
      // [owner review D1] clones FULLY fade once the flag lands (was floored at 0.35, which left a
      // faint colour square behind every flag — the "extra squares" the owner flagged). The flag +
      // the bar now carry the colour; the morph clone is gone at the end-state.
      const opacity = Math.max(0, rise * (1 - trail));
      const scale = 1 + rise * 0.08;
      const liftY = -6 * rise;
      // Per-tick screen-alignment offset for the START position (where the country IS on
      // screen right now). startCx/Cy = computed-this-tick screen position in root coords.
      // The PATH d is at choropleth coords (geoCx, geoCy). Offset = startCx - geoCx.
      const offsetX = c.startCx - c.geoCx;
      const offsetY = c.startCy - c.geoCy;
      // Path d morphs via flubber. At fly=0: path matches fromD (at choro coords). At fly=1:
      // path matches toD (at target square in root coords). We apply offsetX/Y as a translate
      // that LERPS from offsetX (at fly=0, to align with screen) to 0 (at fly=1, since toD is
      // already in root coords).
      const transX = offsetX * (1 - fly);
      const transY = offsetY * (1 - fly) + liftY;
      try {
        c.pathEl.setAttribute("d", c.interp(fly));
      } catch (_) { /* defensive — shouldn't happen post-build */ }
      c.pathEl.setAttribute("transform",
        `translate(${transX.toFixed(2)},${transY.toFixed(2)}) scale(${scale.toFixed(3)})`);
      c.pathEl.setAttribute("opacity", opacity.toFixed(3));
    });

    // ===== Phase Land =====
    // Squares pulse-settle and crossfade to flag images.
    // (Flag image opacity drives the visual; the clone's opacity is already fading from above.)
    root.selectAll("image.bar-flag").style("opacity", land);

    // ===== Phase Bars =====
    // Horizontal bars grow from each flag.
    root.selectAll("rect.bar-rect").each(function () {
      const sel = d3.select(this);
      const targetW = +sel.attr("data-target-width");
      sel.attr("width", targetW * bars);
    });

    // [R2-elevate] EU-27 tag + directional axis cues fade in with the bars (not during the
    // map-fly) so no orphan text floats before the bars exist.
    root.selectAll("text.bars-eu-tag, text.bars-axis-dir").style("opacity", bars);
    root.select("line.bars-eu-zero").style("opacity", Math.max(land, bars));

    // Names + values + sparklines reveal at trail.
    root.selectAll("text.bar-name").style("opacity", trail);
    root.selectAll("text.bar-value").style("opacity", trail);
    root.selectAll("g.bar-spark").style("opacity", trail);
    root.selectAll("g.bar-spark").each(function () {
      const path = d3.select(this).select("path.bar-spark-line");
      if (!path.empty()) tracePath(path, trail);
    });
    root.selectAll("circle.bar-spark-dot").attr("opacity", trail * trail);

    // ===== [owner review D1 4b] Scroll-highlight sequence =====
    // Once the bars have formed, the dwell scroll spotlights, in turn: the highest country, then the
    // two middle (around the EU-27 line, ≈ +small & ≈ −small), then the lowest — then releases to all.
    // Hover overrides this; hover-out restores it (via _applyBarSpotlight(this._spotlightCodes)).
    let spotCodes = null;
    if (p >= 0.92 && p < 0.985 && barRows.length > 3) {
      const dev = r => r.cumPct - this._bars.euVal;
      let zc = barRows.findIndex(r => dev(r) < 0);          // first row below the EU line
      if (zc < 1) zc = Math.floor(barRows.length / 2);
      const stages = [
        [barRows[0].code],                                  // highest above EU
        [barRows[zc - 1].code, barRows[zc].code],           // the two middle, straddling the EU line
        [barRows[barRows.length - 1].code],                 // lowest below EU
      ];
      const dp = (p - 0.92) / 0.065;
      spotCodes = stages[Math.max(0, Math.min(stages.length - 1, Math.floor(dp * stages.length)))];
    }
    this._spotlightCodes = spotCodes;
    this._applyBarSpotlight(spotCodes);

    // ===== Hide the old circle markers (v1 leftover) =====
    if (this._bars.markersG) {
      this._bars.markersG.selectAll("circle.bar-marker").style("opacity", 0);
    }
  }
  // ============================================================

  // Light text labels for multi-country narrative steps (no card, no sparkline — keeps the
  // map readable when several countries are emphasized at once).
  _renderMultiLabels(codes) {
    if (!this.svg || !this.featCol) return;
    this.svg.selectAll(".multi-label-text").remove();
    if (!codes || !codes.length) return;
    const cam = this._cam || { tx: 0, ty: 0, k: 1 };
    codes.forEach((code, i) => {
      const featId = this._codeToFeatId(code);
      const feat = this.featCol.features.find(f => f.id === featId || this.data.topoToIso(f.id) === code);
      if (!feat) return;
      const [gx, gy] = this.proj(d3.geoCentroid(feat));
      const sx = gx * cam.k + cam.tx;
      const sy = gy * cam.k + cam.ty - 8;
      const v = this.data.hicpAnnual[code]?.CP00?.[String(this.year)];
      const txt = `${this.data.countryName(code).toUpperCase()}${v != null ? "  " + v.toFixed(1) + "%" : ""}`;
      this.svg.append("text")
        .attr("class", "multi-label-text")
        .attr("x", sx).attr("y", sy)
        .attr("text-anchor", "middle")
        .text(txt)
        .style("opacity", 0)
        .transition().delay(80 * i).duration(260).style("opacity", 1);
    });
  }
}
