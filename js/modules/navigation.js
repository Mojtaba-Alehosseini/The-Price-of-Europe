/* ============================================================
   Navigation — active-section highlighting + smooth scrolling
   ============================================================ */

export class Navigation {
  constructor() {
    this.links = Array.from(document.querySelectorAll(".nav-pills a[data-nav]"));
    this.sections = this.links
      .map(a => document.querySelector(a.getAttribute("href")))
      .filter(Boolean);
    this._wireSmoothScroll();
    this._wireSpy();
  }

  _wireSmoothScroll() {
    this.links.forEach(a => {
      a.addEventListener("click", (e) => {
        const target = document.querySelector(a.getAttribute("href"));
        if (!target) return;
        e.preventDefault();
        const top = target.getBoundingClientRect().top + scrollY - 64;
        scrollTo({ top, behavior: "smooth" });
      });
    });
  }

  _wireSpy() {
    if (!("IntersectionObserver" in window) || this.sections.length === 0) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const id = e.target.id;
        this.links.forEach(a => {
          const match = a.getAttribute("href") === "#" + id;
          if (match) a.setAttribute("aria-current", "true");
          else a.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    this.sections.forEach(s => io.observe(s));
  }
}
