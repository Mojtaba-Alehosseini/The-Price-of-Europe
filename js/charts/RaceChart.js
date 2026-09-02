/* ============================================================
   RaceChart — CH8 "The race" · CLIMAX (NEW, brief §6 CH8).
   Two cumulative index lines, Jan 2019 = 100, on one clock:
     PRICES = HICP CP00 EU-27 (monthly, ends ~129.7)
     PAY    = median statutory minimum-wage index across the 21 countries
              with a 2019 floor (semiannual, ends ~150.1)
   The gap between them is shaded: claret while pay < prices (workers behind),
   jade once pay ≥ prices (workers ahead).
   [D91] On corrected national-currency wages the median floor pulls ahead in late 2019
   and NEVER falls behind again — its lead only narrows (≈+7.3 pts end-2021 to ≈+5.0 by
   mid-2022) before widening to ≈+20.5 by 2025. The pre-D91 file shipped PPS wages, which
   manufactured a 2022 deficit and the "pay chased prices" reading. The damage is real but
   it is per-country, not in the median: 17 of these 21 countries were below their own 2019
   level at their worst month of 2022 (see scripts/validate_wages_hpi.mjs §6b) — which is
   what CH8 step 2 now says. Six countries have no 2019 statutory floor and sit this one out.
   ============================================================ */

import { BaseChart } from "./BaseChart.js";
import { watchChapterProgress, smooth } from "../modules/ChartMotion.js";
import { ensureGlow } from "../modules/CraftFX.js";

const BEATS = { sprint: "2022-06", chase: "2024-01", finish: "2025-12" };
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BEAT_ORDER = ["sprint", "chase", "finish"];

export class RaceChart extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 54, right: 84, bottom: 34, left: 50 }, aspect: 1.5 });
    this._beat = "sprint";
    this._drawn = 0;
    this._zoom = "full";          // [§C.3] zoom preset — persists across re-renders
    this._selectedCodes = [];     // [§C.3] compared countries (max 2) — persists
    this._lastStepIdx = -1;       // [§C.3] story-reset only on real step change
    this._pairCache = new Map();  // [§2.3] code -> _countryPair(code), built once per add (not per mousemove)
    this._stripOn = false;        // [P8.3] under-water count strip — OFF by default, story-reset on step
  }

  size() {
    if (!this.container) return { width: 720, height: 500 };
    const w = this.container.clientWidth || 720;
    const h = this.container.clientHeight || Math.round(w / this.opts.aspect);
    return { width: w, height: Math.max(320, h) };
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const isPhone = this.size().width < 560;
    this._isPhone = isPhone;
    // [P8.3] The strip lives UNDER the x-axis, and there is no spare room down there: the bottom
    // margin is sized to the axis labels alone. So the chart makes room only when the strip is on,
    // which is also what keeps the OFF state pixel-identical to before it existed.
    const stripH = this._stripOn ? (isPhone ? 44 : 52) : 0;
    this._stripH = stripH;
    this.opts.margin = isPhone
      ? { top: 48, right: 46, bottom: 30 + stripH, left: 40 }
      : { top: 54, right: 86, bottom: 34 + stripH, left: 50 };
    const { width, height } = this.ensureSvg();
    this.W = width; this.H = height;
    // aria-label is set after the lines are computed, from the real end gap (D91).
    const M = this.opts.margin;
    const iw = width - M.left - M.right, ih = height - M.top - M.bottom;
    this._iw = iw; this._ih = ih;

    const eu = this.data.euAggregateCode();
    const parse = d3.timeParse("%Y-%m");
    this._parse = parse;
    const months = this.data.monthsCP00().filter(t => t >= "2019-01" && t <= "2025-12").sort();

    // PRICES: monthly, rebased Jan2019=100
    const pIdx = this.data.hicpIndex[eu]?.CP00 || {};
    const pBase = pIdx["2019-01"];
    const price = m => (pBase && Number.isFinite(pIdx[m])) ? pIdx[m] / pBase * 100 : null;

    // PAY: median statutory min-wage index. minWages[g][`${year}-S1|S2`]; countries with a 2019-S1 floor.
    const mw = this.data.minWages;
    const geos = Object.keys(mw).filter(g => mw[g]["2019-S1"] != null);
    this._mwN = geos.length;
    const periods = [];
    for (let yy = 2019; yy <= 2025; yy++) for (const s of ["S1", "S2"]) periods.push({ key: `${yy}-${s}`, m: `${yy}-${s === "S1" ? "01" : "07"}` });
    const median = arr => { const a = arr.filter(x => x != null).sort((x, y) => x - y); if (!a.length) return null; const k = Math.floor(a.length / 2); return a.length % 2 ? a[k] : (a[k - 1] + a[k]) / 2; };
    const payPts = periods.map(p => ({ t: parse(p.m), m: p.m, v: median(geos.map(g => { const b = mw[g]["2019-S1"], v = mw[g][p.key]; return (b && v) ? v / b * 100 : null; })) })).filter(d => d.v != null);
    this._payPts = payPts;
    // interpolate pay to each month (linear between semester points; flat outside)
    const payAt = m => {
      const t = parse(m).getTime();
      if (t <= payPts[0].t.getTime()) return payPts[0].v;
      if (t >= payPts.at(-1).t.getTime()) return payPts.at(-1).v;
      for (let i = 1; i < payPts.length; i++) { const a = payPts[i - 1], b = payPts[i]; if (t <= b.t.getTime()) { const f = (t - a.t.getTime()) / (b.t.getTime() - a.t.getTime()); return a.v + (b.v - a.v) * f; } }
      return payPts.at(-1).v;
    };
    if (payPts.length < 2 || !months.length) {   // deferred data (minWages/hicpIndex) not indexed yet — retry
      // [P3.5] The retry timer gets a handle so destroy() can cancel it — up to 12 of these can be
      // pending across a slow data load, each holding a render() of a chart that may be gone.
      if ((this._retries = (this._retries || 0) + 1) <= 12) this._retryT = setTimeout(() => { if (this.rendered && this.container?.isConnected) this.render(); }, 200);
      return;
    }
    const rows = months.map(m => ({ t: parse(m), m, price: price(m), pay: payAt(m) })).filter(d => d.price != null);
    if (!rows.length) {
      if ((this._retries = (this._retries || 0) + 1) <= 12) this._retryT = setTimeout(() => { if (this.rendered && this.container?.isConnected) this.render(); }, 200);
      return;
    }
    this._rows = rows;
    this._monthsList = months; this._mwPeriods = periods;   // [§C.3] reused to build per-country pay/price lines
    this._priceAt = price; this._payAtMonth = payAt;
    const endGap = rows.at(-1).pay - rows.at(-1).price;
    this._endGap = endGap;
    // [D91] Derived from the drawn series, never a literal — the old label asserted "about 11
    // points" and "slipping behind during the 2022 energy spike", both artifacts of PPS wages.
    const behind = rows.filter(d => d.pay < d.price);
    this.svg.attr("aria-label", `Minimum pay against consumer prices, both starting at 100 in 2019: the median wage floor ends about ${Math.round(Math.abs(endGap))} points ${endGap >= 0 ? "above" : "below"} prices by ${rows.at(-1).m.slice(0, 4)}${behind.length ? `, after trailing them for ${behind.length} months` : ", having pulled ahead in 2019 and stayed ahead"}.`);

    const x = d3.scaleTime().domain([parse("2019-01"), parse("2025-12")]).range([0, iw]);
    const y = d3.scaleLinear().domain([96, Math.ceil((d3.max(rows, d => Math.max(d.pay, d.price)) + 4) / 5) * 5]).range([ih, 0]);
    this._x = x; this._y = y;
    const g = this.svg.append("g").attr("transform", `translate(${M.left},${M.top})`);
    this._g = g;

    g.append("g").attr("class", "grid").call(d3.axisLeft(y).tickSize(-iw).ticks(5).tickFormat("")).lower();
    g.append("g").attr("class", "axis axis--x").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")));
    g.append("g").attr("class", "axis axis--y").call(d3.axisLeft(y).ticks(5).tickFormat(d => d));
    g.append("line").attr("class", "rc-base").attr("x1", 0).attr("x2", iw).attr("y1", y(100)).attr("y2", y(100));
    g.append("text").attr("class", "rc-base-label").attr("x", 2).attr("y", y(100) + 14).text("2019 = 100");  /* [§C.1] below the baseline — pay/price are always ≥100 */

    const uid = this.selector.replace(/[^\w]/g, "");
    const defs = this.svg.append("defs");
    this._clip = defs.append("clipPath").attr("id", `rc-clip-${uid}`).append("rect").attr("x", -2).attr("y", -6).attr("width", 0).attr("height", ih + 12);
    defs.append("clipPath").attr("id", `rc-plot-${uid}`).append("rect").attr("x", -2).attr("y", -6).attr("width", iw + 4).attr("height", ih + 12);
    this._extraG = g.append("g").attr("class", "race-extra-g").attr("clip-path", `url(#rc-plot-${uid})`);  // [§C.3] under the main lines
    const drawG = g.append("g").attr("clip-path", `url(#rc-clip-${uid})`);

    // gap areas (jade where pay≥price, claret where pay<price)
    const areaBase = d3.area().x(d => x(d.t)).y0(d => y(d.price)).y1(d => y(d.pay)).curve(d3.curveMonotoneX);
    drawG.append("path").datum(rows).attr("class", "rc-gap-jade").attr("d", areaBase.defined(d => d.pay >= d.price)(rows));
    drawG.append("path").datum(rows).attr("class", "rc-gap-claret").attr("d", areaBase.defined(d => d.pay < d.price)(rows));
    // lines
    const priceLine = d3.line().x(d => x(d.t)).y(d => y(d.price)).curve(d3.curveMonotoneX);
    const payLine = d3.line().x(d => x(d.t)).y(d => y(d.pay)).curve(d3.curveMonotoneX);
    drawG.append("path").datum(rows).attr("class", "rc-line-price").attr("d", priceLine).attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 2.6).attr("stroke-linejoin", "round");
    drawG.append("path").datum(rows).attr("class", "rc-line-pay").attr("d", payLine).attr("fill", "none").attr("stroke", "var(--cat-wages)").attr("stroke-width", 2.6).attr("stroke-linejoin", "round");
    // end dots + labels
    const end = rows.at(-1);
    [["price", end.price, "var(--accent)", "Prices"], ["pay", end.pay, "var(--cat-wages)", "Pay"]].forEach(([k, v, col, name]) => {
      g.append("circle").attr("class", `rc-end-dot rc-end-${k}`).attr("cx", x(end.t)).attr("cy", y(v)).attr("r", 4).attr("fill", col);
      g.append("text").attr("class", `rc-end-name rc-end-name--${k}`).attr("x", x(end.t) + 8).attr("y", y(v) + 4).text(`${name} ${Math.round(v)}`);   /* [D93] colour via the class — a fill attr on a <text> is inert */
    });

    // beat marker (moves per step)
    this._beatG = g.append("g").attr("class", "rc-beat-g").attr("clip-path", `url(#rc-clip-${uid})`).style("opacity", 0);
    this._beatLine = this._beatG.append("line").attr("class", "rc-beat-line").attr("y1", 0).attr("y2", ih);

    // kicker = the live gap (pay − price) in points at the reveal front; jade when pay leads, claret when it trails.
    this._kickNum = this.svg.append("text").attr("class", "kick-num").attr("x", M.left).attr("y", isPhone ? 38 : 46).style("font-size", isPhone ? "28px" : "40px").text("0");

    if (this._stripOn) this._drawUnderWater();

    // hover
    this._wireHover();

    // motion
    // [P3.3] Same fix as Housing: the beat was hard-reset to "sprint" on every render, so a
    // dark-mode toggle on beat 2 or 3 threw the marker back to the start of the story. `_beat` is
    // seeded in the constructor and now survives a re-render; only a true first mount opens on
    // "sprint". `_pulsed` is also set in the reduced branch, which calls _pulseEnd() directly —
    // leaving it false let a later _neutralView/_onProgress fire the end pulse a second time.
    this._drawn = 0;
    const firstMount = this._renderedOnce !== true;
    this._renderedOnce = true;
    if (firstMount) this._pulsed = false;
    if (this.ctx.motion.reduced) { this._revealTo(1); this._setKicker(1); this._applyBeat("finish"); this._pulsed = true; this._pulseEnd(); }
    else { this._applyBeat(firstMount ? "sprint" : this._beat); this._wireScroll(); }

    // [§C.3] controls (country pay/price overlay + zoom) + restore explore state on re-render
    this._buildControls();
    this._drawExtras();
    if (this._zoom === "crisis") this._applyZoom("crisis", false);
  }

  _wireHover() {
    const x = this._x, y = this._y, g = this._g, iw = this._iw, ih = this._ih, rows = this._rows;
    const cur = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", ih).style("opacity", 0);
    const bisect = d3.bisector(d => d.t).left;
    const nearest = (arr, t) => { const i = bisect(arr, t); const a = arr[Math.max(0, i - 1)], b = arr[Math.min(arr.length - 1, i)]; return (!a || (b && (t - a.t) > (b.t - t))) ? b : a; };
    g.append("rect").attr("x", 0).attr("y", 0).attr("width", iw).attr("height", ih).attr("fill", "transparent")
      .on("mousemove", (event) => {
        const [mx] = d3.pointer(event, g.node());
        const t = x.invert(mx); const i = bisect(rows, t);
        const rec = rows[Math.max(0, Math.min(rows.length - 1, i))]; if (!rec) return;
        cur.style("opacity", 1).attr("x1", x(rec.t)).attr("x2", x(rec.t));
        const gap = rec.pay - rec.price;
        // §2.3 multi-series hover — EU base first (unprefixed, matches the original tooltip),
        // then each compared country's own pay/price (cached in _addCountry, not recomputed
        // per mousemove). Race has no separate cmp-colour system: compared lines reuse the same
        // price/pay colours (dashed), so rows are disambiguated by a country-name prefix instead.
        let html = `<h5>${d3.timeFormat("%B %Y")(rec.t)}</h5>` +
          `<div class="row"><span class="key">Prices</span><span class="val">${rec.price.toFixed(0)}</span></div>` +
          `<div class="row"><span class="key">Pay</span><span class="val">${rec.pay.toFixed(0)}</span></div>` +
          `<div class="row"><span class="key">Gap</span><span class="val">${gap >= 0 ? "+" : ""}${gap.toFixed(1)} pts</span></div>`;
        this._selectedCodes.forEach(code => {
          const pair = this._pairCache?.get(code); if (!pair) return;
          const name = this.data.countryName(code);
          if (pair.price.length) { const pr = nearest(pair.price, t); html += `<div class="row"><span class="key"><span class="ac-sw ac-sw--eu"></span>${name} · Prices</span><span class="val">${pr.v.toFixed(0)}</span></div>`; }
          if (pair.pay.length) { const pw = nearest(pair.pay, t); html += `<div class="row"><span class="key"><span class="ac-sw ac-sw--wages"></span>${name} · Pay</span><span class="val">${pw.v.toFixed(0)}</span></div>`; }
        });
        this.ctx.tooltip.show(html, event.clientX, event.clientY);
      })
      .on("mouseleave", () => { cur.style("opacity", 0); this.ctx.tooltip.hide(); });
  }

  _wireScroll() { if (this._unwatch) this._unwatch(); const chapter = this.container.closest(".chapter"); this._unwatch = watchChapterProgress(chapter, p => this._onProgress(p)); this._watchUnpin(chapter, () => this._neutralView()); }
  _onProgress(p) { const t = smooth(Math.max(0, Math.min(1, p / 0.5))); if (t > this._drawn) { this._revealTo(t); this._setKicker(t); } }
  _revealTo(np) { this._drawn = Math.max(this._drawn, np); this._clip.attr("width", Math.max(0, this._drawn * (this._iw + 4))); }

  // [A2 §B.7] recompute y over the median + all overlaid country series so nothing clips the top.
  _raceYMax() {
    let max = d3.max(this._rows, d => Math.max(d.pay, d.price)) ?? 140;
    this._selectedCodes.forEach(code => { const p = this._countryPair(code); const m = Math.max(d3.max(p.pay, d => d.v) ?? 0, d3.max(p.price, d => d.v) ?? 0); if (m > max) max = m; });
    return Math.ceil((max + 4) / 5) * 5;
  }
  _rescaleY(animate) {
    const y = this._y, x = this._x, rows = this._rows;
    y.domain([96, this._raceYMax()]);
    const dur = animate && !this.ctx.motion.reduced ? 600 : 0;
    const t = d3.transition().duration(dur).ease(d3.easeCubicInOut);
    this._g.select(".axis--y").transition(t).call(d3.axisLeft(y).ticks(5).tickFormat(d => d));
    this._g.select(".grid").transition(t).call(d3.axisLeft(y).tickSize(-this._iw).ticks(5).tickFormat(""));
    const priceLine = d3.line().x(d => x(d.t)).y(d => y(d.price)).curve(d3.curveMonotoneX);
    const payLine = d3.line().x(d => x(d.t)).y(d => y(d.pay)).curve(d3.curveMonotoneX);
    const area = d3.area().x(d => x(d.t)).curve(d3.curveMonotoneX);
    this._g.select(".rc-line-price").transition(t).attr("d", priceLine(rows));
    this._g.select(".rc-line-pay").transition(t).attr("d", payLine(rows));
    this._g.select(".rc-gap-jade").transition(t).attr("d", area.y0(d => y(d.price)).y1(d => y(d.pay)).defined(d => d.pay >= d.price)(rows));
    this._g.select(".rc-gap-claret").transition(t).attr("d", area.y0(d => y(d.price)).y1(d => y(d.pay)).defined(d => d.pay < d.price)(rows));
    this._g.select(".rc-base").transition(t).attr("y1", y(100)).attr("y2", y(100));
    this._g.select(".rc-base-label").transition(t).attr("y", y(100) + 14);
    const end = rows.at(-1);
    this._g.select(".rc-end-price").transition(t).attr("cy", y(end.price));
    this._g.select(".rc-end-pay").transition(t).attr("cy", y(end.pay));
    this._g.select(".rc-end-name--price").transition(t).attr("y", y(end.price) + 4);
    this._g.select(".rc-end-name--pay").transition(t).attr("y", y(end.pay) + 4);
    this._drawExtras();
  }
  // [A2 §B.4] neutral full view — full reveal, both lines, gap, beat at the finish.
  _neutralView() { this._revealTo(1); this._setKicker(1); this._applyBeat("finish"); if (!this._pulsed) { this._pulsed = true; this._pulseEnd(); } }

  _setKicker(frac) {
    // gap at the reveal front
    const i = Math.max(0, Math.min(this._rows.length - 1, Math.round(frac * (this._rows.length - 1))));
    const r = this._rows[i]; const gap = r.pay - r.price;
    this._kickNum.text(`${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(0)}`)
      .classed("rc-kick--ahead", gap >= 0).classed("rc-kick--behind", gap < 0);   /* [D93] jade ahead / claret behind, in CSS */
    if (frac >= 0.999 && !this._pulsed) { this._pulsed = true; this._pulseEnd(); }
  }

  onStep(index, el) {
    const beat = (el && el.dataset.beat) || BEAT_ORDER[Math.max(0, Math.min(2, index))];
    if (this.container) { this.container.setAttribute("data-active-beat", beat); this.container.setAttribute("data-onstep", index); }
    const stepChanged = (index !== this._lastStepIdx); this._lastStepIdx = index;   // [§C.3]
    if (stepChanged && ((this._selectedCodes && this._selectedCodes.length) || this._zoom !== "full")) {
      this._resetCountries(); this._applyZoom("full", true);
    }
    // [P8.3] STORY RULE — the same one the compare chips obey: an explore state the reader opened
    // does not survive into the next step, because the step's own sentence assumes the plain chart.
    // Re-render rather than hide, since the strip owns part of the bottom margin.
    if (stepChanged && this._stripOn) { this._stripOn = false; this.render(); this._syncUnderWaterBtn(); }
    this._applyBeat(beat);
  }

  // ---- [§C.3] compare (a country's own pay vs price) + zoom presets ----
  _controlsHost() { return document.getElementById(this.container.id + "-controls"); }

  _buildControls() {
    const host = this._controlsHost();
    if (!host) return;
    if (host.dataset.wired === "1") { this._renderChips(); this._syncZoomButtons(); return; }
    host.dataset.wired = "1";
    const geos = Object.keys(this.data.minWages).filter(g => this.data.minWages[g]["2019-S1"] != null && this.data.hicpIndex[g]?.CP00);
    const countries = geos.map(code => ({ code, name: this.data.countryName(code) })).sort((a, b) => a.name.localeCompare(b.name));
    const opts = countries.map(c => `<option value="${c.code}">${c.name}</option>`).join("");
    host.innerHTML =
      `<span class="ac-add"><label for="${this.container.id}-add" class="ac-add-label">Overlay a country</label>` +
      `<select id="${this.container.id}-add" class="ac-select"><option value="">Add a country…</option>${opts}</select></span>` +
      `<span class="ac-chips" role="list"></span>` +
      `<button type="button" class="ac-reset" hidden>Reset</button>` +
      `<span class="ac-zoom" role="group" aria-label="Zoom the timeline">` +
      `<button type="button" class="ac-zoom-btn is-on" data-zoom="full">2019 – 2025</button>` +
      `<button type="button" class="ac-zoom-btn" data-zoom="crisis">2021 – 2023</button></span>` +
      `<button type="button" class="ac-zoom-btn rc-uw-btn" data-uw="1" aria-pressed="false">Who fell behind</button>`;
    host.querySelector(".ac-select").addEventListener("change", (e) => { const code = e.target.value; e.target.value = ""; if (code) this._addCountry(code); });
    host.querySelector(".ac-reset").addEventListener("click", () => this._resetCountries());
    host.querySelectorAll(".ac-zoom-btn[data-zoom]").forEach(b => b.addEventListener("click", () => this._applyZoom(b.dataset.zoom, true)));
    host.querySelector(".rc-uw-btn").addEventListener("click", () => this._toggleUnderWater());
    this._renderChips();
    this._syncUnderWaterBtn();
  }

  /** [P8.3] Toggle the under-water strip. A re-render, not a show/hide: the strip owns part of the
   *  bottom margin, so the main plot has to give the room back when it closes. This is the same
   *  path a theme toggle takes, which is why beat, zoom and compared countries survive it. */
  _toggleUnderWater() {
    this._stripOn = !this._stripOn;
    this.render();
    this._syncUnderWaterBtn();
  }

  _syncUnderWaterBtn() {
    const b = this._controlsHost()?.querySelector(".rc-uw-btn");
    if (!b) return;
    b.classList.toggle("is-on", this._stripOn);
    b.setAttribute("aria-pressed", String(this._stripOn));
  }

  /** [P8.3] The count the median hides. For every month, how many of the 21 floors bought less
   *  than at the start of 2019 — the same in-force semester step the ledger's troughs use, so the
   *  two charts cannot disagree about the same countries.
   *
   *  What the peak label says is derived, not asserted. The plan for this strip expected a peak of
   *  17; 17 is the count of countries below their 2019 level at their OWN worst month of 2022,
   *  which is a different statistic and is what the DUMBBELL draws. The most that were under water
   *  in any SINGLE month of the crisis is 15 (Nov–Dec 2022), so that is what is labelled, with its
   *  month, and the label is computed from the series rather than written down.
   *
   *  The 2019 block is real and agrees with the line above it: floors are set in January and prices
   *  drift, so by mid-2019 almost every floor bought fractionally less than in January — which is
   *  exactly why the race already draws a claret gap across 2019 (median pay 100.0 vs prices 102.5).
   *  The strip counts what that gap is made of. */
  _drawUnderWater() {
    const x = this._x, M = this.opts.margin, iw = this._iw, ih = this._ih, H = this._stripH;
    // The series starts at 2020, and that is a judgement the pixels forced. Drawn from 2019-01 the
    // strip peaks at 21 in mid-2019 and the crisis reads as a bump: within the base year almost
    // every floor buys fractionally less than it did in January, because floors are set annually
    // and prices drift — true, the same in every year, and the reason the race already shades 2019
    // claret. But a COUNT cannot see depth: those countries are under by about a point, where in
    // Nov 2022 they are under by up to fourteen. Counting them together made the base year look
    // like the crisis. From 2020 the first full cycle has passed and the count means what the
    // button promises.
    const series = this.data.underWaterCounts()
      .filter(d => d.t >= "2020-01")
      .map(d => ({ t: this._parse(d.t), n: d.n, key: d.t }));
    if (!series.length) return;
    this._uwSeries = series;
    this._uwTotal = this.data.realWageRows().length;   // the same 21 the ledger counts
    const axisGap = this._isPhone ? 22 : 24;               // clear the year labels
    const h = H - axisGap - (this._isPhone ? 6 : 8);       // the strip's own drawing height
    const g = this.svg.append("g").attr("class", "rc-uw")
      .attr("transform", `translate(${M.left},${M.top + ih + axisGap})`);
    const nMax = d3.max(series, d => d.n);
    const y = d3.scaleLinear().domain([0, nMax]).range([h, 0]);
    g.append("path").datum(series).attr("class", "rc-uw-area")
      .attr("d", d3.area().x(d => x(d.t)).y0(h).y1(d => y(d.n)).curve(d3.curveMonotoneX));
    g.append("path").datum(series).attr("class", "rc-uw-line")
      .attr("d", d3.line().x(d => x(d.t)).y(d => y(d.n)).curve(d3.curveMonotoneX));
    g.append("line").attr("class", "rc-uw-base").attr("x1", 0).attr("x2", iw).attr("y1", h).attr("y2", h);

    // Peak of the CRISIS, named with its month — see the note above on why not "17".
    const crisis = series.filter(d => d.key >= "2021-01" && d.key <= "2023-12");
    const peak = crisis.reduce((a, b) => (b.n > a.n ? b : a), crisis[0]);
    if (peak) {
      g.append("circle").attr("class", "rc-uw-peak-dot").attr("cx", x(peak.t)).attr("cy", y(peak.n)).attr("r", 3);
      g.append("text").attr("class", "rc-uw-peak").attr("x", x(peak.t) + 6).attr("y", y(peak.n) + 4)
        .text(`${peak.n} · ${MONTH_ABBR[+peak.key.slice(5) - 1]} ${peak.key.slice(0, 4)}`);
    }
    if (!this._isPhone) {
      g.append("text").attr("class", "rc-uw-note").attr("x", 0).attr("y", h + 13)
        .text("countries whose floor bought less than in January 2019 · from 2020");
    }
    // Its own hover target — the main plot's rect stops at the axis, and a strip you cannot
    // interrogate is a shape rather than a reading. Shares the singleton tooltip.
    const bisect = d3.bisector(d => d.t).left;
    g.append("rect").attr("class", "rc-uw-hit").attr("x", 0).attr("y", -4)
      .attr("width", iw).attr("height", h + 8).attr("fill", "transparent")
      .on("mousemove", (e) => {
        const [mx] = d3.pointer(e, g.node());
        const t = x.invert(mx);
        const i = Math.max(0, Math.min(series.length - 1, bisect(series, t)));
        const a = series[Math.max(0, i - 1)], b = series[i];
        const d = (!a || Math.abs(b.t - t) < Math.abs(a.t - t)) ? b : a;
        this.ctx.tooltip.show(
          `<h5>${MONTH_ABBR[+d.key.slice(5) - 1]} ${d.key.slice(0, 4)}</h5>` +
          `<div class="row"><span class="key">Floors below their 2019 level</span>` +
          `<span class="val">${d.n} of ${this._uwTotal}</span></div>`,
          e.clientX, e.clientY);
      })
      .on("mouseleave", () => this.ctx.tooltip.hide());

    this._uwG = g; this._uwY = y; this._uwH = h;
  }

  _renderChips() {
    const host = this._controlsHost(); if (!host) return;
    const chips = host.querySelector(".ac-chips"); if (!chips) return;
    chips.innerHTML = this._selectedCodes.map(code =>
      `<span class="ac-chip" role="listitem">${this.data.countryName(code)}` +
      `<button type="button" class="ac-chip-x" data-code="${code}" aria-label="Remove ${this.data.countryName(code)}">×</button></span>`).join("");
    chips.querySelectorAll(".ac-chip-x").forEach(b => b.addEventListener("click", () => this._removeCountry(b.dataset.code)));
    const reset = host.querySelector(".ac-reset"); if (reset) reset.hidden = !this._selectedCodes.length;
    const sel = host.querySelector(".ac-select"); if (sel) sel.disabled = this._selectedCodes.length >= 2;   // race: max 2
  }

  _addCountry(code) { if (this._selectedCodes.includes(code) || this._selectedCodes.length >= 2) return; this._selectedCodes.push(code); this._pairCache.set(code, this._countryPair(code)); this._rescaleY(true); this._renderChips(); }   // [§B.7] rescale y over visible series
  _removeCountry(code) { this._selectedCodes = this._selectedCodes.filter(c => c !== code); this._pairCache.delete(code); this._rescaleY(true); this._renderChips(); }
  _resetCountries() { if (!this._selectedCodes.length) return; this._selectedCodes = []; this._pairCache.clear(); this._rescaleY(true); this._renderChips(); }

  // A country's own pay index (from its 2019 floor) and price index (its HICP), monthly, 2019 = 100.
  _countryPair(code) {
    const parse = this._parse, mw = this.data.minWages, idx = this.data.hicpIndex[code]?.CP00 || {};
    const pBase = idx["2019-01"], wBase = mw[code]?.["2019-S1"];
    const pts = this._mwPeriods.map(p => ({ t: parse(p.m), v: (wBase && mw[code]?.[p.key]) ? mw[code][p.key] / wBase * 100 : null })).filter(d => d.v != null);
    const payAt = m => {
      const t = parse(m).getTime();
      if (!pts.length) return null;
      if (t <= pts[0].t.getTime()) return pts[0].v;
      if (t >= pts.at(-1).t.getTime()) return pts.at(-1).v;
      for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (t <= b.t.getTime()) { const f = (t - a.t.getTime()) / (b.t.getTime() - a.t.getTime()); return a.v + (b.v - a.v) * f; } }
      return pts.at(-1).v;
    };
    const price = this._monthsList.map(m => ({ t: parse(m), v: (pBase && Number.isFinite(idx[m])) ? idx[m] / pBase * 100 : null })).filter(d => d.v != null);
    const pay = pts.length ? this._monthsList.map(m => ({ t: parse(m), v: payAt(m) })) : [];
    return { pay, price };
  }

  _drawExtras() {
    if (!this._extraG) return;
    this._extraG.selectAll("*").remove();
    const x = this._x, y = this._y, line = d3.line().x(d => x(d.t)).y(d => y(d.v)).curve(d3.curveMonotoneX);
    const domHi = x.domain()[1];
    this._selectedCodes.forEach(code => {
      const pair = this._countryPair(code);
      [["pay", pair.pay, "var(--cat-wages)"], ["price", pair.price, "var(--accent)"]].forEach(([k, ser, col]) => {
        if (!ser.length) return;
        this._extraG.append("path").datum(ser).attr("class", "race-extra-line").attr("fill", "none")
          .attr("stroke", col).attr("stroke-width", 1.5).attr("stroke-dasharray", "3 3").attr("stroke-opacity", 0.7).attr("stroke-linejoin", "round").attr("d", line);
        const vis = ser.filter(d => d.t <= domHi); const end = vis.at(-1) || ser.at(-1);
        this._extraG.append("text").attr("class", `race-extra-label race-extra-label--${k}`).attr("x", x(end.t) + 4).attr("y", y(end.v) + 3)
          .attr("paint-order", "stroke").attr("stroke", "var(--bg)").attr("stroke-width", 3).text(code);   /* [D93] colour via the class; 11px text takes the text-safe jade/claret */
      });
    });
  }

  _syncZoomButtons() { const host = this._controlsHost(); if (!host) return; host.querySelectorAll(".ac-zoom-btn").forEach(b => b.classList.toggle("is-on", b.dataset.zoom === this._zoom)); }

  _applyZoom(preset, animate) {
    this._zoom = preset;
    const p = this._parse, x = this._x, y = this._y, iw = this._iw;
    x.domain(preset === "crisis" ? [p("2021-01"), p("2023-12")] : [p("2019-01"), p("2025-12")]);
    this._drawn = 1; if (this._clip) this._clip.attr("width", iw + 4);
    const dur = (animate && !this.ctx.motion.reduced) ? 600 : 0;
    const t = d3.transition().duration(dur).ease(d3.easeCubicInOut);
    const crisis = preset === "crisis", rows = this._rows;
    const priceLine = d3.line().x(d => x(d.t)).y(d => y(d.price)).curve(d3.curveMonotoneX);
    const payLine = d3.line().x(d => x(d.t)).y(d => y(d.pay)).curve(d3.curveMonotoneX);
    const area = d3.area().x(d => x(d.t)).curve(d3.curveMonotoneX);
    this._g.select(".axis--x").transition(t).call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")));
    this._g.select(".rc-line-price").transition(t).attr("d", priceLine(rows));
    this._g.select(".rc-line-pay").transition(t).attr("d", payLine(rows));
    this._g.select(".rc-gap-jade").transition(t).attr("d", area.y0(d => y(d.price)).y1(d => y(d.pay)).defined(d => d.pay >= d.price)(rows));
    this._g.select(".rc-gap-claret").transition(t).attr("d", area.y0(d => y(d.price)).y1(d => y(d.pay)).defined(d => d.pay < d.price)(rows));
    this._g.selectAll(".rc-end-dot,.rc-end-name").style("opacity", crisis ? 0 : 1);
    const bm = BEATS[this._beat]; if (bm && this._beatLine) this._beatLine.interrupt("beat").transition(t).attr("x1", x(p(bm))).attr("x2", x(p(bm)));
    this._setKicker(1);
    // [P3.6] The compare overlays are rebuilt from scratch, so they cannot be tweened in place —
    // they used to snap to the new scale while the base lines eased for 600ms. Deferred to the end
    // of that same transition so they appear already correct instead of visibly wrong first.
    if (t && t.duration && t.duration() > 0) t.end().then(() => this._drawExtras()).catch(() => {});
    else this._drawExtras();
    this._syncZoomButtons();
  }

  _applyBeat(beat) {
    const first = this._beat === beat || !this._beatG;   // [P3.6] a re-assert, or the very first paint
    this._beat = beat;
    const m = BEATS[beat]; if (!m || !this._beatG) return;
    const bx = this._x(this._parse(m));
    const dur = this.ctx.motion.reduced ? 0 : 500;
    // [P3.6] The marker used to TELEPORT between beats while _applyZoom transitions the very same
    // line over 600ms — two different motion rules for one element. It now slides on the same
    // 500ms the group's fade already uses. A first paint (or a re-assert after a re-render) still
    // snaps: there is no previous position to slide from.
    if (first || dur === 0) this._beatLine.interrupt("beat").attr("x1", bx).attr("x2", bx);
    else this._beatLine.interrupt("beat").transition("beat").duration(dur).ease(d3.easeCubicInOut).attr("x1", bx).attr("x2", bx);
    this._beatG.interrupt().transition().duration(dur).style("opacity", 1);
  }

  _pulseEnd() {
    const end = this._rows.at(-1), x = this._x, y = this._y, g = this._g;
    const payDot = g.select(".rc-end-pay");
    if (!payDot.empty()) payDot.attr("filter", ensureGlow(this.svg, "rc-pay-glow", 3));
    if (this.ctx.motion.reduced) return;
    const cx = x(end.t), cy = y(end.pay);
    for (let k = 0; k < 2; k++) g.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 5).attr("fill", "none").attr("stroke", "var(--cat-wages)").attr("stroke-width", 2).style("opacity", 0.6)
      .transition().delay(k * 220).duration(850).ease(d3.easeCubicOut).attr("r", 22).style("opacity", 0).remove();
  }

  destroy() { if (this._unwatch) this._unwatch(); clearTimeout(this._retryT); super.destroy(); }
  onThemeChange() { this.render(); }
}
