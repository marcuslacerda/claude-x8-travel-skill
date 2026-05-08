# Skill modes — full reference

The `/travel-planner` skill has 8 modes (v2). This is the user-facing reference; the implementation Claude reads is in [`skill/SKILL.md`](../skill/SKILL.md).

All modes (except `use`, `new-trip`) require a trip context. Set it once with `use <slug>`, or pass inline: `/travel-planner <mode> <slug>`.

> **Migration note (v1 → v2):** the old `build-site`, `sync`, and `export` modes were removed. `journey-plan.md` is no longer a source of truth — `trip.json` + `map.json` are. The viewer in `viewer/` replaces per-trip `journey.html`.

---

## `use <slug>` / `context`

Set or view the active trip context. Writes the slug to `.claude/travel-context` (persists across conversations on the same machine).

```
/travel-planner use scotland-2027
```

Without arguments, shows current context and lists available trips (subdirectories of `trips/` containing `trip-params.md`).

---

## `new-trip <slug>`

Plan a new trip from scratch. Required parameter: a slug like `iceland-2028` (lowercase, hyphen-separated, `{destination}-{year}`).

Workflow:

1. Validates slug doesn't collide with an existing `trips/<slug>/`.
2. Reads `skill/guideline.md` and `skill/sources-travel-experience.md`.
3. Reads `trips/user-preferences.md` (or copies the example template if missing).
4. Runs `x8-travel init <slug>` to scaffold `trips/<slug>/trip-params.md`.
5. **Wizard — 2 batches of 4 questions** via Claude Code's `AskUserQuestion`:
   - Batch 1: origin, headline-to, headline-from, duration
   - Batch 2: start date / month, primary transport, trip type, constraints
6. **Open-ended question:** "Anything else I should consider for this trip?"
7. Persists answers to `trip-params.md`.
8. Researches (WebSearch + Google Maps MCP if available + Open-Meteo + Frankfurter), following `guideline.md`.
9. Generates `trips/<slug>/trip.json` and `trips/<slug>/map.json` — validated against Zod schemas before writing.
10. Auto-sets context. Returns a viewer URL.

---

## `research`

Deep-dive on a destination, trail, campground, restaurant. Useful when filling gaps in a trip already planned.

The skill:

1. Researches via WebSearch + Google Maps MCP.
2. Validates URLs via WebFetch.
3. Proposes specific edits to `trip.json` (Experience inserts) and `map.json` (POI adds).
4. After confirmation, applies edits + re-validates.

POIs include source slug, geocoded lat/lng, kind, picture URL when available.

---

## `checklist`

Status of prep vs today — flag overdue and critical items.

Reads `trip.checklist[]` filtered to `type === "checklist"`. Computes period windows relative to `trip.startDate`. Surfaces:

- 🔴 **Overdue:** items in past periods still pending
- 🟡 **Current:** items in the current window
- 🟢 **Upcoming:** future periods

Critical items (`critical: true`) get prominent badges. To mark items done, say "mark X as done" — the skill applies via Edit tool to `trip.json`.

---

## `budget`

Cost analysis with breakdown and conversion.

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

Forecast for trip locations.

Default: **Open-Meteo API** (`open-meteo.com`, no key, daily up to 16 days, hourly up to 384h). Google Maps MCP `mcp__google-maps__maps_weather` if installed.

For trips >15 days out, switches to monthly average via WebSearch.

Outputs a daily table with trekking alerts (thunderstorm probability, high wind, snow above altitude bands).

---

## `validate-routes`

Audit driving times against Google Maps. **Requires the Google Maps MCP** — without it, this mode is unavailable.

Reads `trip.json.days[].schedule[]`, extracts `Transfer` items with `model: "drive"`, calls `maps_directions` for each, compares to stored values + applies +30% margin (per `guideline.md`).

If the user confirms, updates Transfer `duration`/`distance` and the matching `MapRoute.coordinates` if the path differs.

---

## `map`

Manage POIs and routes (advisory) — operates directly on `map.json`. No KML in v2.

Sub-actions:

- **`validate`** — runs `x8-travel validate <slug>`. Reports POI/route counts and warnings.
- **`add-poi <name>`** — geocodes via Google Maps MCP, picks `(category, kind)` from the taxonomy, picks `source` from the TravelSource enum, looks for a stable picture URL, generates a kebab-case id. Shows the JSON object diff before applying.
- **`update-route <day>`** — refreshes a route's `coordinates[]` from Google Maps after `validate-routes` flagged drift.

Every mutation sets `updatedBy: "skill"`.

---

## Mode removals (v2)

| Removed | Replacement |
| ------- | ----------- |
| `build-site` | The static viewer in `viewer/` renders any trip in `trips/<slug>/`. No per-trip HTML generation. |
| `sync` | Nothing to sync — `trip.json` is the only source of truth. |
| `export` | `new-trip` writes `trip.json` directly during planning. The CLI `validate` command can re-validate at any time. |
