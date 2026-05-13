/**
 * `x8-travel build <slug>` — validate `trip.json` (v3) and emit
 * `publish.json` (the `{ trip }` envelope expected by explor8's publish
 * endpoint).
 *
 * The output is a wrapped + validated copy of `trip.json`. The skill writes
 * `trip.json`; this command produces the artifact the `publish` command
 * POSTs. Separating the two preserves an audit trail of exactly what gets
 * sent to the server.
 */

import { readFileSync, writeFileSync } from "fs";
import { validateTripForPublish } from "../lib/validate-trip.ts";
import { resolveTripPaths, assertDirExists, assertFileExists } from "../lib/paths.ts";
import { log } from "../lib/log.ts";

export function build(slug: string): void {
  const paths = resolveTripPaths(slug);
  assertDirExists(paths);
  assertFileExists(
    paths.tripJson,
    "run /travel-planner new-trip in Claude Code first to generate trip.json",
  );

  const tripRaw = JSON.parse(readFileSync(paths.tripJson, "utf-8"));
  const payload = validateTripForPublish(tripRaw);

  writeFileSync(paths.publishJson, JSON.stringify(payload, null, 2) + "\n", "utf-8");

  log.success(`${paths.publishJson}`);
  log.step(`trip.slug:   ${payload.trip.slug}`);
  log.step(`trip.days:   ${payload.trip.days.length}`);
  log.step(`trip.places: ${payload.trip.places.length}`);
  log.step(`trip.routes: ${payload.trip.routes.length}`);
  console.log("");
  log.info(`Ready to publish: x8-travel publish ${slug}`);
}
