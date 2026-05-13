# Contributing

Thanks for considering a contribution. This repo carries a **vendored schema** that must stay in sync with the explor8 monorepo — please read the section below before changing schema-related files.

## Local development

```bash
git clone https://github.com/marcuslacerda/claude-x8-travel-skill
cd claude-x8-travel-skill
pnpm install
pnpm test          # run vitest
pnpm lint          # eslint + prettier
pnpm type-check    # tsc --noEmit
```

The CLI runs directly via `tsx` — no build step:

```bash
pnpm exec tsx cli/index.ts <command> <slug>
```

## Schema sync (important)

`cli/lib/schema.ts` is **vendored** from `explor8/src/lib/schemas/trip.ts`. Both files must stay in lockstep — the explor8 import endpoint (<https://explor8.ai/import>) validates uploads against its own copy, so if they drift users will see schema errors when they try to import their `trip.json`.

**When you change `cli/lib/schema.ts`:**

1. Update the same file in the explor8 monorepo (`src/lib/schemas/trip.ts`).
2. Both repos run a CI workflow that diffs the files and fails on drift.
3. Land both PRs together (or expect CI to fail until the second one merges).

**When the explor8 schema changes:**

1. Pull the new version into `cli/lib/schema.ts`.
2. Bump this repo's `package.json` version.
3. Update affected CLI commands and the skill's `export` mode if new fields are introduced.

The eventual fix is to publish `@explor8/trip-schema` as an npm package consumed by both repos. Today that's overkill — vendor + drift CI is good enough for the size of the schema and the number of consumers (1 + 1).

## CI workflows

- **`.github/workflows/ci.yml`** — runs lint, type-check, test on PRs and pushes
- **`.github/workflows/schema-drift.yml`** — fetches the explor8 schema and diffs against the vendored copy. Requires `SCHEMA_DRIFT_PAT` secret (a fine-grained PAT scoped to `marcuslacerda/travels` with `Contents: Read` permission)

## Skill modes

When adding or modifying skill modes:

1. Update `skill/SKILL.md` — the canonical doc Claude reads
2. Update [`docs/skill-modes.md`](docs/skill-modes.md) — the user-facing reference
3. Update the README's mode table if the change is mode-level (not just behavior)

## Style

- TypeScript strict mode
- 2-space indent
- Prefer early returns over deep nesting
- No `any` (use `unknown` and type-narrow)
- Keep CLI commands small — extract logic into `cli/lib/`

## Testing

Vitest. Unit tests live alongside source as `*.test.ts`. Integration tests for the CLI use temp directories to avoid polluting the repo.

## Sanitization for examples

Anything added to `examples/` must pass the personal-data grep gate:

```bash
grep -rEi 'marcus|bruna|nubank|mastercard|<your-real-name>' examples/ \
  | grep -v 'marcuslacerda/claude-x8-travel-skill'
# expected: zero hits
```

The CI workflow runs this gate automatically.
