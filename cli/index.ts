#!/usr/bin/env -S npx tsx
/**
 * x8-travel CLI — Claude Code companion for trip planning.
 *
 * Subcommands:
 *   init <slug>      Scaffold a new trip directory under trips/<slug>/
 *   validate <slug>  Validate trip.json against the v3 TripSchema
 *
 * Global flags:
 *   -h, --help       Print help and exit
 *   -v, --version    Print version and exit
 *
 * The skill (in Claude Code) is responsible for the LLM-driven parts —
 * wizard, research, generating the single trip.json v3 document. The CLI
 * handles the deterministic-code parts (schema validation).
 *
 * To use a trip on explor8.ai, open https://explor8.ai/import in your
 * browser and upload the trip.json directly — no CLI publish step.
 */

import { Command } from "commander";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { init } from "./commands/init.ts";
import { validate } from "./commands/validate.ts";
import { syncRoutes } from "./commands/sync-routes.ts";
import { log } from "./lib/log.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf-8"));

const program = new Command();

program
  .name("x8-travel")
  .description("Claude Code skill + CLI for planning multi-day, multi-stop trips")
  .version(pkg.version);

program
  .command("init <slug>")
  .description("Scaffold a new trip directory under trips/<slug>/")
  .action((slug: string) => withErrors(() => init(slug)));

program
  .command("validate <slug>")
  .description("Validate trip.json against the v3 TripSchema")
  .action((slug: string) => withErrors(() => validate(slug)));

program
  .command("sync-routes <slug>")
  .description("Regenerate trip.routes[] from the schedule via Google Routes API (or haversine fallback)")
  .option("--dry-run", "Show diff, don't write")
  .option("--output <path>", "Write to a different file (default: in-place with .bak backup)")
  .option("--no-api", "Force haversine fallback even when GOOGLE_PLACES_API_KEY is set")
  .action((slug: string, opts: { dryRun?: boolean; output?: string; api?: boolean }) =>
    withErrors(() =>
      syncRoutes(slug, {
        dryRun: opts.dryRun ?? false,
        output: opts.output ?? null,
        noApi: opts.api === false,
      }),
    ),
  );

program.parseAsync(process.argv).catch((err) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

function withErrors(fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(() => fn())
    .catch((err: unknown) => {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
