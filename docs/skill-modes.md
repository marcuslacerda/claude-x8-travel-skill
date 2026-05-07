# Skill modes — full reference

The `/travel-planner` skill has 11 modes. This is the user-facing reference. For implementation detail (and the version Claude actually reads), see [`skill/SKILL.md`](../skill/SKILL.md).

All modes (except `use`, `new-trip`) require a trip context. Set it once with `use <slug>`, or pass inline: `/travel-planner <mode> <slug>`.

---

## `use <slug>` / `context`

Set or view the active trip context. Writes the slug to `.claude/travel-context` (persists across conversations on the same machine).

```
/travel-planner use italy-2026
```

Without arguments, shows current context and lists available trips (subdirectories of cwd containing `journey-plan.md`).

---

## `new-trip <slug>`

Plan a new trip from scratch. Required parameter: a slug like `norway-2027` (lowercase, hyphen-separated).

The skill:

1. Validates the slug doesn't collide with an existing directory
2. Reads `traveler-profile.md` for defaults
3. Asks only what's trip-specific (destination, dates, transport, special constraints)
4. Researches via WebSearch (entry rules, weather, attractions, routes, accommodations, advance bookings)
5. Scaffolds the directory (or prompts you to run `x8-travel init <slug>` first)
6. Generates `journey-plan.md` following the standard 14-section structure
7. Auto-sets the context

---

## `build-site`

Generate `journey.html` from `journey-plan.md`. Output is a self-contained HTML viewer with:

- Filter bar by experience category
- Expandable day cards
- localStorage-persisted checkbox state for checklist & packing
- Embedded `const days = [...]`, `const checklistGroups = [...]`, `const packingGroups = [...]` arrays

Day-level dates are derived at render from `trip.startDate + index` — don't bake them into the static `const`. Use Playfair Display + Inter typography (override per trip).

The skill verifies experience links before including them (via WebFetch):

- Trekking → AllTrails
- Cities → TripAdvisor Tourism page
- Attractions → TripAdvisor Attraction page
- Restaurants → TripAdvisor Restaurant page

---

## `research`

Deep-dive on a specific topic — destination, trail, campground, restaurant. Output is formatted for direct insertion into `journey-plan.md`.

```
/travel-planner research Lofoten Islands
/travel-planner research Tre Cime di Lavaredo trek
/travel-planner research Camping Olympia Cortina
```

For trails: AllTrails link, distance, elevation, difficulty, reviews summary.
For accommodations: booking link, price range, facilities, location.
For restaurants: TripAdvisor link, cuisine, price range, must-try.
For attractions: opening hours, ticket prices, booking requirements, time needed.

Links verified via WebFetch before inclusion.

---

## `checklist`

Manage prep timeline. Reads the "Prep Checklist" section, parses items by period, compares against today.

Output:

```
## Prep Status (today: 4 Apr 2026)

🔴 Overdue (March):
- [ ] Item that should be done

🟡 Current period (April):
- [ ] ⚠️ Critical item pending
- [x] Already done

🟢 Upcoming (May+):
- 12 items pending
```

To update, edit the .md, then run `sync` to update `journey.html`.

---

## `budget`

Cost analysis. Reads the "Budget Breakdown" section. Output:

- Total planned (in trip currency + home currency from profile)
- Breakdown by category with percentages
- Daily average per person
- Comparison with traveler profile reference ranges

For specific cost questions, researches current prices via WebSearch.

Every trip needs a `unplanned` budget slug (catch-all for unexpected spending). The export step auto-injects it if missing.

---

## `weather`

Forecast for trip locations. Uses Google Maps Weather (primary) or OpenWeatherMap (fallback) MCP. Without either, falls back to WebSearch for a rough forecast.

```
/travel-planner weather Cortina
/travel-planner weather Tromsø next 3 days
```

For trekking days, adds specific alerts:

- ⚠️ Thunderstorm likely (temp drop + humidity + wind shift after 12h)
- ⚠️ High wind (>30 km/h at altitude — dangerous for via ferratas)
- ❄️ Snow possible (temp <2°C above 2500m)

If trip dates >10 days away, warns that forecasts are unreliable.

---

## `validate-routes`

Audit driving segments against Google Maps. Requires the Google Maps Platform MCP.

Reads driving segments from `journey-plan.md` (Route Overview + Day-by-Day). For each, calls `mcp__google-maps__maps_directions`. Compares Google's distance + duration against your `.md`. Applies the drive-margin rule from `traveler-profile.md` (default +30% on mountain/scenic roads).

Output is a validation table. If you confirm, the skill updates the `.md` and shows a diff for the matching `<Placemark>` in `journey-map.kml` — paste it manually, then run `x8-travel map <slug>` to regenerate `map.json`.

---

## `sync`

Synchronize checklist & packing list between `.md` and `journey.html`.

The `.md` is **always** the source of truth — the skill updates HTML to match, never the reverse. ID conventions:

- Checklist: `c-` prefix + short slug (`c-flights`, `c-trecime-toll`)
- Packing: `p-` prefix + short slug (`p-passaporte`, `p-camera`)

**Preserve existing IDs** whenever possible — `localStorage` persists checkbox state keyed by IDs.

---

## `export`

Synthesize `trip.json` from `journey-plan.md`. The CLI's `build` command then combines it with `map.json` into `publish.json`.

The skill validates against `TripSchema` (vendored at `cli/lib/schema.ts`). Required top-level fields:

- `slug`, `title`, `destination`, `startDate` (ISO date)
- `status` ∈ `draft | planned | active | completed`
- `currency` (3-letter ISO)
- `days[]`, `checklist[]`, `packing[]`, `bookings[]`, `budget[]`

**Do not include** `endDate` or `days[].isoDate` / `days[].date` — derived at runtime from `startDate + index`.

**Budget IDs are stable across publishes.** Re-export reuses prior IDs from `<slug>/trip.json` (matched by category). Once an item has an id, that id never changes — even if the display name does.

---

## `map`

Manage POIs and routes (advisory — never auto-edits XML).

### `validate`

Run `x8-travel validate <slug>`. Report counts, kinds, warnings.

### `add-poi <name>`

1. Geocode the name via Google Maps to get lat/lng
2. Pick `(category, kind)` — `attraction/lake`, `stay/camp`, `food/restaurant`, etc.
3. Show the `<Placemark>` block ready to paste into the `<Folder>` whose `<name>` contains "Pontos de Interesse" (or "POI"):

   ```xml
   <Placemark>
     <name>Lake Bled</name>
     <description>[Lake] Jun 12 — short walk + photo stop</description>
     <styleUrl>#lake</styleUrl>
     <Point><coordinates>14.0938,46.3636,0</coordinates></Point>
   </Placemark>
   ```

4. After paste, run `x8-travel map <slug>`. The id is auto-generated from the name (kebab-case + numeric suffix on collision).

### `update-route <day>`

Refresh a route's name after `validate-routes` finds drift. Compute the canonical name (`<Header>: <Body>` format) and show the diff for the `<name>` line.

### `regen`

Just run `x8-travel map <slug>`. Report counts.

See [`format-conventions.md`](format-conventions.md) for the full POI taxonomy (5 categories × ~25 kinds), KML conventions, and route name format.
