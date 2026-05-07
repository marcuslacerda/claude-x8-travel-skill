# Publishing to explor8.ai

Publishing your trip to [explor8.ai](https://explor8.ai) gives you the during-trip companion: Telegram bot for daily briefings, expense tracking, weather/closure alerts, proactive insights, offline-aware PWA. The trip becomes live at `https://explor8.ai/trip/<your-handle>/<slug>`.

**Important: this is opt-in.** The skill works fully without explor8 — `journey-plan.md` + `journey-map.kml` + optional `journey.html` are portable, version-controllable, and shareable as-is. Publishing adds a runtime, it doesn't replace your local files.

## Today: invite-only

Publishing requires a token bound to your explor8 account. Currently only the founder (Marcus) has a token, since explor8 is in invite-only dogfood. We'll add per-user tokens in a future release when explor8 opens.

If you want a token now: DM the founder.

## Setup

1. **Get a token** (`EXPLOR8_PUBLISH_TOKEN`). Until per-user tokens land, ask the founder.
2. **Set the env var:**
   ```bash
   export EXPLOR8_PUBLISH_TOKEN=<your-token>
   ```
   Or add it to a `.env` in your shell profile.
3. **(Optional) Override the API URL** if you're targeting a non-prod instance:
   ```bash
   export EXPLOR8_API_URL=http://localhost:3000   # default: https://www.explor8.ai
   ```

## Publish flow

```bash
# 1. Generate trip.json via the skill
# (in Claude Code:  /travel-planner export)

# 2. Convert KML to map.json
x8-travel map italy-2026

# 3. Build the combined publish payload
x8-travel build italy-2026
# → italy-2026/publish.json

# 4. Send to explor8
x8-travel publish italy-2026
# POST https://www.explor8.ai/api/admin/trips/publish
# Bearer auth via EXPLOR8_PUBLISH_TOKEN
# Body: { trip: TripSchema, mapData: TripMapDataSchema | null }
```

A successful publish returns:

```json
{
  "url": "https://www.explor8.ai/trip/<handle>/<slug>",
  "slug": "italy-2026",
  "warnings": [...]
}
```

## What goes over the wire

The publish payload is the `{ trip, mapData }` envelope built by `x8-travel build`. This includes:

- All of `trip.json` (itinerary, checklist, packing, bookings, budget)
- All of `map.json` (POIs, routes)

Sensitive data **stays in `journey-plan.md` only** — booking confirmation codes, passenger document numbers, personal IDs. The skill's `export` mode strips these from the JSON it produces.

The CLI sends an `X-Publish-Source: x8-travel/<version>` header for telemetry — the explor8 team uses this to track which CLI versions are in the wild.

## Republishing

The publish endpoint upserts on `slug + owner`. Re-running `x8-travel publish <slug>` overwrites the trip in the DB. Specifically:

- `trip` overwrites the entire `trips.data` jsonb
- `mapData` overwrites the entire `trips.map_data` jsonb (wipe-and-reseed)
- Budget IDs you set in your `.md` are **stable across publishes** — `localStorage` checkbox state and expense links survive

If `mapData` is `null` (you publish without a map), the column is cleared. To preserve an existing map without re-uploading, re-export `trip.json` and re-publish — the skill's `export` mode reads existing `map.json` and includes it in `publish.json`.

## Error responses

| HTTP             | Meaning                            | Fix                                                 |
| ---------------- | ---------------------------------- | --------------------------------------------------- |
| 401 Unauthorized | Token invalid or missing           | Check `EXPLOR8_PUBLISH_TOKEN`                       |
| 400 Bad Request  | Schema validation failed           | Run `x8-travel validate <slug>` to see what's wrong |
| 409 Conflict     | Version mismatch (concurrent edit) | Re-run `validate` and `build`; retry                |
| 500 Internal     | Server-side issue                  | Retry; if persistent, file an issue                 |

The CLI prints the server's response body verbatim on non-2xx — paste that when reporting issues.

## Troubleshooting

**"EXPLOR8_PUBLISH_TOKEN not set"**
You're trying to publish without a token. Set it via env or skip publishing — the local files are still valid.

**"trip.json fails TripSchema"**
The skill's `export` mode produced an invalid file. Run `x8-travel validate <slug>` to see specific field errors. Most common: missing `unplanned` budget item, missing `slug` on a budget item, day without `title`.

**"map.json fails TripMapDataSchema"**
KML produced something the schema rejects. Run `x8-travel map <slug>` again with verbose output. Most common: duplicate POI ids (two POIs with identical names), unknown `<styleUrl>`, malformed `<coordinates>`.

**"HTTP 401"**
Token wrong or expired. Tokens are issued one-off today; if yours stops working, ask the founder for a new one.

**"HTTP 400 — slug must match"**
The slug in `trip.json` doesn't match the directory name (or the URL slug you expect). Check the `slug` field at the top of `trip.json`.

## Self-hosting

If you'd rather not depend on explor8.ai, the JSON files in your trip directory are self-contained:

- `trip.json` validates against `TripSchema` (vendored at `cli/lib/schema.ts`)
- `map.json` validates against `TripMapDataSchema`
- `publish.json` is the combined envelope

You can:

- Read these in your own frontend
- Render `journey.html` and host on GitHub Pages / S3 / Vercel
- Share the directory as a git repo

The skill doesn't lock you to explor8 — it's just one possible runtime.
