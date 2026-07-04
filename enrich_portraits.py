#!/usr/bin/env python3
"""Fetch portrait thumbnails for the People deck from the Wikipedia REST API
-> data/portraits.json  (name -> image URL on upload.wikimedia.org).

Same pattern as enrich_backgrounds.py: optional, network, resumable (already-
fetched names are skipped — delete an entry to refetch). The client falls back
to the initials medallion for misses or offline use.

Run:  py enrich_portraits.py
"""
import json
import re
import time
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
OUT = DATA / "portraits.json"
UA = {"User-Agent": "WorldLiteracyAtlas/0.1 (personal research atlas; yago@cultormedia.com)"}


# deck name -> Wikipedia title, where guessing fails (disambiguation, groups)
MANUAL = {
    "Seneca": "Seneca the Younger",
    "The Medici": "House of Medici",
    "Watson, Crick & Franklin": "Francis Crick",
    "Al-Ghazali": "Al-Ghazali",
}


def candidates(name):
    """Wikipedia title guesses: manual alias, full name, then without parentheticals."""
    plain = re.sub(r"\s*\([^)]*\)", "", name).strip()
    inner = (re.search(r"\(([^)]*)\)", name) or [None, ""])[1].strip()
    return list(dict.fromkeys([MANUAL.get(name, ""), name, plain, inner]))


def fetch_summary(title):
    """-> {'img': thumbnail-url, 'url': canonical page url} or None."""
    u = f"https://en.wikipedia.org/api/rest_v1/page/summary/{title.replace(' ', '_')}"
    try:
        r = requests.get(u, headers=UA, timeout=20)
        if r.status_code != 200:
            return None
        d = r.json()
        img = (d.get("thumbnail") or {}).get("source") or ""
        url = ((d.get("content_urls") or {}).get("desktop") or {}).get("page") or ""
        return {"img": img, "url": url} if (img or url) else None
    except requests.RequestException:
        return None


def main():
    cards = json.loads((DATA / "cards.json").read_text(encoding="utf-8"))
    people = next(f for f in cards["fields"] if f["name"] == "People")["cards"]
    out = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    # migrate v1 entries (bare image-URL strings) -> refetch to add the page URL
    out = {k: v for k, v in out.items() if isinstance(v, dict)}

    names = [c["front"].split(" — ")[0] for c in people]
    todo = [n for n in names if n not in out]
    print(f"{len(names)} people, {len(todo)} to fetch")
    for n, name in enumerate(todo, 1):
        got = None
        for t in filter(None, candidates(name)):
            got = fetch_summary(t)
            if got and got["img"]:
                break
        out[name] = got or {"img": "", "url": ""}
        OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
        print(f"  [{n}/{len(todo)}] {'ok  ' if got and got['img'] else 'MISS'} {name}")
        time.sleep(0.12)

    misses = [k for k, v in out.items() if not v.get("img")]
    print(f"\n{len(out) - len(misses)}/{len(out)} portraits found.")
    if misses:
        print("misses (medallion fallback):", ", ".join(misses))


if __name__ == "__main__":
    main()
