/* ============================================================
   Housing — CH7 "The biggest bill" (NEW, brief §6 CH7).
   The house price index (prc_hpi, rebased 2015 = 100, EU country-mean) against
   consumer prices (HICP CP00, same base). The gap is the story: over 2015–2025
   house prices climbed ~92% while consumer prices climbed ~33% — and only the
   second is in the inflation number on the news.
     step 0 (lines)     — both lines trace on
     step 1 (countries) — a dot-range of the top-5 / bottom-5 countries by HPI change fades in
     step 2 (gap)       — the gap area between the two lines is tinted
   No official EU HPI aggregate exists in the data → the EU line is the equal-weighted
   country mean (26 countries; logged in LOG/methodology).
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { watchChapterProgress, smooth } from "../modules/ChartMotion.js";

const Y0 = 2015, Y1 = 2025;

export class Housing extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 56, right: 84, bottom: 34, left: 52 }, aspect: 1.4 });
    this._view = "lines";
    this._drawn = 0;
    this._zoom = "full";          // [§C.3] zoom only (no country chips — the dot-range already lists countries)
    this._lastStepIdx = -1;
  }

  size() {
    if (!this.container) return { width: 700, height: 520 };
    const w = this.container.clientWidth || 700;
    const h = this.container.clientHeight || Math.round(w / this.opts.aspect);
    return { width: w, height: Math.max(340, h) };
  }

  // annual avg of the HICP CP00 index for a year (from the monthly index).
  _annHicp(year) {
    const eu = this.data.euAggregateCode();
    const s = this.data.hicpIndex[eu]?.CP00 || {};
    const v = [];
    for (let m = 1; m <= 12; m++) { const x = s[`${year}-${String(m).padStart(2, "0")}`]; if (Number.isFinite(x)) v.push(x); }
    return v.length ? d3.mean(v) : null;
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const isPhone = this.size().width < 560;
    this._isPhone = isPhone;
    this.opts.margin = isPhone ? { top: 48, right: 46, bottom: 30, left: 40 } : { top: 56, right: 86, bottom: 34, left: 52 };
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    this.svg.attr("aria-label", "House prices versus consumer prices in the EU, rebased to 100 in 2015: by 2025 house prices climbed about 92% while consumer prices climbed about 33%.");
    const M = this.opts.margin;
    const iw = width - M.left - M.right, ih = height - M.top - M.bottom;
    this._iw = iw; this._ih = ih;

    // countries with 2015 HPI (for the mean + the dot-range)
    const countries = Object.keys(this.data.hpi).filter(g => /^[A-Z]{2}$/.test(g) && this.data.hpi[g]?.[Y0] != null);
    this._countries = countries;
    const hpiEU = y => {
      const r = countries.map(g => { const b = this.data.hpi[g]?.[Y0], v = this.data.hpi[g]?.[y]; return (b && v) ? v / b * 100 : null; }).filter(x => x != null);
      return r.length ? d3.mean(r) : null;
    };
    const hicpBase = this._annHicp(Y0);
    const hicpEU = y => { const v = this._annHicp(y); return (v && hicpBase) ? v / hicpBase * 100 : null; };
    const years = d3.range(Y0, Y1 + 1);
    const hpiLine = years.map(y => ({ y, v: hpiEU(y) })).filter(d => d.v != null);
    const hicpLine = years.map(y => ({ y, v: hicpEU(y) })).filter(d => d.v != null);
    this._hpiLine = hpiLine; this._hicpLine = hicpLine;
    this._hpiEU = hpiEU; this._hicpEU = hicpEU; this._years = years;   // [§C.3] reused by _applyZoom
    const hpiEnd = hpiLine.at(-1).v, hicpEnd = hicpLine.at(-1).v;

    const x = d3.scaleLinear().domain([Y0, Y1]).range([0, iw]);
    const y = d3.scaleLinear().domain([95, Math.ceil((hpiEnd + 8) / 10) * 10]).range([ih, 0]);
    this._x = x; this._y = y;
    const g = this.svg.append("g").attr("transform", `translate(${M.left},${M.top})`);
    this._g = g;

    // grid + axes
    g.append("g").attr("class", "grid").call(d3.axisLeft(y).tickSize(-iw).ticks(5).tickFormat("")).lower();
    g.append("g").attr("class", "axis axis--x").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).tickValues(d3.range(Y0, Y1 + 1, isPhone ? 2 : 1)).tickFormat(d3.format("d")));
    g.append("g").attr("class", "axis axis--y").call(d3.axisLeft(y).ticks(5).tickFormat(d => d));
    // 2015 = 100 baseline. Label sits at the RIGHT end, just under the line — both series
    // start at (0,100) and only climb, so the left origin is congested; the right end of the
    // baseline is clear (nearest line is ~200px above there). [§C.1: no text on the marks]
    g.append("line").attr("class", "hs-base").attr("x1", 0).attr("x2", iw).attr("y1", y(100)).attr("y2", y(100));
    g.append("text").attr("class", "hs-base-label").attr("x", iw - 2).attr("y", y(100) + 13).attr("text-anchor", "end").text("2015 = 100");

    const uid = this.selector.replace(/[^\w]/g, "");
    const defs = this.svg.append("defs");
    const clip = defs.append("clipPath").attr("id", `hs-clip-${uid}`).append("rect").attr("x", -2).attr("y", -6).attr("width", 0).attr("height", ih + 12);
    this._clip = clip;

    // gap tint (between the two lines) — hidden until step 2
    const gapArea = d3.area().x(d => x(d.y)).y0(d => y(hicpEU(d.y))).y1(d => y(hpiEU(d.y)));
    this._gapG = g.append("g").attr("clip-path", `url(#hs-clip-${uid})`).style("opacity", 0);
    this._gapG.append("path").datum(years.map(yy => ({ y: yy }))).attr("class", "hs-gap").attr("d", gapArea);
    this._gapLabel = this._gapG.append("text").attr("class", "hs-gap-label").attr("x", x(2022)).attr("y", y((hpiEU(2022) + hicpEU(2022)) / 2)).attr("text-anchor", "middle").text("the gap");

    // lines (clipped for scroll trace)
    const drawG = g.append("g").attr("clip-path", `url(#hs-clip-${uid})`);
    const lineFn = arr => d3.line().x(d => x(d.y)).y(d => y(d.v)).curve(d3.curveMonotoneX)(arr);
    drawG.append("path").datum(hicpLine).attr("class", "hs-line-hicp").attr("d", lineFn(hicpLine)).attr("fill", "none").attr("stroke", "var(--seq-target)").attr("stroke-width", 2.2).attr("stroke-linejoin", "round");
    drawG.append("path").datum(hpiLine).attr("class", "hs-line-hpi").attr("d", lineFn(hpiLine)).attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 2.8).attr("stroke-linejoin", "round");
    // end dots + labels
    this._linesG = drawG;
    [["hpi", hpiLine.at(-1), "var(--accent)", `+${Math.round(hpiEnd - 100)}%`, "House prices"], ["hicp", hicpLine.at(-1), "var(--seq-target)", `+${Math.round(hicpEnd - 100)}%`, "Consumer prices"]].forEach(([k, d, col, lbl, name]) => {
      g.append("circle").attr("class", `hs-end-dot hs-end-${k}`).attr("cx", x(d.y)).attr("cy", y(d.v)).attr("r", 4).attr("fill", col);
      g.append("text").attr("class", `hs-end-label hs-end-label--${k}`).attr("x", x(d.y) + 8).attr("y", y(d.v) + 2).attr("fill", col).text(lbl);
      if (!isPhone) g.append("text").attr("class", "hs-end-name").attr("x", x(d.y) + 8).attr("y", y(d.v) + 24).text(name);
    });

    // kicker
    // kicker = the HPI rise (house prices); the line-end labels + dot-range carry the detail.
    this._kickNum = this.svg.append("text").attr("class", "kick-num").attr("x", M.left).attr("y", isPhone ? 38 : 46).style("font-size", isPhone ? "30px" : "42px").text(`+${Math.round(hpiEnd - 100)}%`);

    // ── country dot-range (step 1) ────────────────────────────────
    this._buildDotRange();

    // hover on lines
    this._wireHover();

    // motion
    this._drawn = 0;
    if (this.ctx.motion.reduced) { this._revealTo(1); this._setView("gap"); }   // final state = lines + gap tint
    else { this._setView("lines"); this._wireScroll(); }

    // [§C.3] zoom presets (no country chips — the dot-range already lists countries) + restore on re-render
    this._buildControls();
    if (this._zoom === "crisis") this._applyZoom("crisis", false);
  }

  _controlsHost() { return document.getElementById(this.container.id + "-controls"); }
  _buildControls() {
    const host = this._controlsHost(); if (!host) return;
    if (host.dataset.wired === "1") { this._syncZoomButtons(); return; }
    host.dataset.wired = "1";
    host.innerHTML =
      `<span class="ac-add-label">Zoom</span>` +
      `<span class="ac-zoom" role="group" aria-label="Zoom the timeline">` +
      `<button type="button" class="ac-zoom-btn is-on" data-zoom="full">2015 – 2025</button>` +
      `<button type="button" class="ac-zoom-btn" data-zoom="crisis">The crisis · 2021 – 23</button></span>`;
    host.querySelectorAll(".ac-zoom-btn").forEach(b => b.addEventListener("click", () => this._applyZoom(b.dataset.zoom, true)));
  }
  _syncZoomButtons() { const host = this._controlsHost(); if (!host) return; host.querySelectorAll(".ac-zoom-btn").forEach(b => b.classList.toggle("is-on", b.dataset.zoom === this._zoom)); }
  _applyZoom(preset, animate) {
    this._zoom = preset;
    const x = this._x, y = this._y, iw = this._iw;
    x.domain(preset === "crisis" ? [2021, 2023] : [Y0, Y1]);
    this._drawn = 1; if (this._clip) this._clip.attr("width", iw + 4);
    const dur = (animate && !this.ctx.motion.reduced) ? 600 : 0;
    const t = d3.transition().duration(dur).ease(d3.easeCubicInOut);
    const crisis = preset === "crisis";
    const lineFn = arr => d3.line().x(d => x(d.y)).y(d => y(d.v)).curve(d3.curveMonotoneX)(arr);
    this._g.select(".axis--x").transition(t).call(d3.axisBottom(x).tickValues(crisis ? [2021, 2022, 2023] : d3.range(Y0, Y1 + 1, this._isPhone ? 2 : 1)).tickFormat(d3.format("d")));
    this._g.select(".hs-line-hicp").transition(t).attr("d", lineFn(this._hicpLine));
    this._g.select(".hs-line-hpi").transition(t).attr("d", lineFn(this._hpiLine));
    const gapArea = d3.area().x(d => x(d.y)).y0(d => y(this._hicpEU(d.y))).y1(d => y(this._hpiEU(d.y)));
    this._gapG.select(".hs-gap").transition(t).attr("d", gapArea(this._years.map(yy => ({ y: yy }))));
    if (this._gapLabel) this._gapLabel.transition(t).attr("x", x(2022)).attr("y", y((this._hpiEU(2022) + this._hicpEU(2022)) / 2));
    this._g.selectAll(".hs-end-dot,.hs-end-label,.hs-end-name").style("opacity", crisis ? 0 : 1);
    this._syncZoomButtons();
  }

  _buildDotRange() {
    const cs = this._countries;
    const per = cs.map(g => ({ g, name: this.data.countryName(g), chg: this.data.hpi[g][Y1] / this.data.hpi[g][Y0] * 100 - 100 }))
      .filter(d => Number.isFinite(d.chg)).sort((a, b) => b.chg - a.chg);
    const top5 = per.slice(0, 5), bot5 = per.slice(-5);
    const rows = [...top5, { sep: true }, ...bot5];
    this._dotG = this.svg.append("g").attr("class", "hs-dotrange").style("opacity", 0).attr("pointer-events", "none");
    const M = this.opts.margin, iw = this._iw, ih = this._ih;
    const x0 = M.left, top = M.top + 24;   // below the kicker
    const maxChg = d3.max(per, d => d.chg);
    const xr = d3.scaleLinear().domain([0, Math.ceil(maxChg / 50) * 50]).range([M.left + (this._isPhone ? 78 : 128), M.left + iw - 16]);
    const rowH = Math.max(20, (ih - 54) / rows.length);   // fill the panel height
    // axis
    this._dotG.append("text").attr("class", "hs-dot-title").attr("x", x0).attr("y", top).text("HOUSE-PRICE RISE 2015 → 2025, BY COUNTRY");
    xr.ticks(4).forEach(t => this._dotG.append("text").attr("class", "hs-dot-tick").attr("x", xr(t)).attr("y", top + 16).attr("text-anchor", "middle").text(`+${t}%`));
    rows.forEach((r, i) => {
      const yy = top + 30 + i * rowH;
      if (r.sep) { this._dotG.append("text").attr("class", "hs-dot-sep").attr("x", (M.left + M.left + iw) / 2).attr("y", yy + 2).attr("text-anchor", "middle").text("· · ·  16 more countries in between  · · ·"); return; }
      const isTop = top5.includes(r);
      this._dotG.append("text").attr("class", "hs-dot-name").attr("x", xr.range()[0] - 8).attr("y", yy + 3).attr("text-anchor", "end").text(r.name);
      this._dotG.append("line").attr("class", "hs-dot-stem").attr("x1", xr(0)).attr("x2", xr(r.chg)).attr("y1", yy).attr("y2", yy);
      this._dotG.append("circle").attr("class", `hs-dot ${isTop ? "hs-dot--top" : "hs-dot--bot"}`).attr("cx", xr(r.chg)).attr("cy", yy).attr("r", 4.5);
      this._dotG.append("text").attr("class", "hs-dot-val").attr("x", xr(r.chg) + 9).attr("y", yy + 3).text(`+${Math.round(r.chg)}%`);
    });
    this._top1 = top5[0]; this._bot1 = bot5.at(-1);
  }

  _wireHover() {
    const x = this._x, y = this._y, g = this._g, iw = this._iw, ih = this._ih;
    const cur = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", ih).style("opacity", 0);
    g.append("rect").attr("x", 0).attr("y", 0).attr("width", iw).attr("height", ih).attr("fill", "transparent")
      .on("mousemove", (event) => {
        if (this._view === "countries") return;
        const [mx] = d3.pointer(event, g.node());
        const yr = Math.max(Y0, Math.min(Y1, Math.round(x.invert(mx))));
        const hp = this._hpiLine.find(d => d.y === yr), hc = this._hicpLine.find(d => d.y === yr);
        cur.style("opacity", 1).attr("x1", x(yr)).attr("x2", x(yr));
        this.ctx.tooltip.show(`<h5>${yr}</h5><div class="row"><span class="key">House prices</span><span class="val">${hp ? hp.v.toFixed(0) : "—"}</span></div><div class="row"><span class="key">Consumer prices</span><span class="val">${hc ? hc.v.toFixed(0) : "—"}</span></div>`, event.clientX, event.clientY);
      })
      .on("mouseleave", () => { cur.style("opacity", 0); this.ctx.tooltip.hide(); });
  }

  _wireScroll() { if (this._unwatch) this._unwatch(); const chapter = this.container.closest(".chapter"); this._unwatch = watchChapterProgress(chapter, p => this._onProgress(p)); this._watchUnpin(chapter, () => { this._revealTo(1); this._setView("gap"); }); }   /* [A2 §B.4] */
  _onProgress(p) { const t = smooth(Math.max(0, Math.min(1, p / 0.16))); if (t > this._drawn) this._revealTo(t); }
  _revealTo(np) { this._drawn = Math.max(this._drawn, np); this._clip.attr("width", Math.max(0, this._drawn * (this._iw + 4))); }

  onStep(index, el) {
    const view = (el && el.dataset.view) || ["lines", "countries", "gap"][Math.max(0, Math.min(2, index))];
    if (this.container) { this.container.setAttribute("data-active-view", view); this.container.setAttribute("data-onstep", index); }
    const stepChanged = (index !== this._lastStepIdx); this._lastStepIdx = index;   // [§C.3]
    if (stepChanged && this._zoom !== "full") this._applyZoom("full", true);
    this._setView(view);
  }

  _setView(view) {
    this._view = view;
    const reduced = this.ctx.motion.reduced;
    const fade = (sel, o) => reduced ? sel.style("opacity", o) : sel.interrupt().transition().duration(420).style("opacity", o);
    // countries view dims the whole line-chart group (grid/axes/baseline/lines/end labels live in _g)
    // so the dot-range sits on a clean plot; the kicker + dot-range live on the svg, above _g.
    fade(this._g, view === "countries" ? 0 : 1);
    fade(this._dotG, view === "countries" ? 1 : 0);
    fade(this._gapG, view === "gap" ? 1 : 0);
    if (view === "countries" && this._top1) this._kickNum.text(`+${Math.round(this._top1.chg)}%`);
    else this._kickNum.text(`+${Math.round(this._hpiLine.at(-1).v - 100)}%`);
  }

  destroy() { if (this._unwatch) this._unwatch(); super.destroy(); }
  onThemeChange() { this.render(); }
}
