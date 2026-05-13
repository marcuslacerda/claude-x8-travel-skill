---
name: travel-planner
description: "Plan multi-day, multi-stop trips through an opinionated wizard + research workflow. Generates a single structured trip.json (schema v3 — places + routes + days) that renders in a local static viewer (viewer/trip.html?slug) and optionally publishes to explor8.ai. Modes: use/context (set active trip), new-trip (8-question wizard + research), research (deep-dive on POIs/trails/restaurants), checklist (prep timeline status), budget (cost analysis), weather (open-meteo forecast), validate-routes (Google Maps audit), map (place/route advisory edits on trip.json). Trip context required for all modes except `use` and `new-trip` — set once per session via /travel-planner use <slug>."
---

# Travel Planner

A planning workflow for trips that don't fit a one-shot itinerary generator: long-form (1–4 weeks), multi-stop, with rooms for trekking, motorhome, off-grid, and city legs. The output is a single structured JSON file (`trip.json`, schema v3) that renders locally via a static viewer in this repo and can optionally publish to [explor8.ai](https://explor8.ai).

The skill (you, here, in Claude Code) handles the LLM-driven parts — the wizard, research, populating JSON. The companion CLI `x8-travel` handles the deterministic-code parts (schema validation, HTTP publish).

## What this skill is NOT

- Not a discovery feed. It doesn't browse "places to go" — bring your own destinations or describe what you want.
- Not a booking engine. Bookings stay manual; the skill tracks deadlines and surfaces critical reservations.
- Not a TripAdvisor replacement. It uses TripAdvisor / AllTrails / Booking / Park4Night as link sources, not as a backend.
- Not opinionated on language. Write `trip-params.md` and `notes` fields in any language; enums (categories, kinds, modes) stay in English.

---

## Repository conventions

Trips live under `trips/` (gitignored — personal data). Inside:

```
trips/
  user-preferences.md            # shared across every trip — read by new-trip
  <slug>/
    trip-params.md               # this trip's wizard answers
    trip.json                    # canonical v3 document (skill-generated)
    publish.json                 # output of `x8-travel build` (when publishing)
```

**Schema v3 (single document):** `trip.json` contains a top-level **catalog of `places[]` and `routes[]`**. The day-by-day schedule references catalog entries by `placeId` / `routeId` — no more inlined place data, no separate `map.json`. Field shapes:

- `places[]` — Place catalog: `id`, `name`, `geo {lat,lng}`, `category`, optional `kind`/`googlePlaceId`/`popularity`/`description`/`picture`/`links`/`priceHint`.
- `routes[]` — Route catalog: `id`, optional `name`, `mode` (uppercase: DRIVE/WALK/BICYCLE/TRANSIT/TRAIN/FLIGHT/FERRY), encoded `polyline` (Google algorithm, precision 5), ISO 8601 `duration` (e.g. `PT45M`), optional `distance` (meters), optional `tags[]`.
- `days[]` — array index IS the day number (Day 1 = `days[0]`). Each day: `title`, `schedule[]`, optional `insights[]` (day-wide), optional `planB`.
- `days[].schedule[]` — ordered intra-day timeline. Each item: `time` ("HH:MM") + one of (`placeId` | `routeId` | `name`) + optional `cost`/`duration`/`notes`/`insights[]`.

**Source of truth:**

- `trips/user-preferences.md` — facts about the traveler(s): cadence, budget ranges, interests, dietary, drive margins.
- `trips/<slug>/trip-params.md` — facts specific to one trip (origin, headline-to/from, duration, transport, constraints).
- `trips/<slug>/trip.json` — the structured plan. The viewer and explor8 read from this. Skill keeps it in sync as plans evolve.

**Reference docs the skill loads at the start of `new-trip` and `research`:**

- `skill/guideline.md` — planning rules (field ownership, picture/popularity/route strategies, 15-min Transfer rule, Insight semantics, MCP preferences).
- `skill/sources-travel-experience.md` — catalog of the 26 travel sources behind the `TravelSource` enum.

---

## Trip Context (Session State)

Every invocation operates within a **trip context** — the slug the skill acts on (e.g. `scotland-2027`). Context resolution priority:

1. **Inline override** — slug in the command (e.g. `/travel-planner checklist scotland-2027`). One-shot.
2. **Conversation memory** — if `use` was run earlier this session, remember it.
3. **Context file** — `.claude/travel-context` (plain text). Persists across conversations on the same machine.

A valid context is `trips/<slug>/` containing `trip-params.md` and `trip.json` (or just `trip-params.md` for a fresh trip mid-wizard).

**Always show the context banner at the top of every response:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗺️  Trip context: scotland-2027
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If no context is resolved and the mode requires one, prompt the user to set it (`/travel-planner use <slug>`) or list available slugs from `trips/*/`.

### Context required by mode

| Mode                  | Context required? | Notes                                                            |
| --------------------- | ----------------- | ---------------------------------------------------------------- |
| **use** / **context** | No                | Sets or shows the active context                                 |
| **new-trip**          | No (creates new)  | Slug is required parameter; auto-sets context after creation     |
| **research**          | Yes               | Inline override OK                                               |
| **checklist**         | Yes               | Reads `trip.json.checklist`                                      |
| **budget**            | Yes               | Reads `trip.json.budget`                                         |
| **weather**           | Yes               | Reads coords from `trip.json.places[].geo`                       |
| **validate-routes**   | Yes               | Reads `trip.json.routes[]` (uppercase modes, ISO 8601 durations) |
| **map**               | Yes               | Edits `trip.json.places[]` / `trip.json.routes[]`                |

---

## Modes

Parse user intent → match to mode below. If ambiguous, show the help menu:

```
🗺️  Trip context: {active or "none"}

## Travel Planner — Available modes

| Mode                  | Purpose                                                           |
|-----------------------|-------------------------------------------------------------------|
| **use <slug>**        | Set the active trip                                               |
| **new-trip <slug>**   | Wizard + research → generate trip.json (v3)                       |
| **research**          | Deep-dive on a destination, trail, campground, restaurant         |
| **checklist**         | Status of prep vs today — flag overdue & critical                 |
| **budget**            | Cost analysis with breakdown and conversion                       |
| **weather**           | Forecast for trip locations                                       |
| **validate-routes**   | Audit driving times against Google Maps                           |
| **map**               | Manage places and routes (advisory)                               |

### Examples
- /travel-planner use scotland-2027
- /travel-planner new-trip iceland-2028
- /travel-planner checklist
- /travel-planner weather Edinburgh
- /travel-planner budget
- /travel-planner map add-route day 5: Verona -> Bolzano DRIVE
- /travel-planner map add-place Refugio Auronzo no dia 8  && add-route no dia 8 de Cortina d'Ampezzo até Refugio Auronzo de carro com tag scenic
Obs: use dry-run to check diff only before applying the changes
```

If the user provides a clear request, skip the help and go straight to the matching mode.

---

### Mode 0: `use` / `context` — Set or view the active trip

**Trigger:** "use <slug>", "context", "which trip", "switch trip"

**Workflow:**

1. If a slug is provided:
   - Validate `trips/<slug>/` exists.
   - Write the slug to `.claude/travel-context`.
   - Show the context banner.
2. If no slug, show the current context and list available trips (subdirectories of `trips/` containing `trip-params.md`).
3. If the slug doesn't match, show error + list options.

---

### Mode 1: `new-trip <slug>` — Plan a new trip from scratch

**Trigger:** "plan trip", "new trip", "next trip", destination + dates

**Required parameter:** `<slug>` — kebab-case (e.g. `scotland-2027`, `iceland-2028`). Pattern: `{destination}-{year}`.

**Workflow:**

1. **Validate slug.** Refuse to overwrite an existing non-empty `trips/<slug>/`.
2. **Read `skill/guideline.md`** to anchor planning rules. Read `skill/sources-travel-experience.md` for source choices.
3. **Read `trips/user-preferences.md`** if it exists. If not, copy from `templates/user-preferences.example.md` to `trips/user-preferences.md` and walk the user through filling it (extra wizard step, one time only).
4. **Run `x8-travel init <slug>`** from Bash to scaffold `trips/<slug>/trip-params.md`. (Or scaffold by hand if Bash isn't available.)
5. **Wizard — Batch 1 (4 questions via AskUserQuestion):**
   - **Origem** — origin city (e.g. "São Paulo")
   - **Headline-to** — primary destination (e.g. "Edinburgh")
   - **Headline-from** — return point — usually equal to origin
   - **Duração** — number of days
6. **Wizard — Batch 2 (4 questions via AskUserQuestion):**
   - **Data ou mês** — start date (`YYYY-MM-DD` if known, else `YYYY-MM` for month-only, or "flexível, qualquer mês")
   - **Modo de transporte primário** — car / motorhome / flights+train / ferry / mixed
   - **Tipo da viagem** — city break / road trip / trekking / off-grid / mix
   - **Moeda de exibição** — the traveler's home/preferred currency for viewing costs and budget. Offer 3–4 options derived from `user-preferences.md` + "Same as destination". → `trip.homeCurrency` (omit field if same as `currency`).
7. **Open question (free text):** "Tem algo a mais que devo considerar pra essa viagem? (constraints especiais, pets, crianças, mobilidade, drone, dieta, etc.)"
8. **Persist answers** to `trips/<slug>/trip-params.md` (fill the template's placeholders).
9. **Research** using WebSearch + Google Maps MCP (if available) + Open-Meteo for weather + Frankfurter for currency, following `skill/guideline.md`. For each candidate place: populate `geo`, `picture` (Wikipedia → og:image → Unsplash cascade), `popularity` (Wikipedia Pageviews → Google ratings fallback), `googlePlaceId` (Google Places match when confident). For routes: prefer Google Maps Directions `overview_polyline.points` (keep ENCODED — don't decode); OSRM public fallback (encode result before saving).
10. **Generate `trips/<slug>/trip.json`** following `TripSchema` v3:
    - `schemaVersion: 3` (literal).
    - `slug`, `title`, `destination: { startLocation, headlineTo, headlineFrom }`.
    - `startDate`: ISO `YYYY-MM-DD` or `YYYY-MM` (or omit if flexible).
    - `currency`: destination currency (EUR for Italy, GBP for UK, JPY for Japan, …).
    - `homeCurrency`: traveler's display currency — omit if same as `currency`.
    - `status: "draft"` initially; user flips to `planned` once ready.
    - `places[]` — Place catalog (one entry per real, geocoded location referenced in the trip). Every Place referenced from `schedule[].placeId` MUST exist here. See "Place catalog" below for shape.
    - `routes[]` — Route catalog (one entry per leg with a polyline). See "Route catalog" below. `mode` is uppercase (DRIVE/WALK/BICYCLE/TRANSIT/TRAIN/FLIGHT/FERRY); `polyline` is encoded; `duration` is ISO 8601.
    - `days[]` — array index = day number (Day 1 = `days[0]`). Each day has `title`, `schedule[]`, optional `cls`/`planB`/`dayCost`/`insights[]`.
    - **Insights placement (default item-level):** For each Place referenced in `schedule[]`, consider 1+ item-level insights (`scheduleItem.insights[]`) when there's an actionable observation — timing, ticket strategy, etiquette, dietary hazard, photo angle, weather contingency. Day-level (`day.insights[]`) only for genuinely whole-day context (weather forecast, jet lag, transit-wide policies). See `guideline.md` "Insights vs notes" decision rule. **When in doubt: item-level.**
    - **Never write `scheduleItem.notes`** — that's user-only. The traveler adds personal annotations there later (while reviewing in explor8). All skill-emitted per-occurrence content goes into `insights[]`.
    - `bookings[]` — critical reservations, status `pending` initially. Optional `placeId` references a Place from the catalog (viewer hydrates the row with the place's thumbnail).
    - `budget[]` — enum categories; must include one item with `id: "unplanned"` (5–10% reserve).
    - `checklist[]` — groups with `type: "checklist"` (period titles) + `type: "packing"` (category titles).
11. **Validate** via the bundled CLI: `pnpm exec tsx cli/index.ts validate <slug>` (or installed `x8-travel validate <slug>`). Referential integrity is enforced — every `schedule[].placeId`/`routeId` AND every `bookings[].placeId` must resolve.
12. **Update the trips manifest** at `trips/trips-index.json`:
    - Read the file (create as `[]` if missing).
    - If `<slug>` is not in the array, append and sort alphabetically.
    - Write back as a JSON array (e.g. `["scotland-2027", "iceland-2028"]`).
    - The local viewer's `index.html` reads this file to list available trips. Without it, the trip won't show on the landing page (though the direct URL `viewer/trip.html?slug=<slug>` still works).
13. **Auto-set context:** write `<slug>` to `.claude/travel-context`.
14. **Show banner** with next step:

    ```
    ✅ trips/scotland-2027/ generated.

    Visualize locally:
      python3 -m http.server 8000
      open http://localhost:8000/viewer/trip.html?slug=scotland-2027

    Optional publish (requires EXPLOR8_PUBLISH_TOKEN):
      x8-travel publish scotland-2027
    ```

> **Important:** the wizard is the only point where the skill asks structured questions. After this, edits happen by user instruction or in other modes (research, map, etc.) — never bring the user back into the wizard.

#### Field ownership — skill writes vs user edits

| Field                               | Skill writes? | User edits? |
| ----------------------------------- | ------------- | ----------- |
| `Place.name/description`            | ✓             | ✓           |
| `Place.geo/category/kind/source`    | ✓             | ✓           |
| `Place.picture/popularity`          | ✓ (auto)      | ✗ (auto)    |
| `Place.googlePlaceId`               | ✓ (auto)      | ✗ (auto)    |
| `Place.priceHint/links`             | ✓             | ✓           |
| `Route.name/mode/polyline/duration` | ✓             | ✗ (regen)   |
| `Route.notes/tags`                  | ✓             | ✓           |
| `ScheduleItem.time/placeId/routeId` | ✓             | ✓           |
| `ScheduleItem.cost`                 | ✓             | ✓           |
| `ScheduleItem.notes`                | ✗             | ✓ (only)    |
| `ScheduleItem.insights[]`           | ✓ (only)      | ✗           |
| `Day.insights[]`                    | ✓ (only)      | ✗           |
| `Day.planB`                         | ✓             | ✓           |

Skill-only Insights and computed fields (picture/popularity/googlePlaceId) exist to keep edits round-trip safe: skill regenerations don't clobber user notes, and user edits don't get overwritten by stale skill output.

---

### Mode 2: `research` — Deep-dive on a topic

**Trigger:** "research", specific question about a destination/trail/campground/restaurant

**Workflow:**

1. Use WebSearch + Google Maps MCP to gather current info.
2. Apply `skill/guideline.md` rules (official prices, validate URLs, picture cascade).
3. Output as a structured Markdown answer, AND propose specific edits to `trips/<slug>/trip.json`:
   - **New place** → append to `places[]` with a stable kebab-case `id`. Populate `geo`/`picture`/`popularity`/`googlePlaceId` via the cascades documented in `guideline.md`.
   - **New leg** → append to `routes[]` with encoded `polyline` (always encoded), `mode` (uppercase), ISO 8601 `duration`, optional `distance` (meters).
   - **New schedule slot** → insert into the right `days[N].schedule[]` array. Use `placeId`/`routeId` to reference catalog entries; use `name` only for generic time-blocks (Lunch break, Free time).
   - **Per-item insight** → add to `scheduleItem.insights[]` (NOT a separate schedule entry).
4. For each new Place, populate the **research cascades** in order (stop at first hit):
   - **Picture** — Wikipedia og:image → Wikipedia REST `pageimages` (1280px variant) → official site `og:image` → Unsplash search → skip.
   - **Popularity** — Wikipedia Pageviews API (`min(log10(annual_views), 10.0)`) → Google ratings fallback when `googlePlaceId` known → omit.
   - **Geo** — Google Places `location` (when googlePlaceId known) → Google Geocoding `findPlaceFromText` → Nominatim (OpenStreetMap) → skip place.
   - **googlePlaceId** — `findPlaceFromText` with name + city + `locationBias` 50km from expected geo. Validate the result's location is <100m (Haversine) from `place.geo`; discard if it diverges. Format `ChIJ...`.
5. After confirming with the user, apply edits via Edit tool. Re-run `validate` to confirm referential integrity holds.

---

### Mode 3: `checklist` — Manage prep timeline

**Trigger:** "checklist", "prep", "what's pending", "status"

**Workflow:**

1. Read `trips/<slug>/trip.json`, find groups in `checklist[]` where `type === "checklist"`.
2. For each group, parse the title — convention is time-based ("2 months before", "1 week before", "Travel day"). Compute the period's window relative to `trip.startDate`.
3. Compare against today:
   - **Overdue:** items in past periods still `status: "pending"`
   - **Current:** items in the current period
   - **Upcoming:** items in future periods
4. Surface critical items prominently.
5. Present a status summary:

   ```
   ## Prep Status (today: 2026-05-07 — trip starts 2027-02-14)

   🟢 Future periods (9 months out):
     - 2 months before:  6 items (1 critical: ⚠️ ferry to Skye)
     - 1 month before:   8 items
     - 1 week before:    4 items

   No overdue items yet.
   ```

6. Let the user mark items done by saying "mark X as done". Apply via Edit tool to `trip.json`. Re-validate.

---

### Mode 4: `budget` — Budget analysis

**Trigger:** "budget", "how much", "costs"

**Workflow:**

1. Read `trip.json.budget`. Enum categories: flights, accommodations, fuel, insurance, food, attractions, shopping, transportation, entertainment, unplanned.
2. Compute total + per-category percentage. Cross-check that `pct` fields sum to 100 (warn if drift).
3. Verify `unplanned` exists (every trip must have it — emergency buffer 5–10%).
4. Present a summary:
   - Total in trip currency + user's home currency. Convert via **Frankfurter** (free, no key, ECB rates):
     ```
     https://api.frankfurter.dev/v1/latest?from=<TRIP_CCY>&to=<HOME_CCY>
     ```
     Cache the rate for the session — don't refetch per category. If Frankfurter is unreachable or the pair isn't supported, fall back to WebSearch (`"<TRIP_CCY> to <HOME_CCY> today"`) and note the rate source. Full reference in `skill/guideline.md` "Currency".
   - Breakdown by category with % and status (paid / confirmed / estimated / reserve)
   - Daily average per person
   - Compare to `user-preferences.md` ranges if defined
5. For specific cost questions, research current prices via WebSearch (official sites only, per guidelines).

---

### Mode 5: `weather` — Forecast for trip locations

**Trigger:** "weather", "forecast", "will it rain"

**Decision rule by horizon** (full reference in `skill/guideline.md` "Weather"):

| Horizon   | Source                                                             |
| --------- | ------------------------------------------------------------------ |
| ≤ 16 days | **Open-Meteo** (`api.open-meteo.com`) — daily + hourly, no API key |
| > 16 days | **WebSearch** monthly averages — no model has reliable skill yet   |

**Workflow:**

1. Parse user input for location + date range. Default = next upcoming days based on context.
2. **Resolve coordinates**:
   - If the user named a Place from the catalog, use `trip.places[<id>].geo`.
   - Otherwise geocode the typed name via Open-Meteo's free geocoder:
     ```
     https://geocoding-api.open-meteo.com/v1/search?name=<URL-encoded>&count=1
     ```
   - Use Google Maps MCP only if already installed and you need higher precision (e.g. specific trailhead vs town center).
3. **Fetch weather** based on horizon:
   - **≤ 16 days** — Open-Meteo daily + hourly endpoints (see `guideline.md` for full URL parameters; always set `timezone=` to destination zone or `auto`).
   - **> 16 days** — WebSearch `"weather <region> <month> average"`. Present as climatology, not a forecast.
   - Google Maps MCP `mcp__google-maps__maps_weather` is a fine substitute when installed.
4. Present in travel-friendly format:

   ```
   ## Forecast — Skye, Scotland (next 5 days)

   | Day | Temp | Conditions | Wind | Rain | Trekking alert |
   |-----|------|------------|------|------|----------------|
   | Mon | 4–9°C | ☁️ Overcast | 22 km/h | 30% | ✅ OK |
   | Tue | 2–7°C | 🌧️ Rain | 35 km/h | 80% | ⚠️ Avoid coast |
   ```

5. Trekking alerts (per `skill/guideline.md`):
   - **⚠️ Thunderstorm likely:** temp drop + high humidity + wind shift after 12h
   - **⚠️ High wind:** >30 km/h at altitude
   - **❄️ Snow possible:** temp <2°C above 1500m

---

### Mode 6: `validate-routes` — Audit driving times against Google Maps

**Trigger:** "validate routes", "check driving times", "are the times right?"

**Prerequisite:** Google Maps MCP. Without it this mode is unavailable — prompt user to install or skip.

**Workflow:**

1. Read `trip.json.routes[]`, focus on `mode: "DRIVE"` entries.
2. For each, derive the geographic origin/destination from the polyline's first/last vertex (decode via `viewer/lib/polyline-decoder.js` algorithm) — OR, when the matching `Place.geo` from `schedule[].placeId` adjacent items is more accurate, use that.
3. Call `mcp__google-maps__maps_directions` with `from.lat,from.lng` → `to.lat,to.lng`.
4. Compare returned distance/duration to the Route's stored values. Apply +30% margin for mountain/scenic roads.
5. Present a validation report:

   ```
   ## Route Validation

   | Day | Route | Stored | Google | +30% | Status |
   |-----|-------|--------|--------|------|--------|
   | 3 | edinburgh-to-inverness | PT3H, 250km | PT3H12M, 252km | PT4H10M | ✅ OK |
   | 7 | glencoe-to-skye | PT2H30M, 180km | PT2H45M, 195km | PT3H35M | ⚠️ stored low by ~15min |
   ```

6. If the user confirms, apply Edit tool to `trip.json.routes[<id>]`:
   - Update `polyline` (encode the Google `overview_polyline.points` — DO NOT store decoded coords).
   - Update `duration` to ISO 8601 (`PT3H12M`, `PT45M`).
   - Update `distance` to meters (km × 1000).
7. Re-run `validate`.

---

### Mode 7: `map` — Manage places and routes (advisory)

**Trigger:** "map", "validate map", "add place", "add route", "update route"

**Purpose:** edit `trip.json` directly — specifically the top-level `places[]` and `routes[]` arrays (the catalogs the schedule references). Skill computes the right object shape, validates against `TripSchema` v3, applies via Edit tool.

> v3 note: there is no separate `map.json` anymore. All map data is in `trip.json` at the top level.

#### `validate` — Lint the current trip.json

Run `pnpm exec tsx cli/index.ts validate <slug>`. Report counts (places, routes, days, scheduled vs idea places) and surface zod issues (orphan placeId/routeId, missing required fields, malformed time/duration).

#### `add-place <name>` — Add a new Place to the catalog

1. Geocode the name via the cascade (Google Places when MCP available → Google Geocoding → Nominatim).
2. Pick `(category, kind)` from the taxonomy table below.
3. Pick `source` from `TravelSource` enum based on what type of source applies (e.g. trekking → `alltrails`; restaurant → `tripadvisor` or `thefork`; campground → `park4night`).
4. Populate `picture` via the cascade in `guideline.md`. Validate URL with HEAD before saving (must return HTTP 200 + `content-type: image/*`).
5. Populate `popularity` via Wikipedia Pageviews if the place has a Wikipedia article.
6. Try to resolve `googlePlaceId` via Google Places `findPlaceFromText` + Haversine validation (<100m from geo).
7. Generate stable kebab-case `id` from the name (numeric suffix on collision: `lago-di-garda` → `lago-di-garda-2`).
8. Apply via Edit tool to `trip.json.places[]`.
9. If applicable, also add a `schedule[]` item referencing the new placeId in the appropriate day.
10. Run `validate`.

#### `add-route <day>` — Add a new route to the catalog

1. Get road-following coordinates via Google Maps MCP `maps_directions` (preferred) → OSRM fallback.
2. Encode the polyline (keep ENCODED — don't store raw `[{lat,lng}]` arrays). Google MCP returns `overview_polyline.points` already encoded — pass through.
3. Set `mode` (uppercase: DRIVE/WALK/...), `duration` (ISO 8601: `PT45M`/`PT2H30M`), `distance` (meters).
4. Optional `tags[]`: `"scenic"` (panoramic stretches), `"highlight"` (must-drive). Surfaces in viewer as thicker/brighter line.
5. Optional `notes` for one-liner context (tolls, ferry timetable, parking notes).
6. Generate kebab-case `id`. Append to `trip.json.routes[]`.
7. Add a `schedule[]` item with `routeId` in the day where the leg happens.
8. Run `validate`.

#### `update-route <id>` — Refresh a route's polyline (e.g. after `validate-routes`)

1. Identify the matching `Route` by `id` or `name`.
2. Get fresh `overview_polyline.points` from Google Maps MCP.
3. Update `polyline` field (encoded), `duration` (ISO 8601), optional `distance` (meters).
4. Apply via Edit tool.
5. Run `validate`.

---

## Place catalog (v3)

`trip.json.places[]` validates against `PlaceSchema`. The shape:

```ts
{
  id: kebab-case,
  name: string,
  geo: { lat: number, lng: number },
  category: "attraction" | "stay" | "food" | "shopping" | "transport" | "custom",
  kind?: ExperienceKind,          // 28 values across categories
  googlePlaceId?: "ChIJ...",       // when known
  popularity?: number,             // 0–10, min(log10(annual_views), 10)
  source?: TravelSource,           // 26 platforms (alltrails, booking, ...)
  description?: string,
  picture?: { url, credit?, source? },
  links?: { type, url }[],
  priceHint?: number,              // reference price (per-person, trip currency)
}
```

### Place taxonomy — `(category, kind)`

5 categories (+ `custom`) × 28 kinds. `kind` is globally unique, so a Place's category is derivable.

| category     | kinds                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `attraction` | nature, lake, castle, trek, scenic, viewpoint, waterfall, cave, city, town, vila, unesco, memorial, wellness, adventure |
| `stay`       | hotel, camp, apartment                                                                                                  |
| `food`       | restaurant, coffee, bar                                                                                                 |
| `shopping`   | shop, market                                                                                                            |
| `transport`  | headline, destination, ferry, parking, station                                                                          |
| `custom`     | (open — kind optional)                                                                                                  |

**`town` vs `vila`:** `town` is canonical (clearer name; matches Google `locality`); `vila` is kept for legacy/migrated trips. Prefer `town` in new content.

**`headline` vs `destination`:** `headline` = trip start; `destination` = trip end. Roundtrips have two Places — same lat/lng, different `id`s and descriptions.

### Stable IDs

Every Place and Route has a kebab-case `id` (regex `^[a-z0-9][a-z0-9-]*$`). Generate from name with numeric suffix on collision. **IDs are immutable** — renaming is fine; changing the id breaks every `placeId`/`routeId` reference.

### Day binding (v3 — derived, not stored)

Place's "which days it appears on" is **derived from `days[].schedule[].placeId`**, not stored on the Place itself. There is no `dayNum` field anymore. Multi-day stays work by referencing the same `placeId` in each day's schedule (skill emits a `placeId` reference at checkout/check-in/stay times).

The viewer computes `placeToDays` once per trip and uses it for day-filter behavior.

---

## Route catalog (v3)

`trip.json.routes[]` validates against `RouteSchema`. The shape:

```ts
{
  id: kebab-case,
  name?: string,
  mode: "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT" | "TRAIN" | "FLIGHT" | "FERRY",
  polyline: string,        // Google encoded (precision 5)
  duration: "PT1H30M",     // ISO 8601
  distance?: number,       // meters
  tags?: string[],         // "scenic" | "highlight" | "panoramic" | ...
  notes?: string,
}
```

### Travel modes (unified)

Uppercase enum. Single source for both schedule references and map rendering. The viewer derives color and stroke from mode + tags:

| Mode      | Default color | Use case                               |
| --------- | ------------- | -------------------------------------- |
| `DRIVE`   | #4477aa       | Car / motorhome / private vehicle      |
| `WALK`    | #228833       | Foot                                   |
| `BICYCLE` | #88aa22       | Bike                                   |
| `TRANSIT` | #aa4488       | Bus / metro / mixed local transit      |
| `TRAIN`   | #aa6644       | Intercity rail / shinkansen / Eurostar |
| `FLIGHT`  | #cc4400       | Commercial / charter flight            |
| `FERRY`   | #44aaff       | Sea / lake ferry                       |

### Polyline format

Encoded string, Google's standard algorithm at precision 5 (~1.1m resolution). **NEVER store raw `[{lat,lng}]` arrays** in v3.

- Google Maps Directions API returns `overview_polyline.points` already encoded — pass through.
- OSRM returns GeoJSON LineString coords; encode them before saving via the `@googlemaps/polyline-codec` library (CLI uses this) or equivalent.

### Tags

Optional `tags[]` semantically modifies the line's visual weight:

- `"highlight"` — thicker (weight 5), full opacity. For must-drive legs (passo Sella, North Coast 500).
- `"scenic"` — slightly thicker (weight 4). Panoramic stretches.
- Custom tags ignored by the viewer but preserved for documentation.

---

## Schedule items (v3)

Each `days[N].schedule[i]` is one of three shapes:

1. **Place reference:** `{ time, placeId, cost?, duration?, notes?, insights? }`
   - Viewer hydrates: emoji from `place.kind`, name from `place.name`, description from `place.description`, picture from `place.picture`, popularity from `place.popularity`.
   - `cost` overrides `place.priceHint` for this specific occurrence (budget reads `cost`).
   - `duration` ISO 8601 — how long the activity lasts.
2. **Route reference:** `{ time, routeId, cost?, notes?, insights? }`
   - Viewer renders: emoji from `route.mode`, name from `route.name`, duration + distance from `route.duration`/`route.distance`.
3. **Generic block:** `{ time, name, category?, cost?, duration?, notes?, insights? }`
   - No catalog reference. Use for time-blocks like "Almoço livre", "Manhã livre", "Café da manhã no hotel".
   - `category` is optional but useful (the viewer shows it as a chip).

`insights?: Insight[]` is the inline yellow callout (highlights + warnings) the viewer renders below the item.

---

## Default conventions (override in `user-preferences.md`)

- **Cadence:** 4 active days + 1 rest day (rest = wellness, light activity)
- **Start early:** treks at 7–8h to avoid crowds and afternoon storms
- **One highlight per day**
- **Drive margins:** +30% on estimated times for mountain/scenic roads
- **Cooking:** local market shopping + packed lunches for treks; restaurants are occasional, not daily
- **Book what sells out:** flag `critical: true` on bookings for popular tickets, ferries, high-season motorhomes, Michelin restaurants
- **Budget reserve:** every trip has a `BudgetItem` with `id: "unplanned"`, default 5–10%

---

## MCP plugins (optional)

| Tool                     | Use case                                                       |
| ------------------------ | -------------------------------------------------------------- |
| **Google Maps Platform** | Geocoding, real drive-time estimates, Places matching, weather |
| **OpenWeatherMap**       | Weather forecast fallback                                      |
| **WebSearch** (built-in) | Destination research, current prices, events                   |
| **WebFetch** (built-in)  | Source URL validation, image URL stability check               |
| **Google Calendar**      | Optional — create events from itinerary, prep deadlines        |

`new-trip` works with WebSearch + WebFetch alone. Google Maps MCP upgrades the precision of routes, weather, Places matching, and `googlePlaceId` resolution.

---

## Working without explor8

Everything except `publish` works locally. You get:

- A `trip.json` (single v3 document) the local viewer renders fully (`viewer/trip.html?slug=<slug>`)
- A `trip-params.md` you can read, share, version-control (excluded from git by default — opt-in)
- A `publish.json` you can keep around as a backup or stage for manual upload

Publishing to explor8.ai is opt-in. See `docs/publish-to-explor8.md`.

---

## Sensitive data

`trips/` is gitignored. Treat it as private:

- Booking confirmation codes, passenger document numbers, personal IDs → keep in `trip-params.md` notes if needed; **never** in `trip.json` (publishable).
- Flight numbers, schedules, accommodation phone/address → OK in `trip.json` if user wants them visible in the viewer/explor8.
- Photos of people → keep out of `picture.url`.

---

## Reference files

- `cli/lib/schema.ts` — Zod schemas v3 (Trip, Place, Route, ScheduleItem, Day, Insight, Picture, Booking, BudgetItem, ChecklistGroup).
- `cli/lib/validate-trip.ts` — wraps `trip.json` in the publish envelope `{ trip }`.
- `tools/migrate-v2-to-v3.ts` — one-shot transform for legacy v2 trips (`trip.json` + `map.json` → single v3 doc).
- `skill/guideline.md` — planning rules.
- `skill/sources-travel-experience.md` — the 26 travel sources catalog.
- `templates/user-preferences.example.md` — copy to `trips/user-preferences.md` on first run.
- `templates/trip-skeleton/trip-params.md` — wizard output template.
- `viewer/trip.html`, `viewer/index.html` — local static viewer (MapLibre + Google Maps, no build step).
- `viewer/lib/polyline-decoder.js` — pure-JS Google polyline decoder used by both renderers.
