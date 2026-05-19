// Centralized color palette for D3 charts.
// Use CSS variables (var(--color-...)) wherever a string is set as an SVG attribute
// or CSS property — that path lets the design system change colors in one place.
// This file holds the literal hex values that *must* be passed to D3 interpolators
// (d3.interpolateRgbBasis, etc.) since D3 cannot resolve CSS custom properties at
// build time.

export const PALETTE = {
    // Choropleth diverging stops: deflation → ECB target → high inflation
    choroplethStops: ['#2a9d8f', '#8ab17d', '#f9f4e8', '#f4a261', '#e63946'],
    choroplethBg: '#0d1520',
    choroplethNoData: '#1a1a28',
    choroplethNonEu: '#14141f',
    choroplethStroke: '#0f0f14',

    // Per-category accent colors (mirror CSS --color-cp00 etc.)
    category: {
        CP00: '#f0c040', CP01: '#8ab17d', CP04: '#457b9d',
        CP045: '#e76f51', CP07: '#b5838d', CP11: '#dda15e',
        NRG: '#e63946', FOOD: '#8ab17d', SERV: '#6c63ff',
    },

    // Event timeline category colors
    event: {
        covid:  '#888888',
        energy: '#e76f51',
        policy: '#f0c040',
        food:   '#8ab17d',
        supply: '#aaaaaa',
    },

    // Crisis bands (low-opacity tint over chart area)
    bands: {
        covid:  'rgba(136,136,136,0.12)',
        energy: 'rgba(231,111,81,0.12)',
    },

    // Faint reference grid/zero/dashes
    line: {
        contextDim:  'rgba(255,255,255,0.18)',
        contextFade: 'rgba(255,255,255,0.08)',
        zeroLine:    'rgba(255,255,255,0.4)',
        gridLine:    'rgba(255,255,255,0.05)',
    },

    // Ukraine annotation (orange-ish, matches energy palette)
    annotationLine: 'rgba(231, 111, 81, 0.45)',
};
