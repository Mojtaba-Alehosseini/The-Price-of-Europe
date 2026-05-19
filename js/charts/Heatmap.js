import { BaseChart } from './BaseChart.js';
import { PALETTE } from './palette.js';

const CAT_COLORS = PALETTE.category;

export class Heatmap extends BaseChart {
    constructor(selector, data, tooltip, options = {}) {
        super(selector, data, tooltip, {
            height: 800,
            margin: { top: 48, right: 20, bottom: 40, left: 110 },
            ariaLabel: 'Heatmap of inflation by EU country and category, with time slider and sortable columns',
            ...options
        });
        this.sortBy = 'CP00';
        this.timeIdx = null;
    }

    draw() {
        const { hicpMonthly, coicopNames, countryNames } = this.data;
        if (!hicpMonthly) return;

        // Restrict to the project's narrative window (2018+) so the slider
        // covers the relevant story arc without 21 years of pre-COVID context.
        const allRows = hicpMonthly.filter(d =>
            d.geo !== 'EA' && d.geo !== 'EU27_2020' && d.year >= 2018);
        const times = [...new Set(allRows.map(d => d.time))].sort();
        // Default position: the latest month (preserved across resize/redraw)
        if (this.timeIdx == null) this.timeIdx = times.length - 1;

        const coicops = ['CP00', 'NRG', 'FOOD', 'SERV', 'CP04', 'CP07'];
        const allCountries = [...new Set(allRows.map(d => d.geo))].sort();

        // Both control rows are inserted BEFORE the svg so they sit above the chart.
        // Using 'svg' as the `before` selector (rather than :nth-child) is unambiguous
        // and survives any reordering caused by BaseChart.resize().
        const sortControls = this.container.insert('div', 'svg')
            .attr('class', 'chart-controls');
        sortControls.append('span').attr('class', 'chart-control-label').text('Sort: ');
        ['CP00', 'NRG', 'FOOD', 'alphabetical'].forEach(sortKey => {
            sortControls.append('button')
                .text(sortKey === 'alphabetical' ? 'A-Z' : (coicopNames[sortKey] || sortKey))
                .classed('active', sortKey === this.sortBy)
                .on('click', (event) => {
                    this.sortBy = sortKey;
                    sortControls.selectAll('button').classed('active', false);
                    d3.select(event.currentTarget).classed('active', true);
                    this.redraw();
                });
        });

        // Time slider: scrub through every month to compare 2019 vs 2022 peak vs latest
        const timeWrap = this.container.insert('div', 'svg')
            .attr('class', 'chart-controls with-slider');
        timeWrap.append('span')
            .attr('class', 'chart-control-label')
            .text('Month:');
        const timeLbl = timeWrap.append('span')
            .attr('class', 'heatmap-time-label')
            .text(this.formatTime(times[this.timeIdx]));
        timeWrap.append('input')
            .attr('type', 'range')
            .attr('class', 'time-slider')
            .attr('aria-label', 'Heatmap time slider')
            .attr('min', 0)
            .attr('max', times.length - 1)
            .attr('value', this.timeIdx)
            .on('input', (event) => {
                this.timeIdx = +event.target.value;
                timeLbl.text(this.formatTime(times[this.timeIdx]));
                this.heatmapData.data = allRows.filter(d => d.time === times[this.timeIdx]);
                this.heatmapData.currentTime = times[this.timeIdx];
                this.redraw();
            });

        const currentTime = times[this.timeIdx];
        const data = allRows.filter(d => d.time === currentTime);
        this.heatmapData = { data, coicops, countries: allCountries, currentTime, coicopNames, countryNames };
        this.drawHeatmap();
    }

    redraw() {
        this.g.selectAll('*').remove();
        this.drawHeatmap();
    }

    drawHeatmap() {
        const { data, coicops, countries, currentTime, coicopNames, countryNames } = this.heatmapData;

        let sortedCountries = [...countries];
        if (this.sortBy !== 'alphabetical') {
            const sortData = data.filter(d => d.coicop === this.sortBy);
            const sortMap = new Map(sortData.map(d => [d.geo, d.value]));
            sortedCountries.sort((a, b) => (sortMap.get(b) || 0) - (sortMap.get(a) || 0));
        }

        const cellW = this.width / coicops.length;
        const cellH = Math.max(22, this.innerHeight / sortedCountries.length);

        // Colorblind-safe diverging scale (Lecture 03): RdYlGn fails for
        // deuteranopes (~8% of men). RdBu is ColorBrewer-approved and matches
        // the choropleth's encoding so red = high inflation, blue = deflation,
        // white = ECB target. The (1 - t) flip gets the high end on red.
        const colorScale = d3.scaleDiverging(t => d3.interpolateRdBu(1 - t))
            .domain([15, 2, -2]);

        // Cells
        this.g.selectAll('.heatmap-cell')
            .data(data)
            .join('rect')
            .attr('class', d => `heatmap-cell hm-row-${d.geo}`)
            .attr('x', d => coicops.indexOf(d.coicop) * cellW)
            .attr('y', d => sortedCountries.indexOf(d.geo) * cellH)
            .attr('width', cellW - 1)
            .attr('height', cellH - 1)
            .attr('fill', d => colorScale(d.value))
            .on('mouseover', (event, d) => {
                // Highlight the entire row + label
                this.g.selectAll('.heatmap-cell').attr('opacity', 0.35);
                this.g.selectAll(`.hm-row-${d.geo}`).attr('opacity', 1);
                this.g.selectAll('.row-label').attr('fill', 'var(--color-text-secondary)').attr('font-weight', '400');
                this.g.selectAll('.row-label').filter(geo => geo === d.geo)
                    .attr('fill', 'var(--color-text-accent)').attr('font-weight', '600');
                this.tooltip.show(`
                    <div class="tt-title">${countryNames[d.geo] || d.geo}</div>
                    <div class="tt-value">${coicopNames[d.coicop] || d.coicop}: ${d.value.toFixed(1)}%</div>
                `, event);
            })
            .on('mousemove', (event) => this.tooltip.move(event))
            .on('mouseout', () => {
                this.g.selectAll('.heatmap-cell').attr('opacity', 1);
                this.g.selectAll('.row-label').attr('fill', 'var(--color-text-primary)').attr('font-weight', '400');
                this.tooltip.hide();
            });

        // Column headers with colored underlines
        const headerG = this.g.append('g');
        coicops.forEach((cat, i) => {
            const x = i * cellW + cellW / 2;
            headerG.append('text')
                .attr('x', x)
                .attr('y', -12)
                .attr('text-anchor', 'middle')
                .attr('fill', 'var(--color-text-secondary)')
                .attr('font-size', '0.7rem')
                .attr('font-weight', '600')
                .attr('letter-spacing', '0.05em')
                .text(coicopNames[cat] || cat);

            headerG.append('line')
                .attr('x1', i * cellW + 4)
                .attr('x2', (i + 1) * cellW - 4)
                .attr('y1', -4)
                .attr('y2', -4)
                .attr('stroke', CAT_COLORS[cat] || '#888')
                .attr('stroke-width', 2);
        });

        // Row labels
        this.g.selectAll('.row-label')
            .data(sortedCountries)
            .join('text')
            .attr('class', 'row-label')
            .attr('x', -12)
            .attr('y', (d, i) => i * cellH + cellH / 2 + 4)
            .attr('text-anchor', 'end')
            .attr('fill', 'var(--color-text-primary)')
            .attr('font-size', '0.72rem')
            .text(d => countryNames[d] || d);

        // Time label (formatted as "January 2025")
        this.g.append('text')
            .attr('x', this.width)
            .attr('y', -30)
            .attr('text-anchor', 'end')
            .attr('fill', 'var(--color-text-accent)')
            .attr('font-size', '0.8rem')
            .attr('font-weight', '600')
            .text(this.formatTime(currentTime));

        // Legend: small horizontal gradient (-2% deflation → 15% high inflation)
        const legW = Math.min(160, Math.max(80, this.width * 0.5));
        const legH = 8;
        const legX = this.width - legW;
        const legY = this.innerHeight + 6;

        const defs = this.svg.append('defs');
        const grad = defs.append('linearGradient')
            .attr('id', 'heatmap-legend-grad')
            .attr('x1', '0%').attr('x2', '100%');
        // Match the diverging scale (RdBu flipped): blue at deflation (-2%),
        // white at ECB target (2%), red at crisis (15%). 2% maps to ~0.235 of
        // the gradient since the domain spans 17 percentage points.
        const stops = [
            { off: 0,     c: d3.interpolateRdBu(1) },   // blue / -2 (cool / deflation)
            { off: 0.235, c: d3.interpolateRdBu(0.5) }, // white / 2 (ECB target)
            { off: 1,     c: d3.interpolateRdBu(0) },   // red / 15 (high inflation)
        ];
        stops.forEach(s => grad.append('stop').attr('offset', `${s.off * 100}%`).attr('stop-color', s.c));

        this.g.append('rect')
            .attr('x', legX).attr('y', legY)
            .attr('width', legW).attr('height', legH)
            .attr('fill', 'url(#heatmap-legend-grad)');

        const legendScale = d3.scaleLinear().domain([-2, 15]).range([0, legW]);
        this.g.append('g')
            .attr('transform', `translate(${legX},${legY + legH})`)
            .call(d3.axisBottom(legendScale).tickValues([-2, 2, 15]).tickFormat(d => d + '%').tickSizeInner(3).tickSizeOuter(0))
            .selectAll('text').attr('fill', 'var(--color-axis-text)').attr('font-size', '0.65rem');

        this.g.append('text')
            .attr('x', legX).attr('y', legY - 4)
            .attr('fill', 'var(--color-text-secondary)')
            .attr('font-size', '0.65rem')
            .text('Annual inflation rate');
    }

    formatTime(t) {
        const [y, m] = t.split('-');
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
        return `${months[(+m) - 1]} ${y}`;
    }
}
