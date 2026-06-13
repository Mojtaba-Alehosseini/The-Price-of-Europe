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
    this.scrollers = [];
    this.mounted = new Set();
    this._dock = null;            // [R2·1b] fixed mobile step-dock element
    this._visibleChapters = new Set();
    this.progressEl = document.getElementById("scroll-progress");
    this._setupScrollProgress();
    this._setupHeader();
  }

  init() {
    if (typeof scrollama === "undefined") {
      // scrollama not yet loaded — try again on next tick
      return requestAnimationFrame(() => this.init());
    }

    document.querySelectorAll(".chapter").forEach(chap => this._wireChapter(chap));
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

    // scrollama for step events
    const scroller = scrollama();
    scroller
      .setup({
        step: chap.querySelectorAll(".scroller__step"),
        offset: 0.55,
        progress: false
      })
      .onStepEnter(({ element, index }) => {
        chap.querySelectorAll(".scroller__step").forEach(s => s.classList.remove("is-active"));
        element.classList.add("is-active");
        this._updateDock(element);   // [R2·1b] mirror the active step into the fixed mobile dock
        // chart may not be mounted/rendered yet on a fast scroll — guard on the live instance
        const chart = this.charts[key];
        if (chart && chart.rendered && typeof chart.onStep === "function") {
          chart.onStep(index, element);
        }
      });

    // [R2·1b] Track chapter visibility so the mobile dock hides on hero / dividers / methodology.
    const visIO = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) this._visibleChapters.add(key);
        else this._visibleChapters.delete(key);
      });
      if (this._visibleChapters.size === 0) this._hideDock();
    }, { threshold: 0.01 });
    visIO.observe(chap);

    this.scrollers.push(scroller);
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

  _setupScrollProgress() {
    if (!this.progressEl) return;
    let raf = null;
    const update = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const p = max <= 0 ? 0 : h.scrollTop / max;
      this.progressEl.style.setProperty("--scroll", p.toFixed(3));
      raf = null;
    };
    addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    update();
  }

  _setupHeader() {
    const hdr = document.getElementById("site-header");
    if (!hdr) return;
    let raf = null;
    const update = () => {
      hdr.dataset.scrolled = (scrollY > 8) ? "true" : "false";
      raf = null;
    };
    addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    update();
  }
}
