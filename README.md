# World Literacy — Web (Atlas)

**Live at https://projectimpero.github.io/world-literacy-atlas/** — this folder
is a git repo deployed via GitHub Pages (repo `projectimpero/world-literacy-atlas`,
branch `main`, static, no build step). To publish updates after regenerating data:

```
git add -A && git commit -m "update data" && git push
```


A browsable, interactive **atlas** rendering of World Literacy — a third output
alongside the Anki decks and the Obsidian notes. Same canonical data, new
renderer. No accounts, no backend, no build toolchain beyond Python.

## Run it

```
cd "World Literacy/web"
py enrich_backgrounds.py # (optional, network) full country descriptions -> data/backgrounds.json
py enrich_portraits.py   # (optional, network) People portraits from Wikipedia -> data/portraits.json
py enrich_credits.py     # (optional, network) portrait licences + creators from Wikimedia Commons -> data/credits.json
py build_web.py          # consolidates Geography + cards + the registry -> data/*.json
py -m http.server 8000   # then open http://localhost:8000
```

`enrich_backgrounds.py` only needs to run when you want to (re)fetch the full
descriptions; it's resumable and `build_web.py` merges its output when present.

(Use `py` on this machine — the bare `python` is a Windows Store stub.)

## What it does

- **index.html** — the Geography atlas:
  - **Interactive world map** with a **Flat | Globe** toggle:
    - *Flat* — the SVG world map shaded by region; **scroll/buttons to zoom,
      drag to pan**; hover for a tooltip, click to open a country.
    - *Globe* — a draggable 3-D orthographic globe (like the Factbook app):
      drag to rotate, scroll/buttons to zoom, hover + click as on the flat map.
      Rendered on `<canvas>` with d3-geo (vendored locally — see Assets).
    - Legend filters by region.
  - **Ranking charts** — top 15 by population / GDP per capita / area, bars
    coloured by region (hand-drawn SVG/CSS, no chart library).
  - **Grid** below: live search (country/capital), region filter, sort.
    Countries missing a value for the active sort metric (e.g. Liechtenstein /
    Vatican GDP) always sort **last** and show **"No data"** — never as `0`/lowest.
- **country.html?iso=fr** — a visual country page:
  - **Description** — the Factbook background leads the page as an intro.
  - **Stat tiles** for population, area, GDP per capita, each with an icon and a
    **rank strip**: a low→high marker showing where the country sits among all
    196 (e.g. "1st of 196 worldwide").
  - **Locator map** zoomed to the country, with it highlighted and its
    neighbours tinted (reuses the world-map SVG; auto-zooms to the bounding box).
  - **Composition charts** — stacked bars for religions and ethnic groups
    (percentages parsed from the Factbook text; falls back to plain text when
    the source has no percentages).
  - Full Factbook details (icon per row), clickable neighbour links.
  - Icons are inline SVG (Feather-style), defined in `app.js` — no icon library.
- **fields.html?f=History** — a card browser for the non-Geography fields
  (History, People, Economics, Geopolitics, Global Trends, Threads): search +
  section filter.
  **People** is the polymath canon — 174 figures across 8 sections, each shown
  as name · role · dates · what they did · why they matter.
  **Global Trends** indicators render as **before/after charts** (e.g. extreme
  poverty 47%→10%) with a Better/Worse verdict.
- **History timeline** — History has a `Cards | Timeline` toggle
  (`?f=History&view=timeline`). The Timeline is a **swimlane view**: a horizontal
  time axis with one lane per region group, era phases as background bands,
  events as region-coloured chips (multi-year events drawn as bars).
  Overlapping events are **packed into stacked sub-rows** so labels never
  collide (lane height grows with density). Click an event to read what happened
  and why; filter by region via the chips. Built from the `time` object the
  History events carry in `cards.json` (year range + normalised region group);
  undated overview cards appear only in Cards view.
- **sources.html** — **Sources & verification**, the product's standard for
  churning figures. Renders `data/sources.json`: every registered figure
  grouped by field, with its primary source, the edition checked, the month it
  was verified, its re-check cadence and next due date, the deck and card it
  lives on (deep links into the card browser) and every place it is echoed;
  then the self-updating sources (Global Trends and the country populations,
  pulled live from the World Bank on rebuild) and the stable historical facts
  that are deliberately unregistered. Status (current / re-check soon / due) is
  computed in the browser against today's date, so a deployed page stays
  truthful as time passes.
- **about.html** — the product page: what World Literacy is, the seven fields
  with their card counts (filled from `data/stats.json`, never hardcoded), how it
  is meant to be used (Anki on the phone, ten new cards a day, the ordered path,
  the atlas as the reference layer), how it is built and verified (links to
  `sources.html`), and a **Get the decks** section whose distribution link is a
  clearly marked placeholder (the `<!-- PLACEHOLDER: … -->` comment in the file) — no pricing.
- **credits.html** — **Credits & licences**: every source with the terms it
  is used under — the Factbook (public domain), World Bank (CC BY 4.0),
  Wikidata (CC0), Natural Earth / world-atlas / d3 / topojson-client (ISC)
  and SVG-World-Map (MIT) with their notices verbatim, Flagpedia, the data
  publishers whose figures are cited, and the portrait credits rendered from
  `data/credits.json` (the files whose Commons licence requires attribution,
  each with creator, licence and file link; the rest counted as public
  domain). Person pages carry the same credit under the portrait.
- Flags load from `flagcdn.com` (the same source the Obsidian notes use); the
  only bundled asset is the world map SVG.

Every page links **About** from the header nav and **About**, **Sources &
verification** and **Credits & licences** from the footer, followed by the
one-line data credit (Factbook · World Bank · Flagpedia · Natural Earth,
SVG-World-Map, d3 · Wikimedia Commons).

## Assets

- `assets/world-states.svg` — country-coded (ISO 3166-1 alpha-2) world map from
  [raphaellepuschitz/SVG-World-Map](https://github.com/raphaellepuschitz/SVG-World-Map).
  Countries are matched to data by their uppercase ISO2 id and recoloured via
  CSS. Territories not in the dataset (Greenland, Antarctica, …) stay neutral.
- `assets/vendor/` — the **one local dependency**, used only by the Globe view:
  `d3.min.js` (d3-geo for the orthographic projection), `topojson-client.min.js`,
  and `countries-110m.json` (Natural Earth world geometry via the `world-atlas`
  package). All vendored locally so the site still works fully offline. Globe
  countries join to our data by name (with a small alias table in `app.js` for
  variants like "Dem. Rep. Congo" → "DR Congo"); microstates absent from the
  110m geometry simply don't appear on the globe.

## How it fits the project

```
canonical data  ──>  generate_v2.py  ──>  .apkg   (Anki: recall)
(CIA Factbook +                       └─>  *.md    (Obsidian: understanding)
 World Bank)         build_web.py     ──>  geography.json ─┐
                     build_web.py     ──>  cards.json  ────┤
../audit.py     ──>  build_web.py     ──>  sources.json ───┴─> web (explore)
```

`build_web.py` re-fetches nothing:
- **Geography** comes from the `*_preview.json` the Geography generator writes
  (the 19 regional files; the World capstone's preview is empty by design, so
  the World overview cards are not in `geography.json`).
- The **other six fields** are read straight out of their generated `.apkg`
  files (each is a zip with a SQLite `collection.anki2` inside — stdlib
  `zipfile` + `sqlite3`, no Anki install needed). The model-aware extractor in
  `build_web.py` normalises every note (Q/A, history events, trend indicators)
  into one uniform card shape, and records the Anki deck each note sits in.
- **The verification registry** is imported from `../audit.py` as a module (its
  CLI stays behind `__main__`, so nothing runs). Each entry's literal
  `assert_text` substrings are matched against the built cards, which is how
  `sources.json` knows the deck and card every figure lives on.

### Data files (`data/`)

| File | Written by | What |
|---|---|---|
| `geography.json` | `build_web.py` | 196 countries from the regional previews (flag URLs added) |
| `cards.json` | `build_web.py` | the six card fields, one uniform card shape, with `deck`, `time`, `iso` |
| `links.json`, `search.json` | `build_web.py` | the link layer (country mentions + reverse index) and the omnisearch country entries |
| `sources.json` | `build_web.py` | the verification registry from `../audit.py`: figure, source, edition, verified, cadence, due, where/echoes, located cards |
| `stats.json` | `build_web.py` | per-field notes/cards/decks/sections read from the `.apkg` files, totals, registry size — feeds `about.html` |
| `backgrounds.json` | `enrich_backgrounds.py` | full Factbook descriptions (fetched on demand by the country page) |
| `portraits.json` | `enrich_portraits.py` | People portraits + canonical Wikipedia URLs |
| `credits.json` | `enrich_credits.py` | per portrait: Commons file, file page, licence + URL, creator, attribution flag, allow-list check — feeds `credits.html` and the person-page credit line; `build_web.py` warns if it is missing or incomplete |

Rebuild the data (`py build_web.py`) whenever you regenerate any field or edit
the registry.

## Presentation (the UX pass, 3 Jul 2026)

Each field renders in its **native form**, not a universal flashcard list
(`FIELD_META` in app.js sets a style + colour + description per field):

- **History → the Grand Timeline + entries**: Ancient + Medieval + Modern merge
  into ONE web field (the Anki decks stay separate). The always-visible timeline
  spans **3200 BCE → today** on a piecewise scale — sparse deep antiquity,
  denser classical world, then the modern era at full resolution — with all
  the entries in one chronology below.
- **Threads → essays**: story cards — headline, body, context, an italic
  *"pulls together"* line, single reading column.
- **People → portrait grid**: real **Wikimedia portraits** (via
  `enrich_portraits.py`, resumable; era-coloured initials as offline/miss
  fallback — 173/174 found), name · role · dates; click to open *what/why*.
- **Economics / Geopolitics → entries**: encyclopedia-style, statement-first,
  two columns; events get a date chip + region; section headers appear only
  when sections are contiguous (chronological decks use the chips instead).
- **Global Trends → dashboard**: before/after indicator charts. It is
  reachable at `fields.html?f=Global Trends`, from the About page's field list
  and via search, but is **not in the header nav or the homepage tiles**
  (`FIELD_META_HIDDEN` in app.js) — parked until it earns a better form.
- **Visual pass**: sticky glass header, cool light/dark palette, gradient
  hero headline, soft card shadows; the **Globe is the atlas's default view**.

Shared: a **field header** (title, description, counts), **section chips**
replacing the old dropdown, and **"see also" trail chips** on every entry —
cross-field related cards computed from shared country mentions (the link
layer made ambient). The homepage opens with a **hero**: the system in one
line, the search as the primary action, and a live-count tile per field.

## The link layer (research tool)

The web analogue of the Obsidian wikilinks, built at build time by
`build_links()` in `build_web.py` (case-sensitive, word-boundary,
longest-first country-name matching + a People region→country table):

- **`data/links.json`** — every card's country mentions + the reverse index.
- **Country dossiers** — each country page grows an **"In this system"**
  section: its people (region-mapped from the People deck) and every card
  across all fields that mentions it, expandable inline (Iran → Cyrus,
  Khomeini, the Iranian Revolution, the Persian Empire, Hormuz, the NPT,
  its Threads fault-line card).
- **Clickable card text** — country names in the fields browser link to
  their country pages.
- **Omnisearch** — `Ctrl+K` (or `/`, or the nav button) anywhere: one search
  over 196 countries, 174 people, all events and every card; results are
  deep links (`fields.html?f=…&q=…` prefills the browser's search).

## The research layer, complete (3 Jul 2026)

The four roadmap features, all live:

- **Grand Timeline + People layer** — the History timeline's *◉ People* toggle
  adds all 174 figures as lifespan bars (colour = section, click → person
  page), and opens the compressed 500–1900 band to real scale so the
  Renaissance cluster (Machiavelli · Dürer · Copernicus…) reads side by side.
- **Person pages** — `person.html?n=<name>`: portrait, role · dates · region,
  section badge, Wikipedia link (canonical URL from `enrich_portraits.py`),
  what/why, **Place** (home-country chips), **Contemporaries** (overlapping
  lifespans, nearest births first — Cyrus shows Confucius, Laozi, Pythagoras),
  and **The world during their life** (History events overlapping the
  lifespan). People-grid names, dossier chips and omnisearch all link here.
- **Map layers** — the atlas toolbar gains *Colour: region | population |
  GDP per capita | area* (7-bin quantile choropleth on both maps, grey =
  no data, legend swaps to a colour ramp) and *⚓ Chokepoints* (the seven
  straits from the Geopolitics deck drawn on the globe; click a marker →
  its card).
- **Explore** (`explore.html`) — the Gapminder view (GDP/capita × population,
  log–log, bubble = area, colour = region, click → country) plus the full
  196-row sortable/filterable table including the fields the UI never showed
  (landlocked, currency, top exports).

## Status

- **All seven fields are on the site** — Geography as a full atlas (196
  countries, 19 regions); History (115 events), People (174 figures),
  Economics (50), Geopolitics (37), Global Trends (15 indicators) and Threads
  (35) as native-form browsers — 426 entries, which correspond to 3,626 Anki
  cards (`data/stats.json` carries the live counts).
- **Two product pages** — `about.html` and `sources.html` — and the data behind
  them (`stats.json`, `sources.json`) were added 4 Sep 2026 with the rebuild
  that brought the atlas in line with the corrected decks of 3 Sep 2026.
- **Credits & licences** (`credits.html`, `data/credits.json`, the footer
  credit line on every page and the per-portrait credit on person pages)
  were added 4 Sep 2026 from the rights audit in `../LICENSING.md`.
- The Geography `*_preview.json` files date from the June 2026 generator run;
  regenerating them needs the network (`../Geography/anki-build/generate_v2.py`).
- Not yet done: country-vs-country compare, and external links out
  (Wikipedia / live Factbook / Our World in Data) from country pages.
