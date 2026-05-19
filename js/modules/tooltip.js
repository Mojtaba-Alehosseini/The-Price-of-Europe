export class Tooltip {
    constructor() {
        this.el = d3.select('body')
            .append('div')
            .attr('class', 'chart-tooltip')
            .attr('role', 'tooltip')
            .attr('aria-live', 'polite')
            .style('position', 'absolute')
            .style('pointer-events', 'none')
            .style('opacity', 0);
    }

    show(html, event) {
        this.el.html(html)
            .classed('visible', true)
            .style('opacity', 1);
        this.move(event);
    }

    move(event) {
        const ttWidth = 180;
        const ttHeight = 100;
        let left = event.pageX + 12;
        let top = event.pageY - 12;

        // Boundary checking
        if (left + ttWidth > window.innerWidth + window.scrollX) {
            left = event.pageX - ttWidth - 12;
        }
        if (top + ttHeight > window.innerHeight + window.scrollY) {
            top = event.pageY - ttHeight - 12;
        }
        if (top < window.scrollY) {
            top = event.pageY + 20;
        }

        this.el
            .style('left', left + 'px')
            .style('top', top + 'px');
    }

    hide() {
        this.el.classed('visible', false).style('opacity', 0);
    }
}
