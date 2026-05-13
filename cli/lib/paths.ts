/**
 * Resolve a trip slug or path to an absolute directory path.
 *
 * Convention (v3): all trips live under `<cwd>/trips/<slug>/`. Inside it:
 *   - trip-params.md     (wizard output — origin, destination, duration, ...)
 *   - trip.json          (canonical v3 document — places + routes + days)
 *   - publish.json       (output of `x8-travel build`, ready to POST)
 *
 * The shared user preferences live one level up at `<cwd>/trips/user-preferences.md`.
 *
 * If `slugOrPath` is a bare slug, resolve to `<cwd>/trips/<slug>/`. If it
 * contains a slash or is absolute, treat as a path and use as-is — useful for
 * power users who structure trips elsewhere.
 *
 * v3 note: `map.json` no longer exists as a separate file. The catalog of
 * places + routes lives inside `trip.json`. Legacy v2 trips can keep
 * `map.legacy.json` for reference; it is not consumed by the CLI.
 */

import { resolve, isAbsolute, join, basename } from "path";
import { existsSync, statSync } from "fs";

export interface TripPaths {
  slug: string;
  dir: string;
  tripParams: string;
  tripJson: string;
  publishJson: string;
  /** Shared across all trips. Lives at `<trips-root>/user-preferences.md`. */
  userPreferences: string;
}

export function resolveTripPaths(slugOrPath: string): TripPaths {
  const looksLikePath = slugOrPath.includes("/") || isAbsolute(slugOrPath);
  const dir = looksLikePath ? resolve(slugOrPath) : resolve(process.cwd(), "trips", slugOrPath);
  const slug = basename(dir);

  return {
    slug,
    dir,
    tripParams: join(dir, "trip-params.md"),
    tripJson: join(dir, "trip.json"),
    publishJson: join(dir, "publish.json"),
    userPreferences: join(dir, "..", "user-preferences.md"),
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
