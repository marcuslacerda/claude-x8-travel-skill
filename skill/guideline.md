# Skill guidelines

Deterministic rules the skill follows when researching, generating itineraries, and populating `trip.json` (schema v3). Loaded at the start of `new-trip` and `research`.

---

## Field ownership — skill vs user

Critical rule: certain fields are skill-only, others are user-only. Mixing them creates noise and lost edits.

| Field                               | Skill writes? | User edits? |
| ----------------------------------- | ------------- | ----------- |
| `Place.name/description`            | ✓             | ✓           |
| `Place.geo/category/kind/source`    | ✓             | ✓           |
| `Place.picture/popularity`          | ✓ (auto)      | ✗ (auto)    |
| `Place.googlePlaceId`               | ✓ (auto)      | ✗ (auto)    |
| `Place.priceHint/links`             | ✓             | ✓           |
| `Route.name/mode/polyline/duration` | ✓             | ✗ (regen)   |
| `Route.distance/tags/notes`         | ✓             | ✓           |
| `ScheduleItem.time/placeId/routeId` | ✓             | ✓           |
| `ScheduleItem.name/category`        | ✓             | ✓           |
| `ScheduleItem.cost/duration`        | ✓             | ✓           |
| `ScheduleItem.notes`                | ✓             | ✓           |
| `ScheduleItem.insights[]`           | ✓ (only)      | ✗           |
| `Day.title/cls/dayCost`             | ✓             | ✓           |
| `Day.planB`                         | ✓             | ✓           |
| `Day.insights[]`                    | ✓ (only)      | ✗           |
| `Booking.placeId`                   | ✓ (auto)      | ✗           |

Skill-only Insights and computed fields (picture/popularity/googlePlaceId/polyline) exist to keep edits round-trip safe: skill regenerations don't clobber user notes, and user edits don't get overwritten by stale skill output.

**Picture/popularity/googlePlaceId** are computed via fetchers (cascades documented below). The skill writes them automatically during `new-trip` and `research`. The user doesn't edit them by hand — if a picture URL goes stale or a popularity drifts, the fix is to re-run `/travel-planner research <place>`.

**`notes` (on ScheduleItem)** is free-form per-occurrence context. Both skill and user can write here — it's NOT a user-only sanctuary like v2's `Experience.notes` was. For skill observations that warn or highlight, use **Insights** instead (so the viewer renders them as a yellow callout).

---

## Multi-day stays — schedule reference each day

When suggesting a `stay`-category Place (hotel, camp, apartment) that the traveler occupies for more than one day, **reference the same `placeId` in each day's `schedule[]`**. No `dayNum` field anymore — the viewer derives "which days this place appears on" from the schedule.

```jsonc
// trip.json
{
  "places": [
    {
      "id": "camping-bled",
      "name": "Camping Bled",
      "geo": { "lat": 46.3636, "lng": 14.0938 },
      "category": "stay",
      "kind": "camp",
    },
  ],
  "days": [
    {
      "title": "Day 9 — Arrival at Bled",
      "schedule": [{ "time": "17:00", "placeId": "camping-bled", "cost": 38, "notes": "Check-in" }],
    },
    {
      "title": "Day 10 — Bled lake day",
      "schedule": [
        { "time": "20:00", "placeId": "camping-bled" }, // stay reference
      ],
    },
    {
      "title": "Day 11 — Departure morning",
      "schedule": [{ "time": "08:00", "placeId": "camping-bled", "notes": "Pack + checkout 11h" }],
    },
  ],
}
```

The viewer's "Stay at X" banner is derived from the **last item with a placeId whose place has `category: "stay"`** in the day's schedule.

---

## Place reference vs generic block

A **place reference** points to a real, geocoded Place in `trip.json.places[]`:

```jsonc
{ "time": "09:00", "placeId": "edinburgh-castle", "cost": 17.5, "duration": "PT2H" }
```

- Skill ensures a corresponding Place exists in `places[]` with a kebab-case `id`.
- The viewer hydrates: emoji from `place.kind`, name from `place.name`, description from `place.description`, picture from `place.picture`, popularity from `place.popularity`.
- Per-occurrence overrides: `cost` (real for budget), `duration` (how long), `notes` (this-trip context), `insights[]` (yellow callout).

A **generic block** is a time-block placeholder without a specific location:

```jsonc
{ "time": "13:00", "name": "Almoço livre", "category": "food", "cost": 25 }
```

- No `placeId`/`routeId`. Use for "Lunch break", "Free time", "Coffee stop", "Morning at the beach".
- Skill does NOT create a Place in `places[]` for generic blocks — keeps the catalog clean.
- `category` is optional but useful (renders as a chip in the viewer).

**Discriminator:** the schema requires exactly one of `placeId`, `routeId`, or `name` to be set. Validation fails otherwise.

**When in doubt:** if the user names a venue, it's a place reference; if they just describe an activity slot, it's a generic block.

---

## Insights vs notes

**Insights are skill-generated, never user-edited.** They are observations the skill emits about an item or a day — the viewer renders them as a yellow callout with ✨ highlights and ⚠️ warnings.

### Two placement options

1. **Item-level** (`ScheduleItem.insights[]`): inline below the schedule item it relates to. Use when the observation is about that specific activity.
2. **Day-level** (`Day.insights[]`): callout at the top of the day's schedule. Use when the observation applies to the whole day (weather, lotação geral, transit strike).

The v2 standalone "Insight" schedule item type is gone. There is no `{ "type": "insight", ... }` shape in v3 — insights always live inside another item or at day level.

### When to emit an Insight

- Aggregating reviews from TripAdvisor / AllTrails / Park4Night → `highlights` (consensus positive) or `warnings` (consensus caution).
- Weather analysis → "expect afternoon storms ~14h" (warning).
- Local-knowledge logistics → "parking fills by 9am peak season" (warning).
- Match with `user-preferences.md` → "matches your interest in dramatic landscapes" (highlight).
- Best photo light, golden-hour timing, optimal direction of approach → highlight.

### Insight shape

```jsonc
{
  "highlights": ["Bilhete combinado €18 vale a pena", "Vista do alto melhor pela manhã"],
  "warnings": ["Fechado segundas", "Fila de 45min em junho"],
}
```

At least one of `highlights[]` / `warnings[]` must be non-empty. Empty insights are filtered out by validation.

### Skill never writes to user-edited free text

Notes on schedule items are mixed (both skill and user may write). For purely skill-emitted observations that should render as a callout, always use `insights[]` — not `notes`.

---

## Transfers — the 15-minute rule

Every displacement between two points that takes **more than 15 minutes**, or that requires a vehicle (car, bus, train, ferry, flight), MUST appear as a Route reference in the schedule. Walks under 15 min between adjacent Places may be omitted (implicit walking).

Concretely:

- Distance ≤ 1 km AND on foot → omit (implicit walking, viewer doesn't need a route).
- Distance > 1 km OR duration > 15 min OR mode ≠ WALK → emit a Route + reference it via `schedule[].routeId`.

A schedule item with `routeId` represents the leg starting at `time`. Stack drive-rest-drive sequences as separate route references:

```jsonc
"schedule": [
  { "time": "08:00", "routeId": "milan-to-verona" },     // drive 1
  { "time": "10:30", "placeId": "verona-arena", "duration": "PT1H30M" },
  { "time": "12:30", "routeId": "verona-to-padua" },     // drive 2
  { "time": "14:00", "placeId": "padua-old-town", "duration": "PT2H" }
]
```

---

## Pictures — image fetching cascade

Pictures live on **`Place.picture`** as a structured object — NEVER on `ScheduleItem` or anywhere else. The shape:

```jsonc
"picture": {
  "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/.../1280px-Sirmione.jpg",
  "credit": "Wikimedia Commons / CC-BY-SA",
  "source": "wikipedia"   // "wikipedia" | "google-places" | "official" | "unsplash" | "custom"
}
```

Picture fetching is **mandatory during `new-trip` generation**, not optional. Empty is better than broken, but never skip the attempt — fetch for every Place added to the catalog.

### Cascade (stop at first hit)

1. **Wikipedia og:image** (primary). `curl -sL https://en.wikipedia.org/wiki/<Page_Title>` then extract `<meta property="og:image" content="...">`. Returns a pre-generated 1280px thumbnail at HTTP 200. Set `source: "wikipedia"`, `credit: "Wikimedia Commons"`.

2. **Wikipedia REST API** (fallback). `https://en.wikipedia.org/api/rest_v1/page/summary/<title>` → `thumbnail.source`. Two failure modes:
   - Stale filenames (cached typos, e.g. `Urquhardt_Castle`).
   - Oversize thumbnails (`3840px-`) that may 404. **Mitigation:** replace `/3840px-/` with `/1280px-/` and validate.

3. **og:image from official site**. WebFetch the Place's official URL (from `links[type=official]` or a Tier-1 TravelSource) and extract `<meta property="og:image" content="...">`. Set `source: "official"`.

4. **Unsplash search**. `https://source.unsplash.com/featured/?<name>` returns a free public-domain image. Use when no Wikipedia/official source exists. Set `source: "unsplash"`, `credit: "Unsplash"`.

5. **Skip silently** — leave `picture` undefined. The viewer falls back to a kind emoji.

### Validation gate

Before saving any picture URL: HEAD it — must return HTTP 200 with `content-type: image/*`. If 404/410, drop the URL entirely. If 429 (rate-limited), retry once after 2s before giving up. Never save a URL that hasn't been validated this session.

### Never use

- TripAdvisor user uploads (break weekly, often hot-linked-blocked with 403)
- Google Photos / Instagram / Facebook URLs (private/short-lived signatures)
- Hot-linked images from blogs or tourism aggregators

---

## Popularity score (Wikipedia Pageviews)

For Places that have a Wikipedia entry, populate `Place.popularity` (0–10 decimal) derived from page traffic. Cheap signal of "how known is this place" — helps the traveler prioritize when there are more options than time.

### Cascade

1. **Wikipedia Pageviews API** (primary). For the article title:

   ```
   https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/<title>/monthly/<YYYYMMDD00>/<YYYYMMDD00>
   ```

   Sum `items[].views` over the previous 12 complete months → total annual views.
   `score = min(log10(total), 10.0)`. Round to 1 decimal.

2. **Google ratings fallback** (when `googlePlaceId` is known). Use Google Places `rating` (1–5) and `userRatingCount` to derive a popularity-like value:

   ```
   score = (rating - 1) / 4 * log10(userRatingCount) * 2
   ```

   Clamp to [0, 10]. Less authoritative than Wikipedia (a 4.8/5 restaurant with 100 reviews ≠ a Wikipedia-famous attraction) but useful for places without an article.

3. **Omit** when no signal is available.

### Skip silently

- HTTP 404 — article doesn't exist (typical for restaurants, B&Bs, small viewpoints).
- Total views < 100 — too noisy to be meaningful (`log10 < 2`).
- Title resolves to a redirect or disambiguation page — pick the canonical name first or skip.

### Calibration table (sanity check during review)

| Annual pageviews | Score | Example                            |
| ---------------- | ----- | ---------------------------------- |
| 10,000           | 4.0   | small village, niche trail         |
| 100,000          | 5.0   | regional attraction                |
| 500,000          | 5.7   | famous castle, well-known landmark |
| 1,000,000        | 6.0   | top-tier tourist attraction        |
| 10,000,000       | 7.0   | mega landmark (Vatican, Eiffel)    |

### Conventions

- Always `en.wikipedia` regardless of trip language — international consistency.
- Skill-only field. User never edits manually.
- Score is "frozen" at trip-generation time. The skill recomputes only on full regeneration; small skill edits (research mode) preserve existing scores.
- **v3 note:** popularity lives **only on `Place`** (no longer mirrored on a separate map POI — there is no separate map POI).

---

## googlePlaceId — Google Places matching

When the skill can confidently resolve a Place against Google's catalog, store the `googlePlaceId` (format `ChIJ...`). It unlocks deep-links, photos sync, opening hours, and future drift detection.

### Workflow

1. Call Google Places `findPlaceFromText` with `name + city` (+ `locationBias` 50km from expected geo).
2. Take the top candidate.
3. **Validate proximity:** Haversine distance from `candidate.location` to `place.geo` must be < 100m. If it's farther, the match is ambiguous (different building, wrong city) — discard.
4. Save `googlePlaceId: "ChIJ..."` on the Place.

### When unavailable

Google Maps MCP missing or no match found → leave `googlePlaceId` undefined. The viewer falls back to a search-query deep-link (`https://www.google.com/maps/search/?api=1&query=<name>`).

---

## Routes — encoded polyline + ISO 8601 duration

Routes in `trip.json.routes[]` are stored as **encoded polylines** (Google standard, precision 5) — never as raw `[{lat, lng}]` arrays. Encoded format is ~6× smaller and decodes natively in both viewer renderers (MapLibre + Google Maps).

**Use real polylines from Google MCP, not 2-vertex straight lines.** A trip with synthesized straight-line routes between cities renders as ugly diagonal lines across the country. Always run the cascade for every land-bound leg (DRIVE/WALK/BICYCLE/TRANSIT/TRAIN). FLIGHT and FERRY are the only exceptions (2-vertex is correct — see below).

### Cascade

1. **Google Maps MCP** (preferred — DEFAULT for DRIVE/WALK/BICYCLE/TRANSIT/TRAIN): `mcp__google-maps__maps_directions` with `mode: "driving"` returns `routes[0].polyline.encodedPolyline` — **pass through as a string**, no decoding needed. Yields 200–1500 waypoints per highway leg.
   - **For TRAIN/TRANSIT modes:** still use `driving` mode in the MCP call. Google's driving polyline follows highway corridors that closely approximate shinkansen / intercity rail routes. Perfect-fidelity rail polylines aren't extractable from Directions API; driving-mode is the pragmatic approximation.
   - Use the `duration` from the MCP response (seconds → ISO 8601), and `distanceMeters` directly.
   - **Always run this for every land-bound leg.** Don't ship a trip with synthesized 2-vertex routes for TRAIN/DRIVE/etc. — they look broken on the map.

2. **OSRM public fallback** (when MCP unavailable):

   ```
   https://router.project-osrm.org/route/v1/<profile>/<lng>,<lat>;<lng>,<lat>?overview=full&geometries=geojson
   ```

   Profiles: `driving`, `walking`. Returns `routes[0].geometry.coordinates` as `[lng, lat]` pairs. **Encode** them before saving — use the `@googlemaps/polyline-codec` library (or equivalent) at precision 5. No API key. Throttle to ~1.2s between calls to respect the public rate limit.

3. **FERRY / FLIGHT — 2-vertex is correct.** OSRM doesn't model these, and a real flight/ferry path isn't a road. Synthesize a 2-vertex polyline (`encode([[from.lat, from.lng], [to.lat, to.lng]], 5)`). The viewer renders FLIGHT with a dashed pattern and **hides FLIGHT routes in the overview map** (they'd drag bounds to a different continent — see "Viewer rendering conventions"). FERRY also dashed but visible in overview.

4. **Reverse routes (A→B and B→A).** Don't make 2 separate MCP calls if both directions are needed (the schedule has the round-trip). Fetch the forward direction once, then `decode + reverse + encode` to produce the reverse polyline. Same `distance` and `duration` apply.

5. **On total failure** (network down, OSRM 503, etc.): emit a 2-vertex polyline `encode([[from.lat, from.lng], [to.lat, to.lng]], 5)` as a last resort. Note in the route's `notes` field that the polyline is synthesized and a future `validate-routes` pass should refresh it.

### Required fields

- `id` — kebab-case, unique within `trip.routes[]`.
- `mode` — uppercase: `DRIVE`, `WALK`, `BICYCLE`, `TRANSIT`, `TRAIN`, `FLIGHT`, `FERRY`.
- `polyline` — encoded string (always).
- `duration` — ISO 8601: `PT45M`, `PT2H`, `PT1H30M`. Convert minutes via `PT{h}H{m}M` (drop the H or M when zero).

### Optional fields

- `name` — descriptive: "Sirmione → Veneza (A4)", "Loop Tre Cime di Lavaredo".
- `distance` — meters (integer). Convert from kilometers via `Math.round(km * 1000)`.
- `tags[]` — semantic UI hints. `"highlight"` (thicker line, weight 5), `"scenic"` (slightly thicker, weight 4), `"panoramic"`. Custom tags ignored but preserved.
- `notes` — one-liner context (tolls, ferry timetable, parking notes).

### Quality gate

A properly-encoded highway route produces ≥200 waypoints when decoded. Fewer than 50 = wrong field used or truncated — re-fetch or fall back to OSRM. Validate by decoding (in skill or via `viewer/lib/polyline-decoder.js` ported logic) and counting.

---

## Viewer rendering conventions (what the skill should know)

The static viewer (`viewer/trip.html`) has rendering rules the skill should be aware of when generating trip content. Two specific filters affect what shows on the map vs. the itinerary:

### `kind: "headline"` places are hidden from the map

A Place with `category: "transport", kind: "headline"` represents the **trip's origin** (e.g. home airport). It's referenced from Day 1's schedule for context ("Embarque GRU 18:00"), but its geographic location is **outside the trip's regional scope** — rendering it on the map would drag the bounds to a different continent and clutter the view.

**The viewer filters `kind: "headline"` places out of the map automatically** (see `viewer/lib/route-style.js#mappablePlaces`). The skill should:

- **Still add the origin airport to `places[]`** with `kind: "headline"` — it's referenced by Day 1's schedule item and hydrates the itinerary card.
- **Not worry about it polluting the map** — the viewer handles that.
- Use `kind: "destination"` for the trip's end airport (visible on the map, since it's typically within the destination country).

### FLIGHT routes are hidden in the overview map

The viewer's "Overview" mode of the map (default day-selector value) excludes routes with `mode: "FLIGHT"` (and `mode: "WALK"` — they'd clutter at country zoom). The flight is still visible in the **day view** for the day the flight occurs (when the user selects "Day 1" in the dropdown).

This means:

- **Still emit FLIGHT routes** for international/domestic flights in `routes[]`, with `schedule[].routeId` references on the relevant day.
- **The flight polyline is correctly 2-vertex** (real great-circle paths aren't from Directions API). The dashed render style + overview hiding makes it look intentional.

---

## Pricing & sources

- **Official sites only for prices**. Blogs, "top 10" lists, and tourism articles go stale in months. Confirm prices on the Place's official site or a Tier-1 TravelSource (booking, skyscanner, rome2rio).
- **Validate every `source` URL**: WebFetch the candidate URL — must return content matching the Place's name and location. If 404 or unrelated content, drop the source rather than save a broken link.
- **Reviews**: numeric review scores go in an Insight (highlight if 4.5+, warning context if low) — NOT in `notes`. Example: highlight `"TripAdvisor 4.6/5 (1.2k reviews) — visitors praise X"`.
- **Tickets/reservations**: when a Place has bookable tickets, add a `links[]` entry with `type: "tickets"` pointing to the booking page.
- **priceHint vs cost**: `Place.priceHint` is a reference price (per-person, in trip currency) the skill uses as a budget hint. `ScheduleItem.cost` is the actual cost for THAT occurrence and overrides `priceHint` in the budget calculation.

---

## Weather

**Decision rule by horizon** (count days from today to the target date):

| Horizon   | Source                         | Why                                            |
| --------- | ------------------------------ | ---------------------------------------------- |
| ≤ 16 days | **Open-Meteo** (free, no key)  | Forecast model has skill within this window    |
| > 16 days | **WebSearch** monthly averages | No model has reliable point-forecast skill yet |

Both options are free and require no API key — pick by horizon, not by "what's installed".

### Open-Meteo (≤ 16 days)

Two-step workflow: resolve coords (from `Place.geo` when the user named a catalog place, else geocode), then fetch the forecast.

```bash
# 1. Geocode → lat,lng (if not already in trip.places[])
curl 'https://geocoding-api.open-meteo.com/v1/search?name=Cortina+d%27Ampezzo&count=1'

# 2a. Daily forecast (up to 16 days)
curl 'https://api.open-meteo.com/v1/forecast?latitude=46.5405&longitude=12.1357\
&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max\
&timezone=Europe/Rome&forecast_days=10'

# 2b. Hourly forecast (up to 384h ≈ 16 days) — useful for trekking-day decisions
curl 'https://api.open-meteo.com/v1/forecast?latitude=46.5405&longitude=12.1357\
&hourly=temperature_2m,precipitation,wind_speed_10m&forecast_hours=72'
```

- Always pass `timezone=` matching the destination so daily buckets align with local sunrise/sunset (`Europe/Rome`, `Europe/London`, `America/Sao_Paulo`, `Asia/Tokyo`, etc., or `auto`).
- Prefer `forecast_days=N` for daily summaries; `forecast_hours=N` when you need to advise on a specific window (morning trek, ferry crossing).
- `precipitation_probability_max` feeds Insight warnings — pair with `wind_speed_10m_max` and `temperature_2m_min` to evaluate trekking thresholds.

### WebSearch (> 16 days)

Search format: `weather <region> <month> average` (e.g. "weather Highland Scotland February average"). Pull min/max and rainfall expectations from a climatology source (Wikipedia, Holiday-Weather, official tourism boards). Surface as a single climatology summary rather than per-day forecasts — it's not a real forecast.

### Trekking-day Insight warnings

Per `user-preferences.md` thresholds, emit `Insight.warnings` (at item-level on the trek schedule item) when:

- Thunderstorm probability ≥ 50% combined with temp drop > 5°C in 6h.
- Sustained wind > 30 km/h at altitude.
- Snow possible (temp < 0°C above 1500m).

---

## Currency

**Default**: **Frankfurter** (`frankfurter.dev`) — ECB rates, free, no API key.

```bash
# Latest single-pair rate
curl 'https://api.frankfurter.dev/v1/latest?from=EUR&to=BRL'
# → {"amount":1.0,"base":"EUR","date":"2026-05-06","rates":{"BRL":6.21}}

# Multiple targets in one call
curl 'https://api.frankfurter.dev/v1/latest?from=EUR&to=BRL,USD,GBP'

# Historical rate for a fixed date (when costs were paid earlier)
curl 'https://api.frankfurter.dev/v1/2026-04-15?from=EUR&to=BRL'
```

- Conventions:
  - `base` is always the trip currency (GBP for the UK, EUR for the eurozone, JPY for Japan, …). Convert _to_ the user's home currency from `user-preferences.md`.
  - Cache the rate per session — don't hit the endpoint repeatedly while answering one question.
  - Show 2 decimals for currencies with cents, 0 for JPY/KRW/HUF.
- **Fallback** (Frankfurter 5xx, network down, or unsupported pair like ARS/UYU): WebSearch `"EUR to BRL today"` and use the first major aggregator result (XE, Google Finance, central bank). Note in the response that the rate is from a search, not Frankfurter.
- Trip currency follows the destination — conversion to the user's home currency is a viewer concern; **do not store converted values in `trip.json`**.

---

## Itinerary conventions

- **Day 1 starts with the outbound flight/drive** as a Route reference (`routeId`).
- **Last day ends with the return flight/drive** as a Route reference.
- **Nearest airport**: if `headlineTo` has no commercial airport, suggest the nearest one + a transfer (Route, mode `DRIVE` or `TRAIN`) to the headline city on Day 1.
- **Default cadence**: 4 active days + 1 rest (override via `user-preferences.md`).
- **Drive-time margin**: +30% over Google's estimate for mountain/scenic roads.
- **Budget reserve**: every trip MUST have a `BudgetItem` with `id: "unplanned"`, default 5–10% of total.

---

## Critical bookings

Mark `critical: true` on bookings that sell out or spike in price:

- International flights >2 months in advance
- Cars / motorhomes in high season
- Famous attractions with timed tickets (Vatican, Alhambra, Sagrada Família, Tre Cime parking)
- Ferries (Skye, Lofoten, Fusina-Venezia) on reduced schedules
- Michelin-starred restaurants
- Accommodations during festivals or major events

`status` always starts at `pending`. Only the user flips it to `confirmed` (manually, after they actually book).

**v3:** when a booking corresponds to a Place in the catalog (most accommodations + paid attractions), set `booking.placeId` to anchor it. The viewer hydrates the row with the Place's thumbnail and lets the user click "📍 {place.name}" to focus the pin on the map.

---

## Checklist & packing timeline

Default periods for `checklist[]` groups with `type: "checklist"`:

- 2 months before — flights, motorhomes, insurance, visa
- 1 month before — timed-ticket attractions, car rental, events
- 2 weeks before — restaurants, final weather check, packing list start
- 1 week before — confirmations, offline downloads (maps, docs), online check-in
- Travel day — passport, meds, last weather check
- 1 week after (optional) — reviews, photo backup, expense reconcile

Packing groups have `type: "packing"` — no time periods. Sub-groups by category: Documents, Clothing, Gear, Tech, etc.

---

## i18n & language

- **Enums** (`category`, `kind`, `mode`, `status`, `source`) stay English in JSON. The viewer/explor8 maps them to i18n keys (`categories.attraction` → "Atração" / "Attraction").
- **Free text** (`name`, `description`, `notes`, `title`, `Insight.highlights/warnings`) — single language per trip, matching the user's working language.

---

## Failure modes & graceful degradation

- **Date unknown**: save `startDate` as `YYYY-MM` (month-only). The viewer treats as "indeterminate within this month".
- **No reliable source for a Place**: include the Place without `source`. Add an Insight warning if uncertainty matters.
- **Picture URL doesn't validate**: leave `picture` undefined — viewer falls back to a kind emoji.
- **Coordinates approximate** (small village, no street address): OK — `geo.lat`/`geo.lng` accept rough values. Note the approximation in an Insight if relevant.
- **Route generation fails**: fall back to 2-vertex encoded polyline (`encode([[from], [to]], 5)`).
- **Referential integrity violation** (placeId/routeId points to non-existent id): the schema rejects at validate time with a clear error. Fix the typo, re-emit. Never publish with broken references.
