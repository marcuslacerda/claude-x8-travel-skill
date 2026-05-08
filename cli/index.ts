#!/usr/bin/env -S npx tsx
/**
 * x8-travel CLI — Claude Code companion for trip planning.
 *
 * Subcommands:
 *   init <slug>      Scaffold a new trip directory under trips/<slug>/
 *   build <slug>     Combine trip.json + map.json → publish.json
 *   validate <slug>  Validate trip.json and map.json against schemas
 *   publish <slug>   POST publish.json to the configured explor8 endpoint
 *
 * Global flags:
 *   -h, --help       Print help and exit
 *   -v, --version    Print version and exit
 *
 * The skill (in Claude Code) is responsible for the LLM-driven parts —
 * wizard, research, generating trip.json + map.json. The CLI handles the
 * deterministic-code parts (schema validation, HTTP).
 */

import { Command } from "commander";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { init } from "./commands/init.ts";
import { build } from "./commands/build.ts";
import { validate } from "./commands/validate.ts";
import { publish } from "./commands/publish.ts";
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
  .command("build <slug>")
  .description("Combine trip.json + map.json → publish.json")
  .action((slug: string) => withErrors(() => build(slug)));

program
  .command("validate <slug>")
  .description("Validate trip.json and map.json against their Zod schemas")
  .action((slug: string) => withErrors(() => validate(slug)));

program
  .command("publish <slug>")
  .description("POST publish.json to the configured explor8 endpoint")
  .action((slug: string) => withErrors(async () => await publish(slug)));

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
