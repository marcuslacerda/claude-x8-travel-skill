# Publishing to explor8.ai

Publishing your trip to [explor8.ai](https://explor8.ai) gives you the during-trip companion: Telegram bot for daily briefings, expense tracking, weather/closure alerts, proactive insights, offline-aware PWA. The trip becomes live at `https://explor8.ai/trip/<your-handle>/<slug>`.

**Important: this is opt-in.** The skill works fully without explor8 — `trip.json` (v3) renders in the local viewer and is portable, version-controllable, and shareable as-is. Publishing adds a runtime, it doesn't replace your local files.

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
# 1. Generate trip.json (v3) via the skill
# (in Claude Code:  /travel-planner new-trip scotland-2027)

# 2. Validate + wrap into the publish envelope
pnpm exec tsx cli/index.ts build scotland-2027
# → trips/scotland-2027/publish.json

# 3. Send to explor8
pnpm exec tsx cli/index.ts publish scotland-2027
# POST https://www.explor8.ai/api/admin/trips/publish
# Bearer auth via EXPLOR8_PUBLISH_TOKEN
# Body: { trip: TripSchema }   (v3 — single key, no separate mapData)
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

The publish payload is the `{ trip }` envelope built by `x8-travel build`. Since v3 consolidates places + routes inside the trip document, there is no separate `mapData` envelope anymore — `trip.json` carries everything.

This includes:

- All top-level trip fields (slug, title, destination, currency, etc.)
- `places[]` catalog (POIs with geo, picture, popularity, googlePlaceId)
- `routes[]` catalog (encoded polylines, modes, durations)
- `days[].schedule[]` (with `placeId`/`routeId` references)
- `checklist` + `packing` groups, `bookings`, `budget`

Sensitive data **stays in `trip-params.md` notes only** (or in your head) — booking confirmation codes, passenger document numbers, personal IDs. The skill never writes these into `trip.json` (which is publishable).

The CLI sends an `X-Publish-Source: x8-travel/<version>` header for telemetry — the explor8 team uses this to track which CLI versions are in the wild.

## Republishing

The publish endpoint upserts on `slug + owner`. Re-running `x8-travel publish <slug>` overwrites the trip in the DB. Specifically:

- The entire `Trip` document overwrites `trips.data` jsonb (wipe-and-reseed).
- Budget IDs you set in your `.md` are **stable across publishes** — `localStorage` checkbox state and expense links survive.

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
You're trying to publish without a token. Set it via env or skip publishing — the local file is still valid.

**"trip.json fails TripSchema v3"**
Run `pnpm exec tsx cli/index.ts validate <slug>` for specific field errors. Most common:

- Missing `schemaVersion: 3` literal.
- `schedule[].placeId` or `routeId` referencing an unknown id (referential integrity refine — fix the typo).
- Missing `unplanned` budget item.
- Missing required fields on Place/Route (id, name, geo / mode, polyline, duration).

**"HTTP 401"**
Token wrong or expired. Tokens are issued one-off today; if yours stops working, ask the founder for a new one.

**"HTTP 400 — slug must match"**
The slug in `trip.json` doesn't match the directory name (or the URL slug you expect). Check the `slug` field at the top of `trip.json`.

## Self-hosting

If you'd rather not depend on explor8.ai, the JSON file in your trip directory is self-contained:

- `trip.json` validates against `TripSchema` v3 (vendored at `cli/lib/schema.ts`)
- `publish.json` is the same doc wrapped in the `{ trip }` envelope (audit artifact)

You can:

- Open `viewer/trip.html?slug=<slug>` (this repo's local viewer) and host the whole `viewer/` + `trips/` folders on GitHub Pages / S3 / Vercel.
- Read the JSON file from your own frontend.
- Share the directory as a git repo.

The skill doesn't lock you to explor8 — it's just one possible runtime.
