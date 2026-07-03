/* ============================================================
   ScrollController — wires scrollama to chart instances.
   - Each <article class="chapter" data-chart="<key>"> contains
     one scroller with steps + a sticky figure that mounts a chart.
   - We mount the chart on first enter, then forward step indices.
   ============================================================ */

export class ScrollController {
  constructor(factories, charts, ctx) {
    this.factories = factories;   // key -> () => new chart instance (lazy construction)
    this.charts = charts;         // key -> live instance, filled on mount
    this.ctx = ctx;
    this._stepChapters = [];         // [{chap, key}] — chapters with steps, for re-setup after layout
    this._scrollerByKey = new Map(); // key -> live scrollama instance (destroyed before each re-setup)
    this.mounted = new Set();
    this._dock = null;            // [R2·1b] fixed mobile step-dock element
    this._visibleChapters = new Set();
  }

  init() {
    if (typeof scrollama === "undefined") {
      // scrollama not yet loaded — try again on next tick
      return requestAnimationFrame(() => this.init());
    }

    document.querySelectorAll(".chapter").forEach(chap => this._wireChapter(chap));

    // [debug · real-Chrome 2026-06-21] scrollama wires its IntersectionObservers from the step geometry
    // present at setup() time. At boot that geometry is NOT final — the async Google-Fonts swap, the
    // 300dvh hero, and lazy-mounted chart heights all reflow afterwards — so the boot-time observers sit
    // at stale trigger lines and onStepEnter NEVER fires. Result: every onStep-driven behaviour (the map
    // year recolour, the heatmap / diverging / waffle / box-plot focus, the smallMultiples enlarge)
    // silently freezes on the first read-through. (The watchChapterProgress reveals still ran, which
    // masked it; the headless qa scrolls with programmatic scrollTo, which doesn't trip the IO, so it
    // never caught it — confirmed in the owner's Chrome: a fresh setup() fires where the boot one is dead.)
    // .resize() does NOT recover a stale instance — only a fresh setup() does — so REBUILD each chapter's
    // step-watcher once the layout has settled: after fonts load, on window load, a delayed safety net,
    // and (debounced) on resize. _wireSteps destroys the prior watcher first, so observers never stack.
    const resync = () => this._stepChapters.forEach(({ chap, key }) => this._wireSteps(chap, key));
    addEventListener("load", resync);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestAnimationFrame(resync));
    setTimeout(resync, 1200);
    let resizeT = null;
    addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(resync, 160); }, { passive: true });
  }

  _wireChapter(chap) {
    const key = chap.dataset.chart;
    if (!this.factories[key]) return;

    // [R2 perf] Mount on first near-viewport enter: ENSURE the chart's deferred datasets,
    // THEN construct + render. Charts aren't built at boot and their heavy data loads on
    // demand, so neither blocks the initial paint.
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && !this.mounted.has(key)) {
          this.mounted.add(key);
          io.disconnect();
          const data = this.ctx.data;
          Promise.resolve(data && data.ensureFor ? data.ensureFor(key) : null)
            .then(() => {
              const chart = this.charts[key] || (this.charts[key] = this.factories[key]());
              try { chart.render(); } catch (err) { console.error(`Chart ${key} render failed`, err); }
              // [debug · real-Chrome] Rebuild this chapter's step-watcher NOW — the chapter is
              // near the viewport + laid out, so scrollama measures correct step geometry (the
              // boot/early-resync setup ran while the chapter was far below + reflowing, leaving
              // dead observers). This is the reliable trigger; the init() resync is the backstop.
              this._wireSteps(chap, key);
            })
            .catch(err => {
              console.error(`Chart ${key} data load failed`, err);
              const el = document.getElementById(`chart-${key}`);
              if (el) el.innerHTML = `<p class="chart-load-error">Data unavailable — check the console.</p>`;
            });
        }
      });
    }, { rootMargin: "400px 0px", threshold: 0.01 });
    io.observe(chap);

    // scrollama step watcher — created here AND rebuilt after the layout settles (see init/_wireSteps),
    // because scrollama measures step geometry at setup() time and the page reflows after boot. Skip
    // chapters with no steps (e.g. the compare map) — scrollama logs a console error on empty steps.
    if (chap.querySelector(".scroller__step")) {
      this._stepChapters.push({ chap, key });
      this._wireSteps(chap, key);
    }

    // [R2·1b] Track chapter visibility so the mobile dock hides on hero / dividers / methodology.
    const visIO = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) this._visibleChapters.add(key);
        else this._visibleChapters.delete(key);
      });
      if (this._visibleChapters.size === 0) this._hideDock();
    }, { threshold: 0.01 });
    visIO.observe(chap);
  }

  // [debug · real-Chrome] (Re)build the scrollama step-watcher for one chapter. The boot-time instance
  // is measured before fonts/CSS/the 300dvh hero settle, so its observers never fire; init() calls this
  // again once the layout is stable. Destroys any prior watcher for this chapter first so observers
  // never stack. onStepEnter marks the active step, mirrors it into the mobile dock, and forwards the
  // index to the live chart's onStep (guarded — the chart may still be mounting on a fast scroll).
  _wireSteps(chap, key) {
    const steps = chap.querySelectorAll(".scroller__step");
    if (!steps.length) return;
    const prev = this._scrollerByKey.get(key);
    if (prev) { try { prev.destroy(); } catch (e) { /* older scrollama: no destroy */ } }
    const scroller = scrollama();
    scroller.setup({ step: steps, offset: 0.55, progress: false })
      .onStepEnter(({ element, index }) => {
        chap.querySelectorAll(".scroller__step").forEach(s => s.classList.remove("is-active"));
        element.classList.add("is-active");
        this._updateDock(element);
        const chart = this.charts[key];
        if (chart && chart.rendered && typeof chart.onStep === "function") chart.onStep(index, element);
      });
    this._scrollerByKey.set(key, scroller);
  }

  // [R2·1b] Mobile step-dock — a single fixed card at the bottom mirroring the active step's
  // content, so on phones/tablets exactly one card shows below the sticky chart (never over it).
  _isMobile() { return matchMedia("(max-width: 1024px)").matches; }
  _ensureDock() {
    if (this._dock) return this._dock;
    const d = document.createElement("div");
    d.className = "mobile-step-dock";
    d.setAttribute("aria-hidden", "true");
    document.body.appendChild(d);
    this._dock = d;
    return d;
  }
  _updateDock(stepEl) {
    if (!this._isMobile()) return;
    // Empty/dwell spacer steps carry no caption — hide rather than show a blank card.
    const hasContent = stepEl && !stepEl.classList.contains("scroller__step--dwell") && stepEl.textContent.trim().length;
    if (!hasContent) { this._hideDock(); return; }
    const d = this._ensureDock();
    d.innerHTML = stepEl.innerHTML;
    d.classList.add("is-shown");
  }
  _hideDock() { if (this._dock) this._dock.classList.remove("is-shown"); }
}
