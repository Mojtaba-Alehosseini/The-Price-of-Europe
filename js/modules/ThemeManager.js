/* ============================================================
   ThemeManager — light / dark / system theme toggle
   Source of truth: <html data-theme="light|dark">
   User intent stored as <html data-theme-choice="light|dark|system">
   ============================================================ */

const STORAGE_KEY = "pricEU:theme";

export class ThemeManager {
  constructor() {
    this.listeners = new Set();
    this.root = document.documentElement;

    // bootstrap script in index.html may already have set things
    this.choice = this.root.dataset.themeChoice || "system";
    this.applyEffective();

    // Toggle buttons
    document.querySelectorAll("[data-theme-set]").forEach(btn => {
      btn.addEventListener("click", () => this.set(btn.dataset.themeSet));
    });
    this.updateToggleUI();

    // React to OS changes when in 'system'
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (this.choice === "system") this.applyEffective();
    });
  }

  set(choice) {
    if (!["light", "dark", "system"].includes(choice)) return;
    this.choice = choice;
    try { localStorage.setItem(STORAGE_KEY, choice); } catch (e) { /* ignore */ }
    this.root.dataset.themeChoice = choice;
    this.applyEffective();
    this.updateToggleUI();
  }

  applyEffective() {
    const sysDark = matchMedia("(prefers-color-scheme: dark)").matches;
    const eff = this.choice === "system" ? (sysDark ? "dark" : "light") : this.choice;
    if (eff === "dark") this.root.setAttribute("data-theme", "dark");
    else this.root.setAttribute("data-theme", "light");

    // Update meta theme-color
    const c = getComputedStyle(this.root).getPropertyValue("--bg").trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", c));

    this.effective = eff;
    this.listeners.forEach(fn => fn(eff));
  }

  updateToggleUI() {
    document.querySelectorAll("[data-theme-set]").forEach(btn => {
      btn.setAttribute("aria-pressed", btn.dataset.themeSet === this.choice ? "true" : "false");
    });
  }

  /** Subscribe to effective-theme changes ("light" | "dark"). Returns unsubscribe fn. */
  onChange(fn) {
    this.listeners.add(fn);
    fn(this.effective);                 // immediate fire
    return () => this.listeners.delete(fn);
  }

  /** Read a CSS custom property — useful for D3 interpolators */
  token(name) {
    return getComputedStyle(this.root).getPropertyValue(name).trim();
  }
}
