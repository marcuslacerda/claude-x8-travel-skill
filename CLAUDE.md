# CLAUDE.md — claude-x8-travel-skill

Workspace conventions for working on this repo with Claude Code.

## What this repo is

A Claude Code skill + CLI for trip planning. The skill (`skill/SKILL.md`) drives the LLM-driven planning workflow. The CLI (`cli/`) handles deterministic-code steps: KML parsing, schema validation, HTTP publishing.

The repo's own users are people **using** the skill, not building a backend. Most contributions are doc updates, skill-mode tweaks, and CLI ergonomics.

## Repository structure

```
claude-x8-travel-skill/
  README.md                # primary user-facing doc — landing page CTA opens this
  CLAUDE.md                # (this file) workspace conventions for contributors
  CONTRIBUTING.md          # development setup + schema-sync warning
  LICENSE                  # MIT

  skill/
    SKILL.md               # the Claude Code skill — single file
  cli/
    index.ts               # CLI entrypoint (commander)
    commands/              # one file per subcommand
    lib/                   # vendored schema + KML parser + utils
  templates/
    trip-skeleton/         # what `x8-travel init` clones
    traveler-profile.example.md
  examples/
    italy-2026/            # sanitized real trip
    scotland-2025/         # sanitized real trip
  docs/
    skill-modes.md         # full reference for the 11 skill modes
    publish-to-explor8.md  # optional explor8 integration
    format-conventions.md  # MD / KML / HTML format rules
  .github/
    workflows/             # CI + schema-drift
```

## Source of truth

| Concern           | File                                                 |
| ----------------- | ---------------------------------------------------- |
| Skill behavior    | `skill/SKILL.md`                                     |
| Trip schema       | `cli/lib/schema.ts` (vendored — see CONTRIBUTING.md) |
| Map taxonomy      | `cli/lib/schema.ts` + `cli/lib/map-taxonomy.ts`      |
| KML parsing rules | `cli/lib/kml-to-mapdata.ts`                          |
| User-facing docs  | `README.md` + `docs/`                                |
| Trip format       | `docs/format-conventions.md`                         |

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
pnpm exec tsx cli/index.ts init test-trip
pnpm exec tsx cli/index.ts map italy-2026   # operates on examples/italy-2026
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
