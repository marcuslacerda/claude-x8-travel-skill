---
name: travel-planner
description: "Plan multi-day, multi-stop trips through an opinionated wizard + research workflow. Generates structured trip.json + map.json artefacts that render in a local static viewer (viewer/trip.html?slug) and optionally publish to explor8.ai. Modes: use/context (set active trip), new-trip (8-question wizard + research), research (deep-dive on POIs/trails/restaurants), checklist (prep timeline status), budget (cost analysis), weather (open-meteo forecast), validate-routes (Google Maps audit), map (POI/route advisory edits on map.json). Trip context required for all modes except `use` and `new-trip` — set once per session via /travel-planner use <slug>."
---

# Travel Planner

A planning workflow for trips that don't fit a one-shot itinerary generator: long-form (1–4 weeks), multi-stop, with rooms for trekking, motorhome, off-grid, and city legs. The output is two structured JSON files (`trip.json` + `map.json`) that render locally via a static viewer in this repo and can optionally publish to [explor8.ai](https://explor8.ai).

The skill (you, here, in Claude Code) handles the LLM-driven parts — the wizard, research, populating JSON. The companion CLI `x8-travel` handles the deterministic-code parts (schema validation, HTTP publish).

## What this skill is NOT

- Not a discovery feed. It doesn't browse "places to go" — bring your own destinations or describe what you want.
- Not a booking engine. Bookings stay manual; the skill tracks deadlines and surfaces critical reservations.
- Not a TripAdvisor replacement. It uses TripAdvisor / AllTrails / Booking / Park4Night as link sources, not as a backend.
- Not opinionated on language. Write `trip-params.md` and `notes` fields in any language; enums (categories, kinds) stay in English.

---

## Repository conventions

Trips live under `trips/` (gitignored — personal data). Inside:

```
trips/
  user-preferences.md            # shared across every trip — read by new-trip
  <slug>/
    trip-params.md               # this trip's wizard answers
    trip.json                    # canonical itinerary (skill-generated)
    map.json                     # canonical map data (skill-generated)
    publish.json                 # output of `x8-travel build` (when publishing)
```

**Source of truth:**

- `trips/user-preferences.md` — facts about the traveler(s): cadence, budget ranges, interests, dietary, drive margins, etc.
- `trips/<slug>/trip-params.md` — facts specific to one trip (origin, headline-to/from, duration, transport, constraints).
- `trips/<slug>/trip.json` and `trips/<slug>/map.json` — the structured plan. The viewer and explor8 read from these. The skill keeps them in sync as plans evolve.

**Reference docs the skill loads at the start of `new-trip` and `research`:**

- `skill/guideline.md` — planning rules (field ownership, picture/route strategies, 15-min Transfer rule, Insight semantics, MCP preferences).
- `skill/sources-travel-experience.md` — catalog of the 26 travel sources behind the `TravelSource` enum.

---

## Trip Context (Session State)

Every invocation operates within a **trip context** — the slug the skill acts on (e.g. `scotland-2027`). Context resolution priority:

1. **Inline override** — slug in the command (e.g. `/travel-planner checklist scotland-2027`). One-shot.
2. **Conversation memory** — if `use` was run earlier this session, remember it.
3. **Context file** — `.claude/travel-context` (plain text). Persists across conversations on the same machine.

A valid context is `trips/<slug>/` containing `trip-params.md` and at least one of `trip.json` / `map.json` (or just `trip-params.md` for a fresh trip mid-wizard).

**Always show the context banner at the top of every response:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗺️  Trip context: scotland-2027
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If no context is resolved and the mode requires one, prompt the user to set it (`/travel-planner use <slug>`) or list available slugs from `trips/*/`.

### Context required by mode

| Mode                 | Context required? | Notes                                                                  |
| -------------------- | ----------------- | ---------------------------------------------------------------------- |
| **use** / **context**| No                | Sets or shows the active context                                       |
| **new-trip**         | No (creates new)  | Slug is required parameter; auto-sets context after creation           |
| **research**         | Yes               | Inline override OK                                                     |
| **checklist**        | Yes               | Reads `trip.json.checklist`                                            |
| **budget**           | Yes               | Reads `trip.json.budget`                                               |
| **weather**          | Yes               | Reads location from POIs in `map.json`                                 |
| **validate-routes**  | Yes               | Reads `map.json.routes`                                                |
| **map**              | Yes               | Edits `map.json` directly                                              |

---

## Modes

Parse user intent → match to mode below. If ambiguous, show the help menu:

```
🗺️  Trip context: {active or "none"}

## Travel Planner — Available modes

| Mode                  | Purpose                                                       |
|-----------------------|---------------------------------------------------------------|
| **use <slug>**        | Set the active trip                                           |
| **new-trip <slug>**   | Wizard + research → generate trip.json + map.json             |
| **research**          | Deep-dive on a destination, trail, campground, restaurant     |
| **checklist**         | Status of prep vs today — flag overdue & critical             |
| **budget**            | Cost analysis with breakdown and conversion                   |
| **weather**           | Forecast for trip locations                                   |
| **validate-routes**   | Audit driving times against Google Maps                       |
| **map**               | Manage POIs and routes (advisory)                             |

### Examples
- /travel-planner use scotland-2027
- /travel-planner new-trip iceland-2028
- /travel-planner checklist
- /travel-planner weather Edinburgh
- /travel-planner budget
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
   - **Constraints especiais** — pet, child, mobility, dietary, drone, none
7. **Open question (free text):** "Tem algo a mais que devo considerar pra essa viagem?"
8. **Persist answers** to `trips/<slug>/trip-params.md` (the template has the right shape — fill in the placeholders).
9. **Research** using WebSearch + Google Maps MCP (if available) + Open-Meteo for weather + Frankfurter for currency, following `skill/guideline.md`. Specifically:
   - **Flights:** suggest cheapest + shortest-duration round-trip ida=day1, volta=last-day. Use Skyscanner or `google-maps`. If headline-to has no airport, suggest nearest + Transfer to it.
   - **POIs:** match user interests from prefs. Each POI must have a validated `source` (Tier 1 prioritized; URL confirmed via WebFetch). Set `picture` via Wikipedia REST API → og:image fallback (see guideline.md "Pictures"). Drop `picture` rather than save a broken URL.
   - **Popularity:** when the POI has a Wikipedia entry, set `popularity` (0–10 decimal, log10 of annual pageviews, capped at 10) per the algorithm in `guideline.md` "Popularity score". Mirror the same value on the matching MapPOI. Skip silently if no article or low traffic.
   - **Routes:** road-following geometry — Google Maps MCP `maps_directions` first (decode `overview_polyline.points`), OSRM public API as fallback (`router.project-osrm.org`, geojson directly). Pace OSRM at ~1.2s between calls to respect public rate limit. Straight-line only if both fail.
   - **Transfers — 15-min rule:** any displacement >15 min OR requiring a vehicle MUST appear as a Transfer item. Walks ≤1 km can be implicit.
   - **Bookings:** flag `critical: true` for everything that sells out.
10. **Generate `trips/<slug>/trip.json`** following `TripSchema` (v2.1):
    - `destination: { startLocation, headlineTo, headlineFrom }` — from wizard
    - `startDate`: ISO or `YYYY-MM` (or omit if flexible)
    - `currency`: from destination defaults
    - `days[]`: full itinerary with `schedule[]` as discriminated `Experience | Transfer | Insight` items.
      - **Specific Experiences** (real places): set `kind`, `source`, `picture`, and `poiId` (matching the POI id in map.json). MUST also create a corresponding POI.
      - **Generic Experiences** (time blocks like "Lunch break"): no `kind`, no `poiId`, no POI. `category: "custom"` or specific category without `kind`.
      - **Insights**: skill-generated highlights / warnings. Insert AFTER the Experience or Transfer they relate to. NEVER write skill observations to `Experience.notes` (user-only field).
      - **No `TripDay.stay`** (removed): the lodging is the last item with `category: "stay"` in the schedule. The viewer derives "Stay at X" from there.
      - **No `TripDay.warnings`** (removed): all warnings go into Insight items.
    - `bookings[]`: critical reservations + status `pending` (user confirms manually).
    - `budget[]`: enum categories, must include one item with `id: "unplanned"` (5–10% reserve).
    - `checklist[]`: groups with `type: "checklist"` (period titles) + `type: "packing"` (category titles).
11. **Generate `trips/<slug>/map.json`** following `TripMapDataSchema`:
    - `pois[]`: one POI per specific Experience. Stable kebab-case `id` (matches `Experience.poiId`). `updatedBy: "skill"`, `source` (travel platform), `dayNum` if day-specific.
    - `routes[]`: each leg as a polyline with road-following coordinates (per step 9 routes). `dayNum`-tagged. `kind`: driving / walking / ferry / transit / flight / train.
12. **Validate** both via the bundled CLI: `x8-travel validate <slug>`. If validation fails, fix and re-emit (don't write broken JSON).
13. **Update the trips manifest** at `trips/trips-index.json`:
    - Read the file (create as `[]` if missing).
    - If `<slug>` is not in the array, append and sort alphabetically.
    - Write back as a JSON array (e.g. `["scotland-2027", "iceland-2028"]`).
    - The local viewer's `index.html` reads this file to list available trips. Without it, the trip won't show on the landing page (though the direct URL `viewer/trip.html?slug=<slug>` still works).
14. **Auto-set context:** write `<slug>` to `.claude/travel-context`.
15. **Show banner** with next step:

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

| Field                          | Skill writes? | User edits?  |
| ------------------------------ | ------------- | ------------ |
| `Experience.name/desc/cost`    | ✓             | ✓            |
| `Experience.notes`             | ✗             | ✓ (only)     |
| `Experience.kind/source/picture` | ✓           | ✓            |
| `Experience.poiId`             | ✓             | ✗ (auto-set) |
| `Insight.highlights/warnings`  | ✓ (only)      | ✗            |
| `TripDay.planB`                | ✓             | ✓            |

`Experience.notes` is reserved for the user. Skill observations go into Insight items, never into notes.

---

### Mode 2: `research` — Deep-dive on a topic

**Trigger:** "research", specific question about a destination/trail/campground/restaurant

**Workflow:**

1. Use WebSearch + Google Maps MCP to gather current info.
2. Apply `skill/guideline.md` rules (official prices, validate URLs, picture field).
3. Output as a structured Markdown answer, AND propose specific edits to `trips/<slug>/trip.json` (Experience inserts in `days[N].schedule`, POI adds in `map.json`).
4. For each new POI: include source slug from `TravelSource` enum, lat/lng (geocoded), category + kind, picture URL if available.
5. After confirming with the user, apply edits via Edit tool. Re-run `x8-travel validate <slug>` to confirm.

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
   - Total in trip currency + user's home currency (Frankfurter API)
   - Breakdown by category with % and status (paid / confirmed / estimated / reserve)
   - Daily average per person
   - Compare to `traveler-profile.md` ranges if defined
5. For specific cost questions, research current prices via WebSearch (official sites only, per guidelines).

---

### Mode 5: `weather` — Forecast for trip locations

**Trigger:** "weather", "forecast", "will it rain"

**Workflow:**

1. Parse user input for location + date range. Default = next upcoming days based on context.
2. Geocode the location (Google Maps MCP if available; else WebSearch coords).
3. Fetch weather:
   - **Open-Meteo API** (`open-meteo.com`, no key) — daily up to 16 days, hourly up to 384h. Default.
   - **Google Maps MCP** if installed — has `mcp__google-maps__maps_weather` with finer regional models.
4. If trip is >15 days out, switch to monthly average (WebSearch "weather <region> <month> average").
5. Present in travel-friendly format:

   ```
   ## Forecast — Skye, Scotland (next 5 days)

   | Day | Temp | Conditions | Wind | Rain | Trekking alert |
   |-----|------|------------|------|------|----------------|
   | Mon | 4–9°C | ☁️ Overcast | 22 km/h | 30% | ✅ OK |
   | Tue | 2–7°C | 🌧️ Rain | 35 km/h | 80% | ⚠️ Avoid coast |
   ```

6. Trekking alerts (per `skill/guideline.md`):
   - **⚠️ Thunderstorm likely:** temp drop + high humidity + wind shift after 12h
   - **⚠️ High wind:** >30 km/h at altitude
   - **❄️ Snow possible:** temp <2°C above 1500m

---

### Mode 6: `validate-routes` — Audit driving times against Google Maps

**Trigger:** "validate routes", "check driving times", "are the times right?"

**Prerequisite:** Google Maps MCP. Without it this mode is unavailable — prompt user to install or skip.

**Workflow:**

1. Read `trip.json.days[].schedule[]`, extract every `Transfer` with `model: "drive"`.
2. For each, call `mcp__google-maps__maps_directions` with `from.lat,from.lng` → `to.lat,to.lng`.
3. Compare returned distance/duration to the Transfer's stored values. Apply +30% margin for mountain/scenic roads.
4. Present a validation report:

   ```
   ## Route Validation

   | Day | Segment | Stored | Google | +30% | Status |
   |-----|---------|--------|--------|------|--------|
   | 3 | Edinburgh → Inverness | 3h, 250km | 3h12, 252km | 4h10 | ✅ OK |
   | 7 | Glencoe → Skye | 2h30, 180km | 2h45, 195km | 3h35 | ⚠️ stored low by ~15min |
   ```

5. If user confirms, apply Edit tool to `trip.json` (update Transfer `duration` and `distance`).
6. **Reflect in `map.json`:** updates the matching `MapRoute` polyline's coordinates if Google returns a different path.
7. Re-run `x8-travel validate <slug>`.

---

### Mode 7: `map` — Manage POIs and routes

**Trigger:** "map", "validate map", "add poi", "update route"

**Purpose:** edit `map.json` directly (no more KML in v2). The skill computes the right object shape, validates against `TripMapDataSchema`, and applies via Edit tool.

#### `validate` — Lint the current map.json

Run `x8-travel validate <slug>`. Report counts, kinds, warnings (e.g. orphan POIs without `source`, routes with no `dayNum`).

#### `add-poi <name>` — Add a new point of interest

1. Geocode the name via Google Maps MCP to get `lat`/`lng`.
2. Pick `(category, kind)` from the taxonomy table below.
3. Pick `source` from `TravelSource` enum based on what type of source applies (e.g. trekking → `alltrails`; restaurant → `tripadvisor` or `thefork`; campground → `park4night` for motorhome contexts).
4. Look for a stable public image URL — Wikipedia, Wikimedia, Unsplash, official site. If found, set `picture`. If not, leave undefined.
5. Generate kebab-case `id` from the name (numeric suffix on collision).
6. Show the JSON object diff and apply via Edit tool to `map.json`. Set `updatedBy: "skill"`.
7. If applicable, add a corresponding `Experience` entry into `trip.json.days[N].schedule[]` (skill decides — typically yes for attractions/restaurants, no for transport-only POIs).
8. Run `x8-travel validate <slug>`.

#### `update-route <day>` — Refresh a route's coordinates after `validate-routes`

1. Identify the matching `MapRoute` by `dayNum` or by `name`.
2. Get fresh coordinates from Google Maps MCP (`maps_directions` returns polyline waypoints).
3. Show the diff of `coordinates[]` and apply.
4. Set `updatedBy: "skill"` (default).
5. Run `x8-travel validate <slug>`.

---

## Map data contract (v2)

`map.json` validates against `TripMapDataSchema` in `cli/lib/schema.ts`. The shape:

```ts
{
  pois: MapPOI[],
  routes: MapRoute[]
}
```

### POI taxonomy — `(category, kind)`

5 categories (+ `custom`) × 27 kinds. `kind` is globally unique, so a POI's category is derivable.

| category     | kinds                                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `attraction` | nature, lake, castle, trek, scenic, viewpoint, waterfall, cave, city, vila, unesco, memorial, wellness, adventure |
| `stay`       | hotel, camp, apartment                                                                                            |
| `food`       | restaurant, coffee, bar                                                                                           |
| `shopping`   | shop, market                                                                                                      |
| `transport`  | headline, destination, ferry, parking, station                                                                    |
| `custom`     | (open — kind optional)                                                                                            |

**`headline` vs `destination`:** `headline` = trip start; `destination` = trip end. Roundtrips have two POIs — same lat/lng, different `id`s and descriptions.

### Stable IDs

Every POI and route has a kebab-case `id` (regex `^[a-z0-9][a-z0-9-]*$`). Generate from name with numeric suffix on collision (`lago-di-garda`, `lago-di-garda-2`). **IDs are immutable** — renaming a POI is fine; changing its id breaks references.

### Day binding

- **Routes:** `dayNum` ties a polyline to a specific day. Omit for trip-wide overview.
- **POIs:** `dayNum` filters POI to a specific day in the day-detail map. Omit = trip-wide (visible in overview map).

### Provenance

- **`source`** (TravelSource) — the travel platform that informed the POI / pricing (e.g. `booking`, `tripadvisor`, `alltrails`). Optional.
- **`updatedBy`** — `"skill" | "chat" | "webui"`. Who/what last touched this POI. Defaults to `"skill"`. The chat tool and the explor8 webui set their own value.

### Route kinds

`driving | walking | ferry | transit | flight | train`. Pick the one that matches the segment's primary mode.

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

| Tool                      | Use case                                                              |
| ------------------------- | --------------------------------------------------------------------- |
| **Google Maps Platform**  | Geocoding, real drive-time estimates, POI search, weather (preferred) |
| **OpenWeatherMap**        | Weather forecast fallback                                             |
| **WebSearch** (built-in)  | Destination research, current prices, events                          |
| **WebFetch** (built-in)   | Source URL validation, image URL stability check                      |
| **Google Calendar**       | Optional — create events from itinerary, prep deadlines               |

`new-trip` works with WebSearch + WebFetch alone. Google Maps MCP upgrades the precision of routes, weather, and POI metadata.

---

## Working without explor8

Everything except `publish` works locally. You get:

- A `trip.json` + `map.json` pair the local viewer renders fully (`viewer/trip.html?slug=<slug>`)
- A `trip-params.md` you can read, share, version-control (excluded from git by default — opt-in)
- A `publish.json` you can keep around as a backup or stage for manual upload

Publishing to explor8.ai is opt-in. See `docs/publish-to-explor8.md`.

---

## Sensitive data

`trips/` is gitignored. Treat it as private:

- Booking confirmation codes, passenger document numbers, personal IDs → keep in `trip-params.md` notes if needed; **never** in `trip.json` (publishable).
- Flight numbers, schedules, accommodation phone/address → OK in `trip.json` if user wants them visible in the viewer/explor8.
- Photos of people → keep out of `picture` URLs.

---

## Reference files

- `cli/lib/schema.ts` — Zod schemas (Trip, Day, Experience, Transfer, Booking, BudgetItem, ChecklistGroup, MapPOI, MapRoute).
- `cli/lib/build-publish-payload.ts` — wraps `trip.json` + `map.json` into the publish envelope.
- `skill/guideline.md` — planning rules.
- `skill/sources-travel-experience.md` — the 26 travel sources catalog.
- `templates/user-preferences.example.md` — copy to `trips/user-preferences.md` on first run.
- `templates/trip-skeleton/trip-params.md` — wizard output template.
- `viewer/index.html`, `viewer/trip.html` — local static viewer (MapLibre + OSM, no API key).
