#!/usr/bin/env python3
"""
World Literacy — web build.

Consolidates the per-region Geography card data (already generated as
*_preview.json by ../Geography/anki-build/generate_v2.py) into a single
data/geography.json that the static atlas site reads.

This is just another *renderer* of the canonical source — same role the
.apkg and Obsidian notes play. Stdlib only; no data is re-fetched.

Run:  py build_web.py
Then: py -m http.server 8000   (from this folder) and open the printed URL.
"""
import json
import re
import sqlite3
import tempfile
import zipfile
from pathlib import Path

# Collapse the History deck's ~16 inconsistent "Region" values into 7 lanes.
HISTORY_REGION_GROUPS = {
    "Europe": "Europe", "Europe / Global": "Europe", "Europe / N. America": "Europe",
    "Americas": "Americas",
    "East Asia": "Asia", "Japan": "Asia", "South Asia": "Asia", "Southeast Asia": "Asia",
    "Russia": "Russia/Eurasia", "Eurasia": "Russia/Eurasia",
    "Middle East": "Middle East", "Middle East / N. Africa": "Middle East",
    "Africa": "Africa", "East Africa": "Africa", "Southern Africa": "Africa",
    "Global": "Global",
    # ancient-world regions
    "Mesopotamia": "Middle East", "Levant": "Middle East",
    "Mesopotamia / Levant": "Middle East", "Persia": "Middle East",
    "Roman Judaea": "Middle East", "Eastern Mediterranean": "Middle East",
    "Greece": "Europe", "Rome": "Europe", "Mediterranean": "Europe",
    "Greece / Persia": "Europe", "Greece → Egypt → India": "Global",
    "Egypt": "Africa", "Nubia / NE Africa": "Africa",
    "China": "Asia", "Mesoamerica": "Americas",
    # medieval regions
    "Byzantium": "Europe", "Pacific": "Global",
}


def _years(when):
    """Start/end years from a 'When' string, BCE-aware (negative years):
    '1914–1918' -> (1914, 1918); 'c. 3200 BCE' -> (-3200, -3200);
    '586–538 BCE' -> (-586, -538); 'c. 1070 BCE – 350 CE' -> (-1070, 350);
    'c. 5th century BCE' -> (-450, -450)."""
    w = (when or "").strip()
    if not w:
        return None
    def parse(part):
        cm = re.search(r"(\d+)(?:st|nd|rd|th)\s+century", part)
        m = cm or re.search(r"\d+", part)
        if not m:
            return None
        n = int(cm.group(1)) * 100 - 50 if cm else int(m.group())
        era = "BCE" if "BCE" in part else ("CE" if re.search(r"\bCE\b", part.replace("BCE", "")) else None)
        return [n, era]
    vals = [v for v in (parse(p) for p in re.split(r"\s*[–—-]\s*", w)) if v]
    if not vals:
        return None
    # propagate era markers: '586–538 BCE' -> both BCE; bare '1914–1918' -> CE
    known = [e for _, e in vals if e]
    for i, v in enumerate(vals):
        if not v[1]:
            later = next((e for _, e in vals[i + 1:] if e), None)
            v[1] = later or (known[-1] if known else "CE")
    yrs = [(-n if e == "BCE" else n) for n, e in vals]
    return yrs[0], yrs[-1]

HERE = Path(__file__).resolve().parent
WL = HERE.parent
DECKS = WL / "Geography" / "anki-build" / "decks"
DATA = HERE / "data"

# The non-Geography fields, in reading order. A field may merge several .apkg
# era decks (History = Ancient + Modern on one tab / one timeline).
CARD_FIELDS = [
    ("History", ["History/history-build/decks/History_-_Ancient_World_v1.apkg",
                 "History/history-build/decks/History_-_Medieval_v1.apkg",
                 "History/history-build/decks/History_-_Modern_World_v1.apkg"]),
    ("People", "History/people-build/decks/People_v1.apkg"),
    ("Economics", "Economics/build/decks/Economics_v1.apkg"),
    ("Geopolitics", "Geopolitics/build/decks/Geopolitics_v1.apkg"),
    ("Global Trends", "Global Trends/worldview-build/decks/Global_Trends_v1.apkg"),
    ("Threads", "Threads/build/decks/Threads_v1.apkg"),
]


def build_geography():
    DATA.mkdir(exist_ok=True)
    # NOTE: full country descriptions (enrich_backgrounds.py -> backgrounds.json)
    # are NO LONGER merged in here — geography.json is loaded by every page, and
    # the full texts tripled its weight. The country page fetches
    # backgrounds.json on its own and upgrades the lead paragraph client-side.
    countries = []
    files = sorted(DECKS.glob("*_preview.json"))
    if not files:
        raise SystemExit(f"No *_preview.json found in {DECKS} — run the Geography generator first.")
    for f in files:
        rows = json.loads(f.read_text(encoding="utf-8"))
        for r in rows:
            iso = (r.get("iso2") or "").lower()
            # Flag via CDN (matches the flagcdn.com source already used in the
            # Obsidian notes), so the site needs no local image assets.
            r["flag_url"] = f"https://flagcdn.com/w320/{iso}.png" if iso else ""
            countries.append(r)
    countries.sort(key=lambda c: c.get("country", ""))

    regions = sorted({c.get("region", "") for c in countries if c.get("region")})
    payload = {
        "count": len(countries),
        "regions": regions,
        "countries": countries,
    }
    out = DATA / "geography.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {out}  ({len(countries)} countries, {len(regions)} regions, from {len(files)} region files)")


def _normalize(model_name, f):
    """Map a note's raw fields (dict) to a uniform card: section/front/back/extra."""
    if "Qword" in f:  # Global Trends — Worldview Indicator
        return {
            "section": "Indicators",
            "front": f"Has {f['Label']} {f['Qword']}?",
            "back": f.get("Verdict", ""),
            "extra": f"{f.get('V0','')} in {f.get('Y0','')} → {f.get('V1','')} in {f.get('Y1','')}. {f.get('Why','')}".strip(),
            "viz": {  # structured values so the web can chart the trend
                "label": f.get("Label", ""),
                "y0": f.get("Y0", ""), "v0": f.get("V0", ""),
                "y1": f.get("Y1", ""), "v1": f.get("V1", ""),
                "verdict": f.get("Verdict", ""), "why": f.get("Why", ""),
            },
        }
    if "Name" in f and "Cue" in f and "Role" in f:  # People — History Person
        dates = f.get("Dates", "")
        card = {
            "section": f.get("Section", "") or "People",
            "front": f"{f['Name']}" + (f" — {f['Role']}" if f.get("Role") else ""),
            "back": f.get("What", ""),
            "extra": ((dates + ". ") if dates else "") + f.get("Why", ""),
            "region": f.get("Region", ""),  # -> country dossiers ("people from here")
            "dates": dates, "why": f.get("Why", ""),  # split out for the portrait grid
            "cue": f.get("Cue", ""),
        }
        yrs = _years(dates.replace("r. ", "").replace("fl. ", ""))  # reign/floruit prefixes
        if yrs:  # lifespan -> timeline bars, contemporaries, events-during-life
            card["time"] = {"year_start": yrs[0], "year_end": yrs[1]}
        return card
    if "Title" in f and "What" in f:  # History — World History Event
        when = f.get("When", "")
        region = f.get("Region", "")
        era = f.get("Era", "") or "Events"
        card = {
            "section": era,
            "front": f"{f['Title']}" + (f" ({when})" if when else ""),
            "back": f.get("What", ""),
            "extra": (f.get("Why", "") + (f"\n\nRegion: {region}" if region else "")).strip(),
            "kind": "event",
            "scan": f.get("Links", ""),  # the [[wikilinks]] — scanned for mentions, then dropped
        }
        yrs = _years(when)
        if yrs:  # structured data so the web can place it on a timeline
            card["time"] = {
                "title": f.get("Title", ""),
                "when": when,
                "year_start": yrs[0], "year_end": yrs[1],
                "era": era,
                "region": region,
                "region_group": HISTORY_REGION_GROUPS.get(region, "Global"),
            }
        return card
    # Q/A/Extra family (Economics, Geopolitics, Threads, *Overview)
    return {
        "section": f.get("Section", "") or "Overview",
        "front": f.get("Q", ""),
        "back": f.get("A", ""),
        # strip Anki-only media markup (e.g. the Geopolitics chokepoint maps) —
        # the web renders extras as escaped text and has its own atlas
        "extra": re.sub(r"(<br>)?<img [^>]*>", "", f.get("Extra", "")).strip(),
    }


def _read_apkg(path):
    z = zipfile.ZipFile(path)
    name = sorted(n for n in z.namelist() if n.startswith("collection.anki"))[-1]
    tmp = Path(tempfile.gettempdir()) / "wl_extract.anki"
    tmp.write_bytes(z.read(name))
    cur = sqlite3.connect(tmp).cursor()
    models = json.loads(cur.execute("SELECT models FROM col").fetchone()[0])
    cards = []
    for mid, flds, tags in cur.execute("SELECT mid, flds, tags FROM notes"):
        model = models[str(mid)]
        names = [x["name"] for x in model["flds"]]
        fdict = dict(zip(names, flds.split("\x1f")))
        card = _normalize(model["name"], fdict)
        card["tags"] = [t for t in tags.split() if t not in ("WorldLiteracy",)]
        cards.append(card)
    return cards


def build_cards():
    DATA.mkdir(exist_ok=True)
    fields = []
    for field_name, rel in CARD_FIELDS:
        paths = [WL / r for r in (rel if isinstance(rel, list) else [rel])]
        paths = [p for p in paths if p.exists()]
        if not paths:
            print(f"  ! skipping {field_name} — not found at {rel}")
            continue
        cards = [c for p in paths for c in _read_apkg(p)]
        if len(paths) > 1:  # merged era decks -> one chronology (overviews last)
            cards.sort(key=lambda c: c.get("time", {}).get("year_start", 10**6))
        sections = sorted({c["section"] for c in cards if c["section"]})
        fields.append({"name": field_name, "count": len(cards),
                       "sections": sections, "cards": cards})
        print(f"  {field_name}: {len(cards)} cards, {len(sections)} sections")
    build_links(fields)  # annotates cards with country mentions, writes links.json + search.json
    out = DATA / "cards.json"
    out.write_text(json.dumps({"fields": fields}, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(f["count"] for f in fields)
    print(f"Wrote {out}  ({total} cards across {len(fields)} fields)")


# ------------------------------------------------------------ link layer ---
# The research layer: scan every card for country mentions at build time so the
# site can cross-link the fields (country dossiers, clickable card text) and
# offer one search over everything — the web analogue of the Obsidian wikilinks.

# Alternate names -> the canonical deck country name. Case-SENSITIVE matching
# (proper nouns), word-boundary anchored, longest-first — so "South Sudan"
# beats "Sudan", "Nigeria" never yields "Niger", and "US" never matches "us".
COUNTRY_ALIASES = {
    "US": "United States", "USA": "United States",
    "UK": "United Kingdom", "Britain": "United Kingdom", "Great Britain": "United Kingdom",
    "England": "United Kingdom", "Scotland": "United Kingdom",
    "Soviet Union": "Russia", "USSR": "Russia",
    "Persia": "Iran", "Burma": "Myanmar", "Türkiye": "Turkey",
    "Ivory Coast": "Côte d'Ivoire", "Holland": "Netherlands",
    "Bosnia": "Bosnia and Herzegovina", "UAE": "United Arab Emirates",
    "Vatican": "Vatican City", "Czech Republic": "Czechia",
}

# People-deck 'Region' values -> country iso2, for the "people from here"
# dossier section (multi-part regions like "Poland / France" are split on "/").
PEOPLE_REGION_ISO = {
    "germany": "de", "prussia": "de", "england": "gb", "britain": "gb", "scotland": "gb",
    "italy": "it", "italy (florence)": "it", "rome": "it", "florence": "it", "venice": "it",
    "france": "fr", "ancient greece": "gr", "greece": "gr", "macedonia": "gr",
    "united states": "us", "us": "us", "china": "cn", "tibet": "cn", "russia": "ru",
    "netherlands": "nl", "low countries": "nl", "spain": "es", "persia": "ir",
    "india": "in", "denmark": "dk", "austria": "at", "vietnam": "vn",
    "turkey": "tr", "ottoman empire": "tr", "serbia": "rs", "portugal": "pt",
    "poland": "pl", "morocco": "ma", "moravia": "cz", "mongolia": "mn",
    "mesopotamia": "iq", "babylon": "iq", "egypt": "eg", "arabia": "sa",
    "switzerland": "ch", "sweden": "se", "norway": "no", "ireland": "ie",
    "belgium": "be", "japan": "jp", "israel": "il", "judea": "il", "hungary": "hu",
}


def build_links(fields):
    geo = json.loads((DATA / "geography.json").read_text(encoding="utf-8"))
    name_to_iso = {c["country"]: (c.get("iso2") or "").lower()
                   for c in geo["countries"] if c.get("iso2")}
    names = dict(name_to_iso)
    for alias, canon in COUNTRY_ALIASES.items():
        if canon in name_to_iso:
            names[alias] = name_to_iso[canon]
    pat = re.compile(r"\b(" + "|".join(re.escape(n) for n in
                     sorted(names, key=len, reverse=True)) + r")\b")

    countries = {}  # iso -> {"people": [...], "cards": [[field, idx], ...]}
    entry = lambda iso: countries.setdefault(iso, {"people": [], "cards": []})

    for f in fields:
        for i, c in enumerate(f["cards"]):
            text = " ".join((c.get("front", ""), c.get("back", ""),
                             c.get("extra", ""), c.pop("scan", "")))
            isos = sorted({names[m] for m in pat.findall(text)})
            if isos:
                c["iso"] = isos
            if f["name"] == "People":
                # dossier "people" comes from the curated Region, not text mentions
                home = []
                for part in (c.get("region") or "").split("/"):
                    part = part.strip()
                    iso = PEOPLE_REGION_ISO.get(part.lower()) or names.get(part)
                    if iso:
                        entry(iso)["people"].append(i)
                        home.append(iso)
                if home:
                    c["home"] = home  # -> person-page country chips
            else:
                for iso in isos:
                    entry(iso)["cards"].append([f["name"], i])

    iso_names = {v: k for k, v in name_to_iso.items()}  # iso -> canonical name
    out = DATA / "links.json"
    out.write_text(json.dumps({"names": names, "countries": countries,
                               "isoNames": iso_names},
                              ensure_ascii=False), encoding="utf-8")
    n_links = sum(len(v["cards"]) for v in countries.values())
    n_people = sum(len(v["people"]) for v in countries.values())
    print(f"Wrote {out}  ({len(countries)} countries linked, "
          f"{n_links} card links, {n_people} people placements)")

    # search.json — the country entries for the omnisearch overlay
    # (people/events/cards are searched client-side from cards.json).
    search = [{"n": c["country"], "s": f"{c.get('capital','')} · {c.get('region','')}",
               "h": f"country.html?iso={(c.get('iso2') or '').lower()}"}
              for c in geo["countries"]]
    (DATA / "search.json").write_text(json.dumps(search, ensure_ascii=False),
                                      encoding="utf-8")
    print(f"Wrote {DATA / 'search.json'}  ({len(search)} countries)")


if __name__ == "__main__":
    build_geography()
    build_cards()
