#!/usr/bin/env node
// Calls OSRM public to generate road-following polylines for each driving day,
// then updates trips/italy-2026-v2/map.json with the routes[].
//
// Throttles 1.2s/req per OSRM public rate limit. Falls back to straight line on failure.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const TRIP_DIR = join(REPO_ROOT, "trips", "italy-2026-v2");
const MAP_PATH = join(TRIP_DIR, "map.json");

const map = JSON.parse(readFileSync(MAP_PATH, "utf-8"));
const poiById = Object.fromEntries(map.pois.map((p) => [p.id, p]));

// Origin/destination at MXP (Indie Campers depot)
const MXP = { lat: 45.6197, lng: 8.7603 };

// ---------------------------------------------------------------------------
// Route definitions: ordered waypoints (POI ids) per driving day.
// Each entry → one OSRM call with all waypoints in sequence.
// ---------------------------------------------------------------------------
const routeDefs = [
  {
    dayNum: 1,
    name: "Dia 1: MXP → Venezia (A4 leste, ~308km)",
    color: "#FF7800",
    waypoints: [MXP, "camp-fusina-venezia"],
  },
  {
    dayNum: 3,
    name: "Dia 3: Venezia → Postojna → Predjama → Bled (~320km)",
    color: "#FFAA00",
    waypoints: ["camp-fusina-venezia", "postojna-cave", "predjama-castle", "camp-bled"],
  },
  {
    dayNum: 5,
    name: "Dia 5: Bled ↔ Bohinj & Vogel (~29km)",
    color: "#669944",
    waypoints: ["camp-bled", "vogel-cable-car", "lago-bohinj", "savica-waterfall", "camp-bled"],
  },
  {
    dayNum: 6,
    name: "Dia 6: Bled → Pokljuka → Peričnik → Zelenci → Kranjska Gora (~101km)",
    color: "#77AA55",
    waypoints: [
      "camp-bled",
      "pokljuka-plateau",
      "pericnik-waterfall",
      "zelenci-nature-reserve",
      "kranjska-gora",
      "free-parking-kranjska-gora",
    ],
  },
  {
    dayNum: 7,
    name: "Dia 7: Kranjska Gora → Vršič → Bovec (~47km)",
    color: "#448822",
    waypoints: [
      "free-parking-kranjska-gora",
      "jasna-lake",
      "russian-chapel",
      "vrsic-pass",
      "great-soca-gorge",
      "camp-liza-bovec",
    ],
  },
  {
    dayNum: 8,
    name: "Dia 8: Bovec → Slap Kozjak → rafting (~21km)",
    color: "#337711",
    waypoints: ["camp-liza-bovec", "slap-kozjak", "rafting-rio-soca", "camp-liza-bovec"],
  },
  {
    dayNum: 9,
    name: "Dia 9: Bovec → Predil → Fusine → Cortina (~240km)",
    color: "#578B2E",
    waypoints: [
      "camp-liza-bovec",
      "lago-del-predil",
      "lago-di-fusine",
      "cortina-d-ampezzo",
      "camp-dolomiti-cortina",
    ],
  },
  {
    dayNum: 10,
    name: "Dia 10: Cortina ↔ Tre Cime (toll road, ~45km)",
    color: "#FF8822",
    waypoints: [
      "camp-dolomiti-cortina",
      "rifugio-auronzo",
      "camp-dolomiti-cortina",
    ],
  },
  {
    dayNum: 11,
    name: "Dia 11: Cortina ↔ Passo Tre Croci (Sorapis trailhead, ~16km)",
    color: "#EE7711",
    waypoints: ["camp-dolomiti-cortina", "passo-tre-croci", "camp-dolomiti-cortina"],
  },
  {
    dayNum: 12,
    name: "Dia 12: Cortina → Lago di Braies → Dobbiaco (~67km)",
    color: "#0088FF",
    waypoints: ["camp-dolomiti-cortina", "lago-di-braies", "camp-olympia-dobbiaco"],
  },
  {
    dayNum: 14,
    name: "Dia 14: Dobbiaco → Bressanone → Chiusa → Val Gardena (~96km)",
    color: "#CC8800",
    waypoints: [
      "camp-olympia-dobbiaco",
      "bressanone-brixen",
      "chiusa-klausen",
      "ortisei-st-ulrich",
      "camp-seiser-alm-val-gardena",
    ],
  },
  {
    dayNum: 17,
    name: "Dia 17: Val Gardena → Lago di Carezza → Sirmione (~232km)",
    color: "#00AAFF",
    waypoints: [
      "camp-seiser-alm-val-gardena",
      "lago-di-carezza",
      "free-parking-desenzano",
    ],
  },
  {
    dayNum: 18,
    name: "Dia 18: Sirmione → MXP (A4 oeste, ~174km)",
    color: "#44CCFF",
    waypoints: ["free-parking-desenzano", MXP],
  },
];

// ---------------------------------------------------------------------------
// OSRM fetcher
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOSRM(coords) {
  // coords: array of {lat, lng}
  const path = coords.map((c) => `${c.lng},${c.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`;
  const res = await fetch(url, { headers: { "User-Agent": "claude-x8-travel-skill/1.0" } });
  if (!res.ok) throw new Error(`OSRM ${res.status}: ${res.statusText}`);
  const data = await res.json();
  if (data.code !== "Ok") throw new Error(`OSRM code: ${data.code}`);
  const route = data.routes[0];
  return {
    coordinates: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
    distance: route.distance, // meters
    duration: route.duration, // seconds
  };
}

function resolveCoords(waypoints) {
  return waypoints.map((w) => {
    if (typeof w === "string") {
      const p = poiById[w];
      if (!p) throw new Error(`Unknown POI: ${w}`);
      return { lat: p.lat, lng: p.lng };
    }
    return w;
  });
}

function straightLine(coords) {
  return coords;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const routes = [];

for (const def of routeDefs) {
  const coords = resolveCoords(def.waypoints);
  process.stdout.write(`Day ${def.dayNum}: ${def.waypoints.length} waypoints → OSRM ... `);
  let result;
  try {
    result = await fetchOSRM(coords);
    console.log(
      `OK (${(result.distance / 1000).toFixed(1)}km, ${Math.round(result.duration / 60)}min, ${result.coordinates.length} pts)`,
    );
  } catch (err) {
    console.log(`FAIL (${err.message}) — falling back to straight line`);
    result = { coordinates: straightLine(coords), distance: null, duration: null };
  }
  routes.push({
    id: `route-day-${def.dayNum}`,
    name: def.name,
    color: def.color,
    kind: "driving",
    dayNum: def.dayNum,
    coordinates: result.coordinates,
    updatedBy: "skill",
  });
  // Throttle public OSRM
  await sleep(1200);
}

map.routes = routes;
writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + "\n");
console.log(`✓ Wrote ${routes.length} routes to map.json`);
