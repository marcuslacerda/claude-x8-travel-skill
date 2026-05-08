#!/usr/bin/env node
// Renumbers trip.days[].num from "0..19" to "1..20" and shifts route dayNums + names.
// POI dayNums stay as-is (they were already +1 vs the old trip.num — happy alignment after shift).

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const TRIP_DIR = join(REPO_ROOT, "trips", "italy-2026-v2");
const TRIP_PATH = join(TRIP_DIR, "trip.json");
const MAP_PATH = join(TRIP_DIR, "map.json");

const trip = JSON.parse(readFileSync(TRIP_PATH, "utf-8"));
const map = JSON.parse(readFileSync(MAP_PATH, "utf-8"));

// 1) trip.days[].num: increment by 1 (string)
for (const day of trip.days) {
  const n = parseInt(day.num, 10);
  if (Number.isNaN(n)) throw new Error(`Cannot parse num: ${day.num}`);
  day.num = String(n + 1);
}

// 2) map.routes[].dayNum: increment by 1 + update name "Dia X" → "Dia (X+1)"
for (const route of map.routes) {
  const oldNum = route.dayNum;
  route.dayNum = oldNum + 1;
  if (route.name) {
    route.name = route.name.replace(
      new RegExp(`^Dia ${oldNum}:`),
      `Dia ${route.dayNum}:`,
    );
  }
}

// 3) map.pois[].dayNum: no change (they were already +1 from old trip.num,
//    so they line up correctly with the new trip.num).

writeFileSync(TRIP_PATH, JSON.stringify(trip, null, 2) + "\n");
writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + "\n");

console.log(`✓ trip.days renumbered: ${trip.days.map((d) => d.num).join(", ")}`);
console.log(`✓ ${map.routes.length} route dayNums and names shifted by +1`);
console.log(`✓ ${map.pois.length} POI dayNums unchanged (already aligned post-shift)`);
