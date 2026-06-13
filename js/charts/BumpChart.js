/* ============================================================
   BumpChart — country rankings of electricity prices, 2019→2024
   The league table that reshuffled. Two protagonists carry the story:
   a hero CLIMBER (Czechia, rank 9 → 2) and a hero FALLER (Malta, 13 → 26).
   Direction is colour-encoded — climbers in terracotta accent, fallers in
   steel blue — so "who got dearer vs who got relatively cheaper" reads at a
   glance, and accent stays reserved for the lines doing editorial work.
   Depth:
     1. computation — rank per year from electricity[geo][year-S2]
     2. interaction — hover OR tap a country to isolate it + rank-by-year tooltip
     3. annotation — kicker readout + ▲/▼ rank-delta badges + direction hint
     4. encoding   — bump chart w/ monotone curves, direction-coloured spotlight
   ============================================================ */

import { BaseChart } from "./BaseChart.js";

// Captions + protagonists are derived from the CORRECTED electricity index
// (median-of-EUR per geo/semester in DataManager). Rank 1 = most expensive
// household electricity. Recomputed & verified against
// data/processed/electricity_prices.json (2026-06 elevation audit, 27 countries):
//   CLIMBERS  : CZ 9→2 (+7, the story), FR 14→7 (+7), EL 17→10 (+7)
//   FALLERS   : MT 13→26 (-13, biggest fall), RO 5→16 (-11), HR 16→25 (-9)
//   ANCHORS   : HU span 1 (26→27), IT span 2 (3→5), BE span 3 (2→4)
// Each line computes its rank live, so rendered numbers and this copy share one
// corrected source. Story countries are spotlighted by DIRECTION (see CLIMBERS
// / FALLERS sets), everyone else is the calm field.
const CLIMBERS = new Set(["CZ"]);          // hero climber (terracotta accent)
const FALLERS  = new Set(["MT"]);          // hero faller  (steel blue)

const STEP_CONFIG = [
  // Overview: both protagonists lit, one climbing, one falling — the reshuffle.
  { focus: ["CZ", "MT"], caption: "27 countries, ranked dearest-first. Two lines tell the story." },
  // The climber.
  { focus: ["CZ"],       caption: "Czechia · rank 9 → rank 2 — the sharpest climb up the league." },
  // The faller — the untold half of the reshuffle.
  { focus: ["MT"],       caption: "Malta · rank 13 → rank 26 — the steepest slide down it." },
  // The anchors: the ends held; the middle churned.
  { focus: ["HU", "IT", "BE"], caption: "Hungary, Italy, Belgium barely move. The middle re-ranked far more than the top and bottom." }
];

// Lines lit on the overview / by default = the two protagonists only. Accent is
// reserved: at most two lines ever carry colour at once.
const FOCUS_DEFAULT = new Set([...CLIMBERS, ...FALLERS]);

// Direction of a country's net move, used to colour its spotlight + delta badge.
// dir > 0 = climbed the table (got relatively dearer) → accent; dir < 0 = fell.
function moveDir(code) {
  if (CLIMBERS.has(code)) return "up";
  if (FALLERS.has(code)) return "down";
  return null;
}

export class BumpChart extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 88, right: 150, bottom: 36, left: 150 }, aspect: 1.0 });
    this._focusCodes = null;     // the active step's focus (array | null)
    this._stepCaption = null;
    this._hoverCode = null;      // mouse hover (clears on mouseleave)
    this._tapCode = null;        // touch: pinned line, survives finger lift
    this._touched = false;       // once true, ignore synthetic mouse events
  }

  /* Single source of truth for "which lines are lit right now", as an array.
     Priority: a touch-pinned tap → a mouse hover → the step's focus set. Hover/
     tap isolate ONE line; a step may light its 1–3 protagonists. One accessor so
     colour, labels, deltas and the reveal never disagree. */
  _activeCodes() {
    if (this._tapCode) return [this._tapCode];
    if (this._hoverCode) return [this._hoverCode];
    return this._focusCodes && this._focusCodes.length ? this._focusCodes.slice() : [];
  }

  size() {
    if (!this.container) return { width: 600, height: 600 };
    const w = this.container.clientWidth || 600;
    const hAvail = this.container.clientHeight || 0;
    const hMin = Math.round(w / this.opts.aspect);
    return { width: w, height: Math.max(420, hAvail || hMin) };
  }

  /* Side margins host the country labels at each end of every line. On a phone
     the desktop 150 px gutters crush the 6-year x-span to ~58 px, collapsing all
     lines into a vertical scribble and overprinting the year ticks. Scale the
     gutters (and the label detail level) to the available width so the plot keeps
     a usable horizontal span at every viewport. Returns {compact} so render()
     can shorten the labels when there isn't room for "9. Czechia". */
  _layout(width) {
    if (width < 560) {
      // phone / very narrow: rank number only at the ends, slim gutters
      this.opts.margin = { top: 76, right: 60, bottom: 34, left: 40 };
      return { compact: "rankOnly" };
    }
    if (width < 820) {
      // tablet: shorter gutters, keep "rank. Name"
      this.opts.margin = { top: 84, right: 116, bottom: 36, left: 116 };
      return { compact: "full" };
    }
    this.opts.margin = { top: 88, right: 150, bottom: 36, left: 150 };
    return { compact: "full" };
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    // Choose responsive margins BEFORE the svg/g scaffold reads them.
    const probeW = this.container.clientWidth || 600;
    const layout = this._layout(probeW);
    this._compact = layout.compact;
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    const { width: iw, height: ih } = this.innerSize();

    const years = [2019, 2020, 2021, 2022, 2023, 2024];
    const rows = [];
    this.data.countriesByCode.forEach((meta, code) => {
      const vals = years.map(y => ({
        year: y,
        v: this.data.electricity[code]?.[`${y}-S2`] ?? this.data.electricity[code]?.[`${y}-S1`]
      }));
      if (vals.every(v => v.v != null)) rows.push({ code, name: meta.name, vals });
    });

    const ranksByYear = {};
    years.forEach(y => {
      const sorted = rows.slice().sort((a, b) => {
        const av = a.vals.find(d => d.year === y).v;
        const bv = b.vals.find(d => d.year === y).v;
        return bv - av;
      });
      ranksByYear[y] = new Map(sorted.map((r, i) => [r.code, i + 1]));
    });

    const x = d3.scalePoint().domain(years).range([0, iw]).padding(0.1);
    const y = d3.scaleLinear().domain([1, rows.length]).range([0, ih]);

    // Kicker
    this.kickerG = this.svg.append("g").attr("class", "year-kicker-g").attr("pointer-events", "none");
    this.kickerY = this.kickerG.append("text").attr("class", "year-kicker")
      .attr("x", this.opts.margin.left).attr("y", 50).text("League table");
    this.kickerSub = this.kickerG.append("text").attr("class", "year-kicker-sub")
      .attr("x", this.opts.margin.left + 3).attr("y", 72).text(this._stepCaption || "electricity-price rank, 2019 → 2024");
    // Keep kicker text inside the SVG: width budget = inner plot + the right gutter.
    this._kickerMaxW = iw + this.opts.margin.right - 6;
    this._fitKicker();

    // Rank-direction hint at the top-left of the plot so "up = dearer" is explicit.
    this.g.append("text").attr("class", "bump-axis-hint")
      .attr("x", 0).attr("y", -10)
      .text("RANK 1 — MOST EXPENSIVE");

    // axes (year labels under chart). On phone, thin the ticks so 6 years don't
    // overprint into an unreadable blob inside a ~120 px span.
    const tickYears = this._compact === "rankOnly" ? [2019, 2021, 2024] : years;
    this.g.append("g").attr("class", "axis axis--x")
      .attr("transform", `translate(0,${ih + 4})`)
      .call(d3.axisBottom(x).tickValues(tickYears).tickFormat(d => d));

    // build path per country
    const line = d3.line().x(d => x(d.year)).y(d => y(d.rank)).curve(d3.curveMonotoneX);
    const series = rows.map(r => ({
      ...r,
      points: years.map(yr => ({ year: yr, rank: ranksByYear[yr].get(r.code) }))
    }));
    this._series = series;

    const rankOnly = this._compact === "rankOnly";

    // Direction-coloured spotlight: a protagonist's whole group carries an
    // is-up / is-down class so its line, nodes, label and delta all read the
    // same hue (terracotta = climbed/dearer, steel = fell/relatively cheaper).
    this.lines = this.g.selectAll("g.bump").data(series, d => d.code).join("g")
      .attr("class", "bump").attr("data-code", d => d.code)
      .classed("bump--focus-default", d => FOCUS_DEFAULT.has(d.code))
      .classed("bump--up", d => moveDir(d.code) === "up")
      .classed("bump--down", d => moveDir(d.code) === "down");

    this.lines.append("path").attr("class", "bump-line")
      .attr("d", d => line(d.points));

    // Invisible fat hit-path over each line so hover/tap actually catch (the
    // visible stroke is ~1.2 px — undiscoverable). pointer-events on the group
    // route through this; the visible line stays thin.
    this.lines.append("path").attr("class", "bump-hit")
      .attr("d", d => line(d.points));

    // nodes
    this.lines.selectAll("circle.bump-node").data(d => d.points.map(p => ({ ...p, code: d.code, name: d.name }))).join("circle")
      .attr("class", "bump-node")
      .attr("cx", d => x(d.year)).attr("cy", d => y(d.rank))
      .attr("r", 3.2);

    /* ---- Labels: de-cluttered "league table" treatment ----------------------
       Drawing 54 name labels (27×2) overprinted into spaghetti. Instead:
       • a thin always-on RANK-NUMBER gutter on each side — the 2019 standings on
         the left, the 2024 standings on the right — so the table structure stays
         legible without any names;
       • the protagonist lines get a full "rank. Name" name-tag (their direction
         colour) on the right, force-shown over the number;
       • every other line's NAME appears only on hover/tap (see _applyNames()).
       Phone keeps just the rank-number gutters (no room for names). ---------- */
    const sideNum = (sel, anchor, xPos, rankOf) =>
      sel.append("text").attr("class", `bump-num bump-num--${anchor}`)
        .attr("x", xPos).attr("y", d => y(rankOf(d)) + 3)
        .attr("text-anchor", anchor === "left" ? "end" : "start")
        .text(d => rankOf(d));
    sideNum(this.lines, "left",  x(years[0]) - 7,     d => d.points[0].rank);
    sideNum(this.lines, "right", x(years.at(-1)) + 7, d => d.points.at(-1).rank);

    // Name-tags: standing only for protagonists; the hover layer adds others.
    this._nameXRight = x(years.at(-1)) + (rankOnly ? 7 : 22);
    this.lines.append("text").attr("class", "bump-name bump-name--right")
      .attr("x", this._nameXRight).attr("y", d => y(d.points.at(-1).rank) + 3)
      .text(d => rankOnly ? "" : d.name);

    // [Rank-Δ badge] the net swing start→end. ▲ = climbed (dearer vs peers),
    // ▼ = fell. Drawn on protagonists only, in their direction colour, on the
    // line's own baseline so it never lands on a neighbour. Hidden on phone.
    if (!rankOnly) {
      this.lines.filter(d => FOCUS_DEFAULT.has(d.code))
        .append("text").attr("class", d => {
          const delta = d.points.at(-1).rank - d.points[0].rank; // +ve = bigger number = fell
          const dir = delta < 0 ? "up" : delta > 0 ? "down" : "flat";
          return `bump-delta bump-delta--${dir}`;
        })
        .attr("x", this._nameXRight)
        .attr("y", d => y(d.points.at(-1).rank) + 16)
        .text(d => {
          const climb = d.points[0].rank - d.points.at(-1).rank; // +ve = climbed
          if (climb === 0) return "no change";
          return `${climb > 0 ? "▲" : "▼"}${Math.abs(climb)} places`;
        });
    }

    // ---- Interaction: hover (mouse) + tap (touch), tap === hover -------------
    // The subtitle promises "tap or hover": a tap must isolate the line and show
    // the rank-by-year tooltip exactly like a hover, and survive the finger lift.
    const tipHtml = d => `<h5>${d.name}</h5>` +
      `<div class="row"><span class="key">2019 → 2024</span><span class="val">#${d.points[0].rank} → #${d.points.at(-1).rank}</span></div>` +
      d.points.map(p => `<div class="row"><span class="key">${p.year}</span><span class="val">#${p.rank}</span></div>`).join("");

    this.lines.style("cursor", "pointer")
      .on("mouseenter", (e, d) => {
        if (this._touched) return;            // touch fires synthetic mouse events; tap owns state there
        this._hoverCode = d.code;
        this._applyFocus();
        this.ctx.tooltip.show(tipHtml(d), e.clientX, e.clientY);
      })
      .on("mousemove", e => { if (!this._touched) this.ctx.tooltip.move(e.clientX, e.clientY); })
      .on("mouseleave", () => {
        if (this._touched) return;
        this._hoverCode = null;
        this._applyFocus();
        this.ctx.tooltip.hide();
      })
      .on("pointerup", (e, d) => {
        if (e.pointerType !== "touch" && e.pointerType !== "pen") return; // mouse handled above
        e.stopPropagation();
        this._touched = true;                 // from now on, ignore synthetic mouse events
        this._hoverCode = null;
        const release = this._tapCode === d.code;
        this._tapCode = release ? null : d.code;
        this._applyFocus();
        if (release) this.ctx.tooltip.hide();
        else this.ctx.tooltip.show(tipHtml(d), e.clientX, e.clientY);
      });

    // Tap on empty plot releases any pinned line (touch only).
    this.svg.on("pointerup", (e) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      this._touched = true;
      this._hoverCode = null;
      if (this._tapCode != null) {
        this._tapCode = null;
        this._applyFocus();
        this.ctx.tooltip.hide();
      }
    });

    this._initialReveal();
    this._applyFocus();
  }

  /* Structure-revealing reveal (Reuters/ConnectedScatter pattern): the calm field
     draws first, left→right, fast; the two protagonists draw LAST and slower so
     their trajectories — the climb and the slide — land after their context, the
     "here's the news" beat. Each line traces 2019→2024 via dash-offset, so motion
     reads as time passing. Reduced-motion → static correct end-state. */
  _initialReveal() {
    if (!this.lines) return;
    if (this.ctx.motion.reduced) {
      this.lines.selectAll("path.bump-line").attr("stroke-dasharray", null).attr("stroke-dashoffset", null);
      return;
    }
    const heroes = FOCUS_DEFAULT;
    const fieldCodes = this._series.map(s => s.code).filter(c => !heroes.has(c));
    const fieldStagger = 16, fieldDur = 620;
    const fieldSpan = fieldStagger * Math.max(0, fieldCodes.length - 1) + fieldDur;
    const fieldIndex = new Map(fieldCodes.map((c, i) => [c, i]));

    this.lines.selectAll("path.bump-line").each(function (d) {
      const sel = d3.select(this);
      const L = this.getTotalLength?.() || 1;
      const isHero = heroes.has(d.code);
      const delay = isHero ? fieldSpan - 140 : (fieldIndex.get(d.code) || 0) * fieldStagger;
      const dur = isHero ? 1000 : fieldDur;
      sel.attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L)
        .transition().delay(delay).duration(dur)
        .ease(isHero ? d3.easeCubicInOut : d3.easeCubicOut)
        .attr("stroke-dashoffset", 0);
    });

    if (this._revealSafety) clearTimeout(this._revealSafety);
    this._revealSafety = setTimeout(() => {
      if (!this.lines) return;
      this.lines.selectAll("path.bump-line").each(function () {
        const sel = d3.select(this);
        const off = +sel.attr("stroke-dashoffset");
        if (Number.isFinite(off) && off > 1) sel.interrupt().attr("stroke-dasharray", null).attr("stroke-dashoffset", null);
      });
    }, fieldSpan + 1000 + 400);
  }

  _applyFocus() {
    if (!this.lines) return;
    const active = this._activeCodes();
    const activeSet = new Set(active);
    const any = active.length > 0;
    this.lines.classed("is-dim",   function () { return any ? !activeSet.has(this.getAttribute("data-code")) : false; });
    this.lines.classed("is-focus", function () { return activeSet.has(this.getAttribute("data-code")); });

    // The kicker reads out the lit line(s). One name → big italic Fraunces; the
    // overview pair stays "Czechia · Malta" but squeezes to fit (never clips).
    if (this.kickerY && this.kickerSub) {
      if (any) {
        const names = active.map(c => this._series?.find(d => d.code === c)?.name).filter(Boolean).join(" · ");
        this.kickerY.text(names || "—");
        this.kickerSub.text(this._stepCaption || "");
      } else {
        this.kickerY.text("League table");
        this.kickerSub.text(this._stepCaption || "electricity-price rank, 2019 → 2024");
      }
      this._fitKicker();
    }
    this._applyNames(activeSet);
  }

  /* Names are off by default (the field shows rank numbers only). A line's name
     appears when it is lit — so hovering/tapping any country reveals "Country" at
     its 2024 endpoint, and the active step's protagonists stay named. Protagonist
     name-tags carry their direction colour via the group's bump--up/down class. */
  _applyNames(activeSet) {
    if (!this.lines || this._compact === "rankOnly") return;
    this.lines.select("text.bump-name--right").text(function () {
      const g = this.parentNode;
      const code = g.getAttribute("data-code");
      if (FOCUS_DEFAULT.has(code) || activeSet.has(code)) {
        const d = d3.select(g).datum();
        return d?.name || "";
      }
      return "";
    });
  }

  /* Shrink the kicker headline (via SVG textLength) when a multi-country focus
     name like "France · Germany · Bulgaria" would overrun the right edge of the
     viewBox. Keeps the big italic Fraunces look but never clips. */
  _fitKicker() {
    if (!this.kickerY || !this._kickerMaxW) return;
    const node = this.kickerY.node();
    this.kickerY.attr("textLength", null).attr("lengthAdjust", null);
    const w = node.getComputedTextLength ? node.getComputedTextLength() : 0;
    if (w > this._kickerMaxW) {
      this.kickerY.attr("textLength", this._kickerMaxW).attr("lengthAdjust", "spacingAndGlyphs");
    }
  }

  onStep(idx) {
    const cfg = STEP_CONFIG[Math.max(0, Math.min(STEP_CONFIG.length - 1, idx))];
    this._focusCodes = cfg.focus;
    this._stepCaption = cfg.caption;
    this._applyFocus();
  }

  onThemeChange() { this.render(); }
}
