import { BaseChart } from './BaseChart.js';
import { PALETTE } from './palette.js';

export class AnnotatedLine extends BaseChart {
    constructor(selector, data, tooltip, options = {}) {
        super(selector, data, tooltip, {
            height: 500,
            margin: { top: 90, right: 30, bottom: 50, left: 60 },
            ariaLabel: 'Line chart of euro-area inflation rate since 2015, annotated with key COVID, energy, and ECB policy events',
            ...options
        });
        this.filterCat = 'all';
    }

    draw() {
        const { hicpMonthly, eventsTimeline } = this.data;
        if (!hicpMonthly) return;

        const euData = hicpMonthly.filter(d => d.geo === 'EA' && d.coicop === 'CP00');
        const parseTime = d3.timeParse('%Y-%m');
        euData.forEach(d => d.date = parseTime(d.time));
        euData.sort((a, b) => a.date - b.date);

        // Filter to 2015+
        const cutoff = new Date('2015-01-01');
        const filteredData = euData.filter(d => d.date >= cutoff);

        // Controls
        const cats = ['all', 'covid', 'energy', 'policy', 'food'];
        const catLabels = { all: 'All Events', covid: 'COVID', energy: 'Energy', policy: 'Policy', food: 'Food' };

        const controls = this.container.insert('div', ':first-child')
            .attr('class', 'chart-controls');
        cats.forEach(c => {
            controls.append('button')
                .text(catLabels[c])
                .classed('active', c === this.filterCat)
                .on('click', (event) => {
                    this.filterCat = c;
                    controls.selectAll('button').classed('active', false);
                    d3.select(event.currentTarget).classed('active', true);
                    this.g.selectAll('.event-marker, .event-label, .event-line, .event-tick').style('display', d => this.filterCat === 'all' || d.category === this.filterCat ? null : 'none');
                });
        });

        const xScale = d3.scaleTime()
            .domain(d3.extent(filteredData, d => d.date))
            .range([0, this.width]);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(filteredData, d => d.value) * 1.15])
            .range([this.innerHeight, 0]);

        // Grid
        this.g.append('g')
            .call(d3.axisLeft(yScale).tickSize(-this.width).tickFormat('').tickSizeOuter(0))
            .selectAll('line').attr('stroke', PALETTE.line.gridLine).attr('stroke-dasharray', '2,4');

        // Axes
        this.g.append('g')
            .attr('transform', `translate(0,${this.innerHeight})`)
            .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.timeFormat('%Y')).tickSizeInner(4).tickSizeOuter(0))
            .selectAll('text').attr('fill', 'var(--color-axis-text)').attr('font-size', '0.7rem');

        this.g.append('g')
            .call(d3.axisLeft(yScale).ticks(5).tickSizeInner(4).tickSizeOuter(0).tickFormat(d => d + '%'))
            .selectAll('text').attr('fill', 'var(--color-axis-text)');

        // Area fill under line
        const areaGen = d3.area()
            .x(d => xScale(d.date))
            .y0(this.innerHeight)
            .y1(d => yScale(d.value))
            .curve(d3.curveMonotoneX);

        this.g.append('path')
            .datum(filteredData)
            .attr('fill', 'var(--color-text-accent)')
            .attr('opacity', 0.06)
            .attr('d', areaGen);

        // Line
        const lineGen = d3.line()
            .x(d => xScale(d.date))
            .y(d => yScale(d.value))
            .curve(d3.curveMonotoneX);

        this.g.append('path')
            .datum(filteredData)
            .attr('fill', 'none')
            .attr('stroke', 'var(--color-text-accent)')
            .attr('stroke-width', 2.5)
            .attr('d', lineGen);

        // Focus dot + crosshair on hover
        const focus = this.g.append('g').attr('class', 'al-focus is-hidden');
        focus.append('line')
            .attr('class', 'al-focus-line')
            .attr('y1', 0)
            .attr('y2', this.innerHeight)
            .attr('stroke', 'rgba(240, 192, 64, 0.4)')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,3');
        focus.append('circle')
            .attr('class', 'al-focus-dot')
            .attr('r', 5)
            .attr('fill', 'var(--color-text-accent)')
            .attr('stroke', 'var(--color-bg-card)')
            .attr('stroke-width', 2);

        const bisect = d3.bisector(d => d.date).left;
        this.g.append('rect')
            .attr('class', 'al-overlay')
            .attr('width', this.width)
            .attr('height', this.innerHeight)
            .attr('fill', 'transparent')
            .on('mouseover', () => focus.classed('is-hidden', false))
            .on('mouseout', () => { focus.classed('is-hidden', true); this.tooltip.hide(); })
            .on('mousemove', (event) => {
                const [mx] = d3.pointer(event, this.g.node());
                const x0 = xScale.invert(mx);
                const i = bisect(filteredData, x0, 1);
                const d0 = filteredData[i - 1];
                const d1 = filteredData[i] || d0;
                const d = (x0 - d0.date) > (d1.date - x0) ? d1 : d0;
                focus.select('.al-focus-line')
                    .attr('x1', xScale(d.date))
                    .attr('x2', xScale(d.date));
                focus.select('.al-focus-dot')
                    .attr('cx', xScale(d.date))
                    .attr('cy', yScale(d.value));
                this.tooltip.show(`
                    <div class="tt-title">Euro Area</div>
                    <div class="tt-value">${d3.timeFormat('%B %Y')(d.date)}</div>
                    <div class="tt-value">Inflation: ${d.value.toFixed(1)}%</div>
                `, event);
            });

        // Peak callout — the moment headline inflation maxed out (Oct 2022 in EU data).
        const peak = filteredData.reduce((best, d) => (best == null || d.value > best.value ? d : best), null);
        if (peak) {
            this.g.append('circle')
                .attr('class', 'al-peak-dot')
                .attr('cx', xScale(peak.date))
                .attr('cy', yScale(peak.value))
                .attr('r', 5)
                .attr('fill', 'var(--color-inflation-high)')
                .attr('stroke', 'var(--color-bg-card)')
                .attr('stroke-width', 1.5)
                .attr('pointer-events', 'none');
            this.g.append('text')
                .attr('class', 'al-peak-label')
                .attr('x', xScale(peak.date))
                .attr('y', yScale(peak.value) - 12)
                .attr('text-anchor', 'middle')
                .attr('fill', 'var(--color-inflation-high)')
                .attr('font-size', '0.7rem')
                .attr('font-weight', '600')
                .attr('pointer-events', 'none')
                .text(`Peak ${peak.value.toFixed(1)}%`);
        }

        // Crisis bands
        const bands = [
            { start: '2020-03', end: '2021-06', label: 'COVID', color: PALETTE.bands.covid },
            { start: '2021-10', end: '2023-03', label: 'Energy Crisis', color: PALETTE.bands.energy }
        ];

        bands.forEach(b => {
            const s = parseTime(b.start), e = parseTime(b.end);
            if (s >= xScale.domain()[0] && s <= xScale.domain()[1]) {
                this.g.append('rect')
                    .attr('class', 'crisis-band')
                    .attr('x', xScale(s))
                    .attr('y', 0)
                    .attr('width', xScale(e) - xScale(s))
                    .attr('height', this.innerHeight)
                    .attr('fill', b.color);
                this.g.append('line')
                    .attr('x1', xScale(s)).attr('x2', xScale(e))
                    .attr('y1', 0).attr('y2', 0)
                    .attr('stroke', b.color.replace('0.12', '0.4'))
                    .attr('stroke-width', 1);
            }
        });

        // Events with lanes
        if (eventsTimeline) {
            const catColors = PALETTE.event;
            const laneY = { covid: -44, policy: -44, energy: -24, food: -24 };
            const shortLabels = {
                'WHO declares COVID-19 pandemic': 'COVID declared',
                'EU external border closure': 'EU borders close',
                'Supply chain disruptions intensify': 'Supply chains break',
                'European gas prices begin steep rise': 'Gas prices rise',
                'Russia invades Ukraine': 'Ukraine invasion',
                'EU bans Russian coal imports': 'Coal ban',
                'ECB raises rates for first time in 11 years (+0.50%)': 'ECB raises rates',
                'ECB raises rates to 1.25%': 'ECB 1.25%',
                'EU agrees on emergency energy measures': 'Emergency measures',
                'EU gas price cap agreed': 'Gas price cap',
                'ECB raises rates to 3.50%': 'ECB 3.50%',
                'Food inflation peaks across EU': 'Food peak',
                'ECB raises to record 4.50%': 'ECB 4.50%',
                'ECB first rate cut to 4.25%': 'ECB cuts to 4.25%',
                'ECB cuts to 3.25%': 'ECB 3.25%'
            };

            // 3 landmark labels: crisis onset, crisis peak trigger, resolution — rest are tooltip-only
            const keyEvents = new Set([
                'COVID declared', 'Ukraine invasion', 'ECB cuts to 4.25%'
            ]);

            const eventData = eventsTimeline.map(e => ({
                ...e,
                date: new Date(e.date),
                short: shortLabels[e.event] || e.event
            })).filter(e => e.date >= xScale.domain()[0] && e.date <= xScale.domain()[1]);

            const labelData = eventData.filter(e => keyEvents.has(e.short));

            // Tick lines
            this.g.selectAll('.event-tick')
                .data(eventData)
                .join('line')
                .attr('class', 'event-tick')
                .attr('x1', d => xScale(d.date))
                .attr('x2', d => xScale(d.date))
                .attr('y1', d => (laneY[d.category] || -34) + 6)
                .attr('y2', 0)
                .attr('stroke', d => catColors[d.category] || '#888')
                .attr('stroke-width', 0.8)
                .attr('stroke-dasharray', '2,3');

            // Dots in lanes — all events, tooltip on hover
            this.g.selectAll('.event-marker')
                .data(eventData)
                .join('circle')
                .attr('class', 'event-marker')
                .attr('cx', d => xScale(d.date))
                .attr('cy', d => laneY[d.category] || -34)
                .attr('r', 4)
                .attr('fill', d => catColors[d.category] || '#888')
                .attr('stroke', 'var(--color-bg-card)')
                .attr('stroke-width', 1.5)
                .on('mouseover', (event, d) => {
                    this.tooltip.show(`
                        <div class="tt-title">${d.short}</div>
                        <div class="tt-value">${d3.timeFormat('%B %Y')(d.date)}</div>
                    `, event);
                })
                .on('mousemove', (event) => this.tooltip.move(event))
                .on('mouseout', () => this.tooltip.hide());

            // Permanent labels only for key events, and only when chart is wide enough
            if (this.width > 450) {
                this.g.selectAll('.event-label')
                    .data(labelData)
                    .join('text')
                    .attr('class', 'event-label')
                    .attr('x', d => xScale(d.date))
                    .attr('y', d => (laneY[d.category] || -34) - 8)
                    .attr('font-size', '0.58rem')
                    .attr('fill', d => catColors[d.category] || '#888')
                    .attr('text-anchor', 'middle')
                    .attr('transform', d => `rotate(-40, ${xScale(d.date)}, ${(laneY[d.category] || -34) - 8})`)
                    .text(d => d.short);
            }
        }
    }
}
