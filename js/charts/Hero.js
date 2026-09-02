/* ============================================================
   Hero.js — the shared coin glyph.

   What is left of this file is `buildCoinGlyph(tarnish)` and the four helpers it needs. It is
   imported by exactly one place: BoxPlot.js, for the finale bookend.

   What used to be here was CoinHero — "a coin made of coins", a phyllotaxis medallion of 100 real
   €1-coin tiles, pinned for ~1.2 viewport-heights, counting €100 -> €77 while the outer rim drifted
   out. It was retired when ReceiptHero replaced it (see main.js), and the class stayed on disk for
   103 lines afterwards, along with its constants (the 2019-2025 value series, the golden angle,
   the coin image path) and a header describing a hero the page does not render. [P6.2] deleted it.

   Not a BaseChart, and no longer a screen — one exported function.
   ============================================================ */

const NS = "http://www.w3.org/2000/svg";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let glyphSeq = 0;                            // instance counter -> unique gradient IDs per SVG

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
 *  coin reused as the BoxPlot finale connective glyph. Returns an <svg> element. */
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
