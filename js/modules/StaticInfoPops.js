/* ============================================================
   StaticInfoPops — click-to-info affordances OUTSIDE the chart layer: the hero receipt's
   line items + footer note, the about-credit author/UniGe text, and every chart's source
   line. Reuses the InfoPop singleton (js/modules/InfoPop.js) for everything except the
   UniGe logo, which opens a small image lightbox instead of a text card.

   Deliberately invisible at rest (owner override of AMENDMENT-3 §5.2's dotted-underline
   affordance, scoped to these targets only): InfoPop.flag() adds cursor:help + tabindex +
   the shared .infopop-trigger class, but that class only carries visible styling under
   .chart-svg (css/charts.css) — outside an SVG it's a no-op, so these HTML triggers get
   zero visual change at rest for free. :focus-visible is the global base.css rule.
   ============================================================ */
import { getInfoPop } from "./InfoPop.js";

const RECEIPT_POPOVERS = {
  "Rent & water": "Follows Eurostat's housing index (CP04): actual rents, water and home maintenance. Starts at an illustrative €30 of a renter's €100 month.",
  "Groceries": "Follows Eurostat's food index (CP01): everything edible in the trolley. Starts at €22 — the second-biggest line of the month.",
  "Services": "Follows Eurostat's services index: haircuts, dentists, cinema, insurance. Starts at €15.",
  "Petrol & transport": "Follows Eurostat's transport index (CP07): fuel, tickets, repairs. Starts at €14.",
  "Electricity & gas": "Follows Eurostat's energy index (CP045). Starts at €10 — the line that peaked 73% above 2019 in October 2022.",
  "Café & restaurants": "Follows Eurostat's restaurants index (CP11). Starts at €9 — the small pleasures line.",
};

const RECEIPT_NOTE_TEXT = `The €100 is a unit, like "per 100g": an illustrative renter's budget anchored to the EU household budget survey. Each line grows by its real Eurostat index. Full method: <a href="#methodology">How this was made</a>.`;

const AUTHOR_CARD = `GitHub · <a href="https://github.com/mojtaba-alehoseini" target="_blank" rel="noopener">github.com/mojtaba-alehoseini</a><br>LinkedIn · <a href="https://www.linkedin.com/in/mojtaba-alehosseini/" target="_blank" rel="noopener">linkedin.com/in/mojtaba-alehosseini</a>`;

const UNIGE_CARD = `The University of Genova (UniGe), founded in 1481, is one of Italy's oldest universities. This essay is a project for its Data Visualization course, MSc in Artificial Intelligence. <a href="https://unige.it" target="_blank" rel="noopener">unige.it</a>`;

// [debug 2026-07-07] Matched against each .chart-source element's own textContent (lowercased) —
// a line can cite more than one code (rateLevel cites both prc_hicp_manr and prc_hicp_midx); every
// matched card's text is joined into one combined popover rather than picking just one arbitrarily.
const SOURCE_CARDS = {
  "prc_hicp_manr": `Eurostat's harmonised consumer-price index, monthly year-on-year rate — the EU's official inflation measure. <a href="https://ec.europa.eu/eurostat/databrowser/product/view/prc_hicp_manr" target="_blank" rel="noopener">View the dataset</a>`,
  "prc_hicp_aind": `Eurostat's harmonised consumer-price index, annual average rate per country. <a href="https://ec.europa.eu/eurostat/databrowser/product/view/prc_hicp_aind" target="_blank" rel="noopener">View the dataset</a>`,
  "prc_hicp_midx": `Eurostat's harmonised consumer-price index as an index level (2015=100), rebased here to 2019. Levels show how high prices sit, not how fast they climb. <a href="https://ec.europa.eu/eurostat/databrowser/product/view/prc_hicp_midx" target="_blank" rel="noopener">View the dataset</a>`,
  "prc_hpi_q": `Eurostat's house price index, quarterly, total purchases, 2015 = 100: the price of buying homes, which the consumer basket mostly excludes. Greece publishes no house price index, so the EU aggregate covers 26 countries. <a href="https://ec.europa.eu/eurostat/databrowser/product/view/prc_hpi_q" target="_blank" rel="noopener">View the dataset</a>`,
  "earn_mw_cur": `Eurostat's statutory minimum wages, twice-yearly, read in national currency. Five EU countries set pay by collective bargaining and have no statutory minimum; Cyprus introduced one in 2023, too late for a 2019 baseline. <a href="https://ec.europa.eu/eurostat/databrowser/product/view/earn_mw_cur" target="_blank" rel="noopener">View the dataset</a>`,
};

function wireReceipts(ip) {
  document.querySelectorAll(".receipt__line .rc-name").forEach(el => {
    const text = RECEIPT_POPOVERS[el.textContent.trim()];
    if (text) ip.flag(el, text);
  });
  document.querySelectorAll(".receipt__note").forEach(el => ip.flag(el, RECEIPT_NOTE_TEXT));
}

function wireAbout(ip) {
  const author = document.querySelector(".about-credit__by");
  if (author) ip.flag(author, AUTHOR_CARD);
  const uniGe = document.querySelector(".ac-unige-trigger");
  if (uniGe) ip.flag(uniGe, UNIGE_CARD);
}

function wireSources(ip) {
  document.querySelectorAll(".chart-source").forEach(el => {
    const haystack = el.textContent.toLowerCase();
    const hits = Object.keys(SOURCE_CARDS).filter(code => haystack.includes(code));
    if (!hits.length) return;   // no cited code in this line (scoreMap/boxplot) — nothing to match
    ip.flag(el, hits.map(code => SOURCE_CARDS[code]).join(" "));
  });
}

// UniGe logo -> lightbox (not an InfoPop card: an enlarged-image overlay, per its own spec).
function wireLogoLightbox(motion) {
  const logo = document.querySelector(".about-credit__logo");
  if (!logo) return;
  const box = document.createElement("div");
  box.className = "unige-lightbox";
  box.hidden = true;
  box.innerHTML =
    `<button type="button" class="unige-lightbox__close" aria-label="Close">×</button>` +
    `<img class="unige-lightbox__img" src="${logo.src}" alt="University of Genova" />`;
  document.body.appendChild(box);

  const reduced = () => motion.reduced;
  const open = () => {
    box.hidden = false;
    if (reduced()) { box.classList.add("is-in"); }
    else { box.classList.remove("is-in"); requestAnimationFrame(() => box.classList.add("is-in")); }
    document.addEventListener("keydown", onKey);
  };
  const close = () => {
    box.classList.remove("is-in");
    box.hidden = true;
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };

  logo.style.cursor = "zoom-in";
  logo.setAttribute("tabindex", "0");
  logo.setAttribute("role", "button");
  logo.setAttribute("aria-label", "University of Genova logo — view enlarged");
  logo.addEventListener("click", open);
  logo.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  box.addEventListener("click", (e) => { if (e.target === box) close(); });
  box.querySelector(".unige-lightbox__close").addEventListener("click", close);
}

export function initStaticInfoPops(ctx) {
  const ip = getInfoPop();
  wireReceipts(ip);
  wireAbout(ip);
  wireSources(ip);
  wireLogoLightbox(ctx.motion);
}
