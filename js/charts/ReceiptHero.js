/* ============================================================
   ReceiptHero.js — "The Receipt" hero (D43 + D44 + D45).
   Pinned receipt, six lines ticking on real monthly Eurostat HICP index paths (EU-27,
   Jan-2019 base), TOTAL €100.00 → €135.63 (lines cent-rounded first, then summed).
   D44: eased clock (crisis years ~45% speed), till-message events, stamp visibility-gate,
   P0 0.04, explicit receipt ink. D45: minimal hero — sr-only h1, question lands in the
   headline slot at q≥0.96 (after the stamp), timeline scrubber under the receipt (icon-only
   ▸/■ button, claret playhead on the eased clock, event ticks, click-to-seek), play ≈24 s,
   track 600dvh. Initial state server-rendered; hicpIndex ensured on first interaction.
   Reversible scrub. Reduced-motion: static end state. Booted by main.js; not a BaseChart.
   ============================================================ */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MON = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

/* Jan-2019 base prices: a RENTING household's cash budget, HBS-anchored (spec §3a). Σ=100. */
const BASE = { CP04: 30, CP01: 22, SERV: 15, CP07: 14, CP045: 10, CP11: 9 };
const START = "2019-01";
const MONTHS = 84;                       // 2019-01 … 2025-12

const EVENTS = [
  { t: "2020-03", label: "*** covid lockdowns begin ***" },
  { t: "2022-02", label: "*** russia invades ukraine ***" },
  { t: "2022-10", label: "*** energy peaks at ×1.7 ***" },
  { t: "2024-09", label: "*** inflation back near 2% ***" },
];

const P0 = 0.04, P1 = 0.86;              // date-scrub window inside the pin
const MSG_IN = 0.015, MSG_HOLD = 0.075;  // till-message trapezoid (in / hold / out)

/* Eased clock: mid-years slow (f'(0.5)=0.45), ends faster. Monotonic, f(0)=0, f(1)=1. */
const W_EASE = 0.55;
const easeTime = t => (1 - W_EASE) * t + W_EASE * (0.5 + 4 * Math.pow(t - 0.5, 3));
function easeTimeInv(target) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (easeTime(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export class ReceiptHero {
  /** @param sel selector for #hero-receipt  @param ctx { motion, data } */
  constructor(sel, ctx) {
    this.root = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!this.root) return;
    this.ctx = ctx;
    this.reduced = !!(ctx && ctx.motion && ctx.motion.reduced);
    this.hero = this.root.closest("section") || document.getElementById("hero");

    this.dateEl  = document.getElementById("rc-date");
    this.totalEl = document.getElementById("rc-total");
    this.msgEl   = document.getElementById("rc-msg");
    this.qEl     = document.getElementById("hero-question");
    this.stampEl = document.getElementById("rc-stamp-e");
    this.playEl  = document.getElementById("hero-play");
    this.lineEl  = document.getElementById("rc-tl-line");
    this.headEl  = document.getElementById("rc-tl-head");
    this.rows = Array.from(this.root.querySelectorAll(".rc-price"))
      .map(el => ({ el, cat: el.dataset.cat, base: BASE[el.dataset.cat] || 0 }));

    this.keys = [];
    for (let y = 2019; y <= 2025; y++)
      for (let m = 1; m <= 12; m++) this.keys.push(y + "-" + String(m).padStart(2, "0"));
    this.eventP = EVENTS.map(ev => ({
      ...ev,
      p: P0 + easeTimeInv(this.keys.indexOf(ev.t) / (MONTHS - 1)) * (P1 - P0),
    }));

    this.series = null;                  // cat -> [84 growth factors vs 2019-01]
    this._q = 0;
    this._playing = false;
    this._playRaf = null;
    this._cancelPlay = null;

    if (this.reduced) {
      if (this.hero) this.hero.classList.add("hero--static");
      this._load().then(() => this.setProgress(1));
      this.setProgress(1);
    } else {
      this._buildTicks();
      this._wireScroll();
      this._wirePlay();
      this._wireSeek();
      this._armLoad();                   // fetch hicpIndex on FIRST interaction, never at boot
    }
  }

  /** Tiny dots on the timeline at each event month — echoes the till messages (D45). */
  _buildTicks() {
    if (!this.lineEl) return;
    for (const ev of EVENTS) {
      const m = this.keys.indexOf(ev.t);
      const dot = document.createElement("span");
      dot.className = "rc-tl-tick";
      dot.style.insetInlineStart = ((m / (MONTHS - 1)) * 100).toFixed(2) + "%";
      dot.setAttribute("aria-hidden", "true");
      this.lineEl.insertBefore(dot, this.headEl);
    }
  }

  /** Seek the register to a month-space fraction of the timeline (shared by all inputs). */
  _seekFrac(frac) {
    const t = easeTimeInv(clamp(frac, 0, 1));      // month-space -> scroll-space
    const q = P0 + t * (P1 - P0);
    const range = (this.hero.offsetHeight - innerHeight) * 0.92;
    scrollTo(0, this.hero.offsetTop + q * range);
  }

  /** Timeline input (D46): click OR grab-and-drag the hairline (pointer capture); arrow keys
   *  on the focused play button step the register one YEAR per press (keyboard seek). */
  _wireSeek() {
    if (!this.lineEl || !this.hero) return;
    // [P4.2 · owner gate G5] The track was a plain <div>: no role, no tab stop, no values, so a
    // keyboard or screen-reader user had no way to operate it at all (the arrow keys below existed
    // but only fired while the PLAY BUTTON held focus, which nothing announced). valuemin/max are
    // derived from MONTHS here rather than written into index.html so the two cannot drift; the
    // label and the tab stop are static facts and live in the markup. valuenow/valuetext are
    // updated in setProgress, which already computes the month index and its display string.
    this.lineEl.setAttribute("aria-valuemin", "0");
    this.lineEl.setAttribute("aria-valuemax", String(MONTHS - 1));
    const fracOf = e => {
      const r = this.lineEl.getBoundingClientRect();
      return (e.clientX - r.left) / Math.max(1, r.width);
    };
    let dragging = false;
    this.lineEl.addEventListener("pointerdown", e => {
      dragging = true;
      if (this._stopPlay) this._stopPlay();        // grabbing the line takes over from Play
      this.lineEl.setPointerCapture(e.pointerId);
      this._seekFrac(fracOf(e));
    });
    this.lineEl.addEventListener("pointermove", e => { if (dragging) this._seekFrac(fracOf(e)); });
    const end = () => { dragging = false; };
    this.lineEl.addEventListener("pointerup", end);
    this.lineEl.addEventListener("pointercancel", end);
    // [P4.2] ONE handler owns the arrow keys, bound to the timeline that CONTAINS both the play
    // button and the track. The button and the track are siblings, so two separate listeners could
    // not actually double-fire — but one of them would silently own the keys depending on which
    // element happened to have focus, and adding a second listener to the newly-focusable track is
    // exactly how that turns into a double-step later. A single listener on the common parent
    // cannot: one keypress, one step, whichever child is focused. Step stays one year per press.
    const tl = this.lineEl.parentElement;
    if (tl) tl.addEventListener("keydown", e => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const t = clamp((this._q - P0) / (P1 - P0), 0, 1);
      const m = Math.round(easeTime(t) * (MONTHS - 1));
      const m2 = clamp(m + (e.key === "ArrowRight" ? 12 : -12), 0, MONTHS - 1);
      this._seekFrac(m2 / (MONTHS - 1));
    });
  }

  _armLoad() {
    const kick = () => {
      removeEventListener("scroll", kick); removeEventListener("pointerdown", kick);
      this._load();
    };
    addEventListener("scroll", kick, { passive: true });
    addEventListener("pointerdown", kick);
  }

  async _load() {
    if (this.series || !this.ctx || !this.ctx.data) return;
    try {
      const d = this.ctx.data;
      await d.ensure("hicpIndex");
      const geo = d.euAggregateCode();
      const s = {};
      for (const r of this.rows) {
        const ser = (d.hicpIndex[geo] || {})[r.cat] || {};
        const base = ser[START];
        let last = 1;                    // carry-forward guard for any missing month
        s[r.cat] = this.keys.map(k => {
          const v = ser[k];
          if (v != null && base) last = v / base;
          return last;
        });
      }
      this.series = s;
      this.setProgress(this._q);
    } catch (e) { /* data unavailable — receipt stays honestly at JAN 2019 */ }
  }

  /** q ∈ [0,1] through the pinned track. Fully reversible (the register rewinds). */
  setProgress(q) {
    q = clamp(q, 0, 1);
    this._q = q;

    // 1 · date + prices on the eased clock
    const t  = clamp((q - P0) / (P1 - P0), 0, 1);
    const mi = Math.round(easeTime(t) * (MONTHS - 1));
    const k  = this.keys[mi];
    const dateTxt = MON[+k.slice(5) - 1] + " " + k.slice(0, 4);
    if (this.dateEl) this.dateEl.textContent = dateTxt;
    // [P4.2] the slider's live value, in the same month-space its min/max are expressed in
    if (this.lineEl) {
      this.lineEl.setAttribute("aria-valuenow", String(mi));
      this.lineEl.setAttribute("aria-valuetext", dateTxt);
    }
    if (this.series) {
      let total = 0;
      for (const r of this.rows) {
        // Register-style: cent-round each line FIRST, then sum — lines always add to TOTAL.
        const price = Math.round(r.base * this.series[r.cat][mi] * 100) / 100;
        total += price;
        r.el.textContent = price.toFixed(2);
      }
      if (this.totalEl) this.totalEl.textContent = "€" + total.toFixed(2);
    }

    // 2 · claret stamp draws q∈[0.88,0.96]; visibility-gated (round-linecap dot fix, D44)
    if (this.stampEl) {
      const sp = clamp((q - 0.88) / 0.08, 0, 1);
      this.stampEl.setAttribute("visibility", sp > 0 ? "visible" : "hidden");
      this.stampEl.setAttribute("stroke-dashoffset", String(100 - 100 * sp));
    }

    // 3 · the question lands in the headline slot AFTER the stamp (D45)
    if (this.qEl) this.qEl.classList.toggle("is-in", this.reduced || q >= 0.96);

    // 3b · timeline playhead tracks the eased register clock (D45)
    if (this.headEl) this.headEl.style.insetInlineStart = (easeTime(t) * 100).toFixed(2) + "%";

    // 4 · till message — trapezoid window: in, HOLD, out (catchable, full ink)
    if (this.msgEl && !this.reduced) {
      let best = null, op = 0;
      for (const ev of this.eventP) {
        const d0 = q - (ev.p - MSG_IN);
        let o = 0;
        if (d0 > 0) {
          if (d0 < MSG_IN) o = d0 / MSG_IN;
          else if (d0 < MSG_IN + MSG_HOLD) o = 1;
          else if (d0 < MSG_IN + MSG_HOLD + MSG_IN) o = 1 - (d0 - MSG_IN - MSG_HOLD) / MSG_IN;
        }
        if (o > op) { op = o; best = ev; }
      }
      if (best && op > 0.02) {
        this.msgEl.textContent = best.label;
        this.msgEl.style.opacity = Math.min(1, op).toFixed(2);
      } else {
        this.msgEl.style.opacity = "0";
      }
    }
  }

  /** Auto-scroll glide to pin release; icon-only button (aria-pressed flips ▸/■ via CSS);
   *  ANY user input (wheel/touch/key) cancels instantly. */
  _wirePlay() {
    if (!this.playEl || !this.hero) return;
    const stop = () => {
      if (!this._playing) return;
      this._playing = false;
      if (this._playRaf) cancelAnimationFrame(this._playRaf);
      this._playRaf = null;
      if (this._cancelPlay) { this._cancelPlay(); this._cancelPlay = null; }
      this.playEl.setAttribute("aria-pressed", "false");
      this.playEl.setAttribute("aria-label", "Play the receipt from 2019 to 2025");
    };
    this._stopPlay = stop;               // timeline drag takes over from Play (D46)
    const start = () => {
      const endY = this.hero.offsetTop + this.hero.offsetHeight - innerHeight;
      const y0 = scrollY;
      if (endY - y0 < 40) return;
      this._playing = true;
      this.playEl.setAttribute("aria-pressed", "true");
      this.playEl.setAttribute("aria-label", "Stop the automatic scroll");
      const dur = Math.max(1200, 24000 * (1 - this._q));   // full run ~24 s
      const t0 = performance.now();
      const step = now => {
        if (!this._playing) return;
        const u = clamp((now - t0) / dur, 0, 1);
        scrollTo(0, y0 + (endY - y0) * u);
        if (u < 1) this._playRaf = requestAnimationFrame(step);
        else stop();
      };
      this._playRaf = requestAnimationFrame(step);
      const cancel = () => stop();
      addEventListener("wheel", cancel, { passive: true });
      addEventListener("touchstart", cancel, { passive: true });
      addEventListener("keydown", cancel);
      this._cancelPlay = () => {
        removeEventListener("wheel", cancel);
        removeEventListener("touchstart", cancel);
        removeEventListener("keydown", cancel);
      };
    };
    this.playEl.addEventListener("click", () => (this._playing ? stop() : start()));
  }

  /** rAF-throttled scroll -> progress through the pinned hero (top-anchored rect, [D36]). */
  _wireScroll() {
    if (!this.hero) return;
    let raf = null;
    const compute = () => {
      raf = null;
      const r = this.hero.getBoundingClientRect();
      const range = Math.max(1, (this.hero.offsetHeight - innerHeight) * 0.92);
      this.setProgress(clamp(-r.top / range, 0, 1));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(compute); };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    compute();
  }

  resize() {}
}
