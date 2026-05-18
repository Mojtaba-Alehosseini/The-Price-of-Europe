"""
Eurostat Data Processing Pipeline
Downloads (or generates fallback) and processes all datasets into D3-ready JSON.
Uses real Eurostat JSON API data when available, falls back to synthetic data.
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

def fetch_eurostat_json(code):
    """Fetch Eurostat JSON API data."""
    url = f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{code}"
    try:
        resp = requests.get(url, params={"format": "JSON", "lang": "en"}, timeout=120)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"  Failed to fetch {code}: {e}")
        return None

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

# Synthetic data generators as fallback
import random

def gen_hicp():
    random.seed(42)
    base_rates = {'AT':1.5,'BE':1.6,'BG':2.5,'CY':1.2,'CZ':2.8,'DE':1.4,'DK':1.3,'EE':2.2,'EL':0.5,'ES':1.2,'FI':1.4,'FR':1.3,'HR':1.8,'HU':3.2,'IE':1.5,'IT':0.8,'LT':2.0,'LU':1.5,'LV':2.3,'MT':1.6,'NL':1.5,'PL':2.5,'PT':1.1,'RO':3.5,'SE':1.6,'SI':1.7,'SK':2.0}
    shocks = {2020:0.5, 2021:2.5, 2022:10.0, 2023:6.0, 2024:2.5}
    mults = {'CP00':1.0,'CP01':1.1,'CP04':1.3,'CP045':1.8,'CP07':1.2,'CP11':0.9,'NRG':2.0,'FOOD':1.15,'SERV':0.7}
    records = []
    for geo in EU27+['EA']:
        base = base_rates.get(geo,1.5)
        for y in range(2018,2026):
            for m in range(1,13):
                if y==2025 and m>3: continue
                shock = shocks.get(y,0) + random.gauss(0,0.5)
                for c in COICOP_KEEP:
                    val = round(base*mults[c] + shock*mults[c] + random.gauss(0,0.3), 1)
                    records.append({'geo':geo,'coicop':c,'year':y,'month':m,'time':f"{y}M{m:02d}",'value':val})
    return pd.DataFrame(records)

def gen_hicp_index():
    df = gen_hicp().sort_values(['geo','coicop','year','month'])
    def cum(g):
        g=g.copy(); idx=100.0; vals=[]
        for _,r in g.iterrows():
            idx*=1+r['value']/1200; vals.append(round(idx,2))
        g['value']=vals; return g
    return df.groupby(['geo','coicop'],group_keys=False).apply(cum)

def gen_elec():
    random.seed(43)
    base = {'AT':0.22,'BE':0.25,'BG':0.10,'CY':0.21,'CZ':0.17,'DE':0.30,'DK':0.29,'EE':0.15,'EL':0.18,'ES':0.23,'FI':0.18,'FR':0.19,'HR':0.13,'HU':0.11,'IE':0.26,'IT':0.22,'LT':0.14,'LU':0.20,'LV':0.16,'MT':0.14,'NL':0.20,'PL':0.14,'PT':0.21,'RO':0.13,'SE':0.20,'SI':0.16,'SK':0.14}
    records=[]
    for g in EU27:
        b=base.get(g,0.18)
        for y in range(2018,2025):
            for s in ['S1','S2']:
                shock = {2021:0.03,2022:0.12,2023:0.08,2024:0.02}.get(y,0)
                records.append({'geo':g,'year':y,'semester':s,'value':round(b+shock+random.gauss(0,0.01),3)})
    return pd.DataFrame(records)

def gen_wages():
    random.seed(44)
    base = {'AT':0,'BE':1650,'BG':340,'CY':0,'CZ':550,'DE':1620,'DK':0,'EE':620,'EL':780,'ES':1130,'FI':0,'FR':1600,'HR':550,'HU':500,'IE':1720,'IT':0,'LT':700,'LU':2200,'LV':500,'MT':800,'NL':1725,'PL':650,'PT':820,'RO':450,'SE':0,'SI':1100,'SK':600}
    records=[]
    for g in EU27:
        b=base.get(g,0)
        if b==0: continue
        for y in range(2018,2026):
            for s in ['S1','S2']:
                gr=1.03+random.gauss(0,0.01)+(0.02 if y>=2022 else 0)
                b=round(b*gr)
                records.append({'geo':g,'year':y,'semester':s,'value':b})
    return pd.DataFrame(records)

def gen_hpi():
    random.seed(45)
    base={'AT':120,'BE':115,'BG':105,'CY':95,'CZ':125,'DE':130,'DK':118,'EE':140,'EL':90,'ES':110,'FI':110,'FR':108,'HR':100,'HU':135,'IE':145,'IT':98,'LT':110,'LU':135,'LV':108,'MT':105,'NL':125,'PL':130,'PT':125,'RO':115,'SE':145,'SI':108,'SK':120}
    records=[]
    for g in EU27:
        idx=base.get(g,110)
        for y in range(2018,2025):
            for q in ['Q1','Q2','Q3','Q4']:
                gr=1.01+random.gauss(0,0.005)+({2021:0.02,2022:0.015,2023:-0.005}.get(y,0))
                idx=round(idx*gr,2)
                records.append({'geo':g,'year':y,'quarter':q,'value':idx})
    return pd.DataFrame(records)

def process_all():
    print("=== DATA PROCESSING ===\n")
    
    # 1. HICP Monthly
    print("1. HICP Monthly Rate")
    df = None
    data = fetch_eurostat_json('prc_hicp_manr')
    if data:
        recs = eurostat_json_to_records(data)
        if recs:
            df = pd.DataFrame(recs)
            df = df[df['geo'].isin(EU27+['EA'])]
            df = df[df['coicop'].isin(COICOP_KEEP)]
            df['year'] = df['time'].str[:4].astype(int)
            df['month'] = df['time'].str[5:].str.lstrip('M').str.lstrip('0').astype(int)
    if df is None or len(df)==0:
        print("   Using synthetic data")
        df = gen_hicp()
    df[['geo','coicop','year','month','time','value']].to_json(f'{OUTPUT_DIR}hicp_monthly.json',orient='records')
    print(f"   Saved: {len(df)} rows")
    hicp_rate = df
    
    # 2. HICP Index
    print("\n2. HICP Index")
    df = None
    data = fetch_eurostat_json('prc_hicp_midx')
    if data:
        recs = eurostat_json_to_records(data)
        if recs:
            df = pd.DataFrame(recs)
            df = df[df['geo'].isin(EU27+['EA'])]
            df = df[df['coicop'].isin(COICOP_KEEP)]
            df['year'] = df['time'].str[:4].astype(int)
            df['month'] = df['time'].str[5:].str.lstrip('M').str.lstrip('0').astype(int)
    if df is None or len(df)==0:
        print("   Using synthetic data")
        df = gen_hicp_index()
    df[['geo','coicop','year','month','time','value']].to_json(f'{OUTPUT_DIR}hicp_index.json',orient='records')
    print(f"   Saved: {len(df)} rows")
    hicp_index = df
    
    # 3. Electricity
    print("\n3. Electricity Prices")
    df = None
    data = fetch_eurostat_json('nrg_pc_204')
    if data:
        recs = eurostat_json_to_records(data)
        if recs:
            df = pd.DataFrame(recs)
            df = df[df['geo'].isin(EU27)]
            if 'time' in df.columns:
                df['year'] = df['time'].str[:4].astype(int)
                df['semester'] = df['time'].str[4:]
    if df is None or len(df)==0 or 'year' not in df.columns:
        print("   Using synthetic data")
        df = gen_elec()
    df[['geo','year','semester','value']].to_json(f'{OUTPUT_DIR}electricity_prices.json',orient='records')
    print(f"   Saved: {len(df)} rows")
    elec = df
    
    # 4. Wages
    print("\n4. Minimum Wages")
    df = None
    data = fetch_eurostat_json('earn_mw_cur')
    if data:
        recs = eurostat_json_to_records(data)
        if recs:
            df = pd.DataFrame(recs)
            df = df[df['geo'].isin(EU27)]
            if 'time' in df.columns:
                df['year'] = df['time'].str[:4].astype(int)
                df['semester'] = df['time'].str[4:]
    if df is None or len(df)==0 or 'year' not in df.columns:
        print("   Using synthetic data")
        df = gen_wages()
    df[['geo','year','semester','value']].to_json(f'{OUTPUT_DIR}minimum_wages.json',orient='records')
    print(f"   Saved: {len(df)} rows")
    wages = df
    
    # 5. HPI
    print("\n5. House Price Index")
    df = None
    data = fetch_eurostat_json('prc_hpi_q')
    if data:
        recs = eurostat_json_to_records(data)
        if recs:
            df = pd.DataFrame(recs)
            df = df[df['geo'].isin(EU27)]
            if 'time' in df.columns:
                df['year'] = df['time'].str[:4].astype(int)
                df['quarter'] = df['time'].str[4:]
    if df is None or len(df)==0 or 'year' not in df.columns:
        print("   Using synthetic data")
        df = gen_hpi()
    df[['geo','year','quarter','value']].to_json(f'{OUTPUT_DIR}house_price_index.json',orient='records')
    print(f"   Saved: {len(df)} rows")
    hpi = df
    
    # 6. HICP Annual
    print("\n6. HICP Annual Average")
    df = hicp_rate.groupby(['geo','coicop','year'])['value'].mean().reset_index()
    df['value'] = df['value'].round(1)
    df[['geo','coicop','year','value']].to_json(f'{OUTPUT_DIR}hicp_annual.json',orient='records')
    print(f"   Saved: {len(df)} rows")
    hicp_annual = df
    
    print("\n=== NA AUDIT ===")
    for name, df in [('hicp_rate',hicp_rate),('hicp_index',hicp_index),('elec',elec),('wages',wages),('hpi',hpi),('hicp_annual',hicp_annual)]:
        print(f"{name}: {len(df)} rows, {df['value'].isna().mean()*100:.1f}% missing")
    print("\nDone!")

if __name__=='__main__':
    process_all()
