/**
 * `x8-travel build <slug>` — combine `trip.json` + `map.json` into
 * `publish.json` (the `{ trip, mapData }` envelope expected by explor8's
 * publish endpoint).
 *
 * Validates both inputs against their schemas before writing. Map is
 * optional — if `map.json` is missing, writes `mapData: null` (publishing a
 * trip without a map is allowed).
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { buildPublishPayload } from "../lib/build-publish-payload.ts";
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

  let mapRaw: unknown = null;
  if (existsSync(paths.mapJson)) {
    mapRaw = JSON.parse(readFileSync(paths.mapJson, "utf-8"));
  } else {
    log.warn(`No map.json at ${paths.mapJson} — publishing trip without a map.`);
  }

  const payload = buildPublishPayload(tripRaw, mapRaw);

  writeFileSync(paths.publishJson, JSON.stringify(payload, null, 2) + "\n", "utf-8");

  log.success(`${paths.publishJson}`);
  log.step(`trip.slug: ${payload.trip.slug}`);
  log.step(`trip.days: ${payload.trip.days.length}`);
  if (payload.mapData) {
    log.step(`mapData.pois: ${payload.mapData.pois.length}`);
    log.step(`mapData.routes: ${payload.mapData.routes.length}`);
  } else {
    log.step("mapData: null");
  }
  console.log("");
  log.info(`Ready to publish: x8-travel publish ${slug}`);
}
