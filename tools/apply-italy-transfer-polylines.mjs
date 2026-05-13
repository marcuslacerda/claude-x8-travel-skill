#!/usr/bin/env node
/**
 * Replaces straight-line (2-vertex) polylines for italy-2026 transfers with
 * real road-following polylines fetched from Google Maps Directions API.
 *
 * Background: the original new-trip flow saved transfer-* routes with
 * `polyline = encode([originCoords, destCoords])` — i.e. just two endpoints,
 * which the viewer renders as a straight line. This script swaps in the
 * actual road geometry.
 *
 * Skipped (with reasons in italy-2026-transfer-polylines.json comments):
 *  - transfer-day9-1 (rafting, not road)
 *  - transfer-day11-1 (Rifugio Auronzo private toll road, Google "No route")
 *  - transfer-day16-0, transfer-day17-0 (Camping Seiser Alm coords uncertain)
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tripPath = resolve(__dirname, "../trips/italy-2026/trip.json");
const dataPath = resolve(__dirname, "italy-2026-transfer-polylines.json");

const trip = JSON.parse(readFileSync(tripPath, "utf8"));
const updates = JSON.parse(readFileSync(dataPath, "utf8"));

let updated = 0;
const changes = [];
for (const route of trip.routes) {
  const u = updates[route.id];
  if (!u) continue;
  const beforeVertices = decodeVertexCount(route.polyline);
  route.polyline = u.polyline;
  route.duration = u.duration;
  route.distance = u.distance;
  const afterVertices = decodeVertexCount(route.polyline);
  changes.push({
    id: route.id,
    beforeVertices,
    afterVertices,
    duration: u.duration,
    distanceKm: (u.distance / 1000).toFixed(1),
  });
  updated++;
}

writeFileSync(tripPath, JSON.stringify(trip, null, 2) + "\n");

console.log(`✅ Updated ${updated} transfer polylines.\n`);
console.log("Vertex counts (before → after):");
for (const c of changes) {
  console.log(
    `  ${c.id.padEnd(22)} ${String(c.beforeVertices).padStart(4)} → ${String(c.afterVertices).padStart(5)}  ${c.duration.padEnd(10)} ${c.distanceKm}km`,
  );
}

// Quick polyline decoder (count vertices only)
function decodeVertexCount(encoded) {
  if (typeof encoded !== "string" || !encoded.length) return 0;
  let count = 0;
  let index = 0;
  while (index < encoded.length) {
    let b;
    let shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      shift += 5;
    } while (b >= 0x20);
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      shift += 5;
    } while (b >= 0x20);
    count++;
  }
  return count;
}
