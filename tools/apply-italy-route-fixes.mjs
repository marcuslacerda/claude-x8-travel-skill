#!/usr/bin/env node
/**
 * One-shot patch script for italy-2026/trip.json.
 *
 * Updates duration + distance for DRIVE routes based on fresh Google Maps
 * validation (see /travel-planner validate-routes italy-2026).
 *
 * - Multi-stop routes: durations/distances from plan_route with explicit waypoints
 * - Simple A→B routes: durations/distances from direct directions queries
 * - Loops & unreachable (Rifugio Auronzo, rafting): preserved
 *
 * Polylines are preserved (existing geometry is correct). Run validate-routes
 * again to refresh polylines for simple transfers if desired.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tripPath = resolve(
  __dirname,
  "../trips/italy-2026/trip.json",
);

const trip = JSON.parse(readFileSync(tripPath, "utf8"));

// Each update is { duration?, distance? }
// Routes intentionally omitted:
//  - route-day-5, route-day-8, route-day-10: loops where Google can't validate
//  - transfer-day9-1: rafting trip (semantically activity time, not road time)
//  - transfer-day11-1: Rifugio Auronzo (private toll road, Google "No route")
//  - transfer-day16-0, transfer-day17-0: Camping Seiser Alm coords may be wrong;
//    skip until coords verified
const updates = {
  // Major route legs
  "route-day-1": { duration: "PT3H43M", distance: 302871 },
  "route-day-3": { duration: "PT4H", distance: 321900 },
  "route-day-6": { duration: "PT2H5M", distance: 94000 },
  "route-day-7": { duration: "PT1H24M", distance: 46800 },
  "route-day-9": { duration: "PT3H54M", distance: 216900 },
  "route-day-11": { distance: 16000 }, // loop: distance was one-way only
  "route-day-12": { duration: "PT1H19M", distance: 65400 },
  "route-day-14": { duration: "PT1H50M", distance: 90800 },
  "route-day-17": { duration: "PT3H4M", distance: 221500 },
  "route-day-18": { duration: "PT2H2M", distance: 159867 },

  // Transfers (intra-day legs)
  "transfer-day4-1": { duration: "PT16M", distance: 10159 },
  "transfer-day4-2": { duration: "PT1H35M", distance: 116865 },
  "transfer-day5-0": { duration: "PT12M", distance: 5593 },
  "transfer-day5-1": { duration: "PT11M", distance: 6253 },
  "transfer-day5-2": { duration: "PT11M", distance: 3223 },
  "transfer-day6-1": { duration: "PT4M", distance: 1979 },
  "transfer-day6-2": { duration: "PT39M", distance: 33841 },
  "transfer-day7-1": { duration: "PT52M", distance: 37517 },
  "transfer-day7-2": { duration: "PT27M", distance: 22241 },
  "transfer-day7-3": { duration: "PT5M", distance: 4376 },
  "transfer-day8-1": { duration: "PT26M", distance: 10373 },
  "transfer-day8-2": { duration: "PT51M", distance: 33157 },
  "transfer-day10-1": { duration: "PT25M", distance: 19903 },
  "transfer-day10-2": { duration: "PT3H7M", distance: 176135 },
  "transfer-day12-1": { duration: "PT14M", distance: 8263 },
  "transfer-day13-1": { duration: "PT18M", distance: 14484 },
  "transfer-day15-1": { duration: "PT16M", distance: 11905 },
  "transfer-day15-2": { duration: "PT41M", distance: 27188 },
  "transfer-day18-1": { duration: "PT2H16M", distance: 186765 },
  "transfer-day18-2": { duration: "PT19M", distance: 7312 },
  "transfer-day18-3": { duration: "PT19M", distance: 7312 },
};

let updated = 0;
const changes = [];
for (const route of trip.routes) {
  const u = updates[route.id];
  if (!u) continue;
  const before = { duration: route.duration, distance: route.distance };
  if (u.duration) route.duration = u.duration;
  if (u.distance !== undefined) route.distance = u.distance;
  changes.push({
    id: route.id,
    before,
    after: { duration: route.duration, distance: route.distance },
  });
  updated++;
}

writeFileSync(tripPath, JSON.stringify(trip, null, 2) + "\n");

console.log(`✅ Updated ${updated} routes.\n`);
console.log("Changes:");
for (const c of changes) {
  const dDur = c.before.duration !== c.after.duration
    ? `${c.before.duration} → ${c.after.duration}`
    : c.after.duration;
  const dDist = c.before.distance !== c.after.distance
    ? `${(c.before.distance / 1000).toFixed(1)}km → ${(c.after.distance / 1000).toFixed(1)}km`
    : `${(c.after.distance / 1000).toFixed(1)}km`;
  console.log(`  ${c.id.padEnd(22)} ${dDur.padEnd(20)} ${dDist}`);
}

const skipped = [
  "route-day-5 (Bled loop)",
  "route-day-8 (Bovec rafting loop)",
  "route-day-10 (Tre Cime private toll road)",
  "transfer-day9-1 (rafting trip = activity time)",
  "transfer-day11-1 (Rifugio Auronzo, no route)",
  "transfer-day16-0, transfer-day17-0 (Camping Seiser Alm coords need verification)",
];
console.log("\nPreserved (intentionally):");
for (const s of skipped) console.log(`  ${s}`);
