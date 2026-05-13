# Skill modes — full reference

The `/travel-planner` skill has 8 modes (schema v3). This is the user-facing reference; the implementation Claude reads is in [`skill/SKILL.md`](../skill/SKILL.md).

All modes (except `use`, `new-trip`) require a trip context. Set it once with `use <slug>`, or pass inline: `/travel-planner <mode> <slug>`.

> **Schema v3 (current):** all modes produce or consume a single `trip.json` document with top-level `places[]` + `routes[]` catalogs referenced by `days[].schedule[]` items. Legacy v2 trips (`trip.json` + `map.json`) can be migrated via `tools/migrate-v2-to-v3.ts`.

---

## `use <slug>` / `context`

**Set the active trip for this session** (so every other mode picks it up automatically). Writes the slug to `.claude/travel-context`, which persists across conversations on the same machine.

```
/travel-planner use scotland-2027
```

Without arguments, shows current context and lists available trips (subdirectories of `trips/` containing `trip-params.md`).

---

## `new-trip <slug>`

**Plan a trip end-to-end** — wizard collects intent, then the skill researches and writes a single v3 `trip.json`. Required parameter: a slug like `iceland-2028` (lowercase, hyphen-separated, `{destination}-{year}`).

Workflow:

1. Validates slug doesn't collide with an existing `trips/<slug>/`.
2. Reads `skill/guideline.md` and `skill/sources-travel-experience.md`.
3. Reads `trips/user-preferences.md` (or copies the example template if missing).
4. Runs `x8-travel init <slug>` to scaffold `trips/<slug>/trip-params.md`.
5. **Wizard — 2 batches of 4 questions** via Claude Code's `AskUserQuestion`:
   - Batch 1: origin, headline-to, headline-from, duration
   - Batch 2: start date / month, primary transport, trip type, display currency
6. **Open-ended question:** "Anything else I should consider for this trip?"
7. Persists answers to `trip-params.md`.
8. Researches (WebSearch + Google Maps MCP if available + Open-Meteo + Frankfurter), following `guideline.md`.
9. Generates `trips/<slug>/trip.json` (v3) — places + routes catalogs at top level; schedule items reference them by id. Validated against `TripSchema` (including referential integrity).
10. Auto-sets context. Returns a viewer URL.

---

## `research`

**Dig into a specific destination, trail, campground, or restaurant** — fills gaps in a trip you've already planned. Each new Place includes a validated picture (Wikipedia cascade), a popularity score (when applicable), and a `googlePlaceId` when the skill can confidently match Google's catalog.

The skill:

1. Researches via WebSearch + Google Maps MCP.
2. Validates URLs via WebFetch.
3. Proposes specific edits to `trip.json`:
   - New Places appended to `places[]`
   - New Routes appended to `routes[]` (with encoded polylines)
   - Schedule items inserted into the right `days[N].schedule[]`
   - Item-level Insights attached to specific schedule items
4. After confirmation, applies edits + re-validates.

---

## `checklist`

**Check your prep status against today's date** — flags what's overdue, what's due now, and what's critical for the trip not to fall apart.

Reads `trip.checklist[]` filtered to `type === "checklist"`. Computes period windows relative to `trip.startDate`. Surfaces:

- 🔴 **Overdue:** items in past periods still pending
- 🟡 **Current:** items in the current window
- 🟢 **Upcoming:** future periods

Critical items (`critical: true`) get prominent badges. To mark items done, say "mark X as done" — the skill applies via Edit tool to `trip.json`.

---

## `budget`

**Reconcile spend by category** — currency-converts to your home currency, validates the unplanned reserve, and compares against your `user-preferences.md` ranges if you've set them.

Reads `trip.budget[]`. Verifies:

- All 10 enum categories used appropriately
- `unplanned` item exists (every trip needs one)
- `pct` fields sum to 100 (warns on drift)

Outputs:

- Total in trip currency + user's home currency (Frankfurter API)
- Breakdown by category with status (paid / confirmed / estimated / reserve)
- Daily average per person
- Comparison vs `user-preferences.md` ranges if defined

For specific cost questions, researches official sources only (per `guideline.md`).

---

## `weather`

**Forecast weather per stop** — daily table with trekking alerts (thunderstorm probability, high wind, snow above altitude bands).

Default: **Open-Meteo API** (`open-meteo.com`, no key, daily up to 16 days, hourly up to 384h). For known Places in the trip catalog, reads coords from `trip.places[<id>].geo` directly instead of geocoding.

For trips >15 days out, switches to monthly average via WebSearch.

Outputs a daily table with trekking alerts (thunderstorm probability ≥ 50% + temp drop > 5°C / sustained wind > 30 km/h / snow possible above 1500m).

---

## `validate-routes`

**Audit stored drive times against live Google Maps** — catches the cases where your itinerary says "2h" but the actual route is 3h with the road closure in winter. **Requires the Google Maps MCP** — without it, this mode is unavailable.

Reads `trip.routes[]`, focuses on `mode: "DRIVE"`. Calls `maps_directions` for each (or derives endpoints from the polyline's first/last vertex / adjacent schedule `placeId` items). Compares to stored values + applies +30% margin (per `guideline.md`).

If the user confirms, updates the matching Route:

- `polyline` (encoded — pass through Google's `overview_polyline.points` directly)
- `duration` (ISO 8601, e.g. `PT3H12M`)
- `distance` (meters)

---

## `map`

**Edit places and routes** — the top-level catalogs in `trip.json`. No more separate `map.json` (gone in v3).

Sub-actions:

- **`validate`** — runs `pnpm exec tsx cli/index.ts validate <slug>`. Reports place + route counts and schema issues (orphan references, missing fields, malformed time/duration).
- **`add-place <name>`** — geocodes via Google Maps MCP, picks `(category, kind)` from the taxonomy, picks `source` from the TravelSource enum, runs the picture cascade (Wikipedia → og:image → Unsplash), tries to resolve `googlePlaceId` (with Haversine proximity check < 100m), generates a kebab-case id. Shows the JSON object diff before applying.
- **`add-route <day>`** — fetches a real polyline from Google Maps MCP (`mode: driving` for DRIVE/TRAIN/TRANSIT — Google's driving polyline approximates rail routes well), encodes it (already encoded by Google), sets mode + ISO 8601 duration + meters distance.
- **`update-route <id>`** — refreshes a route's `polyline` (encoded), `duration`, and `distance` from Google Maps after `validate-routes` flagged drift.

---

## What was removed in v3

| Removed in v3                                                  | Replacement                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Separate `map.json` file                                       | Top-level `places[]` + `routes[]` in `trip.json`                                      |
| Standalone `Insight` schedule item type                        | Inline `scheduleItem.insights[]` or `day.insights[]`                                  |
| `MapPOI.dayNum` array                                          | Derived from `days[N].schedule[].placeId`                                             |
| `MapRoute.coordinates: [{lat,lng}]` arrays                     | `Route.polyline: string` (Google-encoded, precision 5)                                |
| `TransferModel` (lowercase) + `MapRouteKind` (lowercase) split | Unified `TravelMode` (uppercase: DRIVE, WALK, BICYCLE, TRANSIT, TRAIN, FLIGHT, FERRY) |
| `MapRoute.color`                                               | Derived in viewer from `route.mode` (`ROUTE_COLOR_BY_MODE`)                           |
| `MapPOI.updatedBy`                                             | Implicit (skill writes everything by default)                                         |
