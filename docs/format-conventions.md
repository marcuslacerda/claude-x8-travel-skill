# Format conventions

This doc consolidates the Markdown, KML, and HTML conventions the skill operates on. The skill expects (and produces) these structures — deviating breaks the parsers.

## journey-plan.md

The source of truth. Long-form Markdown with a 14-section structure:

```
# <Slug> — <Trip Title>
> metadata (status, dates, duration, currency, travelers)

## 1. Flights
## 2. Transport (Car / Motorhome / etc.)
## 3. Route Overview
## 4. Accommodations
## 5. Day-by-Day Itinerary
## 6. Budget Breakdown
## 7. Key Features & Highlights
## 8. Risks & Contingencies
## 9. Distances & Driving Times
## 10. Apps & Links
## 11. Do's & Don'ts — <Region>
## 12. Prep Checklist
## 13. Packing List
## 14. References & Sources
```

The skill's `export` mode parses this to produce `trip.json`. Section headings can be in any language but the order should be stable (the skill identifies sections by position, not by exact heading text).

### Day-by-Day format

Each day is a `### Day N — YYYY-MM-DD — <Title>` heading followed by:

- **Highlight:** one main thing
- Time-blocked schedule (`07:00 — activity`)
- Driving info (`origin → destination, distance, time`)
- Camp / Stay (name + booking)
- Plan B (rain/closure alternative)

### Checklist format

Periods as `### Period Title` headings. Items as `- [ ]` (pending), `- [x]` (done), with `⚠️` prefix marking critical items.

```markdown
### 2 months before

- [x] ✅ Book flights — booking ref [REDACTED]
- [ ] ⚠️ Reserve toll-road tickets (sells out fast)
- [ ] Schedule pet sitter
```

### Packing list format

Categories as `**Emoji Category Name:**` or `### Emoji Category` headings. Items as `- [ ]`. Short items only (the HTML viewer truncates long ones).

### Budget table format

Markdown table with a `Slug` column. Slugs are kebab-case and stable across publishes:

```markdown
| Slug      | Category         | Amount | %   | Status    | Notes       |
| --------- | ---------------- | ------ | --- | --------- | ----------- |
| flights   | Flights          | €4,200 | 35  | confirmed | 2 pax       |
| unplanned | Emergency buffer | €450   | 5   | reserve   | 5% of total |
```

`unplanned` is reserved — every trip must have it.

## journey-map.kml

KML format. Two `<Folder>`s:

- `<Folder><name>...Pontos de Interesse...</name>` (or `...POI...`) → POIs
- `<Folder><name>...Rotas...</name>` (or `...Routes...`) → routes

### POI taxonomy — `(category, kind)`

5 categories × ~25 kinds. `kind` is globally unique, so the KML `<styleUrl>` is single-token (e.g. `#lake`):

| category     | kinds                                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `attraction` | nature, lake, castle, trek, scenic, viewpoint, waterfall, cave, city, vila, unesco, memorial, wellness, adventure |
| `stay`       | hotel, camp, apartment                                                                                            |
| `food`       | restaurant, coffee, bar                                                                                           |
| `shopping`   | shop, market                                                                                                      |
| `transport`  | headline, destination, ferry, parking, station                                                                    |

**`headline` vs `destination`:** `headline` = where the trip starts. `destination` = where it ends. For a roundtrip with the same airport, two POIs share lat/lng but have different ids/descriptions; the parser auto-flips the second occurrence (or anything labeled "Return") to `destination`.

### POI Placemark

```xml
<Placemark>
  <name>Lake Bled</name>
  <description>[Lake] Jun 12 — Pletna boat, wishing bell, 99 steps</description>
  <styleUrl>#lake</styleUrl>
  <Point><coordinates>14.0938,46.3636,0</coordinates></Point>
</Placemark>
```

KML coordinates are `lng,lat,alt` (alt usually `0`). The parser flips to `lat,lng` internally.

### Route Placemark

```xml
<Placemark>
  <name>Jun 9 (Tue): MXP → Venezia (A4 east, 308km ~3h19 base / ~4h19 +30%)</name>
  <styleUrl>#route-orange</styleUrl>
  <LineString>
    <coordinates>8.7603,45.6197,0 8.7700,45.6300,0 ...</coordinates>
  </LineString>
</Placemark>
```

Route styles defined once in the document head:

```xml
<Style id="route-orange">
  <LineStyle>
    <color>ff0078ff</color>             <!-- aaBBGGRR (KML byte order) → #FF7800 -->
    <width>4</width>
  </LineStyle>
</Style>
```

The parser converts `aaBBGGRR` → `#RRGGBB`. Routes without a matching `route-*` style render gray (`#888888`).

### Route name format

Route popups split `route.name` on the **first `:`** and render `head` (bold) + `body` (regular):

```
<Header>: <Body>
```

**Recommended:**

- Header: `Jun 11 (Thu)` or `Day 7` (parsed for dayNum)
- Body: `Cortina → Postojna (Tarvisio pass, 295km ~3h45 base / ~4h52 +30%)`

Two parseable header formats:

- `Mon DD (Day): ...` — date + day-of-week, resolved against `trip.startDate`
- `Day N: ...` — explicit dayNum

Routes without a parseable prefix get `dayNum: undefined` (trip-wide overview).

### Stable IDs

The parser auto-generates POI/route ids from the name (kebab-case + numeric suffix on collision: `lago-di-garda`, `lago-di-garda-2`). Once an id lives in `map.json`, treat it as immutable — renaming or moving the POI is fine, but don't change the id. The future chat tool will reference POIs by id.

### Source provenance

Every POI/route has `source: 'advisor' | 'chat' | 'ui'` (defaults to `advisor` from KML). Currently advisor-only; the field is reserved for future chat-driven mutations.

### Legacy KML compatibility

Existing KMLs with old single-token style ids (`#lago`, `#castelo`, `#basecamp`, `#start-end`, etc.) keep working — the parser maps them to the new `(category, kind)` automatically (see `cli/lib/map-taxonomy.ts`'s `LEGACY_TO_NEW`). New POIs should use the new kind names.

## journey.html

Self-contained HTML viewer generated by the skill's `build-site` mode from `journey-plan.md`. Key conventions:

- Design system via CSS variables in `:root` (customize palette per trip)
- Typography: Playfair Display (headings) + Inter (body)
- Three top-level data arrays:

```js
const days = [
  {
    num: 1,
    title: "Pickup → Bolzano",
    tags: ["start", "drive"],
    cls: "drive-day",
    schedule: [{ t: "09:00", a: "MXP pickup" }],
    experiences: [{ name, desc, category, time, cost, links: [] }],
    driving: "MXP → Bolzano (A4 east, 308km ~3h19)",
    restaurant: { name, meal, desc, url },
    warnings: ["..."],
    dayCost: "€80",
    camp: "Camping XYZ",
  },
  // ...
];

const checklistGroups = [
  { title: "2 months before", items: [{ id: "c-flights", text: "Book flights", done: true }] },
];

const packingGroups = [
  { title: "🎒 Documents", items: [{ id: "p-passport", text: "Passport — valid 6+ mo" }] },
];
```

**Day-level dates (`isoDate`, `date`) are derived at render time from `trip.startDate + index`** — don't bake them into the static `const`.

The viewer persists checkbox state in `localStorage` keyed by item `id`. Changing an id resets state — preserve ids across edits.

## Sensitive data

Treat `journey-plan.md` as private; treat HTML/JSON as semi-public:

- ✅ Stays in `.md` only: booking confirmation codes, passenger document numbers, personal IDs, emergency contacts, frequent-flyer numbers, financial-personal context (e.g. "X% of monthly income")
- ✅ OK in HTML/JSON: flight numbers, schedules, hotel addresses, business phone numbers, public booking links
- ✅ OK in KML: GPS coordinates of named landmarks, public business names

When sanitizing for public release: see [`../CONTRIBUTING.md`](../CONTRIBUTING.md) and the grep gate.
