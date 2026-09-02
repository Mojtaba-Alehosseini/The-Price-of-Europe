"""
Eurostat Data Processing Pipeline
Downloads and processes all datasets into D3-ready JSON.

[D91/D92] Two hard rules this pipeline learned the hard way:
  1. NEVER drop a dimension you did not filter. A Eurostat cube keyed on
     (geo, time) alone silently stacks every currency / unit / purchase variant
     into the same key; the JSON then carries N rows per key and whatever reads
     it last-write-wins (or averages) an incoherent mixture. Filter the extra
     dimensions IN THE REQUEST, keep the surviving code as a column, and assert
     one row per key before writing. Three datasets have now been bitten by this
     (nrg_pc_204, earn_mw_cur, prc_hpi_q).
  2. NEVER silently substitute fabricated data. A fetch failure raises. An essay
     that publishes numbers cannot have a code path that invents them.
"""
import pandas as pd
import json
import os
import requests

OUTPUT_DIR = '../data/processed/'
os.makedirs(OUTPUT_DIR, exist_ok=True)

EU27 = ['AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR',
        'HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO',
        'SE','SI','SK']

COICOP_KEEP = ['CP00', 'CP01', 'CP04', 'CP045', 'CP07', 'CP11', 'NRG', 'FOOD', 'SERV']

def fetch_eurostat_json(code, params=None):
    """Fetch Eurostat JSON API data. `params` adds dimension filters to the request
    (e.g. currency='NAC') — filtering at source is what keeps a cube one-row-per-key."""
    url = f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{code}"
    try:
        q = {"format": "JSON", "lang": "en"}
        q.update(params or {})
        resp = requests.get(url, params=q, timeout=120)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"  Failed to fetch {code}: {e}")
        return None

def require_unique(df, keys, dataset):
    """Assert exactly one row per key. Raises with a worked example if not — this is the
    guard that would have caught the earn_mw_cur / prc_hpi_q collapses at write time."""
    dup = df.groupby(keys).size()
    bad = dup[dup > 1]
    if len(bad):
        k = bad.index[0]
        sample = df.set_index(keys).loc[[k]]
        raise RuntimeError(
            f"{dataset}: {len(bad)} of {len(dup)} keys carry >1 row — an unfiltered dimension "
            f"is still collapsing into {keys}. Example {k} carries {bad.iloc[0]} rows:\n{sample}"
        )
    return df

def eurostat_json_to_records(data):
    """Convert Eurostat JSON API response to list of records."""
    if data is None or 'value' not in data:
        return []
    dims = data.get('dimension', {})
    dim_ids = data.get('id', [])
    dim_lookups = {}
    for d in dim_ids:
        if d in dims:
            categories = dims[d].get('category', {})
            index = categories.get('index', {})
            sorted_items = sorted(index.items(), key=lambda x: x[1])
            dim_lookups[d] = {i: item[0] for i, item in enumerate(sorted_items)}
    records = []
    for key_str, val in data['value'].items():
        if val is None:
            continue
        idx = int(key_str)
        record = {'value': val}
        for d in reversed(dim_ids):
            if d in dim_lookups:
                n = len(dim_lookups[d])
                record[d.lower()] = dim_lookups[d][idx % n]
                idx = idx // n
        records.append(record)
    return records

def fetch_or_die(code, params=None, needs=('time',)):
    """Fetch → DataFrame, or raise. There is deliberately no synthetic fallback: the
    seeded generators this pipeline used to fall back on wrote fabricated numbers into
    the SAME filenames with no provenance marker, so one Eurostat outage during a re-run
    would have silently replaced a published essay's data (round-6 audit §1, D-4)."""
    data = fetch_eurostat_json(code, params)
    recs = eurostat_json_to_records(data) if data else []
    if not recs:
        raise RuntimeError(f"{code}: fetch returned no records — refusing to write. "
                           f"Re-run when Eurostat is reachable; never substitute generated data.")
    df = pd.DataFrame(recs)
    for col in needs:
        if col not in df.columns:
            raise RuntimeError(f"{code}: response is missing the '{col}' dimension — got {list(df.columns)}")
    return df

def process_wages():
    """earn_mw_cur → one row per (geo, year, semester), NATIONAL CURRENCY.

    [D91] The bug this filter fixes: the cube is keyed (currency, geo, time) and publishes
    an EUR / NAC / PPS triplet for every key. Requesting it unfiltered and selecting only
    [geo, year, semester, value] stacked all three into one key, and the consumer kept
    whichever landed last — PPS, a purchasing-power-adjusted series. The essay then
    deflated that already-price-adjusted number by national HICP a second time, which is
    what produced the "15 gained / 6 lost" split.

    NAC is the basis every label and the methodology formula already claim ("nominal wage
    growth", deflated by that country's own HICP). For euro members NAC == EUR."""
    print("\n4. Minimum Wages  [currency=NAC]")
    df = fetch_or_die('earn_mw_cur', {'currency': 'NAC'})
    df = df[df['geo'].isin(EU27)].copy()
    if set(df['currency'].unique()) != {'NAC'}:
        raise RuntimeError(f"earn_mw_cur: expected NAC only, got {sorted(df['currency'].unique())}")
    df['year'] = df['time'].str[:4].astype(int)
    df['semester'] = df['time'].str[4:]        # "2024-S1" -> "-S1" (the shape DataManager rebuilds)
    require_unique(df, ['geo', 'year', 'semester'], 'earn_mw_cur')
    out = df[['geo', 'year', 'semester', 'currency', 'value']].sort_values(['geo', 'year', 'semester'])
    out.to_json(f'{OUTPUT_DIR}minimum_wages.json', orient='records')
    print(f"   Saved: {len(out)} rows, {out['geo'].nunique()} countries — currency column makes the basis self-describing")
    return out

def process_hpi():
    """prc_hpi_q → one row per (geo, year, quarter), the 2015=100 total-purchases index.

    [D92] Same bug class: the cube is keyed (purchase, unit, geo, time) with 3 purchase
    types x 4 units = 12 rows per key. Unfiltered, index levels (~100) were averaged
    together with quarterly and annual rates of change (~0) — which inverted Finland's
    sign, among others.

    NOTE ON GREECE: EL publishes no house price index in prc_hpi_q at all (a geo=EL
    request returns an empty value set, not a filtered-out one). Its absence is Eurostat's,
    not this pipeline's, and cannot be fixed here.
    Aggregates: EU27_2020 IS published for this dataset and is kept, so a chart can use the
    official aggregate instead of an equal-weighted country mean."""
    print("\n5. House Price Index  [purchase=TOTAL, unit=I15_Q]")
    df = fetch_or_die('prc_hpi_q', {'purchase': 'TOTAL', 'unit': 'I15_Q'})
    df = df[df['geo'].isin(EU27 + ['EU27_2020'])].copy()
    if set(df['unit'].unique()) != {'I15_Q'} or set(df['purchase'].unique()) != {'TOTAL'}:
        raise RuntimeError(f"prc_hpi_q: expected TOTAL/I15_Q only, got "
                           f"{sorted(df['purchase'].unique())} / {sorted(df['unit'].unique())}")
    df['year'] = df['time'].str[:4].astype(int)
    df['quarter'] = df['time'].str[4:]         # "2015-Q1" -> "-Q1"
    require_unique(df, ['geo', 'year', 'quarter'], 'prc_hpi_q')
    out = df[['geo', 'year', 'quarter', 'value']].sort_values(['geo', 'year', 'quarter'])
    out.to_json(f'{OUTPUT_DIR}house_price_index.json', orient='records')
    missing = sorted(set(EU27) - set(out['geo'].unique()))
    print(f"   Saved: {len(out)} rows, {out['geo'].nunique()} geos (incl. EU27_2020); not published: {missing or 'none'}")
    return out

def process_all():
    print("=== DATA PROCESSING ===\n")
    
    # 1. HICP Monthly
    print("1. HICP Monthly Rate")
    df = fetch_or_die('prc_hicp_manr')
    df = df[df['geo'].isin(EU27 + ['EA', 'EU27_2020', 'EA20', 'EA19'])]
    df = df[df['coicop'].isin(COICOP_KEEP)].copy()
    df['year'] = df['time'].str[:4].astype(int)
    df['month'] = df['time'].str[5:].str.lstrip('M').str.lstrip('0').astype(int)
    require_unique(df, ['geo','coicop','year','month'], 'prc_hicp_manr')
    df[['geo','coicop','year','month','time','value']].to_json(f'{OUTPUT_DIR}hicp_monthly.json',orient='records')
    print(f"   Saved: {len(df)} rows")
    hicp_rate = df

    # 2. HICP Index
    print("\n2. HICP Index")
    df = fetch_or_die('prc_hicp_midx')
    df = df[df['geo'].isin(EU27 + ['EA', 'EU27_2020', 'EA20', 'EA19'])]
    df = df[df['coicop'].isin(COICOP_KEEP)].copy()
    df['year'] = df['time'].str[:4].astype(int)
    df['month'] = df['time'].str[5:].str.lstrip('M').str.lstrip('0').astype(int)
    require_unique(df, ['geo','coicop','year','month'], 'prc_hicp_midx')
    df[['geo','coicop','year','month','time','value']].to_json(f'{OUTPUT_DIR}hicp_index.json',orient='records')
    print(f"   Saved: {len(df)} rows")
    hicp_index = df

    # [round-6 G3] The nrg_pc_204 / electricity_prices.json emit was REMOVED here. It had the
    # same unfiltered-dimension collapse as D91/D92 (the cube is keyed on product, consom,
    # unit, tax and currency as well as geo/time), and nothing read its 2.6 MB output — the
    # slope chart that once did was cut in the respin. Repairing a dataset no chart consumes
    # would have shipped a third mixed-dimension file. If electricity prices are ever needed
    # again, add a process_electricity() built on the process_wages() pattern: filter every
    # dimension in the request, then require_unique() before writing.

    wages = process_wages()
    hpi = process_hpi()

    # 6. HICP Annual
    print("\n6. HICP Annual Average")
    df = hicp_rate.groupby(['geo','coicop','year'])['value'].mean().reset_index()
    df['value'] = df['value'].round(1)
    df[['geo','coicop','year','value']].to_json(f'{OUTPUT_DIR}hicp_annual.json',orient='records')
    print(f"   Saved: {len(df)} rows")
    hicp_annual = df
    
    print("\n=== NA AUDIT ===")
    for name, df in [('hicp_rate',hicp_rate),('hicp_index',hicp_index),('wages',wages),('hpi',hpi),('hicp_annual',hicp_annual)]:
        print(f"{name}: {len(df)} rows, {df['value'].isna().mean()*100:.1f}% missing")
    print("\nDone!")

if __name__=='__main__':
    process_all()
