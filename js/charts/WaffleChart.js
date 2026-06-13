/* ============================================================
   WaffleChart — 10×10 grid: how much of a 2019 €100 still buys today.
   Each cell = €1 of January-2019 purchasing power. Solid (terracotta,
   severity-tinted) cells survived; ghosted/hatched cells were eroded by
   inflation. The hero is the big italic Fraunces survivor number; the
   accent loss-delta + one-line stamp name what's gone.

   Depth:
     1. computation — index ratio (2019-01 / latest) × 100, per (geo, coicop)
     2. interaction — country + category picker; cell hover/tap teaching tooltip
     3. annotation — Fraunces kicker + accent "−€N gone" + stamp sentence + legend
     4. encoding   — waffle (part-to-whole), severity-tinted survivors, eroded ghosts
     5. motion     — first reveal erodes €100 → €N top-down; cycles MORPH the
                     waterline (cells flip + pulse) instead of rebuilding the grid

   Award-pass [R2-elevate]: split render() into a persistent scaffold +
   _update() so country/category changes morph the same cells (no blotchy
   full-grid re-fade); animated kicker; severity tint; eroded "ghost" cells;
   live hover/tap tooltip; tighter editorial rhythm. — see docs round-2.
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { watchChapterProgress } from "../modules/ChartMotion.js";

const CYCLE_COUNTRY  = ["DE", "EE", "HU"];          // Germany → Estonia → Hungary (worst)
const CYCLE_CATEGORY = ["SERV", "CP01", "CP045"];   // services (best) → food → electricity & gas (worst)

export class WaffleChart extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 18, right: 16, bottom: 18, left: 16 }, aspect: 1.0 });
    this.country = "EU27_2020";
    this.category = "CP00";
    this.controlsEl = document.getElementById("chart-waffle-controls");
    this._firstReveal = true;   // the very first paint erodes €100 → €N
    this._lastFill = null;      // previous survivor count (drives morph direction)
    // [R3-motion] scroll-driven phase state replaces the old wall-clock setInterval cycles.
    // The spread (DE→EE→HU, then SERV→CP01→CP045) now advances with the READER'S scroll,
    // not a 2.1 s timer — so the same scroll-y always shows the same state (no hysteresis),
    // reverse-scroll walks it back, and reduced-motion users get no autonomous motion.
    this._phaseSet = "eu";      // "eu" | "country" | "category" — which spread the active step drives
    this._activeStepEl = null;  // the live <div.scroller__step> for the active cycling step
    this._userOverride = false; // a manual control pick suspends scroll-phase until the next step enter
    this._appliedKey = null;    // last (country|category) applied — guards _update against re-fire
  }

  // Fill the sticky panel: square waffle + a hero block above it. We read the
  // available height so the block doesn't float in a tall empty panel.
  size() {
    if (!this.container) return { width: 600, height: 600 };
    const w = this.container.clientWidth || 600;
    const hAvail = this.container.clientHeight || 0;
    const hMin = Math.round(w / this.opts.aspect);
    return { width: w, height: Math.max(440, hAvail || hMin) };
  }

  // ---- data ----------------------------------------------------------
  _value(geo, cat) {
    const series = this.data.hicpIndex[geo]?.[cat];
    if (!series) return null;
    const keys = Object.keys(series).sort();
    const p0 = series["2019-01"];
    const p1 = series[keys.at(-1)];
    if (p0 == null || !p1) return null;   // !p1 also rejects 0 (avoids Infinity euro)
    return { euro: Math.max(0, (p0 / p1) * 100), last: keys.at(-1) };
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    const { width: iw } = this.innerSize();
    const isPhone = width < 460;

    // ---- geometry: hero block (top) + square waffle (below) ----------
    const cols = 10, rows = 10, N = 100;
    const heroH    = isPhone ? 96 : 118;   // kicker + delta + stamp sentence
    const legendH  = 26;                    // inline "kept / lost" key
    const captionH = this.country !== "EU27_2020" ? 42 : 24;
    const innerH   = height - this.opts.margin.top - this.opts.margin.bottom;
    // Grid is square, sized to the smaller of width and the height left after text rows.
    const gridMax  = Math.min(iw, innerH - heroH - legendH - captionH);
    const size = Math.max(10, gridMax / cols * 0.88);
    const gap  = Math.max(3, size * 0.12);
    const grid = cols * size + (cols - 1) * gap;
    const startX = (iw - grid) / 2;

    // Vertically pack the whole block, then nudge a touch above centre so the
    // hero number sits where the eye lands first.
    const blockH = heroH + legendH + grid + captionH;
    const top0 = Math.max(0, (innerH - blockH) / 2 - innerH * 0.02);
    const heroY    = top0;
    const legendY  = heroY + heroH;
    const gridY    = legendY + legendH;
    const captionY = gridY + grid;

    // stash geometry for _update + hover
    this._geo = { cols, rows, N, size, gap, grid, startX, gridY, isPhone, heroY, gridCenterX: startX + grid / 2 };

    // ---- defs: ghost hatch for eroded cells (chart-scoped, rebuilt each render) ----
    const defs = this.svg.append("defs");
    const hatch = defs.append("pattern")
      .attr("id", "waffle-erode-hatch")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 5).attr("height", 5)
      .attr("patternTransform", "rotate(45)");
    hatch.append("rect").attr("class", "waffle-hatch-bg").attr("width", 5).attr("height", 5);
    hatch.append("line").attr("class", "waffle-hatch-line")
      .attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 5);

    // ---- hero block: kicker + accent loss-delta + stamp sentence -----
    this.hero = this.g.append("g").attr("class", "waffle-hero").attr("pointer-events", "none");
    this.kickerNum = this.hero.append("text").attr("class", "waffle-kicker year-kicker")
      .attr("x", startX).attr("y", heroY + (isPhone ? 44 : 54));
    this.kickerDelta = this.hero.append("text").attr("class", "waffle-delta")
      .attr("x", startX).attr("y", heroY + (isPhone ? 70 : 84));
    this.kickerSentence = this.hero.append("text").attr("class", "waffle-stamp-sentence")
      .attr("x", startX).attr("y", heroY + (isPhone ? 90 : 108));

    // top-right unit label (legend-title system, shared with sibling charts)
    this.hero.append("text").attr("class", "legend-title")
      .attr("x", startX + grid).attr("y", heroY + 12).attr("text-anchor", "end")
      .text("OF €100 IN JAN 2019");

    // ---- inline legend (kept / lost) — persistent, text updated in _update ----
    this.legendG = this.g.append("g").attr("class", "waffle-legend").attr("pointer-events", "none");
    const sw = 11;
    this.legendKept = { g: this.legendG.append("g") };
    this.legendKept.g.append("rect").attr("class", "waffle-legend-swatch waffle-legend-swatch--on")
      .attr("x", startX).attr("y", legendY).attr("width", sw).attr("height", sw).attr("rx", 2);
    this.legendKept.t = this.legendKept.g.append("text").attr("class", "waffle-legend-text")
      .attr("x", startX + sw + 6).attr("y", legendY + sw - 1);
    this.legendLost = { g: this.legendG.append("g") };
    this.legendLost.g.append("rect").attr("class", "waffle-legend-swatch waffle-legend-swatch--off")
      .attr("x", startX + grid * 0.52).attr("y", legendY).attr("width", sw).attr("height", sw).attr("rx", 2)
      .attr("fill", "url(#waffle-erode-hatch)");   // legend matches the eroded ghost
    this.legendLost.t = this.legendLost.g.append("text").attr("class", "waffle-legend-text")
      .attr("x", startX + grid * 0.52 + sw + 6).attr("y", legendY + sw - 1);

    // ---- cells (persistent rects, bottom-up idx) ---------------------
    const cells = d3.range(N).map(i => {
      const col = i % cols, row = Math.floor(i / cols);
      return { i, col, row, idx: (rows - 1 - row) * cols + col };
    });
    this.cellSel = this.g.selectAll("rect.waffle-cell").data(cells, d => d.i).join("rect")
      .attr("class", "waffle-cell")
      .attr("x", d => startX + d.col * (size + gap))
      .attr("y", d => gridY + d.row * (size + gap))
      .attr("width", size).attr("height", size).attr("rx", 2)
      .style("transform-box", "fill-box").style("transform-origin", "center");

    // hover/tap teaching tooltip (round-1 dead state → live)
    this._wireCellTooltip();

    // ---- caption + EU compare (persistent, text updated in _update) ----
    this.captionT = this.g.append("text").attr("class", "waffle-caption")
      .attr("x", iw / 2).attr("y", captionY + 18).attr("text-anchor", "middle");
    this.compareT = this.g.append("text").attr("class", "waffle-compare")
      .attr("x", iw / 2).attr("y", captionY + 38).attr("text-anchor", "middle");

    // first paint
    this._lastFill = null;
    this._appliedKey = `${this.country}|${this.category}`;
    this._update({ firstPaint: true });
    this._renderControls();

    // [R3-motion] subscribe ONCE to continuous chapter scroll progress. Inside a cycling
    // step, the reader's scroll position (not a timer) selects the phase. render() can run
    // again (theme/resize) so tear the old watcher down first — never stack listeners.
    this._unsub && this._unsub();
    const chapter = this.container.closest(".chapter");
    this._unsub = watchChapterProgress(chapter, () => this._syncScrollPhase());
  }

  // ---- scroll-driven phase: map the active cycling step's own viewport progress
  //      to a discrete spread phase. Self-calibrating off the live step element, so it
  //      is immune to chapter-geometry drift and identical every visit to the same scroll-y.
  _syncScrollPhase(force = false) {
    if (!this.cellSel || this._userOverride) return;
    const set = this._phaseSet;
    if (set !== "country" && set !== "category") return;
    const el = this._activeStepEl;
    if (!el) return;
    // Spread the 3 phases across this step's ACTIVE travel so phase 0 shows the moment the
    // step takes over (scrollama's 0.55 offset → step top ≈ 0.55·vh) and the last phase is
    // reached as the step scrolls off the top. Equal-width plateaus → captures land settled,
    // and the anchor phase (Germany / Services) is never skipped.
    const r = el.getBoundingClientRect();
    const vh = innerHeight || 800;
    const t = Math.max(0, Math.min(0.999, (vh * 0.55 - r.top) / (vh * 0.62)));
    const phases = set === "country" ? CYCLE_COUNTRY : CYCLE_CATEGORY;
    const idx = Math.floor(t * phases.length);
    const next = phases[idx];
    const axis = set === "country" ? "country" : "category";
    if (this[axis] !== next || force) {
      this[axis] = next;
      this._update();   // _update is idempotency-guarded, so a forced no-change call is cheap
    }
  }

  // ---- update: morph cells + tween kicker on (geo/cat) change --------
  _update({ firstPaint = false } = {}) {
    if (!this.cellSel) return;
    // [R3-motion · #A idempotency] If neither country nor category actually changed,
    // the visual is already correct — re-running would restart the kicker tween and
    // re-morph settled cells (the blink/replay scrollama re-fires would cause). No-op.
    const key = `${this.country}|${this.category}`;
    if (!firstPaint && key === this._appliedKey) { this._syncControls(); return; }
    this._appliedKey = key;
    const reduced = this.ctx.motion.reduced;
    const v = this._value(this.country, this.category);
    const euro = v ? v.euro : null;
    const fillN = euro == null ? 0 : Math.round(euro);
    const lostN = 100 - fillN;

    // palette read at draw time (tokens only). Survivors hold the chart's
    // signature terracotta; severity is encoded by HOW MANY cells erode, so we
    // keep the accent constant (accent restraint) rather than ramping fills.
    const css = getComputedStyle(document.documentElement);
    const onCol = css.getPropertyValue("--accent").trim();

    // mark cells on/off against the NEW waterline
    this.cellSel.each(function (d) { d._on = d.idx < fillN; });

    const prevFill = this._lastFill;
    const waterline = fillN;   // cells crossing this line animate
    const sz = this._geo.size;

    const applyOn  = (sel) => sel.attr("class", "waffle-cell waffle-cell--on").style("fill", onCol).attr("fill", onCol);
    const applyOff = (sel) => sel.attr("class", "waffle-cell waffle-cell--off").style("fill", null).attr("fill", "url(#waffle-erode-hatch)");

    if (firstPaint && this._firstReveal && !reduced) {
      // Signature reveal: start with ALL €100 standing, then erode the top
      // (100−fillN) cells top-down so the reader watches purchasing power burn away.
      this.cellSel.each(function (d) {
        const el = d3.select(this);
        applyOn(el).attr("opacity", 0);
      });
      // fade the whole standing stack up bottom-first
      this.cellSel.transition("appear").duration(420).delay(d => (99 - d.idx) * 3).attr("opacity", 1)
        .on("end", (d, i, nodes) => {
          if (i !== nodes.length - 1) return;
          // then erode: eroded cells dissolve from the very top down
          const eroded = this.cellSel.filter(c => !c._on);
          eroded.transition("erode").duration(360)
            .delay(c => (c.idx - fillN) * 26 + 220)
            .style("fill", css.getPropertyValue("--rule").trim())
            .on("end", function () { applyOff(d3.select(this)); });
        });
    } else if (reduced) {
      // static correct end-state
      this.cellSel.each(function (d) {
        const el = d3.select(this);
        d._on ? applyOn(el).attr("opacity", 1) : applyOff(el).attr("opacity", 1);
      });
    } else if (prevFill == null) {
      // non-animated first paint fallback (e.g. re-render after resize)
      this.cellSel.each(function (d) {
        const el = d3.select(this);
        d._on ? applyOn(el).attr("opacity", 1) : applyOff(el).attr("opacity", 1);
      });
    } else {
      // MORPH: only cells between old & new waterline flip; pulse them so the
      // change reads as the water rising (recovering) or receding (more lost).
      const lo = Math.min(prevFill, fillN), hi = Math.max(prevFill, fillN);
      this.cellSel.each(function (d) {
        const el = d3.select(this);
        const flips = d.idx >= lo && d.idx < hi;
        if (!flips) {
          el.attr("opacity", 1);   // unchanged cell: leave it be
          return;
        }
        const delay = Math.abs(d.idx - waterline) * 22;
        el.interrupt();
        if (d._on) {
          // becoming a survivor: pop in with the survivor colour
          applyOn(el);
          el.attr("opacity", 0.25).style("transform", "scale(0.6)")
            .transition("flip").delay(delay).duration(360).ease(d3.easeBackOut)
            .attr("opacity", 1).style("transform", "scale(1)");
        } else {
          // being eroded: shrink + cross-fade to ghost hatch
          el.transition("flip").delay(delay).duration(300)
            .style("transform", "scale(0.55)").attr("opacity", 0.0)
            .on("end", function () {
              applyOff(d3.select(this));
              d3.select(this).transition("flipback").duration(300)
                .attr("opacity", 1).style("transform", "scale(1)");
            });
        }
      });
    }

    // safety net — force final state if transitions don't tick (background tabs)
    if (this._cellsSafety) clearTimeout(this._cellsSafety);
    const self = this;
    this._cellsSafety = setTimeout(() => {
      self.cellSel.each(function (d) {
        const s = d3.select(this);
        if (s.attr("opacity") !== "1" || s.style("transform")) {
          s.interrupt().attr("opacity", 1).style("transform", null);
          d._on ? applyOn(s) : applyOff(s);
        }
      });
    }, 1600);

    this._lastFill = fillN;
    if (firstPaint && this._firstReveal) this._firstReveal = false;

    // ---- hero text (animated kicker) ----
    const countryDisplay = this.country === "EU27_2020" ? "EU-27 average" : (this.data.countryName(this.country) || this.country);
    const sub = `${countryDisplay} · ${this.data.categoryLabel(this.category)}`;
    this.kickerDelta.text(euro == null ? "" : `−€${lostN} gone`);
    this.kickerSentence.text(sub);
    this.legendKept.t.text(`${fillN} survive`);
    this.legendLost.t.text(`${lostN} eroded since 2019`);
    this.captionT.text(`Jan 2019 → ${v ? v.last : "latest"}`);

    // animate the big number from prev → new (Pudding "kicker animates on change")
    const target = euro == null ? null : fillN;
    if (target == null) {
      this.kickerNum.text("—");
    } else if (reduced || prevFill == null) {
      this.kickerNum.text(`€${target}`);
    } else {
      if (this._kickerTween) this._kickerTween.cancel();
      // [R3-motion · #3] match the cell-morph duration (~360 ms) so the big number and the
      // grid/legend settle together — shrinks the window where the kicker disagrees with
      // the "N survive" legend during a scroll-triggered phase change.
      this._kickerTween = this.ctx.motion.tween({
        from: prevFill, to: target, duration: 380, ease: "outCubic",
        onTick: val => this.kickerNum.text(`€${Math.round(val)}`)
      });
    }

    // EU-27 compare row (only for a specific country)
    if (this.country !== "EU27_2020") {
      const euv = this._value("EU27_2020", this.category);
      this.compareT.text(euv ? `EU-27 average: €${Math.round(euv.euro)}` : "");
    } else {
      this.compareT.text("");
    }

    this._syncControls();
  }

  // ---- hover / tap teaching tooltip ----------------------------------
  _wireCellTooltip() {
    const tip = this.ctx.tooltip;
    if (!tip) return;
    const self = this;
    const html = (d) => {
      const n = d.idx + 1;                       // 1..100 from the floor
      const survived = d._on;
      const where = self.country === "EU27_2020" ? "EU-27 avg" : self.data.countryName(self.country);
      return `
        <h5>${survived ? "Still buys today" : "Eroded by inflation"}</h5>
        <div class="row"><span class="key">Euro #${n} of €100</span><span class="val">${survived ? "survives" : "gone"}</span></div>
        <div class="row"><span class="key">${where} · ${self.data.categoryLabel(self.category)}</span></div>`;
    };
    this.cellSel
      .on("mouseenter.tt", (event, d) => tip.show(html(d), event.clientX, event.clientY))
      .on("mousemove.tt",  (event)    => tip.move(event.clientX, event.clientY))
      .on("mouseleave.tt", ()         => tip.hide())
      // touch parity — a tap delivers the same info as hover
      .on("pointerdown.tt", (event, d) => {
        if (event.pointerType === "touch") tip.show(html(d), event.clientX, event.clientY);
      });
  }

  // ---- controls ------------------------------------------------------
  _syncControls() {
    const c = this.controlsEl;
    if (!c || c.dataset.wired !== "1") return;
    const s1 = c.querySelector('[data-w-country]');
    const s2 = c.querySelector('[data-w-cat]');
    if (s1 && s1.value !== this.country) s1.value = this.country;
    if (s2 && s2.value !== this.category) s2.value = this.category;
  }

  _renderControls() {
    const c = this.controlsEl;
    if (!c) return;
    if (c.dataset.wired === "1") { this._syncControls(); return; }
    c.dataset.wired = "1";

    const allCountries = ["EU27_2020", ...this.data.euCodes()].filter(code =>
      Object.keys(this.data.hicpIndex[code]?.CP00 || {}).length > 0);
    const allCats = ["CP00", "CP01", "CP045", "NRG", "SERV"];

    const optCountry = allCountries.map(code => `<option value="${code}" ${code === this.country ? "selected" : ""}>${code === "EU27_2020" ? "EU-27 avg" : this.data.countryName(code)}</option>`).join("");
    const optCat = allCats.map(cat => `<option value="${cat}" ${cat === this.category ? "selected" : ""}>${this.data.categoryLabel(cat)}</option>`).join("");

    c.innerHTML = `
      <label class="waffle-ctrl">Country
        <select data-w-country>${optCountry}</select>
      </label>
      <label class="waffle-ctrl">Basket
        <select data-w-cat>${optCat}</select>
      </label>
    `;
    // A manual pick suspends the scroll-driven phase so the reader's choice sticks until
    // they scroll into the next step (which re-arms the relevant spread).
    c.querySelector('[data-w-country]').addEventListener("change", e => { this.country = e.target.value; this._userOverride = true; this._update(); });
    c.querySelector('[data-w-cat]').addEventListener("change", e => { this.category = e.target.value; this._userOverride = true; this._update(); });
  }

  // [R3-motion] onStep now only ARMS which spread the active step drives; the actual
  // phase is then selected continuously by _syncScrollPhase off the reader's scroll.
  // Idempotent: re-entering the same step re-points _activeStepEl and re-applies the
  // anchor state, but _update no-ops if nothing changed (no blink on scrollama re-fire).
  // Step 1 cycles Germany → Estonia → Hungary (basket pinned to All-items).
  // Step 2 cycles services → food → electricity & gas (country pinned to EU-27).
  onStep(idx, element) {
    this._userOverride = false;            // entering any step re-arms scroll control
    this._activeStepEl = element || null;
    if (idx === 0) {
      this._phaseSet = "eu";
      this.country = "EU27_2020"; this.category = "CP00";
      this._update();
    } else if (idx === 1) {
      this._phaseSet = "country";
      this.category = "CP00";              // basket pinned; country resolved from scroll
      this._syncScrollPhase(true);         // pick the phase for the current scroll position now
    } else if (idx === 2) {
      this._phaseSet = "category";
      this.country = "EU27_2020";          // country pinned; basket resolved from scroll
      this._syncScrollPhase(true);
    }
  }

  destroy() {
    if (this._kickerTween) this._kickerTween.cancel();
    if (this._cellsSafety) clearTimeout(this._cellsSafety);
    super.destroy?.();                     // cancels the watchChapterProgress subscription via this._unsub
  }

  onThemeChange() { this.render(); }
}
