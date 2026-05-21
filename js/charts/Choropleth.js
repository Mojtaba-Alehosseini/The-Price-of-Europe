/* ============================================================
   Choropleth — editorial European inflation map
   Year kicker, capital dots, pulse rings, scroll-camera, stamp
   annotation, top-3 labels, integrated mini-area-chart timeline.
   ============================================================ */

import { BaseChart } from "./BaseChart.js";

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

const STEP_CONFIG = [
  { year: 2019, focus: null, caption: null,        pulse: false },
  { year: 2021, focus: "EE",  caption: "Estonia peeled away first, climbing to 4.5%.", pulse: false },
  { year: 2022, focus: "EE",  caption: "Estonia hit 19.4% — highest of the euro's lifetime.", pulse: true },
  { year: 2024, focus: "ES",  caption: "Spain cooled near the ECB target.", pulse: false },
  { year: 2025, focus: null,  caption: null,        pulse: false },
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
    this.controlsEl = document.getElementById("chart-choropleth-controls");
    this.years = (data.yearsCP00 ? data.yearsCP00() : []).filter(y => y >= 2015 && y <= 2025);
    if (!this.years.length) this.years = [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024];
    this.year = this.years[0];
    this.focusCode = null; this.lockedCode = null;
    this.playing = false; this._playTimer = null;
    this._stepCaption = null; this._stepPulse = false;
    this._kickerSeq = 0; this._camSeq = 0;
    this._centroidCache = new Map();
    this._euAnnual = this.years.map(y => ({
      year: y,
      value: data.hicpAnnual["EU27_2020"]?.CP00?.[String(y)]
          ?? data.hicpAnnual["EU"]?.CP00?.[String(y)]
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

  render() {
    super.render();
    this.container.innerHTML = "";
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;

    this.featCol = topojson.feature(this.data.topology,
      this.data.topology.objects.countries || this.data.topology.objects.europe);
    const eu27Feats = {
      type: "FeatureCollection",
      features: this.featCol.features.filter(d => this.data.countriesByCode.has(this.data.topoToIso(d.id)))
    };
    const proj = d3.geoMercator().fitExtent([[14, 86], [this.W - 14, this.H - 6]], eu27Feats);
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
    const avg0 = this._euAvg(this.year);
    this.kickerSub.text(`EU avg · ${avg0 != null ? avg0.toFixed(1) + "%" : "—"}`);

    this._renderLegend();

    this.gMap = this.svg.append("g").attr("class", "map-layer").attr("clip-path", "url(#choro-map-clip)");
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
      this._panState = { mx: event.clientX, my: event.clientY, tx: t.tx, ty: t.ty, moved: false };
      this.svg.classed("is-panning", true);
      event.preventDefault();
    });
    if (this._winPanMove) {
      window.removeEventListener("mousemove", this._winPanMove);
      window.removeEventListener("mouseup", this._winPanUp);
    }
    this._winPanMove = (e) => {
      if (!this._panState) return;
      const dx = e.clientX - this._panState.mx;
      const dy = e.clientY - this._panState.my;
      if (!this._panState.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) this._panState.moved = true;
      if (!this._panState.moved) return;
      this._cam.tx = this._panState.tx + dx;
      this._cam.ty = this._panState.ty + dy;
      this.gMap.interrupt("camera")
        .attr("transform", `translate(${this._cam.tx}, ${this._cam.ty}) scale(${this._cam.k})`);
    };
    this._winPanUp = () => {
      if (!this._panState) return;
      const wasDrag = this._panState.moved;
      this._panState = null;
      this.svg.classed("is-panning", false);
      if (wasDrag) this._lastDragEnd = performance.now();
    };
    window.addEventListener("mousemove", this._winPanMove);
    window.addEventListener("mouseup", this._winPanUp);

    this.pulseG = this.gMap.append("g").attr("class", "pulses").attr("pointer-events", "none");
    this.capG = this.gMap.append("g").attr("class", "capitals").attr("pointer-events", "none");
    this.capSel = this.capG.selectAll("circle.capital-dot")
      .data(Object.entries(CAPITALS), d => d[0]).join("circle")
      .attr("class", "capital-dot").attr("data-code", d => d[0])
      .attr("cx", d => this.proj([d[1][0], d[1][1]])[0])
      .attr("cy", d => this.proj([d[1][0], d[1][1]])[1])
      .attr("r", 0).attr("vector-effect", "non-scaling-stroke");

    this.labelG = this.gMap.append("g").attr("class", "top-labels").attr("pointer-events", "none");
    this.detailEl = document.getElementById("choropleth-detail");

    this.svg.on("click", () => this._click(null));

    this._buildControls();
    this._initialPaint();
    if (this.focusCode || this.lockedCode) {
      this._applyFocus();
      this._cameraTo(this.lockedCode || this.focusCode, false);
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
    if (this.controlsEl.dataset.wired === "1") { this._buildTimeline(); return; }
    this.controlsEl.dataset.wired = "1";
    this.controlsEl.innerHTML = `
      <div class="map-timeline-wrap">
        <svg class="map-timeline" viewBox="0 0 600 80" preserveAspectRatio="none" aria-hidden="true"></svg>
        <input type="range" id="chor-slider" class="vis-hidden" min="${this.years[0]}" max="${this.years.at(-1)}" step="1" value="${this.year}" aria-label="Year">
      </div>
      <div class="map-timeline-foot">
        <button class="play-btn" id="chor-play" aria-label="Play timeline" title="Play / pause">
          <span class="play-icon"><svg viewBox="0 0 12 12" width="11" height="11"><path d="M2.5 1.2 L10 6 L2.5 10.8 Z" fill="currentColor"/></svg></span>
        </button>
        <span class="ctrl-hint">Click timeline or hit ▶</span>
        <span class="ctrl-src">Source · Eurostat HICP (prc_hicp_manr) · annual rates</span>
      </div>`;
    this.sl = this.controlsEl.querySelector("#chor-slider");
    this.playBtn = this.controlsEl.querySelector("#chor-play");
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
    this.years.forEach(yr => {
      const isMajor = yr % 2 === 0 || yr === this.years.at(-1) || yr === this.years[0];
      svg.append("text").attr("class", isMajor ? "tl-tick tl-tick--major" : "tl-tick")
        .attr("x", x(yr)).attr("y", H - 4).attr("text-anchor", "middle")
        .text(isMajor ? yr : "·");
    });
    const ph = svg.append("g").attr("class", "tl-playhead");
    ph.append("line").attr("class", "tl-playhead-line").attr("y1", padT - 12).attr("y2", H - padB);
    ph.append("circle").attr("class", "tl-playhead-dot").attr("r", 6).attr("cy", H - padB);
    ph.append("text").attr("class", "tl-playhead-num").attr("y", padT - 17).attr("text-anchor", "middle");
    ph.append("text").attr("class", "tl-playhead-val").attr("y", padT - 3).attr("text-anchor", "middle");
    this._playhead = ph;

    // Scrub: d3.pointer(e, svgEl) already returns viewBox coords — use directly
    const onScrub = (e) => {
      const [vbX] = d3.pointer(e, svgEl);
      const yr = Math.round(Math.max(this.years[0], Math.min(this.years.at(-1), x.invert(vbX))));
      if (this.playing) this._togglePlay(false);
      if (yr !== this.year) {
        const prev = this.year; this.year = yr;
        if (this.sl) this.sl.value = yr;
        this._animateYearChange(prev);
      }
      this._updatePlayhead();
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
    this._updatePlayhead();
  }

  _updatePlayhead() {
    if (!this._playhead || !this._timeX) return;
    const tx = this._timeX(this.year);
    const v = this._euAvg(this.year);
    this._playhead.transition("ph").duration(420).ease(d3.easeCubicOut).attr("transform", `translate(${tx}, 0)`);
    this._playhead.select(".tl-playhead-num").text(this.year);
    this._playhead.select(".tl-playhead-val").text(v != null ? v.toFixed(1) + "%" : "");
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
    if (this.lockedCode) this._renderMapLabel(this.lockedCode);
  }

  _swapKicker(prev, next) {
    const goingUp = next > prev;
    const t = this.kickerYear;
    this._kickerSeq++;
    const seq = this._kickerSeq;
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
  }

  _applyFocus() {
    const code = this.lockedCode || this.focusCode;
    this.countryPaths.classed("is-dim", false).classed("is-focus", false);
    this.capSel.classed("is-focus", false);
    if (code) {
      this.countryPaths.filter(d => this.data.countriesByCode.has(this.data.topoToIso(d.id)))
        .classed("is-dim", d => this.data.topoToIso(d.id) !== code);
      this.countryPaths.filter(d => this.data.topoToIso(d.id) === code).classed("is-focus", true).raise();
      this.capSel.filter(d => d[0] === code).classed("is-focus", true).raise();
    }
    if (this.labelG) this.labelG.transition("tl-vis").duration(280).style("opacity", code ? 0 : 1);
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
    const k = Math.min((W * 0.42) / fw, (H * 0.55) / fh, 3.2);
    const kFinal = Math.max(1.4, k);
    return { tx: targetCx - cx * kFinal, ty: targetCy - cy * kFinal, k: kFinal, side: stampOnRight ? "right" : "left" };
  }

  _cameraTo(code, animate = true) {
    if (!this.gMap) return;
    this._camSeq++;
    const seq = this._camSeq;
    const target = this._computeCamera(code);
    const duration = animate && !this.ctx.motion.reduced ? 1100 : 0;
    this.gMap.interrupt("camera");
    this.gMap.transition("camera").duration(duration).ease(d3.easeCubicInOut)
      .attr("transform", `translate(${target.tx}, ${target.ty}) scale(${target.k})`)
      .on("end", () => {
        if (seq !== this._camSeq) return;
        this._cam = target;
        if (this._stepPulse && code) this._emitPulse(code);
      });
    if (!animate) { this._cam = target; }
    this._renderDetail();
  }

  _emitPulse(code) {
    const cap = CAPITALS[code];
    if (!cap) return;
    const [x, y] = this.proj([cap[0], cap[1]]);
    const k = (this._cam && this._cam.k) || 1;
    for (let i = 0; i < 3; i++) {
      this.pulseG.append("circle").attr("class", "pulse-ring")
        .attr("cx", x).attr("cy", y).attr("r", 4 / k)
        .attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 1.2)
        .attr("opacity", 0.75).attr("vector-effect", "non-scaling-stroke")
        .transition().delay(i * 300).duration(1700).ease(d3.easeCubicOut)
        .attr("r", 70 / k).attr("opacity", 0).remove();
    }
  }

  _renderDetail() {
    const el = this.detailEl || (this.detailEl = document.getElementById("choropleth-detail"));
    if (!el) return;
    const code = this.lockedCode || this.focusCode;
    if (!code) {
      el.setAttribute("data-active", "false");
      return;
    }
    const v = this.data.hicpAnnual[code]?.CP00?.[String(this.year)];
    const sentence = this._stepCaption || `Annual HICP inflation in ${this.year}.`;
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
    if (!this.labelG) return;
    const entries = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const sel = this.labelG.selectAll("g.top-label").data(entries, d => d[0]);
    sel.exit().remove();
    const enter = sel.enter().append("g").attr("class", "top-label").style("opacity", 0);
    enter.append("text").attr("class", "top-label-val");
    const merged = enter.merge(sel);
    merged.attr("transform", d => {
      const featId = this._codeToFeatId(d[0]);
      const cent = this._centroidCache.get(featId);
      if (!cent) return null;
      const p = this.proj(cent);
      return `translate(${p[0]}, ${p[1]})`;
    });
    merged.select("text.top-label-val").text(d => d[1].toFixed(1) + "%");
    merged.interrupt("tl-fade").transition("tl-fade").delay(400).duration(450).style("opacity", 1);
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
    this.svg.selectAll(".map-country-label-g").remove();
    clearTimeout(this._labelTimeout);
    if (this.lockedCode) {
      const code = this.lockedCode;
      const delay = !this.ctx.motion.reduced ? 1150 : 0;
      this._labelTimeout = setTimeout(() => { if (this.lockedCode === code) this._renderMapLabel(code); }, delay);
    }
  }

  _renderMapLabel(code) {
    this.svg.selectAll(".map-country-label-g").remove();
    if (!code || !this.featCol) return;
    const featId = this._codeToFeatId(code);
    const feat = this.featCol.features.find(f => f.id === featId || this.data.topoToIso(f.id) === code);
    if (!feat) return;

    const v = this.data.hicpAnnual[code]?.CP00?.[String(this.year)];
    const name = this.data.countryName(code);
    const valText = v != null ? v.toFixed(1) + " %" : "—";
    const labelTxt = `${name}  ${valText}`;

    // Project centroid then apply current camera transform
    const [gx, gy] = this.proj(d3.geoCentroid(feat));
    const cam = this._cam || { tx: 0, ty: 0, k: 1 };
    const sx = gx * cam.k + cam.tx;
    const sy = gy * cam.k + cam.ty;
    const cx = Math.max(40, Math.min(this.W - 40, sx));
    const cy = Math.max(20, Math.min(this.H - 20, sy - 18));

    const g = this.svg.append("g").attr("class", "map-country-label-g")
      .attr("pointer-events", "none")
      .style("opacity", 0);

    const text = g.append("text").attr("class", "map-country-label")
      .attr("x", cx).attr("y", cy);
    text.text(labelTxt);

    try {
      const bb = text.node().getBBox();
      const px = 9, py = 5;
      g.insert("rect", "text").attr("class", "map-country-label-bg")
        .attr("rx", 4)
        .attr("x", bb.x - px).attr("y", bb.y - py)
        .attr("width", bb.width + px * 2).attr("height", bb.height + py * 2);
    } catch (_) {}

    g.transition("label-in").duration(220).style("opacity", 1);
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
    if (!this._timelineSvg || !this._ctrCode) return;
    const g = this._timelineSvg.select(".ctr-line-g");
    if (g.empty()) return;
    const x = this._timeX, y = this._yTimeline;
    if (!x || !y) return;
    const val = this.data.hicpAnnual[this._ctrCode]?.CP00?.[String(this.year)];
    g.selectAll(".ctr-label").remove();
    if (val == null) return;
    const lx = x(this.year);
    g.append("text").attr("class", "ctr-label")
      .attr("x", lx + (lx > 500 ? -5 : 5)).attr("y", y(val) - 5)
      .attr("text-anchor", lx > 500 ? "end" : "start")
      .text(`${this.data.countryName(this._ctrCode)} ${val.toFixed(1)}%`)
      .style("opacity", 0)
      .transition("ctr-label-in").delay(500).duration(280).style("opacity", 1);
  }

  _hover(event, d) {
    const iso = this.data.topoToIso(d.id);
    if (!this.data.countriesByCode.has(iso)) { this.ctx.tooltip.hide(); return; }
    const v = this.data.hicpAnnual[iso]?.CP00?.[String(this.year)];
    const arr = Object.entries(this.data.hicpMonthly[iso]?.CP00 || {})
      .map(([time, value]) => ({ time, value }))
      .filter(p => Number.isFinite(p.value))
      .sort((a, b) => a.time.localeCompare(b.time))
      .slice(-84);
    const spark = sparkPath(arr, 200, 44);
    const html = `<h5>${this.data.countryName(iso)}</h5>
      <div class="row"><span class="key">${this.year}</span><span class="val">${v == null ? "—" : v.toFixed(1) + "%"}</span></div>
      <div class="tip-spark"><svg width="200" height="44" viewBox="0 0 200 44">
        <path d="M 0 ${spark.zeroY} L 200 ${spark.zeroY}" stroke="var(--rule)" stroke-width="0.5" stroke-dasharray="2 2"/>
        <path d="${spark.d}" fill="none" stroke="var(--accent)" stroke-width="1.5"/>
        <circle cx="${spark.lastX}" cy="${spark.lastY}" r="2.8" fill="var(--accent)"/>
      </svg></div>
      <div style="font-size:10px;color:var(--ink-faint);letter-spacing:.04em;margin-top:4px;">monthly trend · last 7 years</div>`;
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
  }
}
