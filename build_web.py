#!/usr/bin/env python3
"""
World Literacy — web build.

Consolidates the per-region Geography card data (already generated as
*_preview.json by ../Geography/anki-build/generate_v2.py) into a single
data/geography.json that the static atlas site reads, extracts the other
fields' cards from their .apkg files (cards.json), builds the link layer
(links.json, search.json), exports the verification registry from ../audit.py
(sources.json), writes the per-field counts the About page shows
(stats.json) and checks that data/credits.json (enrich_credits.py) covers
every portrait the site shows.

This is just another *renderer* of the canonical source — same role the
.apkg and Obsidian notes play. Stdlib only; no data is re-fetched.

Run:  py build_web.py
Then: py -m http.server 8000   (from this folder) and open the printed URL.
"""
import importlib.util
import json
import re
import sqlite3
import tempfile
import zipfile
from datetime import date
from pathlib import Path
from urllib.parse import quote

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
AUDIT = WL / "audit.py"   # the verification registry (imported as a module, never run)
DECK_ROOT = "World Literacy::"   # every deck lives under this Anki root

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

    # Deck counts for stats.json — read from the Geography .apkg files themselves
    # (19 regional decks + the World capstone), so the About page never quotes a
    # stale number.
    apkgs = sorted(DECKS.glob("*.apkg"))
    notes = cards = 0
    decks = []
    for a in apkgs:
        cur, _ = _open_apkg(a)
        notes += cur.execute("SELECT count(*) FROM notes").fetchone()[0]
        cards += cur.execute("SELECT count(*) FROM cards").fetchone()[0]
        decks += [_deck_short(v["name"]) for v in
                  json.loads(cur.execute("SELECT decks FROM col").fetchone()[0]).values()
                  if v["name"] != "Default"]
    return {"name": "Geography", "countries": len(countries), "regions": len(regions),
            "notes": notes, "cards": cards, "apkg_files": len(apkgs),
            "decks": sorted(set(decks))}


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


def _open_apkg(path):
    """Cursor over the SQLite collection inside an .apkg (a zip), plus its models."""
    z = zipfile.ZipFile(path)
    name = sorted(n for n in z.namelist() if n.startswith("collection.anki"))[-1]
    tmp = Path(tempfile.gettempdir()) / "wl_extract.anki"
    tmp.write_bytes(z.read(name))
    cur = sqlite3.connect(tmp).cursor()
    models = json.loads(cur.execute("SELECT models FROM col").fetchone()[0])
    return cur, models


def _deck_short(name):
    """'World Literacy::Threads::Places' -> 'Threads::Places'."""
    return name[len(DECK_ROOT):] if name.startswith(DECK_ROOT) else name


def _read_apkg(path):
    """Every note of an .apkg as a normalised card (with the Anki deck it sits
    in), plus the number of Anki cards the file generates (a note can yield
    several — History events make three)."""
    cur, models = _open_apkg(path)
    decks = {int(k): v["name"] for k, v in
             json.loads(cur.execute("SELECT decks FROM col").fetchone()[0]).items()}
    note_deck = dict(cur.execute("SELECT nid, MIN(did) FROM cards GROUP BY nid"))
    n_cards = cur.execute("SELECT count(*) FROM cards").fetchone()[0]
    cards = []
    for nid, mid, flds, tags in cur.execute("SELECT id, mid, flds, tags FROM notes"):
        model = models[str(mid)]
        names = [x["name"] for x in model["flds"]]
        fdict = dict(zip(names, flds.split("\x1f")))
        card = _normalize(model["name"], fdict)
        card["tags"] = [t for t in tags.split() if t not in ("WorldLiteracy",)]
        card["deck"] = _deck_short(decks.get(note_deck.get(nid), ""))
        cards.append(card)
    return cards, n_cards


def build_cards():
    DATA.mkdir(exist_ok=True)
    fields = []
    for field_name, rel in CARD_FIELDS:
        paths = [WL / r for r in (rel if isinstance(rel, list) else [rel])]
        paths = [p for p in paths if p.exists()]
        if not paths:
            print(f"  ! skipping {field_name} — not found at {rel}")
            continue
        cards, anki_cards = [], 0
        for p in paths:
            cs, n = _read_apkg(p)
            cards += cs
            anki_cards += n
        if len(paths) > 1:  # merged era decks -> one chronology (overviews last)
            cards.sort(key=lambda c: c.get("time", {}).get("year_start", 10**6))
        sections = sorted({c["section"] for c in cards if c["section"]})
        fields.append({"name": field_name, "count": len(cards), "anki_cards": anki_cards,
                       "apkg_files": len(paths),
                       "decks": sorted({c["deck"] for c in cards if c.get("deck")}),
                       "sections": sections, "cards": cards})
        print(f"  {field_name}: {len(cards)} entries ({anki_cards} Anki cards), {len(sections)} sections")
    build_links(fields)  # annotates cards with country mentions, writes links.json + search.json
    out = DATA / "cards.json"
    out.write_text(json.dumps({"fields": fields}, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(f["count"] for f in fields)
    print(f"Wrote {out}  ({total} entries across {len(fields)} fields)")
    return fields


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


# --------------------------------------------------- sources + stats ---
# sources.json — the verification registry from ../audit.py, rendered by
# sources.html. Each registered figure carries its source, edition, the date
# it was last verified, its re-check cadence, and the deck/card it lives in.
# The registry is *imported* (audit.py keeps its CLI behind __main__), and each
# entry's literal `assert_text` substrings are matched against the built cards
# so the page can link every figure to the card that carries it.

def _load_audit():
    spec = importlib.util.spec_from_file_location("wl_audit", AUDIT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # defines F and the file constants; runs nothing
    return mod


def _add_months(ym, months):
    y, m = (int(x) for x in ym.split("-"))
    m += months
    return f"{y + (m - 1) // 12}-{(m - 1) % 12 + 1:02d}"


def _plain(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html or "")).strip()


def build_sources(fields):
    if not AUDIT.exists():
        print(f"  ! skipping sources.json — {AUDIT} not found")
        return None
    audit = _load_audit()
    file_field = {audit.GEOPOL: "Geopolitics", audit.ECON: "Economics",
                  audit.THREADS: "Threads", audit.GEO_WORLD: "Geography"}
    by_name = {f["name"]: f for f in fields}

    def locate(rel, needle):
        """Cards of the field generated by `rel` whose raw text carries `needle`."""
        f = by_name.get(file_field.get(rel, ""))
        if not f:
            return []
        hits = []
        for i, c in enumerate(f["cards"]):
            raw = " ".join((c.get("front", ""), c.get("back", ""), c.get("extra", "")))
            if needle in raw:
                hits.append((f["name"], i, c))
        return hits

    entries = []
    for n, e in enumerate(audit.F, 1):
        found = {}
        for item in e["assert_text"]:
            targets, s = ([item[0]], item[1]) if isinstance(item, tuple) else (e["files"], item)
            for rel in targets:
                for fname, i, c in locate(rel, s):
                    front = _plain(c.get("front", ""))
                    found.setdefault((fname, i), {
                        "field": fname, "deck": c.get("deck", ""), "section": c.get("section", ""),
                        "title": front[:110] + ("…" if len(front) > 110 else ""),
                        "href": f"fields.html?f={quote(fname)}&q={quote(c.get('front', '')[:40])}",
                    })
        where_file, _, where_card = e["where"].partition(" — ")
        entries.append({
            "id": n, "field": e["field"], "figure": e["figure"],
            "source": e["source"], "edition": e["edition"],
            "verified": e["verified"], "cadence_months": e["cadence"],
            "due": _add_months(e["verified"], e["cadence"]),
            "where": e["where"], "where_card": where_card or e["where"],
            "generator": where_file,
            "echoes": list(e["echoes"]), "files": list(e["files"]),
            "in_atlas": [file_field.get(f, f) for f in e["files"] if file_field.get(f) in by_name],
            "cards": sorted(found.values(), key=lambda c: (c["field"], c["deck"], c["title"])),
        })
    field_order = ["Geopolitics", "Economics", "Threads"]
    payload = {
        "generated": date.today().isoformat(),
        "count": len(entries),
        "aging_at": audit.AGING_AT, "stale_at": audit.STALE_AT,
        "fields": [f for f in field_order if any(x["field"] == f for x in entries)]
                  + sorted({x["field"] for x in entries} - set(field_order)),
        "entries": entries,
        "self_updating": [
            {"field": "Global Trends", "what": "every indicator (poverty, child mortality, life expectancy, fertility, "
                                               "literacy, electricity, internet, urbanisation, CO₂…)",
             "source": "World Bank World Development Indicators, world aggregates",
             "how": "re-fetched from the World Bank API on every rebuild of the deck"},
            {"field": "Geography", "what": "population figures on every country card, and the population rankings",
             "source": "World Bank World Development Indicators (SP.POP.TOTL)",
             "how": "re-fetched from the World Bank API on every rebuild of the deck"},
        ],
        "unregistered": "Stable historical facts — Bretton Woods in 1944, the Nasdaq's dot-com fall, Madoff's "
                        "$65 billion, the dates and outcomes of the History events — are deliberately not "
                        "registered: they do not churn, so re-checking them on a cadence would be noise.",
    }
    out = DATA / "sources.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    located = sum(1 for x in entries if x["cards"])
    print(f"Wrote {out}  ({len(entries)} registered figures, {located} located on atlas cards)")
    return payload


def build_stats(geo, fields, sources):
    """stats.json — the per-field counts the About page shows, read from the
    built decks so the page never hardcodes a number."""
    rows = [dict(geo, kind="atlas")]
    for f in fields:
        rows.append({"name": f["name"], "kind": "cards", "notes": f["count"],
                     "cards": f["anki_cards"], "apkg_files": f["apkg_files"],
                     "decks": f["decks"], "sections": f["sections"]})
    payload = {
        "generated": date.today().isoformat(),
        "deck_root": DECK_ROOT.rstrip(":"),
        "fields": rows,
        "totals": {"notes": sum(r["notes"] for r in rows), "cards": sum(r["cards"] for r in rows),
                   "apkg_files": sum(r["apkg_files"] for r in rows), "fields": len(rows)},
        "registry": {"figures": sources["count"] if sources else 0,
                     "generated": sources["generated"] if sources else None},
    }
    out = DATA / "stats.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {out}  ({payload['totals']['cards']} Anki cards across {len(rows)} fields)")


def check_credits():
    """Warn when data/credits.json (enrich_credits.py) is missing, does not
    cover every portrait in data/portraits.json, or carries a licence outside
    the allow-list. The credits page and the person-page credit lines read
    it; a portrait without an entry is one the site cannot credit."""
    ports, creds = DATA / "portraits.json", DATA / "credits.json"
    if not ports.exists():
        return
    have = {k for k, v in json.loads(ports.read_text(encoding="utf-8")).items()
            if isinstance(v, dict) and v.get("img")}
    if not creds.exists():
        print(f"  ! {creds.name} missing — run enrich_credits.py so the portraits are credited")
        return
    c = json.loads(creds.read_text(encoding="utf-8")).get("portraits", {})
    missing = sorted(have - set(c))
    bad = sorted(k for k, v in c.items() if not v.get("allowed", True))
    if missing:
        print(f"  ! {len(missing)} portrait(s) without a credit entry — run enrich_credits.py: "
              + ", ".join(missing[:8]) + (" …" if len(missing) > 8 else ""))
    if bad:
        print(f"  ! {len(bad)} portrait(s) with a licence outside the allow-list: " + ", ".join(bad))
    if not missing and not bad:
        n_req = sum(1 for v in c.values() if v.get("attribution_required"))
        print(f"Credits OK  ({len(c)} portraits, {n_req} need attribution)")


if __name__ == "__main__":
    geo = build_geography()
    fields = build_cards()
    sources = build_sources(fields)
    build_stats(geo, fields, sources)
    check_credits()
