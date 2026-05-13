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
 *   - "overview" hides WALK (clutters at country scale) and FLIGHT (drags
 *     bounds to the origin continent — usually a different hemisphere from the
 *     trip's actual scope).
 *   - A specific day shows only routes referenced by that day's schedule
 *     (all modes — flight is shown on the day it happens).
 *
 * @param {import("./schema-types.js").Route[]} routes
 * @param {"overview" | { dayIndex: number }} view  — dayIndex is 0-based
 * @param {import("./schema-types.js").Day[]} days
 */
export function visibleRoutes(routes, view, days) {
  if (view === "overview") {
    return routes.filter((r) => r.mode !== "WALK" && r.mode !== "FLIGHT");
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
