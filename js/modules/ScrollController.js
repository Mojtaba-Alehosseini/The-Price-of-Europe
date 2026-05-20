/* ============================================================
   ScrollController — wires scrollama to chart instances.
   - Each <article class="chapter" data-chart="<key>"> contains
     one scroller with steps + a sticky figure that mounts a chart.
   - We mount the chart on first enter, then forward step indices.
   ============================================================ */

export class ScrollController {
  constructor(charts, ctx) {
    this.charts = charts;
    this.ctx = ctx;
    this.scrollers = [];
    this.mounted = new Set();
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
    const chart = this.charts[key];
    if (!chart) return;

    // mount on first enter using IntersectionObserver — cheap, no scrollama needed
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && !this.mounted.has(key)) {
          this.mounted.add(key);
          try { chart.render(); } catch (err) { console.error(`Chart ${key} render failed`, err); }
          io.disconnect();
        }
      });
    }, { rootMargin: "100px 0px", threshold: 0.01 });
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
        // chart may not be mounted yet on a fast scroll — guard
        if (this.mounted.has(key) && typeof chart.onStep === "function") {
          chart.onStep(index, element);
        }
      });

    this.scrollers.push(scroller);
  }

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
