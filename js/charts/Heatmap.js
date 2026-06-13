/* ============================================================
   Heatmap — country (rows) × category (cols), annual mean YoY.
   Depth:
     1. computation — annual means per (country, category)
     2. interaction — year slider; click column header to sort
     3. annotation — peak cell auto-labelled
     4. encoding   — diverging seq cells
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { KEY_CATEGORIES } from "../modules/dataManager.js";
import { watchChapterProgress, progressBetween } from "../modules/ChartMotion.js";

export class Heatmap extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 110, right: 16, bottom: 24, left: 116 }, aspect: 0.85 });
    this.year = null;
    this.sortBy = "CP00";
    this.controlsEl = document.getElementById("chart-heatmap-controls");
    this._stepIdx = 0;          // which scroll step is active (drives the editorial kicker)
    this._chapterUnsub = null;  // [R3-motion] scroll-progress subscription (step-1 year scrub)
    this._userControlled = false; // user grabbed the slider → progress scrub yields the year
  }

  // [R3-motion] The "scrub through the years" walk for step 1. Round-2 drove this
  // with a wall-clock setInterval, which DECOUPLED the year from scroll: the
  // matrix cycled perpetually while dwelling, and scrolling back up froze on
  // whatever random year the timer happened to be on (film: down/034202 read 2022,
  // up/034198 read 2021 at the SAME scroll-y; back-to-step0 stuck on 2024; step-2's
  // sort inherited a random year). It is now driven by scroll PROGRESS within
  // step 1 — deterministic, reversible, idempotent (≤3 grid morphs total, no
  // background timer, no jank), and faithful to the project's "motion tied to
  // scroll" ethos. Reduced-motion: no subscription — step 1 jumps to 2022.
  static SCRUB_YEARS = [2021, 2022, 2023, 2024];

  // Short column-header labels so the rotated headers never overflow into the
  // legend zone (full labels stay in the tooltip).
  static SHORT_LABEL = {
    CP00: "All items", CP01: "Food", CP04: "Housing", CP045: "Electricity",
    CP07: "Transport", CP11: "Restaurants", NRG: "Energy", SERV: "Services"
  };

  // Color-scale anchors. 2022 is the chapter's whole point — its values run
  // median 14 %, p75 24 %, up to 117 % (NL electricity). A flat linear-to-25
  // ramp clamped ~⅓ of all 2022 cells to identical wine, so the "wall of red"
  // could not be read as a SHAPE. These anchors give the heavily-populated
  // 5–28 % band real, monotonic spread (the eye finally sees structure), and
  // park everything ≥ ~28 % at wine = "off the charts" — the handful of >40 %
  // monsters are then disambiguated by their printed value + the hottest-cell
  // callout, not by an impossible-to-read darker-than-darkest colour. 2 ≈ ECB
  // target (moss); < 0 = sage (deflation). Honest: monotonic, real breakpoints.
  static SCALE_DOMAIN = [-2, 0, 2, 5, 10, 18, 28, 40];
  // Legend tick labels (must line up 1:1 with a readable subset of the domain).
  static SCALE_TICKS = [
    { v: -2, t: "<0" }, { v: 2, t: "2" }, { v: 5, t: "5" },
    { v: 10, t: "10" }, { v: 18, t: "18" }, { v: 40, t: "40+" }
  ];

  /** Single source of truth for the cell + legend colour scale (theme-aware). */
  _colorScale(pal) {
    const s = pal.seq;
    return d3.scaleLinear()
      .domain(Heatmap.SCALE_DOMAIN)
      .range([s[0], s[0], s[1], s[2], s[3], d3.interpolateLab(s[3], s[4])(0.5), s[4], s[4]])
      .interpolate(d3.interpolateLab)
      .clamp(true);
  }

  /** Per-step editorial kicker sub-line (names the insight, Reuters-tight). */
  _kickerSub() {
    const y = this.year;
    if (this._stepIdx === 2) {
      const lbl = Heatmap.SHORT_LABEL[this.sortBy] || this.data.categoryLabel(this.sortBy);
      return `sorted by ${lbl.toLowerCase()} — worst at the top`;
    }
    if (y <= 2021) return "patchy — energy & housing run hot, the rest is calm";
    if (y === 2022) return "almost every cell lights up — the wall of red";
    if (y === 2023) return "cooling from the top, but still elevated";
    return "back to calm — except a few stubborn services cells";
  }

  size() {
    if (!this.container) return { width: 600, height: 600 };
    const w = this.container.clientWidth || 600;
    const hAvail = this.container.clientHeight || 0;
    // On phone the SVG must FILL its (short) flex body exactly so the viewBox
    // aspect == the box aspect — otherwise preserveAspectRatio="meet" shrinks the
    // 336×420 board to fit ~189 px of height and letterboxes it to ~150 px wide
    // with tiny rows. Returning the true box height (with a sane floor so the CSS
    // panel-height bump can do its job) keeps cells full-width and as tall as the
    // panel allows.
    if ((this.container.clientWidth || 600) < 560) {
      return { width: w, height: Math.max(360, hAvail || Math.round(w / this.opts.aspect)) };
    }
    const hMin = Math.round(w / this.opts.aspect);
    return { width: w, height: Math.max(420, hAvail || hMin) };
  }

  render() {
    super.render();
    this.container.innerHTML = "";

    // --- Responsive margins -------------------------------------------------
    // On phone the long full-name row labels + 116 px left gutter crushed the
    // 8-col × 27-row matrix into ~6 px rows (unreadable). Compact mode uses
    // 2-letter ISO codes, a slim left gutter, and a shorter top gutter so the
    // cells get the width/height they need to stay legible.
    const probeW = this.container.clientWidth || 600;
    this.compact = probeW < 560;
    this.opts.margin = this.compact
      ? { top: 80, right: 10, bottom: 40, left: 34 }
      : { top: 110, right: 16, bottom: 24, left: 116 };

    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    const { width: iw, height: ih } = this.innerSize();

    const years = this.data.yearsCP00().filter(y => y >= 2018);
    // Default to 2022 — the chapter's climax (the "wall of red"). It's the most
    // important year AND the year the new encoding most dramatically improves,
    // so the resting / reduced-motion / first-paint state opens on the story.
    if (this.year == null) this.year = years.includes(2022) ? 2022 : (years.at(-2) || years.at(-1));
    this._years = years;
    const cats = KEY_CATEGORIES;
    this._cats = cats;

    const { x, color } = this._compute(iw, ih);

    // Kicker (top-left) — the year is the headline; the sub-line now does real
    // editorial work (names what THIS year/sort shows) instead of a static unit.
    const kY = this.compact ? 34 : 50;
    const kSubY = this.compact ? 52 : 72;
    this.kickerG = this.svg.append("g").attr("class", "year-kicker-g").attr("pointer-events", "none");
    this.kickerY = this.kickerG.append("text").attr("class", "year-kicker")
      .attr("x", 22).attr("y", kY).text(String(this.year));
    this.kickerSub = this.kickerG.append("text").attr("class", "year-kicker-sub")
      .attr("x", 26).attr("y", kSubY).text(this._kickerSub());

    // Color-scale legend (decodable WITHOUT hover — WCAG). Replaces the old
    // top-right text legend, which collided with the rotated column headers.
    // Desktop: left gutter under the kicker. Phone: a clean band BELOW the grid
    // (the cramped top band there is owned by the kicker + rotated headers).
    if (this.compact) {
      this._drawScaleLegend(color, 26, height - this.opts.margin.bottom + 26);
    } else {
      this._drawScaleLegend(color, 26, kSubY + 18);
    }

    // column headers — SHORT labels, rotated; never overflow into the legend.
    const headRot = this.compact ? -40 : -32;
    this.g.selectAll("g.col-head").data(cats).join("g").attr("class", "col-head")
      .attr("transform", c => `translate(${x(c) + x.bandwidth() / 2}, -8)`)
      .each((c, i, nodes) => {
        const g = d3.select(nodes[i]);
        const label = Heatmap.SHORT_LABEL[c] || this.data.categoryLabel(c);
        g.append("text").attr("class", `hm-col-head ${c === this.sortBy ? "hm-col-head--active" : ""}`)
          .attr("transform", `rotate(${headRot})`)
          .attr("text-anchor", "start")
          .text(label);
        g.append("rect").attr("class", "hm-col-hit")
          .attr("x", -x.bandwidth() / 2).attr("y", -42)
          .attr("width", x.bandwidth()).attr("height", 50)
          .attr("fill", "transparent").style("cursor", "pointer")
          .on("click", () => { this._stopAutoscrub(); this._userSorted = true; this._changeSort(c, true); });
      });

    // Cells, in-cell values, row labels and the hottest-cell callout are all
    // year-dependent — drawn (and re-drawn on scrub) by _drawGrid.
    this._drawGrid(false);

    this._renderControls(years);
    this._lastYear = this.year;

    // [R3-motion] Subscribe ONCE to chapter scroll progress so step 1's year
    // walk is driven by the reader's scroll (replaces the wall-clock timer).
    // Reduced-motion users get no subscription — their step 1 snaps to 2022.
    if (this._chapterUnsub) { this._chapterUnsub(); this._chapterUnsub = null; }
    if (!this.ctx?.motion?.reduced) {
      const chapter = this.container.closest(".chapter");
      if (chapter) {
        this._measureScrubWindow(chapter);
        this._chapterUnsub = watchChapterProgress(chapter, p => this._onScrub(p));
      }
    }
  }

  /** Cache the chapter-progress values at which scrollama hands step 1 → step 2,
   *  so _onScrub can map progress inside that window to a year. watchChapterProgress
   *  emits p = (vh − chapterTop) / (chapterHeight + vh); a step becomes active when
   *  its top crosses vh·0.55 (scrollama offset), i.e. at scrollY = stepTop − vh·0.55.
   *  Converting that scrollY to the same p formula gives a robust, viewport-stable
   *  window with NO per-tick getBoundingClientRect (measured once on render). */
  _measureScrubWindow(chapter) {
    const vh = innerHeight;
    const cr = chapter.getBoundingClientRect();
    const chapTop = cr.top + scrollY;
    const total = cr.height + vh;
    const steps = [...chapter.querySelectorAll(".scroller__step")];
    const pAt = el => {
      const stepTop = el.getBoundingClientRect().top + scrollY;
      const triggerY = stepTop - vh * 0.55;            // scrollY when this step goes active
      return Math.max(0, Math.min(1, (vh - (chapTop - triggerY)) / total));
    };
    // p at step-1-active and step-2-active. The scrub interpolates between them.
    this._scrubP1 = steps[1] ? pAt(steps[1]) : 0.33;
    this._scrubP2 = steps[2] ? pAt(steps[2]) : 0.66;
  }

  /** Continuous scroll handler: while step 1 is the active step, map progress
   *  across [_scrubP1, _scrubP2] to a year in SCRUB_YEARS and morph the grid only
   *  when that year actually changes (idempotent; ≤3 morphs across the whole
   *  dwell; reversible on up-scroll). Inactive on every other step, in reduced
   *  motion, and once the user has grabbed the slider. */
  _onScrub(p) {
    if (this._stepIdx !== 1 || this._userControlled || this.ctx?.motion?.reduced) return;
    const yr = this._scrubYear(p);
    if (yr !== this.year) this._changeYear(yr, true);
  }

  /** Progress → year. Buckets the step-1 window evenly across the 4 years, with a
   *  small clamp so entering/leaving the step lands cleanly on the end years. */
  _scrubYear(p) {
    const seq = Heatmap.SCRUB_YEARS;
    const t = progressBetween(p, this._scrubP1 ?? 0.33, this._scrubP2 ?? 0.66);
    const idx = Math.max(0, Math.min(seq.length - 1, Math.floor(t * seq.length - 1e-6)));
    return seq[idx];
  }

  /** Recompute the matrix + scales for the current year/sort. Stores them on
   *  `this` so the scrub path can re-draw without rebuilding the scaffold. */
  _compute(iw, ih) {
    const cats = this._cats || KEY_CATEGORIES;
    const codes = this.data.euCodes();
    const matrix = codes.map(code => {
      const row = { code, name: this.data.countryName(code) };
      cats.forEach(c => { row[c] = this.data.hicpAnnual[code]?.[c]?.[String(this.year)] ?? null; });
      return row;
    }).filter(r => Number.isFinite(r[this.sortBy]) || cats.some(c => Number.isFinite(r[c])));
    matrix.sort((a, b) => (b[this.sortBy] ?? -Infinity) - (a[this.sortBy] ?? -Infinity));

    if (iw != null) this._iw = iw;
    if (ih != null) this._ih = ih;
    const x = d3.scaleBand().domain(cats).range([0, this._iw]).padding(0.06);
    const y = d3.scaleBand().domain(matrix.map(r => r.code)).range([0, this._ih]).padding(0.06);
    const color = this._colorScale(this.palette());
    this.x = x; this.y = y; this.matrix = matrix; this.color = color;
    return { x, y, color, matrix };
  }

  /** Draw / update the cells + value labels + row labels + hottest callout for
   *  the current year. When `animate` and not reduced-motion, cells and labels
   *  SLIDE to their new rows and tween fill, and the ring flies to the new
   *  hottest cell — so scrubbing the year literally shows the shock migrate
   *  (2021 patchy → 2022 wall of red → 2024 calm). */
  _drawGrid(animate) {
    const { x, y, matrix, color } = this;
    const cats = this._cats;
    const reduced = this.ctx?.motion?.reduced;
    const dur = (animate && !reduced) ? 720 : 0;
    const ease = d3.easeCubicInOut;
    const noData = getCSS("--rule-soft");

    const cellData = [];
    matrix.forEach(r => cats.forEach(c => cellData.push({ code: r.code, cat: c, v: r[c], name: r.name })));

    // cells
    const cells = this.g.selectAll("rect.cell").data(cellData, d => `${d.code}-${d.cat}`);
    cells.exit().remove();
    const cellsEnter = cells.enter().append("rect")
      .attr("class", "cell hm-cell")
      .attr("x", d => x(d.cat)).attr("y", d => y(d.code))
      .attr("width", x.bandwidth()).attr("height", y.bandwidth())
      .attr("fill", d => d.v == null ? noData : color(d.v))
      .attr("rx", 1);
    const cellsAll = cellsEnter.merge(cells);
    cellsAll
      .on("mouseenter", (e, d) => this._focusCell(e.currentTarget, d, e))
      .on("mousemove", e => this.ctx.tooltip.move(e.clientX, e.clientY))
      .on("mouseleave", e => this._blurCell(e.currentTarget))
      // Touch parity (the chart's info must not be hover-only — WCAG / mobile).
      .on("pointerdown", (e, d) => { if (e.pointerType !== "mouse") this._focusCell(e.currentTarget, d, e); });
    cellsAll.transition().duration(dur).ease(ease)
      .attr("x", d => x(d.cat)).attr("y", d => y(d.code))
      .attr("width", x.bandwidth()).attr("height", y.bandwidth())
      .attr("fill", d => d.v == null ? noData : color(d.v));

    // --- In-cell value labels (desktop, when cells are wide enough) ----------
    // Round-1's top remaining lever: the numbers lived only in the tooltip, so
    // the matrix taught nothing statically or on touch — and the >40 % monsters
    // (NL 117 %) were colour-clamped to the same wine as a 28 % cell. Printing
    // the value in-cell makes the chart a heatmap AND a table, and is what
    // finally separates the extremes the colour scale honestly cannot. Text
    // colour is the higher-contrast of --ink / --bg per cell (theme-safe, AA).
    const showVals = !this.compact && x.bandwidth() >= 30 && y.bandwidth() >= 10.5;
    const ink = getCSS("--ink"), bg = getCSS("--bg");
    if (showVals) {
      const vals = this.g.selectAll("text.hm-val")
        .data(cellData.filter(d => d.v != null), d => `${d.code}-${d.cat}`);
      vals.exit().remove();
      const valsEnter = vals.enter().append("text")
        .attr("class", "hm-val")
        .attr("text-anchor", "middle").attr("dominant-baseline", "central")
        .attr("x", d => x(d.cat) + x.bandwidth() / 2)
        .attr("y", d => y(d.code) + y.bandwidth() / 2);
      const valsAll = valsEnter.merge(vals);
      // Text + fill flip at the transition midpoint so the number never sits
      // unreadable on a mid-morph fill.
      valsAll.text(d => fmtCell(d.v));
      valsAll.transition().duration(dur).ease(ease)
        .attr("x", d => x(d.cat) + x.bandwidth() / 2)
        .attr("y", d => y(d.code) + y.bandwidth() / 2)
        .attr("fill", d => bestText(color(d.v), ink, bg));
    } else {
      this.g.selectAll("text.hm-val").remove();
    }

    // row labels — full names on desktop, 2-letter ISO codes when compact.
    const rl = this.g.selectAll("text.row-label").data(matrix, d => d.code);
    rl.exit().remove();
    const rlEnter = rl.enter().append("text")
      .attr("class", "row-label hm-row-label").attr("text-anchor", "end")
      .attr("x", -8).attr("y", d => y(d.code) + y.bandwidth() / 2 + 3);
    rlEnter.merge(rl).text(d => this.compact ? d.code : d.name)
      .transition().duration(dur).ease(ease)
      .attr("y", d => y(d.code) + y.bandwidth() / 2 + 3);

    // Hottest-cell callout (accent ring + accent value/row-label + caption).
    const peak = d3.greatest(cellData, d => d.v ?? -Infinity);
    this._drawPeak(peak, x, y, animate && !reduced, dur);
  }

  /** Outline a cell + show its tooltip (shared by hover and touch). `ev` is the
   *  D3-passed event (v7 passes it explicitly — we never touch the global). */
  _focusCell(node, d, ev) {
    d3.select(node).raise().classed("hm-cell--focus", true);
    const cx = ev?.clientX ?? 0, cy = ev?.clientY ?? 0;
    this.ctx.tooltip.show(
      `<h5>${d.name}</h5>
       <div class="row"><span class="key">${this.data.categoryLabel(d.cat)}</span><span class="val">${d.v == null ? "—" : d.v.toFixed(1) + "%"}</span></div>
       <div class="row"><span class="key">Year</span><span class="val">${this.year}</span></div>`,
      cx, cy);
  }
  _blurCell(node) {
    d3.select(node).classed("hm-cell--focus", false);
    this.ctx.tooltip.hide();
  }

  /** Accent ring on the hottest cell + accent its value & row label. */
  _drawPeak(peak, x, y, animate, dur = 0) {
    this.g.selectAll(".hm-val--peak").classed("hm-val--peak", false);
    this.g.selectAll(".hm-row-label--peak").classed("hm-row-label--peak", false);
    this._drawHottestCaption(peak);
    if (!peak || peak.v == null) { this.g.selectAll(".hm-peak-ring").remove(); return; }

    const cx = x(peak.cat) + x.bandwidth() / 2;
    const cy = y(peak.code) + y.bandwidth() / 2;
    const r = Math.min(x.bandwidth(), y.bandwidth()) / 2 + 3;

    // Accent the cell's own number + its country row-label so the eye lands on
    // the answer even before reading the caption (no element crosses the grid).
    this.g.selectAll("text.hm-val").filter(d => d.code === peak.code && d.cat === peak.cat)
      .classed("hm-val--peak", true);
    this.g.selectAll("text.hm-row-label").filter(d => d.code === peak.code)
      .classed("hm-row-label--peak", true);

    // Re-use the existing ring (so it can FLY to the new hottest cell on scrub)
    // rather than remove+append, which would just hard-cut.
    let ring = this.g.select("circle.hm-peak-ring");
    if (ring.empty()) {
      ring = this.g.append("circle").attr("class", "hm-peak-ring")
        .attr("cx", cx).attr("cy", cy).attr("r", r).attr("fill", "none");
    }
    if (animate) {
      ring.transition().duration(dur).ease(d3.easeCubicInOut)
        .attr("cx", cx).attr("cy", cy).attr("r", r);
    } else {
      ring.interrupt().attr("cx", cx).attr("cy", cy).attr("r", r).attr("opacity", 1);
    }
  }

  /** One compact editorial line under the legend naming the year's worst cell.
   *  Lives in the same tidy top-left column as kicker + legend (no floating
   *  stamp over the matrix). Accent is reserved for the value here. */
  _drawHottestCaption(peak) {
    this.svg.selectAll(".hm-hottest").remove();
    if (!peak || peak.v == null) return;
    const x0 = 26;
    const yTop = (this._legendBottomY || 110) + (this.compact ? 16 : 18);
    if (this.compact) return;   // phone: the ring + accent value carry it (no room)
    const g = this.svg.append("g").attr("class", "hm-hottest").attr("pointer-events", "none")
      .attr("transform", `translate(${x0}, ${yTop})`);
    g.append("text").attr("class", "hm-hottest__eyebrow").attr("y", 0).text("HOTTEST CELL");
    const cat = Heatmap.SHORT_LABEL[peak.cat] || this.data.categoryLabel(peak.cat);
    const line = g.append("text").attr("class", "hm-hottest__line").attr("y", 17);
    line.append("tspan").text(`${peak.name} · ${cat}  `);
    line.append("tspan").attr("class", "hm-hottest__num").text(`+${Math.round(peak.v)}%`);
  }

  // Continuous colour-scale ramp so the encoding is decodable without hover
  // (WCAG). A smooth gradient (not discrete chips) makes the new non-linear
  // spread legible — you can see the ramp slow down in the 10–28 % band where
  // most of 2022 lives. Kept narrow so it lives in the left gutter (desktop) /
  // below the grid (phone), clear of the rotated headers.
  _drawScaleLegend(color, x0, yTop) {
    const ticks = Heatmap.SCALE_TICKS;
    const barW = this.compact ? 132 : 116, barH = 8;
    const g = this.svg.append("g")
      .attr("class", "anno-legend hm-scale-legend")
      .attr("transform", `translate(${x0}, ${yTop})`)
      .attr("pointer-events", "none");
    g.append("text").attr("class", "hm-scale-unit").attr("x", 0).attr("y", -4)
      .text("ANNUAL HICP %");

    // Position along the bar is proportional to the value's place in the domain
    // span, so the gradient is an honest picture of where the breakpoints land.
    const D = Heatmap.SCALE_DOMAIN;
    const lo = D[0], hi = D[D.length - 1];
    const px = v => ((v - lo) / (hi - lo)) * barW;

    const gradId = `hm-grad-${this.compact ? "c" : "d"}`;
    const defs = g.append("defs");
    const grad = defs.append("linearGradient").attr("id", gradId)
      .attr("x1", "0%").attr("x2", "100%").attr("y1", "0%").attr("y2", "0%");
    const N = 24;
    for (let i = 0; i <= N; i++) {
      const v = lo + (hi - lo) * (i / N);
      grad.append("stop").attr("offset", `${(i / N) * 100}%`).attr("stop-color", color(v));
    }
    g.append("rect").attr("class", "hm-scale-bar")
      .attr("x", 0).attr("y", 0).attr("width", barW).attr("height", barH)
      .attr("fill", `url(#${gradId})`).attr("rx", 1.5);

    ticks.forEach(s => {
      const tx = px(s.v);
      g.append("line").attr("class", "hm-scale-tickmark")
        .attr("x1", tx).attr("x2", tx).attr("y1", 0).attr("y2", barH + 2);
      g.append("text").attr("class", "hm-scale-tick")
        .attr("x", tx).attr("y", barH + 12)
        .attr("text-anchor", s.v === lo ? "start" : (s.v === hi ? "end" : "middle"))
        .text(s.t);
    });
    // Record the legend's bottom edge so the hottest-cell caption can sit
    // cleanly beneath it in the same left-gutter column.
    this._legendBottomY = yTop + barH + 14;
  }

  _renderControls(years) {
    const c = this.controlsEl;
    if (!c) return;
    if (c.dataset.wired === "1") {
      c.querySelector('[data-year-lbl]').textContent = this.year;
      c.querySelector('input').value = this.year;
      return;
    }
    c.dataset.wired = "1";
    c.innerHTML = `
      <input type="range" min="${years[0]}" max="${years.at(-1)}" value="${this.year}" step="1" aria-label="Year" />
      <span class="hm-year-lbl" data-year-lbl></span>
      <span class="ctrl-hint">click column to sort</span>
    `;
    c.querySelector('[data-year-lbl]').textContent = this.year;
    c.querySelector('input').addEventListener("input", e => {
      this._stopAutoscrub();
      this._changeYear(+e.target.value, true);
    });
  }

  /** Animate the grid to a new year WITHOUT rebuilding the scaffold, so cells
   *  slide + recolour and the ring flies (the scrub reads as motion). Falls
   *  back to a full render if the SVG hasn't been built yet. */
  _changeYear(yr, animate) {
    if (yr === this.year && this.rendered) return;
    this.year = yr;
    if (!this.svg || !this.svg.node()?.isConnected) { this.render(); return; }
    this._compute();                       // re-sort rows + rescale for the new year
    if (this.kickerY) this.kickerY.text(String(yr));
    if (this.kickerSub) this.kickerSub.text(this._kickerSub());
    this._drawGrid(animate && !this.ctx?.motion?.reduced);
    const c = this.controlsEl;
    if (c && c.dataset.wired === "1") {
      c.querySelector('[data-year-lbl]').textContent = yr;
      c.querySelector('input').value = yr;
    }
    this._lastYear = yr;
  }

  /** Animate a sort-column change: rows FLIP into their new ranks and the
   *  active header turns accent — without a full rebuild (round-1 lever #6). */
  _changeSort(cat, animate) {
    if (cat === this.sortBy && this.rendered) return;
    this.sortBy = cat;
    if (!this.svg || !this.svg.node()?.isConnected) { this.render(); return; }
    this._compute();
    // Re-flag the active column header (groups are bound to their category code).
    this.g.selectAll("g.col-head").each((c, i, nodes) => {
      d3.select(nodes[i]).select("text.hm-col-head").classed("hm-col-head--active", c === cat);
    });
    if (this.kickerSub) this.kickerSub.text(this._kickerSub());
    this._drawGrid(animate && !this.ctx?.motion?.reduced);
  }

  // [R3-motion] The wall-clock setInterval autoscrub is gone — the step-1 year
  // walk is now driven by scroll progress (see _onScrub). This shim remains so
  // the slider / column-click handlers can mark the chart as user-controlled
  // (the progress scrub then yields the year to the user) without a code-path
  // change, and is a safe no-op for any legacy caller.
  _stopAutoscrub() { this._userControlled = true; }

  /** Each step OWNS its complete (year, sort) state, applied deterministically on
   *  enter and idempotent on re-enter. This is what makes reverse-scroll correct:
   *  scrolling back into a step restores exactly that step's intended state
   *  instead of inheriting a stale year/sort from a neighbour. */
  onStep(idx, el) {
    this._stepIdx = idx;
    const reduced = this.ctx?.motion?.reduced;

    // Leaving the scrub step re-arms scroll-driving: a momentary slider drag on
    // step 1 only overrides while the reader is there; returning later re-takes
    // control from scroll. (A deliberate column SORT still sticks via _userSorted.)
    if (idx !== 1) this._userControlled = false;

    if (idx === 0) {
      // Opening tableau: the climax year + natural (severity) sort. Round-2 left
      // year/sort untouched here, so scrolling up from the scrub froze on a random
      // year (film: back-to-step0 stuck on 2024 = mostly-green, contradicting the
      // "reds are bad" intro). Restore the canonical state, idempotently.
      if (!this._userSorted && this.sortBy !== "CP00") this._changeSort("CP00", true);
      this._changeYear(2022, true);
      if (this.kickerSub) this.kickerSub.text(this._kickerSub());
      return;
    }

    if (idx === 1) {
      // Year is owned by the scroll-progress scrub. Restore the sort (a step-2
      // Housing sort must not leak back into step 1 on reverse scroll) and set the
      // year for the CURRENT scroll position so entry from either direction shows
      // the right year instantly (no wait for the next progress tick).
      if (!this._userSorted && this.sortBy !== "CP00") this._changeSort("CP00", true);
      if (reduced) { this._changeYear(2022, false); return; }
      if (!this._userControlled) {
        const r = this.container.closest(".chapter")?.getBoundingClientRect();
        if (r) {
          const p = Math.max(0, Math.min(1, (innerHeight - r.top) / (r.height + innerHeight)));
          this._changeYear(this._scrubYear(p), true);
        }
      }
      if (this.kickerSub) this.kickerSub.text(this._kickerSub());
      return;
    }

    if (idx === 2) {
      // The sort story is "in 2022, sort by housing → the Baltics pin to the top".
      // Pin the year to the climax (round-2 inherited whatever year the timer froze
      // on — film: step-2 showed 2021 housing, the wrong story) and sort by Housing
      // unless the reader has chosen a column themselves.
      this._changeYear(2022, true);
      if (!this._userSorted) this._changeSort("CP04", true);
      else if (this.kickerSub) this.kickerSub.text(this._kickerSub());
    }
  }

  destroy() {
    if (this._chapterUnsub) { this._chapterUnsub(); this._chapterUnsub = null; }
    super.destroy?.();
  }

  onThemeChange() { this.render(); }
}

function getCSS(name) {
  const m = name.match(/var\((--[^)]+)\)/); const n = m ? m[1] : name;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888";
}

// In-cell value: integer % (cells are small — decimals would be noise). The
// "−" sign shows for clear deflation; tiny values round honestly to "0".
function fmtCell(v) {
  if (v == null) return "";
  return String(Math.round(v));
}

// Pick whichever of two text colours has the higher WCAG contrast against the
// cell fill — keeps in-cell labels legible across the full ramp AND both
// themes without hardcoding a luminance threshold (tokens-only, AA-minded).
function bestText(bgHex, a, b) {
  return contrast(bgHex, a) >= contrast(bgHex, b) ? a : b;
}
function contrast(h1, h2) {
  const l1 = relLum(h1), l2 = relLum(h2);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
function relLum(col) {
  const rgb = toRgb(col);
  if (!rgb) return 0;
  const ch = rgb.map(c => {
    c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
// Accept both "#rrggbb" (tokens) and "rgb(r, g, b)" (what d3.interpolateLab
// emits for the scale) so the in-cell text contrast is computed correctly.
function toRgb(col) {
  if (!col) return null;
  const s = String(col).trim();
  const hx = s.match(/^#([0-9a-f]{6})$/i);
  if (hx) { const n = parseInt(hx[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rg = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rg) return [+rg[1], +rg[2], +rg[3]];
  return null;
}
