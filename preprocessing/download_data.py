"""
Download Eurostat datasets and Europe TopoJSON map.
"""
import requests
import os

RAW_DIR = '../data/raw/'
DATA_DIR = '../data/'
os.makedirs(RAW_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# Eurostat bulk download URLs (TSV format)
DATASETS = {
    'prc_hicp_manr': 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_manr?format=JSON&lang=en',
    'prc_hicp_midx': 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_midx?format=JSON&lang=en',
    'nrg_pc_204': 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_pc_204?format=JSON&lang=en',
    'earn_mw_cur': 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/earn_mw_cur?format=JSON&lang=en',
    'prc_hpi_q': 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hpi_q?format=JSON&lang=en',
    'prc_hicp_aind': 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_aind?format=JSON&lang=en',
}

# Since the bulk TSV download requires browser interaction, we'll use the JSON API
# and convert to the same structure our parser expects.

def download_json_dataset(code, url):
    print(f"Downloading {code}...")
    try:
        resp = requests.get(url, timeout=120)
        resp.raise_for_status()
        path = os.path.join(RAW_DIR, f"{code}.json")
        with open(path, 'w', encoding='utf-8') as f:
            f.write(resp.text)
        print(f"  Saved {code}.json ({len(resp.text)} chars)")
        return True
    except Exception as e:
        print(f"  ERROR downloading {code}: {e}")
        return False

def download_topojson():
    url = "https://raw.githubusercontent.com/leakyMirror/map-of-europe/master/TopoJSON/europe.topojson"
    print(f"Downloading Europe TopoJSON...")
    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        path = os.path.join(DATA_DIR, "europe.topojson")
        with open(path, 'w', encoding='utf-8') as f:
            f.write(resp.text)
        print(f"  Saved europe.topojson ({len(resp.text)} chars)")
        return True
    except Exception as e:
        print(f"  ERROR downloading topojson: {e}")
        # Try fallback
        url2 = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"
        print(f"  Trying fallback...")
        try:
            resp = requests.get(url2, timeout=60)
            resp.raise_for_status()
            path = os.path.join(DATA_DIR, "europe.topojson")
            with open(path, 'w', encoding='utf-8') as f:
                f.write(resp.text)
            print(f"  Saved fallback topojson ({len(resp.text)} chars)")
            return True
        except Exception as e2:
            print(f"  ERROR fallback also failed: {e2}")
            return False

if __name__ == '__main__':
    for code, url in DATASETS.items():
        download_json_dataset(code, url)
    download_topojson()
    print("\nDone.")
