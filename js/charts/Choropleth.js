/* ============================================================
   Choropleth — editorial European inflation map
   Year kicker, capital dots, pulse rings, scroll-camera, stamp
   annotation, top-3 labels, integrated mini-area-chart timeline.
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import {
  watchChapterProgress, progressBetween, smooth, lerp
} from "../modules/ChartMotion.js";
import { CompareMap } from "./CompareMap.js";
import { getInfoPop } from "../modules/InfoPop.js";

// [debug 2026-07-06] _cameraTo's own pan/zoom transition duration — the ONE place this number is
// defined. Anything that positions a label/card AFTER the camera settles must wait AT LEAST this
// long (plus a small buffer for scheduling jitter), or it renders using this._cam's STALE
// pre-transition value (this._cam only updates in the transition's own "end" callback) — the
// resulting label sits wherever the OLD camera position would have put it, off by however far the
// camera still had left to pan. The error scales with pan distance, which is why it read as
// "sometimes fits, sometimes doesn't": one delayed consumer (the single-country click-to-focus
// path) had already been bumped to CAM_DUR+50 when this duration last changed; the step-driven
// multi-label path was missed and was still using a stale, shorter constant.
const CAM_DUR = 1100;
// [debug 2026-07-07 — owner bug report] Manual Alt+wheel zoom's own per-tick transition duration —
// deliberately much shorter than CAM_DUR (a one-shot camera flight): a wheel zoom is a rapid *stream*
// of small re-targets, not a single trip, so each tick only needs to smooth its own short hop before
// the next tick (typically <100ms later) retargets it again. How long a quiet gap between ticks means
// "the gesture ended" for clearing .is-camming.
const WHEEL_ZOOM_DUR = 160;
const WHEEL_ZOOM_IDLE = 220;

// [debug 2026-07-08 — owner retime spec] Rank-morph timing envelope + per-phase window tables.
// MORPH_HOLD/MORPH_DUR replace the old bracket-eased single tween (D79/D80): the master `p` now
// sweeps LINEARLY across its hold→motion→hold timeline (see _animateMorphTo), and EVERY phase below
// applies its OWN local easing to its OWN window of that linear motion — never a second easing layered
// on top of an already-eased master value. Windows are fractions [0,1] of MORPH_DUR; both direction
// tables are independently authored (NOT mirror images of each other — e.g. reverse's map fade-in
// deliberately overlaps fly-reverse's tail so shapes land on a visible map; a pure mirror wouldn't).
// `lockRelease` is a single threshold (pointer-lock engages the instant motion starts, releases here).
const MORPH_HOLD = 100, MORPH_DUR = 7300;
const MORPH_STAGGER_MS = 50;   // max spread of any per-element stagger (fly/bars/trail), see _tickMorph
const MORPH_FWD = {   // map -> bars
  mapFade: [0, 0.12], rise: [0, 0.15], fly: [0.12, 0.55], land: [0.50, 0.60],
  title: [0.45, 0.58], bars: [0.56, 0.78], trail: [0.60, 0.80], closing: [0.78, 0.92],
  lockRelease: 0.85,
};
const MORPH_REV = {   // bars -> map
  closing: [0, 0.14], trail: [0.10, 0.30], bars: [0.12, 0.34], title: [0.25, 0.38],
  land: [0.30, 0.40], fly: [0.38, 0.80], mapFade: [0.65, 0.88], rise: [0.78, 0.95],
  lockRelease: 0.95,
};

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
// Respin CH3 (brief §5): 4 steps — data-year (2019/2022/2024) recolour the map; data-mode="rank"
// morphs it to the ranking; a subsequent data-year reverses the morph. Per-year camera focus gives
// the "pans fire per step" beat — 2022 highlights the burning east, the calm years stay wide.
// [Fable 2026-07-07] 2022 → null RESTORED (this exact regression is documented above: "Step 2
// ('The map turns red') now uses focus:null" — the Baltics zoom on 2022 inverted the story, showing
// three highlighted countries on a dimmed Europe where the copy says "the east burns... on this
// map"). The Baltics camera-dive now belongs to the NEW 2021 step (index.html), giving the pan arc
// back: 2019 wide → 2021 dive to the Baltics → 2022 pull back to the full red map → rank → 2024.
const YEAR_FOCUS = { 2019: null, 2021: ["EE", "LT", "LV"], 2022: null, 2024: null, 2025: null };

function getCSS(name) {
  const m = name.match(/var\((--[^)]+)\)/); const n = m ? m[1] : name;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}

// [D82] Reads --dur-4 live rather than hardcoding 420 — keeps the enter/exit-compare fade-then-hide
// setTimeout (charts.css's #chart-choropleth > svg transition) in sync with the token by construction.
function CMP_FADE_MS() {
  const ms = parseFloat(getCSS("--dur-4"));
  return Number.isFinite(ms) ? ms : 420;
}

// [D84] Compare-detail (before/after mini panel) motion timing — literal ms, matching the CSS
// declarations in charts.css 1:1 (kept as JS constants here since the panel-reveal/name/row CSS
// transitions and the JS-driven line draw/morph/crossfade-sequencing must agree on the same numbers
// for the two halves to read as one coordinated motion, not two independently-timed pieces).
const CMP_DETAIL_LINE_MS = 550;          // each line's draw-in duration (Case A)
const CMP_DETAIL_LINE_STAGGER_MS = 130;  // newer-year line starts this much after the older one
const CMP_DETAIL_MORPH_MS = 450;         // line d-attribute morph duration (Case B/C, no stagger)
const CMP_DETAIL_SWAP_MS = 150;          // name/value crossfade half-duration (out, then in)
// Oversized dasharray used ONLY during Case B/C's d-morph — flubber-free plain d-interpolation
// means the path's rendered length can drift briefly during the tween even though start/end
// lengths are each measured exactly; a fixed dasharray smaller than some intermediate length would
// expose the pattern's "gap" phase as a flash partway down the line. 700 comfortably exceeds the
// theoretical max length of a 12-point line in this 220x64 viewBox (~613, at max vertical swing on
// every segment) so the "gap" phase is never reached, regardless of the intermediate shape.
const CMP_DETAIL_DASH_SAFE = 700;

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
    this._cmpEnterSeq = 0; this._cmpExitSeq = 0;   // [D83] guard stale async compare-transition continuations
    this._cmpDetailIso = null; this._cmpDetailSeq = 0;   // [D84] compare-detail panel: selected country + guard
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
    this._wireExtremesPop();   // [Fable D54] click an extreme row → InfoPop explainer

    this._renderLegend();

    // No hard SVG clip — the chart-body has a CSS mask that fades the edges softly.
    this.gMap = this.svg.append("g").attr("class", "map-layer");
    // [debug 2026-07-08 — owner "white lines during zoom" bug, THE root cause] `d3.geoGraticule()`
    // defaults to the WHOLE GLOBE (lon −180…180, lat −80…80). Projected through this Europe-centred
    // `geoConicConformal` — a conformal projection whose coordinates diverge toward infinity far from
    // its centre — the antimeridian/high-latitude grid lines land at coordinates in the HUNDREDS OF
    // MILLIONS (the raw `d` starts `M68505746,-53373867…`). That made `.map-layer`'s bounding box
    // ~383,000,000 × 337,000,000 SVG units (measured) versus the countries' sane ~1097 × 972. A layer
    // that colossal cannot fit in any GPU texture, so the compositor is FORCED to tile it — and with
    // `will-change: transform` scaling that monster during a camera flight, the tile boundaries leak
    // the paper background as the white horizontal + vertical grid the owner saw (NOT the graticule's
    // own faint claret lines, NOT the vignette mask — a compositor tiling artifact, invisible to
    // paint-based headless screenshots). Constrain the graticule to a bounded European window so its
    // projected coordinates stay finite and small; the visible grid is unchanged (the map only ever
    // showed this region anyway) but the layer's bbox collapses to the countries' own size and the
    // compositor no longer needs to tile it. This is the actual fix; the earlier `.is-camming`
    // graticule-hide (D70) and mask-drop (D75) treated symptoms of the same tiling without removing
    // the thing that forced the tiling.
    const graticule = d3.geoGraticule().step([5, 5]).extent([[-30, 30], [45, 73]]);
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
    // [debug 2026-07-07 — owner bug report: "when zooming in or out, the map shakes and white
    // vertical and horizontal lines appear and disappear"] This handler moves the SAME `.map-layer`
    // transform `_cameraTo` does, but predates D70's `.is-camming` graticule-hide and was never wired
    // into it — confirmed live (instrumented every rAF frame through a real Alt+wheel sequence):
    // `.is-camming` never gets set here, so the graticule's hairline grid (`--accent` lat/long lines)
    // is live and re-rasterising on every tick, exactly the "lines appear and disappear" D70 already
    // fixed for the click-to-zoom and scroll-into-step camera paths. Separately, every tick set the
    // transform with a bare `.attr()` — no transition at all — so a fast wheel (many ticks in quick
    // succession, typical of a trackpad) advanced the map in raw, unsmoothed jumps: the "shakes".
    // Fix mirrors `_cameraTo` exactly (same `.is-camming` class, same named "camera" transition slot
    // so a manual zoom cleanly interrupts/replaces an in-flight camera flight and vice versa) but with
    // its own much shorter WHEEL_ZOOM_DUR — this is a rapid stream of small re-targets, not one trip,
    // so each tick only has to smooth its own short hop before the next tick (often <100ms later)
    // retargets it again. `_cam` itself still updates synchronously (unlike `_cameraTo`, which only
    // updates it on the transition's "end") — the very next tick's zoom-toward-cursor math anchors on
    // it and ticks arrive far faster than any reasonable transition could complete. `.is-camming`
    // clears after WHEEL_ZOOM_IDLE ms of no further wheel events (debounced per tick) — there's no
    // single discrete "end" event for a whole burst of ticks the way a one-shot flight has one.
    // The debounce is a bare setTimeout, not a d3 transition, so nothing cancels it automatically the
    // way `.interrupt("camera")` cancels a superseded transition — it shares `_cameraTo`'s own
    // `_camSeq` generation counter (bumped by BOTH this handler and `_cameraTo`) and re-checks it right
    // before clearing, so a stale timer from an earlier tick can never stomp `.is-camming` off while a
    // NEWER wheel tick or an unrelated `_cameraTo` flight (e.g. the reader Alt+wheels, then immediately
    // clicks a country) is still actually in flight — caught live: without this guard, a leftover timer
    // cleared the class mid-flight of a click-triggered camera move that started just after.
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
      const targetTransform = `translate(${this._cam.tx}, ${this._cam.ty}) scale(${this._cam.k})`;
      this.gMap.interrupt("camera");
      if (this.ctx.motion.reduced) {
        this.gMap.attr("transform", targetTransform);
      } else {
        this._camSeq++;
        const seq = this._camSeq;
        if (this.svg) this.svg.classed("is-camming", true);
        this.gMap.transition("camera").duration(WHEEL_ZOOM_DUR).ease(d3.easeCubicInOut).attr("transform", targetTransform);
        clearTimeout(this._wheelZoomIdle);
        this._wheelZoomIdle = setTimeout(() => {
          if (seq !== this._camSeq) return;
          if (this.svg) this.svg.classed("is-camming", false);
        }, WHEEL_ZOOM_IDLE);
      }
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
    this._morphP = 0.5;        // resting = pure map
    this._rankActive = false;
    if (this.ctx?.motion?.reduced) {
      this._tickMorph(0.5);    // map; reduced-motion users don't get the flubber morph
    } else {
      // [Fable D54] The morph is TIMED now (_animateMorphTo, fired by onStep) — the owner judged
      // the scroll-synced version unreadable when it spans a single step ("we can not match the
      // transition speed with scrolling when its only 1 step"). This light subscription only keeps
      // _tickMorph's in-viewport gate + per-tick clone alignment fresh, and parks the compare
      // overlay when the chapter leaves view. _continuousMorph is retired (kept below, unreferenced).
      const chapter = this.container.closest(".chapter");
      this._chapterUnsub = watchChapterProgress(chapter, () => {
        this._tickMorph(this._morphP ?? 0.5);
        if (this._cmpWrap && !this._cmpWrap.hidden) {
          const r = chapter.getBoundingClientRect();
          if (r.bottom < 80 || r.top > innerHeight - 80) this._exitCompare();
        }
      });
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
    // [Fable D54] left-side country detail panel dropped (owner: "drop this feature").
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
    const duration = animate && !this.ctx.motion.reduced ? CAM_DUR : 0;
    const targetTransform = `translate(${target.tx}, ${target.ty}) scale(${target.k})`;
    this.gMap.interrupt("camera");
    // [Fable D54 · owner lag report] Hide the graticule while the camera flies — the hairline
    // grid re-rasterises every frame of the zoom (the "vertical and horizontal lines appear for
    // a moment") and costs paint time. CSS: .chart-svg.is-camming .graticule { opacity: 0 }.
    if (this.svg) this.svg.classed("is-camming", duration > 0);
    this.gMap.transition("camera").duration(duration).ease(d3.easeCubicInOut)
      .attr("transform", targetTransform)
      .on("end", () => {
        if (this.svg) this.svg.classed("is-camming", false);
        if (seq !== this._camSeq) return;
        this._cam = target;
        if (this._stepPulse && code) this._emitPulse(code);
      })
      .on("interrupt", () => { if (this.svg) this.svg.classed("is-camming", false); });
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
    // [Fable D54] left-side country detail panel dropped (owner: "drop this feature").
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
          <path class="ms-line" d="${sp.d}" pathLength="1" />
          <circle class="ms-dot" cx="${sp.lastX}" cy="${sp.lastY}" r="0" />
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
    if (this._transitioning) return;   // [scroll-fix §4b] ignore clicks mid-morph
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
      const delay = !this.ctx.motion.reduced ? CAM_DUR + 50 : 0;
      // [Fable D54] locked-country map label dropped with the rest of the on-map name labels.
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
    // [scroll-fix §4b] No country tooltips while the map→ranking morph is mid-flight — the map is
    // fading/zero-opacity and a hover card over a half-empty screen reads as a bug.
    if (this._transitioning) { this.ctx.tooltip.hide(); return; }
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
    if (this.container) this.container.setAttribute("data-onstep", index);
    const mode = el?.dataset?.mode;

    // ── COMPARE step (data-mode="compare") — drag-to-compare finale lives IN this panel (D54) ──
    // [debug 2026-07-08 — owner: D82's cross-fade still "reads as a jump" — a cross-fade cannot
    // work between visually dissimilar, geometrically mismatched frames. D83 replaces it with a
    // matched-geometry reveal (see _compareEnterAnimated); reduced-motion keeps the D82 snap.] ──
    if (mode === "compare") {
      // [debug 2026-07-10 — D84] Idempotency guard, found necessary (not defensive filler) while
      // verifying D84's animated panel reveal: the compare-detail panel's grid-template-rows 0fr->1fr
      // transition continuously changes the STEP CARD's own rendered height for ~280ms, and
      // scrollama's own IntersectionObserver (watching this element's geometry against the viewport
      // to detect its trigger-line crossing) turns out to be sensitive to the WATCHED ELEMENT's size
      // changing, not just the page scrolling — confirmed empirically: clicking a country while
      // reduced-motion is off caused _cmpEnterSeq to jump by 9+ within 300ms of a single click (never
      // happens under reduced-motion, where the panel snaps instead of animating), each spurious
      // onStepEnter re-fire calling _compareEnterAnimated() again and yanking the divider back to its
      // parked position mid-interaction. Rather than patch scrollama's own (vendored, third-party)
      // resize-reactivity, make re-entry a no-op if we're already in (or mid-entering) compare —
      // data-active-mode is set to "compare" synchronously at the top of the branch below and only
      // ever changes when actually LEAVING compare, so this can't block a genuine re-entry, only a
      // same-session spurious re-fire.
      if (this.container?.getAttribute("data-active-mode") === "compare") return;
      if (this.ctx.motion.reduced) {
        this._rankActive = false;
        if (this.container) this.container.setAttribute("data-active-mode", "compare");
        if (this.playing) this._togglePlay(false);
        this._removeMapLabel();
        clearTimeout(this._labelTimeout);
        this._tickMorph(0.5); this._morphP = 0.5;   // snap bars away — the overlay covers the switch
        if (this._morphRaf) { cancelAnimationFrame(this._morphRaf); this._morphRaf = null; }
        this._enterCompare();
        // D83's forward sequence otherwise parks the divider right + fades labels in on arrival —
        // reduced-motion has no sequence to do that, so assert the plain, centered D82 end-state
        // explicitly (guards a stale split/label-opacity left over from a PRIOR non-reduced visit).
        if (this._cmp) {
          this._cmp._applySplit(0.5);
          this._cmp._labelA?.style("opacity", 1);
          this._cmp._labelB?.style("opacity", 1);
          if (this._cmp._handle) this._cmp._handle.style.pointerEvents = "";
        }
      } else {
        this._compareEnterAnimated();
      }
      return;
    }

    // ── RANK step (data-mode="rank"): morph the map → ranking, TIMED (D54) ──
    if (mode === "rank") {
      this._rankActive = true;
      if (this.container) this.container.setAttribute("data-active-mode", "rank");
      if (this.playing) this._togglePlay(false);
      this._exitCompare();
      this._removeMapLabel();
      this.svg?.selectAll(".multi-label-text").remove();
      clearTimeout(this._labelTimeout);
      this._cameraTo(null, false);   // rank needs the default full-map framing before the flight
      if (this.ctx.motion.reduced) this._tickMorph(1); else this._animateMorphTo(1);
      return;
    }

    // ── YEAR step (data-year): reverse the morph if we were ranked (TIMED), then recolour + pan ──
    const wasRanked = this._rankActive || (this._morphP ?? 0.5) > 0.5;
    this._rankActive = false;
    // [debug 2026-07-08 — D83] If we're actually leaving an ANIMATED compare, defer the plain D82
    // exit-fade — _compareExitAnimated (fired at the bottom of this branch, after this.year and
    // every other piece of state below has already been updated) drives its own sweep+pivot+
    // handback sequence and calls _exitCompare() itself once the pixels underneath genuinely
    // match. Reduced-motion / not-actually-in-compare takes the unchanged, immediate D82 path.
    // Checked via data-active-mode (not _cmpWrap.hidden) so a reversal DURING enter's phase 1 —
    // before _enterCompare() has even run once, _cmpWrap.hidden is still whatever it defaulted
    // to — is still correctly recognized as "leaving compare" and routed through the animated
    // exit's own _interruptCompareAnim() rather than silently leaving a stale transition running.
    const cmpWasActive = this.container?.getAttribute("data-active-mode") === "compare";
    const animatedCmpExit = cmpWasActive && !this.ctx.motion.reduced && !!this._cmp;
    if (!animatedCmpExit) this._exitCompare();
    if (this.container) this.container.setAttribute("data-active-mode", el?.dataset?.year || "");
    if (wasRanked) { if (this.ctx.motion.reduced) this._tickMorph(0.5); else this._animateMorphTo(0.5); }

    if (this.playing) this._togglePlay(false);
    const yr = el?.dataset?.year ? +el.dataset.year : this.year;
    const prev = this.year;
    this.year = yr;
    if (this.sl) this.sl.value = yr;
    this.focusCode = YEAR_FOCUS[yr] ?? null;
    this._stepCaption = null;
    this._stepPulse = false;
    this.lockedCode = null;
    this._animateYearChange(prev);   // recolors the MAIN map to `yr` now — invisible while compare's
                                      // own SVG is still the one on top, ready for a matched handback
    this._updatePlayhead();
    this._applyFocus();
    this._cameraTo(this.focusCode);

    // [Fable D54] On-map name labels DROPPED (owner: after a click-zoom they sat at stale
    // positions; "drop countries name when showing them on the map"). The hover tooltip and the
    // kicker extremes carry the who-is-what; _renderMapLabel/_renderMultiLabels stay unreferenced.
    this._removeMapLabel();
    this.svg?.selectAll(".multi-label-text").remove();
    clearTimeout(this._labelTimeout);

    if (animatedCmpExit) this._compareExitAnimated(yr);
  }

  /** [Fable D54] Timed map↔rank morph: HOLD (frozen at `from`, MORPH_HOLD ms) → MOTION (MORPH_DUR ms)
   *  → HOLD (frozen at `target`, MORPH_HOLD ms). Fired by onStep (scroll OR rail-dot jump).
   *  [debug 2026-07-08 — owner retime spec: "the phase order is correct, do not re-choreograph... the
   *  problem is time allocation... fix the envelope, tighten to ~7.5s, and remove per-frame allocation
   *  costs"] `p` now sweeps LINEARLY across the motion segment — no easing applied here at all. Every
   *  phase inside `_tickMorph` applies its OWN local easing to its OWN window of that linear sweep
   *  (`smooth(progressBetween(p,a,b))`, or a direction-specific d3 ease for the phases the spec calls
   *  out — map-fade ease-in, rise/bars ease-out, fly ease-in-out) — a SECOND easing layered on top of
   *  an already-eased master value (the old design) reads as mushy/soft; a linear master + per-phase
   *  easing is what "each phase = smoothstep(clamp(...))" actually asks for. `this._morphDir` ('fwd'/
   *  'rev') is set here, once, and read by `_tickMorph` to pick MORPH_FWD or MORPH_REV — the two window
   *  tables are independently authored, not mirror images (see the tables' own comment). Geometry is
   *  captured ONCE here (`_captureCloneStarts`), before the rAF loop starts — not on every tick. */
  _animateMorphTo(target) {
    if (this._morphRaf) cancelAnimationFrame(this._morphRaf);
    const from = this._morphP ?? 0.5;
    if (Math.abs(target - from) < 0.001) { this._tickMorph(target); return; }
    this._morphDir = target > from ? "fwd" : "rev";
    this._captureCloneStarts();
    const total = MORPH_HOLD + MORPH_DUR + MORPH_HOLD;
    const t0 = performance.now();
    const step = (now) => {
      const t = now - t0;
      let p;
      if (t < MORPH_HOLD) p = from;
      else if (t < MORPH_HOLD + MORPH_DUR) p = from + (target - from) * ((t - MORPH_HOLD) / MORPH_DUR);
      else p = target;
      this._morphP = p;
      this._tickMorph(p);
      this._morphRaf = t < total ? requestAnimationFrame(step) : null;
    };
    this._morphRaf = requestAnimationFrame(step);
  }

  /** [debug 2026-07-08 — perf] Read the choropleth's current on-screen rect ONCE, right before a morph
   *  starts, and write every clone's start position from it — replaces the old per-TICK
   *  getBoundingClientRect() pair (forced synchronous layout, every frame) that used to live inside
   *  _tickMorph. Safe to do once per motion rather than every tick: by the time any morph starts, the
   *  camera has already been synchronously reset (onStep(rank) calls `_cameraTo(null,false)` before
   *  `_animateMorphTo`), and the sticky panel's own on-screen rect doesn't move while a chapter is
   *  pinned — the ONLY situation this cache could go stale is the reader resizing the window mid-morph,
   *  a rare edge case not worth paying a forced-layout cost on every one of ~450 frames for. */
  _captureCloneStarts() {
    const clones = this._bars?.clones;
    if (!clones || !clones.length) return;
    const choroSvg = this.svg?.node();
    const stage = this._barsStage;
    if (!choroSvg || !stage) return;
    const choroRect = choroSvg.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const cam = this._cam || { tx: 0, ty: 0, k: 1 };
    const m = this._bars.margin;
    const stageW = this._bars.W, stageH = this._bars.H;
    const sX = choroRect.width / this.W, sY = choroRect.height / this.H;
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

  /** [Fable D54] Kicker extreme rows (RO/PT etc.) → InfoPop explainer on click. Text is built at
   *  click time so it always matches the currently shown year. */
  _wireExtremesPop() {
    const pop = getInfoPop();
    const wire = (sel, kind) => {
      if (!sel) return;
      sel.attr("pointer-events", "all").style("cursor", "help").attr("tabindex", "0").attr("role", "button");
      const open = (e) => {
        e.preventDefault(); e.stopPropagation();
        const ext = this._yearExtremes(this.year);
        const rec = kind === "hi" ? ext?.hi : ext?.lo;
        if (!rec) return;
        const text = kind === "hi"
          ? `${rec.name} — the highest annual inflation on this map in ${this.year}: ${rec.value.toFixed(1)}%.`
          : `${rec.name} — the lowest annual inflation on this map in ${this.year}: ${rec.value.toFixed(1)}%.`;
        pop.open(sel.node(), text);
      };
      sel.on("click", open);
      sel.on("keydown", (e) => { if (e.key === "Enter" || e.key === " ") open(e); });
    };
    wire(this.kickerHi, "hi");
    wire(this.kickerLo, "lo");
  }

  /** [Fable D54] The drag-to-compare finale, embedded in this chapter's panel (the separate
   *  full-width CompareMap chapter is retired). Built lazily on first entry.
   *  [debug 2026-07-08 — owner report: "map changes suddenly" — D82] The map's own layers used to
   *  hide via an instant `visibility:hidden` while .choro-cmp-wrap faded in over --dur-4 — an
   *  asymmetric cut (old content vanishes in one frame, new content grows in from blank), confirmed
   *  via a frame-by-frame trace: gMap opacity stayed 1 right up to the step flip, then visibility
   *  snapped hidden the SAME frame .choro-cmp-wrap appeared at opacity 0. Now both sides fade
   *  together over the identical --dur-4/--ease-out window (CSS rule in charts.css) — opacity drives
   *  the fade, visibility is only the END state (set after the fade completes) so hidden content
   *  still stops taking pointer events/a11y focus once truly invisible, exactly like `_tickMorph`'s
   *  own opacity-then-visibility pattern elsewhere in this file. */
  _enterCompare() {
    if (!this._cmpWrap) {
      const wrap = document.createElement("div");
      wrap.className = "choro-cmp-wrap";       // opacity 0 until .is-in — invisible but LAID OUT,
      wrap.id = "chart-choropleth-compare";    // so CompareMap's size() reads a real clientWidth
      this.container.appendChild(wrap);
      this._cmpWrap = wrap;
      this._cmp = new CompareMap("#chart-choropleth-compare", this.data, this.ctx, this);
      this._cmp.render();
      this._wireCmpDetail();
    }
    const reduced = this.ctx.motion.reduced;
    [...this.container.children].forEach(ch => {
      if (ch === this._cmpWrap) return;
      ch.dataset.cmpHidden = "1";
      ch.style.opacity = "0";
      clearTimeout(ch._cmpFadeTimer);
      if (reduced) ch.style.visibility = "hidden";
      else ch._cmpFadeTimer = setTimeout(() => { if (ch.dataset.cmpHidden) ch.style.visibility = "hidden"; }, CMP_FADE_MS());
    });
    this._cmpWrap.hidden = false;
    requestAnimationFrame(() => this._cmpWrap.classList.add("is-in"));
  }

  _exitCompare() {
    if (!this._cmpWrap || this._cmpWrap.hidden) return;
    this._cmpWrap.classList.remove("is-in");   // starts its own opacity 1->0 fade (CSS)
    const reduced = this.ctx.motion.reduced;
    [...this.container.children].forEach(ch => {
      if (!ch.dataset || !ch.dataset.cmpHidden) return;
      delete ch.dataset.cmpHidden;
      clearTimeout(ch._cmpFadeTimer);
      ch.style.visibility = "";   // visible again FIRST, so the opacity fade-in is actually seen
      ch.style.opacity = "1";
    });
    clearTimeout(this._cmpWrap._cmpFadeTimer);
    if (reduced) this._cmpWrap.hidden = true;
    else this._cmpWrap._cmpFadeTimer = setTimeout(() => { this._cmpWrap.hidden = true; }, CMP_FADE_MS());
  }

  /** [D83] Kill every named transition either compare choreography can possibly have in flight,
   *  regardless of which one started it. Necessary (not just belt-and-suspenders): enter and exit
   *  each touch a PARTIALLY overlapping set of named transitions per phase (enter's phase 1 pivots
   *  the MAIN map; exit never touches the main map's fill at all) — same-name-same-element d3
   *  auto-interrupt only fires where the two sequences actually collide, which isn't every phase.
   *  A rapid reversal inside the ~600ms color-pivot window is the concrete failure this closes: a
   *  stale "cmpPivot" transition left running toward the OLD target would keep overriding the new
   *  sequence's own instant fill-set on every subsequent frame otherwise. Called at the top of both
   *  _compareEnterAnimated and _compareExitAnimated so either one always starts from a clean slate. */
  _interruptCompareAnim() {
    this.countryPaths?.interrupt("cmpPivot");
    if (this._cmp) {
      this._cmp.gA?.selectAll("path.cmp-country").interrupt("cmpFill");
      this._cmp.gB?.selectAll("path.cmp-country").interrupt("cmpFill");
    }
    if (this._cmpWrap) d3.select(this._cmpWrap).interrupt("cmpSweep");
  }

  /** [debug 2026-07-08 — owner: D82's cross-fade "still reads as a jump" — D83] A cross-fade
   *  cannot work between visually dissimilar, geometrically mismatched frames; STEP 0 measured
   *  CompareMap at ~0.59x the main map's scale, letterboxed. Now that geometry is unified
   *  (CompareMap.js's `host` param), the two views land on the SAME pixels whenever their colors
   *  also match — so instead of fading between two different-looking things, this sequence makes
   *  them the SAME thing before ever swapping: (1) recolor the MAP THAT'S ALREADY VISIBLE from its
   *  current year to compare's older year (2019) — a plain fill transition, no swap yet; (2) at
   *  that instant the pixels genuinely match, so hand off to CompareMap's SVG (D82's fade plays
   *  but is imperceptible — nothing actually changes) with its divider parked at the far right
   *  edge (matches "all older year" exactly); (3) sweep the divider to center, revealing the newer
   *  year; (4) invite: labels fade in, the handle pulses once and unlocks. Every step uses a NAMED
   *  d3 transition ("cmpPivot"/"cmpSweep"/"cmpFill") so a rapid scroll-reversal mid-sequence
   *  interrupts-and-replaces automatically (d3's own semantics) rather than queuing — the paired
   *  `_cmpEnterSeq`/`_cmpExitSeq` counters additionally guard the .then() continuations themselves
   *  (a promise already in flight when superseded must not act on stale state once it resolves). */
  _compareEnterAnimated() {
    this._interruptCompareAnim();
    this._rankActive = false;
    if (this.container) this.container.setAttribute("data-active-mode", "compare");
    if (this.playing) this._togglePlay(false);
    this._removeMapLabel();
    clearTimeout(this._labelTimeout);
    this._tickMorph(0.5); this._morphP = 0.5;
    if (this._morphRaf) { cancelAnimationFrame(this._morphRaf); this._morphRaf = null; }
    this._cmpExitSeq++;   // any in-flight EXIT sequence is now stale — we're going back IN

    if (!this._cmpWrap) {
      const wrap = document.createElement("div");
      wrap.className = "choro-cmp-wrap";
      wrap.id = "chart-choropleth-compare";
      this.container.appendChild(wrap);
      this._cmpWrap = wrap;
      this._cmp = new CompareMap("#chart-choropleth-compare", this.data, this.ctx, this);
      this._cmp.render();
      this._wireCmpDetail();
    }
    const cmp = this._cmp;
    const prevYear = this.year;
    const targetYear = cmp.yearA;
    const enterSeq = ++this._cmpEnterSeq;

    this._swapKicker(prevYear, targetYear);
    if (cmp._handle) cmp._handle.style.pointerEvents = "none";   // locked until phase 4 (invite)
    cmp._labelA?.style("opacity", 0);
    cmp._labelB?.style("opacity", 0);

    this._transitionCountryFill(targetYear, 600, d3.easeCubicInOut).then(() => {
      if (enterSeq !== this._cmpEnterSeq) return;   // superseded — a newer entry (or an exit) owns this now
      return Promise.all([cmp._transitionYear(cmp.gA, cmp.yearA, 0), cmp._transitionYear(cmp.gB, cmp.yearB, 0)])
        .then(() => {
          if (enterSeq !== this._cmpEnterSeq) return;
          cmp._applySplit(0.96);          // far right — matches the fully-2019 state phase 1 just made
          this._enterCompare();           // D82's handoff — pixel-identical, so its own fade is a no-op look
          return d3.select(this._cmpWrap).transition("cmpSweep").duration(900).ease(d3.easeCubicInOut)
            .tween("split", () => { const i = d3.interpolateNumber(0.96, 0.5); return t => cmp._applySplit(i(t)); })
            .end().catch(() => {});
        });
    }).then(() => { if (enterSeq === this._cmpEnterSeq) this._compareInvite(); })
      .catch(() => {});
  }

  _compareInvite() {
    const cmp = this._cmp;
    if (!cmp) return;
    if (cmp._handle) {
      cmp._handle.style.pointerEvents = "";
      cmp._handle.classList.remove("is-pulsing");
      void cmp._handle.offsetWidth;   // restart the keyframe animation on re-add
      cmp._handle.classList.add("is-pulsing");
    }
    cmp._labelA?.transition("cmpLabel").duration(300).style("opacity", 1);
    cmp._labelB?.transition("cmpLabel").duration(300).style("opacity", 1);
  }

  /** [D83] Mirror of _compareEnterAnimated — sweeps the divider back to the right edge (full
   *  older-year view), recolors CompareMap's own layer to `destYear` while it's still the thing
   *  on screen, then hands back to the main map (already showing `destYear`, set synchronously by
   *  `_animateYearChange` earlier in this same onStep call — see the YEAR-step branch). `destYear`
   *  is whatever step was actually entered (a rail-dot jump can land anywhere, not just "2024"),
   *  so this correctly no-ops the fill pivot when it happens to already match. */
  _compareExitAnimated(destYear) {
    this._interruptCompareAnim();
    const cmp = this._cmp;
    if (!cmp || !this._cmpWrap) { this._exitCompare(); return; }
    const exitSeq = ++this._cmpExitSeq;
    if (cmp._handle) { cmp._handle.style.pointerEvents = "none"; cmp._handle.classList.remove("is-pulsing"); }
    cmp._labelA?.interrupt("cmpLabel").style("opacity", 0);
    cmp._labelB?.interrupt("cmpLabel").style("opacity", 0);
    const fromSplit = cmp.split;

    d3.select(this._cmpWrap).transition("cmpSweep").duration(700).ease(d3.easeCubicInOut)
      .tween("split", () => { const i = d3.interpolateNumber(fromSplit, 0.96); return t => cmp._applySplit(i(t)); })
      .end().catch(() => {})
      .then(() => {
        if (exitSeq !== this._cmpExitSeq) return;
        return cmp._transitionYear(cmp.gA, destYear, 600, d3.easeCubicInOut);
      })
      .then(() => { if (exitSeq === this._cmpExitSeq) this._exitCompare(); })   // pixel-identical handback
      .catch(() => {});
  }

  /** [D83] Transitions the MAIN choropleth's own country fills to `year`'s values — the forward
   *  choreography's "color pivot," run on the map that's actually visible before any layer swap.
   *  Named ("cmpPivot") so a rapid reversal mid-pivot interrupts cleanly; `ms<=0`/reduced snaps. */
  _transitionCountryFill(year, ms = 0, ease) {
    const euSel = this.countryPaths.filter(d => this.data.countriesByCode.has(this.data.topoToIso(d.id)));
    const fillFor = d => {
      const v = this.data.hicpAnnual[this.data.topoToIso(d.id)]?.CP00?.[String(year)];
      return v == null ? this._noDataColor : this.color(v);
    };
    if (ms <= 0 || this.ctx.motion.reduced) { euSel.interrupt("cmpPivot").attr("fill", fillFor); return Promise.resolve(); }
    return euSel.transition("cmpPivot").duration(ms).ease(ease || d3.easeCubicInOut)
      .attr("fill", fillFor).end().catch(() => {});
  }

  /** Click a country on the compare map → small before/after card in the step's detail slot. */
  _wireCmpDetail() {
    const detail = document.getElementById("ch3-compare-detail");
    if (!detail || !this._cmpWrap) return;
    this._cmpDetailEl = detail;   // [D84] stored so _onCmpYearChange (fired from CompareMap.js's own
                                   // dropdown handlers, a different call stack) can reach it too.
    this._cmpWrap.addEventListener("click", (e) => {
      const pathEl = e.target.closest && e.target.closest("path.cmp-country");
      if (!pathEl || pathEl.classList.contains("is-non-eu")) return;
      const d = pathEl.__data__;
      const iso = this.data.topoToIso(d?.id);
      if (!iso || !this.data.countriesByCode.has(iso)) return;
      e.stopPropagation();                    // keep the divider-jump click from firing
      this._renderCmpDetail(detail, iso);
    }, true);
  }

  /** [D84] Owner: "the year dropdown, while a country is selected, should re-render with the same
   *  morph treatment as Case B." This case had NO wiring at all before — CompareMap's own year-<select>
   *  change handlers only ever repainted the map layers + corner labels, never touched the detail
   *  panel, so switching years while a country was selected silently left the OLD year pair's before/
   *  after data on screen. Fixed at the source (CompareMap.js calls this via `_host`) rather than
   *  papering over it with new motion on top of stale data. No-ops if nothing is currently selected. */
  _onCmpYearChange() {
    if (!this._cmpDetailIso || !this._cmpDetailEl) return;
    this._renderCmpDetail(this._cmpDetailEl, this._cmpDetailIso);
  }

  /** [D84] Builds the detail panel's DOM ONCE (lazily, on first selection) and returns the cached
   *  element refs — everything after this reuses the SAME nodes, which is what makes Case B/C's line
   *  MORPH and text CROSSFADE possible at all (the old innerHTML-replace-every-time implementation
   *  destroyed and rebuilt the <polyline>s on every click, leaving nothing persistent to tween from).
   *  <path>, not the old <polyline> — needed for the d-attribute morph d3 does in _cmpDetailSwitch;
   *  stroke-dasharray/dashoffset work identically on either (both are SVGGeometryElements). */
  _ensureCmpDetailDom(el) {
    if (this._cmpDetailEls && this._cmpDetailEls.root === el) return this._cmpDetailEls;
    el.innerHTML =
      `<div class="cmp-detail__inner">` +
      `<div class="cmp-detail__name"></div>` +
      `<svg class="cmp-detail__mini" viewBox="0 0 220 64" preserveAspectRatio="none" aria-hidden="true">` +
      `<path class="cmp-mini-a"></path><path class="cmp-mini-b"></path></svg>` +
      `<div class="cmp-detail__rows">` +
      `<span class="cmp-detail__row cmp-detail__row--a"></span>` +
      `<span class="cmp-detail__row cmp-detail__row--b"></span></div></div>`;
    this._cmpDetailEls = {
      root: el,
      name: el.querySelector(".cmp-detail__name"),
      pathA: el.querySelector(".cmp-mini-a"),
      pathB: el.querySelector(".cmp-mini-b"),
      rowA: el.querySelector(".cmp-detail__row--a"),
      rowB: el.querySelector(".cmp-detail__row--b"),
    };
    return this._cmpDetailEls;
  }

  /** [D84] Kills every named transition either case can have in flight, on both paths, regardless of
   *  which case started it — Case A's draw-in ("cmpDetailDrawA/B") and Case B/C's morph
   *  ("cmpDetailMorphA/B") are DIFFERENT names on the SAME elements, so d3's own same-name interrupt
   *  doesn't cover a rapid click that arrives while the OTHER case's transition is still running
   *  (e.g. a second country clicked before the first one's draw-in finishes) — same reasoning as
   *  D83's _interruptCompareAnim, same fix shape. */
  _interruptCmpDetail(els) {
    d3.select(els.pathA).interrupt("cmpDetailDrawA").interrupt("cmpDetailMorphA");
    d3.select(els.pathB).interrupt("cmpDetailDrawB").interrupt("cmpDetailMorphB");
  }

  _renderCmpDetail(el, iso) {
    const cmp = this._cmp;
    const a = cmp.yearA, b = cmp.yearB;
    const series = (y) => Array.from({ length: 12 }, (_, i) =>
      this.data.hicpMonthly[iso]?.CP00?.[`${y}-${String(i + 1).padStart(2, "0")}`] ?? null);
    const A = series(a), B = series(b);
    const va = this.data.hicpAnnual[iso]?.CP00?.[String(a)];
    const vb = this.data.hicpAnnual[iso]?.CP00?.[String(b)];
    const all = [...A, ...B].filter(v => v != null);
    if (!all.length) return;   // [D84] no data at all for this country/year pair — leave prior state
                                // untouched (was `el.innerHTML=""` — no longer applies now that the
                                // skeleton is persistent; this is a rare edge case, real EU-27 HICP
                                // data has no gaps, not worth a dedicated collapse animation).
    const lo = Math.min(...all), hi = Math.max(...all), span = Math.max(0.1, hi - lo);
    const W = 220, H = 64;
    const lineGen = d3.line().defined(v => v != null)
      .x((_, i) => i / 11 * W)
      .y(v => H - 6 - (v - lo) / span * (H - 12));
    const dA = lineGen(A) || "", dB = lineGen(B) || "";
    const nameTxt = this.data.countryName(iso);
    const rowATxt = `${a} · ${va != null ? va.toFixed(1) + "%" : "—"}`;
    const rowBTxt = `${b} · ${vb != null ? vb.toFixed(1) + "%" : "—"}`;

    this._cmpDetailIso = iso;   // for _onCmpYearChange (Case C)
    const els = this._ensureCmpDetailDom(el);
    const wasIn = el.classList.contains("is-in");   // read BEFORE mutating anything below
    this._interruptCmpDetail(els);
    const reduced = this.ctx.motion.reduced;

    if (!wasIn || reduced) {
      // ===== CASE A — first selection: reveal the panel, draw both lines left-to-right =====
      el.classList.remove("is-in");   // in case a stale reduced-motion state left it set oddly
      els.name.classList.remove("is-swap", "is-swap-in");
      els.rowA.classList.remove("is-shown", "is-swap", "is-swap-in");
      els.rowB.classList.remove("is-shown", "is-swap", "is-swap-in");
      els.name.textContent = nameTxt;
      els.rowA.textContent = rowATxt;
      els.rowB.textContent = rowBTxt;
      els.pathA.setAttribute("d", dA);
      els.pathB.setAttribute("d", dB);
      el.classList.add("is-in");   // starts the grid-template-rows reveal + name/divider fade (CSS)

      if (reduced) {
        els.pathA.removeAttribute("stroke-dasharray"); els.pathA.removeAttribute("stroke-dashoffset");
        els.pathB.removeAttribute("stroke-dasharray"); els.pathB.removeAttribute("stroke-dashoffset");
        els.rowA.classList.add("is-shown");
        els.rowB.classList.add("is-shown");
        return;
      }
      // getTotalLength() measured ONCE per path, immediately after setting `d`, never per frame —
      // the draw-in itself is driven by a d3 attr-transition on stroke-dashoffset, not rAF.
      const lenA = els.pathA.getTotalLength(), lenB = els.pathB.getTotalLength();
      els.pathA.setAttribute("stroke-dasharray", `${lenA} ${lenA}`);
      els.pathA.setAttribute("stroke-dashoffset", String(lenA));
      els.pathB.setAttribute("stroke-dasharray", `${lenB} ${lenB}`);
      els.pathB.setAttribute("stroke-dashoffset", String(lenB));
      d3.select(els.pathA).transition("cmpDetailDrawA").duration(CMP_DETAIL_LINE_MS).ease(d3.easeCubicOut)
        .attr("stroke-dashoffset", 0).end().then(() => els.rowA.classList.add("is-shown")).catch(() => {});
      d3.select(els.pathB).transition("cmpDetailDrawB").delay(CMP_DETAIL_LINE_STAGGER_MS)
        .duration(CMP_DETAIL_LINE_MS).ease(d3.easeCubicOut).attr("stroke-dashoffset", 0)
        .end().then(() => els.rowB.classList.add("is-shown")).catch(() => {});
      return;
    }

    // ===== CASE B/C — switching country, or a year changed while one is selected: morph, don't
    // re-reveal. Shape morphs via a d3 attr-transition on `d` (the x-domain is always the same 12
    // evenly-spaced months, so plain string interpolation is safe — no flubber needed). dasharray
    // widens to a safe constant (see CMP_DETAIL_DASH_SAFE) and dashoffset re-targets 0 — normally a
    // no-op since it's already 0, but if a rapid click interrupted Case A's OWN draw-in mid-flight
    // this also finishes revealing it, so the morph never starts from a partially-hidden line. =====
    if (reduced) {
      els.pathA.removeAttribute("stroke-dasharray"); els.pathA.removeAttribute("stroke-dashoffset");
      els.pathB.removeAttribute("stroke-dasharray"); els.pathB.removeAttribute("stroke-dashoffset");
      els.pathA.setAttribute("d", dA);
      els.pathB.setAttribute("d", dB);
      els.name.textContent = nameTxt; els.rowA.textContent = rowATxt; els.rowB.textContent = rowBTxt;
      this._cmpDetailSeq++;   // invalidate any in-flight (pre-toggle) swap timers
      clearTimeout(this._cmpDetailSwapT1); clearTimeout(this._cmpDetailSwapT2);
      [els.name, els.rowA, els.rowB].forEach(n => n.classList.remove("is-swap", "is-swap-in"));
      return;
    }
    els.pathA.setAttribute("stroke-dasharray", `${CMP_DETAIL_DASH_SAFE} ${CMP_DETAIL_DASH_SAFE}`);
    els.pathB.setAttribute("stroke-dasharray", `${CMP_DETAIL_DASH_SAFE} ${CMP_DETAIL_DASH_SAFE}`);
    d3.select(els.pathA).transition("cmpDetailMorphA").duration(CMP_DETAIL_MORPH_MS).ease(d3.easeCubicInOut)
      .attr("d", dA).attr("stroke-dashoffset", 0);
    d3.select(els.pathB).transition("cmpDetailMorphB").duration(CMP_DETAIL_MORPH_MS).ease(d3.easeCubicInOut)
      .attr("d", dB).attr("stroke-dashoffset", 0);

    // name + both value rows crossfade together (150ms out, swap text, 150ms in) — a sequence
    // counter guards the setTimeout-driven text-swap so a rapid re-click cancels cleanly instead of
    // a stale callback overwriting a NEWER click's text after the fact.
    const seq = ++this._cmpDetailSeq;
    const group = [els.name, els.rowA, els.rowB];
    group.forEach(n => n.classList.remove("is-swap-in"));
    group.forEach(n => n.classList.add("is-swap"));
    clearTimeout(this._cmpDetailSwapT1); clearTimeout(this._cmpDetailSwapT2);
    this._cmpDetailSwapT1 = setTimeout(() => {
      if (seq !== this._cmpDetailSeq) return;
      els.name.textContent = nameTxt; els.rowA.textContent = rowATxt; els.rowB.textContent = rowBTxt;
      group.forEach(n => n.classList.add("is-swap-in"));
      this._cmpDetailSwapT2 = setTimeout(() => {
        if (seq !== this._cmpDetailSeq) return;
        group.forEach(n => n.classList.remove("is-swap", "is-swap-in"));
      }, CMP_DETAIL_SWAP_MS);
    }, CMP_DETAIL_SWAP_MS);
  }

  // [debug 2026-07-06 — owner report: "still fast and buggy... synced by scrolling with reasonable
  // speed"] The map<->rank morph used to run on ITS OWN CLOCK — onStep fired a fixed-duration eased
  // tween toward a target (first 420ms, then slowed to 640ms in the previous fix) — so once
  // triggered, it kept animating regardless of whether the reader kept scrolling. That's exactly the
  // "fast and buggy" feel even after the camera-glitch and speed fixes: motion the scroll TRIGGERED,
  // not motion the scroll IS. Replaced with a continuous, scrollY-driven interpolation — the same
  // pattern used for SmallMultiplesLine's line-draw fix in this same session — computing each step's
  // own trigger-crossing scroll position and interpolating _morphP between adjacent steps' own
  // targets (year steps: 0.5, pure map; the rank step: 1, full bars) directly off the CURRENT scroll
  // position. The morph now visibly flies WHILE the reader scrolls from "Two Europes" into "The gap,
  // in order," completing exactly as that step's own text becomes current — never early (the bug
  // that motivated the ORIGINAL fixed-duration approach), never a separate clock racing the reader.
  _stepTriggerYs() {
    const chapter = this.container?.closest(".chapter");
    const steps = chapter ? [...chapter.querySelectorAll(".scroller__step")] : [];
    return steps.map(el => el.getBoundingClientRect().top + scrollY - innerHeight * 0.55);
  }
  _stepMorphTargets() {
    const chapter = this.container?.closest(".chapter");
    const steps = chapter ? [...chapter.querySelectorAll(".scroller__step")] : [];
    return steps.map(el => (el.dataset.mode === "rank" ? 1 : 0.5));
  }
  _continuousMorph() {
    if (this.ctx.motion.reduced) return;
    const ys = this._stepTriggerYs();
    if (!ys.length) { this._tickMorph(this._morphP ?? 0.5); return; }
    const targets = this._stepMorphTargets();
    const y = scrollY;
    let p, headingToRank;
    if (y <= ys[0]) { p = targets[0]; headingToRank = targets[0] === 1; }
    else if (y >= ys[ys.length - 1]) { p = targets[targets.length - 1]; headingToRank = targets[targets.length - 1] === 1; }
    else {
      let i = 0;
      while (i < ys.length - 1 && y > ys[i + 1]) i++;
      const segP = smooth((y - ys[i]) / (ys[i + 1] - ys[i]));
      p = targets[i] + (targets[i + 1] - targets[i]) * segP;
      headingToRank = targets[i + 1] === 1;
    }
    // [debug 2026-07-06] Camera reset moves HERE from onStep's rank branch: with the morph now
    // continuously scroll-driven, it starts progressing as soon as scrollY enters the segment
    // leading INTO the rank step — well before onStep(rank) itself fires (that now happens at the
    // segment's END, once morphP has already reached 1). Reset once, the instant we first start
    // heading toward the rank target (map still fully opaque at this point — mapFade only starts at
    // p=0.64, comfortably later), not when onStep eventually fires on an already-far-along morph.
    if (headingToRank && !this._morphCamReset) { this._cameraTo(null, false); this._morphCamReset = true; }
    else if (!headingToRank) { this._morphCamReset = false; }
    this._morphP = p;
    this._tickMorph(p);
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

    // [scroll-fix §4b] DATA-FIT (asymmetric) domain. The deviations are lopsided (+33.9 Hungary vs
    // only −10.5 Denmark), so a symmetric [-xExt,xExt] left the whole centre-left empty — a big gap
    // between the far-left country names and the bars (the owner's "empty bands"). Fit each side to its
    // own extent (with pad for the value labels) so the bars span the full width and names sit beside them.
    const _devs   = barRows.map(r => r.cumPct - euVal);
    const _posMax = Math.max(1, d3.max(_devs) || 1);
    const _negMax = Math.max(0, -(d3.min(_devs) || 0));

    // [debug 2026-07-06 — owner report: "should be in the right side like all charts we have"] The
    // wrap now lives INSIDE `this.container` (`.chart-body` — the exact box the choropleth map's own
    // SVG fills, `position:relative` per scrollytelling.css), not the whole `.chapter`. It fills that
    // one box (`position:absolute; inset:0` in charts.css) instead of the full viewport.
    const wrap = document.createElement("div");
    wrap.className = "choro-bars-wrap";
    this.container.appendChild(wrap);

    const stage = document.createElement("div");
    stage.className = "choro-bars-stage";
    wrap.appendChild(stage);

    // Layout sized to the STAGE — now the same ~750-900px column every other chart draws into, not
    // a 1200-1500px full-screen canvas. [debug 2026-07-06] Always uses the compact (ISO-code,
    // slim-margin) layout that used to be mobile-only: at this width there's no longer a "wide
    // desktop" case to branch on. Right margin shrunk hard now the per-row sparkline column is gone
    // (see the removed `bar-spark` block below) — that was 140px of chart plus its own gutter.
    const W = stage.clientWidth || this.W || 700;
    const H = stage.clientHeight || (wrap.clientHeight || this.H || 700);
    const isMobile = W < 480;
    // [debug 2026-07-06] Shrunk again now the title block is 16px/left-aligned (was 92/68 sized for
    // a 28px centered title + full country names) — measured overlap on real pixels: "Netherlands"/
    // "Luxembourg" etc. at 12px don't fit this left margin and bleed across the zero line into the
    // small bars sitting right next to it (see the ISO-code switch below, which is the other half
    // of this same fix).
    const m = isMobile
      ? { top: 56, right: 16, bottom: 56, left: 52 }
      : { top: 60, right: 24, bottom: 64, left: 58 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;
    const yBand = d3.scaleBand().domain(barRows.map(r => r.code)).range([0, ih]).padding(0.18);
    // [debug 2026-07-06] Negative-side padding 1.22→1.6: in this narrower confined layout the
    // most-negative bars (Denmark -10.5% etc.) started so close to the row's own left edge that
    // their value label (anchored just before the bar's far end, same convention as the positive
    // side) had nowhere to go but ON TOP of the ISO code — measured overlap on real pixels. More
    // padding here pushes every negative bar's start further from the edge, same fix in spirit as
    // the left-margin bump above, both aimed at the same collision.
    const xLin  = d3.scaleLinear().domain([-(_negMax * 1.6 + 1), _posMax * 1.12]).range([0, iw]);
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

    // [Morph-v2 · Task 4] Inline legend — top-right, EU27 line key.
    // [debug 2026-07-06 — owner report] The per-row sparkline (+ this second legend row explaining
    // it) is REMOVED — the confined ~750-900px column has no room for a 140px trend-line column per
    // row, and hovering a row already opens the shared tooltip's own enlarged 2-line mini-chart
    // (`_barMiniChart` — untouched, still wired below), so the detail the sparkline offered didn't
    // disappear, just moved from "always on, cramped" to "on demand, full-size."
    // [Fable D54] Top-right EU-27 legend dropped — it duplicated the bars-eu-tag under the zero
    // rule (owner: "written twice"). The tag anchors the zero line; one statement is enough.
    this._bars_legend = null;

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
    // [Fable D54] In-overlay source dropped — its "fixed-position fullscreen" rationale died when
    // S37 confined the wrap into chart-body: the panel-foot source right below is always visible,
    // so this mirrored line read as the source printed twice (owner report).
    this._bars_source = null;

    const root = d3.select(svg).append("g").attr("transform", `translate(${m.left}, ${m.top})`);

    // Section title — appears centered above the bars
    // [Morph-v2 user-fix] Removed the SVG .bars-title — replaced by the HTML
    // .bars-textbox--top text overlay (which doesn't overlap, supports Fraunces italic,
    // and is positioned outside the chart drawing area).

    // EU27 zero rule
    const euZeroEl = root.append("line").attr("class", "bars-eu-zero")
      .attr("x1", xLin(0)).attr("x2", xLin(0))
      .attr("y1", 0).attr("y2", ih)
      .attr("stroke", "var(--ink)")
      .attr("stroke-dasharray", "4 4")
      .attr("stroke-opacity", 0.55)
      .node();
    // [R2-elevate · kill the title bleed] The old top-anchored .bars-eu-label sat at the
    // zero line (chart centre, y:-2) directly BEHIND the centred HTML title — pixel-confirmed
    // garbled overlap in EVERY morph frame (round-1 before 07-10, light + dark). The EU-27 line
    // is now identified by (a) a small tag at the BOTTOM of the zero rule, in empty space, and
    // (b) directional axis cues below the bars — together making the deviation framing explicit
    // without ever colliding with the title.
    // EU-27 tag sits centred directly under the zero rule. The directional cues are pushed to
    // the FAR ENDS of the axis (under the most-negative / most-positive bars) so they never
    // collide with the centred tag. Two stacked rows keep everything legible.
    const euTagEl = root.append("text").attr("class", "bars-eu-tag")
      .attr("x", xLin(0)).attr("y", ih + 17).attr("text-anchor", "middle")
      .style("opacity", 0)
      .text(`EU-27 average · +${euVal.toFixed(1)} %`)
      .node();
    // [Fable D54] "← cooler / hotter →" cues dropped (owner). The diverging bars + the EU-tag
    // under the zero rule carry the direction on their own.

    const rowH = yBand.bandwidth();

    // Compute each country's START position in this bar-layer's SVG coords.
    // Captured at build time; valid as long as the choropleth's layout doesn't change.
    const startPositions = this._computeStartPositions(barRows, wrap, m.left, m.top);

    // Group per row — positioned at FINAL bar y. Migration happens inside via translate.
    const rowG = root.selectAll("g.bar-row").data(barRows, d => d.code).join("g")
      .attr("class", "bar-row")
      .attr("data-code", d => d.code)
      .attr("transform", d => `translate(0, ${yBand(d.code)})`);

    // [debug 2026-07-08 — perf] Cache a direct node reference per row/element HERE, at build time —
    // _tickMorph drives every tick from this flat array (raw setAttribute/style, indexed by rank,
    // rank===array-index since rowG's join followed barRows' own already-rank-sorted order) instead of
    // re-querying `root.selectAll(...)` every frame. rank is redundant with array index but kept
    // explicit so _tickMorph never has to assume it.
    const rowEls = [];
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
      const flagEl = g.append("image").attr("class", "bar-flag")
        .attr("href", `assets/flags/${d.iso}.svg`)
        .attr("x", flagX - 7).attr("y", flagY - 5)
        .attr("width", 14).attr("height", 9)
        .style("opacity", 0)
        .node();

      // [debug 2026-07-06] Country name → ISO code, always (was full name on "desktop" — the old
      // full-viewport branch). Confirmed by measurement: "Netherlands"/"Luxembourg" etc. at 12px
      // don't fit the ~44px left margin this confined column needs, and were bleeding across the
      // zero line into whatever small bar sits next to it. Full name is still one hover away in the
      // tooltip's own mini-chart (`_barMiniChart`, unchanged).
      const nameEl = g.append("text").attr("class", "bar-name")
        .attr("x", flagX + 12).attr("y", flagY + 4)
        .text(d.code)
        .style("opacity", 0)
        .node();

      // Bar rect
      const rectEl = g.append("rect").attr("class", "bar-rect")
        .attr("x", barX).attr("y", 1)
        .attr("width", 0)
        .attr("height", rowH - 2)
        .attr("rx", 2)
        .attr("fill", fill)
        .attr("data-target-width", barW)
        .attr("data-target-x", barX)
        .node();

      // Value label
      const valueEl = g.append("text").attr("class", "bar-value")
        .attr("y", flagY + 4)
        .attr("text-anchor", dev >= 0 ? "start" : "end")
        .attr("x", dev >= 0 ? xDev + 6 : xDev - 6)
        .attr("fill", "var(--ink-soft)")   /* readable neutral — bar colour carries sign/heat; --seq-1 negatives were near-invisible */
        .style("opacity", 0)
        .text(`${dev >= 0 ? "+" : ""}${dev.toFixed(1)}%`)
        .node();

      // [debug 2026-07-06 — owner report] Per-row inline sparkline REMOVED — see the legend comment
      // above for why (no room in the confined column; hover's own mini-chart already covers it).

      // [owner review D1 4b] full-row hover target → highlight this row + enlarged 2-line mini-chart
      // (the country's 2019→now index vs the EU-27 average) in the shared tooltip. Appended last.
      g.append("rect").attr("class", "bar-hit")
        .attr("x", -m.left + 4).attr("y", 0)
        .attr("width", Math.max(0, m.left + iw + m.right - 8)).attr("height", rowH)
        .attr("fill", "transparent").style("cursor", "pointer")
        .on("mouseenter", (e) => this._barRowHover(e, d))
        .on("mousemove", (e) => this.ctx.tooltip.move(e.clientX, e.clientY))
        .on("mouseleave", () => this._barRowHoverOut());

      rowEls.push({ code: d.code, rank: i, groupEl: nodes[i], flagEl, nameEl, rectEl, valueEl, targetWidth: barW });
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

    // [debug 2026-07-06 — owner report] Sparkline event ticks (Ukraine/ECB markers on the top-5
    // rows' trend lines) REMOVED along with the sparklines themselves — see the legend comment above.

    // [Morph-v2 · Task 6] Build country path clones + flubber interpolators
    const clonesData = this._buildCountryClones(barRows, root, m, yBand, xLin, rowH, stage, W, H, euVal);

    this._bars = {
      wrap, svg, root, markersG, barRows, yBand, xLin, euVal, iw, ih, rowH,
      W, H, margin: m,
      euSeries, barColor,                       // [owner review D1 4b] hover mini-chart needs these
      clones: clonesData ? clonesData.clones : [],
      rowEls, euZeroEl, euTagEl,                 // [debug 2026-07-08 — perf] cached node refs, see _tickMorph
    };
    // [debug 2026-07-08 — perf] markersG's circles are permanently hidden (the flubber-clone system
    // replaced them; "Hide the old circle markers (v1 leftover)" used to re-force opacity:0 on them
    // EVERY tick). Force it once, here, instead.
    markersG?.selectAll("circle.bar-marker").style("opacity", 0);

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

  // [debug 2026-07-08] Build-time only (called once per country from _buildCountryClones, never per
  // tick) — reduces to the SINGLE largest-area subpath. Single-subpath input (21 of 27 EU countries)
  // returns unchanged. See the long comment at the one call site for why this must be singular, not a
  // threshold-keep (a flubber interpolation failure mode, not a visual-quality trim).
  _dominantSubpath(d) {
    if (!d) return d;
    const subpaths = d.split(/(?=M)/).filter(s => s.trim());
    if (subpaths.length <= 1) return d;
    if (!this._clonePathProbe) {
      this._clonePathProbe = document.createElementNS("http://www.w3.org/2000/svg", "path");
      this._clonePathProbe.style.opacity = "0";
      this.svg?.node()?.appendChild(this._clonePathProbe);
    }
    const probe = this._clonePathProbe;
    let best = subpaths[0], bestArea = -1;
    subpaths.forEach(s => {
      probe.setAttribute("d", s);
      let bb; try { bb = probe.getBBox(); } catch (_) { bb = { width: 0, height: 0 }; }
      const area = bb.width * bb.height;
      if (area > bestArea) { bestArea = area; best = s; }
    });
    return best;
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

    // [debug 2026-07-08 — perf] Used to also read choroRect/stageRect here to size a build-time
    // startCx/startCy — dead weight: those two fields were only ever consumed by _tickMorph's own
    // (now-removed) per-tick recompute. Existence-only guard now (no layout read); the REAL geometry
    // capture happens once per motion in _captureCloneStarts, right before each _animateMorphTo run.
    const choroSvg = this.svg?.node();
    if (!choroSvg || !stage) return null;

    barRows.forEach(d => {
      const featId = this._codeToFeatId(d.code);
      const feat = this.featCol?.features?.find(f => f.id === featId || this.data.topoToIso(f.id) === d.code);
      if (!feat) return;

      // Country path in choropleth SVG coords
      // [debug 2026-07-08 — owner retime verification found this, not asked for, but load-bearing for
      // "fly" to look right] `flubber.interpolate()` on a multi-ring "from" shape against this clone's
      // single-ring "to" shape (a square) collapses to a near-invisible sliver the INSTANT t>0, only
      // recovering by growing roughly toward the target size as t→1 — confirmed independent of
      // maxSegmentLength (5/6/8/10 all identical), so it isn't a segment-density issue: it's flubber's
      // point-correspondence degenerating whenever ring counts don't match 1:1. First attempt (keep
      // every subpath ≥1% of the largest one's own bbox area) was NOT sufficient: a t-sweep bbox probe
      // across all 27 clones post-filter showed EVERY country still left with >1 subpath still
      // collapsed (France 2 subpaths → 1% of its t=0 area by t=0.02; Croatia 2 → 3%; Malta 2 → 46%;
      // Denmark 11 → 1%; Greece 3 → 3%; Netherlands 4 → 2%; Estonia 3 → 9%), while all 19
      // already-single-subpath countries interpolated smoothly (~50-60% ratio, monotonic, no dip).
      // `_dominantSubpath` (singular) keeps ONLY the single largest-area subpath, always. The clone's
      // RESTING map (this.path(feat) used everywhere else) is untouched and still shows full
      // multi-island geography — only the ~3s in-flight shape simplifies to its main landmass, which
      // reads fine at flight speed/scale.
      const fromD = this._dominantSubpath(this.path(feat));
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
        // [debug 2026-07-08 — perf] 8 → 5: the clones are always IN MOTION (never inspected at rest),
        // so full-resolution country outlines are wasted interpolation points; a lower max segment
        // length bounds the interpolator's own path complexity without a visible quality loss.
        interp = flubber.interpolate(fromD, toD, { maxSegmentLength: 5 });
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

    // build-time-only scratch element (see _dominantSubpath) — done with it once every clone is built.
    if (this._clonePathProbe) { this._clonePathProbe.remove(); this._clonePathProbe = null; }

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
    if (!this._bars || this._transitioning) return;   // [scroll-fix §4b] no row cards until the ranking has settled
    this._bars.root.selectAll("g.bar-row").style("opacity", r => (r.code === d.code ? 1 : 0.3));
    this.ctx.tooltip.show(this._barMiniChart(d), event.clientX, event.clientY);
  }
  _barRowHoverOut() {
    if (this._bars) this._applyBarSpotlight(this._spotlightCodes);   // restore the scroll-highlight state
    this.ctx.tooltip.hide();
  }
  /** Spotlight a set of bar rows (others dimmed to 0.28); null/empty → all visible. Shared by the
   *  scroll-highlight sequence (runs every tick while its window is active) and by hover-out restore
   *  so the two never fight. [debug 2026-07-08 — perf] Cached rowEls + raw style writes, not a fresh
   *  `.selectAll()` re-query — this runs on the hot per-tick path during the spotlight window. */
  _applyBarSpotlight(codes) {
    if (!this._bars) return;
    const set = codes && codes.length ? new Set(codes) : null;
    for (const r of (this._bars.rowEls || [])) r.groupEl.style.opacity = (!set || set.has(r.code)) ? 1 : 0.28;
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
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="bar-tip-spark">
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
      this._transitioning = false;   // [scroll-fix §4b] reduced-motion snaps; no in-flight state
      wrap.style.opacity = onScreen ? "1" : "0";
      wrap.style.pointerEvents = onScreen ? "auto" : "none";
      wrap.style.visibility = onScreen ? "visible" : "hidden";
      wrap.classList.toggle("is-active", onScreen);
      if (this.gMap) this.gMap.style("pointer-events", onScreen ? "none" : "auto");
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
      root.selectAll("text.bars-eu-tag, text.bars-axis-dir").style("opacity", onScreen ? 1 : 0);
      root.select("line.bars-eu-zero").style("opacity", onScreen ? 1 : 0);
      return;
    }

    // [debug 2026-07-08 — owner retime spec] direction + LINEAR local motion progress (0 at the
    // instant motion starts, 1 at the instant it's fully arrived) — `p` itself carries no easing any
    // more (see _animateMorphTo); every phase below applies its own.
    const dir = this._morphDir || "fwd";
    const WIN = dir === "fwd" ? MORPH_FWD : MORPH_REV;
    const mProg = Math.max(0, Math.min(1, dir === "fwd" ? (p - 0.5) / 0.5 : (1 - p) / 0.5));
    const rowEls = this._bars.rowEls || [];
    const N = Math.max(clones.length, rowEls.length, 1);
    // Per-element stagger: shift a phase's window later by up to MORPH_STAGGER_MS (spread across N
    // elements), never compress it — a late element simply starts (and finishes) slightly later.
    // `reverseOrder` flips WHICH end goes first (bottom-rank-first for reverse's bar-shrink).
    const staggerU = N > 1 ? (MORPH_STAGGER_MS / MORPH_DUR) / (N - 1) : 0;
    const staggeredWindow = (key, rank, reverseOrder = false) => {
      const [a, b] = WIN[key];
      const i = reverseOrder ? (N - 1 - rank) : rank;
      const shift = i * staggerU;
      return [a + shift, b + shift];
    };

    // ===== GLOBAL (non-staggered) phase values — one number each, reused by many elements =====
    const mapFadeT = d3.easeCubicIn(progressBetween(mProg, ...WIN.mapFade));
    const mapOpacity = dir === "fwd" ? (1 - mapFadeT) : mapFadeT;
    const titleT = smooth(progressBetween(mProg, ...WIN.title));
    const titleOp = dir === "fwd" ? titleT : (1 - titleT);
    const closingT = smooth(progressBetween(mProg, ...WIN.closing));
    const closingOp = dir === "fwd" ? closingT : (1 - closingT);
    const landT = smooth(progressBetween(mProg, ...WIN.land));
    const landOp = dir === "fwd" ? landT : (1 - landT);
    // Forward's "rise" = clones fading/lifting IN (not staggered, per spec). Reverse's "rise" plays
    // the mirrored ROLE forward's "trail" had — clones' final fade OUT, late in the timeline — kept
    // as its own un-staggered global value; reverse's fade-IN instead reuses the "trail" window
    // (staggered, bottom-rank-first) below, per-clone.
    const riseInT  = dir === "fwd" ? d3.easeCubicOut(progressBetween(mProg, ...WIN.rise)) : 0;
    const riseOutT = dir === "rev" ? smooth(progressBetween(mProg, ...WIN.rise)) : 0;
    // Un-staggered base values of the two elements-vary-by-rank phases — coarse enough for the
    // wrap-visibility check below (a ≤50ms per-element stagger doesn't matter at that granularity).
    const flyBaseT  = d3.easeCubicInOut(progressBetween(mProg, ...WIN.fly));
    const barsBaseT = d3.easeCubicOut(progressBetween(mProg, ...WIN.bars));

    // ===== pointer-lock — engages the instant motion starts, releases at the direction's threshold =====
    // [debug 2026-07-08 — regression fix] Must also require an ACTIVE flight (this._morphRaf truthy).
    // The idle watchChapterProgress subscription calls _tickMorph(this._morphP ?? 0.5) continuously,
    // even at rest on a pure-map step — at the resting p=0.5, mProg computes to exactly 0, which is
    // always < lockRelease, so without this guard `transitioning` latched permanently true the instant
    // the chart mounted, silently blocking _click()/_hover()/row-cards forever (found via
    // _tmp-d70-camera.mjs: zero camera zoom on click; the D70 traverse suite didn't catch it since it
    // only exercises scroll-driven onStep camera pans, not the click handler).
    const transitioning = !!this._morphRaf && mProg < WIN.lockRelease;
    if (transitioning && !this._transitioning) this.ctx.tooltip?.hide();
    this._transitioning = transitioning;

    // ===== wrap-level visibility =====
    const show = dir === "fwd"
      ? Math.max(riseInT, flyBaseT, landOp, barsBaseT, closingOp)
      : Math.max(1 - riseOutT, landOp, closingOp);
    wrap.style.opacity = String(show);
    // Bars accept hover ONLY once forward has fully arrived (never mid-morph, never during reverse).
    wrap.style.pointerEvents = (dir === "fwd" && mProg >= 0.999) ? "auto" : "none";
    // [user-reported fix] hide via visibility when fully transparent so the fixed
    // overlay can never visually block the choropleth map below.
    wrap.style.visibility = show > 0.001 ? "visible" : "hidden";
    wrap.classList.toggle("is-active", show > 0.05);

    if (this._bars_textbox) this._bars_textbox.style.opacity = String(titleOp);
    if (this._bars.euTagEl) this._bars.euTagEl.style.opacity = closingOp;

    // Fade the choropleth ornaments as the morph takes over
    if (this.gMap)       this.gMap.style("opacity", mapOpacity);
    // [scroll-fix §4b] Once the map starts fading, stop it catching pointer events — otherwise the
    // invisible country layer still pops hover cards (the "Croatia card over a half-empty screen" bug).
    if (this.gMap)       this.gMap.style("pointer-events", mapOpacity < 0.99 ? "none" : "auto");
    if (this.kickerG)    this.kickerG.style("opacity", mapOpacity);
    if (this.labelG)     this.labelG.style("opacity", mapOpacity * (this.focusCode ? 0 : 1));
    if (this._mapCardEl) this._mapCardEl.style.opacity = mapOpacity;

    // ===== clones: fly (staggered) + rise/trail-as-fade (staggered only in reverse) =====
    // [Morph-v2 fix, unchanged] flubber.interpolate(fromD, toD) returns a path that morphs through
    // BOTH shape AND position — no separate translate for position, only for the rise lift + the
    // per-tick screen-alignment offset (the clone's `d` is baked in CHOROPLETH coords; startCx/startCy,
    // captured ONCE per motion by _captureCloneStarts — not read from the DOM here — give this tick's
    // alignment translate).
    clones.forEach((c, i) => {
      let flyT, cloneOp, pulseT;
      if (dir === "fwd") {
        const [fa, fb] = staggeredWindow("fly", i);
        flyT = d3.easeCubicInOut(progressBetween(mProg, fa, fb));
        const [ta, tb] = staggeredWindow("trail", i);
        const trailT = smooth(progressBetween(mProg, ta, tb));
        cloneOp = Math.max(0, riseInT * (1 - trailT));
        pulseT = riseInT;
      } else {
        // "trail" window reused as the reverse fade-IN (bottom-rank-first — mirrors forward's
        // top-rank-first bars grow), "rise" (global, un-staggered) is the final fade-OUT.
        const [ta, tb] = staggeredWindow("trail", i, true);
        const fadeInT = smooth(progressBetween(mProg, ta, tb));
        const [fa, fb] = staggeredWindow("fly", i);
        flyT = 1 - d3.easeCubicInOut(progressBetween(mProg, fa, fb));   // 1=square at start, 0=country by the end
        cloneOp = Math.max(0, fadeInT * (1 - riseOutT));
        pulseT = cloneOp;
      }
      const scale = 1 + pulseT * 0.08;
      const liftY = -6 * pulseT;
      const offsetX = c.startCx - c.geoCx;
      const offsetY = c.startCy - c.geoCy;
      const transX = offsetX * (1 - flyT);
      const transY = offsetY * (1 - flyT) + liftY;
      try { c.pathEl.setAttribute("d", c.interp(flyT)); } catch (_) { /* defensive — shouldn't happen post-build */ }
      c.pathEl.setAttribute("transform", `translate(${transX.toFixed(2)},${transY.toFixed(2)}) scale(${scale.toFixed(3)})`);
      c.pathEl.setAttribute("opacity", cloneOp.toFixed(3));
    });

    // ===== land: squares pulse-settle and crossfade to flag images =====
    for (const r of rowEls) r.flagEl.style.opacity = landOp;

    // ===== bars grow/shrink (staggered top-rank-first fwd / bottom-rank-first rev) + name/value =====
    for (const r of rowEls) {
      const [a, b] = staggeredWindow("bars", r.rank, dir === "rev");
      const growT = d3.easeCubicOut(progressBetween(mProg, a, b));
      r.rectEl.setAttribute("width", dir === "fwd" ? r.targetWidth * growT : r.targetWidth * (1 - growT));
      const nameT = smooth(progressBetween(mProg, a, b));
      const nameOp = dir === "fwd" ? nameT : (1 - nameT);
      r.nameEl.style.opacity = nameOp;
      r.valueEl.style.opacity = nameOp;
    }
    if (this._bars.euZeroEl) this._bars.euZeroEl.style.opacity = Math.max(landOp, dir === "fwd" ? barsBaseT : (1 - barsBaseT));

    // ===== [owner review D1 4b] Scroll-highlight sequence — forward's tail dwell only. Retimed
    // proportionally into the new envelope (was p 0.92-0.985 of the old bracket, ~80%-98.6% of that
    // bracket's own span — same relative position here, now against MORPH_DUR directly). Not run in
    // reverse: cycling a spotlight while the chart is tearing down doesn't serve the "let the reader
    // absorb the fully-formed chart" purpose it has on the way in. =====
    let spotCodes = null;
    if (dir === "fwd" && mProg >= 0.80 && mProg < 0.986 && barRows.length > 3) {
      const dev = r => r.cumPct - this._bars.euVal;
      let zc = barRows.findIndex(r => dev(r) < 0);          // first row below the EU line
      if (zc < 1) zc = Math.floor(barRows.length / 2);
      const stages = [
        [barRows[0].code],                                  // highest above EU
        [barRows[zc - 1].code, barRows[zc].code],           // the two middle, straddling the EU line
        [barRows[barRows.length - 1].code],                 // lowest below EU
      ];
      const dp = (mProg - 0.80) / 0.186;
      spotCodes = stages[Math.max(0, Math.min(stages.length - 1, Math.floor(dp * stages.length)))];
    }
    this._spotlightCodes = spotCodes;
    this._applyBarSpotlight(spotCodes);
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
