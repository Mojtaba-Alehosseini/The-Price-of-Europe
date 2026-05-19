export class BaseChart {
    constructor(selector, data, tooltip, options = {}) {
        this.container = d3.select(selector);
        this.data = data;
        this.tooltip = tooltip;
        this.margin = options.margin || { top: 30, right: 30, bottom: 50, left: 60 };
        this.options = options;

        this.containerWidth = this.container.node().getBoundingClientRect().width;
        this.height = options.height || 400;
        this.width = this.containerWidth - this.margin.left - this.margin.right;
        this.innerHeight = this.height - this.margin.top - this.margin.bottom;

        // Clear previous
        this.container.selectAll('*').remove();

        // Create SVG with viewBox for responsiveness + a11y baseline
        this.svg = this.container.append('svg')
            .attr('viewBox', `0 0 ${this.containerWidth} ${this.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .attr('role', 'img')
            .attr('aria-label', options.ariaLabel || 'Data visualization')
            .attr('class', 'chart-svg');
        // <title> child is the SVG-native accessible name. role+aria-label cover
        // most assistive tech, but having both is the recommended belt-and-suspenders.
        this.svg.append('title').text(options.ariaLabel || 'Data visualization');

        this.g = this.svg.append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

        this.rendered = false;
    }

    render() {
        if (this.rendered) return;
        this.draw();
        this.rendered = true;
    }

    draw() {
        // Override in subclasses
    }

    // Helper: create responsive resize.
    // Clears the entire container (SVG, <defs>, controls) and rebuilds — prevents
    // leaks of <defs>, background rects, and chart-controls divs that live outside `this.g`.
    resize() {
        const newWidth = this.container.node().getBoundingClientRect().width;
        if (Math.abs(newWidth - this.containerWidth) < 5) return;
        this.containerWidth = newWidth;
        this.width = this.containerWidth - this.margin.left - this.margin.right;

        this.container.selectAll('*').remove();

        this.svg = this.container.append('svg')
            .attr('viewBox', `0 0 ${this.containerWidth} ${this.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .attr('role', 'img')
            .attr('aria-label', this.options.ariaLabel || 'Data visualization')
            .attr('class', 'chart-svg');
        this.svg.append('title').text(this.options.ariaLabel || 'Data visualization');

        this.g = this.svg.append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

        this.draw();
    }
}
