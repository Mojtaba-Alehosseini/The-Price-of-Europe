export class DataManager {
    static async loadAll() {
        const files = [
            ['hicpMonthly', 'data/processed/hicp_monthly.json'],
            ['hicpIndex', 'data/processed/hicp_index.json'],
            ['hicpAnnual', 'data/processed/hicp_annual.json'],
            ['electricityPrices', 'data/processed/electricity_prices.json'],
            ['minimumWages', 'data/processed/minimum_wages.json'],
            ['housePriceIndex', 'data/processed/house_price_index.json'],
            ['eventsTimeline', 'data/processed/events_timeline.json'],
            ['countriesMeta', 'data/processed/countries_meta.json'],
            ['europeTopojson', 'data/europe.topojson']
        ];

        const results = await Promise.all(
            files.map(async ([key, path]) => {
                try {
                    const data = await d3.json(path);
                    return [key, data];
                } catch (e) {
                    console.warn(`Failed to load ${path}:`, e);
                    return [key, null];
                }
            })
        );

        const data = Object.fromEntries(results);
        
        // Build lookups
        data.countryNames = {};
        for (const [code, info] of Object.entries(data.countriesMeta || {})) {
            data.countryNames[code] = info.name;
        }
        
        data.coicopNames = {
            'CP00': 'All items', 'CP01': 'Food', 'CP04': 'Housing',
            'CP045': 'Electricity & gas', 'CP07': 'Transport',
            'CP11': 'Restaurants', 'NRG': 'Energy',
            'FOOD': 'Food (aggregate)', 'SERV': 'Services'
        };

        // Country code mapping: Eurostat uses EL for Greece
        data.geoToMapId = {
            'EL': 'GR', // Greece
        };
        data.mapIdToGeo = {
            'GR': 'EL',
        };

        return data;
    }
}
