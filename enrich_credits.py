#!/usr/bin/env python3
"""Portrait credits — licence, creator and file page for every People portrait,
read from Wikimedia Commons -> data/credits.json.

Reads data/portraits.json (enrich_portraits.py), derives each thumbnail's
Commons file name, asks the MediaWiki API for the file's `extmetadata` (50
files per call) and writes, per person: file, file_page, licence, licence_url,
artist, attribution_required, allowed. credits.html lists the files whose
licence requires attribution; person.html shows a credit line under the
portrait; build_web.py warns when this file is missing or does not cover every
portrait.

Every licence is checked against an allow-list (public domain, CC0, CC BY,
CC BY-SA, UK OGL, "no restrictions"). A file outside it — a non-commercial or
unrecognised licence, or a portrait not hosted on Commons — is written with
allowed=false and printed, so it can be replaced before the site goes out.
Commons files get renamed, replaced and relicensed: rerun this after every
enrich_portraits.py run rather than trusting an old snapshot.

Stdlib only; network. Run:  py enrich_credits.py
"""
import html
import json
import re
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
PORTRAITS = DATA / "portraits.json"
OUT = DATA / "credits.json"
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "WorldLiteracyAtlas/0.1 (https://projectimpero.github.io/world-literacy-atlas/)"}
BATCH = 50  # the API's per-request title limit

# .../wikipedia/commons/thumb/9/98/<File>/330px-<File>  or  .../commons/9/98/<File>
FILE_RE = re.compile(r"/wikipedia/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/?#]+)")
ALLOWED = re.compile(r"^(public domain|pd\b|cc0|cc[ -]by(-sa)?\b|ogl\b|no restrictions)", re.I)

# Creator strings taken from the file's own Commons metadata where the Artist
# field is not a name (a derivative-work list, or a licence remark in the
# artist's language). Keyed by Commons file name.
ARTIST_OVERRIDES = {
    "Francis_Crick_crop.jpg": "Marc Lieberman (photograph); derivative work by Materialscientist",
    "Buddha_in_Sarnath_Museum_(Dhammajak_Mutra).jpg": "Tevaprapas Makklay (พระมหาเทวประภาส วชิรญาณเมธี)",
}


def file_name(img_url):
    m = FILE_RE.search(img_url or "")
    return urllib.parse.unquote(m.group(1)) if m else ""


def clean(markup):
    """Commons' Artist field is HTML: links, hidden duplicate spans, footnote
    blocks. Reduce it to the visible creator text."""
    s = re.sub(r"<span[^>]*display:\s*none[^>]*>.*?</span>", "", markup or "", flags=re.S)
    s = re.sub(r"<div[^>]*font-size:\s*xx-small[^>]*>.*?</div>", "", s, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)  # a space, so list items and links do not glue together
    s = re.sub(r"\s+", " ", html.unescape(s))
    s = re.sub(r"\s+([.,;:)])", r"\1", s)  # no space before punctuation once tags are gone
    return re.sub(r"\(\s+", "(", s).strip(" .;,")


def key(title):
    """API titles come back normalised (underscores -> spaces, first letter
    upper-cased); compare on that form."""
    t = title.replace("_", " ").strip()
    return t[:1].upper() + t[1:]


def fetch(files):
    """-> {normalised 'File:...' title: (page, imageinfo)} for one batch."""
    q = urllib.parse.urlencode({
        "action": "query", "prop": "imageinfo", "iiprop": "extmetadata|url",
        "titles": "|".join("File:" + f for f in files), "redirects": 1, "format": "json"})
    req = urllib.request.Request(f"{API}?{q}", headers=UA)
    raw = json.load(urllib.request.urlopen(req, timeout=60))["query"]
    back = {}  # title the API answered under -> title we asked for
    for n in raw.get("normalized", []) + raw.get("redirects", []):
        back[n["to"]] = back.get(n["from"], n["from"])
    got = {}
    for p in raw["pages"].values():
        asked = back.get(p["title"], p["title"])
        got[key(asked)] = p
    return got


def entry(person, f, page):
    ii = (page.get("imageinfo") or [{}])[0]
    em = ii.get("extmetadata") or {}
    g = lambda k: html.unescape((em.get(k) or {}).get("value", "")).strip()
    licence = g("LicenseShortName") or g("License") or ("missing on Commons" if "missing" in page else "unknown")
    artist = ARTIST_OVERRIDES.get(f) or clean(g("Artist")) or "Unknown author"
    required = g("AttributionRequired") == "true" or bool(re.match(r"^(cc[ -]by|ogl)", licence, re.I))
    return {
        "file": f,
        "file_page": ii.get("descriptionurl") or "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(f),
        "licence": licence,
        "licence_url": g("LicenseUrl"),
        "artist": artist,
        "attribution_required": required,
        "allowed": bool(ALLOWED.match(licence)) and "missing" not in page,
    }


def main():
    ports = json.loads(PORTRAITS.read_text(encoding="utf-8"))
    wanted = []  # (person, file) in deck order
    off_commons = []
    for person, v in ports.items():
        img = (v or {}).get("img") if isinstance(v, dict) else v
        if not img:
            continue
        f = file_name(img)
        if f:
            wanted.append((person, f))
        else:
            off_commons.append(person)
    print(f"{len(wanted)} portraits on Commons, {len(off_commons)} elsewhere, "
          f"{len(ports) - len(wanted) - len(off_commons)} without an image")

    pages = {}
    for i in range(0, len(wanted), BATCH):
        batch = [f for _, f in wanted[i:i + BATCH]]
        pages.update(fetch(batch))
        print(f"  fetched {min(i + BATCH, len(wanted))}/{len(wanted)}")

    credits = {}
    for person, f in wanted:
        page = pages.get(key("File:" + f)) or {"title": f, "missing": ""}
        credits[person] = entry(person, f, page)
    for person in off_commons:  # not creditable from here — flag, never silently allow
        credits[person] = {"file": "", "file_page": "", "licence": "not hosted on Wikimedia Commons",
                           "licence_url": "", "artist": "", "attribution_required": True, "allowed": False}

    n_req = sum(1 for c in credits.values() if c["attribution_required"])
    payload = {
        "generated": date.today().isoformat(),
        "source": "Wikimedia Commons file metadata (MediaWiki API, prop=imageinfo, extmetadata)",
        "count": len(credits), "attribution_required": n_req,
        "portraits": credits,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {OUT}  ({len(credits)} portraits, {n_req} need attribution)")

    bad = [(p, c) for p, c in credits.items() if not c["allowed"]]
    if bad:
        print(f"\n! {len(bad)} portrait(s) with a licence outside the allow-list — replace before publishing:")
        for p, c in bad:
            print(f"    {p}: {c['licence']} ({c['file'] or 'no Commons file'})")
    long = [(p, c["artist"]) for p, c in credits.items() if c["attribution_required"] and len(c["artist"]) > 60]
    if long:
        print("\nLong creator strings (check they read as a credit):")
        for p, a in long:
            print(f"    {p}: {a}")


if __name__ == "__main__":
    main()
