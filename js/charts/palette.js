/* ============================================================
   palette.js — D3 chart palette helpers
   Pull live values from CSS custom properties so light/dark
   themes update interpolators automatically.
   ============================================================ */

// Read a CSS custom property's value for d3. The seq / cat / surface tokens are stored as hex
// (NOT oklch) precisely because d3 7.9's colour parser can't read oklch()/color-mix() — it returns
// null → black in d3 colour scales. getPropertyValue returns the declared value and resolves a
// nested var() (e.g. --seq-4: var(--accent) → the accent hex), which d3 then parses. See D15.
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function readPalette() {
  return {
    // Sequential (inflation severity)
    seq: [
      css("--seq-1"),
      css("--seq-2"),
      css("--seq-3"),
      css("--seq-4"),
      css("--seq-5"),
    ],

    // Categorical (independent series)
    cat: {
      overall:   css("--cat-overall"),
      energy:    css("--cat-energy"),
      food:      css("--cat-food"),
      housing:   css("--cat-housing"),
      services:  css("--cat-services"),
      wages:     css("--cat-wages"),
      transport: css("--cat-transport"),
      other:     css("--cat-other")
    },

    // Surface
    bg:        css("--bg"),
    bgElev:    css("--bg-elev"),
    bgSunken:  css("--bg-sunken"),
    ink:       css("--ink"),
    inkSoft:   css("--ink-soft"),
    inkFaint:  css("--ink-faint"),
    rule:      css("--rule"),
    ruleSoft:  css("--rule-soft"),

    // Accent
    accent:    css("--accent"),
    accentVeil:css("--accent-veil"),
    link:      css("--link"),

    // Events
    event: {
      covid:  css("--event-covid"),
      energy: css("--event-energy"),
      policy: css("--event-policy"),
      food:   css("--event-food")
    }
  };
}

/** Map COICOP category codes to our categorical palette tokens. */
export const CATEGORY_TO_PALETTE = {
  CP00: "overall",
  CP01: "food",
  CP02: "other",
  CP03: "other",
  CP04: "housing",
  CP045:"energy",
  CP05: "other",
  CP06: "services",
  CP07: "transport",
  CP08: "services",
  CP09: "services",
  CP10: "services",
  CP11: "services",
  CP12: "services",
  NRG:  "energy",
  FOOD: "food",
  SERV: "services"
};

/** d3.scaleSequential built from current seq tokens. */
export function makeInflationScale(domain = [-2, 12]) {
  const p = readPalette();
  return d3.scaleLinear()
    .domain([-2, 0, 2, 5, 10, 15])
    .range([p.seq[0], p.seq[0], p.seq[1], p.seq[2], p.seq[3], p.seq[4]])
    .clamp(true);
}
