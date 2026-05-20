/* ============================================================
   MotionManager — tiny wrapper around requestAnimationFrame +
   prefers-reduced-motion. We do NOT bundle Motion One; we
   implement what we need (tweens, springs, scroll subscriptions)
   in ~80 lines, keep the lib light, and remain framework-free.
   ============================================================ */

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const EASES = {
  linear: t => t,
  outQuad: t => t * (2 - t),
  outCubic: t => 1 - Math.pow(1 - t, 3),
  outQuart: t => 1 - Math.pow(1 - t, 4),
  outExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  inOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  spring: t => {
    // soft overshoot
    const a = 1.4;
    return 1 - Math.cos(t * Math.PI * (1 + a)) * Math.exp(-t * 4);
  }
};

export class MotionManager {
  constructor(themeMgr) {
    this.theme = themeMgr;
    this.reduced = reduced();
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", e => {
      this.reduced = e.matches;
    });
  }

  /** Animate a number from `from` to `to`, calling `onTick(value)` each frame.
   *  Returns a promise that resolves when done, plus a cancel handle. */
  tween({ from = 0, to = 1, duration = 600, ease = "outCubic", onTick, onDone }) {
    if (this.reduced) {
      onTick && onTick(to);
      onDone && onDone();
      return { cancel: () => {}, promise: Promise.resolve() };
    }
    let cancelled = false;
    const eFn = typeof ease === "function" ? ease : (EASES[ease] || EASES.outCubic);
    const start = performance.now();
    const promise = new Promise(resolve => {
      const tick = now => {
        if (cancelled) return resolve();
        const t = Math.min(1, (now - start) / duration);
        onTick && onTick(from + (to - from) * eFn(t));
        if (t < 1) requestAnimationFrame(tick);
        else {
          onDone && onDone();
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
    return { cancel: () => { cancelled = true; }, promise };
  }

  /** Animate an SVG D3 selection from one numeric attribute set to another. */
  animateAttr(sel, attrs, { duration = 500, ease = "outCubic" } = {}) {
    if (this.reduced) {
      Object.entries(attrs).forEach(([k, v]) => sel.attr(k, v));
      return Promise.resolve();
    }
    const t = sel.transition().duration(duration);
    // d3 v7 takes ease functions
    const eFn = typeof ease === "function" ? ease : (EASES[ease] || EASES.outCubic);
    t.ease(eFn);
    Object.entries(attrs).forEach(([k, v]) => t.attr(k, v));
    return t.end();
  }

  /** Subscribe to scroll-progress (0–1) of `el` relative to viewport. */
  onScrollProgress(el, fn) {
    let raf = null;
    const compute = () => {
      const r = el.getBoundingClientRect();
      const vh = innerHeight;
      const total = r.height + vh;
      const seen  = Math.max(0, Math.min(total, vh - r.top));
      fn(seen / total);
      raf = null;
    };
    const handler = () => { if (!raf) raf = requestAnimationFrame(compute); };
    addEventListener("scroll", handler, { passive: true });
    addEventListener("resize", handler);
    compute();
    return () => { removeEventListener("scroll", handler); removeEventListener("resize", handler); };
  }
}

MotionManager.EASES = EASES;
