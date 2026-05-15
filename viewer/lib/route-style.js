/**
 * Route styling for the map renderers (MapLibre + Google Maps).
 *
 * Color is derived from `route.mode` — never stored in the JSON. Stroke
 * weight / opacity bump for tagged routes ("scenic", "highlight"). FLIGHT
 * gets a dashed pattern.
 */

/** @type {Record<import("./schema-types.js").TravelMode, string>} */
export const ROUTE_COLOR_BY_MODE = {
  DRIVE: "#4477aa",
  WALK: "#228833",
  BICYCLE: "#88aa22",
  TRANSIT: "#aa4488",
  TRAIN: "#aa6644",
  FLIGHT: "#cc4400",
  FERRY: "#44aaff",
};

/**
 * Return MapLibre-compatible style properties for a route. Same numbers feed
 * Google Maps Polyline `strokeColor`/`strokeWeight`/`strokeOpacity`.
 *
 * @param {import("./schema-types.js").Route} route
 */
export function getRouteStyle(route) {
  const base = ROUTE_COLOR_BY_MODE[route.mode] || "#888888";
  const tags = route.tags || [];
  const isHighlight = tags.includes("highlight");
  const isScenic = tags.includes("scenic");
  return {
    strokeColor: base,
    strokeWeight: isHighlight ? 5 : isScenic ? 4 : 3,
    strokeOpacity: isHighlight || isScenic ? 0.9 : 0.7,
    /** Dashed pattern for FLIGHT (Google polyline icons) and FERRY (MapLibre line-dasharray). */
    isDashed: route.mode === "FLIGHT",
  };
}

/**
 * Filter routes by current view:
 *   - "overview" surfaces the inter-stay transitions only. A day participates
 *     when its stay differs from the next day's — the days that actually move
 *     the traveler somewhere new. WALK and FLIGHT remain excluded as before.
 *   - A specific day shows every route referenced by that day's schedule.
 *
 * Falls back to the legacy mode-only filter when `placesById` isn't
 * provided — used by call sites that don't have the catalog handy.
 *
 * @param {import("./schema-types.js").Route[]} routes
 * @param {"overview" | { dayIndex: number }} view  — dayIndex is 0-based
 * @param {import("./schema-types.js").Day[]} days
 * @param {Map<string, import("./schema-types.js").Place>} [placesById]
 */
export function visibleRoutes(routes, view, days, placesById) {
  if (view === "overview") {
    if (!placesById || placesById.size === 0) {
      return routes.filter((r) => r.mode !== "WALK" && r.mode !== "FLIGHT");
    }
    const includedDayIdx = new Set();
    for (let i = 0; i < days.length - 1; i++) {
      const here = findStayPlaceId(days[i], placesById);
      const next = findStayPlaceId(days[i + 1], placesById);
      if (here !== next) includedDayIdx.add(i);
    }
    const routeIds = new Set();
    for (const idx of includedDayIdx) {
      for (const item of days[idx].schedule) {
        if (item.routeId) routeIds.add(item.routeId);
      }
    }
    return routes.filter(
      (r) => routeIds.has(r.id) && r.mode !== "WALK" && r.mode !== "FLIGHT",
    );
  }
  const day = days[view.dayIndex];
  if (!day) return [];
  const ids = new Set();
  for (const item of day.schedule) {
    if (item.routeId) ids.add(item.routeId);
  }
  return routes.filter((r) => ids.has(r.id));
}

/**
 * Walk the day's schedule in reverse to find the placeId whose category is
 * "stay". Mirrors `findStay` in explor8 — the stay is the last `placeId` in
 * the schedule that references a Place with `category: "stay"`.
 *
 * @param {import("./schema-types.js").Day} day
 * @param {Map<string, import("./schema-types.js").Place>} placesById
 * @returns {string | null}
 */
function findStayPlaceId(day, placesById) {
  const sched = day.schedule || [];
  for (let i = sched.length - 1; i >= 0; i--) {
    const item = sched[i];
    if (!item.placeId) continue;
    const place = placesById.get(item.placeId);
    if (place && place.category === "stay") return item.placeId;
  }
  return null;
}

/**
 * Filter places that should NOT render on the map (regardless of category filter).
 *
 * Currently: `kind: "headline"` is the trip's origin (e.g. home airport) —
 * it's referenced from the schedule for context but its location is by
 * definition outside the trip's regional scope and would just drag the map
 * bounds to a different continent.
 *
 * @param {import("./schema-types.js").Place[]} places
 */
export function mappablePlaces(places) {
  return places.filter((p) => p.kind !== "headline");
}
