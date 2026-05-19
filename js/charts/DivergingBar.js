import { BaseChart } from './BaseChart.js';
import { PALETTE } from './palette.js';

export class DivergingBar extends BaseChart {
    constructor(selector, data, tooltip, options = {}) {
        super(selector, data, tooltip, {
            height: 720,
            margin: { top: 30, right: 80, bottom: 80, left: 120 },
            ariaLabel: 'Diverging bar chart of real wage change by EU country between 2019 and 2024, showing whether minimum wage growth outpaced inflation',
            ...options
        });
        this.sortBy = 'real';
    }

    draw() {
        const { hicpAnnual, minimumWages, countriesMeta, countryNames } = this.data;
        if (!hicpAnnual || !minimumWages) return;

        const semMatch = d => d.semester === 'S1' || d.semester === '-S1';
        const wage2019 = d3.group(minimumWages.filter(d => d.year === 2019 && semMatch(d)), d => d.geo);
        const wage2024 = d3.group(minimumWages.filter(d => d.year === 2024 && semMatch(d)), d => d.geo);
        const hicp2019 = d3.group(hicpAnnual.filter(d => d.coicop === 'CP00' && d.year === 2019), d => d.geo);
        const hicp2024 = d3.group(hicpAnnual.filter(d => d.coicop === 'CP00' && d.year === 2024), d => d.geo);

        const countries = [...new Set([...wage2019.keys(), ...wage2024.keys()])];

        const data = countries.map(geo => {
            const w19 = wage2019.get(geo)?.[0]?.value;
            const w24 = wage2024.get(geo)?.[0]?.value;
            const h19 = hicp2019.get(geo)?.[0]?.value;
            const h24 = hicp2024.get(geo)?.[0]?.value;
            if (!w19 || !w24 || !h19 || !h24 || h19 <= 0) return null;
            const nominalWageChange = ((w24 / w19) - 1) * 100;
            const inflationFactor = h24 / h19;
            const realChange = ((1 + nominalWageChange / 100) / inflationFactor - 1) * 100;
            const hasMinWage = countriesMeta[geo]?.has_min_wage ?? true;
            return { geo, nominalWageChange, realChange, hasMinWage };
        }).filter(d => d != null && Math.abs(d.realChange) < 200);

        const controls = this.container.insert('div', ':first-child')
            .attr('class', 'chart-controls');
        ['real', 'alphabetical'].forEach(s => {
            const labels = { real: 'Real wage change', alphabetical: 'A-Z' };
            controls.append('button')
                .text(labels[s])
                .classed('active', s === this.sortBy)
                .on('click', (event) => {
                    this.sortBy = s;
                    controls.selectAll('button').classed('active', false);
                    d3.select(event.currentTarget).classed('active', true);
                    this.redraw(data);
                });
        });

        this.chartData = data;
        this.drawBars(data);
    }

    redraw(data) {
        this.g.selectAll('*').remove();
        this.drawBars(data);
    }

    drawBars(data) {
        const { countryNames } = this.data;

        if (this.sortBy === 'real') data.sort((a, b) => b.realChange - a.realChange);
        else data.sort((a, b) => (countryNames[a.geo] || a.geo).localeCompare(countryNames[b.geo] || b.geo));

        const yScale = d3.scaleBand()
            .domain(data.map(d => d.geo))
            .range([0, this.innerHeight])
            .padding(0.18);

        const maxAbs = Math.max(Math.abs(d3.min(data, d => d.realChange)), Math.abs(d3.max(data, d => d.realChange)));
        const paddedMax = maxAbs * 1.15;

        const xScale = d3.scaleLinear()
            .domain([-paddedMax, paddedMax])
            .range([0, this.width]);

        const zeroX = xScale(0);

        // Grid lines
        this.g.append('g')
            .call(d3.axisLeft(yScale).tickSize(-this.width).tickFormat('').tickSizeOuter(0))
            .selectAll('line').attr('stroke', PALETTE.line.gridLine);

        // Center zero line
        this.g.append('line')
            .attr('x1', zeroX).attr('x2', zeroX)
            .attr('y1', 0).attr('y2', this.innerHeight)
            .attr('stroke', PALETTE.line.zeroLine)
            .attr('stroke-width', 2);

        this.g.append('text')
            .attr('x', zeroX)
            .attr('y', -10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '0.7rem')
            .attr('fill', 'var(--color-text-secondary)')
            .text('0%');

        // Bars
        this.g.selectAll('.diverging-bar')
            .data(data)
            .join('rect')
            .attr('class', d => `diverging-bar ${d.realChange >= 0 ? 'bar-positive' : 'bar-negative'} ${!d.hasMinWage ? 'bar-no-wage' : ''}`)
            .attr('x', d => d.realChange >= 0 ? zeroX : xScale(d.realChange))
            .attr('y', d => yScale(d.geo))
            .attr('width', d => Math.abs(xScale(d.realChange) - zeroX))
            .attr('height', yScale.bandwidth())
            .on('mouseover', (event, d) => {
                d3.select(event.currentTarget)
                    .attr('stroke', 'var(--color-text-accent)')
                    .attr('stroke-width', 1.5);
                this.tooltip.show(`
                    <div class="tt-title">${countryNames[d.geo] || d.geo}</div>
                    <div class="tt-value">Nominal wage: ${d.nominalWageChange > 0 ? '+' : ''}${d.nominalWageChange.toFixed(1)}%</div>
                    <div class="tt-value">Real change: ${d.realChange > 0 ? '+' : ''}${d.realChange.toFixed(1)}%</div>
                    ${!d.hasMinWage ? '<div class="tt-value">No statutory min wage</div>' : ''}
                `, event);
            })
            .on('mousemove', (event) => this.tooltip.move(event))
            .on('mouseout', (event) => {
                d3.select(event.currentTarget).attr('stroke', null).attr('stroke-width', null);
                this.tooltip.hide();
            });

        // Value labels at bar ends
        this.g.selectAll('.bar-value')
            .data(data)
            .join('text')
            .attr('x', d => d.realChange >= 0 ? xScale(d.realChange) + 5 : xScale(d.realChange) - 5)
            .attr('y', d => yScale(d.geo) + yScale.bandwidth() / 2 + 4)
            .attr('text-anchor', d => d.realChange >= 0 ? 'start' : 'end')
            .attr('font-size', '0.65rem')
            .attr('fill', d => d.realChange >= 0 ? 'var(--color-inflation-low)' : 'var(--color-inflation-high)')
            .attr('font-weight', '500')
            .text(d => (d.realChange >= 0 ? '+' : '') + d.realChange.toFixed(1) + '%');

        // Country labels — fixed at left margin so they never overlap bars
        this.g.selectAll('.bar-label')
            .data(data)
            .join('text')
            .attr('x', -10)
            .attr('y', d => yScale(d.geo) + yScale.bandwidth() / 2 + 4)
            .attr('text-anchor', 'end')
            .attr('fill', d => d.hasMinWage ? 'var(--color-text-primary)' : 'var(--color-text-secondary)')
            .attr('font-size', '0.75rem')
            .text(d => countryNames[d.geo] || d.geo);

        // X axis
        this.g.append('g')
            .attr('transform', `translate(0,${this.innerHeight})`)
            .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => d + '%').tickSizeInner(4).tickSizeOuter(0))
            .selectAll('text').attr('fill', 'var(--color-axis-text)');

        // Legend (positive / negative / no-min-wage). At narrow widths the three
        // items don't fit horizontally, so we stack them vertically. The threshold
        // is the sum of approximate item widths (~340px) — anything narrower wraps.
        const legend = this.g.append('g')
            .attr('class', 'db-legend')
            .attr('transform', `translate(0,${this.innerHeight + 28})`);

        const items = [
            { color: 'var(--color-inflation-low)', text: 'Wages outpaced inflation' },
            { color: 'var(--color-inflation-high)', text: 'Lost purchasing power' },
            { color: 'var(--color-inflation-low)', text: 'No statutory min wage', faded: true }
        ];
        const stack = this.width < 360;
        items.forEach((item, i) => {
            const x = stack ? 0 : items.slice(0, i).reduce((s, p) => s + 22 + p.text.length * 6.5, 0);
            const y = stack ? i * 18 : 0;
            const g = legend.append('g').attr('transform', `translate(${x},${y})`);
            g.append('rect')
                .attr('width', 12).attr('height', 12)
                .attr('y', -10)
                .attr('fill', item.color)
                .attr('opacity', item.faded ? 0.4 : 1);
            g.append('text')
                .attr('x', 18).attr('y', 0)
                .attr('fill', 'var(--color-text-secondary)')
                .attr('font-size', '0.7rem')
                .text(item.text);
        });
    }
}
