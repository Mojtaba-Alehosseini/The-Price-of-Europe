/* ============================================================
   heroSequence — minimal canvas animation behind the hero.
   Renders soft horizontal "price waves" that breathe in/out
   while a year counter cycles 2019 → 2025.
   Theme-aware (reads tokens). prefers-reduced-motion → still frame.
   ============================================================ */

export class HeroSequence {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx2d  = canvas.getContext("2d");
    this.themeMgr = ctx?.theme;
    this.motion = ctx?.motion;
    this.t = 0;
    this.years = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
    this.start = performance.now();
    this._running = false;
    this._lastDraw = 0;
    this._onScreen = false;
    this._resize();
    addEventListener("resize", () => this._resize());
    if (this.motion?.reduced) {
      this._drawFrame(0);          // static frame, no loop
      return;
    }
    // [R2 perf] Only animate while the hero canvas is on-screen, capped to ~30fps. A
    // forever-running 60fps rAF was burning main-thread time (TBT) long after the hero
    // scrolled away. Also pause when the tab is hidden.
    this._io = new IntersectionObserver(([e]) => {
      this._onScreen = !!(e && e.isIntersecting);
      if (this._onScreen) this._startLoop(); else this._stopLoop();
    }, { threshold: 0 });
    this._io.observe(this.canvas);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this._stopLoop();
      else if (this._onScreen) this._startLoop();
    });
  }

  _startLoop() {
    if (this._running || this.motion?.reduced || document.hidden) return;
    this._running = true;
    requestAnimationFrame(this._tick.bind(this));
  }
  _stopLoop() { this._running = false; }

  _resize() {
    const dpr = devicePixelRatio || 1;
    const w = this.canvas.clientWidth  || this.canvas.parentElement.clientWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;
    this.canvas.width  = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w; this.h = h;
  }

  _readColors() {
    const root = document.documentElement;
    const get = n => getComputedStyle(root).getPropertyValue(n).trim();
    return {
      accent: get("--accent"),
      ink:    get("--ink"),
      faint:  get("--ink-faint"),
      bg:     get("--bg"),
      seq:    [get("--seq-1"), get("--seq-2"), get("--seq-3"), get("--seq-4"), get("--seq-5")]
    };
  }

  _drawFrame(elapsed) {
    const { ctx2d: c, w, h } = this;
    const col = this._readColors();
    c.clearRect(0, 0, w, h);

    // wave layers — each a band representing a category
    const bands = 5;
    for (let i = 0; i < bands; i++) {
      const baseY = h * (0.3 + i * 0.14);
      const amp = 24 + i * 8;
      const freq = 0.006 + i * 0.0015;
      const phase = elapsed * 0.00015 + i;

      c.beginPath();
      for (let x = -10; x <= w + 10; x += 6) {
        const y = baseY + Math.sin(x * freq + phase) * amp * (0.8 + 0.4 * Math.sin(elapsed * 0.0002 + i));
        if (x === -10) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.strokeStyle = col.seq[i] || col.accent;
      c.globalAlpha = 0.35 - i * 0.04;
      c.lineWidth = 1.4;
      c.stroke();
    }
    c.globalAlpha = 1;

    // Year label, cycling
    const cycle = 5000;       // ms per year
    const yi = Math.floor((elapsed % (cycle * this.years.length)) / cycle);
    const year = this.years[yi];

    c.fillStyle = col.faint;
    c.font = `500 0.78rem "Inter", system-ui`;
    c.textAlign = "right";
    c.fillText("2019 — 2025", w - 24, 28);

    c.fillStyle = col.ink;
    c.font = `600 clamp(48px, 8vw, 110px) "Fraunces", serif`;
    c.textAlign = "right";
    c.globalAlpha = 0.10;
    c.fillText(String(year), w - 18, h - 28);
    c.globalAlpha = 1;
  }

  _tick(now) {
    if (!this._running) return;
    if (now - this._lastDraw >= 32) {   // ~30fps cap — the waves are slow; 60fps is wasted work
      this._drawFrame(now - this.start);
      this._lastDraw = now;
    }
    requestAnimationFrame(this._tick.bind(this));
  }
}
