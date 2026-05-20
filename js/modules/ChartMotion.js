/* ============================================================
   ChartMotion — scroll-progress utilities for charts.
   Inspired by cerrado.ambiental.media (camera pans on scroll) +
   Pudding banknotes (sequential element reveals).

   Each chart receives an instance via ctx.motion already; this
   module layers domain-specific helpers on top.
   ============================================================ */

/** Map a scroll progress 0..1 across step boundaries.
 *  e.g. progressBetween(0.45, 0, 0.5) === 0.9 — useful for
 *  sub-step interpolation. */
export function progressBetween(p, a, b) {
  if (b <= a) return p < a ? 0 : 1;
  return Math.max(0, Math.min(1, (p - a) / (b - a)));
}

/** Lerp utility. */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Smoothstep easing (matches CSS ease-out feel). */
export const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};

/** Animate a D3 zoom into a bounding box on a map projection. */
export function panToBBox(svg, gMap, projection, path, bbox, durationMs = 800, motionMgr) {
  if (!bbox) return;
  const [[x0, y0], [x1, y1]] = bbox;
  const { width, height } = svg.node().getBoundingClientRect();
  const scale = 0.9 * Math.min(width / (x1 - x0), height / (y1 - y0));
  const tx = width  / 2 - scale * (x0 + x1) / 2;
  const ty = height / 2 - scale * (y0 + y1) / 2;
  const transform = `translate(${tx}, ${ty}) scale(${scale})`;
  if (!motionMgr || motionMgr.reduced) {
    gMap.attr("transform", transform);
    return;
  }
  gMap.transition().duration(durationMs).ease(d3.easeCubicInOut).attr("transform", transform);
}

/** Reveal an array of elements sequentially based on scroll progress.
 *  @param sel d3 selection of elements
 *  @param p   scroll progress 0..1 for chapter
 *  @param attr e.g. "opacity" — set from 0 → 1 across staggered windows. */
export function staggerReveal(sel, p, attr = "opacity", stagger = 0.05) {
  const n = sel.size();
  sel.each(function(d, i) {
    const start = i * stagger;
    const t = smooth(Math.max(0, Math.min(1, (p - start) / 0.4)));
    d3.select(this).attr(attr, t);
  });
}

/** Trace a path 0→1: set dasharray to length, dashoffset = (1-t)*length. */
export function tracePath(pathSel, t) {
  pathSel.each(function() {
    const L = this.getTotalLength();
    d3.select(this).attr("stroke-dasharray", `${L} ${L}`)
                  .attr("stroke-dashoffset", L * (1 - t));
  });
}

/** Build a one-shot Intersection Observer that fires `fn` once when `el` enters viewport. */
export function onceVisible(el, fn, opts = {}) {
  if (!el) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        fn();
        io.disconnect();
      }
    });
  }, { threshold: opts.threshold ?? 0.15, ...opts });
  io.observe(el);
}

/** Watch the chapter and emit continuous scroll progress (0..1). */
export function watchChapterProgress(chapterEl, onProgress) {
  if (!chapterEl) return () => {};
  let raf = null;
  const compute = () => {
    const r = chapterEl.getBoundingClientRect();
    const vh = innerHeight;
    const total = r.height + vh;
    const seen  = Math.max(0, Math.min(total, vh - r.top));
    onProgress(seen / total);
    raf = null;
  };
  const handler = () => { if (!raf) raf = requestAnimationFrame(compute); };
  addEventListener("scroll", handler, { passive: true });
  addEventListener("resize", handler);
  compute();
  return () => { removeEventListener("scroll", handler); removeEventListener("resize", handler); };
}
