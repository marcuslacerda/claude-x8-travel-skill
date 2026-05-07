/**
 * `x8-travel map <slug>` — parse `<slug>/journey-map.kml` into `<slug>/map.json`.
 *
 * Reads the KML, validates against TripMapDataSchema, writes the parsed JSON.
 * If `<slug>/trip.json` exists, reads its `startDate` to resolve route name
 * prefixes ("Jun 11 (Thu): ...") into `dayNum`. Otherwise leaves dayNum
 * undefined and warns.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { parseKmlToMapData } from "../lib/kml-to-mapdata.ts";
import { resolveTripPaths, assertDirExists, assertFileExists } from "../lib/paths.ts";
import { log } from "../lib/log.ts";

function readTripStartDate(tripJsonPath: string): string | undefined {
  if (!existsSync(tripJsonPath)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(tripJsonPath, "utf-8"));
    const startDate = raw.trip?.startDate ?? raw.startDate;
    return typeof startDate === "string" && startDate.length > 0 ? startDate : undefined;
  } catch {
    return undefined;
  }
}

export function map(slug: string): void {
  const paths = resolveTripPaths(slug);
  assertDirExists(paths);
  assertFileExists(paths.journeyMap, "expected journey-map.kml in trip directory");

  const kml = readFileSync(paths.journeyMap, "utf-8");
  const tripStartDate = readTripStartDate(paths.tripJson);

  if (!tripStartDate) {
    log.warn(
      `No trip.json found at ${paths.tripJson} — route dayNum will be undefined.\n` +
        `   Run /travel-planner export first if you want day-aware routes.`,
    );
  }

  const { data, warnings } = parseKmlToMapData(kml, tripStartDate);

  writeFileSync(paths.mapJson, JSON.stringify(data, null, 2) + "\n", "utf-8");

  log.success(`${paths.mapJson}: ${data.pois.length} POIs, ${data.routes.length} routes`);

  const pairs = [...new Set(data.pois.map((p) => `${p.category}/${p.kind}`))].sort();
  log.step(`category/kind pairs: ${pairs.join(", ")}`);

  const routesWithDay = data.routes.filter((r) => r.dayNum !== undefined).length;
  log.step(
    `routes with dayNum: ${routesWithDay}/${data.routes.length}` +
      (routesWithDay < data.routes.length ? ` (rest = trip-wide / unparsed)` : ""),
  );

  if (warnings.length > 0) {
    log.warn(`${warnings.length} warning(s):`);
    for (const w of warnings) log.step(w);
  }
}
