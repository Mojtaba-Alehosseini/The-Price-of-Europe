import { BaseChart } from './BaseChart.js';
import { PALETTE } from './palette.js';

export class Choropleth extends BaseChart {
    constructor(selector, data, tooltip, options = {}) {
        super(selector, data, tooltip, {
            height: 520,
            margin: { top: 20, right: 20, bottom: 40, left: 20 },
            ariaLabel: 'Choropleth map of EU annual inflation rate by country, animated over time from 2018 to latest, with hover-to-reveal country sparkline',
            ...options
        });
        this.currentTime = '2019-01';
        this.isPlaying = false;
        this.playInterval = null;
        this.pinnedGeo = null;
    }

    draw() {
        const { hicpMonthly, europeTopojson, countryNames, geoToMapId } = this.data;
        if (!europeTopojson || !hicpMonthly) return;

        // If a previous draw left an interval running (e.g. resize during play),
        // stop it so we can re-apply state cleanly against the rebuilt DOM.
        const wasPlaying = this.isPlaying;
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
        this.isPlaying = false;

        const cp00 = hicpMonthly.filter(d => d.coicop === 'CP00' && d.geo !== 'EA' && d.geo !== 'EU27_2020');
        const times = [...new Set(cp00.map(d => d.time))].sort();
        this.times = times;
        // Preserve slider position across resizes — only seed to 2019 on first draw
        if (this.currentIdx == null) {
            this.currentIdx = times.findIndex(t => t.startsWith('2019'));
            if (this.currentIdx < 0) this.currentIdx = 0;
        }

        this.mapData = d3.group(cp00, d => d.time);
        this.byCountry = d3.group(cp00, d => d.geo);

        // Pre-compute the worst country (peak inflation) per time-step for annotation.
        this.worstAt = new Map();
        for (const [t, vals] of this.mapData) {
            const top = vals.reduce((a, b) => (a && a.value > b.value ? a : b), null);
            if (top) this.worstAt.set(t, top);
        }

        // Equal-area projection (Lecture 10): Mercator distorts northern Europe by
        // ~40% at these latitudes (40°–70°N). Equal Earth is perceptually balanced
        // and the right default for an EU choropleth where visual weight matters.
        const projection = d3.geoEqualEarth()
            .center([15, 52])
            .scale(this.width * 0.9)
            .translate([this.width / 2, this.innerHeight / 2]);

        const path = d3.geoPath().projection(projection);

        let features;
        try {
            const objName = europeTopojson.objects.europe ? 'europe' : Object.keys(europeTopojson.objects)[0];
            features = topojson.feature(europeTopojson, europeTopojson.objects[objName]).features;
        } catch (e) {
            console.error('TopoJSON parse error:', e);
            this.g.append('text').text('Map data error').attr('fill', 'red');
            return;
        }

        // Diverging color scale around the 2% ECB target (Lecture 03: diverging
        // colormap is the textbook choice when the data has a meaningful midpoint).
        // RdBu is colorblind-safe and ColorBrewer-approved; we flip with (1-t)
        // so high inflation = red (danger) and deflation = blue (cool).
        const colorScale = d3.scaleDiverging(t => d3.interpolateRdBu(1 - t))
            .domain([-2, 2, 15]);

        // Background rect
        this.svg.insert('rect', ':first-child')
            .attr('width', this.containerWidth)
            .attr('height', this.height)
            .attr('fill', PALETTE.choroplethBg);

        // Non-EU fill
        const euSet = new Set(Object.values(geoToMapId || {}));

        const countries = this.g.selectAll('.country-path')
            .data(features)
            .join('path')
            .attr('class', 'country-path')
            .attr('d', path)
            .attr('stroke', PALETTE.choroplethStroke)
            .attr('stroke-width', 0.3)
            .attr('fill', d => {
                const geoId = geoToMapId[d.id] || d.id;
                const vals = this.mapData.get(this.times[this.currentIdx]) || [];
                const v = vals.find(x => x.geo === geoId);
                if (v) return colorScale(v.value);
                return euSet.has(geoId) || euSet.has(d.id) ? PALETTE.choroplethNoData : PALETTE.choroplethNonEu;
            });

        countries
            .on('mouseover', (event, d) => {
                const geoId = geoToMapId[d.id] || d.id;
                const vals = this.mapData.get(this.times[this.currentIdx]) || [];
                const v = vals.find(x => x.geo === geoId);
                const name = countryNames[geoId] || d.properties?.name || geoId;
                this.tooltip.show(`
                    <div class="tt-title">${name}</div>
                    <div class="tt-value">${v ? v.value.toFixed(1) + '%' : 'No data'}</div>
                    <div class="tt-value">${this.formatTime(this.times[this.currentIdx])}</div>
                `, event);
                if (!this.pinnedGeo) this.updateInset(geoId);
            })
            .on('mousemove', (event) => this.tooltip.move(event))
            .on('mouseout', () => {
                this.tooltip.hide();
                if (!this.pinnedGeo) this.updateInset(null);
            })
            .on('click', (event, d) => {
                const geoId = geoToMapId[d.id] || d.id;
                this.pinnedGeo = (this.pinnedGeo === geoId) ? null : geoId;
                this.updateInset(this.pinnedGeo);
                this.g.selectAll('.country-path')
                    .attr('stroke-width', cd => {
                        const id = geoToMapId[cd.id] || cd.id;
                        return id === this.pinnedGeo ? 1.5 : 0.3;
                    })
                    .attr('stroke', cd => {
                        const id = geoToMapId[cd.id] || cd.id;
                        return id === this.pinnedGeo ? 'var(--color-text-accent)' : PALETTE.choroplethStroke;
                    });
            });

        // Worst-country highlight: subtle gold ring on the country at peak inflation right now
        this.worstRing = this.g.append('path')
            .attr('class', 'choropleth-worst-ring')
            .attr('fill', 'none')
            .attr('stroke', 'var(--color-text-accent)')
            .attr('stroke-width', 1.6)
            .attr('stroke-dasharray', '3,3')
            .attr('opacity', 0.85)
            .attr('pointer-events', 'none');
        this.path = path;
        this.features = features;
        this.updateWorstRing();

        // Time label
        const timeG = this.g.append('g').attr('transform', `translate(${this.width - 10}, 20)`);
        timeG.append('rect')
            .attr('x', -80).attr('y', -22)
            .attr('width', 90).attr('height', 42)
            .attr('rx', 4)
            .attr('fill', 'rgba(15,15,20,0.7)');

        this.timeLabel = timeG.append('text')
            .attr('class', 'choropleth-time-label')
            .attr('text-anchor', 'end')
            .attr('fill', 'var(--color-text-accent)')
            .attr('font-size', '1.4rem')
            .attr('font-weight', '700')
            .attr('font-family', 'Roboto Slab, serif')
            .text(this.formatYear(this.times[this.currentIdx]));

        this.timeLabelSub = timeG.append('text')
            .attr('class', 'choropleth-time-sub')
            .attr('y', 16)
            .attr('text-anchor', 'end')
            .attr('fill', 'var(--color-text-secondary)')
            .attr('font-size', '0.8rem')
            .text(this.formatTime(this.times[this.currentIdx]));

        // Inset country sparkline panel (top-left, hidden until hover)
        const insetW = Math.min(220, this.width * 0.28);
        const insetH = 84;
        const insetX = 10, insetY = 10;
        this.insetG = this.g.append('g')
            .attr('class', 'choropleth-inset is-hidden')
            .attr('transform', `translate(${insetX},${insetY})`);

        this.insetG.append('rect')
            .attr('width', insetW).attr('height', insetH)
            .attr('rx', 4)
            .attr('fill', 'rgba(15,15,20,0.85)')
            .attr('stroke', 'rgba(255,255,255,0.08)');

        this.insetTitle = this.insetG.append('text')
            .attr('x', 8).attr('y', 16)
            .attr('fill', 'var(--color-text-primary)')
            .attr('font-size', '0.78rem')
            .attr('font-weight', '600');

        this.insetSub = this.insetG.append('text')
            .attr('x', 8).attr('y', 30)
            .attr('fill', 'var(--color-text-secondary)')
            .attr('font-size', '0.62rem');

        this.insetSparkG = this.insetG.append('g')
            .attr('transform', `translate(8,38)`);

        this.insetW = insetW - 16;
        this.insetH = insetH - 46;

        // Legend gradient — sample the diverging scale across the [-2, 15] domain
        // so the bar reads as a continuous diverging ribbon centered on 2%.
        const legendW = 220, legendH = 10;
        const legendX = 10, legendY = this.innerHeight - 30;

        const defs = this.svg.append('defs');
        const grad = defs.append('linearGradient')
            .attr('id', 'choropleth-legend')
            .attr('x1', '0%').attr('x2', '100%');

        const legendStops = 8;
        for (let i = 0; i <= legendStops; i++) {
            const v = -2 + (15 - (-2)) * (i / legendStops);
            grad.append('stop')
                .attr('offset', `${(i / legendStops) * 100}%`)
                .attr('stop-color', colorScale(v));
        }

        this.g.append('rect')
            .attr('x', legendX).attr('y', legendY)
            .attr('width', legendW).attr('height', legendH)
            .attr('fill', 'url(#choropleth-legend)');

        // Tick + label at the 2% ECB target — the diverging midpoint
        const legendScale = d3.scaleLinear().domain([-2, 15]).range([0, legendW]);
        const ecbX = legendScale(2);
        this.g.append('line')
            .attr('class', 'choropleth-legend-target')
            .attr('x1', legendX + ecbX).attr('x2', legendX + ecbX)
            .attr('y1', legendY - 3).attr('y2', legendY + legendH + 3)
            .attr('stroke', 'var(--color-text-accent)')
            .attr('stroke-width', 1.4);
        this.g.append('text')
            .attr('class', 'choropleth-legend-target-label')
            .attr('x', legendX + ecbX).attr('y', legendY + legendH + 16)
            .attr('text-anchor', 'middle')
            .attr('fill', 'var(--color-text-accent)')
            .attr('font-size', '0.62rem')
            .attr('font-weight', '600')
            .text('ECB target: 2%');

        // End labels: deflation (left/blue) ↔ high inflation (right/red)
        this.g.append('text')
            .attr('x', legendX).attr('y', legendY + legendH + 16)
            .attr('text-anchor', 'start')
            .attr('fill', 'var(--color-axis-text)')
            .attr('font-size', '0.62rem')
            .text('Deflation (−2%)');
        this.g.append('text')
            .attr('x', legendX + legendW).attr('y', legendY + legendH + 16)
            .attr('text-anchor', 'end')
            .attr('fill', 'var(--color-axis-text)')
            .attr('font-size', '0.62rem')
            .text('High inflation (15%)');

        this.g.append('text')
            .attr('x', legendX).attr('y', legendY - 6)
            .attr('fill', 'var(--color-text-secondary)')
            .attr('font-size', '0.7rem')
            .text('Annual inflation rate');

        // Controls — class-driven (chart-controls + choropleth-controls modifier)
        const controls = this.container.append('div')
            .attr('class', 'chart-controls choropleth-controls');

        const playBtn = controls.append('button')
            .attr('class', 'play-button')
            .attr('aria-label', 'Play time animation')
            .attr('type', 'button')
            .text('▶')
            .on('click', () => this.togglePlay());

        const slider = controls.append('input')
            .attr('type', 'range')
            .attr('class', 'time-slider')
            .attr('aria-label', 'Time slider')
            .attr('min', 0)
            .attr('max', times.length - 1)
            .attr('value', this.currentIdx)
            .on('input', (event) => {
                this.currentIdx = +event.target.value;
                this.updateMap(colorScale);
            });

        this.colorScale = colorScale;
        this.countries = countries;

        // Resume playback if it was active before resize
        if (wasPlaying) this.togglePlay();
    }

    // Inset sparkline: shows the hovered/pinned country's full HICP timeseries
    // with min/max anchors and a "now" dot tied to the slider position.
    updateInset(geoId) {
        if (!this.insetG) return;
        if (!geoId) {
            this.insetG.classed('is-hidden', true);
            this.insetSparkG.selectAll('*').remove();
            return;
        }
        const series = (this.byCountry.get(geoId) || []).slice().sort((a, b) => a.time.localeCompare(b.time));
        if (series.length === 0) {
            this.insetG.classed('is-hidden', true);
            return;
        }
        const name = this.data.countryNames[geoId] || geoId;
        const min = d3.min(series, d => d.value);
        const max = d3.max(series, d => d.value);
        const now = series.find(d => d.time === this.times[this.currentIdx]) || series[series.length - 1];

        this.insetG.classed('is-hidden', false);
        this.insetTitle.text(`${name}${this.pinnedGeo === geoId ? ' (pinned)' : ''}`);
        this.insetSub.text(`Range: ${min.toFixed(1)}% to ${max.toFixed(1)}% • now: ${now.value.toFixed(1)}%`);

        const x = d3.scaleLinear().domain([0, series.length - 1]).range([0, this.insetW]);
        const y = d3.scaleLinear().domain([Math.min(0, min), max]).nice().range([this.insetH, 0]);

        const line = d3.line()
            .x((_, i) => x(i))
            .y(d => y(d.value))
            .curve(d3.curveMonotoneX);

        this.insetSparkG.selectAll('*').remove();

        // ECB target reference
        if (y.domain()[0] <= 2 && y.domain()[1] >= 2) {
            this.insetSparkG.append('line')
                .attr('x1', 0).attr('x2', this.insetW)
                .attr('y1', y(2)).attr('y2', y(2))
                .attr('stroke', 'rgba(255,255,255,0.18)')
                .attr('stroke-dasharray', '2,2')
                .attr('stroke-width', 0.8);
        }

        this.insetSparkG.append('path')
            .datum(series)
            .attr('fill', 'none')
            .attr('stroke', 'var(--color-text-accent)')
            .attr('stroke-width', 1.5)
            .attr('d', line);

        // Now-dot at currentIdx
        const nowIdx = series.findIndex(d => d.time === this.times[this.currentIdx]);
        if (nowIdx >= 0) {
            this.insetSparkG.append('circle')
                .attr('cx', x(nowIdx))
                .attr('cy', y(now.value))
                .attr('r', 3.5)
                .attr('fill', 'var(--color-text-accent)')
                .attr('stroke', 'var(--color-bg-card)')
                .attr('stroke-width', 1.5);
        }
    }

    updateWorstRing() {
        if (!this.worstRing || !this.path || !this.features) return;
        const t = this.times[this.currentIdx];
        const worst = this.worstAt.get(t);
        if (!worst) { this.worstRing.attr('d', null); return; }
        // Eurostat 'EL' (Greece) maps to TopoJSON 'GR'; everything else is identical.
        const targetId = this.data.geoToMapId[worst.geo] || worst.geo;
        const feat = this.features.find(f => f.id === targetId);
        if (!feat) { this.worstRing.attr('d', null); return; }
        this.worstRing.attr('d', this.path(feat));
    }

    formatTime(t) {
        const [y, m] = t.split('-');
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return `${months[(+m) - 1]} ${y}`;
    }

    formatYear(t) {
        return t.split('-')[0];
    }

    updateMap(colorScale) {
        colorScale = colorScale || this.colorScale;
        const t = this.times[this.currentIdx];
        // Re-select from DOM so updates work even after BaseChart.resize() rebuilt the SVG
        const countries = this.g.selectAll('.country-path');
        const timeLabel = this.g.select('.choropleth-time-label');
        const timeLabelSub = this.g.select('.choropleth-time-sub');
        if (!timeLabel.empty()) timeLabel.text(this.formatYear(t));
        if (!timeLabelSub.empty()) timeLabelSub.text(this.formatTime(t));
        const vals = this.mapData.get(t) || [];
        countries.transition().duration(250)
            .attr('fill', d => {
                const geoId = this.data.geoToMapId[d.id] || d.id;
                const v = vals.find(x => x.geo === geoId);
                if (v) return colorScale(v.value);
                return PALETTE.choroplethNoData;
            });

        this.updateWorstRing();
        if (this.pinnedGeo) this.updateInset(this.pinnedGeo);
    }

    togglePlay() {
        if (this.isPlaying) {
            clearInterval(this.playInterval);
            this.isPlaying = false;
            this.container.select('.play-button').text('▶').attr('aria-label', 'Play time animation');
        } else {
            this.isPlaying = true;
            this.container.select('.play-button').text('⏸').attr('aria-label', 'Pause time animation');
            this.playInterval = setInterval(() => {
                this.currentIdx++;
                if (this.currentIdx >= this.times.length) this.currentIdx = 0;
                this.container.select('.time-slider').property('value', this.currentIdx);
                this.updateMap();
            }, 350);
        }
    }
}
