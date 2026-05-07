/**
 * Resolve a trip slug or path to an absolute directory path.
 *
 * Convention: each trip lives in its own directory. Inside it:
 *   - journey-plan.md    (source-of-truth markdown — written by skill modes)
 *   - journey-map.kml    (route source — manual or skill-edited)
 *   - journey.html       (optional viewer — output of `build-site` mode)
 *   - trip.json          (output of `x8-travel export`)
 *   - map.json           (output of `x8-travel map`)
 *   - publish.json       (output of `x8-travel build`)
 *
 * If `slugOrPath` contains a slash or is absolute, treat as a path. Otherwise
 * resolve relative to cwd.
 */

import { resolve, isAbsolute, join } from "path";
import { existsSync, statSync } from "fs";

export interface TripPaths {
  slug: string;
  dir: string;
  journeyPlan: string;
  journeyMap: string;
  journeyHtml: string;
  tripJson: string;
  mapJson: string;
  publishJson: string;
  travelerProfile: string;
}

export function resolveTripPaths(slugOrPath: string): TripPaths {
  const looksLikePath = slugOrPath.includes("/") || isAbsolute(slugOrPath);
  const dir = looksLikePath ? resolve(slugOrPath) : resolve(process.cwd(), slugOrPath);
  const slug = dir.split("/").filter(Boolean).pop() || slugOrPath;

  return {
    slug,
    dir,
    journeyPlan: join(dir, "journey-plan.md"),
    journeyMap: join(dir, "journey-map.kml"),
    journeyHtml: join(dir, "journey.html"),
    tripJson: join(dir, "trip.json"),
    mapJson: join(dir, "map.json"),
    publishJson: join(dir, "publish.json"),
    travelerProfile: join(dir, "..", "traveler-profile.md"),
  };
}

export function assertDirExists(paths: TripPaths): void {
  if (!existsSync(paths.dir)) {
    throw new Error(`Trip directory not found: ${paths.dir}`);
  }
  if (!statSync(paths.dir).isDirectory()) {
    throw new Error(`Not a directory: ${paths.dir}`);
  }
}

export function assertFileExists(filePath: string, hint?: string): void {
  if (!existsSync(filePath)) {
    const tail = hint ? ` — ${hint}` : "";
    throw new Error(`File not found: ${filePath}${tail}`);
  }
}
