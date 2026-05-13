/**
 * Migrate a v2 trip (trip.json + map.json) into a single v3 Trip document.
 *
 * Usage (CLI):
 *   pnpm exec tsx tools/migrate-v2-to-v3.ts <slug>
 *   pnpm exec tsx tools/migrate-v2-to-v3.ts <slug> --trips      # read from trips/<slug>/
 *
 * If `<dir>/trip.legacy.json` and `<dir>/map.legacy.json` exist, they are read
 * (post-cutover state). Otherwise reads `<dir>/trip.json` + `<dir>/map.json`.
 * Always writes `<dir>/trip.json` as the v3 output.
 *
 * Programmatic:
 *   import { migrateV2toV3 } from "./tools/migrate-v2-to-v3.ts";
 *   const { trip, warnings } = migrateV2toV3(tripV2Json, mapV2Json);
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import polylineCodec from "@googlemaps/polyline-codec";
const { encode } = polylineCodec;
import {
  type Day,
  type ExperienceLink,
  type Insight,
  type Picture,
  type Place,
  type Route,
  type ScheduleItem,
  type TravelMode,
  type Trip,
  TripSchema,
} from "../cli/lib/schema.ts";

// ---------------------------------------------------------------------------
// v2 input types (loose — v2 schema is no longer exported from schema.ts)
// ---------------------------------------------------------------------------

interface V2POI {
  id: string;
  lat: number;
  lng: number;
  name: string;
  category: string;
  kind?: string;
  source?: string;
  description?: string;
  popularity?: number;
  dayNum?: number | number[];
}

interface V2RouteCoord {
  lat: number;
  lng: number;
}

interface V2Route {
  id: string;
  name?: string;
  color?: string;
  kind: string; // driving | walking | ferry | transit | flight | train
  dayNum?: number | number[];
  coordinates: V2RouteCoord[];
}

interface V2Experience {
  type: "experience";
  time?: string;
  name: string;
  desc?: string;
  notes?: string;
  cost?: number;
  category: string;
  kind?: string;
  source?: string;
  picture?: string;
  links?: ExperienceLink[];
  poiId?: string;
  popularity?: number;
}

interface V2Transfer {
  type: "transfer";
  time?: string;
  from: { name: string; lat: number; lng: number };
  to: { name: string; lat: number; lng: number };
  model: string; // drive | walk | ferry | flight | train
  duration: number; // minutes
  distance?: number; // km
  cost?: number;
  notes?: string;
}

interface V2Insight {
  type: "insight";
  highlights?: string[];
  warnings?: string[];
}

type V2ScheduleItem = V2Experience | V2Transfer | V2Insight;

interface V2Day {
  num: string;
  title: string;
  cls?: string;
  desc?: string;
  schedule?: V2ScheduleItem[];
  dayCost?: string;
  planB?: string;
}

interface V2Trip {
  slug: string;
  title: string;
  destination: { startLocation: string; headlineTo: string; headlineFrom: string };
  startDate?: string;
  status: string;
  currency: string;
  homeCurrency?: string;
  timezone?: string;
  coverImage?: string;
  ogImage?: string;
  isPublic?: boolean;
  days: V2Day[];
  checklist?: unknown[];
  bookings?: unknown[];
  budget?: unknown[];
}

interface V2MapData {
  pois: V2POI[];
  routes: V2Route[];
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const TRANSFER_MODE_MAP: Record<string, TravelMode> = {
  drive: "DRIVE",
  walk: "WALK",
  ferry: "FERRY",
  flight: "FLIGHT",
  train: "TRAIN",
};

const ROUTE_KIND_MAP: Record<string, TravelMode> = {
  driving: "DRIVE",
  walking: "WALK",
  ferry: "FERRY",
  transit: "TRANSIT",
  flight: "FLIGHT",
  train: "TRAIN",
};

const DEFAULT_STAY_TIME = "20:00"; // for camping/pernoite without explicit time
const DEFAULT_TRANSFER_TIME = "00:00"; // for transfers without time (rare)
const SYNTHESIZED_ROUTE_FALLBACK_DURATION = "PT5M";
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface MigrateWarnings {
  synthesizedRoutes: number;
  orphanInsights: number;
  highPrecisionInputs: number;
  multiDayStaysSynthesized: number;
  unmappedTransfers: number;
  pictureConflicts: string[];
  malformedTimes: string[];
}

interface MigrateOpts {
  /** Called with each non-fatal warning. */
  warn?: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function migrateV2toV3(
  tripV2: V2Trip,
  mapV2: V2MapData,
  opts: MigrateOpts = {},
): { trip: Trip; warnings: MigrateWarnings } {
  const warn = opts.warn ?? (() => {});
  const warnings: MigrateWarnings = {
    synthesizedRoutes: 0,
    orphanInsights: 0,
    highPrecisionInputs: 0,
    multiDayStaysSynthesized: 0,
    unmappedTransfers: 0,
    pictureConflicts: [],
    malformedTimes: [],
  };

  // --- Step 1: collect picture + links per poiId (first Experience with picture wins). ---
  const picturesByPoiId = new Map<string, string>();
  const linksByPoiId = new Map<string, ExperienceLink[]>();
  for (const d of tripV2.days) {
    for (const item of d.schedule ?? []) {
      if (item.type !== "experience" || !item.poiId) continue;
      if (item.picture) {
        const prev = picturesByPoiId.get(item.poiId);
        if (prev && prev !== item.picture) {
          warnings.pictureConflicts.push(`${item.poiId}: prefer "${prev}", drop "${item.picture}"`);
        } else if (!prev) {
          picturesByPoiId.set(item.poiId, item.picture);
        }
      }
      if (item.links && item.links.length > 0 && !linksByPoiId.has(item.poiId)) {
        linksByPoiId.set(item.poiId, item.links);
      }
    }
  }

  // --- Step 2: places[] from mapV2.pois ---
  const places: Place[] = mapV2.pois.map((poi): Place => {
    const picUrl = picturesByPoiId.get(poi.id);
    const picture: Picture | undefined = picUrl
      ? {
          url: picUrl,
          source: detectPictureSource(picUrl),
          ...creditFor(picUrl),
        }
      : undefined;
    const links = linksByPoiId.get(poi.id);
    return {
      id: poi.id,
      name: poi.name,
      geo: { lat: poi.lat, lng: poi.lng },
      category: poi.category as Place["category"],
      ...(poi.kind && { kind: poi.kind as Place["kind"] }),
      ...(poi.source && { source: poi.source as Place["source"] }),
      ...(poi.popularity != null && { popularity: poi.popularity }),
      ...(poi.description && { description: poi.description }),
      ...(picture && { picture }),
      ...(links && { links }),
    };
  });

  // --- Step 3: routes[] from mapV2.routes (matched with transfers) + synthesized transfers. ---
  const routes: Route[] = [];
  const transferToRouteId = new Map<V2Transfer, string>();

  // 3a: map each v2 Route → v3 Route, matching against transfers for duration/distance.
  //
  // v2 stored ONE polyline per day (the full driving trace for that day, often
  // covering multiple intermediate stops). v3 expects per-leg routes. We can't
  // cheaply decompose the polyline by leg, so we match the v2 polyline to the
  // FIRST drive transfer of the day (by time) — it renders the full day-driving
  // trace via that one anchor, and the intra-day legs get 2-vertex synthesized
  // polylines via step 3b.
  //
  // Matching strategy (in order, first wins):
  //   1. Strict: both endpoints within 1km → unambiguous match.
  //   2. Anchored: route.first within 1km of transfer.from (any drive transfer).
  for (const r of mapV2.routes) {
    const rDays = Array.isArray(r.dayNum) ? r.dayNum : r.dayNum != null ? [r.dayNum] : [];
    let matchedTransfer: V2Transfer | null = null;

    // Collect candidate transfers from listed days (chronologically — same order as schedule[]).
    const candidates: V2Transfer[] = [];
    for (const dayNum of rDays) {
      const day = tripV2.days.find((d) => Number.parseInt(d.num) === dayNum);
      if (!day) continue;
      for (const item of day.schedule ?? []) {
        if (item.type !== "transfer") continue;
        if (transferToRouteId.has(item)) continue;
        candidates.push(item);
      }
    }

    if (r.coordinates.length >= 2) {
      const first = r.coordinates[0];
      const last = r.coordinates[r.coordinates.length - 1];

      // Strategy 1: strict (both endpoints).
      for (const item of candidates) {
        const distFrom = haversineMeters(first, item.from);
        const distTo = haversineMeters(last, item.to);
        if (distFrom < 1000 && distTo < 1000) {
          matchedTransfer = item;
          break;
        }
      }

      // Strategy 2: anchored (first endpoint only — handles multi-leg day routes).
      if (!matchedTransfer) {
        for (const item of candidates) {
          const distFrom = haversineMeters(first, item.from);
          if (distFrom < 1000) {
            matchedTransfer = item;
            break;
          }
        }
      }
    }

    if (matchedTransfer) {
      transferToRouteId.set(matchedTransfer, r.id);
    }

    // Precision warning
    if (r.coordinates.some((c) => decimalPlaces(c.lat) > 5 || decimalPlaces(c.lng) > 5)) {
      warnings.highPrecisionInputs++;
    }

    const mode = ROUTE_KIND_MAP[r.kind] ?? "DRIVE";
    const polyline = encode(
      r.coordinates.map((c) => [c.lat, c.lng]),
      5,
    );
    const duration = matchedTransfer
      ? minutesToIso(matchedTransfer.duration)
      : SYNTHESIZED_ROUTE_FALLBACK_DURATION;
    const distance = matchedTransfer?.distance
      ? Math.round(matchedTransfer.distance * 1000)
      : undefined;
    const notes = matchedTransfer?.notes;

    routes.push({
      id: r.id,
      ...(r.name && { name: r.name }),
      mode,
      polyline,
      duration,
      ...(distance != null && { distance }),
      ...(notes && { notes }),
    });
  }

  // 3b: synthesize a Route for each Transfer that didn't match a v2 Route.
  for (const d of tripV2.days) {
    const dayNum = Number.parseInt(d.num);
    let transferIndex = 0;
    for (const item of d.schedule ?? []) {
      if (item.type !== "transfer") {
        continue;
      }
      if (!transferToRouteId.has(item)) {
        const synId = `transfer-day${dayNum}-${transferIndex}`;
        const mode = TRANSFER_MODE_MAP[item.model] ?? "DRIVE";
        const polyline = encode(
          [
            [item.from.lat, item.from.lng],
            [item.to.lat, item.to.lng],
          ],
          5,
        );
        const distance = item.distance ? Math.round(item.distance * 1000) : undefined;
        routes.push({
          id: synId,
          name: `${item.from.name} → ${item.to.name}`,
          mode,
          polyline,
          duration: minutesToIso(item.duration),
          ...(distance != null && { distance }),
          ...(item.notes && { notes: item.notes }),
        });
        transferToRouteId.set(item, synId);
        warnings.synthesizedRoutes++;
      }
      transferIndex++;
    }
  }

  // --- Step 4: days[] (sorted by num) ---
  const sortedDays = [...tripV2.days].sort(
    (a, b) => Number.parseInt(a.num) - Number.parseInt(b.num),
  );

  const days: Day[] = sortedDays.map((d): Day => {
    const schedule: ScheduleItem[] = [];
    const dayInsights: Insight[] = [];

    for (const item of d.schedule ?? []) {
      if (item.type === "insight") {
        const insight = sanitizeInsight(item);
        if (!insight) continue;
        const prev = schedule[schedule.length - 1];
        if (prev) {
          (prev.insights ??= []).push(insight);
        } else {
          dayInsights.push(insight);
          warnings.orphanInsights++;
        }
      } else if (item.type === "experience") {
        const time = normalizeTime(item.time, DEFAULT_STAY_TIME, warnings);
        const note = item.notes ?? item.desc;
        if (item.poiId) {
          schedule.push({
            time,
            placeId: item.poiId,
            ...(item.cost != null && { cost: item.cost }),
            ...(note && { notes: note }),
          });
        } else {
          schedule.push({
            time,
            name: item.name,
            ...(item.category && { category: item.category as ScheduleItem["category"] }),
            ...(item.cost != null && { cost: item.cost }),
            ...(note && { notes: note }),
          });
        }
      } else if (item.type === "transfer") {
        const routeId = transferToRouteId.get(item);
        if (!routeId) {
          warnings.unmappedTransfers++;
          warn(`Unmapped transfer at day ${d.num} time ${item.time ?? "?"}: skipped`);
          continue;
        }
        const time = normalizeTime(item.time, DEFAULT_TRANSFER_TIME, warnings);
        schedule.push({
          time,
          routeId,
          ...(item.cost != null && { cost: item.cost }),
        });
      }
    }

    return {
      title: d.title,
      ...(d.cls && { cls: d.cls }),
      schedule,
      ...(dayInsights.length > 0 && { insights: dayInsights }),
      ...(d.planB && { planB: d.planB }),
      ...(d.dayCost && { dayCost: d.dayCost }),
    };
  });

  // --- Step 5: multi-day stay synthesis (R3) ---
  for (const poi of mapV2.pois) {
    if (!Array.isArray(poi.dayNum)) continue;
    for (const dayNum of poi.dayNum) {
      const day = days[dayNum - 1];
      if (!day) continue;
      if (day.schedule.some((s) => s.placeId === poi.id)) continue;
      day.schedule.push({ time: DEFAULT_STAY_TIME, placeId: poi.id });
      warnings.multiDayStaysSynthesized++;
    }
  }

  // --- Step 6: validate against TripSchema ---
  const trip = TripSchema.parse({
    schemaVersion: 3,
    slug: tripV2.slug,
    title: tripV2.title,
    destination: tripV2.destination,
    ...(tripV2.startDate && { startDate: tripV2.startDate }),
    status: tripV2.status as Trip["status"],
    currency: tripV2.currency,
    ...(tripV2.homeCurrency && { homeCurrency: tripV2.homeCurrency }),
    ...(tripV2.timezone && { timezone: tripV2.timezone }),
    ...(tripV2.coverImage && { coverImage: tripV2.coverImage }),
    ...(tripV2.ogImage && { ogImage: tripV2.ogImage }),
    ...(tripV2.isPublic != null && { isPublic: tripV2.isPublic }),
    places,
    routes,
    days,
    ...(tripV2.checklist && { checklist: tripV2.checklist }),
    ...(tripV2.bookings && { bookings: tripV2.bookings }),
    ...(tripV2.budget && { budget: tripV2.budget }),
  });

  // Surface picture conflicts via the warn callback
  for (const c of warnings.pictureConflicts) {
    warn(`Picture conflict — ${c}`);
  }
  if (warnings.highPrecisionInputs > 0) {
    warn(
      `${warnings.highPrecisionInputs} v2 route(s) had coordinates with >5 decimal precision; encode quantized to ~1.1m.`,
    );
  }

  return { trip, warnings };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sanitizeInsight(item: V2Insight): Insight | null {
  const highlights = item.highlights?.filter((s) => s && s.trim().length > 0);
  const warnings_ = item.warnings?.filter((s) => s && s.trim().length > 0);
  if ((!highlights || highlights.length === 0) && (!warnings_ || warnings_.length === 0)) {
    return null;
  }
  return {
    ...(highlights && highlights.length > 0 && { highlights }),
    ...(warnings_ && warnings_.length > 0 && { warnings: warnings_ }),
  };
}

function normalizeTime(t: string | undefined, fallback: string, w: MigrateWarnings): string {
  if (!t) return fallback;
  // Pad "9:00" → "09:00"
  const padded = /^\d:\d{2}$/.test(t) ? `0${t}` : t;
  if (HHMM_RE.test(padded)) return padded;
  w.malformedTimes.push(t);
  return fallback;
}

function minutesToIso(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "PT1M";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `PT${h}H${m}M`;
  if (h > 0) return `PT${h}H`;
  return `PT${m}M`;
}

function detectPictureSource(url: string): NonNullable<Picture["source"]> {
  if (/(wikipedia|wikimedia)\.org/i.test(url)) return "wikipedia";
  if (/(googleusercontent|maps\.googleapis|lh\d\.googleusercontent)/i.test(url)) {
    return "google-places";
  }
  if (/unsplash\.com/i.test(url)) return "unsplash";
  return "custom";
}

function creditFor(url: string): { credit?: string } {
  if (/(wikipedia|wikimedia)\.org/i.test(url)) return { credit: "Wikimedia Commons" };
  if (/unsplash\.com/i.test(url)) return { credit: "Unsplash" };
  return {};
}

function decimalPlaces(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const s = String(n);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function isMain(): boolean {
  return import.meta.url === `file://${process.argv[1]}`;
}

if (isMain()) {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith("--"));
  if (!slug) {
    console.error("Usage: pnpm exec tsx tools/migrate-v2-to-v3.ts <slug> [--trips] [--out <file>]");
    process.exit(1);
  }
  const fromTrips = args.includes("--trips");
  const dir = `./${fromTrips ? "trips" : "examples"}/${slug}`;
  const tripV2Path = existsSync(`${dir}/trip.legacy.json`)
    ? `${dir}/trip.legacy.json`
    : `${dir}/trip.json`;
  const mapV2Path = existsSync(`${dir}/map.legacy.json`)
    ? `${dir}/map.legacy.json`
    : `${dir}/map.json`;
  if (!existsSync(tripV2Path) || !existsSync(mapV2Path)) {
    console.error(`Missing input: ${tripV2Path} or ${mapV2Path}`);
    process.exit(1);
  }
  const tripV2 = JSON.parse(readFileSync(tripV2Path, "utf8")) as V2Trip;
  const mapV2 = JSON.parse(readFileSync(mapV2Path, "utf8")) as V2MapData;

  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? args[outIdx + 1] : `${dir}/trip.json`;

  const { trip, warnings } = migrateV2toV3(tripV2, mapV2, {
    warn: (m) => console.warn(`  ⚠ ${m}`),
  });

  console.log(`Slug: ${trip.slug}`);
  console.log(`Places: ${trip.places.length}`);
  console.log(`Routes: ${trip.routes.length} (${warnings.synthesizedRoutes} synthesized)`);
  console.log(`Days: ${trip.days.length}`);
  console.log(`Orphan insights → day.insights: ${warnings.orphanInsights}`);
  console.log(`Multi-day stays synthesized: ${warnings.multiDayStaysSynthesized}`);
  console.log(`High-precision inputs: ${warnings.highPrecisionInputs}`);
  console.log(`Malformed times: ${warnings.malformedTimes.length}`);
  console.log(`Picture conflicts: ${warnings.pictureConflicts.length}`);
  console.log(`Unmapped transfers (dropped): ${warnings.unmappedTransfers}`);

  writeFileSync(outPath, JSON.stringify(trip, null, 2));
  console.log(`\n✓ Wrote ${outPath}`);
}
