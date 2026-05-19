import { BaseChart } from './BaseChart.js';
import { PALETTE } from './palette.js';

export class SmallMultiplesLine extends BaseChart {
    constructor(selector, data, tooltip, options = {}) {
        super(selector, data, tooltip, {
            height: 720,
            margin: { top: 40, right: 20, bottom: 50, left: 40 },
            ariaLabel: 'Small multiples line chart of euro-area inflation by category, with overview brush below for shared x-axis zoom',
            ...options
        });
    }

    draw() {
        const { hicpMonthly, coicopNames } = this.data;
        if (!hicpMonthly) return;

        const coicops = ['CP00', 'NRG', 'FOOD', 'SERV', 'CP04'];
        const categories = coicops.filter(c => coicopNames[c]);

        // Filter to 2015+ for cleaner view
        const euData = hicpMonthly.filter(d => d.geo === 'EA' && d.year >= 2015);
        const countryData = hicpMonthly.filter(d => d.geo !== 'EA' && d.geo !== 'EU27_2020' && d.year >= 2015);

        // Parse dates
        const parseTime = d3.timeParse('%Y-%m');
        euData.forEach(d => d.date = parseTime(d.time));
        countryData.forEach(d => d.date = parseTime(d.time));

        // Layout: 2 columns with title padding + a bottom brush track (overview).
        // Lecture 13's "overview + detail" pattern: the brush below acts as the
        // overview, the small-multiples grid above is the detail view.
        const cols = 2;
        const titlePad = 22;
        const brushH = 50;
        const brushGap = 28;
        const captionH = 16;
        const panelArea = this.innerHeight - brushH - brushGap - captionH;
        const panelW = (this.width - (cols - 1) * 20) / cols;
        const rowsCount = Math.ceil(categories.length / cols);
        const panelH = (panelArea - (rowsCount - 1) * 20 - titlePad) / rowsCount;

        const fullDomain = d3.extent(euData, d => d.date);
        const xScale = d3.scaleTime().domain(fullDomain).range([0, panelW]);

        const lineGen = d3.line()
            .x(d => xScale(d.date))
            .curve(d3.curveMonotoneX);

        let selectedCountry = null;
        // Track every renderable element so the brush handler can re-issue the
        // line generator + axis call against the new (zoomed) domain.
        const updaters = [];

        categories.forEach((cat, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const gx = col * (panelW + 20);
            const gy = row * (panelH + 20 + titlePad);

            const panel = this.g.append('g')
                .attr('transform', `translate(${gx},${gy})`);

            // Per-panel Y scale
            const catEu = euData.filter(d => d.coicop === cat);
            const catCountries = countryData.filter(d => d.coicop === cat);
            const catVals = [...catEu, ...catCountries].map(d => d.value);
            const yScale = d3.scaleLinear()
                .domain([d3.min(catVals) - 1, d3.max(catVals) + 1])
                .range([panelH, 0]);

            const catLineGen = lineGen.y(d => yScale(d.value));

            // Title
            panel.append('text')
                .attr('x', panelW / 2)
                .attr('y', -titlePad + 6)
                .attr('text-anchor', 'middle')
                .attr('fill', 'var(--color-text-primary)')
                .attr('font-size', '0.85rem')
                .attr('font-weight', '600')
                .text(coicopNames[cat]);

            // Axes — bottom axis is brush-reactive (its scale changes), so we
            // remember the group and re-call axisBottom on brush events.
            const xAxisG = panel.append('g')
                .attr('class', 'sm-x-axis')
                .attr('transform', `translate(0,${panelH})`);
            const renderXAxis = () => {
                xAxisG.call(d3.axisBottom(xScale).ticks(3).tickFormat(d3.timeFormat('%Y')));
                xAxisG.selectAll('text').attr('fill', 'var(--color-axis-text)').attr('font-size', '0.65rem');
            };
            renderXAxis();
            updaters.push(renderXAxis);

            panel.append('g')
                .call(d3.axisLeft(yScale).ticks(3).tickFormat(d => d + '%'))
                .selectAll('text').attr('fill', 'var(--color-axis-text)').attr('font-size', '0.65rem');

            // Grid
            panel.append('g')
                .call(d3.axisLeft(yScale).ticks(3).tickSize(-panelW).tickFormat('').tickSizeOuter(0))
                .selectAll('line').attr('stroke', 'var(--color-grid)');

            // Zero reference line
            if (yScale.domain()[0] < 0 && yScale.domain()[1] > 0) {
                panel.append('line')
                    .attr('class', 'zero-line')
                    .attr('x1', 0).attr('x2', panelW)
                    .attr('y1', yScale(0)).attr('y2', yScale(0))
                    .attr('stroke', 'rgba(255,255,255,0.2)')
                    .attr('stroke-width', 1)
                    .attr('stroke-dasharray', '3,3');
            }

            // Country lines (light)
            const byCountry = d3.group(catCountries, d => d.geo);

            byCountry.forEach((vals, geo) => {
                const path = panel.append('path')
                    .datum(vals)
                    .attr('fill', 'none')
                    .attr('stroke', selectedCountry === geo ? 'var(--color-text-accent)' : PALETTE.line.contextDim)
                    .attr('stroke-width', selectedCountry === geo ? 2 : 1)
                    .attr('class', `country-line-${geo}`)
                    .attr('d', catLineGen);
                updaters.push(() => path.attr('d', catLineGen));
                path
                    .on('mouseover', (event) => {
                        selectedCountry = geo;
                        this.g.selectAll('[class^="country-line-"]')
                            .attr('stroke', PALETTE.line.contextFade)
                            .attr('stroke-width', 1);
                        this.g.selectAll(`.country-line-${geo}`)
                            .attr('stroke', 'var(--color-text-accent)')
                            .attr('stroke-width', 2);
                    })
                    .on('mousemove', (event) => {
                        const [mx] = d3.pointer(event, panel.node());
                        const x0 = xScale.invert(mx);
                        const i = d3.bisector(p => p.date).left(vals, x0, 1);
                        const point = vals[Math.min(i, vals.length - 1)];
                        if (!point) { this.tooltip.move(event); return; }
                        this.tooltip.show(`
                            <div class="tt-title">${this.data.countryNames[geo] || geo}</div>
                            <div class="tt-value">${this.data.coicopNames[cat] || cat}</div>
                            <div class="tt-value">${d3.timeFormat('%b %Y')(point.date)}: ${point.value.toFixed(1)}%</div>
                        `, event);
                    })
                    .on('mouseout', () => {
                        this.tooltip.hide();
                        selectedCountry = null;
                        this.g.selectAll('[class^="country-line-"]')
                            .attr('stroke', PALETTE.line.contextDim)
                            .attr('stroke-width', 1);
                    });
            });

            // EU average line (bold) — also brush-reactive so the average
            // re-fits the zoomed window.
            const euPath = panel.append('path')
                .datum(catEu)
                .attr('fill', 'none')
                .attr('stroke', this.getCatColor(cat))
                .attr('stroke-width', 2.5)
                .attr('d', catLineGen);
            updaters.push(() => euPath.attr('d', catLineGen));

            // Annotation: Ukraine invasion (Feb 2022). Position is x-scale
            // dependent, so the brush handler must move it.
            const ukraineDate = parseTime('2022-02');
            const ukraineLine = panel.append('line')
                .attr('class', 'sm-ukraine-line')
                .attr('x1', xScale(ukraineDate)).attr('x2', xScale(ukraineDate))
                .attr('y1', 0).attr('y2', panelH)
                .attr('stroke', PALETTE.annotationLine)
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '2,3')
                .attr('pointer-events', 'none');
            updaters.push(() => {
                const x = xScale(ukraineDate);
                const inRange = ukraineDate >= xScale.domain()[0] && ukraineDate <= xScale.domain()[1];
                ukraineLine
                    .attr('x1', x).attr('x2', x)
                    .style('display', inRange ? null : 'none');
            });
        });

        // Caption explaining the annotation (only render once, below all panels)
        this.g.append('text')
            .attr('x', 0)
            .attr('y', panelArea + 12)
            .attr('font-size', '0.65rem')
            .attr('fill', 'var(--color-axis-text)')
            .attr('font-style', 'italic')
            .text('Dashed line: Russia invades Ukraine (Feb 2022)');

        // ─── Brush track (overview + detail, Lecture 13) ──────────────────────
        // The mini-line at the bottom shows the EU CP00 (all-items) series at
        // full time range. Drag a selection on it to zoom every panel above
        // simultaneously. Click outside to reset.
        const brushG = this.g.append('g')
            .attr('class', 'sm-brush')
            .attr('transform', `translate(0,${panelArea + brushGap})`);

        brushG.append('text')
            .attr('x', 0).attr('y', -6)
            .attr('font-size', '0.62rem')
            .attr('fill', 'var(--color-axis-text)')
            .attr('font-style', 'italic')
            .text('Drag a range to zoom · click to reset');

        const brushXScale = d3.scaleTime().domain(fullDomain).range([0, this.width]);
        const brushOverview = euData.filter(d => d.coicop === 'CP00');
        const brushYScale = d3.scaleLinear()
            .domain(d3.extent(brushOverview, d => d.value))
            .range([brushH, 0]);
        const brushLineGen = d3.line()
            .x(d => brushXScale(d.date))
            .y(d => brushYScale(d.value))
            .curve(d3.curveMonotoneX);

        // Overview line (CP00, EU average — same series the headline uses)
        brushG.append('path')
            .datum(brushOverview)
            .attr('class', 'sm-brush-line')
            .attr('fill', 'none')
            .attr('stroke', this.getCatColor('CP00'))
            .attr('stroke-width', 1)
            .attr('opacity', 0.5)
            .attr('d', brushLineGen);

        // Brush bottom axis (always full range)
        const brushAxisG = brushG.append('g')
            .attr('transform', `translate(0,${brushH})`)
            .call(d3.axisBottom(brushXScale).ticks(8).tickFormat(d3.timeFormat('%Y')))
            .attr('class', 'sm-brush-axis');
        brushAxisG.selectAll('text').attr('fill', 'var(--color-axis-text)').attr('font-size', '0.6rem');

        const brush = d3.brushX()
            .extent([[0, 0], [this.width, brushH]])
            .on('end', (event) => {
                if (!event.sourceEvent) return; // ignore programmatic
                const sel = event.selection;
                const newDomain = sel
                    ? [brushXScale.invert(sel[0]), brushXScale.invert(sel[1])]
                    : fullDomain;
                xScale.domain(newDomain);
                updaters.forEach(fn => fn());
            });

        brushG.append('g')
            .attr('class', 'sm-brush-area')
            .call(brush);
    }

    getCatColor(cat) {
        const colors = {
            'CP00': 'var(--color-cp00)', 'CP01': 'var(--color-cp01)',
            'CP04': 'var(--color-cp04)', 'CP045': 'var(--color-cp045)',
            'CP07': 'var(--color-cp07)', 'CP11': 'var(--color-cp11)',
            'NRG': 'var(--color-nrg)', 'FOOD': 'var(--color-food)',
            'SERV': 'var(--color-housing)'
        };
        return colors[cat] || 'var(--color-text-primary)';
    }
}
