/**
 * Mechanical guardrail for insight placement (not a semantic judge).
 *
 * Schema v3 supports both `Day.insights[]` (day-level) and
 * `ScheduleItem.insights[]` (item-level). The guideline prefers item-level by
 * default — day-level is reserved for genuinely whole-day observations.
 *
 * These ratio thresholds catch the regression where a trip is generated with
 * 0 item-level insights (e.g. defaulting to day-level for simplicity).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/trip-v3-scheme.json" with { type: "json" };

type Day = { insights?: unknown[]; schedule?: { insights?: unknown[] }[] };
type Trip = { days: Day[] };

function placementStats(trip: Trip): { day: number; item: number; total: number; itemRatio: number } {
  let day = 0;
  let item = 0;
  for (const d of trip.days) {
    day += d.insights?.length ?? 0;
    for (const s of d.schedule ?? []) {
      item += s.insights?.length ?? 0;
    }
  }
  const total = day + item;
  return { day, item, total, itemRatio: total > 0 ? item / total : 0 };
}

describe("insight placement — canonical fixture", () => {
  it("has both placements (mix of day-level + item-level)", () => {
    const s = placementStats(fixture as Trip);
    expect(s.day).toBeGreaterThan(0);
    expect(s.item).toBeGreaterThan(0);
    expect(s.total).toBeGreaterThanOrEqual(6);
  });

  it("item-level ratio ≥ 30% (default-to-item-level preference visible)", () => {
    const s = placementStats(fixture as Trip);
    expect(s.itemRatio).toBeGreaterThanOrEqual(0.3);
  });
});

describe("insight placement — examples/italy-2026 (gitcommitted reference trip)", () => {
  const italy = JSON.parse(
    readFileSync(resolve(__dirname, "..", "examples", "italy-2026", "trip.json"), "utf8"),
  ) as Trip;

  it("has a non-trivial number of insights total", () => {
    const s = placementStats(italy);
    expect(s.total).toBeGreaterThanOrEqual(20);
  });

  it("item-level ratio ≥ 50% (majority item-level)", () => {
    const s = placementStats(italy);
    expect(s.itemRatio).toBeGreaterThanOrEqual(0.5);
  });

  it("0% item ratio would be a regression — fail loud", () => {
    const s = placementStats(italy);
    expect(s.item).toBeGreaterThan(0);
  });
});
