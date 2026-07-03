/* ============================================================
   main.js — entry point for "The Price of Europe"
   Boots all subsystems then mounts charts lazily on scroll.
   ============================================================ */

import { ThemeManager }    from "./modules/ThemeManager.js";
import { MotionManager }   from "./modules/MotionManager.js";
import { DataManager }     from "./modules/DataManager.js";
import { ScrollController }from "./modules/ScrollController.js";
import { Tooltip }         from "./modules/Tooltip.js";
import { CoinHero }        from "./charts/Hero.js";

import { Choropleth }         from "./charts/Choropleth.js";
import { CompareMap }         from "./charts/CompareMap.js";
import { SmallMultiplesLine } from "./charts/SmallMultiplesLine.js";
import { AnnotatedLine }      from "./charts/AnnotatedLine.js";
import { Heatmap }            from "./charts/Heatmap.js";
import { DivergingBar }       from "./charts/DivergingBar.js";
import { WaffleChart }        from "./charts/WaffleChart.js";
import { BoxPlot }            from "./charts/BoxPlot.js";

// --- Wait for global D3 + libs to be parsed before booting -----------
window.addEventListener("DOMContentLoaded", async () => {
  if (typeof d3 === "undefined") {
    // d3 deferred script not yet evaluated — wait one tick then retry
    return new Promise(r => requestAnimationFrame(() => r(boot())));
  }
  boot();
});

async function boot() {
  // 1. boot UI infrastructure
  const theme  = new ThemeManager();
  const motion = new MotionManager(theme);
  const tip    = new Tooltip();
  const ctx    = { theme, motion, tooltip: tip };

  // 2. hero — "a coin made of coins" sunflower medallion (MASTER-PLAN PART 7). Flat DOM/SVG,
  //    always-on above the fold, so it is instantiated directly here (not scroll-mounted). The
  //    old hero video + canvas (heroSequence.js / hero.mp4) are retired — kept on disk, dereferenced.
  new CoinHero("#hero-coins", ctx);

  // 2b. (The earlier design's header progress-coin + act-divider coin glyphs were removed in the
  //     round-5 debug pass. The page is a flat chapter flow with no acts, and the header deliberately
  //     scrolls away — so a header coin can't function as a scroll compass, and a fixed coin would add
  //     persistent chrome the "header is not a bar" design avoids. The coin motif lives on in the hero
  //     medallion and the BoxPlot finale bookend.)

  // 2c. Reveal-on-scroll for [.reveal-up] (the about credit block + UniGe logo + lede): fade/rise in
  //     when scrolled into view. Generic + reusable; CSS owns the transition + the stagger. Reduced-motion
  //     (or no IO) shows them immediately.
  const reveals = document.querySelectorAll(".reveal-up");
  if (!motion.reduced && "IntersectionObserver" in window) {
    const revealIO = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("is-in"); revealIO.unobserve(e.target); } });
    }, { threshold: 0.2 });
    reveals.forEach(el => revealIO.observe(el));
  } else {
    reveals.forEach(el => el.classList.add("is-in"));
  }

  // 3. data — single Promise.all
  const data = new DataManager();
  try {
    await data.loadAll();
  } catch (err) {
    console.error("Data load failed", err);
    document.querySelectorAll(".chart-body").forEach(el => {
      el.innerHTML = `<p class="chart-load-error">Data load failed — check the console.</p>`;
    });
    return;
  }
  ctx.data = data;

  // 4. [R2 perf] Lazy chart construction — factories, not instances. ScrollController
  //    constructs each chart only when its chapter nears the viewport (after its deferred
  //    data is ensured), so boot does no per-chart work and the initial paint stays light.
  const charts = {};   // key -> live instance, filled on mount
  const chartFactories = {
    choropleth        : () => new Choropleth        ("#chart-choropleth",        data, ctx),
    compareMap        : () => new CompareMap        ("#chart-compareMap",        data, ctx),
    smallMultiples    : () => new SmallMultiplesLine("#chart-smallMultiples",    data, ctx),
    annotatedLine     : () => new AnnotatedLine     ("#chart-annotatedLine",     data, ctx),
    heatmap           : () => new Heatmap           ("#chart-heatmap",           data, ctx),
    divergingBar      : () => new DivergingBar      ("#chart-divergingBar",      data, ctx),
    waffle            : () => new WaffleChart       ("#chart-waffle",            data, ctx),
    boxplot           : () => new BoxPlot           ("#chart-boxplot",           data, ctx),
  };

  // 5. scroll controller wires steps + mounts charts on enter
  const scroller = new ScrollController(chartFactories, charts, ctx);
  scroller.init();

  // 6. resize observer (single, debounced)
  let resizeFrame;
  const onResize = () => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      Object.values(charts).forEach(c => c.resize && c.resize());
    });
  };
  window.addEventListener("resize", onResize, { passive: true });

  // 7. expose for debugging (read-only)
  Object.defineProperty(window, "PriceOfEurope", {
    value: Object.freeze({ data, charts, theme, motion, ctx }),
    writable: false, configurable: false
  });
}
