import { BaseChart } from './BaseChart.js';

const CAT_LABELS = {
    'NRG': 'Energy', 'FOOD': 'Food', 'SERV': 'Services',
    'CP04': 'Housing', 'CP07': 'Transport'
};

export class StackedArea extends BaseChart {
    constructor(selector, data, tooltip, options = {}) {
        super(selector, data, tooltip, {
            height: 450,
            margin: { top: 30, right: 110, bottom: 50, left: 60 },
            ariaLabel: 'Stacked area chart decomposing euro-area inflation into energy, food, services, housing, and transport contributions since 2015',
            ...options
        });
        this.mode = 'stacked';
    }

    draw() {
        const { hicpMonthly } = this.data;
        if (!hicpMonthly) return;

        const cats = ['NRG', 'FOOD', 'SERV', 'CP04', 'CP07'];
        const euData = hicpMonthly.filter(d => d.geo === 'EA' && cats.includes(d.coicop) && d.year >= 2015);
        const parseTime = d3.timeParse('%Y-%m');
        euData.forEach(d => d.date = parseTime(d.time));

        const byDate = d3.group(euData, d => d.time);
        const dates = [...byDate.keys()].sort();
        const seriesData = dates.map(t => {
            const row = { time: t, date: parseTime(t) };
            cats.forEach(c => {
                const v = byDate.get(t)?.find(x => x.coicop === c);
                row[c] = v ? Math.max(0, v.value) : 0;
            });
            return row;
        });

        const controls = this.container.insert('div', ':first-child')
            .attr('class', 'chart-controls');
        ['stacked', 'stream', 'percent'].forEach(m => {
            controls.append('button')
                .text(m === 'stacked' ? 'Stacked' : m === 'stream' ? 'Stream' : '100%')
                .classed('active', m === this.mode)
                .on('click', (event) => {
                    this.mode = m;
                    controls.selectAll('button').classed('active', false);
                    d3.select(event.currentTarget).classed('active', true);
                    this.g.selectAll('*').remove();
                    this.drawArea(seriesData, cats);
                });
        });

        this.drawArea(seriesData, cats);
    }

    drawArea(seriesData, cats) {
        const colors = {
            'NRG': 'var(--color-nrg)', 'FOOD': 'var(--color-food)',
            'SERV': 'var(--color-housing)', 'CP04': 'var(--color-cp04)', 'CP07': 'var(--color-cp07)'
        };

        const xScale = d3.scaleTime()
            .domain(d3.extent(seriesData, d => d.date))
            .range([0, this.width]);

        let stack = d3.stack().keys(cats);
        if (this.mode === 'stream') {
            stack = stack.offset(d3.stackOffsetWiggle);
        } else if (this.mode === 'percent') {
            stack = stack.offset(d3.stackOffsetExpand);
        }

        const stacked = stack(seriesData);

        const yDomain = this.mode === 'percent' ? [0, 1] : [
            d3.min(stacked, s => d3.min(s, d => d[0])),
            d3.max(stacked, s => d3.max(s, d => d[1]))
        ];

        const yScale = d3.scaleLinear().domain(yDomain).range([this.innerHeight, 0]);

        // Axes
        this.g.append('g')
            .attr('transform', `translate(0,${this.innerHeight})`)
            .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.timeFormat('%Y')).tickSizeInner(4).tickSizeOuter(0))
            .selectAll('text').attr('fill', 'var(--color-axis-text)');

        this.g.append('g')
            .call(d3.axisLeft(yScale).ticks(5).tickFormat(this.mode === 'percent' ? d3.format('.0%') : d => d).tickSizeInner(4).tickSizeOuter(0))
            .selectAll('text').attr('fill', 'var(--color-axis-text)');

        // Areas
        const area = d3.area()
            .x(d => xScale(d.data.date))
            .y0(d => yScale(d[0]))
            .y1(d => yScale(d[1]))
            .curve(d3.curveMonotoneX);

        this.g.selectAll('.area-layer')
            .data(stacked)
            .join('path')
            .attr('class', 'area-layer')
            .attr('d', area)
            .attr('fill', d => colors[d.key] || '#888')
            .attr('opacity', 0.85)
            .on('mouseover', (event, d) => {
                this.g.selectAll('.area-layer').classed('dimmed', true);
                d3.select(event.currentTarget).classed('dimmed', false).attr('opacity', 1);
            })
            .on('mousemove', (event, d) => {
                const [mx] = d3.pointer(event, this.g.node());
                const x0 = xScale.invert(mx);
                const i = d3.bisector(p => p.data.date).left(d, x0, 1);
                const point = d[Math.min(i, d.length - 1)];
                if (!point) return;
                const value = point[1] - point[0];
                const monthFmt = d3.timeFormat('%B %Y');
                const fmt = this.mode === 'percent'
                    ? d3.format('.1%')(value)
                    : value.toFixed(1) + '%';
                this.tooltip.show(`
                    <div class="tt-title">${CAT_LABELS[d.key] || d.key}</div>
                    <div class="tt-value">${monthFmt(point.data.date)}</div>
                    <div class="tt-value">${fmt}</div>
                `, event);
            })
            .on('mouseout', () => {
                this.g.selectAll('.area-layer').classed('dimmed', false).attr('opacity', 0.85);
                this.tooltip.hide();
            });

        // Inline labels at right edge
        const lastX = xScale(d3.max(seriesData, d => d.date));
        stacked.forEach(layer => {
            const lastPoint = layer[layer.length - 1];
            const midY = (lastPoint[0] + lastPoint[1]) / 2;
            this.g.append('text')
                .attr('x', lastX + 6)
                .attr('y', yScale(midY))
                .attr('dominant-baseline', 'middle')
                .attr('font-size', '0.7rem')
                .attr('fill', colors[layer.key] || '#888')
                .attr('font-weight', '500')
                .text(CAT_LABELS[layer.key] || layer.key);
        });

        // Peak annotation — the moment the headline number broke 10%.
        // Skip in percent mode (the y-domain is 0..1 there and the callout becomes nonsensical).
        if (this.mode !== 'percent') {
            const peakRow = seriesData.reduce((best, d) => {
                const total = d.NRG + d.FOOD + d.SERV + d.CP04 + d.CP07;
                return (best == null || total > best.total) ? { date: d.date, total } : best;
            }, null);
            if (peakRow) {
                const px = xScale(peakRow.date);
                const py = yScale(peakRow.total);
                this.g.append('line')
                    .attr('class', 'sa-peak-line')
                    .attr('x1', px).attr('x2', px)
                    .attr('y1', py).attr('y2', this.innerHeight)
                    .attr('stroke', 'var(--color-text-accent)')
                    .attr('stroke-width', 1)
                    .attr('stroke-dasharray', '3,3')
                    .attr('opacity', 0.7);
                this.g.append('circle')
                    .attr('cx', px).attr('cy', py)
                    .attr('r', 4)
                    .attr('fill', 'var(--color-text-accent)')
                    .attr('stroke', 'var(--color-bg-card)')
                    .attr('stroke-width', 1.5);

                const monthFmt = d3.timeFormat('%b %Y');
                // The numeric peak of the stacked sum is the additive total of category
                // rates — NOT the headline HICP. Annotating the moment without a number
                // avoids confusing readers who know the headline peaked around 10.6%.
                const labelText = `Inflation peaked here · ${monthFmt(peakRow.date)}`;
                const anchorRight = px < this.width - 200;
                this.g.append('text')
                    .attr('class', 'sa-peak-label')
                    .attr('x', anchorRight ? px + 8 : px - 8)
                    .attr('y', py - 8)
                    .attr('text-anchor', anchorRight ? 'start' : 'end')
                    .attr('fill', 'var(--color-text-accent)')
                    .attr('font-size', '0.72rem')
                    .attr('font-weight', '600')
                    .text(labelText);
            }
        }
    }
}
