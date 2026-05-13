/**
 * Hydration helpers — resolve schedule item references against the top-level
 * Place / Route catalogs, and compute which places are "ideas" (in the
 * catalog but not on any day's schedule).
 *
 * Built once per trip, shared between day-card.js + both map renderers.
 */

/**
 * @param {import("./schema-types.js").Trip} trip
 * @returns {{
 *   placesById: Map<string, import("./schema-types.js").Place>,
 *   routesById: Map<string, import("./schema-types.js").Route>,
 *   scheduledPlaceIds: Set<string>,
 *   scheduledRouteIds: Set<string>,
 *   placeToDays: Map<string, number[]>,
 * }}
 */
export function buildHydration(trip) {
  const placesById = new Map((trip.places || []).map((p) => [p.id, p]));
  const routesById = new Map((trip.routes || []).map((r) => [r.id, r]));
  const scheduledPlaceIds = new Set();
  const scheduledRouteIds = new Set();
  /** Map<placeId, dayIndex[]> — 0-based day indexes referencing this place. */
  const placeToDays = new Map();

  (trip.days || []).forEach((day, idx) => {
    for (const item of day.schedule || []) {
      if (item.placeId) {
        scheduledPlaceIds.add(item.placeId);
        const arr = placeToDays.get(item.placeId) || [];
        if (!arr.includes(idx)) arr.push(idx);
        placeToDays.set(item.placeId, arr);
      }
      if (item.routeId) scheduledRouteIds.add(item.routeId);
    }
  });

  return { placesById, routesById, scheduledPlaceIds, scheduledRouteIds, placeToDays };
}

/**
 * Hydrate a ScheduleItem into a renderable shape that exposes the place /
 * route's display fields (name, picture, popularity, ...) merged with the
 * per-occurrence overrides (cost, notes, insights).
 *
 * Returns one of three shapes:
 *   - { kind: "place",   place,  item }
 *   - { kind: "route",   route,  item }
 *   - { kind: "generic", item }    — `name`/`category`/`cost` come from item
 *
 * @param {import("./schema-types.js").ScheduleItem} item
 * @param {ReturnType<typeof buildHydration>} ctx
 */
export function hydrateScheduleItem(item, ctx) {
  if (item.placeId) {
    const place = ctx.placesById.get(item.placeId);
    if (place) return { kind: "place", place, item };
  }
  if (item.routeId) {
    const route = ctx.routesById.get(item.routeId);
    if (route) return { kind: "route", route, item };
  }
  return { kind: "generic", item };
}

/**
 * Resolve a booking against the place catalog (no-op if no placeId).
 *
 * @param {import("./schema-types.js").Booking} booking
 * @param {ReturnType<typeof buildHydration>} ctx
 */
export function hydrateBooking(booking, ctx) {
  if (!booking.placeId) return { booking, place: null };
  return { booking, place: ctx.placesById.get(booking.placeId) || null };
}
