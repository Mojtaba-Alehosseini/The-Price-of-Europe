import { BaseChart } from './BaseChart.js';

export class WaffleChart extends BaseChart {
    constructor(selector, data, tooltip, options = {}) {
        super(selector, data, tooltip, {
            height: 450,
            margin: { top: 20, right: 20, bottom: 40, left: 20 },
            ariaLabel: 'Waffle chart of 100 squares showing how many euros of 2019 purchasing power remain today for the selected country and category',
            ...options
        });
        this.country = 'EA';
        this.category = 'CP00';
    }

    draw() {
        const { hicpIndex, countryNames, coicopNames } = this.data;
        if (!hicpIndex) return;

        // Get EU-27 countries + EA
        const countries = [...new Set(hicpIndex.map(d => d.geo))]
            .filter(g => g !== 'EU27_2020')
            .sort((a, b) => (countryNames[a] || a).localeCompare(countryNames[b] || b));

        // Controls
        const controls = this.container.insert('div', ':first-child')
            .attr('class', 'waffle-controls');

        const countryWrap = controls.append('div').attr('class', 'waffle-control-wrap');
        countryWrap.append('label').text('Country: ');
        const countrySelect = countryWrap.append('select')
            .attr('class', 'waffle-select')
            .on('change', (event) => {
                this.country = event.target.value;
                this.g.selectAll('*').remove();
                this.drawWaffle();
            });
        countries.forEach(c => {
            countrySelect.append('option').attr('value', c).text(countryNames[c] || c)
                .property('selected', c === this.country);
        });

        const catWrap = controls.append('div').attr('class', 'waffle-control-wrap');
        catWrap.append('label').text('Category: ');
        const catSelect = catWrap.append('select')
            .attr('class', 'waffle-select')
            .on('change', (event) => {
                this.category = event.target.value;
                this.g.selectAll('*').remove();
                this.drawWaffle();
            });
        const cats = ['CP00', 'CP01', 'NRG', 'FOOD', 'SERV'];
        cats.forEach(c => {
            catSelect.append('option').attr('value', c).text(coicopNames[c] || c)
                .property('selected', c === this.category);
        });

        this.drawWaffle();
    }

    drawWaffle() {
        const { hicpIndex } = this.data;

        // Helper: compute purchasing power for any country (used for EU average benchmark)
        const computePP = (geo) => {
            const base = hicpIndex.find(d => d.geo === geo && d.coicop === this.category && d.year === 2019 && d.month === 1);
            const series = hicpIndex.filter(d => d.geo === geo && d.coicop === this.category);
            const last = series[series.length - 1];
            if (!base || !last) return null;
            return Math.round(100 * (base.value / last.value));
        };

        const purchasingPower = computePP(this.country);
        const euAvg = computePP('EA');

        if (purchasingPower == null) {
            this.g.append('text')
                .attr('x', this.width / 2)
                .attr('y', this.innerHeight / 2)
                .attr('text-anchor', 'middle')
                .attr('fill', 'var(--color-text-secondary)')
                .attr('font-size', '1rem')
                .text('No data available for this combination');
            return;
        }

        // Big stat — tweens from €100 down to the final value (the loss feels visceral)
        const statText = this.g.append('text')
            .attr('x', this.width / 2)
            .attr('y', 30)
            .attr('text-anchor', 'middle')
            .attr('fill', 'var(--color-text-accent)')
            .attr('font-size', '2.5rem')
            .attr('font-weight', '700')
            .attr('font-family', 'Roboto Slab, serif')
            .text('€100');

        statText.transition()
            .duration(900)
            .delay(200)
            .tween('text', function() {
                const interp = d3.interpolateNumber(100, purchasingPower);
                return t => d3.select(this).text(`€${Math.round(interp(t))}`);
            });

        this.g.append('text')
            .attr('x', this.width / 2)
            .attr('y', 55)
            .attr('text-anchor', 'middle')
            .attr('fill', 'var(--color-text-secondary)')
            .attr('font-size', '0.9rem')
            .text(`What €100 in 2019 buys today`);

        // EU-average benchmark (only when the user picked a single country, not EA itself)
        if (euAvg != null && this.country !== 'EA') {
            const diff = purchasingPower - euAvg;
            const cmpColor = diff < 0 ? 'var(--color-inflation-high)' : 'var(--color-inflation-low)';
            const cmpText = diff === 0
                ? `Same as the EU average (€${euAvg})`
                : `${Math.abs(diff)} ${diff > 0 ? 'better' : 'worse'} than the EU average (€${euAvg})`;
            this.g.append('text')
                .attr('x', this.width / 2)
                .attr('y', 72)
                .attr('text-anchor', 'middle')
                .attr('fill', cmpColor)
                .attr('font-size', '0.75rem')
                .attr('font-weight', '500')
                .text(cmpText);
        }

        // Waffle grid: 10x10. Reserve 96 px of vertical space for stat text + benchmark line.
        const gridSize = 10;
        const headerH = (this.country !== 'EA' && euAvg != null) ? 96 : 80;
        const cellSize = Math.min(this.width, this.innerHeight - headerH) / gridSize * 0.8;
        const offsetX = (this.width - gridSize * cellSize) / 2;
        const offsetY = headerH;

        for (let i = 0; i < 100; i++) {
            const row = Math.floor(i / gridSize);
            const col = i % gridSize;
            const filled = i < purchasingPower;

            this.g.append('rect')
                .attr('class', 'waffle-square')
                .attr('x', offsetX + col * cellSize)
                .attr('y', offsetY + row * cellSize)
                .attr('width', cellSize - 2)
                .attr('height', cellSize - 2)
                .attr('rx', 2)
                .attr('fill', filled ? 'var(--color-text-accent)' : 'var(--color-axis)')
                .attr('opacity', 0)
                .transition()
                .delay(i * 10)
                .duration(300)
                .attr('opacity', filled ? 1 : 0.3);
        }

        // Lost purchasing power text
        const lost = 100 - purchasingPower;
        this.g.append('text')
            .attr('x', this.width / 2)
            .attr('y', offsetY + gridSize * cellSize + 25)
            .attr('text-anchor', 'middle')
            .attr('fill', lost > 0 ? 'var(--color-inflation-high)' : 'var(--color-inflation-low)')
            .attr('font-size', '0.85rem')
            .text(lost > 0 ? `Lost purchasing power: ${lost}%` : 'Purchasing power maintained');
    }
}
