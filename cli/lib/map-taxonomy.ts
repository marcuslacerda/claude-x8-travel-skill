/**
 * Map data taxonomy — legacy → new (category, kind) lookup.
 *
 * The new schema splits a single 17-value enum into a 5-value `category`
 * × ~25-value `kind` (see schema.ts and docs/format-conventions.md).
 *
 * `kind` is unique across categories so KML <styleUrl> can stay single-token
 * (e.g. `#lake`, `#camp`) and we map kind → category here.
 */

import type { z } from "zod/v4";
import type { MapPOICategorySchema, MapPOIKindSchema } from "./schema.ts";

export type MapPOICategory = z.infer<typeof MapPOICategorySchema>;
export type MapPOIKind = z.infer<typeof MapPOIKindSchema>;

/**
 * Legacy single-token id (KML <styleUrl> or old JSON `category`) → new (category, kind).
 *
 * Notes:
 *  - `start-end` defaults to `transport / headline`. Roundtrips need a manual
 *    flip of the second occurrence to `destination` (the parser does this by
 *    detecting "Return" in the description, see kml-to-mapdata.ts).
 *  - `aventura` (legacy "via ferrata, climbing") maps to `attraction / adventure`.
 *  - `vila` keeps its name — Portuguese for "small village"; English has no
 *    concise equivalent and the icon table tolerates it.
 */
export const LEGACY_TO_NEW: Record<string, { category: MapPOICategory; kind: MapPOIKind }> = {
  "start-end": { category: "transport", kind: "headline" },
  city: { category: "attraction", kind: "city" },
  trekking: { category: "attraction", kind: "trek" },
  lago: { category: "attraction", kind: "lake" },
  castelo: { category: "attraction", kind: "castle" },
  natureza: { category: "attraction", kind: "nature" },
  basecamp: { category: "stay", kind: "camp" },
  restaurante: { category: "food", kind: "restaurant" },
  scenic: { category: "attraction", kind: "scenic" },
  aventura: { category: "attraction", kind: "adventure" },
  waterfall: { category: "attraction", kind: "waterfall" },
  viewpoint: { category: "attraction", kind: "viewpoint" },
  caverna: { category: "attraction", kind: "cave" },
  wellness: { category: "attraction", kind: "wellness" },
  vila: { category: "attraction", kind: "vila" },
  unesco: { category: "attraction", kind: "unesco" },
  memorial: { category: "attraction", kind: "memorial" },
};

/** Reverse direction: new kind → category (since kinds are globally unique). */
export const KIND_TO_CATEGORY: Record<MapPOIKind, MapPOICategory> = {
  // attraction
  nature: "attraction",
  lake: "attraction",
  castle: "attraction",
  trek: "attraction",
  scenic: "attraction",
  viewpoint: "attraction",
  waterfall: "attraction",
  cave: "attraction",
  city: "attraction",
  vila: "attraction",
  unesco: "attraction",
  memorial: "attraction",
  wellness: "attraction",
  adventure: "attraction",
  // stay
  hotel: "stay",
  camp: "stay",
  apartment: "stay",
  // food
  restaurant: "food",
  coffee: "food",
  bar: "food",
  // shopping
  shop: "shopping",
  market: "shopping",
  // transport
  headline: "transport",
  destination: "transport",
  ferry: "transport",
  parking: "transport",
  station: "transport",
};

/**
 * Resolve a token (legacy category id like `lago`, OR a new kind id like
 * `lake`) into a (category, kind) pair. Throws if unknown.
 */
export function resolveCategoryKind(token: string): { category: MapPOICategory; kind: MapPOIKind } {
  const legacy = LEGACY_TO_NEW[token];
  if (legacy) return legacy;

  const kind = token as MapPOIKind;
  const category = KIND_TO_CATEGORY[kind];
  if (category) return { category, kind };

  throw new Error(
    `Unknown map taxonomy token: "${token}". Expected legacy category (e.g. lago, basecamp) or new kind (e.g. lake, camp).`,
  );
}

/**
 * Generate a stable kebab-case id from a name, with a numeric suffix on
 * collision against `existing`. Mutates `existing` to record the new id.
 *
 *   "Lago di Garda"          → "lago-di-garda"
 *   "Lago di Garda" (again)  → "lago-di-garda-2"
 */
export function genStableId(name: string, existing: Set<string>): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!base) {
    let n = 1;
    while (existing.has(`poi-${n}`)) n++;
    const id = `poi-${n}`;
    existing.add(id);
    return id;
  }

  if (!existing.has(base)) {
    existing.add(base);
    return base;
  }

  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  const id = `${base}-${n}`;
  existing.add(id);
  return id;
}

/**
 * Parse a route name's day prefix and resolve it to dayNum given the trip's
 * start date (YYYY-MM-DD).
 *
 * Recognized formats:
 *   "Jun 11 (Thu): Venezia → Postojna ..."   (date + day-of-week)
 *   "Jun 11: Venezia → Postojna ..."          (date only)
 *   "Day 7: Edinburgh Airport → ..."          (explicit dayNum)
 *
 * Returns undefined if the prefix doesn't parse (caller decides to warn).
 */
export function parseRouteDayNum(routeName: string, tripStartDate: string): number | undefined {
  const dayMatch = /^Day\s+(\d{1,2})\b/.exec(routeName);
  if (dayMatch) {
    const n = parseInt(dayMatch[1], 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  const dateMatch = /^([A-Z][a-z]{2})\s+(\d{1,2})/.exec(routeName);
  if (!dateMatch) return undefined;
  const monthName = dateMatch[1];
  const day = parseInt(dateMatch[2], 10);
  const months: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };
  const month = months[monthName];
  if (month === undefined) return undefined;

  const start = new Date(`${tripStartDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return undefined;
  let year = start.getUTCFullYear();
  if (month < start.getUTCMonth()) year += 1;
  const routeDate = new Date(Date.UTC(year, month, day));

  const diffDays = Math.round((routeDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return undefined;
  return diffDays + 1;
}
