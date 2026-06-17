/* ============================================================
   Hero.js — "A coin made of coins" (owner review 2026-06-15) + the shared coin glyph.
   A flat sunflower (phyllotaxis) medallion of 100 REAL euro-coin images. The hero is PINNED
   (sticky) for ~1.2 viewport-heights; scroll PROGRESS (not page movement) drives the animation:
   the finding number counts EUR100 -> EUR77 and the outer-rim coins DRIFT OUT with motion
   (outward + up, shrinking + fading — removed, not greyed). After the drain the hero un-pins.
   Reduced-motion: the hero is a single static screen showing the resolved end-state (EUR77, rim gone).

   Coins are <img> tiles of ONE real €1-coin common-side image (assets/coins/euro-1.png), repeated across
   all 100 tiles (100 × €1 = €100 of Jan 2019). No CSS/SVG gold spheres, no claret ring, no flip (owner
   override). The same SVG coin is still exported as
   `buildCoinGlyph(tarnish)` / `progressCoin()` and reused (DRY) by the act-divider page-turn glyph
   + the header progress-coin. Not a BaseChart: a bespoke screen, booted by main.js.
   ============================================================ */

import { smooth } from "../modules/ChartMotion.js";

const NS = "http://www.w3.org/2000/svg";
const N = 100;                               // 100 coins = EUR100 of January 2019
// Worth of EUR100 from 2019, by each year-end: EU27 HICP CP00 (Jan-2019 base -> that year's Dec index;
// 2019 itself = the EUR100 base), ending at the essay's established EUR77 (2025). Source: hicp_index.json.
// Scroll snaps to a YEAR -> the number, the year label and the coins all move together (time made visible).
const YEARS  = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const VALUES = [100,   97,   92,   84,   81,   79,   77];
const RIM = 100 - VALUES[VALUES.length - 1];  // outer 23 coins drift out across EUR100 -> EUR77
const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // golden angle, ~137.5deg, in radians
const VB = 1000;                            // square viewBox (the medallion)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let glyphSeq = 0;                            // instance counter -> unique gradient IDs per SVG

// ONE real €1-coin common-side image, repeated across all 100 tiles: 100 × €1 = €100 of January 2019
// (the whole conceit). The owner supplies the cleared file at assets/coins/euro-1.png (see SOURCE.txt);
// until then it is a real €1 common-side placeholder. Per-coin rotation (in render) keeps the pile lively
// despite the single source. No CSS/SVG spheres, no claret ring, no flip (owner override).
const COIN_IMG = "assets/coins/euro-1.png";

/** Bimetallic coin gradients (gold + ash) with instance-unique IDs, so many coins can coexist on
 *  one page without duplicate-ID clashes. Colours are hex coin-metal tokens, CSS-var resolved. */
function coinGradients(pfx) {
  const ids = { gold: `${pfx}-gold`, goldC: `${pfx}-gold-c`, ash: `${pfx}-ash`, ashC: `${pfx}-ash-c` };
  const defs = `<defs>
    <radialGradient id="${ids.gold}" cx="36%" cy="31%" r="72%">
      <stop offset="0%" stop-color="var(--coin-gold-hi)"/><stop offset="55%" stop-color="var(--coin-gold)"/><stop offset="100%" stop-color="var(--coin-gold-lo)"/>
    </radialGradient>
    <radialGradient id="${ids.goldC}" cx="38%" cy="34%" r="74%">
      <stop offset="0%" stop-color="var(--coin-gold-hi)"/><stop offset="100%" stop-color="var(--coin-gold)"/>
    </radialGradient>
    <radialGradient id="${ids.ash}" cx="36%" cy="31%" r="72%">
      <stop offset="0%" stop-color="var(--coin-tarnish-hi)"/><stop offset="55%" stop-color="var(--coin-tarnish)"/><stop offset="100%" stop-color="var(--coin-tarnish-lo)"/>
    </radialGradient>
    <radialGradient id="${ids.ashC}" cx="38%" cy="34%" r="74%">
      <stop offset="0%" stop-color="var(--coin-tarnish-hi)"/><stop offset="100%" stop-color="var(--coin-tarnish)"/>
    </radialGradient>
  </defs>`;
  return { defs, ids };
}

function disc(r, fill, cls) {
  const c = document.createElementNS(NS, "circle");
  c.setAttribute("r", r.toFixed(1));
  c.setAttribute("class", cls);
  c.setAttribute("fill", fill);
  return c;
}

/** A bimetallic coin <g> centred at (x,y): gold ring + paler inner, optionally with an ash overlay
 *  (ring + inner) at `ashOpacity` — the gold "draining to grey" in place. Returns { g, ash }. */
function coinGroup(R, ids, { x = 0, y = 0, ashOpacity = 0, withAsh = true, cls = "" } = {}) {
  const g = document.createElementNS(NS, "g");
  if (cls) g.setAttribute("class", cls);
  if (x || y) g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  g.appendChild(disc(R, `url(#${ids.gold})`, "hc-ring"));
  g.appendChild(disc(R * 0.6, `url(#${ids.goldC})`, "hc-inner"));
  let ash = null;
  if (withAsh) {
    ash = document.createElementNS(NS, "g");
    ash.setAttribute("class", "hc-ash-layer");
    ash.setAttribute("opacity", String(ashOpacity));
    ash.appendChild(disc(R, `url(#${ids.ash})`, "hc-ring"));
    ash.appendChild(disc(R * 0.6, `url(#${ids.ashC})`, "hc-inner"));
    g.appendChild(ash);
  }
  return { g, ash };
}

/** A single standalone coin glyph SVG at a tarnish level (0 = full gold, 1 = fully ash) — the hero's
 *  coin reused as the act-divider connective glyph (PART 8.11/8.12). Returns an <svg> element. */
export function buildCoinGlyph(tarnish = 0) {
  const t = clamp(tarnish, 0, 1);
  const { defs, ids } = coinGradients("cg" + (glyphSeq++));
  const S = 100, R = S * 0.46;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${S} ${S}`);
  svg.setAttribute("class", "coin-glyph__svg");
  svg.innerHTML = defs;
  svg.appendChild(coinGroup(R, ids, { x: S / 2, y: S / 2, ashOpacity: t, withAsh: t > 0 }).g);
  return svg;
}

/** The header progress-coin (PART 2 / DESIGN-REVIEW #7) — a small coin that TARNISHES gold→grey as the
 *  reader scrolls Act I→V: the connective glyph as a silent compass. Reuses the hero coin (DRY). Returns
 *  { el, setTarnish(t) }; setTarnish crossfades the ash overlay (0 = gold, 1 = grey). */
export function progressCoin() {
  const { defs, ids } = coinGradients("pc" + (glyphSeq++));
  const S = 100, R = S * 0.46;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${S} ${S}`);
  svg.setAttribute("class", "progress-coin__svg");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = defs;
  const { g, ash } = coinGroup(R, ids, { x: S / 2, y: S / 2, ashOpacity: 0, withAsh: true });
  svg.appendChild(g);
  return { el: svg, setTarnish: (t) => ash.setAttribute("opacity", clamp(t, 0, 1).toFixed(3)) };
}

export class CoinHero {
  /** @param mountSel  selector/element for the medallion container
   *  @param ctx       { motion } — motion.reduced gates animation */
  constructor(mountSel, ctx) {
    this.mount = typeof mountSel === "string" ? document.querySelector(mountSel) : mountSel;
    this.ctx = ctx;
    this.reduced = !!(ctx && ctx.motion && ctx.motion.reduced);
    this.coins = [];        // every tile: { el, isRim, ox, oy, rot, r, k }
    this.rim = [];          // rim tiles, outermost-first
    this._q = 0;
    if (this.mount) {
      this.hero = (this.mount.closest && this.mount.closest("section")) || document.getElementById("hero");
      if (this.reduced && this.hero) this.hero.classList.add("hero--static");  // no pin / dead scroll
      this.render();
      if (this.reduced) this.setProgress(1);   // resolved end-state
      else this._wireScroll();                 // wired ONCE; render() re-lays-out on resize
    }
  }

  /** Lay out the 100 coin <img> tiles by phyllotaxis (does NOT wire scroll — that is once, in ctor). */
  render() {
    this.mount.innerHTML = "";
    this.coins = []; this.rim = [];
    const W = this.mount.clientWidth || 520;
    const cx = W / 2, cy = W / 2;
    const R = W * 0.455;                       // medallion radius
    const s = W / 10;                          // coin diameter — spaced so coins only lightly overlap (owner: less coverage)
    for (let i = 0; i < N; i++) {
      const a = i * GOLDEN;
      const r = R * Math.sqrt(i / (N - 1));
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      const isRim = i >= (N - RIM);            // outer RIM coins drift away (EUR100 -> EUR77)
      const rot = ((i * 53) % 70) - 35;        // deterministic tilt — reads as a real pile of coins
      const img = document.createElement("img");
      img.className = "hero-coin" + (isRim ? " is-rim" : "");
      img.src = COIN_IMG;
      img.alt = ""; img.setAttribute("aria-hidden", "true"); img.draggable = false; img.decoding = "async";
      img.style.width = img.style.height = s.toFixed(1) + "px";
      img.style.left = x.toFixed(1) + "px";
      img.style.top = y.toFixed(1) + "px";
      img.style.transform = `translate(-50%,-50%) rotate(${rot}deg)`;
      this.mount.appendChild(img);
      const rec = { el: img, isRim, ox: Math.cos(a), oy: Math.sin(a), rot, r, k: 0 };
      this.coins.push(rec);
      if (isRim) this.rim.push(rec);
    }
    this.rim.sort((p, q) => q.r - p.r);        // outermost-first (drains from the edge inward)
    this.rim.forEach((rec, k) => { rec.k = k; });
    this.bigNum = document.getElementById("hero-bignum");
    this.yearEl = document.getElementById("hero-year");
    this.setProgress(this._q);                 // apply current progress to the fresh tiles
  }

  /** q in [0,1] (eased upstream) snaps to a YEAR stop (2019…2025): the big number shows that year's worth
   *  of EUR100, the year label syncs, and the outer (100 − worth) coins DRIFT OUT (outward + up, shrinking
   *  + fading — removed, not greyed). Time + value + coins move together; CSS eases each coin's drift. */
  setProgress(q) {
    q = clamp(q, 0, 1);
    this._q = q;
    const i = Math.round(q * (YEARS.length - 1));        // snap to a year stop (0..6)
    const value = VALUES[i];
    if (this.bigNum) this.bigNum.textContent = "€" + value;
    if (this.yearEl) this.yearEl.textContent = YEARS[i];
    const drained = 100 - value;                         // outer coins gone by this year
    const W = this.mount.clientWidth || 520;
    for (let idx = 0; idx < this.rim.length; idx++) {
      const rec = this.rim[idx];                          // rec.k: 0 = outermost
      if (rec.k < drained) {                              // drifted OUT
        const dist = W * 0.55;
        const dx = rec.ox * dist;
        const dy = rec.oy * dist - W * 0.12;
        rec.el.style.opacity = "0";
        rec.el.style.transform =
          `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px)) rotate(${(rec.rot + 50).toFixed(1)}deg) scale(0.6)`;
      } else {                                            // still in the disc
        rec.el.style.opacity = "1";
        rec.el.style.transform = `translate(-50%,-50%) rotate(${rec.rot}deg)`;
      }
    }
  }

  /** rAF-throttled scroll -> progress through the PINNED hero (the tall section behind the sticky
   *  inner). Completes a touch before the pin releases so EUR77 is settled before the about section.
   *  Wired ONCE (ctor); reads geometry fresh each frame so resize() can re-lay-out without re-wiring. */
  _wireScroll() {
    if (!this.hero) return;
    let raf = null;
    const compute = () => {
      raf = null;
      const r = this.hero.getBoundingClientRect();
      const range = Math.max(1, (this.hero.offsetHeight - innerHeight) * 0.86);
      this.setProgress(smooth(clamp(-r.top / range, 0, 1)));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(compute); };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    compute();
  }

  /** HTML tiles are px-positioned, so a resize must re-lay them out (render re-applies progress). */
  resize() { if (this.mount) this.render(); }
}
