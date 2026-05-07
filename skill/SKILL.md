---
name: travel-planner
description: "Plan multi-day, multi-stop trips with an opinionated workflow for long-form travel — motorhome, trekking, off-grid road trips. Requires a trip context (e.g. 'use italy-2026') — set once per session, persists across invocations. Supports 11 modes: use/context (set active trip), new-trip (plan from scratch — requires trip name), build-site (generate journey.html from .md), research (deep-dive on destinations/trails/campgrounds), checklist (manage prep timeline & flag overdue items), budget (cost analysis & currency conversion), weather (forecast for trip locations), validate-routes (audit driving segments against Google Maps — optional, requires API key), sync (synchronize checklist & packing list between .md and journey.html), export (synthesize trip.json from .md for x8-travel build/publish), map (advisory POI/route management — validate, add-poi, update-route, regen against TripMapDataSchema v2: category × kind, dayNum, stable ids). The .md is the source of truth; trip.json + map.json are output artefacts; publish to explor8.ai is optional."
---

# Travel Planner

## What this skill is

A planning workflow for trips that don't fit a one-shot itinerary generator: long-form (2–4 weeks), multi-country, motorhome/trekking/off-grid, where you want to keep iterating on the plan until departure and reuse it during the trip.

Outputs are **portable text files** — `journey-plan.md` (long-form source of truth), `journey-map.kml` (route + POIs), and an optional interactive `journey.html` viewer with localStorage state. They live in a per-trip directory you control.

The companion CLI `x8-travel` handles the deterministic-code parts (KML parsing, schema validation, HTTP publish). The skill modes (you, here, in Claude Code) handle the LLM-driven parts (research, parsing your `.md`, validating routes, generating HTML).

## What this skill is NOT

- Not a discovery feed. It doesn't browse "places to go" — bring your own destinations.
- Not a booking engine. Bookings stay manual; the skill only tracks deadlines.
- Not a TripAdvisor replacement. It uses TripAdvisor/AllTrails as link sources, not as a backend.
- Not opinionated on language. It's bilingual at runtime — write the .md in whatever language you prefer; the skill follows.

## Repository conventions

This skill operates on a per-trip directory. Each trip lives in its own folder, anywhere on disk. Inside the folder:

```
<trip-slug>/
  journey-plan.md      # long-form planning doc — source of truth
  journey-map.kml      # POIs + driving routes (manual or skill-edited)
  journey.html         # interactive viewer (output of `build-site` mode)
  trip.json            # structured trip data (output of `export` mode)
  map.json             # parsed map data (output of `x8-travel map`)
  publish.json         # combined publish payload (output of `x8-travel build`)
```

Optionally, a sibling file at the parent directory (or the trip directory) named `traveler-profile.md` carries the traveler's defaults (cadence, budget ranges, accommodation preferences, drive-margin policy). The `use` mode reads it if present; `new-trip` falls back to a generic profile if missing.

## Trip Context (Session State)

Every invocation operates within a **trip context** — the specific directory the skill acts on (e.g. `italy-2026`). This avoids ambiguity and ensures all modes target the correct trip.

### Context resolution — priority order

1. **Inline override** — trip name in the command (e.g. `/travel-planner checklist italy-2026`). One-shot, doesn't update saved context.
2. **Conversation memory** — if `use` was run earlier in the conversation, remember it.
3. **Context file** — `.claude/travel-context` (plain text with the trip slug). Persists across conversations on the same machine.

### Validation

A valid context is a directory containing at least a `journey-plan.md` file. Resolve relative to current working directory; absolute paths are also accepted.

### Context banner

Always show the active trip at the top of every response:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗺️  Trip context: italy-2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If using an inline override, indicate it:

```
🗺️  Trip context: scotland-2025 (override)
    saved default: italy-2026
```

If no context is resolved and the mode requires one, show:

```
⚠  No trip selected.

Set the context first:
  /travel-planner use <trip-slug>

Or pass inline in any command:
  /travel-planner checklist <trip-slug>

Or create a new trip:
  /travel-planner new-trip <trip-slug>

Available trips in the current directory:
  → (list of subdirectories containing journey-plan.md)
```

### Context rules by mode

| Mode                  | Context required? | Inline override? | Behavior                                                                  |
| --------------------- | ----------------- | ---------------- | ------------------------------------------------------------------------- |
| **use** / **context** | No                | N/A              | Sets or shows the active context (writes to file)                         |
| **new-trip**          | No (creates new)  | N/A              | Trip name is a **required parameter**. After creation, auto-sets context. |
| **build-site**        | Yes               | Yes              | Operates on resolved context                                              |
| **research**          | Yes               | Yes              | Operates on resolved context                                              |
| **checklist**         | Yes               | Yes              | Operates on resolved context                                              |
| **budget**            | Yes               | Yes              | Operates on resolved context                                              |
| **weather**           | Yes               | Yes              | Operates on resolved context                                              |
| **validate-routes**   | Yes               | Yes              | Operates on resolved context (requires Google Maps MCP — optional)        |
| **sync**              | Yes               | Yes              | Operates on resolved context                                              |
| **export**            | Yes               | Yes              | Operates on resolved context                                              |
| **map**               | Yes               | Yes              | Operates on resolved context                                              |

## Context loading

After resolving the trip context, read these files before doing anything:

1. **Traveler profile:** `traveler-profile.md` (sibling or trip-local) — preferences, budget ranges, interests, principles, pace
2. **Active trip:** `journey-plan.md` inside the trip folder — source of truth

If `traveler-profile.md` is missing, use the bundled `traveler-profile.example.md` as a starting point and prompt the user to copy/customize it.

## Modes

Parse the user's input to determine which mode to use. If no mode can be inferred, display this help menu:

```
🗺️  Trip context: {active-trip or "none"}

## Travel Planner — Available modes

| Mode | Purpose |
|------|---------|
| **use <slug>**            | Set the active trip                                       |
| **new-trip <slug>**       | Plan a new trip from scratch                              |
| **build-site**            | Generate journey.html from journey-plan.md                |
| **research**              | Deep-dive on a destination, trail, campground, restaurant |
| **checklist**             | Status of prep vs today — flag overdue & critical         |
| **budget**                | Cost analysis with breakdown and conversion               |
| **weather**               | Forecast for trip locations (requires Google Maps MCP)    |
| **validate-routes**       | Audit driving times against Google Maps                   |
| **sync**                  | Sync checklist & packing list .md ↔ HTML                  |
| **export**                | Write trip.json from journey-plan.md                      |
| **map**                   | Validate/edit POIs and routes (advisory)                  |

### Examples
- /travel-planner use italy-2026
- /travel-planner new-trip norway-2027
- /travel-planner checklist
- /travel-planner weather Cortina
- /travel-planner budget

💡 Set the context once with `use` — then run any mode directly.
```

If the user provides a clear request, skip the help and go straight to the matching mode.

---

### Mode 0: `use` / `context` — Set or view the active trip

**Trigger:** "use <slug>", "context", "which trip", "switch trip"

**Workflow:**

1. If a slug is provided:
   a. Validate the directory exists and contains `journey-plan.md`
   b. Write the slug to `.claude/travel-context`
   c. Show confirmation banner

2. If no slug, show the current context and list available trips (subdirectories of cwd containing `journey-plan.md`).

3. If the slug doesn't match any directory, show error + list available options.

---

### Mode 1: `new-trip <slug>` — Plan a new trip from scratch

**Trigger:** "plan trip", "new trip", "next trip", destination + dates

**Required parameter:** `<slug>` — the directory name (e.g. `norway-2027`, `chile-2026`). Pattern: lowercase, hyphen-separated, follows `{destination}-{year}`.

**Workflow:**

1. **Validate slug** — refuse to overwrite an existing non-empty directory.
2. Read `traveler-profile.md` for the traveler's defaults. If missing, use the bundled example and recommend the user copy it.
3. Ask only what's trip-specific:
   - Destination and region
   - Exact dates (or flexible window)
   - Transport format (road trip, motorhome, flights + train, etc.)
   - Anything special for THIS trip (events, must-see, constraints)
4. Research via WebSearch:
   - Entry/visa requirements for the traveler's passport (read from profile)
   - Weather/climate for the travel dates
   - Top attractions matching the traveler's interest profile
   - Driving routes and distances
   - Accommodation options (campgrounds with wellness if motorhome, etc.)
   - Things requiring advance booking (cable cars, toll roads, popular restaurants)
5. Run `x8-travel init <slug>` from the shell to scaffold the directory (or scaffold manually if Bash isn't available).
6. Generate `journey-plan.md` following this section structure:
   ```
   ## 1. Flights
   ## 2. Transport (Car/Motorhome)
   ## 3. Route Overview (map color code + route table)
   ## 4. Accommodations (campgrounds or rentals by base)
   ## 5. Day-by-Day Itinerary
   ## 6. Budget Breakdown
   ## 7. Key Features & Highlights
   ## 8. Risks & Contingencies
   ## 9. Distances & Driving Times
   ## 10. Apps & Links
   ## 11. Do's & Don'ts — [Region]
   ## 12. Prep Checklist
   ## 13. Packing List
   ## 14. References & Sources
   ```
7. Apply conventions from `traveler-profile.md`:
   - Cadence (default 4:1 — 4 active days, 1 rest day with wellness/light activity)
   - Daily start time (default early — 7–8h for treks)
   - One highlight per day — rest orbits around it
   - Drive-time margin (default +30% for mountain roads)
   - Budget reserve (default 5–10% emergency buffer)
   - Checklist timeline: 3 months before → 2 months → 1 month → 2 weeks → 1 week → travel day
8. **Auto-set context:** write `<slug>` to `.claude/travel-context`.
9. Currency: derive from traveler profile or destination default.
10. Show confirmation banner with the slug.

---

### Mode 2: `build-site` — Generate journey.html from journey-plan.md

**Trigger:** "generate html", "build site", "create portal", "make journey.html"

**Workflow:**

1. Read the active trip `journey-plan.md` completely.
2. Read the bundled `templates/trip-skeleton/journey.html` (or a previous trip's `journey.html`) as a structural template.
3. Generate a new `journey.html` with:
   - Design system via CSS variables (customize palette to the destination's vibe)
   - Typography: Playfair Display + Inter (default; user may swap)
   - `const days = [...]` array with: num, title, tags, cls, schedule, experiences, driving, restaurant, warnings, dayCost, camp. Day-level dates are derived at render from the trip's `startDate + index` — don't bake them into the static `const`.
   - Each experience with: name, desc, category, time, cost, links[]
   - `const checklistGroups = [...]` mirroring the .md checklist
   - `const packingGroups = [...]` mirroring the .md packing list
   - Category labels (tagLabels, categoryLabels, linkLabels) appropriate for the trip
   - Filter bar, localStorage persistence, expandable day cards
4. **Verify experience links** (best-effort):
   - Trekking → AllTrails
   - Cities → TripAdvisor Tourism page
   - Attractions → TripAdvisor Attraction page
   - Restaurants → TripAdvisor Restaurant page
   - Use WebFetch to confirm each URL resolves to the correct location.
5. Output is `journey.html` in the trip directory. The user opens it locally (or hosts wherever they want — GitHub Pages, S3, Vercel).

---

### Mode 3: `research` — Deep-dive on a specific topic

**Trigger:** "research", specific question about a destination/trail/campground/restaurant

**Workflow:**

1. Use WebSearch to gather current information.
2. Format output for direct insertion into the .md (matching existing conventions).
3. **Trails:** AllTrails link, distance, elevation, difficulty, reviews summary.
4. **Accommodations:** booking link, price range, facilities, location relative to attractions.
5. **Restaurants:** TripAdvisor link, cuisine, price range, must-try dishes.
6. **Attractions:** opening hours, ticket prices, booking requirements, time needed.
7. Verify all links via WebFetch before including them.

---

### Mode 4: `checklist` — Manage preparation timeline

**Trigger:** "checklist", "prep", "what's pending", "status"

**Workflow:**

1. Read the active `journey-plan.md`, find the "Prep Checklist" (or equivalent) section.
2. Parse all items: group by period, status (`[x]` vs `[ ]`), critical flag (`⚠️`).
3. Compare periods against today's date:
   - **Overdue:** items in past periods still unchecked
   - **Current:** items in the current period
   - **Upcoming:** items in future periods
4. Present a status summary:

   ```
   ## Prep Status (today: 4 Apr 2026)

   🔴 Overdue (March — already past):
   - [ ] Item that should be done

   🟡 Current period (April — 2 months out):
   - [ ] ⚠️ Critical item pending
   - [x] Already done

   🟢 Upcoming (May+):
   - 12 items pending
   ```

5. To update items, edit the .md, then run `sync` (Mode 8) to update `journey.html`.

---

### Mode 5: `budget` — Budget analysis

**Trigger:** "budget", "how much", "costs"

**Workflow:**

1. Read the active `journey-plan.md`, find the "Budget Breakdown" section.
2. Parse all cost categories and totals.
3. Present summary:
   - Total planned (in trip currency + traveler's home currency if profile sets one)
   - Breakdown by category with percentages
   - Daily average per person
   - Comparison with reference ranges from `traveler-profile.md`
4. For specific cost questions, research current prices via WebSearch.
5. For currency conversion, use current exchange rates (WebSearch for "<from> <to> exchange rate today").

---

### Mode 6: `weather` — Forecast for trip locations

**Trigger:** "weather", "forecast", "will it rain"

**Prerequisites (optional):** Google Maps MCP for primary forecast; OpenWeatherMap MCP for fallback. If neither is configured, fall back to WebSearch for a rough forecast and warn that results are imprecise.

**Workflow:**

1. Parse user input for location and date range. If unspecified, use the active trip's next upcoming days.
2. Geocode the location (`mcp__google-maps__maps_geocode`).
3. Fetch weather (`mcp__google-maps__maps_weather`):
   - `type: "current"` — for right now
   - `type: "forecast_daily"` — multi-day outlook (up to 10 days), default for trip planning
   - `type: "forecast_hourly"` — hour-by-hour (up to 240h), useful for trekking day timing
4. If the primary fails, fall back to OpenWeatherMap or WebSearch.
5. Present results in a travel-friendly format:

   ```
   ## Forecast — Cortina d'Ampezzo (next 5 days)

   | Day | Temp | Conditions | Wind | Rain | Trekking alert |
   |-----|------|------------|------|------|----------------|
   | Mon Jun 8 | 12°–22°C | ☀️ Clear | 8 km/h | 0% | ✅ Ideal |
   | Tue Jun 9 | 10°–19°C | ⛅ Mixed | 12 km/h | 20% | ✅ OK |
   | Wed Jun 10 | 8°–16°C | 🌧️ Rain | 25 km/h | 80% | ⚠️ Avoid altitude |

   💡 Dolomites: thunderstorms typically arrive ~14h in summer. Plan treks for 7–8h start.
   ```

6. For trekking days, add specific alerts:
   - **⚠️ Thunderstorm likely:** temp drop + high humidity + wind shift after 12h
   - **⚠️ High wind:** >30 km/h at altitude — dangerous for via ferratas
   - **❄️ Snow possible:** temp <2°C above 2500m
7. If trip dates are >10 days away, warn that forecasts are unreliable and suggest checking closer to the date.

---

### Mode 7: `validate-routes` — Audit driving segments against Google Maps

**Trigger:** "validate routes", "check driving times", "are the times right?"

**Prerequisites (optional):** Google Maps MCP. If not configured, this mode is unavailable — prompt the user to install the MCP or skip.

**Workflow:**

1. Read the active `journey-plan.md`, extract all driving segments from the Route Overview and Day-by-Day sections.
2. For each segment, call `mcp__google-maps__maps_directions` with origin and destination.
3. Compare Google Maps result (distance + duration) against the .md.
4. Apply the drive-margin rule from `traveler-profile.md` (default +30% on mountain/scenic roads).
5. Present a validation report:

   ```
   ## Route Validation

   | Segment | .md | Google | +30% | Status |
   |---------|-----|--------|------|--------|
   | MXP → Bolzano | 4h, ~310km | 3h12, 308km | 4h10 | ✅ OK |
   | Cortina → Postojna | 3h30, ~280km | 3h45, 295km | 4h52 | ⚠️ .md low by ~1h22 |
   ```

6. If user confirms, update the .md.
7. **Reflect the change in the KML** (advisory — never auto-edit XML). Compute the canonical route name (`<Header>: <Body>` — see Map data contract below) and show the diff for the matching `<Placemark><name>`:

   ```diff
   - <name>Jun 11 (Thu): Cortina → Postojna (Tarvisio pass, 280km ~3h30)</name>
   + <name>Jun 11 (Thu): Cortina → Postojna (Tarvisio pass, 295km ~3h45 base / ~4h52 +30%)</name>
   ```

8. **Regenerate the map JSON** — run `x8-travel map <slug>` and report POI/route counts. Run `x8-travel validate <slug>` to confirm the JSON validates against `TripMapDataSchema`.

---

### Mode 8: `sync` — Synchronize checklist & packing list between .md and journey.html

**Trigger:** "sync", "sync checklist", "sync packing"

#### Step 1 — Read both sources

From **journey-plan.md**:

- **Checklist:** the section starting with `## NN. Prep Checklist` (or the .md's equivalent heading)
- **Packing List:** the section starting with `## NN. Packing List`

From **journey.html**:

- **Checklist:** the `const checklistGroups = [...]` array
- **Packing List:** the `const packingGroups = [...]` array

#### Step 2 — Parse and compare

**Checklist mapping:**

| Markdown                    | JS object                                                 |
| --------------------------- | --------------------------------------------------------- |
| `### Period Title`          | `{ title: "Period Title", items: [...] }`                 |
| `- [x] ~~text~~ ✅ details` | `{ id: "c-slug", text: "short description", done: true }` |
| `- [ ] text`                | `{ id: "c-slug", text: "text" }`                          |
| `- [ ] ⚠️ text`             | `{ id: "c-slug", text: "⚠️ text", critical: true }`       |

**Packing mapping:**

| Markdown                                                   | JS object                                        |
| ---------------------------------------------------------- | ------------------------------------------------ |
| `**Emoji Category Name:**` or `### Emoji Category` heading | `{ title: "Emoji Category Name", items: [...] }` |
| `- [ ] **Bold part** rest`                                 | `{ id: "p-slug", text: "Bold part rest" }`       |
| `- [ ] Plain text item`                                    | `{ id: "p-slug", text: "Plain text item" }`      |

**ID conventions:**

- Checklist IDs: `c-` prefix + short descriptive slug
- Packing IDs: `p-` prefix + short descriptive slug
- **Preserve existing IDs whenever possible** — `localStorage` persists checkbox state keyed by IDs. Changing an ID resets state.

#### Step 3 — Report differences

```
## Sync Report

### Checklist
- ✅ March: in sync (4 items)
- ⚠️ May: 1 item added in .md ("New item text")

### Packing List
- ✅ All 7 groups in sync
```

If everything is in sync, stop — no edits needed.

#### Step 4 — Apply changes to journey.html

Use the Edit tool to update the `checklistGroups`/`packingGroups` arrays in `journey.html` to match the .md.

**Rules:**

- Replace the entire array block on structural changes
- Surgical edits for 1–2 item changes
- Preserve existing `id` values for unchanged items
- 2-space indent, items on same line as `{ id: ... }`

**The .md is always the source of truth — never modify the .md to match the HTML.**

---

### Mode 9: `export` — Synthesize trip.json from journey-plan.md

**Trigger:** "export", "generate json", "prep to publish"

**Purpose:** produce `trip.json` — the structured data file the CLI consumes (`x8-travel build` combines it with `map.json` into `publish.json`; `x8-travel publish` POSTs that to explor8 if you're using it).

**Why this mode exists:** the `.md` is the source of truth for humans; the JSON is the source of truth for code. The export mode is the deterministic transform between the two. The shape must satisfy `TripSchema` (vendored at `cli/lib/schema.ts` in this repo).

#### Workflow

1. **Read the active `journey-plan.md`** completely.
2. **Read `cli/lib/schema.ts`** (or the vendored copy in your CLI install) to anchor on the current `TripSchema` shape.
3. **Synthesize the trip object** with these top-level fields (camelCase):
   - `slug` — context name
   - `title`, `destination` — from .md frontmatter or first heading
   - `startDate` — ISO date string (`YYYY-MM-DD`). **Single source of truth for "when".**
   - `status` — one of `draft | planned | active | completed`
   - `currency` — usually 3-letter ISO code (e.g. `EUR`, `USD`, `BRL`)
   - `coverImage`, `ogImage`, `mapEmbedUrl` — optional
   - `isPublic` — preserve from prior JSON; default `false`
   - `timezone` — IANA name (e.g. `Europe/Rome`); optional
   - `days[]` — full itinerary. Each: `num`, `title`, `tags[]`, `cls`, `schedule[]`, `experiences[]`, `restaurant`, `warnings[]`, `dayCost`, `camp`, `driving`, `planB`
   - `checklist[]` — `{ title, items: [{id, text, done?, critical?}] }` per group
   - `packing[]` — `{ title, description?, items: [{id, text}] }` per group
   - `bookings[]` — `{date, isoDate?, status, document, company, link?, linkLabel?}` (real-world ticket dates — kept as absolute, not derived)
   - `budget[]` — `{id, category, amount (number), pct (number), status, notes}` — see "Budget item IDs" below
   - **Do NOT include** `endDate` — derived at runtime from `startDate + days.length - 1`. Adding it now is harmless (consumers accept and ignore) but new exports omit it.
   - **Do NOT include** `days[].isoDate` or `days[].date` — derived at runtime from `startDate + index`.
4. **If a previous `trip.json` exists**, read it and preserve `version`, `isPublic`, and **all existing budget item `id` slugs** (IDs MUST be stable across publishes — see below).
5. **Validate** the assembled trip against `TripSchema` via the vendored Zod schema. Every required field present, types correct, enums valid. Every budget item must have `id`. If validation would fail, fix the .md and report what's missing instead of writing broken JSON.
6. **Write** to `<slug>/trip.json` (2-space indent).
7. **Report**:
   - Counts: days, checklist items, packing items, bookings, budget items
   - Fields preserved from prior JSON (especially budget IDs)
   - Whether `unplanned` was auto-injected
   - Next step: `x8-travel build <slug>` to combine with map.json, then `x8-travel publish <slug>` to send to explor8 (optional)

#### Budget item IDs

Each `budget[]` item carries a stable `id` slug. Conventions:

- **Slug format:** `^[a-z0-9][a-z0-9-]*$` — lowercase, kebab-case, alphanumeric + hyphens
- **Stable across publishes** — once an item has an id, it never changes even if the display name does
- **Reserved slug:** `unplanned` — every trip needs an item with this id (catch-all for unexpected spending)

**Source of truth for IDs:** the `.md` Budget Breakdown table should have a `Slug` column. If absent, export generates slugs deterministically from the category and writes them back to the .md so subsequent exports stay consistent.

**Stability rule when re-exporting:**

1. Read prior `trip.json` (if exists) → build map of `category → id` from the existing budget array
2. For each item in the new export, look up the prior id by category match (case-insensitive, ignoring trailing suffixes like "(2 pax)")
3. If found, **reuse the prior id** (display name change is OK; id never changes)
4. If new (no match), generate a fresh slug from the new category
5. If a prior id is no longer present, log it ("budget item `motorhome` removed")

#### Sensitive data note

Treat the `.md` as private and the JSON as semi-public:

- Booking confirmation codes, passenger document numbers, personal IDs → never write to JSON
- Phone numbers, addresses for accommodations → OK
- Flight numbers, schedules → OK

---

### Mode 10: `map` — Manage POIs and routes (advisory)

**Trigger:** "map", "validate map", "add poi", "update route", "regen map"

**Purpose:** help evolve the trip's KML (POIs and driving routes) while respecting the contract enforced by the runtime. The skill never edits the KML directly — it computes the right XML and shows it as a diff for you to paste. After any KML change, regenerate the JSON via `x8-travel map <slug>` and validate.

This mode reads the **Map data contract** section below for schema, KML conventions, and route name format.

#### `validate` — Lint the current map.json

1. Run `x8-travel validate <slug>` (or `x8-travel map <slug>` to regen + validate). Report counts, kinds, warnings.
2. If validation fails, point to the offending fields and propose the fix in the KML.
3. If route name format warnings appear (`"Header: Body"` missing `:`), list them.

#### `add-poi <name>` — Add a new point of interest

1. Geocode the name via `mcp__google-maps__maps_geocode` to get `lat`/`lng`.
2. Pick `(category, kind)` from the taxonomy. Defaults:
   - town → `attraction / city`
   - lake → `attraction / lake`
   - castle → `attraction / castle`
   - trailhead → `attraction / trek`
   - waterfall → `attraction / waterfall`
   - viewpoint → `attraction / viewpoint`
   - nature reserve → `attraction / nature`
   - camping → `stay / camp`; hotel → `stay / hotel`; rental → `stay / apartment`
   - notable restaurant → `food / restaurant`; café → `food / coffee`; bar → `food / bar`
   - market → `shopping / market`; shop → `shopping / shop`
   - airport pickup → `transport / headline` (or `destination` for the _return_ of a roundtrip)
   - parking → `transport / parking`; train station → `transport / station`; ferry terminal → `transport / ferry`
3. Compose a short `<description>`. Convention: `[<Kind>] Jun 12 (Fri) — short summary` — self-documents the day binding.
4. Show the `<Placemark>` block ready to paste inside the `<Folder>` whose `<name>` contains "Pontos de Interesse" (or "POI"). `<styleUrl>` uses the **kind** (single-token):

   ```xml
   <Placemark>
     <name>Lago di Carezza</name>
     <description>[Lake] Jun 13 (Sat) — Latemar reflection, 30min loop walk</description>
     <styleUrl>#lake</styleUrl>
     <Point><coordinates>11.5739,46.4072,0</coordinates></Point>
   </Placemark>
   ```

   Note: KML coordinates are `lng,lat,alt` (alt usually `0`). The parser flips to `lat,lng`.

   **Legacy compat:** the parser still accepts old style ids like `#lago`, `#basecamp`, `#start-end` (mapped to the new taxonomy automatically). New POIs SHOULD use the new kind names; existing KMLs don't need a mass rewrite.

5. After paste, run `x8-travel map <slug>` (regenerates `<slug>/map.json`) and `x8-travel validate <slug>`. Ids are auto-generated from the name (kebab-case + numeric suffix on collision); don't write them by hand.

#### `update-route <day>` — Refresh a route's name after `validate-routes`

1. Identify the affected `<Placemark>` in the routes folder (match by date prefix or origin → destination).
2. Compute the canonical name in `<Header>: <Body>` format:
   - **Header**: `Jun 11 (Thu)` (date + day-of-week)
   - **Body**: `Cortina → Postojna (Tarvisio pass, 295km ~3h45 base / ~4h52 +30%)`
3. Show the diff for the `<name>` line. Don't edit the XML directly.
4. After paste, run `x8-travel map <slug>` and `x8-travel validate <slug>`.

#### `regen` — Just regenerate the JSON from the current KML

Run `x8-travel map <slug>`. Report counts. Optionally chain `validate`.

#### Failure handling

- KML missing/malformed → tell the user where to add the folders, don't fabricate XML.
- `mcp__google-maps__maps_geocode` returns nothing → ask for a more specific name.
- Validation fails after a paste → roll back: tell the user to revert and try again.

---

## Map data contract

Map data lives in `<slug>/map.json`, validated against `TripMapDataSchema` (`cli/lib/schema.ts`) on every read by the CLI. The KML is the human-edited source; the JSON is the machine-consumable artefact.

### Pipeline

```
<slug>/journey-map.kml             ← human edits (KML)
       ↓  x8-travel map <slug>
       ↓  (cli/lib/kml-to-mapdata.ts)
<slug>/map.json                    ← schema-valid artefact
       ↓  x8-travel validate <slug>
       ↓  /travel-planner export   ← writes trip.json
       ↓  x8-travel build <slug>
<slug>/publish.json                ← { trip, mapData } envelope
       ↓  x8-travel publish <slug> (optional — sends to explor8.ai)
```

### POI taxonomy — `(category, kind)`

Five categories × ~25 kinds. `kind` is globally unique, so a single-token KML `<styleUrl>` (e.g. `#lake`) is enough — the parser maps it back to the category.

| category     | kinds                                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `attraction` | nature, lake, castle, trek, scenic, viewpoint, waterfall, cave, city, vila, unesco, memorial, wellness, adventure |
| `stay`       | hotel, camp, apartment                                                                                            |
| `food`       | restaurant, coffee, bar                                                                                           |
| `shopping`   | shop, market                                                                                                      |
| `transport`  | headline, destination, ferry, parking, station                                                                    |

**`headline` vs `destination`:** `headline` = where the trip starts; `destination` = where it ends. Roundtrips (same airport → same airport) have two POIs sharing lat/lng but different ids/descriptions. The KML parser auto-flips the second occurrence of `#headline` (or anything labeled "Return") to `#destination`.

### Stable IDs

Every POI and route carries a unique `id` field. The parser auto-generates from the name (`kebab-case` + numeric suffix on collision: `lago-di-garda`, `lago-di-garda-2`). Once an id is in the JSON, **treat it as immutable** — renaming or moving the POI is fine, but don't change the id.

### Day binding

- **Routes:** `dayNum` is parsed from the route name's prefix. Two formats:
  - `Jun 11 (Thu): Venezia → Postojna ...` — date prefix; resolved against `trip.startDate`
  - `Day 7: Edinburgh → Aberdeen ...` — explicit dayNum
    Routes with a parseable prefix get `dayNum` set automatically. Trip-wide overview polylines (no day) leave `dayNum` undefined.
- **POIs:** `dayNum` stays `undefined` for V1 — day-detail UI is a future addition.

### Source provenance

Every POI/route has `source: 'advisor' | 'chat' | 'ui'` (defaults to `advisor` from KML). Currently advisor-only; the field is reserved for future chat-driven mutations.

### Legacy KML compatibility

Existing KMLs with old single-token style ids (`#lago`, `#castelo`, `#basecamp`, `#start-end`, etc.) keep working — the parser maps them to the new `(category, kind)` automatically. New POIs should use the new kind names.

### KML conventions (read by `cli/lib/kml-to-mapdata.ts`)

The parser looks for two `<Folder>`s by `<name>`:

- `<Folder><name>...Pontos de Interesse...</name>` (or `...POI...`) → POIs
- `<Folder><name>...Rotas...</name>` (or `...Routes...`) → routes

**POI `<Placemark>`:**

```xml
<Placemark>
  <name>Lake Bled</name>
  <description>[Lake] Jun 12 (Fri) — Pletna boat, 99 steps, wishing bell</description>
  <styleUrl>#lake</styleUrl>
  <Point><coordinates>14.0938,46.3636,0</coordinates></Point>
</Placemark>
```

**Route `<Placemark>`:**

```xml
<Placemark>
  <name>Jun 9 (Tue): MXP → Venezia (A4 east, 308km ~3h19 base / ~4h19 +30%)</name>
  <styleUrl>#route-orange</styleUrl>
  <LineString>
    <coordinates>8.7603,45.6197,0 8.7700,45.6300,0 ...</coordinates>
  </LineString>
</Placemark>
```

Each route style must be defined once in the document head:

```xml
<Style id="route-orange">
  <LineStyle>
    <color>ff0078ff</color>             <!-- aaBBGGRR (KML byte order) → #FF7800 -->
    <width>4</width>
  </LineStyle>
</Style>
```

The parser converts `aaBBGGRR` → `#RRGGBB`. Routes without a matching `route-*` style get `#888888` (gray).

### Route name format

Route popups in viewers split `route.name` on the **first `:`** and render `head` (bold) + `body` (regular).

```
<Header>: <Body>
```

**Recommended:**

- Header: `Jun 11 (Thu)` (date + day-of-week)
- Body: `Cortina → Postojna (Tarvisio pass, 295km ~3h45 base / ~4h52 +30%)`

### Failure modes (silent)

| Symptom                          | Cause                                                                  | Fix                                                      |
| -------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| Map renders empty                | `map.json` fails `TripMapDataSchema.parse()`                           | Run `x8-travel validate <slug>`; fix the KML; regen.     |
| POI kind fails parse             | `<styleUrl>#xpto</styleUrl>` is neither legacy nor new kind            | Use a kind name from the taxonomy table.                 |
| Duplicate id error               | Two POIs got the same generated id (identical names)                   | Tweak one of the `<name>`s to disambiguate; regen.       |
| Route popup shows whole name     | Route `<name>` has no `:`                                              | Rewrite as `<Header>: <Body>`.                           |
| Route `dayNum` undefined warning | Route name prefix doesn't match `Mon DD` or `Day N`                    | Rename to one of the canonical formats.                  |
| Polyline gray                    | No `<Style id="route-*">` matches the route's `<styleUrl>`             | Add the style block, or correct the styleUrl.            |
| Coordinates `NaN`                | KML used `lat,lng` instead of `lng,lat`                                | Swap. KML order is `lng,lat,alt`.                        |
| Route appears clipped            | LineString `<coordinates>` is comma-only without spaces between points | Each point is `lng,lat,alt` separated by **whitespace**. |

### Files

- `cli/lib/schema.ts` — `MapPOICategorySchema`, `MapPOIKindSchema`, `MapSourceSchema`, `MapPOISchema`, `MapRouteSchema`, `TripMapDataSchema`, `TripSchema`.
- `cli/lib/kml-to-mapdata.ts` — KML parser (resolves styleUrl → category/kind, generates ids, parses route dayNum).
- `cli/lib/map-taxonomy.ts` — legacy → new taxonomy lookup, id generator, route prefix → dayNum.
- `cli/lib/build-publish-payload.ts` — wraps trip.json + map.json into the `{ trip, mapData }` publish payload.

---

## Default conventions (override in `traveler-profile.md`)

These are sensible defaults for long-form trip planning. Override in your traveler profile.

- **Duration:** 14–24 days for big trips
- **Cadence:** 4 active days + 1 rest day (rest = wellness, charming village, light excursion)
- **Start early:** treks at 7–8h to avoid crowds and afternoon storms
- **One highlight per day:** don't stack 6 attractions; one main thing, rest orbits around it
- **Drive margins:** +30% on estimated times for mountain/scenic roads
- **Cooking:** local market shopping + packed lunches for treks; restaurants are occasional, not daily
- **Book what sells out:** cable cars, toll roads, popular restaurants — months ahead. Everything else, decide on the day.
- **Budget:** mid-to-upper range, not luxury. 5–10% emergency buffer.

## MCP plugins (optional)

| Tool                      | Use case                                                              |
| ------------------------- | --------------------------------------------------------------------- |
| **Google Maps Platform**  | Geocoding, real drive-time estimates, POI search, weather (preferred) |
| **OpenWeatherMap**        | Weather forecast fallback                                             |
| **WebSearch** (built-in)  | Destination research, current prices, events                          |
| **WebFetch** (built-in)   | Link verification (TripAdvisor, AllTrails)                            |
| **Google Calendar** (MCP) | Optional — create events from day-by-day itinerary, prep deadlines    |
| **Google Drive** (MCP)    | Optional — share trip plans, store booking confirmations              |

None of these are required. The skill works with WebSearch and WebFetch alone; Google Maps and OpenWeatherMap upgrade the precision of `weather` and `validate-routes`.

## Working without explor8

Everything except the `publish` step works locally. You get:

- A long-form `journey-plan.md` you can read, share, print, version-control
- A `journey-map.kml` you can open in Google Earth, Garmin BaseCamp, organic-maps, etc.
- A `journey.html` interactive viewer you can open locally or host wherever you want
- A `trip.json` + `map.json` pair that any frontend can consume

Publishing to explor8.ai is opt-in. See `docs/publish-to-explor8.md` for how to set it up.

## Sensitive data

Treat the `.md` as private and any rendered/exported artefact as semi-public:

- Booking confirmation codes, passenger document numbers, personal IDs → only in `.md`, never in HTML or JSON
- Flight numbers, schedules → OK in HTML/JSON
- Phone numbers, addresses for accommodations → OK in HTML/JSON
- Photos of people → keep out of any committed file unless you intend to publish
