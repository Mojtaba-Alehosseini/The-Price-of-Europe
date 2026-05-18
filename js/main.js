import { DataManager } from './modules/dataManager.js';
import { ScrollController } from './modules/scrollytelling.js';
import { Tooltip } from './modules/tooltip.js';
import { Navigation } from './modules/navigation.js';

import { Choropleth } from './charts/Choropleth.js';
import { SmallMultiplesLine } from './charts/SmallMultiplesLine.js';
import { Heatmap } from './charts/Heatmap.js';
import { SlopeChart } from './charts/SlopeChart.js';
import { AnnotatedLine } from './charts/AnnotatedLine.js';
import { StackedArea } from './charts/StackedArea.js';
import { DivergingBar } from './charts/DivergingBar.js';
import { WaffleChart } from './charts/WaffleChart.js';

async function init() {
    let data;
    try {
        data = await DataManager.loadAll();
    } catch (e) {
        console.error('Failed to load data:', e);
        document.body.innerHTML = '<div style="padding:40px;color:#e63946;text-align:center"><h1>Error loading data</h1><p>Please check the console for details.</p></div>';
        return;
    }
    
    // 2. Initialize shared components
    const tooltip = new Tooltip();
    Navigation.init();
    
    // 3. Create chart instances (but don't render yet)
    const charts = {
        choropleth: new Choropleth('#viz-choropleth', data, tooltip),
        smallMultiples: new SmallMultiplesLine('#viz-small-multiples', data, tooltip),
        heatmap: new Heatmap('#viz-heatmap', data, tooltip),
        slopeChart: new SlopeChart('#viz-slope-chart', data, tooltip),
        annotatedLine: new AnnotatedLine('#viz-annotated-line', data, tooltip),
        stackedArea: new StackedArea('#viz-stacked-area', data, tooltip),
        divergingBar: new DivergingBar('#viz-diverging-bar', data, tooltip),
        waffleChart: new WaffleChart('#viz-waffle-chart', data, tooltip),
    };
    
    // 4. Set up scrollytelling — charts render when scrolled into view
    const scroller = new ScrollController(charts);
    scroller.init();

    // 5. Resize handler — debounced redraw for responsive charts
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            Object.values(charts).forEach(chart => {
                if (chart.rendered && chart.resize) {
                    chart.resize();
                }
            });
        }, 250);
    });
}

init();
