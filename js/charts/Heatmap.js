/* ============================================================
   Heatmap — 27 EU countries (rows) x years (cols), annual headline
   (CP00) inflation. REDESIGN (R5·P10): the WHOLE field is shown at
   once (no year-slider scrub — DESIGN-REVIEW #11: a heatmap's power
   is the whole field; scrubbing one year in/out hides the pattern
   the title claims). Scroll HIGHLIGHTS within it: the 2022 column
   lights → the Baltic rows → the single hottest cell. Rows sort by
   2022 severity so the Baltics pin to the top (the finding).
   [D25] Kept SVG rather than the plan's canvas substrate: at 189
   cells canvas is pedagogical-only AND (being invisible to screen
   readers) would force a separate data-table fallback; SVG <rect>s +
   visible row/col labels are natively accessible and keep this chart
   flawless. Colours are token-resolved HEX (kills the D15 oklch risk).
   ============================================================ */

import { BaseChart } from "./BaseChart.js";

const BALTICS = ["EE", "LT", "LV"];
// Scroll step → what lights up within the full field (others recede to calm).
const STEP_CONFIG = [
  { focus: "all",     sub: "every country, every year 2019 – 2025 — the whole field at once" },
  { focus: "y2022",   sub: "2022 — every country ran hot; even the coolest sat near 6%" },
  { focus: "baltics", sub: "the Baltics burned — Estonia, Lithuania and Latvia at the top" },
  { focus: "hottest", sub: "Estonia, 2022 — the single hottest cell in the essay" },
];

export class Heatmap extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 116, right: 18, bottom: 28, left: 124 }, aspect: 0.78 });
    this._focus = "all";
    this._appliedFocus = null;   // idempotent re-enter guard (scrollama re-fires)
  }

  // CP00 by-country ranges ≈ −1 … 19.4 (EE 2022); these breakpoints give the busy
  // 2–15% band real spread (the eye reads structure) and park ≥20% at wine.
  static SCALE_DOMAIN = [-2, 0, 2, 5, 10, 15, 20];
  static SCALE_TICKS = [{ v: -2, t: "<0" }, { v: 2, t: "2" }, { v: 5, t: "5" }, { v: 10, t: "10" }, { v: 15, t: "15" }, { v: 20, t: "20+" }];

  _colorScale(pal) {
    const s = pal.seq;
    return d3.scaleLinear()
      .domain(Heatmap.SCALE_DOMAIN)
      .range([s[0], s[0], s[1], s[2], s[3], d3.interpolateLab(s[3], s[4])(0.5), s[4]])
      .interpolate(d3.interpolateLab).clamp(true);
  }

  size() {
    if (!this.container) return { width: 600, height: 600 };
    const w = this.container.clientWidth || 600;
    const hAvail = this.container.clientHeight || 0;
    if (w < 560) return { width: w, height: Math.max(380, hAvail || Math.round(w / this.opts.aspect)) };
    return { width: w, height: Math.max(440, hAvail || Math.round(w / this.opts.aspect)) };
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    this._appliedFocus = null;
    const probeW = this.container.clientWidth || 600;
    this.compact = probeW < 560;
    this.opts.margin = this.compact
      ? { top: 56, right: 10, bottom: 28, left: 40 }
      : { top: 96, right: 18, bottom: 26, left: 124 };   // [owner D6] tightened (kicker now 19px, not 58) → larger grid
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    const { width: iw, height: ih } = this.innerSize();
    this._iw = iw; this._ih = ih;

    const years = this.data.yearsCP00().filter(y => y >= 2019 && y <= 2025);
    this._years = years;
    const codes = this.data.euCodes();

    // matrix: CP00 per (country, year); sort rows by 2022 severity → Baltics to the top.
    const rows = codes.map(code => {
      const r = { code, name: this.data.countryName(code) };
      years.forEach(y => { r[y] = this.data.hicpAnnual[code]?.CP00?.[String(y)] ?? null; });
      return r;
    }).filter(r => years.some(y => Number.isFinite(r[y])));
    rows.sort((a, b) => (b[2022] ?? -Infinity) - (a[2022] ?? -Infinity));
    this._rows = rows;

    const x = d3.scaleBand().domain(years).range([0, iw]).padding(0.05);
    const y = d3.scaleBand().domain(rows.map(r => r.code)).range([0, ih]).padding(0.05);
    this.x = x; this.y = y; this.color = this._colorScale(this.palette());

    // kicker (top-left)
    const kY = this.compact ? 26 : 34, kSubY = this.compact ? 44 : 50;
    this.kickerG = this.svg.append("g").attr("class", "year-kicker-g").attr("pointer-events", "none");
    this.kickerY = this.kickerG.append("text").attr("class", "year-kicker").attr("x", 22).attr("y", kY).text("2019–25");
    this.kickerSub = this.kickerG.append("text").attr("class", "year-kicker-sub").attr("x", 26).attr("y", kSubY).text(STEP_CONFIG[0].sub);

    // colour-scale legend (decodable without hover — WCAG)
    if (this.compact) this._drawScaleLegend(this.color, 26, height - this.opts.margin.bottom + 24);
    else this._drawScaleLegend(this.color, 26, kSubY + 16);

    // year column headers
    this.g.selectAll("text.hm-col-head").data(years).join("text").attr("class", "hm-col-head")
      .attr("x", yr => x(yr) + x.bandwidth() / 2).attr("y", -8).attr("text-anchor", "middle")
      .text(yr => this.compact ? `’${String(yr).slice(2)}` : yr);

    this._drawGrid();
    this._applyFocus();
  }

  _drawGrid() {
    const { x, y, color, _rows: rows, _years: years } = this;
    const noData = getCSS("--rule-soft");
    const cellData = [];
    rows.forEach(r => years.forEach(yr => cellData.push({ code: r.code, year: yr, v: r[yr], name: r.name })));

    this.cells = this.g.selectAll("rect.hm-cell").data(cellData, d => `${d.code}-${d.year}`).join("rect")
      .attr("class", "cell hm-cell")
      .attr("x", d => x(d.year)).attr("y", d => y(d.code))
      .attr("width", x.bandwidth()).attr("height", y.bandwidth()).attr("rx", 1)
      .attr("fill", d => d.v == null ? noData : color(d.v))
      .on("mouseenter", (e, d) => this._focusCell(e.currentTarget, d, e))
      .on("mousemove", e => this.ctx.tooltip.move(e.clientX, e.clientY))
      .on("mouseleave", e => this._blurCell(e.currentTarget))
      .on("pointerdown", (e, d) => { if (e.pointerType !== "mouse") this._focusCell(e.currentTarget, d, e); });

    // in-cell value labels (desktop, when cells are wide enough) — heatmap AND table.
    const showVals = !this.compact && x.bandwidth() >= 30 && y.bandwidth() >= 10.5;
    const ink = getCSS("--ink"), bg = getCSS("--bg");
    if (showVals) {
      this.g.selectAll("text.hm-val").data(cellData.filter(d => d.v != null), d => `${d.code}-${d.year}`).join("text")
        .attr("class", "hm-val").attr("text-anchor", "middle").attr("dominant-baseline", "central")
        .attr("x", d => x(d.year) + x.bandwidth() / 2).attr("y", d => y(d.code) + y.bandwidth() / 2)
        .attr("fill", d => bestText(color(d.v), ink, bg)).text(d => fmtCell(d.v));
    } else this.g.selectAll("text.hm-val").remove();

    // row labels — full country names (desktop) / ISO codes (compact)
    this.g.selectAll("text.hm-row-label").data(rows, d => d.code).join("text")
      .attr("class", "row-label hm-row-label").attr("text-anchor", "end")
      .attr("x", -8).attr("y", d => y(d.code) + y.bandwidth() / 2 + 3)
      .text(d => this.compact ? d.code : d.name);

    // hottest-cell ring (Estonia 2022 — the essay max)
    const peak = d3.greatest(cellData, d => d.v ?? -Infinity);
    this._peak = peak;
    if (peak) {
      const r = Math.min(x.bandwidth(), y.bandwidth()) / 2 + 3;
      this.g.selectAll("circle.hm-peak-ring").data([peak]).join("circle").attr("class", "hm-peak-ring")
        .attr("cx", x(peak.year) + x.bandwidth() / 2).attr("cy", y(peak.code) + y.bandwidth() / 2)
        .attr("r", r).attr("fill", "none");
    }
  }

  // Scroll-highlight: the lit set stays full, everything else recedes to calm context.
  _applyFocus() {
    const focus = this._focus, peak = this._peak;
    const lit = (d) => {
      if (focus === "y2022") return d.year === 2022;
      if (focus === "baltics") return BALTICS.includes(d.code);
      if (focus === "hottest") return peak && d.code === peak.code && d.year === peak.year;
      return true; // "all"
    };
    const reduced = this.ctx?.motion?.reduced;
    if (this.cells) {
      if (reduced) this.cells.attr("opacity", d => lit(d) ? 1 : 0.16);
      else this.cells.transition("hl").duration(520).ease(d3.easeCubicOut).attr("opacity", d => lit(d) ? 1 : 0.16);
    }
    this.g.selectAll("text.hm-val").attr("opacity", d => lit(d) ? 1 : 0.1);
    this.g.selectAll("circle.hm-peak-ring").attr("opacity", focus === "hottest" ? 1 : (focus === "all" ? 0.85 : 0));
    this.g.selectAll("text.hm-row-label").classed("hm-row-label--peak", d =>
      (focus === "baltics" && BALTICS.includes(d.code)) || (focus === "hottest" && peak && d.code === peak.code));
  }

  onStep(idx) {
    const cfg = STEP_CONFIG[Math.max(0, Math.min(STEP_CONFIG.length - 1, idx))];
    if (cfg.focus === this._appliedFocus) return;   // idempotent on re-enter / reverse
    this._focus = cfg.focus;
    this._appliedFocus = cfg.focus;
    if (this.kickerSub) this.kickerSub.text(cfg.sub);
    this._applyFocus();
  }

  _focusCell(node, d, ev) {
    d3.select(node).raise().classed("hm-cell--focus", true);
    this.ctx.tooltip.show(
      `<h5>${d.name}</h5>
       <div class="row"><span class="key">Headline ${d.year}</span><span class="val">${d.v == null ? "—" : d.v.toFixed(1) + "%"}</span></div>`,
      ev?.clientX ?? 0, ev?.clientY ?? 0);
  }
  _blurCell(node) { d3.select(node).classed("hm-cell--focus", false); this.ctx.tooltip.hide(); }

  // Continuous colour ramp so the encoding is decodable without hover (WCAG).
  _drawScaleLegend(color, x0, yTop) {
    const ticks = Heatmap.SCALE_TICKS;
    const barW = this.compact ? 132 : 120, barH = 8;
    const g = this.svg.append("g").attr("class", "anno-legend hm-scale-legend")
      .attr("transform", `translate(${x0}, ${yTop})`).attr("pointer-events", "none");
    g.append("text").attr("class", "hm-scale-unit").attr("x", 0).attr("y", -4).text("ANNUAL HICP %");
    const D = Heatmap.SCALE_DOMAIN, lo = D[0], hi = D[D.length - 1];
    const px = v => ((v - lo) / (hi - lo)) * barW;
    const gradId = `hm-grad-${this.compact ? "c" : "d"}`;
    const grad = g.append("defs").append("linearGradient").attr("id", gradId).attr("x1", "0%").attr("x2", "100%");
    const N = 24;
    for (let i = 0; i <= N; i++) grad.append("stop").attr("offset", `${(i / N) * 100}%`).attr("stop-color", color(lo + (hi - lo) * (i / N)));
    g.append("rect").attr("class", "hm-scale-bar").attr("x", 0).attr("y", 0).attr("width", barW).attr("height", barH).attr("fill", `url(#${gradId})`).attr("rx", 1.5);
    ticks.forEach(s => {
      const tx = px(s.v);
      g.append("line").attr("class", "hm-scale-tickmark").attr("x1", tx).attr("x2", tx).attr("y1", 0).attr("y2", barH + 2);
      g.append("text").attr("class", "hm-scale-tick").attr("x", tx).attr("y", barH + 12)
        .attr("text-anchor", s.v === lo ? "start" : (s.v === hi ? "end" : "middle")).text(s.t);
    });
  }

  onThemeChange() { this.render(); }
}

function getCSS(name) { const m = name.match(/var\((--[^)]+)\)/); const n = m ? m[1] : name; return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888"; }
function fmtCell(v) { return v == null ? "" : String(Math.round(v)); }
// higher-WCAG-contrast text colour against the cell fill (tokens-only, AA, both themes).
function bestText(bgHex, a, b) { return contrast(bgHex, a) >= contrast(bgHex, b) ? a : b; }
function contrast(h1, h2) { const l1 = relLum(h1), l2 = relLum(h2); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); }
function relLum(col) { const rgb = toRgb(col); if (!rgb) return 0; const ch = rgb.map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]; }
function toRgb(col) { if (!col) return null; const s = String(col).trim(); const hx = s.match(/^#([0-9a-f]{6})$/i); if (hx) { const n = parseInt(hx[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; } const rg = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i); if (rg) return [+rg[1], +rg[2], +rg[3]]; return null; }
