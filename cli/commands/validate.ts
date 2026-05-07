/**
 * `x8-travel validate <slug>` — validate `trip.json` and (if present)
 * `map.json` against their Zod schemas. Reports issues with file:line-style
 * paths so the user can fix them in the source markdown.
 *
 * Useful as a sanity gate before `build` / `publish`, or to debug schema
 * failures coming from the publish endpoint.
 */

import { readFileSync, existsSync } from "fs";
import { TripSchema, TripMapDataSchema } from "../lib/schema.ts";
import { resolveTripPaths, assertDirExists, assertFileExists } from "../lib/paths.ts";
import { log } from "../lib/log.ts";
import { z } from "zod/v4";

function reportIssues(label: string, err: z.ZodError): void {
  log.error(`${label} — ${err.issues.length} issue(s):`);
  for (const issue of err.issues) {
    const at = issue.path.join(".") || "<root>";
    log.step(`${at} — ${issue.message}`);
  }
}

export function validate(slug: string): void {
  const paths = resolveTripPaths(slug);
  assertDirExists(paths);
  assertFileExists(paths.tripJson);

  let allOk = true;

  // Trip
  const tripRaw = JSON.parse(readFileSync(paths.tripJson, "utf-8"));
  // Accept both flat and wrapped shapes — extract the trip if wrapped.
  const tripCandidate =
    tripRaw && typeof tripRaw === "object" && "trip" in tripRaw ? tripRaw.trip : tripRaw;
  const tripResult = TripSchema.safeParse(tripCandidate);
  if (tripResult.success) {
    log.success(`trip.json: OK (${tripResult.data.days.length} days, ${tripResult.data.slug})`);
  } else {
    reportIssues("trip.json", tripResult.error);
    allOk = false;
  }

  // Map (optional)
  if (existsSync(paths.mapJson)) {
    const mapRaw = JSON.parse(readFileSync(paths.mapJson, "utf-8"));
    const mapResult = TripMapDataSchema.safeParse(mapRaw);
    if (mapResult.success) {
      log.success(
        `map.json: OK (${mapResult.data.pois.length} POIs, ${mapResult.data.routes.length} routes)`,
      );
    } else {
      reportIssues("map.json", mapResult.error);
      allOk = false;
    }
  } else {
    log.info("map.json: not present (optional)");
  }

  if (!allOk) {
    process.exit(1);
  }
}
