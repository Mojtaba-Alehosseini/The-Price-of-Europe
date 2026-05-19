import { BaseChart } from './BaseChart.js';

export class SlopeChart extends BaseChart {
    constructor(selector, data, tooltip, options = {}) {
        super(selector, data, tooltip, {
            height: 640,
            margin: { top: 50, right: 160, bottom: 50, left: 60 },
            ariaLabel: 'Slope chart of household electricity prices for each EU country, comparing 2019 first half to 2024 first half',
            ...options
        });
        this.mode = 'nominal';
    }

    draw() {
        const { electricityPrices, countryNames } = this.data;
        if (!electricityPrices) return;

        const semMatch = d => d.semester === 'S1' || d.semester === '-S1';
        const d2019 = electricityPrices.filter(d => d.year === 2019 && semMatch(d));
        const d2024 = electricityPrices.filter(d => d.year === 2024 && semMatch(d));

        const byCountry = new Map();
        d2019.forEach(d => byCountry.set(d.geo, { geo: d.geo, v2019: d.value, v2024: null }));
        d2024.forEach(d => {
            const entry = byCountry.get(d.geo);
            if (entry) entry.v2024 = d.value;
        });

        let data = [...byCountry.values()].filter(d => d.v2019 != null && d.v2024 != null);

        // Toggle
        const controls = this.container.insert('div', ':first-child')
            .attr('class', 'chart-controls');
        ['nominal', 'indexed'].forEach(mode => {
            controls.append('button')
                .text(mode === 'nominal' ? '€/kWh' : 'Index (2019=100)')
                .classed('active', mode === this.mode)
                .on('click', (event) => {
                    this.mode = mode;
                    controls.selectAll('button').classed('active', false);
                    d3.select(event.currentTarget).classed('active', true);
                    this.g.selectAll('*').remove();
                    this.drawSlope(data);
                });
        });

        this.drawSlope(data);
    }

    drawSlope(data) {
        const { countryNames } = this.data;

        if (this.mode === 'indexed') {
            data = data.map(d => ({ ...d, v2019: 100, v2024: (d.v2024 / d.v2019) * 100 }));
        }

        const pctChange = d => ((d.v2024 - d.v2019) / d.v2019 * 100);

        // Sort by absolute change for visual layering
        data.sort((a, b) => Math.abs(pctChange(b)) - Math.abs(pctChange(a)));

        // Identify extremes
        const sortedByChange = [...data].sort((a, b) => pctChange(b) - pctChange(a));
        const top3Inc = new Set(sortedByChange.slice(0, 2).map(d => d.geo));
        const top3Dec = new Set(sortedByChange.slice(-2).map(d => d.geo));
        const isExtreme = d => top3Inc.has(d.geo) || top3Dec.has(d.geo);

        const leftX = 0;
        const rightX = this.width - 140;

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(data, d => Math.max(d.v2019, d.v2024)) * 1.1])
            .range([this.innerHeight, 0]);

        // Axes
        this.g.append('g')
            .attr('transform', `translate(${leftX},0)`)
            .call(d3.axisLeft(yScale).ticks(5).tickSizeInner(4).tickSizeOuter(0))
            .selectAll('text').attr('fill', 'var(--color-axis-text)');

        this.g.append('g')
            .attr('transform', `translate(${rightX},0)`)
            .call(d3.axisRight(yScale).ticks(5).tickSizeInner(4).tickSizeOuter(0))
            .selectAll('text').attr('fill', 'var(--color-axis-text)');

        // Axis labels (with mode-specific unit subtitle)
        const unit = this.mode === 'indexed' ? 'Index (2019=100)' : '€/kWh';

        this.g.append('text')
            .attr('x', leftX).attr('y', -22)
            .attr('text-anchor', 'middle')
            .attr('fill', 'var(--color-text-secondary)')
            .attr('font-size', '0.9rem')
            .attr('font-weight', '600')
            .attr('font-family', 'Roboto Slab, serif')
            .text('2019 S1');

        this.g.append('text')
            .attr('x', leftX).attr('y', -8)
            .attr('text-anchor', 'middle')
            .attr('fill', 'var(--color-axis-text)')
            .attr('font-size', '0.7rem')
            .text(unit);

        this.g.append('text')
            .attr('x', rightX).attr('y', -22)
            .attr('text-anchor', 'middle')
            .attr('fill', 'var(--color-text-secondary)')
            .attr('font-size', '0.9rem')
            .attr('font-weight', '600')
            .attr('font-family', 'Roboto Slab, serif')
            .text('2024 S1');

        this.g.append('text')
            .attr('x', rightX).attr('y', -8)
            .attr('text-anchor', 'middle')
            .attr('fill', 'var(--color-axis-text)')
            .attr('font-size', '0.7rem')
            .text(unit);

        // EU median benchmark — a horizontal reference at the median 2024 value.
        // Lets readers see who is above/below the typical European price.
        const median2024 = d3.median(data, d => d.v2024);
        const median2019 = d3.median(data, d => d.v2019);

        this.g.append('line')
            .attr('class', 'slope-median-line')
            .attr('x1', leftX).attr('x2', rightX)
            .attr('y1', yScale(median2019)).attr('y2', yScale(median2024))
            .attr('stroke', 'var(--color-text-accent)')
            .attr('stroke-width', 1.2)
            .attr('stroke-dasharray', '6,4')
            .attr('opacity', 0.55);

        this.g.append('text')
            .attr('x', rightX + 4)
            .attr('y', yScale(median2024) - 4)
            .attr('fill', 'var(--color-text-accent)')
            .attr('font-size', '0.62rem')
            .attr('font-weight', '600')
            .attr('opacity', 0.85)
            .text('EU median');

        // Lines
        const lineGen = d3.line();

        this.g.selectAll('.slope-line')
            .data(data)
            .join('path')
            .attr('class', 'slope-line')
            .attr('d', d => lineGen([[leftX, yScale(d.v2019)], [rightX, yScale(d.v2024)]]))
            .attr('stroke', d => pctChange(d) > 0 ? 'var(--color-inflation-high)' : 'var(--color-inflation-low)')
            .attr('stroke-width', d => isExtreme(d) ? 3 : 1)
            .attr('opacity', d => isExtreme(d) ? 1 : 0.2)
            .on('mouseover', (event, d) => {
                d3.select(event.currentTarget).attr('stroke-width', 3).attr('opacity', 1);
                this.g.selectAll('.right-label')
                    .filter(l => l.geo === d.geo)
                    .attr('font-weight', '700')
                    .attr('font-size', '0.85rem');
                this.tooltip.show(`
                    <div class="tt-title">${countryNames[d.geo] || d.geo}</div>
                    <div class="tt-value">2019: ${d.v2019.toFixed(2)}${this.mode==='indexed'?'':' €/kWh'}</div>
                    <div class="tt-value">2024: ${d.v2024.toFixed(2)}${this.mode==='indexed'?'':' €/kWh'}</div>
                    <div class="tt-value">Change: ${pctChange(d) > 0 ? '+' : ''}${pctChange(d).toFixed(1)}%</div>
                `, event);
            })
            .on('mousemove', (event) => this.tooltip.move(event))
            .on('mouseout', (event, d) => {
                d3.select(event.currentTarget)
                    .attr('stroke-width', isExtreme(d) ? 3 : 1)
                    .attr('opacity', isExtreme(d) ? 1 : 0.2);
                this.g.selectAll('.right-label')
                    .filter(l => l.geo === d.geo)
                    .attr('font-weight', '600')
                    .attr('font-size', '0.78rem');
                this.tooltip.hide();
            });

        // Labels at right with collision resolution
        let labels = data.map(d => ({
            geo: d.geo,
            y: yScale(d.v2024),
            pct: pctChange(d),
            isExtreme: isExtreme(d)
        }));

        labels = this.resolveCollisions(labels, 40);

        this.g.selectAll('.right-label-bg')
            .data(labels.filter(d => d.isExtreme))
            .join('rect')
            .attr('x', rightX + 6)
            .attr('y', d => d.y - 9)
            .attr('width', d => ((countryNames[d.geo] || d.geo).length + 8) * 6)
            .attr('height', 18)
            .attr('rx', 3)
            .attr('fill', 'var(--color-bg-card)')
            .attr('opacity', 0.85);

        this.g.selectAll('.right-label')
            .data(labels.filter(d => d.isExtreme))
            .join('text')
            .attr('class', 'right-label')
            .attr('x', rightX + 10)
            .attr('y', d => d.y + 4)
            .attr('fill', d => d.pct > 0 ? 'var(--color-inflation-high)' : 'var(--color-inflation-low)')
            .attr('font-size', '0.78rem')
            .attr('font-weight', '600')
            .text(d => `${countryNames[d.geo] || d.geo}`);

        this.g.selectAll('.right-label-pct')
            .data(labels.filter(d => d.isExtreme))
            .join('text')
            .attr('x', rightX + 10)
            .attr('y', d => d.y + 16)
            .attr('fill', 'var(--color-text-secondary)')
            .attr('font-size', '0.72rem')
            .attr('font-weight', '400')
            .text(d => `${d.pct > 0 ? '+' : ''}${d.pct.toFixed(0)}%`);

        // Leader lines for displaced labels
        this.g.selectAll('.leader-line')
            .data(labels.filter(d => d.isExtreme && Math.abs(d.y - yScale(data.find(x => x.geo === d.geo).v2024)) > 2))
            .join('line')
            .attr('class', 'leader-line')
            .attr('x1', rightX + 4)
            .attr('x2', rightX + 6)
            .attr('y1', d => yScale(data.find(x => x.geo === d.geo).v2024))
            .attr('y2', d => d.y)
            .attr('stroke', 'rgba(255,255,255,0.2)')
            .attr('stroke-width', 0.8);
    }

    resolveCollisions(labels, minGap = 18) {
        labels.sort((a, b) => a.y - b.y);
        // Clamp to plot area (with a 14px buffer for descenders + the small pct label below).
        const yMin = 6;
        const yMax = this.innerHeight - 14;
        let changed = true;
        let iter = 0;
        const maxIterations = 50;

        while (changed && iter < maxIterations) {
            changed = false;
            iter++;
            for (let i = 1; i < labels.length; i++) {
                const prev = labels[i - 1];
                const curr = labels[i];
                const overlap = (prev.y + minGap) - curr.y;
                if (overlap > 0) {
                    prev.y -= overlap / 2;
                    curr.y += overlap / 2;
                    changed = true;
                }
            }
            // After each spread pass, clamp endpoints back into the plot area.
            // This prevents labels from being pushed past top/bottom edges.
            for (const l of labels) {
                if (l.y < yMin) { l.y = yMin; changed = true; }
                if (l.y > yMax) { l.y = yMax; changed = true; }
            }
        }
        return labels;
    }
}
