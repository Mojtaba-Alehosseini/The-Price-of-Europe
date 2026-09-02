// js/modules/CraftFX.js — shared award-grade craft primitives (Bremer technique set),
// adapted to our CSS-token system + MotionManager reduced-motion gate. No new libraries.
// d3 is an ambient global (loaded via CDN <script> before the ES modules), like every chart file.
// Draw-on lives in ChartMotion.js (tracePath continuous + drawOnPlay one-shot) — NOT duplicated here.

/** Read a CSS custom property at draw time (tokens are the source of truth).
 *  [P6.2] The single definition. Five charts carried their own byte-identical-in-effect copies
 *  (BoxPlot, Choropleth, DivergingBar, Heatmap, ScoreMap) and two already imported this one; a
 *  token read is the one thing every chart does, so six versions of it was six places for the
 *  D15 rule to be re-learned. Accepts either a bare `--name` or a `var(--name)` wrapper: no call
 *  site passes the wrapper today, but the copies all parsed it and dropping that would be a silent
 *  narrowing of a shared contract. */
export function getCSS(name) {
  const n = name.startsWith("--") ? name : (name.match(/--[^)]+/)?.[0] || name);
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}

/** Get-or-create the SVG's single <defs>. Safe across re-renders (never accumulate defs). */
export function defsOnce(svg) {
  let d = svg.select("defs");
  if (d.empty()) d = svg.append("defs");
  return d;
}

/** Restrained accent glow for the ONE focused mark. stdDeviation 2.5 (paper, not neon).
 *  PERF: feGaussianBlur is CPU-rasterised on mobile — bounded marks <100px, toggle on STEP-ENTER only. */
export function ensureGlow(svg, id = "craft-glow", std = 2.5) {
  const defs = defsOnce(svg);
  if (defs.select(`#${id}`).empty()) {
    const f = defs.append("filter").attr("id", id).attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    f.append("feGaussianBlur").attr("stdDeviation", std).attr("result", "b");
    const m = f.append("feMerge");
    m.append("feMergeNode").attr("in", "b");
    m.append("feMergeNode").attr("in", "SourceGraphic");
  }
  return `url(#${id})`;
}

/** Per-datum radial gradient → a flat circle reads as a lit sphere. base = a hex (resolve a token first). */
export function sphereGradient(svg, key, base) {
  const defs = defsOnce(svg);
  const id = `sphere-${key}`;
  if (defs.select(`#${id}`).empty()) {
    const g = defs.append("radialGradient").attr("id", id).attr("cx", "35%").attr("cy", "35%").attr("r", "65%");
    g.append("stop").attr("offset", "0%").attr("stop-color", d3.rgb(base).brighter(0.8));
    g.append("stop").attr("offset", "55%").attr("stop-color", base);
    g.append("stop").attr("offset", "100%").attr("stop-color", d3.rgb(base).darker(1.4));
  }
  return `url(#${id})`;
}

// gradientLegend / haloText / canvasHitTester / retinaCanvas / canvasTimer / flowGradient /
// pointerParallax were removed in the round-5 debug pass — they were exported but never called
// by any live chart. The live craft set is getCSS / defsOnce / ensureGlow / sphereGradient above.
