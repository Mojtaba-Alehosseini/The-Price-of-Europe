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

/** Trace a path 0→1: set dasharray to length, dashoffset = (1-t)*length. */
export function tracePath(pathSel, t) {
  pathSel.each(function() {
    const L = this.getTotalLength();
    d3.select(this).attr("stroke-dasharray", `${L} ${L}`)
                  .attr("stroke-dashoffset", L * (1 - t));
  });
}

/** One-shot draw-on for step-enter (the continuous, scroll-tied draw-on is tracePath above).
 *  Reduced-motion: jump straight to the drawn end-state, no animation. */
export function drawOnPlay(pathSel, motion, dur = 900) {
  pathSel.each(function() {
    const L = this.getTotalLength ? this.getTotalLength() : 0;
    const s = d3.select(this).attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L);
    if (motion && motion.reduced) { s.attr("stroke-dashoffset", 0); return; }
    s.transition().duration(dur).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0);
  });
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
