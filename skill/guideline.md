# Skill guidelines

Determinist rules the skill follows when researching, generating itineraries, and populating `trip.json` / `map.json`. Loaded at the start of `new-trip` and `research`.

---

## Field ownership — skill vs user

Critical rule: certain fields are skill-only, others are user-only. Mixing them creates noise and lost edits.

| Field                          | Skill writes? | User edits?  |
| ------------------------------ | ------------- | ------------ |
| `Experience.name/desc/cost`    | ✓             | ✓            |
| `Experience.notes`             | ✗             | ✓ (only)     |
| `Experience.kind/source/picture` | ✓           | ✓            |
| `Experience.poiId`             | ✓             | ✗ (auto-set) |
| `Experience.popularity`        | ✓             | ✗ (auto)     |
| `Experience.links`             | ✓             | ✓            |
| `Transfer.notes`               | ✓             | ✓            |
| `Insight.highlights/warnings`  | ✓ (only)      | ✗            |
| `TripDay.planB`                | ✓             | ✓            |
| `MapPOI.*`                     | ✓             | ✓ (via webui) |

Skill-only/user-only fields exist to keep edits round-trip safe: skill regenerations don't clobber user notes, and user edits don't get overwritten by stale skill output.

---

## Generic vs specific Experience

A **specific Experience** refers to a real, geocoded place (e.g. "Edinburgh Castle", "Café Glenfinnan").

- Skill creates a corresponding entry in `map.json.pois[]` with a kebab-case `id` derived from the name.
- Skill sets `experience.poiId` equal to that POI id (bidirectional link).
- `category` must be one of: `attraction | stay | food | shopping | transport`.
- `kind` should be set (one of the 27 kinds for that category).

A **generic Experience** is a time-block placeholder without a specific location ("Lunch break at 14h", "Free time", "Coffee stop").

- Skill does NOT create a POI in map.json.
- `experience.poiId` is left absent.
- `category` may be `custom` or any specific category without `kind`.

When in doubt: if the user names a venue, it's specific; if they just describe an activity slot, it's generic.

---

## Insights vs notes

**Insights are skill-generated, never user-edited.** They are observations about the segment of the day around them — inserted between Experiences and Transfers in `schedule[]`.

When to emit an Insight:
- Aggregating reviews from TripAdvisor / AllTrails / Park4Night → `highlights` (consensus positive) or `warnings` (consensus caution).
- Weather analysis → "expect afternoon storms ~14h" (warning).
- Local-knowledge logistics → "parking fills by 9am peak season" (warning).
- Match with `user-preferences.md` → "matches your interest in dramatic landscapes" (highlight).
- Best photo light, golden-hour timing, optimal direction of approach → highlight.

Skill **never** writes to `experience.notes` (reserved for the user). Skill **never** uses a removed `TripDay.warnings` field — it's gone in v2.1, all observations go into Insights.

Insight placement: directly AFTER the Experience or Transfer it relates to. If an insight applies to a Transfer (e.g. driving warning), put it after the Transfer. If it applies to an Experience (e.g. trail caution at the trekking attraction), put it after the Experience.

---

## Transfers — the 15-minute rule

Every displacement between two points that takes **more than 15 minutes**, or that requires a vehicle (car, bus, train, ferry, flight), MUST appear as a `Transfer` item in the schedule. Walks under 15 min between adjacent POIs may be omitted (implicit walking).

Concretely:
- Distance ≤ 1 km AND model "walk" → omit Transfer (implicit).
- Distance > 1 km OR duration > 15 min OR model ≠ walk → emit Transfer.
- Always populate `from` / `to` with `{name, lat, lng}`, `model`, and `duration` (minutes).
- `distance` (km) and `cost` (in trip currency) are nice-to-have but optional.

---

## Pictures — image scraping strategy

Skill should populate `picture` (URL) for every specific Experience and POI when possible.

**Recommended order** (preferring the most reliably-cached URL first):

1. **og:image from the Wikipedia article HTML** (primary). `curl -sL https://en.wikipedia.org/wiki/<Page_Title>` then extract `<meta property="og:image" content="...">`. This always returns a 1280px thumbnail that Wikimedia has pre-generated and serves at HTTP 200.

2. **Wikipedia REST API** (`https://en.wikipedia.org/api/rest_v1/page/summary/<title>`) is convenient but has two failure modes — use ONLY when og:image isn't available:
   - It can return stale filenames (cached typos that no longer exist on the file server — observed: `Urquhardt_Castle` vs the real `Urquhart_Castle`).
   - It returns oversize thumbnails (`3840px-`) that may not be pre-generated on Wikimedia, returning 404 or 429.
   - **Mitigation**: replace the size segment (`/3840px-` → `/1280px-`) and validate; if the filename has odd casing/typos, fall through to step 3.

3. **og:image from the POI's official site**: WebFetch the official URL (from a Tier-1 TravelSource or `links[type=official]`) and extract `<meta property="og:image" content="...">`.

4. **Validate before saving** (always): HEAD the candidate image URL — must return HTTP 200 with `content-type: image/*`. If 404/410, drop the URL entirely; if 429 (rate-limited), retry once after 2s before giving up. Never save a URL that hasn't been validated this session.

5. **Never use** TripAdvisor user uploads, Google Photos, Instagram/Facebook, or hot-linked images from blogs — they break weekly or block hot-linking with 403.

If everything fails, leave `picture` empty. Empty is better than broken.

---

## Popularity score (optional)

For POIs that have a Wikipedia entry, populate `popularity` (0–10 decimal) derived from page traffic. Cheap signal of "how known is this place" — helps the traveler prioritize when there are more options than time in a day.

**Algorithm:**

1. Compute the article title — same one used for the picture og:image (URL-encoded; spaces and odd chars normalized; e.g. `Edinburgh_Castle`, `Old_Man_of_Storr`, `Glencoe%2C_Highland`).
2. Fetch the previous 12 complete months of pageviews:
   ```
   https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/<title>/monthly/<YYYYMMDD00>/<YYYYMMDD00>
   ```
3. Sum `items[].views` → total annual views.
4. `score = min(log10(total), 10.0)`. Round to 1 decimal.
5. Set `popularity: <score>` on **both** the Experience (in `trip.json.days[].schedule[]`) AND the corresponding MapPOI (in `map.json.pois[]`). Same value, mirrored for map-tab UI.

**Skip silently** (leave `popularity` undefined) when:
- HTTP 404 — article doesn't exist (typical for restaurants, B&Bs, small viewpoints).
- Total views < 100 — too noisy to be meaningful (`log10 < 2`).
- Title resolves to a redirect or disambiguation page — pick the canonical name first or skip.

**Calibration table** (sanity check during review):

| Annual pageviews | Score | Example                             |
| ---------------- | ----- | ----------------------------------- |
| 10,000           | 4.0   | small village, niche trail          |
| 100,000          | 5.0   | regional attraction                 |
| 500,000          | 5.7   | famous castle, well-known landmark  |
| 1,000,000        | 6.0   | top-tier tourist attraction         |
| 10,000,000       | 7.0   | mega landmark (Vatican, Eiffel)     |

**Conventions:**
- Always `en.wikipedia` regardless of trip language — international consistency.
- Skill-only field. User never edits manually (use `notes` for that).
- Score is "frozen" at trip-generation time. The skill recomputes only on full regeneration; small skill edits (research mode) preserve existing scores.

---

## Routes — road-following geometry

Routes in `map.json.routes[]` should follow real roads, not draw straight lines between POIs.

1. **Google Maps MCP if available**: `mcp__google-maps__maps_directions` returns `routes[0].overview_polyline.points` (encoded polyline). Decode to `[{lat, lng}]` array (the polyline algorithm is short — ~30 lines — and a helper can be added to the skill if you need it). Yields 100+ waypoints per route.

2. **OSRM public fallback** when MCP is unavailable: `https://router.project-osrm.org/route/v1/<profile>/<lng>,<lat>;<lng>,<lat>?overview=full&geometries=geojson`. Returns `routes[0].geometry.coordinates` directly as `[lng, lat]` pairs (just swap to `{lat, lng}`). Profiles: `driving`, `walking`. No API key, ~1 req/s rate limit.

3. **Sequential calls with throttle**: for a 14-day trip with ~10 routes, call OSRM sequentially with ~1.2s delay between requests to stay within the public rate limit.

4. **Ferry / flight routes**: OSRM doesn't model these. For ferries, draw a straight line between the two ports and let the viewer style it as dashed. For flights, similar — straight great-circle is acceptable.

5. **On failure**: if both MCP and OSRM fail (network down, OSRM 503, etc.), emit a straight polyline `[from.lat,lng → to.lat,lng]`. Don't block trip generation.

---

## Pricing & sources

- **Official sites only for prices**. Blogs, "top 10" lists, and tourism articles go stale in months. Confirm prices on the POI's official site or a Tier-1 TravelSource (booking, skyscanner, rome2rio).
- **Validate every `source` URL**: WebFetch the candidate URL — must return content matching the POI's name and location. If 404 or unrelated content, drop the source rather than save a broken link.
- **Reviews**: numeric review scores go in an Insight (highlight if 4.5+, warning context if low) — NOT in `notes` (user field). Example: highlight `"TripAdvisor 4.6/5 (1.2k reviews) — visitors praise X"`.
- **Tickets/reservations**: when a POI has bookable tickets, add a `links[]` entry with `type: "official"` pointing to the booking page.

---

## Weather

**Decision rule by horizon** (count days from today to the target date):

| Horizon         | Source                                | Why                                              |
| --------------- | ------------------------------------- | ------------------------------------------------ |
| ≤ 16 days       | **Open-Meteo** (free, no key)         | Forecast model has skill within this window      |
| > 16 days       | **WebSearch** monthly averages        | No model has reliable point-forecast skill yet   |

Both options are free and require no API key — pick by horizon, not by "what's installed".

### Open-Meteo (≤ 16 days)

Two-step workflow: geocode the place name to lat/lng, then fetch the forecast.

```bash
# 1. Geocode → lat,lng
curl 'https://geocoding-api.open-meteo.com/v1/search?name=Cortina+d%27Ampezzo&count=1'

# 2a. Daily forecast (up to 16 days)
curl 'https://api.open-meteo.com/v1/forecast?latitude=46.5405&longitude=12.1357\
&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max\
&timezone=Europe/Rome&forecast_days=10'

# 2b. Hourly forecast (up to 384h ≈ 16 days) — useful for trekking-day decisions
curl 'https://api.open-meteo.com/v1/forecast?latitude=46.5405&longitude=12.1357\
&hourly=temperature_2m,precipitation,wind_speed_10m&forecast_hours=72'
```

- Always pass `timezone=` matching the destination so the daily buckets align with local sunrise/sunset (use `Europe/Rome`, `Europe/London`, `America/Sao_Paulo`, etc., or `auto` to let Open-Meteo infer it).
- Prefer `forecast_days=N` for daily summaries, `forecast_hours=N` when you need to advise on a specific window (morning trek, ferry crossing, tee-time).
- `precipitation_probability_max` is what to thread into Insight warnings — pair with `wind_speed_10m_max` and `temperature_2m_min` to evaluate trekking thresholds.

### WebSearch (> 16 days)

Search format: `weather <region> <month> average` (e.g. "weather Highland Scotland February average"). Pull min/max and rainfall expectations from a climatology source (Wikipedia, Holiday-Weather, official tourism boards). Surface as a single climatology summary rather than per-day forecasts — it's not a real forecast and the viewer should not pretend it is.

### Trekking-day Insight warnings

Per `user-preferences.md` thresholds, emit `Insight.warnings` when:
- Thunderstorm probability ≥ 50 % combined with temp drop > 5 °C in 6 h.
- Sustained wind > 30 km/h at altitude.
- Snow possible (temp < 0 °C above 1500 m).

---

## Currency

**Default**: **Frankfurter** (`frankfurter.dev`) — ECB rates, free, no API key.

```bash
# Latest single-pair rate
curl 'https://api.frankfurter.dev/v1/latest?from=EUR&to=BRL'
# → {"amount":1.0,"base":"EUR","date":"2026-05-06","rates":{"BRL":6.21}}

# Multiple targets in one call (comma-separated)
curl 'https://api.frankfurter.dev/v1/latest?from=EUR&to=BRL,USD,GBP'

# Historical rate for a fixed date (useful when costs were paid earlier)
curl 'https://api.frankfurter.dev/v1/2026-04-15?from=EUR&to=BRL'
```

- Conventions:
  - `base` is always the trip currency (GBP for the UK, EUR for the eurozone, JPY for Japan, …). Convert *to* the user's home currency from `user-preferences.md`.
  - Cache the rate per session — don't hit the endpoint repeatedly while answering one question.
  - Show 2 decimals for currencies with cents, 0 for JPY/KRW/HUF.
- **Fallback** (Frankfurter 5xx, network down, or unsupported pair like ARS/UYU): WebSearch `"EUR to BRL today"` and use the first major aggregator result (XE, Google Finance, central bank). Note in the response that the rate is from a search, not Frankfurter.
- Trip currency follows the destination — conversion to the user's home currency is a viewer concern; **do not store converted values in `trip.json`**.

---

## Itinerary conventions

- **Day 1 starts with the outbound flight/drive** as a Transfer item.
- **Last day ends with the return flight/drive** as a Transfer item.
- **Nearest airport**: if `headlineTo` has no commercial airport, suggest the nearest one + a Transfer (drive/train) to the headline city on Day 1.
- **Default cadence**: 4 active days + 1 rest (override via `user-preferences.md`).
- **Drive-time margin**: +30% over Google's estimate for mountain/scenic roads.
- **Budget reserve**: every trip MUST have a `BudgetItem` with `id: "unplanned"`, default 5–10% of total.

---

## Critical bookings

Mark `critical: true` on bookings that sell out or spike in price:

- International flights >2 months in advance
- Cars / motorhomes in high season
- Famous attractions with timed tickets (Vatican, Alhambra, Sagrada Família)
- Ferries (Skye, Lofoten, etc.) on reduced winter schedules
- Michelin-starred restaurants
- Accommodations during festivals or major events

`status` always starts at `pending`. Only the user flips it to `confirmed` (manually, after they actually book).

---

## Checklist & packing timeline

Default periods for `checklist[]` groups with `type: "checklist"`:

- 2 months before — flights, motorhomes, insurance, visa
- 1 month before — timed-ticket attractions, car rental, events
- 2 weeks before — restaurants, final weather check, packing list start
- 1 week before — confirmations, offline downloads (maps, docs), online check-in
- Travel day — passport, meds, last weather check
- 1 week after (optional) — reviews, photo backup, expense reconcile

Packing groups have `type: "packing"` — no time periods. Sub-groups by category: Documents, Clothing, Gear, Tech, etc.

---

## i18n & language

- **Enums** (`category`, `kind`, `model`, `status`) stay English in JSON. The viewer/explor8 maps them to i18n keys (`categories.attraction` → "Atração" / "Attraction").
- **Free text** (`name`, `desc`, `notes`, `title`, `Insight.highlights/warnings`) — single language per trip, matching the user's working language.

---

## Failure modes & graceful degradation

- **Date unknown**: save `startDate` as `YYYY-MM` (month-only). The viewer treats as "indeterminate within this month".
- **No reliable source for a POI**: include the POI without `source`. Add an Insight warning if uncertainty matters.
- **Picture URL doesn't validate**: leave empty — `picture` is optional.
- **Coordinates approximate** (small village, no street address): OK — `lat`/`lng` accept rough values. Note the approximation in an Insight if relevant.
- **Route generation fails**: fall back to straight-line polyline.
