/* ============================================================
   WaffleChart — CH6 "The kitchen table" (D87 semantics + step-echo redesign).
   Two columns in one body:
     LEFT  — the 100-cell waffle: a KEPT euro is a solid warm-gold coin-like tile; a LOST euro is
             a hollow socket (transparent + thin ink-fainter ring). Claret is reserved for the
             MOMENT OF TAKING — the erosion's own flash and the step-echo pulse on the bars —
             never a resting-state colour. Own mini-header + legend + attached kicker travel with
             the grid between its two positions (D86: centered alone at step 0, left column from
             step 1 on, scale 0.92).
     RIGHT — the hero's six basket lines as paired 2019→NOW bars, each in its own locked --cat-*
             colour, with an OWN reserved label gutter so a label can never cross into the waffle.
   Choreography: step 0 activation plays the erosion ONCE — grid starts full gold (100), lost
   cells die top-row-first (claret flash → hollow), kicker counts down in sync, ~1.2s for the EU
   case. Step 1 = D86's waffle-glide + bar-cascade (unchanged). Step 2 / any country-picker change
   = the DELTA re-erodes (die-with-flash if worse, silent refill if better) while bars re-scale,
   kicker counts to the new value — all timed on entry, same speed scroll or rail-jump, never
   scroll-scrubbed. Step-echo: steps citing specific basket lines (`data-echo="rent,groceries"`)
   pulse those bar pairs once, tied to their own animation's completion, never a fixed timer.
   Reduced motion: instant final state of the active step throughout.
   Key stays `waffle` in the factory (brief allows).
   ============================================================ */

import { BaseChart } from "./BaseChart.js";

const BASKET = [
  { cat: "CP04",  label: "Rent & water",       base: 30 },
  { cat: "CP01",  label: "Groceries",          base: 22 },
  { cat: "SERV",  label: "Services",           base: 15 },
  { cat: "CP07",  label: "Petrol & transport", base: 14 },
  { cat: "CP045", label: "Electricity & gas",  base: 10 },
  { cat: "CP11",  label: "Café & restaurants", base: 9  },
];
const START = "2019-01";
const WF_SCALE     = 0.92;   // split-mode waffle scale, relative to its solo (centered-alone) size
const WF_MOVE_MS   = 600;    // waffle glide (enter split) / bars re-scale (country change) / return (exit split)
const BAR_RETRACT_MS  = 280;
const BAR_STAGGER_MS  = 60;  // per-row cascade delay on first entry into split mode
const BAR_GROW_MS     = 420; // each bar's own grow duration
const BAR_NOW_DELAY_MS = 150; // the NOW bar starts this long after its own row's 2019 bar

// [D87] erosion timing — 25ms stagger and 120ms flash are the owner's own literal numbers;
// SETTLE is derived so the EU reference case (23 lost cells) lands at the owner's stated ~1.2s
// total: 22 gaps * 25ms + 120ms flash + 530ms settle = 1200ms exactly. SETTLE must match the
// .waffle-cell--on/--off transition duration in charts.css — that CSS transition is what actually
// carries the fade from flash to hollow (or off to gold on a refill); this constant only drives
// how long the KICKER keeps counting, so the number finishes exactly when the last tile does.
// One shared stagger for both directions — a die and a refill in the SAME batch (only possible
// after a rapid re-trigger interrupts a still-mid-flight erosion) must share one timeline.
const STAGGER_MS = 25;
const ERODE_FLASH_MS   = 120;
const ERODE_SETTLE_MS  = 530;
const REFILL_MS = 380;
const ECHO_PULSE_MS = 420;   // --dur-4, the owner's own named duration for the echo ring

// data-echo="rent,groceries" -> BASKET cat codes. Only "rent"/"groceries" are used by the owner's
// two steps today, but the full basket is mapped so the attribute can cover any line later without
// touching this file again.
const ECHO_MAP = { rent: "CP04", groceries: "CP01", services: "SERV", transport: "CP07", energy: "CP045", cafe: "CP11" };

export class WaffleChart extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 56, right: 20, bottom: 24, left: 20 }, aspect: 1.3 });
    this.geo = "EU27_2020";
    this.controlsEl = document.getElementById("chart-waffle-controls");
    this._mode = "solo";   // "solo" (step 0, waffle alone) | "split" (step 1+, two columns)
    this._shownN = null;   // the fill count CURRENTLY represented on screen (vs _fillN, the target)
    this._erosionSeq = 0;
    this._erosionTimers = [];
    this._erosionPlayed = false;
    this._echoCats = [];
  }

  size() {
    if (!this.container) return { width: 720, height: 560 };
    const w = this.container.clientWidth || 720;
    const h = this.container.clientHeight || Math.round(w / this.opts.aspect);
    // 200 is an anti-degenerate floor (a transient pre-layout frame reading ~0), not a "usual
    // minimum" — the phone sticky panel legitimately gives this chart ~300px of chart-body, and
    // clamping that up to some larger floor would make the SVG taller than its own container,
    // silently clipped by .chart-body's overflow:hidden (found via a broken phone screenshot).
    return { width: w, height: Math.max(200, h) };
  }

  // carry-forward guard (last known value at or before t) — matches ReceiptHero.
  _at(series, t) {
    if (!series) return null;
    if (series[t] != null) return series[t];
    const ks = Object.keys(series).filter(k => k <= t).sort();
    return ks.length ? series[ks.at(-1)] : null;
  }
  _lastMonth(geo) {
    const s = this.data.hicpIndex[geo]?.CP00 || {};
    const ks = Object.keys(s).filter(k => k <= "2025-12").sort();
    return ks.at(-1) || "2025-12";
  }
  // €100 CP00 purchasing power at end (77.1 EU, 61.1 HU).
  _power(geo) {
    const s = this.data.hicpIndex[geo]?.CP00; if (!s) return null;
    const b = this._at(s, START), e = this._at(s, this._lastMonth(geo));
    return (b && e) ? 100 * b / e : null;
  }
  // a basket line's Dec-2025 nominal value for geo.
  _lineVal(geo, cat, base) {
    const s = this.data.hicpIndex[geo]?.[cat]; if (!s) return null;
    const b = this._at(s, START), e = this._at(s, this._lastMonth(geo));
    return (b && e) ? base * e / b : null;
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const isPhone = this.size().width < 620;
    this._isPhone = isPhone;
    this.opts.margin = isPhone ? { top: 48, right: 14, bottom: 20, left: 14 } : { top: 56, right: 20, bottom: 24, left: 20 };
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    this.svg.attr("aria-label", "What €100 of 2019 still buys, priced for one country: on the left, a 100-tile grid where gold tiles are the euros that still buy the same and hollow tiles are the euros lost to prices; on the right, the six spending lines paired 2019 against now.");
    const M = this.opts.margin;
    const iw = width - M.left - M.right, ih = height - M.top - M.bottom;
    this._iw = iw; this._ih = ih;
    const contentY = M.top;

    // ── D86 two-column layout (unchanged shape). LEFT = waffle, fixed width min(42%,420px),
    // vertically centered. RIGHT = bars with their OWN reserved label gutter. Phone stacks. ──
    const gap = isPhone ? 20 : 34;
    const leftW = isPhone ? iw : Math.min(iw * 0.42, 420);
    const rightW = isPhone ? iw : iw - leftW - gap;
    const rightX0 = isPhone ? 0 : leftW + gap;
    const labelGutter = isPhone ? 104 : 140;
    const tagRoom = isPhone ? 54 : 66;
    const rowH = isPhone ? 38 : 44;
    const rowGap = isPhone ? 9 : 14;
    const totalBarsH = BASKET.length * rowH + (BASKET.length - 1) * rowGap;
    const titleGapH = isPhone ? 22 : 26;

    // [D87] the waffle now carries its own attached header + kicker (above) and legend (below) —
    // reserve fixed pixel headroom/footroom for them in the grid's OWN local coordinate space, so
    // the same reserved band applies at both scales (solo=1, split=0.92) via the group transform.
    // Baselines are stacked EXPLICITLY upward from the grid's own y=0, each a fixed clearance from
    // its neighbour, rather than dividing a chosen headroom total by formula — a formula like
    // "-wfHeadroom+62" only clears the grid for the desktop headroom it was tuned against; at
    // phone's smaller headroom the same offset lands PAST y=0 and the sub-line cuts into row 0
    // (found by reading a phone screenshot, not by inspecting the numbers).
    const kickSubY  = -8;                                     // baseline, clears the grid's own top edge
    const kickNumY  = kickSubY - (isPhone ? 26 : 36);          // clears kickSub's own ascender + a gap
    const titleY    = kickNumY - (isPhone ? 26 : 36);          // clears kickNum's own (larger) ascender + a gap
    const wfHeadroom = Math.round(-titleY + 10);
    const wfFootroom = isPhone ? 20 : 28;

    const cols = 10, rows = 10;
    let waffleSideBase, soloX, soloY, splitX, splitY, splitScale;
    if (isPhone) {
      splitScale = 1;
      // phone stacks waffle-then-bars (D86) rather than shrinking a second time (desktop's
      // split-mode 0.92): the grid keeps one constant size and only its Y position changes
      // between solo (centered in the full body) and split (pinned under the header, with the
      // bars' own reserved zone below it) — so size it to whatever's left ABOVE that bars zone,
      // not a flat 40%-of-height guess (which, before the panel got its own taller phone
      // block-size below, produced a barely-visible ~39px grid).
      const splitAvailH = ih - wfHeadroom - wfFootroom - titleGapH - totalBarsH;
      waffleSideBase = Math.max(100, Math.min(iw, splitAvailH));
      soloX = (iw - waffleSideBase) / 2;
      soloY = wfHeadroom + Math.max(0, (ih - wfHeadroom - wfFootroom - waffleSideBase) / 2);
      splitX = (iw - waffleSideBase) / 2;
      splitY = wfHeadroom;
    } else {
      splitScale = WF_SCALE;
      // largest square base grid that, once the attached header/kicker/legend are included, fits
      // BOTH the split-mode left column AND the solo-mode full body — see D87 design decision for
      // the derivation (three simultaneous constraints, take the tightest).
      const byWidthSplit = leftW / splitScale;
      const byHeightSplit = ih / splitScale - wfHeadroom - wfFootroom;
      const byHeightSolo = ih - wfHeadroom - wfFootroom;
      waffleSideBase = Math.max(120, Math.min(byWidthSplit, byHeightSplit, byHeightSolo));
      soloX = (iw - waffleSideBase) / 2;
      soloY = wfHeadroom + (ih - wfHeadroom - wfFootroom - waffleSideBase) / 2;
      const splitSide = waffleSideBase * splitScale;
      splitX = (leftW - splitSide) / 2;
      splitY = wfHeadroom * splitScale + (ih - (wfHeadroom + waffleSideBase + wfFootroom) * splitScale) / 2;
    }
    const cellPitch = waffleSideBase / cols;
    const cellGap = Math.max(2, cellPitch * 0.12);
    const cellSize = cellPitch - cellGap;
    this._waffle = { cols, rows, cellPitch, cellSize, base: waffleSideBase };
    this._waffleXform = {
      solo:  `translate(${soloX},${soloY}) scale(1)`,
      split: `translate(${splitX},${splitY}) scale(${splitScale})`,
    };

    const rowsTop = isPhone ? splitY + waffleSideBase * splitScale + wfFootroom + titleGapH : contentY + titleGapH;
    const rowsAvailBottom = height - M.bottom;
    const rowsAvailH = Math.max(totalBarsH, rowsAvailBottom - rowsTop);
    const barsGroupY = rowsTop + Math.max(0, (rowsAvailH - totalBarsH) / 2);
    const barsGroupX = M.left + (isPhone ? 0 : rightX0);
    const barsX = isPhone ? M.left : barsGroupX;
    const plotW = rightW - labelGutter - tagRoom;
    this._bars = { x: barsX, y: barsGroupY, w: rightW, labelGutter, plotW, rowH, rowGap };

    // ── waffle group: cells + attached header/kicker/legend, all in LOCAL coordinates
    // (0,0 = grid top-left at base scale) — the group's own transform positions/scales the
    // whole unit for either mode, so nothing inside it is ever repositioned per-mode. ──
    this._waffleG = this.g.append("g").attr("class", "wf-waffle-group");
    this._waffleG.append("text").attr("class", "wf-waffle-title")
      .attr("x", 0).attr("y", titleY).text("WHAT €100 OF 2019 STILL BUYS");
    this._kickNum = this._waffleG.append("text").attr("class", "kick-num")
      .attr("x", 0).attr("y", kickNumY).style("font-size", isPhone ? "30px" : "42px");
    this._kickSub = this._waffleG.append("text").attr("class", "wf-kick-sub")
      .attr("x", 0).attr("y", kickSubY).text("of your 2019 €100");

    const cellData = d3.range(100).map(i => { const col = i % cols, row = Math.floor(i / cols); return { i, col, row, idx: (rows - 1 - row) * cols + col }; });
    const wf = this._waffle;
    this._cells = this._waffleG.selectAll("rect.waffle-cell").data(cellData, d => d.i).join("rect")
      .attr("class", "waffle-cell")
      .attr("x", d => d.col * wf.cellPitch).attr("y", d => d.row * wf.cellPitch)
      .attr("width", wf.cellSize).attr("height", wf.cellSize).attr("rx", 2)
      .on("mouseenter", (e) => this._cellTip(e))
      .on("mousemove", (e) => this.ctx.tooltip.move(e.clientX, e.clientY))
      .on("mouseleave", () => this.ctx.tooltip.hide())
      .on("pointerdown", (e) => { if (e.pointerType !== "mouse") this._cellTip(e); });

    // legend line — real 10px swatches, verbatim text.
    const legendY = waffleSideBase + wfFootroom - 6;
    const legend = this._waffleG.append("g").attr("class", "wf-legend");
    legend.append("rect").attr("class", "wf-legend-swatch--on").attr("x", 0).attr("y", legendY - 9).attr("width", 10).attr("height", 10).attr("rx", 2);
    legend.append("text").attr("class", "wf-legend-text").attr("x", 15).attr("y", legendY).text("€1 that still buys");
    const legend2X = 15 + 130;
    legend.append("rect").attr("class", "wf-legend-swatch--off").attr("x", legend2X).attr("y", legendY - 9).attr("width", 10).attr("height", 10).attr("rx", 2);
    legend.append("text").attr("class", "wf-legend-text").attr("x", legend2X + 15).attr("y", legendY).text("€1 lost to prices");

    // ── basket bars (persistent groups, inside a single show/hide wrapper) ──
    this._buildBars();

    // country picker
    this._renderControls();

    // ── initial paint vs a re-render (resize / theme change). A TRUE first mount starts the
    // grid full-gold, awaiting step 0's own erosion. A re-render must instead repaint whatever
    // is ALREADY current (mode, shown fill count, bar widths) at the new geometry — render() is
    // called bare by BaseChart.resize(), with no step re-entry guaranteed to follow, so resetting
    // unconditionally here would strand a mid-story reader's waffle back at "100, solo" until
    // their next step change. ──────────────────────────────────────────────────────────────────
    const firstMount = this._shownN == null;
    this._recompute();
    if (firstMount) {
      this._mode = "solo";
      this._erosionPlayed = false;
      this._waffleG.attr("transform", this._waffleXform.solo);
      if (this.ctx.motion.reduced) {
        this._shownN = this._fillN;
        this._snapCells(this._fillN);
        this._kickNum.text(this._fillN == null ? "—" : `€${this._fillN}`);
      } else {
        this._shownN = 100;
        this._snapCells(100);
        this._kickNum.text("€100");
      }
      this._barsGroupEl.classed("is-shown", false);
      BASKET.forEach(b => {
        const g = this._barG.get(b.cat);
        g.select(".wf-bar-2019").attr("width", 0);
        g.select(".wf-bar-2025").attr("width", 0);
        g.select(".wf-bar-v2019").style("opacity", 0).text(`€${b.base}`);
        g.select(".wf-bar-v2025").style("opacity", 0);
      });
    } else {
      this._waffleG.attr("transform", this._waffleXform[this._mode]);
      this._snapCells(this._shownN);
      this._kickNum.text(this._shownN == null ? "—" : `€${this._shownN}`);
      const split = this._mode === "split";
      this._barsGroupEl.classed("is-shown", split);
      BASKET.forEach(b => {
        const g = this._barG.get(b.cat);
        const v2019 = g.select(".wf-bar-v2019"), v2025 = g.select(".wf-bar-v2025");
        if (!split) {
          g.select(".wf-bar-2019").attr("width", 0);
          g.select(".wf-bar-2025").attr("width", 0);
          v2019.style("opacity", 0);
          v2025.style("opacity", 0);
          return;
        }
        const lv = this._lineVals.find(x => x.cat === b.cat);
        const w2019 = Math.max(0, this._barX(b.base));
        const w2025 = Math.max(0, this._barX(lv?.v ?? b.base));
        g.select(".wf-bar-2019").attr("width", w2019);
        g.select(".wf-bar-2025").attr("width", w2025);
        v2019.attr("x", this._bars.labelGutter + w2019 + 6).style("opacity", 1).text(`€${b.base}`);
        v2025.attr("x", this._bars.labelGutter + w2025 + 6).style("opacity", 1).text(lv?.v == null ? "" : `→ €${lv.v.toFixed(2)}`);
      });
    }
  }

  _buildBars() {
    const { x, y, w, labelGutter, plotW, rowH, rowGap } = this._bars;
    const maxVal = 46;   // headroom above rent's ~40.5
    const xScale = d3.scaleLinear().domain([0, maxVal]).range([0, plotW]);
    this._barX = xScale;

    this._barsGroupEl = this.g.append("g").attr("class", "wf-bars-group");
    this._barsGroupEl.append("text").attr("class", "legend-title wf-bars-title")
      .attr("x", x).attr("y", y - 12).text("WHERE THE €100 GOES — 2019 → NOW");

    this._barG = new Map();
    BASKET.forEach((b, i) => {
      const rowY = y + i * (rowH + rowGap);
      const g = this._barsGroupEl.append("g").attr("class", "wf-barrow").attr("data-cat", b.cat)
        .attr("transform", `translate(${x},${rowY})`)
        .style("cursor", "default")
        .on("mouseenter", (e) => this._barTip(e, b))
        .on("mousemove", (e) => this.ctx.tooltip.move(e.clientX, e.clientY))
        .on("mouseleave", () => this.ctx.tooltip.hide());
      g.append("rect").attr("class", "wf-bar-hit").attr("x", 0).attr("y", -2).attr("width", w).attr("height", rowH + 4).attr("fill", "transparent");
      g.append("text").attr("class", "wf-bar-label").attr("x", 0).attr("y", rowH / 2 + 4).attr("text-anchor", "start").text(b.label);
      g.append("rect").attr("class", "wf-bar-2019").attr("x", labelGutter).attr("y", 0).attr("height", rowH * 0.4).attr("width", 0).attr("rx", 1.5);
      g.append("rect").attr("class", "wf-bar-2025").attr("x", labelGutter).attr("y", rowH * 0.5).attr("height", rowH * 0.4).attr("width", 0).attr("rx", 1.5);
      g.append("text").attr("class", "wf-bar-v2019").attr("x", labelGutter).attr("y", rowH * 0.4 - 3).attr("text-anchor", "start");
      g.append("text").attr("class", "wf-bar-v2025").attr("x", labelGutter).attr("y", rowH * 0.94).attr("text-anchor", "start");
      this._barG.set(b.cat, g);
    });
  }

  _renderControls() {
    const c = this.controlsEl; if (!c) return;
    if (c.dataset.wired === "1") { const s = c.querySelector("select"); if (s && s.value !== this.geo) s.value = this.geo; return; }
    c.dataset.wired = "1";
    const codes = ["EU27_2020", ...this.data.euCodes()].filter(code => BASKET.every(b => (this.data.hicpIndex[code]?.[b.cat]?.[START] != null)) && this.data.hicpIndex[code]?.CP00?.[START] != null);
    const opt = codes.map(code => `<option value="${code}" ${code === this.geo ? "selected" : ""}>${code === "EU27_2020" ? "EU-27 average" : this.data.countryName(code)}</option>`).join("");
    c.innerHTML = `<label class="waffle-ctrl">Country&nbsp;<select data-w-geo aria-label="Country">${opt}</select></label>`;
    c.querySelector("[data-w-geo]").addEventListener("change", e => this._onGeoChange(e.target.value));
  }

  // Recompute the DATA for the current geo (power, per-cell on/off, basket line values) without
  // touching anything visual — the caller decides how (or whether) to animate into the new state.
  _recompute() {
    const power = this._power(this.geo);
    this._fillN = power == null ? 0 : Math.round(power);
    this._power$ = power;
    this._cells.each(d => { d._on = d.idx < this._fillN; });
    this._lineVals = BASKET.map(b => ({ ...b, v: this._lineVal(this.geo, b.cat, b.base) }));
  }

  _onGeoChange(geo) {
    if (geo === this.geo) return;
    this.geo = geo;
    this._recompute();
    const reduced = this.ctx.motion.reduced;
    this._animateErosion(this._fillN, reduced);
    if (this._mode === "split") this._rescaleSplit(reduced);
  }

  // ── [D87] erosion / refill — timed on entry, never scroll-scrubbed. Cells transitioning
  // on->off "die" (claret flash then hollow); cells transitioning off->on "refill" (straight to
  // gold, no flash). idx-descending order reads as "top-row-first" for an initial 100->N erosion
  // and as "the erosion/recovery continues from where it left off" for any later delta.
  // Sequence-guarded setTimeouts (not d3 transitions) drive the discrete per-cell state flips,
  // matching the D84 swap-timer pattern — a rapid country change cleanly supersedes any
  // still-pending timers from the previous call instead of letting them fire out of order.
  //
  // The "changing" set is derived from each cell's OWN live class right now, never from a
  // trusted fromN scalar: a call that interrupts an earlier still-mid-flight erosion can leave a
  // ragged on/off boundary (some cells in the old delta already flipped, others not), and only
  // the actual DOM state can tell the two apart. This makes a rapid re-trigger converge correctly
  // instead of stranding whichever cells the superseded timers hadn't reached yet — the ONE bug
  // an earlier fromN/toN-scalar version of this method had, caught by a rapid-re-trigger probe. ──
  _animateErosion(toN, reduced) {
    const seq = ++this._erosionSeq;
    this._erosionTimers.forEach(t => clearTimeout(t));
    this._erosionTimers = [];
    this._shownN = toN;

    // a cell caught mid-flash by a rapid re-trigger just had its OWN completion timer cancelled
    // above. --flash already dropped --on, so left alone it would misread as "already off" to the
    // comparison below and get abandoned mid-flash forever. Resolve it to the settled --off state
    // it was already committed to — a half-finished flash is not a valid resting state — so the
    // comparison sees a clean on/off boolean and decides correctly whether the NEW target wants
    // this cell back on or still off.
    this._cells.filter(function () { return this.classList.contains("waffle-cell--flash"); })
      .classed("waffle-cell--flash", false).classed("waffle-cell--off", true);

    if (reduced) {
      this._snapCells(toN);
      this._kickNum.interrupt("kick").text(toN == null ? "—" : `€${toN}`);
      return;
    }

    const changing = this._cells.nodes()
      .filter(n => (d3.select(n).datum().idx < toN) !== n.classList.contains("waffle-cell--on"))
      .sort((a, b) => d3.select(b).datum().idx - d3.select(a).datum().idx);

    if (!changing.length) { this._tweenKickerErosion(toN, 0); return; }

    const anyDying = changing.some(n => d3.select(n).datum().idx >= toN);
    const perCellMs = anyDying ? ERODE_FLASH_MS + ERODE_SETTLE_MS : REFILL_MS;
    const totalMs = (changing.length - 1) * STAGGER_MS + perCellMs;

    changing.forEach((node, i) => {
      const dying = d3.select(node).datum().idx >= toN;
      const delay = i * STAGGER_MS;
      if (dying) {
        this._erosionTimers.push(setTimeout(() => {
          if (seq !== this._erosionSeq) return;
          d3.select(node).classed("waffle-cell--on", false).classed("waffle-cell--flash", true);
        }, delay));
        this._erosionTimers.push(setTimeout(() => {
          if (seq !== this._erosionSeq) return;
          d3.select(node).classed("waffle-cell--flash", false).classed("waffle-cell--off", true);
        }, delay + ERODE_FLASH_MS));
      } else {
        this._erosionTimers.push(setTimeout(() => {
          if (seq !== this._erosionSeq) return;
          d3.select(node).classed("waffle-cell--off", false).classed("waffle-cell--flash", false).classed("waffle-cell--on", true);
        }, delay));
      }
    });

    this._tweenKickerErosion(toN, totalMs);
  }

  _snapCells(n) {
    this._cells.classed("waffle-cell--flash", false)
      .classed("waffle-cell--on", d => d.idx < n)
      .classed("waffle-cell--off", d => d.idx >= n);
  }

  // Named transition on the persistent kicker element (not a throwaway object) so a second call
  // cleanly interrupts a still-running first one instead of two tweens fighting over the same
  // text node. Reads the CURRENTLY DISPLAYED number as its own starting point rather than trusting
  // a passed-in "from" — the same live-state discipline as _animateErosion, for the same reason.
  _tweenKickerErosion(to, ms) {
    const num = this._kickNum;
    num.interrupt("kick");
    if (ms <= 0) { num.text(to == null ? "—" : `€${to}`); return; }
    const from = +((num.text().match(/\d+/) || [to])[0]);
    num.transition("kick").duration(ms).ease(d3.easeLinear).tween("k", () => {
      const i = d3.interpolateNumber(from, to);
      return t => num.text(`€${Math.round(i(t))}`);
    });
  }

  // ── [D87] step-echo — one reusable helper, called for any bar pair a step's copy cites. A
  // single rounded-rect claret outline frames the pair's current extent and expands+fades once
  // over --dur-4; the element is appended fresh and removed at the end of its own transition, so
  // there is never a persistent class to toggle and never an interval to leak. ──────────────────
  _pulseBarPair(cat) {
    if (this.ctx.motion.reduced) return;
    const g = this._barG.get(cat); if (!g) return;
    const w2019 = +g.select(".wf-bar-2019").attr("width") || 0;
    const w2025 = +g.select(".wf-bar-2025").attr("width") || 0;
    const w = Math.max(w2019, w2025, 1);
    const rowH = this._bars.rowH;
    const x0 = this._bars.labelGutter;
    g.append("rect").attr("class", "wf-echo-pulse")
      .attr("x", x0 - 3).attr("y", -3).attr("width", w + 6).attr("height", rowH + 6).attr("rx", 4)
      .style("opacity", 0.9)
      .transition().duration(ECHO_PULSE_MS).ease(d3.easeCubicOut)
      .attr("x", x0 - 8).attr("y", -8).attr("width", w + 16).attr("height", rowH + 16).attr("rx", 6)
      .style("opacity", 0)
      .remove();
  }

  // ── D86 step-driven split choreography (layout unchanged) — timed on entry, identical whether
  // reached by scroll or a rail-dot jump. Echo pulses are appended here (step 1's own cascade)
  // and in _rescaleSplit (step 2 / picker change), each tied to that row's OWN completion. ──────

  _enterSplit(reduced) {
    this._mode = "split";
    this._barsGroupEl.classed("is-shown", true);
    const wg = this._waffleG.interrupt("wfmove");
    if (reduced) wg.attr("transform", this._waffleXform.split);
    else wg.transition("wfmove").duration(WF_MOVE_MS).ease(d3.easeCubicOut).attr("transform", this._waffleXform.split);

    BASKET.forEach((b, i) => {
      const g = this._barG.get(b.cat);
      const lv = this._lineVals.find(x => x.cat === b.cat);
      const w2019 = Math.max(0, this._barX(b.base));
      const w2025 = Math.max(0, this._barX(lv?.v ?? b.base));
      const v2019 = g.select(".wf-bar-v2019"), v2025 = g.select(".wf-bar-v2025");
      const bar2019 = g.select(".wf-bar-2019").interrupt("gb"), bar2025 = g.select(".wf-bar-2025").interrupt("gb");
      v2019.attr("x", this._bars.labelGutter + w2019 + 6).text(`€${b.base}`);
      v2025.attr("x", this._bars.labelGutter + w2025 + 6).text(lv?.v == null ? "" : `→ €${lv.v.toFixed(2)}`);
      if (reduced) {
        bar2019.attr("width", w2019); bar2025.attr("width", w2025);
        v2019.style("opacity", 1); v2025.style("opacity", 1);
        return;
      }
      v2019.style("opacity", 0); v2025.style("opacity", 0);
      bar2019.transition("gb").delay(i * BAR_STAGGER_MS).duration(BAR_GROW_MS).ease(d3.easeCubicOut)
        .attr("width", w2019).on("end", () => v2019.style("opacity", 1));
      bar2025.transition("gb").delay(i * BAR_STAGGER_MS + BAR_NOW_DELAY_MS).duration(BAR_GROW_MS).ease(d3.easeCubicOut)
        .attr("width", w2025).on("end", () => {
          v2025.style("opacity", 1);
          if (this._echoCats.includes(b.cat)) this._pulseBarPair(b.cat);
        });
    });
  }

  _exitSplit(reduced) {
    this._mode = "solo";
    this._barsGroupEl.classed("is-shown", false);
    const wg = this._waffleG.interrupt("wfmove");
    if (reduced) wg.attr("transform", this._waffleXform.solo);
    else wg.transition("wfmove").duration(WF_MOVE_MS).ease(d3.easeCubicOut).attr("transform", this._waffleXform.solo);

    BASKET.forEach(b => {
      const g = this._barG.get(b.cat);
      const bar2019 = g.select(".wf-bar-2019").interrupt("gb"), bar2025 = g.select(".wf-bar-2025").interrupt("gb");
      g.select(".wf-bar-v2019").style("opacity", 0);
      g.select(".wf-bar-v2025").style("opacity", 0);
      if (reduced) { bar2019.attr("width", 0); bar2025.attr("width", 0); return; }
      bar2019.transition("gb").duration(BAR_RETRACT_MS).ease(d3.easeCubicIn).attr("width", 0);
      bar2025.transition("gb").duration(BAR_RETRACT_MS).ease(d3.easeCubicIn).attr("width", 0);
    });
  }

  // step 2 entry (new geo) or any picker change while already split: bars re-scale, ONE 600ms
  // transition, no stagger, no re-mount. Erosion/kicker are handled separately by
  // _animateErosion (called alongside this, not from within it) so the two stay independently
  // testable and _rescaleSplit only ever touches the bars.
  _rescaleSplit(reduced) {
    BASKET.forEach(b => {
      const g = this._barG.get(b.cat);
      const lv = this._lineVals.find(x => x.cat === b.cat);
      const w2019 = Math.max(0, this._barX(b.base));
      const w2025 = Math.max(0, this._barX(lv?.v ?? b.base));
      const v2019 = g.select(".wf-bar-v2019"), v2025 = g.select(".wf-bar-v2025");
      const bar2019 = g.select(".wf-bar-2019").interrupt("gb"), bar2025 = g.select(".wf-bar-2025").interrupt("gb");
      v2019.text(`€${b.base}`);
      v2025.text(lv?.v == null ? "" : `→ €${lv.v.toFixed(2)}`);
      if (reduced) {
        bar2019.attr("width", w2019); bar2025.attr("width", w2025);
        v2019.attr("x", this._bars.labelGutter + w2019 + 6).style("opacity", 1);
        v2025.attr("x", this._bars.labelGutter + w2025 + 6).style("opacity", 1);
        return;
      }
      bar2019.transition("gb").duration(WF_MOVE_MS).ease(d3.easeCubicInOut).attr("width", w2019);
      bar2025.transition("gb").duration(WF_MOVE_MS).ease(d3.easeCubicInOut).attr("width", w2025);
      v2019.transition("gb").duration(WF_MOVE_MS).ease(d3.easeCubicInOut).attr("x", this._bars.labelGutter + w2019 + 6).style("opacity", 1);
      v2025.transition("gb").duration(WF_MOVE_MS).ease(d3.easeCubicInOut).attr("x", this._bars.labelGutter + w2025 + 6).style("opacity", 1);
    });
    clearTimeout(this._echoRescaleT);
    if (!reduced && this._echoCats.length) {
      this._echoRescaleT = setTimeout(() => { this._echoCats.forEach(cat => this._pulseBarPair(cat)); }, WF_MOVE_MS);
    }
  }

  onStep(index, el) {
    const geo = (el && el.dataset.geo) || this.geo;
    const mode = el && el.dataset.mode;
    const wantSplit = mode === "bars" || index >= 1;
    const echoAttr = el && el.dataset.echo;
    this._echoCats = echoAttr ? echoAttr.split(",").map(s => ECHO_MAP[s.trim()]).filter(Boolean) : [];
    if (this.container) { this.container.setAttribute("data-active-geo", geo); this.container.setAttribute("data-onstep", index); }

    const geoChanged = geo !== this.geo;
    if (geoChanged) {
      this.geo = geo;
      this._recompute();
      const s = this.controlsEl?.querySelector("select"); if (s) s.value = geo;
    }

    const reduced = this.ctx.motion.reduced;

    // 1. Erosion: step 0's own one-time "start full, die down to fillN" sequence; a rail-jump
    // that lands directly on step 1/2 before step 0 ever fired snaps instantly instead (there was
    // no time to watch the 1.2s sequence anyway); once already played, a geo change animates the
    // delta.
    if (index === 0 && !this._erosionPlayed) {
      this._erosionPlayed = true;
      this._animateErosion(this._fillN, reduced);
    } else if (wantSplit && this._shownN !== this._fillN) {
      this._erosionPlayed = true;
      this._shownN = this._fillN;
      this._snapCells(this._fillN);
      this._kickNum.interrupt("kick").text(this._fillN == null ? "—" : `€${this._fillN}`);
    } else if (wantSplit && geoChanged) {
      this._animateErosion(this._fillN, reduced);
    }

    // 2. Split-mode transitions (D86, unchanged).
    if (wantSplit && this._mode !== "split") {
      this._enterSplit(reduced);
    } else if (!wantSplit && this._mode === "split") {
      this._exitSplit(reduced);
    } else if (wantSplit && geoChanged) {
      this._rescaleSplit(reduced);
    }
  }

  _cellTip(e) {
    const p = this._power$; const per = p == null ? null : p / 100;
    const name = this.geo === "EU27_2020" ? "EU-27 average" : this.data.countryName(this.geo);
    this.ctx.tooltip.show(`<h5>${name}</h5><div class="row"><span class="key">€1 of 2019</span><span class="val">worth €${per == null ? "—" : per.toFixed(2)} today</span></div>`, e.clientX, e.clientY);
  }
  _barTip(e, b) {
    const v = this._lineVal(this.geo, b.cat, b.base);
    const pct = v == null ? null : (v / b.base - 1) * 100;
    this.ctx.tooltip.show(
      `<h5>${b.label}</h5><div class="row"><span class="key">2019</span><span class="val">€${b.base.toFixed(2)}</span></div><div class="row"><span class="key">Now</span><span class="val">€${v == null ? "—" : v.toFixed(2)}</span></div><div class="row"><span class="key">Change</span><span class="val">${pct == null ? "—" : (pct >= 0 ? "+" : "") + pct.toFixed(0) + "%"}</span></div>`,
      e.clientX, e.clientY);
  }

  destroy() { this._erosionTimers.forEach(t => clearTimeout(t)); clearTimeout(this._echoRescaleT); super.destroy(); }
  onThemeChange() { this.render(); }
}
