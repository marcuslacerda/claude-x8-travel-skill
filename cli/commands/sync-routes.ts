/**
 * `x8-travel sync-routes <slug>` — regenerate `trip.routes[]` from the schedule.
 *
 * Walks `days[*].schedule[]` for the trip, identifies (placeA → placeB)
 * transitions, and rewrites `routes[]` with fresh polylines:
 *   - With `GOOGLE_PLACES_API_KEY` set + a mode covered by Routes API
 *     (DRIVE/WALK/BICYCLE/TRANSIT) → real Google polyline, `stale: false`.
 *   - Otherwise → haversine straight-line + per-mode speed estimate,
 *     `stale: true` (the explor8 backend will refine on /import upload).
 *
 * Mode determination:
 *   - Preserves the mode of an existing route between the same placeIds.
 *   - For new pairs, uses a distance heuristic
 *     (≥200km TRAIN, ≥30km DRIVE, else WALK).
 *
 * Flags:
 *   --dry-run        Show diff, don't write
 *   --output <path>  Write to a different file (default: overwrites trip.json
 *                    with a .bak backup)
 *   --no-api         Force the haversine fallback even when the key is set
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { resolve } from "path";
import { resolveTripPaths } from "../lib/paths.ts";
import { log } from "../lib/log.ts";
import { TripSchema } from "../lib/schema.ts";
import type { z } from "zod/v4";

type Trip = z.infer<typeof TripSchema>;
type Route = Trip["routes"][number];
type TravelMode = Route["mode"];

interface Options {
  dryRun: boolean;
  output: string | null;
  noApi: boolean;
}

// ---- Haversine + estimates (mirror of explor8 src/lib/routes/sync.ts) ------

const EARTH_RADIUS_M = 6_371_000;

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);
  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

const SPEED_BY_MODE: Record<TravelMode, number> = {
  WALK: 1.4,
  BICYCLE: 4.2,
  DRIVE: 16.7,
  TRANSIT: 11.1,
  TRAIN: 27.8,
  FERRY: 6.9,
  FLIGHT: 222.0,
};

function secondsForMode(distanceMeters: number, mode: TravelMode): number {
  const speed = SPEED_BY_MODE[mode] ?? SPEED_BY_MODE.DRIVE;
  return Math.max(60, Math.round(distanceMeters / speed));
}

function secondsToIsoDuration(secs: number): string {
  if (secs <= 0) return "PT0S";
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours}H`);
  if (minutes) parts.push(`${minutes}M`);
  if (seconds || parts.length === 0) parts.push(`${seconds}S`);
  return `PT${parts.join("")}`;
}

function encodeStraightLinePolyline(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): string {
  return encodePoints([a, b]);
}

function encodePoints(points: Array<{ lat: number; lng: number }>): string {
  let prevLat = 0;
  let prevLng = 0;
  let out = "";
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    out += encodeSigned(lat - prevLat);
    out += encodeSigned(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

function encodeSigned(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = "";
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>>= 5;
  }
  out += String.fromCharCode(v + 63);
  return out;
}

// ---- Google Routes API call ------------------------------------------------

const ROUTES_API_COVERED = new Set<TravelMode>(["DRIVE", "WALK", "BICYCLE", "TRANSIT"]);

async function computeRouteViaGoogle(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: TravelMode,
  apiKey: string,
): Promise<{ polyline: string; duration: string; distance: number }> {
  const body = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: {
      location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
    },
    travelMode: mode,
    computeAlternativeRoutes: false,
    languageCode: "pt-BR",
  };

  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Routes API ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as {
    routes?: Array<{
      distanceMeters?: number;
      duration?: string;
      polyline?: { encodedPolyline?: string };
    }>;
  };
  const first = data.routes?.[0];
  if (!first?.polyline?.encodedPolyline) {
    throw new Error("Routes API returned no result");
  }
  const seconds = first.duration ? parseInt(first.duration.replace("s", ""), 10) : 0;
  return {
    polyline: first.polyline.encodedPolyline,
    duration: secondsToIsoDuration(seconds),
    distance: first.distanceMeters ?? 0,
  };
}

// ---- Schedule walker -------------------------------------------------------

interface SchedulePair {
  fromPlaceId: string;
  toPlaceId: string;
  existingMode?: TravelMode;
  existingRouteId?: string;
}

function walkSchedule(trip: Trip): SchedulePair[] {
  const pairs: SchedulePair[] = [];
  const routesById = new Map(trip.routes.map((r) => [r.id, r]));

  for (const day of trip.days) {
    let lastPlaceId: string | null = null;
    let pendingRouteId: string | null = null;
    for (const item of day.schedule) {
      if (item.placeId) {
        if (lastPlaceId && lastPlaceId !== item.placeId) {
          const existing = pendingRouteId ? routesById.get(pendingRouteId) : undefined;
          pairs.push({
            fromPlaceId: lastPlaceId,
            toPlaceId: item.placeId,
            existingMode: existing?.mode,
            existingRouteId: pendingRouteId ?? undefined,
          });
        }
        lastPlaceId = item.placeId;
        pendingRouteId = null;
      } else if (item.routeId) {
        pendingRouteId = item.routeId;
      }
    }
  }
  return pairs;
}

function guessMode(distanceMeters: number): TravelMode {
  if (distanceMeters >= 200_000) return "TRAIN";
  if (distanceMeters >= 30_000) return "DRIVE";
  return "WALK";
}

function routeIdFor(fromPlaceId: string, toPlaceId: string): string {
  return `${fromPlaceId}__to__${toPlaceId}`;
}

// ---- Main ------------------------------------------------------------------

export async function syncRoutes(slug: string, options: Options): Promise<void> {
  const paths = resolveTripPaths(slug);
  if (!existsSync(paths.tripJson)) {
    throw new Error(`trip.json not found at ${paths.tripJson}`);
  }

  const raw = readFileSync(paths.tripJson, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const trip = (
    typeof parsed === "object" && parsed && "trip" in parsed
      ? (parsed as { trip: Trip }).trip
      : (parsed as Trip)
  );
  if (!trip || !Array.isArray(trip.places) || !Array.isArray(trip.days)) {
    throw new Error("Input is not a valid trip JSON (missing places[] or days[])");
  }

  const placesById = new Map(trip.places.map((p) => [p.id, p]));
  const pairs = walkSchedule(trip);

  log.info(`Found ${pairs.length} (place → place) transitions in the schedule.`);

  const apiKey = options.noApi ? undefined : process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    log.info(
      options.noApi
        ? "--no-api: using haversine fallback for all routes."
        : "GOOGLE_PLACES_API_KEY not set — using haversine fallback.",
    );
  } else {
    log.info("Using Google Routes API (haversine fallback for FERRY/TRAIN/FLIGHT).");
  }

  const newRoutes: Route[] = [];
  const schedulePatchById = new Map<string, string>();

  for (const pair of pairs) {
    const from = placesById.get(pair.fromPlaceId);
    const to = placesById.get(pair.toPlaceId);
    if (!from || !to) {
      log.warn(`Skipping ${pair.fromPlaceId} → ${pair.toPlaceId} (place not in catalog)`);
      continue;
    }

    const haversineDist = haversineMeters(from.geo, to.geo);
    const mode: TravelMode = pair.existingMode ?? guessMode(haversineDist);

    let polyline: string;
    let duration: string;
    let distance: number;
    let stale = true;

    if (apiKey && ROUTES_API_COVERED.has(mode)) {
      try {
        const res = await computeRouteViaGoogle(from.geo, to.geo, mode, apiKey);
        polyline = res.polyline;
        duration = res.duration;
        distance = res.distance;
        stale = false;
      } catch (err) {
        log.warn(`  Routes API failed for ${pair.fromPlaceId} → ${pair.toPlaceId}: ${err}`);
        polyline = encodeStraightLinePolyline(from.geo, to.geo);
        distance = Math.round(haversineDist);
        duration = secondsToIsoDuration(secondsForMode(distance, mode));
      }
    } else {
      polyline = encodeStraightLinePolyline(from.geo, to.geo);
      distance = Math.round(haversineDist);
      duration = secondsToIsoDuration(secondsForMode(distance, mode));
    }

    const id = routeIdFor(pair.fromPlaceId, pair.toPlaceId);
    if (pair.existingRouteId) schedulePatchById.set(pair.existingRouteId, id);

    newRoutes.push({
      id,
      mode,
      endpoints: {
        from: { placeId: pair.fromPlaceId, geo: from.geo },
        to: { placeId: pair.toPlaceId, geo: to.geo },
      },
      polyline,
      duration,
      distance,
      ...(stale ? { stale: true } : {}),
    });

    const tag = stale ? "⚠" : "✓";
    log.info(
      `  ${tag} ${pair.fromPlaceId} → ${pair.toPlaceId} (${mode}, ${Math.round(haversineDist / 1000)}km, ${duration})`,
    );
  }

  // Dedup same-pair routes
  const dedupedRoutes = Array.from(new Map(newRoutes.map((r) => [r.id, r])).values());
  log.info(
    `Generated ${dedupedRoutes.length} unique routes (${newRoutes.length - dedupedRoutes.length} duplicate(s) collapsed).`,
  );

  // Patch schedule routeIds to the new naming scheme
  for (const day of trip.days) {
    for (const item of day.schedule) {
      if (item.routeId && schedulePatchById.has(item.routeId)) {
        item.routeId = schedulePatchById.get(item.routeId)!;
      }
    }
  }

  trip.routes = dedupedRoutes;

  if (options.dryRun) {
    log.info(`\n--dry-run: no file written. routes[] would be ${trip.routes.length}.`);
    return;
  }

  const outputPath = options.output ? resolve(options.output) : paths.tripJson;
  if (outputPath === paths.tripJson) {
    const backupPath = `${paths.tripJson}.bak`;
    copyFileSync(paths.tripJson, backupPath);
    log.info(`Backup written: ${backupPath}`);
  }

  const updatedJson =
    typeof parsed === "object" && parsed && "trip" in parsed
      ? JSON.stringify({ trip }, null, 2)
      : JSON.stringify(trip, null, 2);
  writeFileSync(outputPath, updatedJson + "\n", "utf8");
  log.info(`Output: ${outputPath}`);
}
