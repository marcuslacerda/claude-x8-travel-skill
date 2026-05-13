/**
 * Guardrail for the viewer's day-binding hydration rule.
 *
 * The viewer derives "which days a place appears on" from
 * `days[N].schedule[].placeId`. On top of that, stay places (category="stay")
 * get an extra derived "checkout day" — the day after each contiguous run of
 * scheduled nights. This keeps stay icons visible on the morning the traveler
 * is leaving, even when the day's schedule doesn't reference the stay.
 *
 * If anyone refactors `viewer/lib/hydrate.js` and accidentally drops this
 * post-processing step, these tests catch it. See also `skill/SKILL.md`
 * → "Day binding (v3 — derived, not stored)".
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain JS module imported by the viewer at runtime; vitest resolves ESM directly.
import { buildHydration } from "../viewer/lib/hydrate.js";

type Place = {
  id: string;
  category: "attraction" | "stay" | "food" | "shopping" | "transport" | "custom";
  kind?: string;
  name: string;
  geo: { lat: number; lng: number };
};
type ScheduleItem = { time: string; placeId?: string; routeId?: string; name?: string };
type Day = { schedule?: ScheduleItem[] };
type Trip = { places: Place[]; routes: unknown[]; days: Day[] };

function tripOf(places: Place[], days: Day[]): Trip {
  return { places, routes: [], days };
}
function stay(id: string): Place {
  return { id, category: "stay", kind: "camp", name: id, geo: { lat: 0, lng: 0 } };
}
function place(id: string, category: Place["category"]): Place {
  return { id, category, name: id, geo: { lat: 0, lng: 0 } };
}
function night(placeId: string): ScheduleItem {
  return { time: "20:00", placeId };
}
function block(name: string): ScheduleItem {
  return { time: "09:00", name };
}

describe("buildHydration — stay checkout day rule", () => {
  it("adds the checkout day for a contiguous stay", () => {
    const trip = tripOf(
      [stay("camp-bled")],
      [
        { schedule: [night("camp-bled")] }, // day 0 — check-in night
        { schedule: [night("camp-bled")] }, // day 1
        { schedule: [night("camp-bled")] }, // day 2 — last night
        { schedule: [block("Drive to next stop")] }, // day 3 — checkout (no explicit placeId)
      ],
    );
    const h = buildHydration(trip);
    expect(h.placeToDays.get("camp-bled")).toEqual([0, 1, 2, 3]);
  });

  it("adds a checkout day at the end of each non-contiguous stretch", () => {
    const trip = tripOf(
      [stay("camp-rev")],
      [
        { schedule: [night("camp-rev")] }, // 0
        { schedule: [night("camp-rev")] }, // 1 — last of stretch A
        { schedule: [block("Travel")] }, // 2 — checkout A
        { schedule: [block("Travel")] }, // 3
        { schedule: [night("camp-rev")] }, // 4 — only night of stretch B
        { schedule: [block("Drive home")] }, // 5 — checkout B
      ],
    );
    const h = buildHydration(trip);
    expect(h.placeToDays.get("camp-rev")).toEqual([0, 1, 2, 4, 5]);
  });

  it("does not add a checkout day when the stay is on the trip's last day", () => {
    const trip = tripOf(
      [stay("hotel-last")],
      [
        { schedule: [night("hotel-last")] }, // 0
        { schedule: [night("hotel-last")] }, // 1 — last day of trip
      ],
    );
    const h = buildHydration(trip);
    expect(h.placeToDays.get("hotel-last")).toEqual([0, 1]); // no out-of-bounds index
  });

  it("does not extend non-stay places (attraction, food, transport, etc.)", () => {
    const trip = tripOf(
      [
        place("att-museum", "attraction"),
        place("food-trattoria", "food"),
        place("park-lot", "transport"),
      ],
      [
        { schedule: [{ time: "10:00", placeId: "att-museum" }] }, // 0
        { schedule: [{ time: "12:00", placeId: "food-trattoria" }] }, // 1
        { schedule: [{ time: "18:00", placeId: "park-lot" }] }, // 2
        { schedule: [block("Free")] }, // 3 — must NOT pull any of the above
      ],
    );
    const h = buildHydration(trip);
    expect(h.placeToDays.get("att-museum")).toEqual([0]);
    expect(h.placeToDays.get("food-trattoria")).toEqual([1]);
    expect(h.placeToDays.get("park-lot")).toEqual([2]);
  });

  it("dedupes when skill explicitly emits a checkout-day placeId (backwards-compat)", () => {
    // Older trips that still emit an explicit checkout reference should not
    // end up with day N+1 listed twice.
    const trip = tripOf(
      [stay("camp-back-compat")],
      [
        { schedule: [night("camp-back-compat")] }, // 0
        { schedule: [night("camp-back-compat")] }, // 1 — last night
        { schedule: [{ time: "09:00", placeId: "camp-back-compat" }] }, // 2 — explicit checkout
      ],
    );
    const h = buildHydration(trip);
    expect(h.placeToDays.get("camp-back-compat")).toEqual([0, 1, 2]);
  });
});
