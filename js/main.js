/* ============================================================
   main.js — entry point for "The Price of Europe"
   Boots all subsystems then mounts charts lazily on scroll.
   ============================================================ */

import { ThemeManager }    from "./modules/ThemeManager.js";
import { MotionManager }   from "./modules/MotionManager.js";
import { DataManager }     from "./modules/DataManager.js";
import { ScrollController }from "./modules/ScrollController.js";
import { Tooltip }         from "./modules/Tooltip.js";
import { Navigation }      from "./modules/Navigation.js";
import { HeroSequence }    from "./video/heroSequence.js";

import { Choropleth }         from "./charts/Choropleth.js";
import { SmallMultiplesLine } from "./charts/SmallMultiplesLine.js";
import { AnnotatedLine }      from "./charts/AnnotatedLine.js";
import { Ridgeline }          from "./charts/Ridgeline.js";
import { StackedArea }        from "./charts/StackedArea.js";
import { SlopeChart }         from "./charts/SlopeChart.js";
import { Heatmap }            from "./charts/Heatmap.js";
import { DivergingBar }       from "./charts/DivergingBar.js";
import { WaffleChart }        from "./charts/WaffleChart.js";
import { ConnectedScatter }   from "./charts/ConnectedScatter.js";
import { BumpChart }          from "./charts/BumpChart.js";
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
  const nav    = new Navigation();
  const ctx    = { theme, motion, tooltip: tip, nav };

  // 2. hero canvas background (non-blocking)
  const heroCanvas = document.getElementById("hero-sequence");
  if (heroCanvas) new HeroSequence(heroCanvas, ctx);

  // 2b. hero video — ping-pong via pre-encoded reverse twin.
  // Two stacked <video>s: forward + hero_reversed.mp4. On each `ended` we swap which
  // one is visible+playing. Last frame of one = first frame of the other → no seam.
  // Reduced-motion: keep the forward video looping natively.
  const heroFwd = document.getElementById("hero-video");
  const heroRev = document.getElementById("hero-video-rev");
  if (heroFwd && heroRev && !motion.reduced) {
    heroFwd.playbackRate = 0.5;
    heroRev.playbackRate = 0.5;
    const swap = (hide, show) => {
      show.currentTime = 0;
      show.playbackRate = 0.5;
      show.dataset.active = "true";
      hide.dataset.active = "false";
      const p = show.play();
      if (p && p.catch) p.catch(() => {});
      hide.pause();
    };
    heroFwd.addEventListener("ended", () => swap(heroFwd, heroRev));
    heroRev.addEventListener("ended", () => swap(heroRev, heroFwd));
  } else if (heroFwd && motion.reduced) {
    heroFwd.setAttribute("loop", "");                          // native loop for reduced-motion
  }

  // 3. data — single Promise.all
  const data = new DataManager();
  try {
    await data.loadAll();
  } catch (err) {
    console.error("Data load failed", err);
    document.querySelectorAll(".chart-body").forEach(el => {
      el.innerHTML = `<p style="color:var(--seq-4);padding:1em">Data load failed — check the console.</p>`;
    });
    return;
  }
  ctx.data = data;

  // 4. instantiate charts (do not render yet — scroll controller mounts them)
  const charts = {
    choropleth        : new Choropleth        ("#chart-choropleth",        data, ctx),
    smallMultiples    : new SmallMultiplesLine("#chart-smallMultiples",    data, ctx),
    annotatedLine     : new AnnotatedLine     ("#chart-annotatedLine",     data, ctx),
    ridgeline         : new Ridgeline         ("#chart-ridgeline",         data, ctx),
    stackedArea       : new StackedArea       ("#chart-stackedArea",       data, ctx),
    slope             : new SlopeChart        ("#chart-slope",             data, ctx),
    heatmap           : new Heatmap           ("#chart-heatmap",           data, ctx),
    divergingBar      : new DivergingBar      ("#chart-divergingBar",      data, ctx),
    waffle            : new WaffleChart       ("#chart-waffle",            data, ctx),
    connectedScatter  : new ConnectedScatter  ("#chart-connectedScatter",  data, ctx),
    bump              : new BumpChart         ("#chart-bump",              data, ctx),
    boxplot           : new BoxPlot           ("#chart-boxplot",           data, ctx),
  };

  // 5. scroll controller wires steps + mounts charts on enter
  const scroller = new ScrollController(charts, ctx);
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
