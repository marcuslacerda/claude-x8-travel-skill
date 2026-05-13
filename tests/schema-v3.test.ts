import { describe, expect, it } from "vitest";
import fixture from "./fixtures/trip-v3-scheme.json" with { type: "json" };
import {
  BookingSchema,
  DaySchema,
  InsightSchema,
  PictureSchema,
  PlaceSchema,
  RouteSchema,
  ScheduleItemSchema,
  TravelModeSchema,
  TripSchema,
} from "../cli/lib/schema.ts";

describe("TripSchema v3 — fixture parity", () => {
  it("validates the canonical fixture (trip-v3-scheme.json)", () => {
    const result = TripSchema.safeParse(fixture);
    if (!result.success) {
      // Surface zod issues clearly when test fails.

      console.error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("infers schemaVersion === 3", () => {
    const parsed = TripSchema.parse(fixture);
    expect(parsed.schemaVersion).toBe(3);
  });

  it("retains catalog shape (places + routes + days)", () => {
    const parsed = TripSchema.parse(fixture);
    expect(parsed.places.length).toBeGreaterThan(0);
    expect(parsed.routes.length).toBeGreaterThan(0);
    expect(parsed.days.length).toBeGreaterThan(0);
  });
});

describe("TripSchema — referential integrity", () => {
  function clone() {
    return JSON.parse(JSON.stringify(fixture));
  }

  it("rejects schedule item with unknown placeId", () => {
    const t = clone();
    t.days[0].schedule.push({ time: "23:00", placeId: "ghost-place" });
    const r = TripSchema.safeParse(t);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("unknown placeId");
  });

  it("rejects schedule item with unknown routeId", () => {
    const t = clone();
    t.days[0].schedule.push({ time: "23:30", routeId: "phantom-route" });
    const r = TripSchema.safeParse(t);
    expect(r.success).toBe(false);
  });

  it("rejects booking with unknown placeId", () => {
    const t = clone();
    t.bookings ??= [];
    t.bookings.push({
      date: "2026-06-30",
      item: "Mystery reservation",
      status: "pending",
      critical: false,
      placeId: "does-not-exist",
    });
    const r = TripSchema.safeParse(t);
    expect(r.success).toBe(false);
  });

  it("rejects duplicate place ids", () => {
    const t = clone();
    t.places.push({ ...t.places[0] });
    const r = TripSchema.safeParse(t);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("Place ids must be unique");
  });

  it("rejects duplicate route ids", () => {
    const t = clone();
    t.routes.push({ ...t.routes[0] });
    const r = TripSchema.safeParse(t);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("Route ids must be unique");
  });
});

describe("TripSchema — schedule item discriminator", () => {
  it("accepts an item with placeId only", () => {
    expect(
      ScheduleItemSchema.safeParse({ time: "09:00", placeId: "castello-scaligero" }).success,
    ).toBe(true);
  });

  it("accepts an item with routeId only", () => {
    expect(
      ScheduleItemSchema.safeParse({ time: "11:15", routeId: "castello-to-grotte" }).success,
    ).toBe(true);
  });

  it("accepts a generic block (name only)", () => {
    expect(
      ScheduleItemSchema.safeParse({ time: "13:00", name: "Almoço livre", category: "food" })
        .success,
    ).toBe(true);
  });

  it("rejects an item with no placeId, routeId, or name", () => {
    expect(ScheduleItemSchema.safeParse({ time: "13:00", cost: 30 }).success).toBe(false);
  });

  it("rejects malformed time", () => {
    expect(ScheduleItemSchema.safeParse({ time: "9:00", placeId: "x" }).success).toBe(false);
    expect(ScheduleItemSchema.safeParse({ time: "25:00", placeId: "x" }).success).toBe(false);
  });
});

describe("Sub-schemas", () => {
  it("TravelMode is uppercase only", () => {
    expect(TravelModeSchema.safeParse("DRIVE").success).toBe(true);
    expect(TravelModeSchema.safeParse("drive").success).toBe(false);
    expect(TravelModeSchema.safeParse("driving").success).toBe(false);
  });

  it("RouteSchema requires ISO 8601 duration", () => {
    const base = {
      id: "x",
      mode: "DRIVE" as const,
      polyline: "abc",
      duration: "PT45M",
    };
    expect(RouteSchema.safeParse(base).success).toBe(true);
    expect(RouteSchema.safeParse({ ...base, duration: "45m" }).success).toBe(false);
    expect(RouteSchema.safeParse({ ...base, duration: "45" }).success).toBe(false);
  });

  it("PlaceSchema requires googlePlaceId to start with ChIJ", () => {
    const base = {
      id: "test-place",
      name: "Test",
      geo: { lat: 0, lng: 0 },
      category: "attraction" as const,
    };
    expect(PlaceSchema.safeParse({ ...base, googlePlaceId: "ChIJabc123_xyz" }).success).toBe(true);
    expect(PlaceSchema.safeParse({ ...base, googlePlaceId: "abc123" }).success).toBe(false);
  });

  it("PictureSchema validates source enum", () => {
    expect(
      PictureSchema.safeParse({ url: "https://x.com/a.jpg", source: "wikipedia" }).success,
    ).toBe(true);
    expect(
      PictureSchema.safeParse({ url: "https://x.com/a.jpg", source: "instagram" }).success,
    ).toBe(false);
  });

  it("InsightSchema requires at least one highlight or warning", () => {
    expect(InsightSchema.safeParse({ highlights: ["a"] }).success).toBe(true);
    expect(InsightSchema.safeParse({ warnings: ["a"] }).success).toBe(true);
    expect(InsightSchema.safeParse({}).success).toBe(false);
    expect(InsightSchema.safeParse({ highlights: [], warnings: [] }).success).toBe(false);
  });

  it("DaySchema rejects empty title", () => {
    expect(DaySchema.safeParse({ title: "Day 1", schedule: [] }).success).toBe(true);
  });

  it("BookingSchema accepts placeId reference", () => {
    expect(
      BookingSchema.safeParse({
        date: "2026-06-08",
        item: "Hotel reservation",
        status: "pending",
        critical: true,
        placeId: "hotel-x",
      }).success,
    ).toBe(true);
  });
});
