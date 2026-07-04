#!/usr/bin/env python3
"""
Fetch the FULL country 'Background' text from the CIA World Factbook Archive
(the deck generator truncates it to ~320 chars). Writes data/backgrounds.json
(iso2 -> full text), which build_web.py merges into geography.json.

Stdlib only, resumable (skips iso2 codes already saved). Run occasionally:
    py enrich_backgrounds.py
"""
import json
import time
import urllib.request
from pathlib import Path

WEB = Path(__file__).resolve().parent
GEO = WEB / "data" / "geography.json"
OUT = WEB / "data" / "backgrounds.json"
YEAR = 2024

isos = [c["iso2"] for c in json.loads(GEO.read_text(encoding="utf-8"))["countries"] if c.get("iso2")]
data = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}

for i, iso in enumerate(isos, 1):
    if data.get(iso):
        continue
    url = f"https://worldfactbookarchive.org/api/archive/{YEAR}/{iso.lower()}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            j = json.load(r)
        bg = ""
        for f in j.get("fields", []):
            if f.get("FieldName") == "Background":
                bg = (f.get("Content") or "").strip()
                break
        data[iso] = bg
        print(f"[{i}/{len(isos)}] {iso}  {len(bg)} chars", flush=True)
    except Exception as e:
        print(f"[{i}/{len(isos)}] {iso}  ERROR {e}", flush=True)
        data[iso] = ""
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding="utf-8")
    time.sleep(0.25)

print(f"done — {sum(1 for v in data.values() if v)} of {len(isos)} have text")
