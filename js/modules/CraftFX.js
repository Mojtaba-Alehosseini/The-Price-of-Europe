// js/modules/CraftFX.js — shared award-grade craft primitives (Bremer technique set),
// adapted to our CSS-token system + MotionManager reduced-motion gate. No new libraries.
// d3 is an ambient global (loaded via CDN <script> before the ES modules), like every chart file.
// Draw-on lives in ChartMotion.js (tracePath continuous + drawOnPlay one-shot) — NOT duplicated here.

/** Read a CSS custom property at draw time (tokens are the source of truth). */
export function getCSS(name) {
  const n = name.startsWith("--") ? name : (name.match(/--[^)]+/)?.[0] || name);
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888";
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

/** Smooth gradient <rect> legend (FT/Reuters look). stops = array of hex (token-resolved). */
export function gradientLegend(svg, sel, stops, { x = 0, y = 0, w = 180, h = 8, id } = {}) {
  const gid = id || `legend-grad-${Math.random().toString(36).slice(2, 8)}`;
  const grad = defsOnce(svg).append("linearGradient").attr("id", gid).attr("x1", "0%").attr("x2", "100%").attr("y1", "0%").attr("y2", "0%");
  grad.selectAll("stop").data(stops).join("stop").attr("offset", (_, i) => `${(i / (stops.length - 1)) * 100}%`).attr("stop-color", d => d);
  sel.append("rect").attr("class", "craft-legend-bar").attr("x", x).attr("y", y).attr("width", w).attr("height", h).attr("rx", 1).style("fill", `url(#${gid})`);
  return gid;
}

/** Make a <text> legible over any background: a bg-colored halo behind the ink (paint-order). */
export function haloText(textSel, haloColor = getCSS("--bg"), width = 3) {
  textSel.style("paint-order", "stroke").style("stroke", haloColor).style("stroke-width", width).style("stroke-linejoin", "round");
}

/** Canvas hover via Delaunay for >500 marks. d3.Delaunay ships in d3.v7.min.js. points=[{x,y,datum}]. */
export function canvasHitTester(points) {
  if (!points.length) return () => null;
  const del = d3.Delaunay.from(points, d => d.x, d => d.y);
  return (mx, my) => { const i = del.find(mx, my); return i >= 0 ? points[i].datum : null; };
}

/** Retina-sharp canvas sized to its container. Stack UNDER an SVG label layer (both position:absolute; inset:0).
 *  Math.floor (not round) avoids subpixel bleed at 1.5x DPR. Re-call after resize. Returns {ctx,dpr}. */
export function retinaCanvas(canvas, cssW, cssH) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  return { ctx, dpr };
}

/** Canvas redraw loop that STOPS when settled and pauses off-screen. drawFn(t) gets eased 0→1; returns true when done. */
export function canvasTimer(drawFn, durationMs, motion) {
  if (motion && motion.reduced) { drawFn(1); return; }
  const t0 = performance.now();
  d3.timer(() => { const t = Math.min(1, (performance.now() - t0) / durationMs); drawFn(t * t * (3 - 2 * t)); return t >= 1; });
}

/** [RETAINED, UNUSED — DESIGN-REVIEW #2: nothing loops forever.] Animated flow gradient for an area
 *  fill. Kept for reference but NOT called by any chart — Act-II AnnotatedLine instead uses a one-time
 *  over-target fill that settles. Pauses under reduced-motion + off-screen if ever re-enabled. */
export function flowGradient(svg, stops, isVisible, motion) {
  const id = "craft-flow";
  const grad = defsOnce(svg).append("linearGradient").attr("id", id).attr("x1", "0%").attr("x2", "100%").attr("y1", "0%").attr("y2", "0%");
  grad.selectAll("stop").data(stops).join("stop").attr("offset", d => d.offset).attr("stop-color", d => d.color).attr("stop-opacity", d => d.opacity);
  (function loop() {
    if (motion && motion.reduced) return;
    if (!isVisible()) { setTimeout(loop, 600); return; }
    grad.transition().duration(3200).ease(d3.easeLinear).attr("x1", "30%").attr("x2", "130%")
      .on("end", () => { grad.attr("x1", "-30%").attr("x2", "70%"); loop(); });
  })();
  return `url(#${id})`;
}

/** Subtle pointer parallax on a layer (hero / sticky chart). Gated on reduced motion. transform-only. */
export function pointerParallax(containerEl, layerSel, motion, dx = 8, dy = 6) {
  if (motion && motion.reduced) return;
  containerEl.addEventListener("pointermove", (e) => {
    const r = containerEl.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width - 0.5) * -2, ny = ((e.clientY - r.top) / r.height - 0.5) * -2;
    layerSel.style("transform", `translate(${nx * dx}px, ${ny * dy}px)`);
  });
  containerEl.addEventListener("pointerleave", () => layerSel.style("transform", "translate(0,0)"));
}
