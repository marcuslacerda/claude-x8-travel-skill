/**
 * `x8-travel validate <slug>` — validate `trip.json` against the v3
 * TripSchema. Reports issues with structured paths so the user can fix them
 * in the source markdown / skill output.
 *
 * Useful as a sanity gate before uploading the trip via explor8.ai/import,
 * or to debug schema failures locally.
 *
 * v3 note: a single `trip.json` per trip — `map.json` no longer exists.
 * Referential integrity (schedule/bookings → places/routes) is enforced by
 * the schema's refines and surfaced here.
 */

import { readFileSync } from "fs";
import { TripSchema } from "../lib/schema.ts";
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

  const tripRaw = JSON.parse(readFileSync(paths.tripJson, "utf-8"));
  // Accept both bare trip docs and wrapped { trip } shapes.
  const candidate =
    tripRaw && typeof tripRaw === "object" && "trip" in tripRaw ? tripRaw.trip : tripRaw;

  const result = TripSchema.safeParse(candidate);
  if (!result.success) {
    reportIssues("trip.json", result.error);
    process.exit(1);
  }

  const trip = result.data;
  log.success(
    `trip.json: OK (${trip.days.length} days, ${trip.places.length} places, ${trip.routes.length} routes, slug=${trip.slug})`,
  );
}
