export class ScrollController {
    constructor(charts) {
        this.charts = charts;
        this.scroller = scrollama();
    }

    init() {
        // Inject step counters
        const steps = document.querySelectorAll('.scroll-step');
        const total = steps.length;
        steps.forEach((step, i) => {
            const textBlock = step.querySelector('.step-text');
            if (textBlock) {
                const counter = document.createElement('span');
                counter.className = 'step-counter';
                counter.textContent = `${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
                textBlock.insertBefore(counter, textBlock.firstChild);
            }
        });

        this.scroller
            .setup({
                step: '.scroll-step',
                offset: 0.5,
                debug: false
            })
            .onStepEnter(response => {
                const chartId = response.element.dataset.chart;
                if (this.charts[chartId] && !this.charts[chartId].rendered) {
                    this.charts[chartId].render();
                }
                response.element.classList.add('is-active');
            })
            .onStepExit(response => {
                response.element.classList.remove('is-active');
            });

        window.addEventListener('resize', () => {
            this.scroller.resize();
        });
    }
}
