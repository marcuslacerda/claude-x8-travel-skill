import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import polylineCodec from "@googlemaps/polyline-codec";
const { decode } = polylineCodec;
import { describe, expect, it } from "vitest";
import { TripSchema } from "../cli/lib/schema.ts";
import { migrateV2toV3 } from "../tools/migrate-v2-to-v3.ts";

const ITALY_DIR = resolve(__dirname, "..", "examples", "italy-2026");

// After the v3 cutover, the v2 source files were renamed to .legacy.json
// so the new v3 trip.json could take their place. Fall back to the bare names
// in case this test is ever run pre-cutover (CI from an old branch).
function loadItaly(): { tripV2: any; mapV2: any } {
  const tripPath = existsSync(`${ITALY_DIR}/trip.legacy.json`)
    ? `${ITALY_DIR}/trip.legacy.json`
    : `${ITALY_DIR}/trip.json`;
  const mapPath = existsSync(`${ITALY_DIR}/map.legacy.json`)
    ? `${ITALY_DIR}/map.legacy.json`
    : `${ITALY_DIR}/map.json`;
  const tripV2 = JSON.parse(readFileSync(tripPath, "utf8"));
  const mapV2 = JSON.parse(readFileSync(mapPath, "utf8"));
  return { tripV2, mapV2 };
}

describe("migrateV2toV3 — italy-2026 real data", () => {
  const { tripV2, mapV2 } = loadItaly();
  const { trip, warnings } = migrateV2toV3(tripV2, mapV2);

  it("output validates against TripSchema v3", () => {
    expect(TripSchema.safeParse(trip).success).toBe(true);
  });

  it("preserves all v2 POI ids in v3 places[]", () => {
    const v2Ids = new Set(mapV2.pois.map((p: any) => p.id));
    const v3Ids = new Set(trip.places.map((p) => p.id));
    for (const id of v2Ids) {
      expect(v3Ids.has(id as string)).toBe(true);
    }
  });

  it("preserves all v2 route ids in v3 routes[]", () => {
    const v2Ids = new Set(mapV2.routes.map((r: any) => r.id));
    const v3Ids = new Set(trip.routes.map((r) => r.id));
    for (const id of v2Ids) {
      expect(v3Ids.has(id as string)).toBe(true);
    }
  });

  it("v3 polyline decodes back to v2 coordinates within 1e-5", () => {
    for (const v2Route of mapV2.routes as any[]) {
      const v3Route = trip.routes.find((r) => r.id === v2Route.id);
      expect(v3Route).toBeTruthy();
      const decoded = decode(v3Route!.polyline, 5);
      expect(decoded.length).toBe(v2Route.coordinates.length);
      for (let i = 0; i < decoded.length; i++) {
        const [lat, lng] = decoded[i];
        expect(Math.abs(lat - v2Route.coordinates[i].lat)).toBeLessThan(1e-5);
        expect(Math.abs(lng - v2Route.coordinates[i].lng)).toBeLessThan(1e-5);
      }
    }
  });

  it("preserves total insight count (item-level + day-level)", () => {
    const v2Count = (tripV2.days as any[]).reduce(
      (acc, d) => acc + (d.schedule?.filter((s: any) => s.type === "insight").length ?? 0),
      0,
    );
    const v3Count = trip.days.reduce(
      (acc, d) =>
        acc +
        (d.insights?.length ?? 0) +
        d.schedule.reduce((s, item) => s + (item.insights?.length ?? 0), 0),
      0,
    );
    expect(v3Count).toBe(v2Count);
  });

  it("every multi-day POI is referenced in each of its days (R3)", () => {
    for (const poi of mapV2.pois as any[]) {
      if (!Array.isArray(poi.dayNum)) continue;
      for (const dayNum of poi.dayNum) {
        const day = trip.days[dayNum - 1];
        expect(day).toBeDefined();
        expect(day.schedule.some((s) => s.placeId === poi.id)).toBe(true);
      }
    }
  });

  it("schedule items map to valid place/route ids (referential integrity)", () => {
    const placeIds = new Set(trip.places.map((p) => p.id));
    const routeIds = new Set(trip.routes.map((r) => r.id));
    for (const d of trip.days) {
      for (const item of d.schedule) {
        if (item.placeId) expect(placeIds.has(item.placeId)).toBe(true);
        if (item.routeId) expect(routeIds.has(item.routeId)).toBe(true);
      }
    }
  });

  it("warning stats are reasonable for italy-2026", () => {
    // italy has 40 transfers, 13 matched routes → ~27 synthesized
    expect(warnings.synthesizedRoutes).toBeGreaterThan(0);
    expect(warnings.synthesizedRoutes).toBeLessThan(40);
    expect(warnings.malformedTimes.length).toBe(0);
    expect(warnings.unmappedTransfers).toBe(0);
  });
});

describe("migrateV2toV3 — synthetic edge cases", () => {
  function makeBase() {
    return {
      tripV2: {
        slug: "test-trip",
        title: "Edge cases",
        destination: { startLocation: "São Paulo", headlineTo: "X", headlineFrom: "Y" },
        startDate: "2026-06-01",
        status: "draft" as const,
        currency: "EUR",
        days: [] as any[],
      },
      mapV2: { pois: [] as any[], routes: [] as any[] },
    };
  }

  it("orphan Insight at day index 0 → day.insights[]", () => {
    const { tripV2, mapV2 } = makeBase();
    tripV2.days = [
      {
        num: "1",
        title: "Day 1",
        schedule: [
          { type: "insight", warnings: ["chuva à tarde"] },
          { type: "experience", time: "09:00", name: "Breakfast", category: "food" },
        ],
      },
    ];
    const { trip, warnings } = migrateV2toV3(tripV2 as any, mapV2 as any);
    expect(trip.days[0].insights?.length).toBe(1);
    expect(trip.days[0].insights?.[0].warnings).toEqual(["chuva à tarde"]);
    expect(warnings.orphanInsights).toBe(1);
  });

  it("Insight after item → attached to previous item", () => {
    const { tripV2, mapV2 } = makeBase();
    mapV2.pois = [
      {
        id: "castle-x",
        name: "Castle X",
        lat: 45.5,
        lng: 10.6,
        category: "attraction",
        kind: "castle",
      },
    ];
    tripV2.days = [
      {
        num: "1",
        title: "Day 1",
        schedule: [
          {
            type: "experience",
            time: "09:00",
            name: "Castle X",
            category: "attraction",
            poiId: "castle-x",
          },
          { type: "insight", highlights: ["melhor luz pela manhã"] },
        ],
      },
    ];
    const { trip } = migrateV2toV3(tripV2 as any, mapV2 as any);
    const firstItem = trip.days[0].schedule[0];
    expect(firstItem.insights?.length).toBe(1);
    expect(firstItem.insights?.[0].highlights).toEqual(["melhor luz pela manhã"]);
    expect(trip.days[0].insights).toBeUndefined();
  });

  it("multi-day stay (dayNum: [1,2,3]) synthesizes schedule items on missing days", () => {
    const { tripV2, mapV2 } = makeBase();
    mapV2.pois = [
      {
        id: "camp-x",
        name: "Camp X",
        lat: 45.5,
        lng: 10.6,
        category: "stay",
        kind: "camp",
        dayNum: [1, 2, 3],
      },
    ];
    tripV2.days = [
      {
        num: "1",
        title: "Day 1",
        schedule: [
          { type: "experience", time: "18:00", name: "Camp X", category: "stay", poiId: "camp-x" },
        ],
      },
      { num: "2", title: "Day 2", schedule: [] },
      { num: "3", title: "Day 3", schedule: [] },
    ];
    const { trip, warnings } = migrateV2toV3(tripV2 as any, mapV2 as any);
    expect(trip.days[0].schedule.some((s) => s.placeId === "camp-x")).toBe(true);
    expect(trip.days[1].schedule.some((s) => s.placeId === "camp-x")).toBe(true);
    expect(trip.days[2].schedule.some((s) => s.placeId === "camp-x")).toBe(true);
    // Day 1 already had it; only days 2 and 3 synthesized.
    expect(warnings.multiDayStaysSynthesized).toBe(2);
  });

  it("transfer without matching MapRoute synthesizes 2-vertex polyline", () => {
    const { tripV2, mapV2 } = makeBase();
    tripV2.days = [
      {
        num: "1",
        title: "Day 1",
        schedule: [
          {
            type: "transfer",
            time: "10:00",
            from: { name: "A", lat: 45.0, lng: 10.0 },
            to: { name: "B", lat: 45.1, lng: 10.1 },
            model: "drive",
            duration: 15,
          },
        ],
      },
    ];
    const { trip, warnings } = migrateV2toV3(tripV2 as any, mapV2 as any);
    expect(trip.routes.length).toBe(1);
    expect(trip.routes[0].mode).toBe("DRIVE");
    expect(trip.routes[0].duration).toBe("PT15M");
    const decoded = decode(trip.routes[0].polyline, 5);
    expect(decoded.length).toBe(2);
    expect(warnings.synthesizedRoutes).toBe(1);
  });

  it("picture from Experience moves to Place; conflict warned", () => {
    const { tripV2, mapV2 } = makeBase();
    mapV2.pois = [{ id: "x", name: "X", lat: 45.5, lng: 10.6, category: "attraction" }];
    tripV2.days = [
      {
        num: "1",
        title: "Day 1",
        schedule: [
          {
            type: "experience",
            time: "09:00",
            name: "X",
            category: "attraction",
            poiId: "x",
            picture: "https://upload.wikimedia.org/wikipedia/commons/test.jpg",
          },
          {
            type: "experience",
            time: "15:00",
            name: "X again",
            category: "attraction",
            poiId: "x",
            picture: "https://example.com/different.jpg",
          },
        ],
      },
    ];
    const { trip, warnings } = migrateV2toV3(tripV2 as any, mapV2 as any);
    const place = trip.places.find((p) => p.id === "x");
    expect(place?.picture?.url).toContain("wikimedia");
    expect(place?.picture?.source).toBe("wikipedia");
    expect(place?.picture?.credit).toBe("Wikimedia Commons");
    expect(warnings.pictureConflicts.length).toBe(1);
  });

  it("stay item without time gets default 20:00", () => {
    const { tripV2, mapV2 } = makeBase();
    mapV2.pois = [
      { id: "camp", name: "Camp", lat: 45.5, lng: 10.6, category: "stay", kind: "camp" },
    ];
    tripV2.days = [
      {
        num: "1",
        title: "Day 1",
        schedule: [
          // No `time` field — like italy's pernoite items.
          { type: "experience", name: "Camp", category: "stay", poiId: "camp" } as any,
        ],
      },
    ];
    const { trip } = migrateV2toV3(tripV2 as any, mapV2 as any);
    expect(trip.days[0].schedule[0].time).toBe("20:00");
  });

  it("transfer model uppercase mapping", () => {
    const { tripV2, mapV2 } = makeBase();
    tripV2.days = [
      {
        num: "1",
        title: "Day 1",
        schedule: [
          {
            type: "transfer",
            time: "09:00",
            from: { name: "A", lat: 0, lng: 0 },
            to: { name: "B", lat: 0.1, lng: 0.1 },
            model: "ferry",
            duration: 30,
          },
        ],
      },
    ];
    const { trip } = migrateV2toV3(tripV2 as any, mapV2 as any);
    expect(trip.routes[0].mode).toBe("FERRY");
  });

  it("v2 driving route kind maps to DRIVE", () => {
    const { tripV2, mapV2 } = makeBase();
    mapV2.routes = [
      {
        id: "r1",
        name: "Test",
        color: "#FF7800",
        kind: "driving",
        dayNum: 1,
        coordinates: [
          { lat: 45.0, lng: 10.0 },
          { lat: 45.5, lng: 10.5 },
        ],
      },
    ];
    tripV2.days = [
      {
        num: "1",
        title: "Day 1",
        schedule: [
          {
            type: "transfer",
            time: "09:00",
            from: { name: "A", lat: 45.0, lng: 10.0 },
            to: { name: "B", lat: 45.5, lng: 10.5 },
            model: "drive",
            duration: 60,
            distance: 50,
          },
        ],
      },
    ];
    const { trip } = migrateV2toV3(tripV2 as any, mapV2 as any);
    const r = trip.routes.find((x) => x.id === "r1");
    expect(r?.mode).toBe("DRIVE");
    expect(r?.duration).toBe("PT1H");
    expect(r?.distance).toBe(50000);
  });
});
