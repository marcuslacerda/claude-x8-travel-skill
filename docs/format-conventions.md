# Format conventions — `trip.json` (schema v3)

`trip.json` is the only canonical artefact in schema v3 (a single document; the legacy `map.json` is gone). This doc summarises the conventions the skill follows when emitting it; the Zod schema in [`cli/lib/schema.ts`](../cli/lib/schema.ts) is the source of truth.

```
trips/<slug>/
  trip-params.md                # wizard answers (markdown)
  trip.json                     # single v3 document — places + routes + days (source of truth)
```

To use a trip on explor8.ai, upload `trip.json` directly via the self-serve import at <https://explor8.ai/import>.

For legacy v2 trips, run `tools/migrate-v2-to-v3.ts` to consolidate `trip.json` + `map.json` into a single v3 doc.

---

## Top-level shape

```ts
{
  schemaVersion: 3,
  slug: string,                  // kebab-case
  title: string,
  destination: { startLocation, headlineTo, headlineFrom },
  startDate?: "YYYY-MM-DD" | "YYYY-MM",
  status: "draft" | "planned" | "active" | "completed",
  currency: string,              // ISO 4217 — destination
  homeCurrency?: string,         // user's display currency
  timezone?: string,             // IANA
  isPublic?: boolean,
  places: Place[],               // catalog
  routes: Route[],               // catalog
  days: Day[],                   // array index = day number (Day 1 = days[0])
  bookings?: Booking[],
  budget?: BudgetItem[],
  checklist?: ChecklistGroup[],
}
```

**Referential integrity (enforced by Zod refine):** every `placeId`/`routeId` in `days[].schedule[]` and every `bookings[].placeId` must resolve to an actual entry in `places[]`/`routes[]`. Validation fails otherwise.

---

## `places[]` — Place catalog

```ts
{
  id: string,                     // kebab-case, unique within trip
  name: string,
  geo: { lat: number, lng: number },
  category: "attraction" | "stay" | "food" | "shopping" | "transport" | "custom",
  kind?: ExperienceKind,          // 28 values across categories
  googlePlaceId?: "ChIJ...",       // Google Places ID when known
  popularity?: number,             // 0–10 (log10 of Wikipedia annual pageviews)
  source?: TravelSource,           // one of 26 platforms
  description?: string,
  picture?: { url, credit?, source? },
  links?: { type, url }[],
  priceHint?: number,              // reference price for budget hints
}
```

### Conventions

- **Stable ids.** `id` is kebab-case, immutable. Renaming a place is fine; changing its id breaks every `placeId` reference.
- **`kind: "headline"`** = trip origin (e.g. home airport). The viewer filters these from the map (they'd drag bounds to a different continent). Use `kind: "destination"` for the trip's end airport (visible on map).
- **Picture** is a structured object, not a string. Source enum is `wikipedia | google-places | official | unsplash | custom`. Always HEAD-validate before saving. See [`skill/guideline.md`](../skill/guideline.md) "Pictures".
- **Popularity** is `min(log10(annual_pageviews), 10)` from Wikipedia. Skip silently when no article exists.
- **`googlePlaceId`** unlocks deep links + future photos sync. Validate proximity (Haversine < 100m) before saving.

---

## `routes[]` — Route catalog

```ts
{
  id: string,                     // kebab-case
  name?: string,
  mode: "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT" | "TRAIN" | "FLIGHT" | "FERRY",
  polyline: string,               // Google-encoded (precision 5)
  duration: string,               // ISO 8601 — "PT45M", "PT2H30M"
  distance?: number,              // meters
  tags?: string[],                // "scenic" | "highlight" | "panoramic"
  notes?: string,
}
```

### Conventions

- **Always encoded polyline.** Never raw `[{lat,lng}]` arrays (~6× larger). Google MCP `maps_directions` returns the encoded string directly via `routes[0].polyline.encodedPolyline` — pass through.
- **ISO 8601 duration.** `PT{h}H{m}M`, drop `H` or `M` when zero. Helper: `parseIsoDuration("PT2H30M") → 150` minutes.
- **Mode is uppercase.** Single enum unifies what v2 called `TransferModel` (lowercase, in itinerary) and `MapRouteKind` (also lowercase, in map).
- **Color is NOT in the data.** The viewer derives stroke color from `mode` via `ROUTE_COLOR_BY_MODE` (DRIVE blue, WALK green, TRAIN brown, FLIGHT orange dashed, FERRY light-blue dashed).
- **Tags semantically modify the line.** `"highlight"` → weight 5, `"scenic"` → weight 4, default → weight 3.
- **FLIGHT routes are hidden in the overview map.** Visible only in the day view (when the user selects Day N from the map's day-selector dropdown). FLIGHT's 2-vertex polyline is correct (real great-circle paths aren't from Directions API).

---

## `days[]` — Itinerary

```ts
{
  title: string,                  // e.g. "Sirmione — Castello Scaligero"
  cls?: string,                   // CSS hint: "active-day", "drive-day", "rest-day"
  schedule: ScheduleItem[],
  insights?: Insight[],           // day-wide observations
  planB?: string,
  dayCost?: string,
}
```

### Conventions

- **No `num` field.** Array index IS the day number (Day 1 = `days[0]`). Reorder = `array.splice`, no renumbering needed.
- **Dates derive from `startDate + index`** (the viewer does this).

---

## `days[].schedule[]` — ScheduleItem

Three shapes, discriminated by which key is present:

```ts
// Place reference
{ time: "HH:MM", placeId: string, cost?, duration?, notes?, insights? }

// Route reference
{ time: "HH:MM", routeId: string, cost?, notes?, insights? }

// Generic block (lunch, free time, coffee stop — no Place needed)
{ time: "HH:MM", name: string, category?, cost?, duration?, notes?, insights? }
```

### Conventions

- **Exactly one of** `placeId` / `routeId` / `name` must be set (schema refine).
- **`cost` overrides `place.priceHint`** for that specific occurrence (budget reads `cost`).
- **`insights[]`** is inline yellow callout rendering. Each entry has `highlights[]` and/or `warnings[]`. The standalone v2 `{ type: "insight" }` shape is gone — insights always live inside another item or at day level.
- **`notes`** is per-occurrence free-form context. Both skill and user can write here (NOT user-only like v2's `Experience.notes`).

---

## Insights

```ts
{
  highlights?: string[],          // "✨" — positive observations
  warnings?: string[],            // "⚠️" — cautions
}
```

At least one of `highlights`/`warnings` must be non-empty. Skill-only field (user never edits insights — for free-form notes use `scheduleItem.notes`).

**Placement:**

- `ScheduleItem.insights[]` — inline below the item it relates to (specific activity).
- `Day.insights[]` — callout at the top of the day's schedule (whole-day observations: weather, transit strikes, lotação geral).

---

## `bookings[]`

```ts
{
  date: string,                   // ISO date
  item: string,                   // description
  status: "confirmed" | "pending",
  critical: boolean,              // sold-out / price-spike risk
  link?: string,
  placeId?: string,               // optional anchor to places[]
}
```

When `placeId` is set, the viewer hydrates the booking row with the place's thumbnail + a clickable "📍 {name}" button that scrolls to the relevant day card.

---

## `budget[]` + `checklist[]`

Unchanged from v2 — see [`cli/lib/schema.ts`](../cli/lib/schema.ts) `BudgetItemSchema` / `ChecklistGroupSchema`.

Every trip MUST have a `BudgetItem` with `id: "unplanned"` (5–10% emergency reserve).

---

## Stable IDs across imports

`Place.id`, `Route.id`, `ChecklistItem.id`, `BudgetItem.id`, `Booking` date+item are stable across re-imports. The explor8 import endpoint upserts on slug; per-user state (checklist checkboxes in `localStorage`, expense links) survives a re-upload as long as the ids don't change.

---

## Sensitive data

`trips/` is gitignored — treat as private:

- Booking confirmation codes, passenger document numbers, personal IDs → keep in `trip-params.md` notes only; **never** in `trip.json` (the file you'd upload to explor8.ai).
- Flight numbers, schedules, accommodation phone/address → OK in `trip.json` if the user wants them visible.
- Photos of people → keep out of `picture.url`.

The `examples/` directory has a CI grep gate (`marcus|bruna|nubank|mastercard|...`) — anything that hits causes CI failure. Sanitize names before moving a trip into `examples/`.
