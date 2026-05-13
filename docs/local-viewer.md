# Local viewer

The static viewer in `viewer/` renders any trip from `trips/<slug>/` or `examples/<slug>/` in the browser. No build step, no API key (for the default MapLibre tab), no account.

## Run it

From the repo root:

```bash
python3 -m http.server 8000
open http://localhost:8000/viewer/index.html
```

Any HTTP server works (`npx serve`, `caddy file-server`, etc.). The reason you can't open the file directly is browsers block ESM `fetch()` from `file://` URLs.

## What it shows

### `viewer/index.html`

Lists every trip discovered in:

- `trips/trips-index.json` — manifest the skill updates after `new-trip`
- `examples/examples-index.json` — checked-in showcases (currently `italy-2026`)
- The `?slug=foo,bar` URL parameter — explicit override

Each trip card links to `viewer/trip.html?slug=<slug>`.

### `viewer/trip.html?slug=<slug>`

Loads `<slug>/trip.json` (schema v3, a single document) from `trips/` first, then falls back to `examples/`. Builds a hydration context (place + route lookup maps) once and shares it across all renderers. Renders six tabs:

| Tab                         | Reads from                                            | Notes                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Itinerary**               | `trip.days[].schedule[]`                              | Schedule items are hydrated against `trip.places[]` / `trip.routes[]` — emoji + name + description come from the Place/Route catalog; cost/notes/insights are per-occurrence. Item-level insights render inline (yellow callout below the item); day-level insights render at the top of the day's schedule. |
| **Bookings**                | `trip.bookings[]`                                     | Sorted by date. Critical items get a red badge; status (confirmed/pending) gets a colored chip. Bookings with `placeId` show the place's thumbnail and a "📍 {place.name}" button that scrolls to the relevant day card.                                                                                     |
| **Budget**                  | `trip.budget[]`                                       | Table with category, amount, % bar, status, notes, links. Total at the bottom.                                                                                                                                                                                                                               |
| **Checklist**               | `trip.checklist[]` filtered to `type === "checklist"` | Time-based groups. Critical items are flagged.                                                                                                                                                                                                                                                               |
| **Packing**                 | `trip.checklist[]` filtered to `type === "packing"`   | Category-grouped items, no time periods.                                                                                                                                                                                                                                                                     |
| **Map**                     | `trip.places[]` + `trip.routes[]`                     | MapLibre + OpenStreetMap. Category filter chips + day selector + idea pins (places not in any schedule, dashed border + 💡). Polylines decoded from Google's encoded format via the pure-JS decoder.                                                                                                         |
| **Google Map** _(optional)_ | Same data                                             | Google Maps JS API renderer with marker clustering (`@googlemaps/markerclusterer` CDN) and rich InfoWindow. Hidden unless `.env.local` sets `GOOGLE_MAPS_API_KEY` + `GOOGLE_MAP_ID`.                                                                                                                         |

### Persistence

Checklist and packing checkboxes save to `localStorage` under the key `x8-travel:<slug>:<itemId>`. This is per-browser, not synced.

The active tab is mirrored to the URL hash (`#bookings`, `#map`, `#gmap`, etc.) — share-friendly.

## Map rendering

### MapLibre (default — no API key)

[MapLibre GL JS](https://maplibre.org/) v4 loaded from CDN. Tiles are [OpenStreetMap](https://www.openstreetmap.org/copyright) raster — no API key, attribution shown.

Place markers use `kind`-specific emoji icons (see `viewer/lib/schema-types.js`'s `KIND_EMOJI`). Click a marker → InfoWindow shows the place's picture, popularity 🔥, description, "Maps ↗" deep link, and a "Ver no roteiro" button that scrolls to the day card where the place is referenced.

Route polylines decode the encoded string via `viewer/lib/polyline-decoder.js` (pure JS, no dependency). Color comes from `mode` via `ROUTE_COLOR_BY_MODE` (DRIVE blue, WALK green, TRAIN brown, FLIGHT orange dashed, FERRY light-blue dashed, etc.). Tagged routes (`"highlight"` / `"scenic"`) get heavier stroke weights.

**Map filters:**

- **Category chips** (top-left): toggle visibility per category — Atrações / Camping/Hotel / Comida / Mercado / Transporte.
- **Day selector** (top-right): "Overview" shows everything (except WALK + FLIGHT which clutter at country zoom); a specific day shows only that day's routes + scheduled places + idea places.

**`kind: "headline"` filtering:** the origin airport (trip start, `kind: "headline"`) is intentionally filtered out of the map — its location would drag bounds to a different continent. The place is still referenced from Day 1's schedule for context.

### Google Maps (optional)

Same data model. Polyline decoding via the same pure-JS decoder. Adds:

- **AdvancedMarker** elements for custom HTML markers.
- **MarkerClusterer** for marker clustering at lower zoom levels.
- Rich **InfoWindow** with the same content as MapLibre's popup.
- Street View + vector styling via a custom Map ID.

## Limitations

- **No 3D** — flat map only. Google Maps tab supports tilt if your Map ID has 3D enabled.
- **No live data** — the viewer renders the JSON the skill produced. Re-run `/travel-planner research` or edit `trip.json` directly to refresh.
- **No edit UI** — read-only. Use the skill modes or open `trip.json` in your editor.

## Customizing

The CSS variables at the top of `viewer/styles.css` define the design system. Tweak the palette per trip by adding `<style>:root { --accent: #<hex>; }</style>` overrides — but per-trip styling isn't built-in (the viewer is generic across trips by design).
