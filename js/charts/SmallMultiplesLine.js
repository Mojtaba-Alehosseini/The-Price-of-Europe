/* ============================================================
   SmallMultiplesLine — CH2 "The trap and the spark" (REBUILD, brief §5 CH2).
   A 2×3 grid (3 cols × 2 rows desktop, 1-col phone) of monthly YoY by category,
   WINDOW Jan 2019 – Dec 2021 only, on ONE shared y-scale with a marked zero line.
   The shared scale is the point: energy (and transport) tower while the rest sit
   flat — "COVID loaded the spring".
     reveal: panels stagger-draw on scroll (latched)
     steps:  freeze → pulse the flat Overall panel · spark → light Energy+Transport, dim rest
     click:  a panel enlarges to fill the body (Esc / click-out / Enter returns)
     hover:  nearest-month cursor + tooltip (category · month · value)
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { getCSS } from "../modules/CraftFX.js";
import { getInfoPop } from "../modules/InfoPop.js";
import { smooth } from "../modules/ChartMotion.js";

// 3 cols × 2 rows. Order places Energy (0,1) directly above Transport (1,1) so the
// "spark" highlight of the two lights one column. CP11 has no dedicated --cat token
// (restaurants ⊂ services), so it borrows --cat-housing as its distinct 6th hue.
const CATS = [
  { code: "CP00", label: "Overall",     cls: "overall"   },
  { code: "NRG",  label: "Energy",      cls: "energy"    },
  { code: "FOOD", label: "Food",        cls: "food"      },
  { code: "SERV", label: "Services",    cls: "services"  },
  { code: "CP07", label: "Transport",   cls: "transport" },
  { code: "CP11", label: "Restaurants", cls: "housing"   },
];
const COLS = 3, ROWS = 2;

// Step focus → panel emphasis (brief §5 CH2 motion).
const STEPS = {
  freeze:   { highlight: [],             pulse: "CP00", kicker: "FROZEN",   sub: "spring 2020" },
  pressure: { highlight: [],             pulse: null,   kicker: "PRESSURE", sub: "2020 – 2021" },
  spark:    { highlight: ["NRG","CP07"], pulse: null,   kicker: "ENERGY",   sub: "the fuse lights first" },
};
const STEP_ORDER = ["freeze", "pressure", "spark"];

// [debug 2026-07-06] How far into the shared 2019-2021 window each step's line-draw should reach —
// keyed to the step's own narrative date, so the drawn portion of the line stays in lockstep with
// whichever text card is active (was: drawn independently of scroll steps, always finishing early).
const DRAW_THROUGH = { freeze: "2020-12", pressure: "2021-06", spark: "2021-12" };

// [debug 2026-07-06] Short click-to-reveal explanations for each panel title (§6 feature).
const TITLE_INFO = {
  CP00: "The headline number — the average price change across everything a household buys. Every other panel here is one ingredient of this one.",
  NRG:  "Electricity, gas and fuel. The most violent mover of the six — it went negative in 2020, then rose faster and further than anything else once the war cut off Russian gas.",
  FOOD: "Groceries and non-alcoholic drinks. Slower to move than energy, but it caught up — fertiliser and transport costs kept pushing it up long after the initial shock passed.",
  SERV: "Haircuts, insurance, streaming, rent. The least dramatic mover of the six, but the stickiest — once services prices climb, they rarely come back down.",
  CP07: "Fuel, cars, public transport fares. Tracks energy closely, since petrol is a direct cost — one of the first categories to spike and one of the first to cool.",
  CP11: "Eating and drinking out. A lagging indicator — restaurants absorb rising costs for months before passing them on, so this panel moves last, not first.",
};

// [debug 2026-07-06 — feature request] Compare-mode for the drill-down: same country groups, same
// combined slot palette, same EU-27-only data-availability caveat as CH1 (js/charts/AnnotatedLine.js)
// — duplicated here rather than factored into a shared module (two small, independent charts each
// owning their own copy is simpler than introducing a cross-chart dependency for ~15 lines of data).
const GROUPS = {
  eurozone: { label: "Eurozone",           members: ["AT","BE","HR","CY","EE","FI","FR","DE","EL","IE","IT","LV","LT","LU","MT","NL","PT","SK","SI","ES"], showMembers: false },
  g7:       { label: "G7 (EU members)",    members: ["DE","FR","IT"], showMembers: true },
  nordic:   { label: "Nordic (EU members)",members: ["SE","DK","FI"], showMembers: true },
  benelux:  { label: "Benelux",            members: ["BE","NL","LU"], showMembers: true },
  visegrad: { label: "Visegrád Group",     members: ["PL","HU","CZ","SK"], showMembers: true },
  dach:     { label: "DACH (EU members)",  members: ["DE","AT"], showMembers: true },
  southern: { label: "Southern Europe",    members: ["ES","IT","EL","PT"], showMembers: true },
};
const CMP = ["var(--cmp-1)", "var(--cmp-2)", "var(--cmp-3)", "var(--cmp-4)", "var(--cmp-5)", "var(--cmp-6)", "var(--cmp-7)", "var(--cmp-8)", "var(--cmp-9)", "var(--cmp-10)"];

export class SmallMultiplesLine extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 64, right: 20, bottom: 34, left: 46 }, aspect: 1.5 });
    this._focus = "freeze";
    this._enlarged = null;
    this._drawn = {};        // per-cat draw fraction, kept in sync with the active step
    this._info = getInfoPop();
    this._cmp = new Map();   // [debug 2026-07-06] per-category compare state: cat code -> {codes:[], groups:[]}
  }

  size() {
    if (!this.container) return { width: 640, height: 560 };
    const w = this.container.clientWidth || 640;
    const h = this.container.clientHeight || Math.round(w / this.opts.aspect);
    return { width: w, height: Math.max(340, h) };
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const isPhone = this.size().width < 560;
    this._isPhone = isPhone;
    this.opts.margin = isPhone
      ? { top: 52, right: 14, bottom: 30, left: 40 }
      : { top: 64, right: 20, bottom: 34, left: 46 };
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    this.svg.attr("aria-label", "Monthly inflation by category 2019–2021 on one shared scale: energy and transport tower over food, services and restaurants which stay near zero.");
    const M = this.opts.margin;
    const iw = width - M.left - M.right, ih = height - M.top - M.bottom;
    this._iw = iw; this._ih = ih;

    const eu = this.data.euAggregateCode();
    const parse = d3.timeParse("%Y-%m");
    this._parse = parse;
    // grid geometry (phone = 1 col × 6 rows)
    const cols = isPhone ? 1 : COLS, rows = isPhone ? CATS.length : ROWS;
    const gapX = isPhone ? 0 : 30, gapY = isPhone ? 12 : 26;
    const cellW = (iw - gapX * (cols - 1)) / cols;
    const cellH = (ih - gapY * (rows - 1)) / rows;
    this._cols = cols; this._rows = rows; this._cellW = cellW; this._cellH = cellH; this._gapX = gapX; this._gapY = gapY;

    // series per category, window 2019-2021, shared y
    this._series = new Map();
    CATS.forEach(c => {
      const rows2 = [];
      for (const t of this.data.monthsCP00()) {
        if (t < "2019-01" || t > "2021-12") continue;
        const v = this.data.hicpMonthly[eu]?.[c.code]?.[t];
        if (Number.isFinite(v)) rows2.push({ t: parse(t), time: t, v });
      }
      rows2.sort((a, b) => a.t - b.t);
      this._series.set(c.code, rows2);
    });
    const x = d3.scaleTime().domain([parse("2019-01"), parse("2021-12")]).range([0, cellW - 34]);  // [§C.1] right gutter so the end tag clears the line end
    const y = d3.scaleLinear().domain([-12, 26]).range([cellH, 0]);
    this._x = x; this._y = y;

    // kicker (big italic word) top-left
    this._kickNum = this.svg.append("text").attr("class", "kick-num")
      .attr("x", M.left - 2).attr("y", isPhone ? 36 : 46)
      .style("font-size", isPhone ? "26px" : "34px").text(STEPS.freeze.kicker);
    // top-right unit legend
    const lg = this.svg.append("g").attr("transform", `translate(${width - M.right}, ${isPhone ? 22 : 30})`);
    lg.append("text").attr("class", "legend-title").attr("text-anchor", "end").text("ANNUAL %");
    if (!isPhone) lg.append("text").attr("class", "legend-tick").attr("text-anchor", "end").attr("y", 14).text("shared scale · 2019–21");

    // panels
    this._panelG = new Map();
    CATS.forEach((c, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const tx = M.left + col * (cellW + gapX);
      const ty = M.top + row * (cellH + gapY);
      const cell = this.svg.append("g").attr("class", "sm-panel").attr("data-cat", c.code)
        .attr("transform", `translate(${tx},${ty})`)
        .attr("role", "button").attr("tabindex", 0)
        .attr("aria-label", `${c.label} — click to enlarge`)
        .style("cursor", "pointer");
      this._panelG.set(c.code, cell);
      this._drawPanel(cell, c, col, row);
      cell.on("click", () => this._toggleEnlarge(c.code));
      cell.on("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this._toggleEnlarge(c.code); } });
    });

    // hero layer (enlarge overlay) on top
    this._heroG = this.svg.append("g").attr("class", "sm-hero-layer");

    // reveal + focus
    this._drawn = {};
    if (this.ctx.motion.reduced) {
      CATS.forEach(c => this._drawCat(c.code, 1));
      this._applyFocus("spark");   // final legible state (all lit, energy word)
      this._kickNum.text(STEPS.spark.kicker);
    } else {
      this._applyFocus(this._focus);
      this._revealToStep(this._focus);   // instant match to the default step, no animation flash on mount
      this._wireScroll();
    }
  }

  _drawPanel(cell, c, col, row) {
    const { _cellW: w, _cellH: h, _x: x, _y: y } = this;
    const isLeftCol = col === 0, isBottomRow = row === this._rows - 1;
    const color = getCSS(`--cat-${c.cls}`);
    // gridlines + shared y ticks (left column only; thinned on phone) + zero line
    y.ticks(this._isPhone ? 2 : 4).forEach(t => {
      cell.append("line").attr("class", t === 0 ? "sm-zero" : "sm-grid")
        .attr("x1", 0).attr("x2", w).attr("y1", y(t)).attr("y2", y(t));
      if (isLeftCol) cell.append("text").attr("class", "sm-ytick")
        .attr("x", -7).attr("y", y(t) + 3).attr("text-anchor", "end").text(`${t}%`);
    });
    // x labels (year starts) — bottom row only, so top-row labels never hit the row below's titles
    if (isBottomRow) this._yearTicks(cell, x, h + 14, "sm-xtick");

    // body clip so the line never bleeds past the cell
    const clipId = `sm-clip-${c.code}`;
    let defs = this.svg.select("defs"); if (defs.empty()) defs = this.svg.append("defs");
    defs.append("clipPath").attr("id", clipId).append("rect").attr("x", 0).attr("y", 0).attr("width", w).attr("height", h);

    const line = d3.line().x(d => x(d.t)).y(d => y(d.v)).curve(d3.curveMonotoneX);
    const s = this._series.get(c.code);
    cell.append("path").datum(s).attr("class", "sm-line").attr("data-cat", c.code)
      .attr("fill", "none").attr("stroke", color).attr("stroke-width", 2)
      .attr("stroke-linejoin", "round").attr("stroke-linecap", "round").attr("d", line)
      .attr("clip-path", `url(#${clipId})`);

    const last = s.at(-1);
    if (last) {
      cell.append("circle").attr("class", "sm-end-dot").attr("cx", x(last.t)).attr("cy", y(last.v)).attr("r", 2.6).attr("fill", color);
      cell.append("text").attr("class", "sm-end-tag").attr("x", w - 2).attr("y", Math.max(12, y(last.v) - 7)).attr("text-anchor", "end")
        .attr("fill", color).text(`${last.v >= 0 ? "+" : ""}${last.v.toFixed(0)}%`);
    }
    // per-panel hover
    const hit = cell.append("rect").attr("class", "sm-hit").attr("x", 0).attr("y", 0).attr("width", w).attr("height", h).attr("fill", "transparent");
    const cur = cell.append("g").attr("class", "sm-cursor").attr("pointer-events", "none").style("opacity", 0);
    cur.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", h);
    const cdot = cur.append("circle").attr("r", 3.5).attr("fill", color).attr("stroke", "var(--bg)").attr("stroke-width", 1.4);
    const bisect = d3.bisector(d => d.t).left;
    hit.on("mousemove", (event) => {
      const [mx] = d3.pointer(event, cell.node());
      const t = x.invert(mx); const i = bisect(s, t);
      const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i)];
      const rec = (!a || (b && (t - a.t) > (b.t - t))) ? b : a; if (!rec) return;
      cur.style("opacity", 1).attr("transform", `translate(${x(rec.t)},0)`);
      cdot.attr("cx", 0).attr("cy", y(rec.v));
      this.ctx.tooltip.show(`<h5>${c.label}</h5><div class="row"><span class="key">${d3.timeFormat("%b %Y")(rec.t)}</span><span class="val">${rec.v >= 0 ? "+" : ""}${rec.v.toFixed(1)}%</span></div>`, event.clientX, event.clientY);
    }).on("mouseleave", () => { cur.style("opacity", 0); this.ctx.tooltip.hide(); });

    // [debug 2026-07-06] Title INSIDE top-left (halo keeps it legible over the line); appended AFTER
    // `.sm-hit` (not before, as originally) so it wins hit-testing for its own click-to-info popover
    // — an earlier DOM sibling never wins over a later one at the same nesting depth regardless of
    // visual layering, so a title created before `.sm-hit` would have every click swallowed by the
    // transparent hover rect sitting on top of it. `_info.flag` itself calls stopPropagation, so a
    // title click no longer also bubbles up to the panel's own enlarge handler.
    const title = cell.append("text").attr("class", "sm-title").attr("x", 3).attr("y", 13).text(c.label.toUpperCase());
    this._info.flag(title.node(), TITLE_INFO[c.code], color);

    cell.datum({ c, line, s });
  }

  // One label per calendar year spanned by `scale`'s domain. First anchors the domain's start.
  // Middle years — and, per the fix below, ordinarily the last year too — anchor at their own
  // Jan-1 position, centered, so every interval between adjacent labels is the same uniform
  // one-calendar-year width.
  // [debug 2026-07-06 — owner report] The last tick used to ALWAYS snap to the domain's true end
  // (scale.range()[1]) rather than its own Jan-1, so a domain running deep into its final year (the
  // 3-year mini-panel window; the up-to-7-year hero drill-down even more so) stretched the FINAL
  // interval to nearly double every other one — e.g. hero: 2019→2024 uniformly ~100px apart, then
  // 2024→2025 alone ~190px, reading as "the years aren't evenly spaced / not fitted to the chart."
  // Every panel already carries its own end-tag/end-label with the exact final month (the mini
  // panels' "+N%" tag, the hero's "+N% by Mon YYYY"), so the year tick doesn't need to double as an
  // exact-end marker too. Snap to the true edge ONLY when the domain happens to end almost exactly
  // on a year boundary (<20px of natural run-in) — otherwise every tick sits at its own true
  // calendar position and the label text-anchor never needs to flip to "end".
  // [debug 2026-07-07 — tried forceEdge, reverted same day] A `forceEdge` param briefly forced the 6
  // grid panels' last tick ("2021") to the panel's true right edge, reasoning the natural Jan-1
  // position left a ~55px "dead gap" (range end 176 vs natural 120.8) with nothing to explain it.
  // In practice this snapped "2021" onto the SAME pixel as the end-dot/end-tag (measured: 0px gap) —
  // a point that is really Dec 2021, 11 months later — so the label no longer told the truth about
  // where 2021 sat, and a hover at the honest Jan-2021 pixel (55px to the left) showed a tooltip
  // disconnected from the visible tick. The end-dot + "+N%" tag were already sitting past the gap and
  // read fine as "the line keeps going to here" without a text tick doubling as an exact-end marker
  // (same logic as the fix above) — so forceEdge bought nothing and cost axis honesty. Reverted to the
  // shared <20px heuristic below; `forceEdge` kept as a dead parameter (default false, unused by any
  // call site) rather than ripped out, in case a genuinely edge-adjacent domain needs it later.
  _yearTicks(sel, scale, baseline, cls = "sm-xtick", forceEdge = false) {
    const [d0, d1] = scale.domain();
    const r1 = scale.range()[1];
    const years = d3.timeYear.range(d3.timeYear.floor(d0), d3.timeYear.offset(d3.timeYear.floor(d1), 1));
    years.forEach((yr, i) => {
      const isFirst = i === 0, isLast = i === years.length - 1;
      const natural = scale(yr);
      const nearEdge = isLast && (forceEdge || (r1 - natural) < 20);
      sel.append("text").attr("class", cls).attr("x", nearEdge ? r1 : natural).attr("y", baseline)
        .attr("text-anchor", isFirst ? "start" : nearEdge ? "end" : "middle").text(yr.getFullYear());
    });
  }

  // Per-panel line draw (dasharray). frac 0..1, NOT latched — moves both directions so the drawn
  // portion always matches whichever step is currently active (see _revealToStep).
  _drawCat(code, frac, dur = 0, delay = 0) {
    this._drawn[code] = frac;
    const path = this._panelG.get(code)?.select(".sm-line");
    if (!path || path.empty()) return;
    const node = path.node(); const L = node.getTotalLength ? node.getTotalLength() : 0;
    const target = L * (1 - frac);
    path.attr("stroke-dasharray", `${L} ${L}`);
    path.interrupt();
    if (dur > 0) path.transition().delay(delay).duration(dur).ease(d3.easeCubicInOut).attr("stroke-dashoffset", target);
    else path.attr("stroke-dashoffset", target);
  }

  // Fraction of the shared 2019-2021 domain a given step's narrative date reaches.
  _fracFor(focus) {
    const [d0, d1] = this._x.domain();
    const t = this._parse(DRAW_THROUGH[focus] || "2021-12");
    return Math.max(0, Math.min(1, (t - d0) / (d1 - d0)));
  }

  // Snap every panel's line straight to a step's target fraction, no animation — used for the
  // initial instant mount state and the reduced-motion path, where a continuous scroll-tied
  // reveal doesn't apply.
  _revealToStep(focus) {
    const frac = this._fracFor(focus);
    CATS.forEach(c => this._drawCat(c.code, frac, 0));
  }

  // [debug 2026-07-06 — feature request] Continuous, scroll-position-driven reveal: the drawn
  // fraction is a direct function of scrollY, interpolated between each step's own trigger-crossing
  // point (mirroring scrollama's own offset:0.55 line), not a fixed-duration animation fired on
  // step-ENTER. The old (Session-30) discrete version jumped to each step's target over a flat
  // 650ms transition — the target was always CORRECT, but since that transition ran on its own
  // clock independent of further scrolling, it read as motion the scroll TRIGGERED rather than
  // motion the scroll IS, which is what "sync the line with scrolling" actually asks for. This
  // replaces watchChapterProgress's naive chapter-wide 0..1 (the ORIGINAL pre-Session-30 approach,
  // which finished the reveal early because a chapter-wide progress fraction has no fixed
  // relationship to where any individual step's text actually triggers) with progress measured
  // against the real step elements, so the reveal is mathematically guaranteed to land exactly on
  // each step's own target fraction at the moment that step's text becomes active — it cannot
  // finish early or late. Not latched — scrolling back up un-draws the line too (Session 30's own
  // bidirectional requirement), since frac is recomputed fresh from scrollY every tick, forward or
  // backward, with no memory of a previous value.
  _stepTriggerYs() {
    const chapter = this.container?.closest(".chapter");
    const steps = chapter ? [...chapter.querySelectorAll(".scroller__step")] : [];
    return steps.map(el => el.getBoundingClientRect().top + scrollY - innerHeight * 0.55);
  }
  _continuousReveal() {
    if (this._enlarged) return;   // don't fight an open enlarge — panels are hidden anyway
    if (this.ctx.motion.reduced) return;   // reduced-motion snaps via onStep/_revealToStep instead
    const ys = this._triggerYs || (this._triggerYs = this._stepTriggerYs());
    if (!ys.length) return;
    const targets = STEP_ORDER.map(k => this._fracFor(k));
    const y = scrollY;
    let frac;
    if (y <= ys[0]) frac = targets[0];
    else if (y >= ys[ys.length - 1]) frac = targets[targets.length - 1];
    else {
      let i = 0;
      while (i < ys.length - 1 && y > ys[i + 1]) i++;
      const segP = smooth((y - ys[i]) / (ys[i + 1] - ys[i]));
      frac = targets[i] + (targets[i + 1] - targets[i]) * segP;
    }
    CATS.forEach(c => this._drawCat(c.code, frac, 0));
  }

  _wireScroll() {
    const chapter = this.container.closest(".chapter");
    this._watchUnpin(chapter, () => this._neutralView());   // [A2 §B.4]
    // Continuous line-reveal driven straight off scrollY (see _continuousReveal above) — rAF-coalesced
    // so a burst of scroll/resize events collapses to one recompute per frame.
    let raf = null;
    const tick = () => { this._continuousReveal(); raf = null; };
    this._onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
    this._onResize = () => { this._triggerYs = null; if (!raf) raf = requestAnimationFrame(tick); };
    addEventListener("scroll", this._onScroll, { passive: true });
    addEventListener("resize", this._onResize);
    this._continuousReveal();
  }
  // [A2 §B.4] neutral full view — every panel drawn + un-dimmed (no lingering spark-step dim).
  _neutralView() { CATS.forEach(c => this._drawCat(c.code, 1)); if (this._panelG) this._panelG.forEach(g => g.interrupt().style("opacity", 1)); }

  onStep(index, el) {
    const focus = (el && el.dataset.focus) || STEP_ORDER[Math.max(0, Math.min(STEP_ORDER.length - 1, index))];
    this._focus = focus;
    if (this.container) { this.container.setAttribute("data-active-focus", focus); this.container.setAttribute("data-onstep", index); }
    if (this._enlarged) return;   // don't fight an open enlarge
    const cfg = STEPS[focus] || STEPS.freeze;
    this._kickNum.text(cfg.kicker);
    this._applyFocus(focus);
    // Reduced-motion has no scroll-tied reveal to fall back on (_continuousReveal no-ops for it),
    // so it still snaps directly to the step's own target here. Everyone else gets an immediate
    // resync off the current scrollY (covers a rail-dot jump landing before the next scroll/resize
    // event fires) and then the scroll listener keeps it continuously in sync from here.
    if (this.ctx.motion.reduced) this._revealToStep(focus); else this._continuousReveal();
  }

  _applyFocus(focus) {
    const cfg = STEPS[focus] || STEPS.freeze;
    const dur = this.ctx.motion.reduced ? 0 : 420;
    const hi = cfg.highlight;
    CATS.forEach(c => {
      const g = this._panelG.get(c.code); if (!g) return;
      const dim = hi.length && !hi.includes(c.code);
      g.interrupt().transition().duration(dur).style("opacity", dim ? getCSS("--dim-nonfocus") || 0.25 : 1);
    });
    if (cfg.pulse && !this.ctx.motion.reduced) this._pulse(cfg.pulse);
  }

  // one-shot pulse rings on a panel's end dot (the "flat overall" at the freeze step)
  _pulse(code) {
    const g = this._panelG.get(code); if (!g) return;
    const dot = g.select(".sm-end-dot"); if (dot.empty()) return;
    const cx = +dot.attr("cx"), cy = +dot.attr("cy");
    for (let k = 0; k < 3; k++) {
      g.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 4).attr("fill", "none")
        .attr("stroke", getCSS(`--cat-overall`)).attr("stroke-width", 1.6).style("opacity", 0.5)
        .transition().delay(k * 240).duration(900).ease(d3.easeCubicOut).attr("r", 22).style("opacity", 0).remove();
    }
  }

  // ── click-to-enlarge ──────────────────────────────────────────────
  _toggleEnlarge(code) {
    if (this._enlarged === code) return this._collapse();
    this._enlarged = code;
    if (this.container) this.container.setAttribute("data-enlarged", code);
    // dim grid to a faint ghost, lift the big panel
    this._panelG.forEach(g => g.interrupt().style("opacity", 0));
    this._drawBig(code);
    if (!this._escBound) { this._escHandler = (e) => { if (e.key === "Escape") this._collapse(); }; document.addEventListener("keydown", this._escHandler); this._escBound = true; }
  }

  _collapse() {
    this._enlarged = null;
    if (this.container) this.container.removeAttribute("data-enlarged");
    this.ctx.tooltip.hide();
    this._heroG.selectAll("*").remove();
    this._hideCmpControls();
    this._applyFocus(this._focus);
    const cfg = STEPS[this._focus] || STEPS.freeze;
    this._kickNum.text(cfg.kicker);
    // Resync the reveal to wherever the page actually sits now — the continuous reveal no-ops
    // while _enlarged is set, so the grid's line-draw would otherwise still show whatever fraction
    // was current the moment it was enlarged, stale if the reader scrolled in the meantime.
    if (this.ctx.motion.reduced) this._revealToStep(this._focus); else this._continuousReveal();
    if (this._escBound) { document.removeEventListener("keydown", this._escHandler); this._escBound = false; }
  }

  // [debug 2026-07-06] Full available history (2019 → latest month), not just the small-multiples'
  // shared 2019-2021 window — the drill-down is its own independent view with its own y-scale, so
  // widening it doesn't touch the small-multiples' deliberate "shared pre-war scale" design.
  _fullSeries(code) {
    const eu = this.data.euAggregateCode(), parse = this._parse;
    const rows = [];
    for (const t of this.data.monthsCP00()) {
      if (t < "2019-01") continue;
      const v = this.data.hicpMonthly[eu]?.[code]?.[t];
      if (Number.isFinite(v)) rows.push({ t: parse(t), time: t, v });
    }
    rows.sort((a, b) => a.t - b.t);
    return rows;
  }

  // [debug 2026-07-06 — feature request] Per-country series for the drill-down compare feature —
  // mirrors AnnotatedLine's _series but parameterised by CATEGORY (each of the 6 panels is a
  // different COICOP column, not just the headline CP00) and spans the same full-history window
  // as _fullSeries (not the small-multiples grid's shared 2019-2021 window).
  _cmpSeries(country, cat) {
    const parse = this._parse;
    const rows = [];
    for (const t of this.data.monthsCP00()) {
      if (t < "2019-01") continue;
      const v = this.data.hicpMonthly[country]?.[cat]?.[t];
      if (Number.isFinite(v)) rows.push({ t: parse(t), time: t, v });
    }
    rows.sort((a, b) => a.t - b.t);
    return rows;
  }
  // Unweighted mean across a group's members for one category, month by month — only months where
  // EVERY member has data (mirrors AnnotatedLine's _groupAverage).
  _cmpGroupAvg(members, cat) {
    const byTime = new Map();
    members.forEach(code => this._cmpSeries(code, cat).forEach(d => {
      if (!byTime.has(d.time)) byTime.set(d.time, { t: d.t, time: d.time, sum: 0, n: 0 });
      const e = byTime.get(d.time); e.sum += d.v; e.n++;
    }));
    return [...byTime.values()].filter(e => e.n === members.length)
      .map(e => ({ t: e.t, time: e.time, v: e.sum / e.n })).sort((a, b) => a.t - b.t);
  }
  // Per-category compare state — each of the 6 drill-downs remembers its own selections
  // independently, same as re-opening a chart remembers what was compared against it.
  _cmpFor(cat) { if (!this._cmp.has(cat)) this._cmp.set(cat, { codes: [], groups: [] }); return this._cmp.get(cat); }
  _cmpSlotCount(cat) { const s = this._cmpFor(cat); return s.codes.length + s.groups.length; }
  _cmpAddCountry(cat, code) { const s = this._cmpFor(cat); if (s.codes.includes(code) || this._cmpSlotCount(cat) >= 10) return; s.codes.push(code); this._redrawBig(); }
  _cmpRemoveCountry(cat, code) { const s = this._cmpFor(cat); s.codes = s.codes.filter(c => c !== code); this._redrawBig(); }
  _cmpAddGroup(cat, key) { const s = this._cmpFor(cat); if (!GROUPS[key] || s.groups.includes(key) || this._cmpSlotCount(cat) >= 10) return; s.groups.push(key); this._redrawBig(); }
  _cmpRemoveGroup(cat, key) { const s = this._cmpFor(cat); s.groups = s.groups.filter(k => k !== key); this._redrawBig(); }
  _cmpReset(cat) { const s = this._cmpFor(cat); if (!s.codes.length && !s.groups.length) return; s.codes = []; s.groups = []; this._redrawBig(); }
  _redrawBig() { if (this._enlarged) this._drawBig(this._enlarged); }

  // ── compare controls (dropdown + chips) — one shared HTML host, refreshed per open category ──
  _cmpControlsHost() { return document.getElementById(this.container.id + "-controls"); }
  _hideCmpControls() { const host = this._cmpControlsHost(); if (host) host.style.display = "none"; }
  _buildCmpControls(cat) {
    const host = this._cmpControlsHost(); if (!host) return;
    host.style.display = "";
    if (host.dataset.wired !== "1") {
      host.dataset.wired = "1";
      const eu = this.data.euAggregateCode();
      const countries = [...this.data.countriesByCode.values()].filter(c => c.code !== eu).sort((a, b) => a.name.localeCompare(b.name));
      const groupOpts = Object.entries(GROUPS).map(([key, g]) => `<option value="group:${key}">${g.label}</option>`).join("");
      const countryOpts = countries.map(c => `<option value="${c.code}">${c.name}</option>`).join("");
      // Handlers read `this._enlarged` at CLICK time (not a closed-over `cat`) so the one wired-once
      // dropdown always acts on whichever category is currently open, even after switching panels.
      host.innerHTML =
        `<span class="ac-add"><label for="${this.container.id}-cmp-add" class="ac-add-label">Compare</label>` +
        `<select id="${this.container.id}-cmp-add" class="ac-select"><option value="">Add a country or group…</option>` +
        `<optgroup label="Groups">${groupOpts}</optgroup><optgroup label="Countries">${countryOpts}</optgroup></select></span>` +
        `<span class="ac-chips" role="list"></span>` +
        `<button type="button" class="ac-reset" hidden>Reset</button>`;
      host.querySelector(".ac-select").addEventListener("change", (e) => {
        const v = e.target.value; e.target.value = ""; if (!v || !this._enlarged) return;
        if (v.startsWith("group:")) this._cmpAddGroup(this._enlarged, v.slice(6)); else this._cmpAddCountry(this._enlarged, v);
      });
      host.querySelector(".ac-reset").addEventListener("click", () => { if (this._enlarged) this._cmpReset(this._enlarged); });
    }
    this._renderCmpChips(cat);
  }
  _renderCmpChips(cat) {
    const host = this._cmpControlsHost(); if (!host) return;
    const chips = host.querySelector(".ac-chips"); if (!chips) return;
    const s = this._cmpFor(cat);
    // Groups first (chip shows ONLY the group's name, never its member list), then countries —
    // same convention as AnnotatedLine's compare chips.
    const groupChips = s.groups.map(key => `<span class="ac-chip" role="listitem">${GROUPS[key]?.label || key}<button type="button" class="ac-chip-x" data-group="${key}" aria-label="Remove ${GROUPS[key]?.label || key}">×</button></span>`);
    const codeChips = s.codes.map(code => `<span class="ac-chip" role="listitem">${this.data.countryName(code)}<button type="button" class="ac-chip-x" data-code="${code}" aria-label="Remove ${this.data.countryName(code)}">×</button></span>`);
    chips.innerHTML = groupChips.join("") + codeChips.join("");
    chips.querySelectorAll(".ac-chip-x[data-code]").forEach(b => b.addEventListener("click", () => this._cmpRemoveCountry(cat, b.dataset.code)));
    chips.querySelectorAll(".ac-chip-x[data-group]").forEach(b => b.addEventListener("click", () => this._cmpRemoveGroup(cat, b.dataset.group)));
    const reset = host.querySelector(".ac-reset"); if (reset) reset.hidden = !this._cmpSlotCount(cat);
    const sel = host.querySelector(".ac-select"); if (sel) sel.disabled = this._cmpSlotCount(cat) >= 10;
  }

  _drawBig(code) {
    this._heroG.selectAll("*").remove();   // full rebuild every time — matches every caller (enlarge, collapse, any compare-selection change)
    const c = CATS.find(k => k.code === code);
    const s = this._fullSeries(code);
    if (!s.length) return;
    const M = this.opts.margin;
    // [debug 2026-07-06 — feature request] The hero panel reserves its OWN, wider right margin —
    // AnnotatedLine gives compare labels 74px of right margin (its whole chart is sized around that
    // need); the small-multiples grid's own right margin (20px, sized for short "+25%" end-tags) left
    // group labels like "Nordic (EU members)" running off the plot's right edge. Only this drawing's
    // own width narrows — `this._iw`/`this.opts.margin` stay exactly as the grid panels need them.
    // [debug 2026-07-07 — owner bug report, 1st fix] That 150px was ALWAYS reserved, even with nothing
    // compared yet — the far more common case right after enlarging — leaving a permanent dead strip
    // on the right (measured: plot ended at x=606 of a 756px-wide SVG, a 150px empty gap with nothing
    // drawn in it). Recomputed from the REAL state at enlarge/redraw time instead of a flat constant:
    // only reserve a compare-label gutter once a country/group is actually selected; otherwise use the
    // SAME right margin the grid panels themselves use, so the panel fills its frame by default.
    // [debug 2026-07-07 — owner bug report, 2nd fix, same day, SUPERSEDED by the 3rd fix directly below]
    // Measuring the widest label in the CURRENT selection fixed the single-country case (~30px, was
    // 150px) but a compared GROUP's long label ("Nordic (EU members)") still measured ~140px and the
    // plot still visibly shrank the moment a group was picked — the owner wants NO selection, country
    // or group, to change the plot's size at all.
    // [debug 2026-07-07 — owner bug report, 3rd fix, same day] `heroRight` is now a hard CONSTANT sized
    // only for the short country-code case — probed once from "XX" (every real code is exactly 2
    // letters in this monospace label font, so a 2-char probe is exact, not a guess) — and never grows
    // for a long group label. A label that wouldn't fit inside that fixed budget is drawn, measured,
    // and removed if it overflows (below) rather than resizing the gutter to fit it — the same "no
    // individual label, identify by colour + hover" pattern this function already uses for a group's
    // own pale member lines. The compare chip's own text name and the hover tooltip (already listing
    // every compared series, D69) both still identify an unlabelled line fully.
    const cmp = this._cmpFor(code);
    const hasCompare = cmp.codes.length > 0 || cmp.groups.length > 0;
    let heroRight = M.right;
    if (hasCompare) {
      const probe = this._heroG.append("text").attr("class", "sm-cmp-label").style("opacity", 0).text("XX");
      heroRight = Math.max(M.right, Math.ceil(probe.node().getComputedTextLength()) + 10);
      probe.remove();
    }
    const x0 = M.left, y0 = M.top, w = this.W - M.left - heroRight, h = this._ih;
    const color = getCSS(`--cat-${c.cls}`);
    // [debug 2026-07-06 — feature request] Ordered "slot" list — countries then groups, one CMP
    // colour per slot by index — same shared-palette pattern as AnnotatedLine's _drawExtras, so a
    // country/group keeps the same colour whichever panel it's compared against. Each slot's own
    // series (+ a showMembers group's member series) is computed ONCE here and reused for both the
    // y-domain extension below and the actual line-drawing further down.
    const slots = [
      ...cmp.codes.map(sc => ({ kind: "code", code: sc })),
      ...cmp.groups.map(key => ({ kind: "group", key })),
    ].map((slot, i) => {
      const col = CMP[i % CMP.length];
      if (slot.kind === "code") return { ...slot, col, series: this._cmpSeries(slot.code, code) };
      const g = GROUPS[slot.key];
      if (!g) return { ...slot, col, series: [], members: [] };
      const members = g.showMembers ? g.members.map(mc => ({ code: mc, series: this._cmpSeries(mc, code) })) : [];
      return { ...slot, col, series: this._cmpGroupAvg(g.members, code), members };
    });
    const x0Data = s[0].t, x1Data = s.at(-1).t;
    const xs = d3.scaleTime().domain([x0Data, x1Data]).range([0, w]);
    let vmax = d3.max(s, d => d.v), vmin = Math.min(0, d3.min(s, d => d.v));
    slots.forEach(slot => {
      const m = d3.max(slot.series, d => d.v); if (m != null && m > vmax) vmax = m;
      const n = d3.min(slot.series, d => d.v); if (n != null && n < vmin) vmin = n;
      (slot.members || []).forEach(mem => {
        const mm = d3.max(mem.series, d => d.v); if (mm != null && mm > vmax) vmax = mm;
        const mn = d3.min(mem.series, d => d.v); if (mn != null && mn < vmin) vmin = mn;
      });
    });
    const ys = d3.scaleLinear().domain([vmin, Math.ceil(vmax * 1.08)]).range([h, 0]).nice();
    // scrim (click-out to collapse)
    this._heroG.append("rect").attr("class", "sm-scrim").attr("x", 0).attr("y", 0).attr("width", this.W).attr("height", this.H)
      .attr("fill", "var(--bg)").attr("opacity", 1).style("cursor", "zoom-out").on("click", () => this._collapse());
    const g = this._heroG.append("g").attr("transform", `translate(${x0},${y0})`);
    // axes
    ys.ticks(6).forEach(t => {
      g.append("line").attr("class", t === 0 ? "sm-zero" : "sm-grid").attr("x1", 0).attr("x2", w).attr("y1", ys(t)).attr("y2", ys(t));
      g.append("text").attr("class", "sm-ytick").attr("x", -8).attr("y", ys(t) + 3).attr("text-anchor", "end").text(`${t}%`);
    });
    this._yearTicks(g, xs, h + 16);
    // area + line
    const gradId = `sm-big-grad-${code}`;
    let defs = this.svg.select("defs"); if (defs.empty()) defs = this.svg.append("defs");
    if (defs.select(`#${gradId}`).empty()) {
      const lg = defs.append("linearGradient").attr("id", gradId).attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 1);
      lg.append("stop").attr("offset", "0%").attr("stop-color", color).attr("stop-opacity", 0.32);
      lg.append("stop").attr("offset", "100%").attr("stop-color", color).attr("stop-opacity", 0.02);
    }
    const area = d3.area().x(d => xs(d.t)).y0(ys(0)).y1(d => ys(d.v)).curve(d3.curveMonotoneX);
    g.append("path").datum(s).attr("class", "sm-big-area").attr("d", area).attr("fill", `url(#${gradId})`);
    const line = d3.line().x(d => xs(d.t)).y(d => ys(d.v)).curve(d3.curveMonotoneX);
    g.append("path").datum(s).attr("class", "sm-big-line").attr("d", line).attr("fill", "none").attr("stroke", color).attr("stroke-width", 2.8).attr("stroke-linejoin", "round");
    // peak + end tags
    const peak = d3.greatest(s, d => d.v), last = s.at(-1);
    g.append("circle").attr("cx", xs(peak.t)).attr("cy", ys(peak.v)).attr("r", 5).attr("fill", color).attr("stroke", "var(--bg)").attr("stroke-width", 1.6);
    g.append("text").attr("class", "sm-big-peak").attr("x", xs(peak.t)).attr("y", ys(peak.v) - 10).attr("text-anchor", "middle").text(`peak ${peak.v.toFixed(1)}%`);
    g.append("text").attr("class", "sm-big-end").attr("x", xs(last.t) - 6).attr("y", ys(last.v) - 8).attr("text-anchor", "end").text(`${last.v >= 0 ? "+" : ""}${last.v.toFixed(1)}% by ${d3.timeFormat("%b %Y")(last.t)}`);
    g.append("text").attr("class", "sm-big-hint").attr("x", w).attr("y", h - 4).attr("text-anchor", "end").text("Esc or click to go back");
    // [debug 2026-07-06 — feature request] compare lines — same ordered-slot/CMP-palette pattern as
    // AnnotatedLine._drawExtras: a showMembers group draws each member thin/pale in the slot's own
    // colour plus its average bold in that same colour (one cohesive cluster, not a rainbow); a plain
    // country draws one line. End labels de-collide vertically the same way AnnotatedLine's do.
    const cmpLine = d3.line().x(d => xs(d.t)).y(d => ys(d.v)).curve(d3.curveMonotoneX);
    const cmpLabels = [];
    slots.forEach(slot => {
      if (slot.kind === "code") {
        if (!slot.series.length) return;
        g.append("path").datum(slot.series).attr("class", "sm-cmp-line").attr("fill", "none")
          .attr("stroke", slot.col).attr("stroke-width", 1.5).attr("stroke-opacity", 0.9).attr("stroke-linejoin", "round").attr("d", cmpLine);
        const end = slot.series.at(-1);
        cmpLabels.push({ text: slot.code, col: slot.col, x: xs(end.t), y: ys(end.v) });
        return;
      }
      (slot.members || []).forEach(mem => {
        if (!mem.series.length) return;
        g.append("path").datum(mem.series).attr("class", "sm-cmp-line sm-cmp-line--member").attr("fill", "none")
          .attr("stroke", slot.col).attr("stroke-width", 1).attr("stroke-opacity", 0.35).attr("stroke-linejoin", "round").attr("d", cmpLine);
      });
      if (!slot.series.length) return;
      g.append("path").datum(slot.series).attr("class", "sm-cmp-line sm-cmp-line--avg").attr("fill", "none")
        .attr("stroke", slot.col).attr("stroke-width", 2.2).attr("stroke-opacity", 0.95).attr("stroke-linejoin", "round").attr("d", cmpLine);
      const end = slot.series.at(-1);
      cmpLabels.push({ text: GROUPS[slot.key]?.label || slot.key, col: slot.col, x: xs(end.t), y: ys(end.v) });
    });
    cmpLabels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < cmpLabels.length; i++) if (cmpLabels[i].y - cmpLabels[i - 1].y < 13) cmpLabels[i].y = cmpLabels[i - 1].y + 13;
    // [debug 2026-07-07 — owner bug report, 3rd fix] `heroRight` no longer grows to fit a long label
    // (see above) — draw each label, measure its REAL rendered width, and drop it if it would run past
    // the fixed gutter's edge, instead of ever resizing the plot to make room. Always true for a short
    // country code (that's what the fixed gutter is sized for); typically true for a group's name.
    const maxLabelX = w + heroRight - 2;
    cmpLabels.forEach(l => {
      const startX = Math.min(l.x + 4, w - 2);
      const t = g.append("text").attr("class", "sm-cmp-label").attr("x", startX).attr("y", l.y + 3)
        .attr("text-anchor", "start").attr("paint-order", "stroke").attr("stroke", "var(--bg)").attr("stroke-width", 3).attr("fill", l.col).text(l.text);
      if (startX + t.node().getComputedTextLength() > maxLabelX) t.remove();
    });
    // [debug 2026-07-07 — owner bug report] Hover tooltip used to read ONLY the category's own base
    // series `s` — with a country/group compared, their lines are drawn (above) but the tooltip never
    // learned about them, same bug already fixed for AnnotatedLine in Session 40. Reusing that EXACT
    // series-builder pattern (not forked): walk `slots` — already built above in the same combined
    // codes-then-groups order the lines themselves use, each with its own CMP colour and (for a
    // showMembers group) its already-resolved member series — and add one row per visible line, group
    // averages plus member rows only where members are actually drawn. `slots` is reused directly
    // (computed once for the lines, no second pass) rather than rebuilt from scratch per mousemove.
    const hit = g.append("rect").attr("class", "sm-hit").attr("x", 0).attr("y", 0).attr("width", w).attr("height", h).attr("fill", "transparent");
    const cur = g.append("g").attr("class", "sm-cursor").attr("pointer-events", "none").style("opacity", 0);
    cur.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", h);
    const hoverDots = cur.append("g").attr("class", "sm-hover-dots");
    const bisect = d3.bisector(d => d.t).left;
    const nearest = (data, t) => {
      const i = bisect(data, t), a = data[Math.max(0, i - 1)], b = data[Math.min(data.length - 1, i)];
      return (!a || (b && (t - a.t) > (b.t - t))) ? b : a;
    };
    hit.on("mousemove", (event) => {
      const [mx] = d3.pointer(event, g.node());
      const t = xs.invert(mx);
      const series = [{ key: "cat", name: c.label, color, data: s, sw: null }];
      slots.forEach((slot, i) => {
        const sw = `ac-sw--c${i % CMP.length}`;
        if (slot.kind === "code") { if (slot.series.length) series.push({ key: slot.code, name: this.data.countryName(slot.code), color: slot.col, data: slot.series, sw }); return; }
        const grp = GROUPS[slot.key]; if (!grp) return;
        if (slot.series.length) series.push({ key: `grp:${slot.key}`, name: grp.label, color: slot.col, data: slot.series, sw });
        (slot.members || []).forEach(mem => { if (mem.series.length) series.push({ key: `grp:${slot.key}:${mem.code}`, name: this.data.countryName(mem.code), color: slot.col, data: mem.series, sw, member: true }); });
      });
      const rows = series.map(sr => { const rec = nearest(sr.data, t); return rec ? { ...sr, rec } : null; }).filter(Boolean);
      if (!rows.length) { cur.style("opacity", 0); this.ctx.tooltip.hide(); return; }
      const anchorT = rows[0].rec.t;
      cur.style("opacity", 1).attr("transform", `translate(${xs(anchorT)},0)`);
      hoverDots.selectAll("circle").data(rows, d => d.key).join(
        enter => enter.append("circle").attr("cx", 0).attr("stroke", "var(--bg)").attr("stroke-width", 1.4),
        update => update, exit => exit.remove()
      ).attr("r", d => d.member ? 2.8 : 4).attr("cy", d => ys(d.rec.v)).attr("fill", d => d.color).attr("fill-opacity", d => d.member ? 0.6 : 1);
      const multi = rows.length > 1;
      const html = multi
        ? `<h5>${d3.timeFormat("%b %Y")(anchorT)}</h5>` + rows.map(r =>
            `<div class="row${r.member ? " row--member" : ""}"><span class="key"><span class="ac-sw ${r.sw || "ac-sw--eu"}"></span>${r.name}</span><span class="val">${r.rec.v >= 0 ? "+" : ""}${r.rec.v.toFixed(1)}%</span></div>`
          ).join("")
        : `<h5>${c.label}</h5><div class="row"><span class="key">${d3.timeFormat("%b %Y")(anchorT)}</span><span class="val">${rows[0].rec.v >= 0 ? "+" : ""}${rows[0].rec.v.toFixed(1)}%</span></div>`;
      this.ctx.tooltip.show(html, event.clientX, event.clientY);
    }).on("mouseleave", () => { cur.style("opacity", 0); this.ctx.tooltip.hide(); });
    // category title ABOVE the scrim (the global kicker sits hidden behind it during the enlarge)
    this._heroG.append("text").attr("class", "kick-num").attr("x", M.left - 2).attr("y", this._isPhone ? 36 : 46)
      .style("font-size", this._isPhone ? "26px" : "34px").text(c.label.toUpperCase());
    this._buildCmpControls(code);
  }

  destroy() {
    if (this._escBound) document.removeEventListener("keydown", this._escHandler);
    if (this._onScroll) removeEventListener("scroll", this._onScroll);
    if (this._onResize) removeEventListener("resize", this._onResize);
    super.destroy();
  }
  onThemeChange() { this.render(); }
}
