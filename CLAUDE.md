# CLAUDE.md — claude-x8-travel-skill

Workspace conventions for working on this repo with Claude Code.

## What this repo is

A Claude Code skill + CLI + local viewer for trip planning. The skill (`skill/SKILL.md`) drives the LLM-driven planning workflow (wizard, research, generating `trip.json` + `map.json`). The CLI (`cli/`) handles deterministic-code steps (schema validation, HTTP publishing). The viewer (`viewer/`) renders the JSON locally with MapLibre + OSM — no API key, no build step.

The repo's own users are people **using** the skill, not building a backend. Most contributions are doc updates, skill-mode tweaks, viewer polish, and CLI ergonomics.

## Repository structure

```
claude-x8-travel-skill/
  README.md                # primary user-facing doc — landing page CTA opens this
  CLAUDE.md                # (this file) workspace conventions for contributors
  CONTRIBUTING.md          # development setup + schema-sync warning
  LICENSE                  # MIT

  skill/
    SKILL.md                       # the Claude Code skill — single file
    sources-travel-experience.md   # 26-source catalog for the TravelSource enum
    guideline.md                   # planning rules (prices, MCP prefs, validation)
  cli/
    index.ts               # CLI entrypoint (commander)
    commands/              # one file per subcommand: init, build, validate, publish
    lib/                   # vendored schema + helpers
  templates/
    trip-skeleton/         # what `x8-travel init` clones (trip-params.md)
    user-preferences.example.md    # copy to trips/user-preferences.md (one-time)
  viewer/
    index.html             # lists trips found in trips/ + examples/
    trip.html              # renders trip.json + map.json (?slug=...)
    styles.css
    lib/                   # day-card.js, map-renderer.js, schema-types.js, tabs.js
  trips/                   # gitignored — your planned trips live here
  examples/
    scotland-2027/         # canonical v2 example — 14-day winter Highlands loop
    italy-2026/            # v2 example — 19-day Italy + Slovenia + Dolomites motorhome
    examples-index.json    # list of v2 examples the viewer surfaces
  docs/
    skill-modes.md         # full reference for the 8 skill modes
    publish-to-explor8.md  # optional explor8 integration
    format-conventions.md  # JSON format conventions
    local-viewer.md        # how to run the local viewer
  .github/
    workflows/             # CI + schema-drift
```

## Source of truth

| Concern           | File                                                 |
| ----------------- | ---------------------------------------------------- |
| Skill behavior    | `skill/SKILL.md`                                     |
| Trip schema       | `cli/lib/schema.ts` (vendored — see CONTRIBUTING.md) |
| Travel sources    | `skill/sources-travel-experience.md`                 |
| Planning rules    | `skill/guideline.md`                                 |
| User-facing docs  | `README.md` + `docs/`                                |
| Trip format       | `docs/format-conventions.md`                         |
| Local viewer      | `viewer/`                                            |

Anywhere a fact lives in two places, **the file mentioned above is canonical**. Changes that cross both have to update both in lockstep.

## Schema-vendor relationship with explor8

`cli/lib/schema.ts` is a vendored copy of `explor8/src/lib/schemas/trip.ts`. Drift breaks publish. CI in both repos diffs the files. See `CONTRIBUTING.md`.

## Commands

```bash
pnpm install
pnpm test
pnpm lint
pnpm type-check

# Run CLI from source
pnpm exec tsx cli/index.ts --help
pnpm exec tsx cli/index.ts init test-trip            # → trips/test-trip/
pnpm exec tsx cli/index.ts validate examples/scotland-2027

# Serve the viewer locally
python3 -m http.server 8000
# → http://localhost:8000/viewer/index.html
```

## Style

- TypeScript strict mode
- 2-space indent
- Prefer early returns
- No `any`; use `unknown` + type-narrow
- ES modules (`"type": "module"` in package.json) — imports use `.ts` extensions

## What goes in `examples/`

Real trips, sanitized. Personal data must not enter git history. The grep gate (CI):

```bash
grep -rEi 'marcus|bruna|nubank|mastercard|<your-real-name>' examples/ \
  | grep -v 'marcuslacerda/claude-x8-travel-skill'
# expected: zero hits
```

When adding a new example trip:

1. Sanitize names → "Traveler 1" / "Traveler 2" or rephrase
2. Drop photos with people
3. Drop PDFs (booking confirmations, tickets, insurance)
4. Replace card-issuer / bank brand names with generic "credit card issuer"
5. Replace home-city refs with `<your home city>` placeholder
6. Run the grep gate; refuse to commit if it fails

## Public surface

The README is the entry point — landing-page CTAs link directly to it. Treat it as marketing copy. Keep:

- Concrete (numbers, real outputs)
- Honest about limitations (publish is invite-only)
- Linkable (sections referenced from elsewhere)

Avoid borrowed-brand positioning ("X for Y"). The skill stands on its own merits.

## What NOT to put in this repo

- explor8 server code (lives in private monorepo)
- Database migrations
- API routes
- Auth logic
- Marcus's personal travel preferences (use a generic profile template)
- Photos of people
- Booking confirmations / passport scans / insurance docs
