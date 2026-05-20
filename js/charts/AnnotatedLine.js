/* ============================================================
   AnnotatedLine — EU-27 monthly HICP w/ event markers + bands.
   Depth:
     1. computation — picks aggregate, parses time, builds crisis bands
     2. interaction — focus crosshair (vertical line + dot follows curve)
     3. annotation — date labels + band backgrounds for COVID + Energy + ECB
     4. encoding   — single highlighted line over faded context history
   ============================================================ */

import { BaseChart } from "./BaseChart.js";

export class AnnotatedLine extends BaseChart {
  constructor(sel, data, ctx) {
    super(sel, data, ctx, { margin: { top: 24, right: 60, bottom: 36, left: 44 }, aspect: 1.55 });
    this.focus = null; // year window to focus
  }

  render() {
    super.render();
    this.container.innerHTML = "";
    const { width, height } = this.ensureSvg();
    const { width: iw, height: ih } = this.innerSize();

    const eu = this.data.euAggregateCode();
    const parse = d3.timeParse("%Y-%m");
    const all = this.data.monthsCP00().map(t => ({ t: parse(t), v: this.data.hicpMonthly[eu]?.CP00?.[t] }))
      .filter(d => d.v != null && d.t.getFullYear() >= 2010);

    const x = d3.scaleTime().domain(d3.extent(all, d => d.t)).range([0, iw]);
    const y = d3.scaleLinear().domain([-1, Math.max(12, d3.max(all, d => d.v) + 1)]).range([ih, 0]);

    // bands ----------------------------------------------------------
    const bands = [
      { from: "2020-03", to: "2020-09", cls: "event-band--covid",  label: "COVID slump" },
      { from: "2021-09", to: "2023-06", cls: "event-band--energy", label: "Energy + Ukraine" },
      { from: "2022-07", to: "2024-06", cls: "event-band--policy", label: "ECB hike cycle" }
    ];
    bands.forEach(b => {
      this.g.append("rect").attr("class", `event-band ${b.cls}`)
        .attr("x", x(parse(b.from))).attr("width", x(parse(b.to)) - x(parse(b.from)))
        .attr("y", 0).attr("height", ih);
      this.g.append("text").attr("x", x(parse(b.from)) + 4).attr("y", 14)
        .attr("font-size", "0.7rem")
        .attr("fill", "var(--ink-faint)")
        .attr("font-weight", 600)
        .attr("letter-spacing", "0.06em")
        .attr("text-transform", "uppercase")
        .text(b.label);
    });

    // grid + axes ----------------------------------------------------
    this.g.append("g").attr("class", "grid")
      .call(d3.axisLeft(y).tickSize(-iw).ticks(6).tickFormat(""))
      .lower();
    this.g.append("g").attr("class", "axis axis--x")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(d3.timeYear.every(2)).tickFormat(d3.timeFormat("%Y")));
    this.g.append("g").attr("class", "axis axis--y")
      .call(d3.axisLeft(y).ticks(6).tickFormat(d => d + "%"));

    // zero line
    this.g.append("line").attr("class", "zero-line")
      .attr("x1", 0).attr("x2", iw).attr("y1", y(0)).attr("y2", y(0));
    // ECB target 2%
    this.g.append("line").attr("class", "ref-line")
      .attr("x1", 0).attr("x2", iw).attr("y1", y(2)).attr("y2", y(2))
      .attr("stroke", "var(--seq-target)").attr("stroke-opacity", 0.7);
    this.g.append("text")
      .attr("x", iw - 4).attr("y", y(2) - 4).attr("text-anchor", "end")
      .attr("font-size", "0.72rem").attr("fill", "var(--seq-target)")
      .text("ECB 2 % target");

    // path -----------------------------------------------------------
    const line = d3.line().x(d => x(d.t)).y(d => y(d.v)).curve(d3.curveMonotoneX);
    const linePath = this.g.append("path")
      .datum(all).attr("class", "line series--overall")
      .attr("stroke", "var(--accent)").attr("stroke-width", 2.2)
      .attr("d", line);

    // animate path on first render
    if (!this.ctx.motion.reduced) {
      const len = linePath.node().getTotalLength();
      linePath.attr("stroke-dasharray", `${len} ${len}`).attr("stroke-dashoffset", len)
        .transition().duration(1400).ease(d3.easeCubicOut)
        .attr("stroke-dashoffset", 0)
        .on("end", () => linePath.attr("stroke-dasharray", null));
    }

    // event dots (from events.json)
    const focusedEvents = this.data.events.filter(e => e.date.length >= 7);
    this.g.selectAll("circle.evt")
      .data(focusedEvents).join("circle")
      .attr("class", "evt")
      .attr("cx", d => x(new Date(d.date)))
      .attr("cy", d => {
        const month = d.date.slice(0, 7);
        const rec = all.find(r => d3.timeFormat("%Y-%m")(r.t) === month);
        return rec ? y(rec.v) : ih - 4;
      })
      .attr("r", 4).attr("fill", "var(--bg-elev)").attr("stroke", "var(--accent)").attr("stroke-width", 1.8)
      .style("cursor", "help")
      .on("mouseenter", (event, d) => {
        this.ctx.tooltip.show(`<h5>${d.date}</h5><p style="margin:0;color:var(--ink-soft)">${d.event}</p>`,
          event.clientX, event.clientY);
      })
      .on("mousemove", (event) => this.ctx.tooltip.move(event.clientX, event.clientY))
      .on("mouseleave", () => this.ctx.tooltip.hide());

    // Peak label
    const peak = d3.greatest(all, d => d.v);
    if (peak) {
      this.g.append("text")
        .attr("x", x(peak.t)).attr("y", y(peak.v) - 12)
        .attr("font-family", "var(--font-display)")
        .attr("font-size", "1.05rem").attr("font-weight", 600)
        .attr("fill", "var(--accent)").attr("text-anchor", "middle")
        .text(`Peak · ${peak.v.toFixed(1)}%`);
      this.g.append("text")
        .attr("x", x(peak.t)).attr("y", y(peak.v) + 2 + 14)
        .attr("font-size", "0.74rem").attr("fill", "var(--ink-faint)").attr("text-anchor", "middle")
        .text(d3.timeFormat("%b %Y")(peak.t));
    }

    // Crosshair --------------------------------------------------------
    const ch = this.g.append("g").attr("class", "crosshair-g").style("opacity", 0);
    ch.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", ih);
    const dot = ch.append("circle").attr("r", 4).attr("fill", "var(--accent)").attr("stroke", "var(--bg-elev)").attr("stroke-width", 1.5);

    const bisect = d3.bisector(d => d.t).left;
    this.svg.append("rect")
      .attr("x", this.opts.margin.left).attr("y", this.opts.margin.top)
      .attr("width", iw).attr("height", ih)
      .attr("fill", "transparent")
      .on("mousemove", (event) => {
        const [mx] = d3.pointer(event, this.g.node());
        const t = x.invert(mx);
        const i = bisect(all, t);
        const rec = all[Math.max(0, Math.min(all.length - 1, i))];
        if (!rec) return;
        ch.style("opacity", 1).attr("transform", `translate(${x(rec.t)},0)`);
        dot.attr("cx", 0).attr("cy", y(rec.v));
        this.ctx.tooltip.show(`<h5>${d3.timeFormat("%b %Y")(rec.t)}</h5>
          <div class="row"><span class="key">EU-27 HICP</span><span class="val">${rec.v.toFixed(1)}%</span></div>`,
          event.clientX, event.clientY);
      })
      .on("mouseleave", () => { ch.style("opacity", 0); this.ctx.tooltip.hide(); });
  }
}
