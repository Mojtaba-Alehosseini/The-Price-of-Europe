/* ============================================================
   InfoPop — AMENDMENT-2 §C. A singleton info-popover for clickable chart labels.
   Click a flagged label → a small card (≤240px) auto-placed on the side of the label
   with the most room; close ×; fades+rises (--dur-3 --ease-out); auto-dismisses after
   5s (timer pauses while hovered; reduced-motion → no auto-dismiss, close only).
   Opening one closes any other. Esc closes. One card element for the whole page.
   ============================================================ */

class InfoPop {
  constructor() {
    this.el = document.createElement("div");
    this.el.className = "infopop";
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-live", "polite");
    this.el.hidden = true;
    this.el.innerHTML =
      `<button type="button" class="infopop__close" aria-label="Close">×</button>` +
      `<p class="infopop__text"></p>`;
    document.body.appendChild(this.el);
    this._textEl = this.el.querySelector(".infopop__text");
    this.el.querySelector(".infopop__close").addEventListener("click", () => this.close());
    this.el.addEventListener("mouseenter", () => this._pause());
    this.el.addEventListener("mouseleave", () => this._resume());
    this._onKey = (e) => { if (e.key === "Escape") this.close(); };
    this._anchor = null; this._timer = null; this._remaining = 5000; this._t0 = 0;
  }

  _reduced() { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }

  // Make a label (SVG or HTML node) a clickable info trigger. `color` styles the dotted underline.
  flag(node, text, color) {
    if (!node || node.dataset?.ipWired === "1") return;
    node.dataset && (node.dataset.ipWired = "1");
    node.style.cursor = "help";
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", `${(node.textContent || "").trim()} — more info`);
    node.classList.add("infopop-trigger");
    if (color) node.style.setProperty("--ipu", color);
    const open = (e) => { e.preventDefault(); e.stopPropagation(); this.open(node, text); };
    node.addEventListener("click", open);
    node.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") open(e); });
  }

  open(anchor, text) {
    const wasOpen = !this.el.hidden && this._anchor === anchor;
    this.close();
    if (wasOpen) return;                 // toggle off if re-clicking the same anchor
    this._anchor = anchor;
    // Card text is always an authored, hardcoded string (never user/data-derived) — safe to render
    // as HTML on the rare cards that embed a verbatim <a>; every other card keeps the plain-text path.
    if (/<a\s/i.test(text)) this._textEl.innerHTML = text; else this._textEl.textContent = text;
    this.el.hidden = false;
    this._place(anchor);
    if (this._reduced()) { this.el.classList.add("is-in"); }
    else { this.el.classList.remove("is-in"); requestAnimationFrame(() => this.el.classList.add("is-in")); }
    document.addEventListener("keydown", this._onKey);
    this._start();
  }

  _place(anchor) {
    this.el.style.left = "-9999px"; this.el.style.top = "0px";   // measure off-screen
    const r = anchor.getBoundingClientRect();
    const pw = this.el.offsetWidth || 240, ph = this.el.offsetHeight || 90, gap = 9;
    const room = { below: innerHeight - r.bottom, above: r.top, right: innerWidth - r.right, left: r.left };
    const side = Object.entries(room).sort((a, b) => b[1] - a[1])[0][0];
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let x, y;
    if (side === "below") { y = r.bottom + gap; x = cx - pw / 2; }
    else if (side === "above") { y = r.top - gap - ph; x = cx - pw / 2; }
    else if (side === "right") { x = r.right + gap; y = cy - ph / 2; }
    else { x = r.left - gap - pw; y = cy - ph / 2; }
    x = Math.max(8, Math.min(innerWidth - pw - 8, x));
    y = Math.max(8, Math.min(innerHeight - ph - 8, y));
    this.el.style.left = x + "px"; this.el.style.top = y + "px";
  }

  _start() {
    this._clear();
    if (this._reduced()) return;         // no auto-dismiss under reduced motion
    this._remaining = 5000; this._t0 = performance.now();
    this._timer = setTimeout(() => this.close(), this._remaining);
  }
  _pause() { if (this._timer) { clearTimeout(this._timer); this._remaining -= (performance.now() - this._t0); this._timer = null; } }
  _resume() { if (this.el.hidden || this._reduced() || this._timer) return; this._t0 = performance.now(); this._timer = setTimeout(() => this.close(), Math.max(0, this._remaining)); }
  _clear() { if (this._timer) { clearTimeout(this._timer); this._timer = null; } }

  close() {
    this._clear();
    this.el.classList.remove("is-in");
    this.el.hidden = true;
    this._anchor = null;
    document.removeEventListener("keydown", this._onKey);
  }
}

let _instance = null;
export function getInfoPop() { return _instance || (_instance = new InfoPop()); }
