# Local viewer

The static viewer in `viewer/` renders any trip from `trips/<slug>/` or `examples/<slug>/` in the browser. No build step, no API key, no account.

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
- `examples/examples-index.json` — checked-in showcases (currently `scotland-2027`)
- The `?slug=foo,bar` URL parameter — explicit override

Each trip card links to `viewer/trip.html?slug=<slug>`.

### `viewer/trip.html?slug=<slug>`

Loads `<slug>/trip.json` + `<slug>/map.json` from `trips/` first, then falls back to `examples/`. Renders six tabs:

| Tab | Reads from | Notes |
|-----|-----------|-------|
| **Itinerary** | `trip.days[].schedule[]` | Schedule items render as Experience cards or Transfer rows depending on `type`. Day-level metadata (cost, warnings, planB, stay) renders below the schedule. |
| **Bookings** | `trip.bookings[]` | Sorted by date. Critical items get a red badge; status (confirmed/pending) gets a colored chip. The link button label changes based on status (`Open` if confirmed, `Booking` otherwise). |
| **Budget** | `trip.budget[]` | Table with category, amount, % bar, status, notes, links. Total at the bottom. |
| **Checklist** | `trip.checklist[]` filtered to `type === "checklist"` | Time-based groups. Critical items are flagged. |
| **Packing** | `trip.checklist[]` filtered to `type === "packing"` | Category-grouped items, no time periods. |
| **Map** | `map.json` | MapLibre + OpenStreetMap. POIs as kind-styled markers; routes as colored polylines. |

### Persistence

Checklist and packing checkboxes save to `localStorage` under the key `x8-travel:<slug>:<itemId>`. This is per-browser, not synced.

The active tab is mirrored to the URL hash (`#bookings`, `#map`, etc.) — share-friendly.

## Map rendering

[MapLibre GL JS](https://maplibre.org/) v4 loaded from CDN. Tiles are [OpenStreetMap](https://www.openstreetmap.org/copyright) raster — no API key, attribution shown.

POI markers use kind-specific emoji icons (see `viewer/lib/schema-types.js`'s `KIND_ICONS`). Click a marker → infowindow shows name + description + a link to the source platform (when `source` is set).

Route polylines use the route's `color` field. Flight routes are dashed and thinner; ferries are dashed and blue-default.

## Limitations

- **No 3D / Street View** — that's a Google Maps feature. The published explor8 version uses Google Maps; the local viewer trades fidelity for zero-config.
- **No live data** — the viewer renders the JSON the skill produced. Re-run `/travel-planner research` or edit `trip.json` directly to refresh.
- **No edit UI** — read-only. Use the skill modes or open `trip.json` / `map.json` in your editor.

## Customizing

The CSS variables at the top of `viewer/styles.css` define the design system. Tweak the palette per trip by adding `<style>:root { --accent: #<hex>; }</style>` overrides — but per-trip styling isn't built-in (the viewer is generic across trips by design).

If you want a per-trip self-contained HTML that matches the v1 era, build it manually from `trip.json` — the skill doesn't generate one in v2.
