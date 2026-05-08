# Format conventions (v2)

`trip.json` and `map.json` are the only canonical artefacts in v2. This doc walks through the shapes the skill emits and the viewer/explor8 consume. The Zod schema in [`cli/lib/schema.ts`](../cli/lib/schema.ts) is the source of truth — this doc summarizes.

---

## Folder layout

```
trips/                            # gitignored — personal data
  user-preferences.md             # shared across every trip
  <slug>/                         # one folder per trip
    trip-params.md                # wizard answers — readable by humans
    trip.json                     # canonical itinerary
    map.json                      # canonical map data
    publish.json                  # output of `x8-travel build` (when publishing)
```

Examples in `examples/<slug>/` follow the same structure (without `publish.json`).

---

## `trip.json`

```ts
{
  slug: string,                    // kebab-case, unique per owner
  title: string,                   // "Highlands & Skye Winter Loop"
  destination: {
    startLocation: string,         // origin city
    headlineTo: string,            // primary destination
    headlineFrom: string,          // return point (often = startLocation)
  },
  startDate?: string,              // "YYYY-MM-DD" or "YYYY-MM" (month-only)
  status: "draft" | "planned" | "active" | "completed",
  currency: string,                // ISO 4217 (EUR / GBP / USD / BRL ...)
  timezone?: string,               // IANA (Europe/London ...)
  coverImage?: string,
  ogImage?: string,
  isPublic?: boolean,
  days: TripDay[],
  checklist?: ChecklistGroup[],
  bookings?: Booking[],
  budget?: BudgetItem[],
}
```

`endDate` is **derived** at runtime (`startDate + days.length - 1`), not stored.

### `TripDay`

```ts
{
  num: string,                     // "1", "2", ...
  title: string,                   // "Edinburgh → Stirling → Cairngorms"
  cls: string,                     // CSS hint ("drive-day", "trek-day", "rest-day")
  desc?: string,
  schedule?: ScheduleItem[],       // array of Experience | Transfer
  warnings?: string[],
  dayCost?: string,                // free-form display string ("£190")
  stay?: Experience,               // overnight, same shape as Experience with category="stay"
  planB?: string,                  // contingency notes
}
```

### `ScheduleItem` — discriminated union

```ts
type ScheduleItem = Experience | Transfer;
```

The viewer and explor8 dispatch rendering on the `type` field.

#### `Experience`

```ts
{
  type: "experience",
  time: string,                    // "09:00" or "2h" or "afternoon"
  name: string,
  desc?: string,
  notes?: string,                  // tips, instructions — often user-edited
  cost?: number,                   // in trip currency; omit if unknown
  category: "attraction" | "stay" | "food" | "shopping" | "transport" | "custom",
  kind?: ExperienceKind,           // 27 kinds — see schema.ts
  source?: TravelSource,           // 26 sources — see sources-travel-experience.md
  picture?: string,                // public URL
  links?: { type: string, url: string }[],
}
```

#### `Transfer`

```ts
{
  type: "transfer",
  time?: string,
  from: { name: string, lat: number, lng: number },
  to:   { name: string, lat: number, lng: number },
  model: "drive" | "walk" | "ferry" | "flight" | "train",
  duration: number,                // minutes
  distance?: number,               // km
  cost?: number,
  notes?: string,
}
```

### `Booking`

```ts
{
  date: string,                    // ISO date
  item: string,                    // "British Airways · GRU→EDI · round-trip"
  status: "confirmed" | "pending",
  critical: boolean,               // true = must secure early (sold-out / price-spike risk)
  link?: string,                   // viewer label depends on status: "Open" if confirmed, "Booking" otherwise
}
```

### `BudgetItem`

```ts
{
  id: string,                      // kebab-case (regex /^[a-z0-9][a-z0-9-]*$/)
  category: "flights" | "accommodations" | "fuel" | "insurance" | "food" |
            "attractions" | "shopping" | "transportation" | "entertainment" | "unplanned",
  amount: number,
  pct: number,                     // % of total
  status: "paid" | "confirmed" | "estimated" | "reserve",
  notes?: string,
  links?: { type: string, url: string }[],
}
```

Every trip must have a `BudgetItem` with `id: "unplanned"` (5–10% reserve).

### `ChecklistGroup` (merged with packing)

```ts
{
  title: string,                   // "2 months before" or "Documents"
  type: "checklist" | "packing",   // checklist groups have time-based titles; packing groups have category titles
  items: {
    id: string,                    // kebab-case
    text: string,
    status: "done" | "pending",
    critical?: boolean,
  }[],
}
```

The viewer renders checklist + packing on separate tabs but reads from the same `trip.checklist[]` array.

---

## `map.json`

```ts
{
  pois: MapPOI[],
  routes: MapRoute[],
}
```

### `MapPOI`

```ts
{
  id: string,                      // kebab-case, immutable
  lat: number,
  lng: number,
  name: string,
  description?: string,
  category: ExperienceCategory,
  kind?: ExperienceKind,
  source?: TravelSource,           // travel platform — used for infowindow link
  updatedBy: "skill" | "chat" | "webui",  // provenance
  dayNum?: number | number[],      // omit = trip-wide; number = single day; array = multi-day (e.g. [9,10,11] for a multi-night stay)
}
```

### `MapRoute`

```ts
{
  id: string,                      // kebab-case
  name?: string,                   // popup label
  color: string,                   // hex
  kind: "driving" | "walking" | "ferry" | "transit" | "flight" | "train",
  dayNum?: number | number[],      // omit = trip-wide; number = single day; array = drawn on each listed day
  coordinates: { lat: number, lng: number }[],
  updatedBy: "skill" | "chat" | "webui",
}
```

### Day binding

`dayNum` has three shapes:

- **Omit** → trip-wide (visible in the overview map and not removed by any day filter; also doesn't pull camera bounds when a day is selected).
- **Number** (e.g. `10`) → single-day item.
- **Array** (e.g. `[9, 10, 11]`) → multi-day item. Canonical use: a multi-night stay (arrival night, full days, departure morning) or any POI/route that's relevant on more than one day.

- **Routes:** `dayNum` ties a polyline to one day or several. Omit for a trip-wide overview line.
- **POIs:** `dayNum` filters a POI into a day's day-detail map; trip-wide POIs (no `dayNum`) appear in every view.

### Stable IDs

Every POI and route has a kebab-case `id`. Generate from the name (with numeric suffix on collision: `lago-di-garda`, `lago-di-garda-2`). Once an id is in the JSON, **don't change it** — the explor8 chat tool and external references depend on it.

---

## Reference

- Zod schemas: [`cli/lib/schema.ts`](../cli/lib/schema.ts)
- Sources catalog: [`skill/sources-travel-experience.md`](../skill/sources-travel-experience.md)
- Planning rules: [`skill/guideline.md`](../skill/guideline.md)
- 27 kinds × 5 categories taxonomy: [`skill/SKILL.md`](../skill/SKILL.md#map-data-contract-v2)
