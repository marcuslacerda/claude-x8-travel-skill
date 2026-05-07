# claude-x8-travel-skill

> A Claude Code skill (and CLI) for planning multi-day, multi-stop trips. Outputs are JSON + KML + Markdown — usable standalone, or publishable to [explor8.ai](https://explor8.ai) for a richer during-trip experience.

## What this is

A planning workflow for trips that don't fit a one-shot itinerary generator: long-form (2–4 weeks), multi-country, motorhome / trekking / off-grid, where you want to keep iterating on the plan until departure and reuse it during the trip.

Two pieces:

- **A Claude Code skill** (`/travel-planner`) — 11 modes: research, weather, budget, validate-routes, sync, export, map, etc. The skill drives Claude to do the LLM-driven parts of planning.
- **A CLI** (`x8-travel`) — handles deterministic-code parts: KML parsing, schema validation, publishing to explor8.

Outputs you control as plain files in a per-trip directory:

```
my-trip/
  journey-plan.md      # long-form planning doc — source of truth
  journey-map.kml      # POIs + driving routes
  journey.html         # interactive viewer (optional, generated from .md)
  trip.json            # structured trip data (output of skill `export` mode)
  map.json             # parsed map data (output of `x8-travel map`)
  publish.json         # combined publish payload (output of `x8-travel build`)
```

The skill works fully without explor8 — you get a portable trip plan in `.md` + `.kml` + optional `.html`. Publishing to explor8.ai is opt-in.

## Why use it

- **Opinionated for long-form trips.** Defaults to 4:1 cadence (4 active days + 1 rest), +30% drive margins for mountains, one highlight per day, 5–10% emergency budget buffer. Override anything in `traveler-profile.md`.
- **Portable artefacts.** Markdown for humans, KML for any mapping tool (Google Earth, Garmin, organic-maps), JSON for code, HTML for sharing.
- **Skill + code separation.** The skill handles judgment (research, route validation, content authoring); the CLI handles facts (schema validation, KML→JSON, HTTP publish). Each does what it's good at.
- **Versionable.** Everything is text. `git init` on your trip dir, branch alternative routes, diff your plan against last year's.

## Install

### As an npm package (when published)

```bash
npm i -g x8-travel
x8-travel --help
```

### From source

```bash
git clone https://github.com/marcuslacerda/claude-x8-travel-skill
cd claude-x8-travel-skill
pnpm install
# CLI is runnable via npx tsx or pnpm exec:
pnpm exec tsx cli/index.ts --help
```

### Add the skill to Claude Code

Copy `skill/SKILL.md` into your Claude Code skills directory:

```bash
mkdir -p ~/.claude/skills/travel-planner
cp skill/SKILL.md ~/.claude/skills/travel-planner/SKILL.md
```

Now `/travel-planner` is available in any Claude Code session.

## Quickstart

A 5-minute walkthrough.

1. **Scaffold a trip directory.**

   ```bash
   x8-travel init norway-2027
   ```

   Creates `norway-2027/` with `journey-plan.md` and `journey-map.example.kml`.

2. **Open Claude Code in the parent directory** and set the trip context:

   ```
   /travel-planner use norway-2027
   ```

3. **Plan with the skill.** Examples:

   ```
   /travel-planner new-trip norway-2027
   /travel-planner research Lofoten Islands
   /travel-planner weather Tromsø
   /travel-planner budget
   /travel-planner checklist
   ```

   The skill writes to `journey-plan.md` as it works.

4. **Generate `trip.json`** when ready:

   ```
   /travel-planner export
   ```

5. **Convert the KML to map data + build the publish payload:**

   ```bash
   x8-travel map norway-2027
   x8-travel build norway-2027
   ```

6. **(Optional) Publish to explor8.ai:**
   ```bash
   EXPLOR8_PUBLISH_TOKEN=<token> x8-travel publish norway-2027
   ```
   Without a token, just stop after step 5 — you have a portable trip plan in your directory.

## Skill modes

`/travel-planner <mode> [args]` — full reference at [`docs/skill-modes.md`](docs/skill-modes.md).

| Mode              | Purpose                                                               |
| ----------------- | --------------------------------------------------------------------- |
| `use <slug>`      | Set the active trip context                                           |
| `new-trip <slug>` | Plan a new trip from scratch                                          |
| `build-site`      | Generate `journey.html` from `journey-plan.md`                        |
| `research`        | Deep-dive on a destination, trail, campground, restaurant             |
| `checklist`       | Status of prep vs today — flag overdue & critical                     |
| `budget`          | Cost analysis with breakdown and conversion                           |
| `weather`         | Forecast for trip locations (Google Maps MCP — optional)              |
| `validate-routes` | Audit driving times against Google Maps (optional)                    |
| `sync`            | Sync checklist & packing list `.md` ↔ `.html`                         |
| `export`          | Write `trip.json` from `journey-plan.md`                              |
| `map`             | Validate / add POIs / update routes (advisory — never auto-edits XML) |

## CLI commands

`x8-travel <command> <slug>` — slug is a directory name (relative to cwd) or a path.

| Command           | Purpose                                                |
| ----------------- | ------------------------------------------------------ |
| `init <slug>`     | Scaffold a new trip directory from the template        |
| `map <slug>`      | Parse `<slug>/journey-map.kml` → `<slug>/map.json`     |
| `build <slug>`    | Combine `trip.json` + `map.json` → `publish.json`      |
| `validate <slug>` | Validate `trip.json` and `map.json` against schemas    |
| `publish <slug>`  | POST `publish.json` to the configured explor8 endpoint |

There is **no** `export` CLI command — that's a skill mode (LLM-driven). The CLI handles only deterministic-code steps.

## Optional: publish to explor8

[explor8.ai](https://explor8.ai) is the runtime companion app — Telegram bot for during-trip support, expense tracking, proactive insights, offline-aware PWA. Once a trip is published, it's live at `https://explor8.ai/trip/<your-handle>/<slug>`.

**Publishing today is invite-only.** Only the founder has a publish token. We'll add per-user tokens when explor8 opens beyond invite. Until then, you can:

- Use the skill standalone — `.md` / `.kml` / `.html` outputs are portable
- Self-host `trip.json` somewhere your own frontend reads from
- Or DM the founder for an invite if you want to dogfood explor8

See [`docs/publish-to-explor8.md`](docs/publish-to-explor8.md) for details.

## Examples

Two real trips, sanitized for public release:

- [`examples/italy-2026/`](examples/italy-2026/) — 20-day motorhome trip, Dolomites + Slovenia, June 2026. The most evolved example — full `journey-plan.md` (~1500 lines), interactive `journey.html`, 100+ POI KML.
- [`examples/scotland-2025/`](examples/scotland-2025/) — 11-day Highlands road trip, June 2025. KML-only baseline, useful as a smaller-scale reference.

Both examples are usable as starting points: copy the directory, rename the slug, edit. The format is portable across trips.

## Prerequisites

**Required:**

- [Claude Code](https://claude.com/claude-code) for the skill
- Node.js 20+ for the CLI
- pnpm or npm

**Optional (improves precision):**

- **Google Maps Platform MCP** — for `weather`, `validate-routes`, geocoding
- **OpenWeatherMap MCP** — fallback for `weather`
- **Google Calendar / Drive MCPs** — for itinerary calendar events, booking storage

Without optional MCPs, the skill falls back to WebSearch and WebFetch (built-in to Claude Code) for research and link verification — works fine, just less precise on weather and routes.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) — important note about schema sync between this repo and explor8.

## License

MIT — see [`LICENSE`](LICENSE).
