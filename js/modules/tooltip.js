/* ============================================================
   Tooltip — singleton DOM tooltip with positioning + arrow.
   ============================================================ */

export class Tooltip {
  constructor() {
    this.el = document.createElement("div");
    this.el.className = "tooltip";
    this.el.setAttribute("role", "tooltip");
    // [FULL-SITE AUDIT a11y] The empty tooltip has role="tooltip" with no accessible
    // name (Lighthouse aria-tooltip-name fail). It's a visual hover aid that duplicates
    // data already exposed in the chart, so hide it from the a11y tree until shown.
    this.el.setAttribute("aria-hidden", "true");
    document.body.appendChild(this.el);
    this.visible = false;
  }

  show(html, x, y) {
    this.el.innerHTML = html;
    this.el.classList.add("visible");
    this.el.setAttribute("aria-hidden", "false");
    this.visible = true;
    this.move(x, y);
  }

  move(x, y) {
    if (!this.visible) return;
    // position above + slightly right of cursor; flip if needed
    const r = this.el.getBoundingClientRect();
    const pad = 14;
    let left = x + pad;
    let top  = y - r.height - pad;
    if (left + r.width > innerWidth - 8) left = x - r.width - pad;
    if (top < 8) top = y + pad;
    this.el.style.left = left + "px";
    this.el.style.top  = top  + "px";
  }

  hide() {
    this.el.classList.remove("visible");
    this.el.setAttribute("aria-hidden", "true");
    this.visible = false;
  }

  /** Helper to attach pointer events to a D3 selection. */
  attach(selection, htmlFn) {
    selection
      .on("mouseenter.tt", (event, d) => this.show(htmlFn(d, event), event.clientX, event.clientY))
      .on("mousemove.tt",  (event)    => this.move(event.clientX, event.clientY))
      .on("mouseleave.tt", ()         => this.hide())
      .on("focus.tt",      (event, d) => {
        const r = event.currentTarget.getBoundingClientRect();
        this.show(htmlFn(d, event), r.left + r.width / 2, r.top);
      })
      .on("blur.tt", () => this.hide());
  }
}
