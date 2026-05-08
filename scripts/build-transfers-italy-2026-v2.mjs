#!/usr/bin/env node
// Inserts Transfer items into trip.json schedules per the 15-min / 1-km rule.
// Uses OSRM segment data for trunk drives + manual estimates for short hops.

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
const poiById = Object.fromEntries(map.pois.map((p) => [p.id, p]));

// Endpoint factory
function E(idOrCoords, fallbackName) {
  if (typeof idOrCoords === "string") {
    const p = poiById[idOrCoords];
    if (!p) throw new Error(`Unknown poi: ${idOrCoords}`);
    return { name: p.name, lat: p.lat, lng: p.lng };
  }
  return { name: fallbackName ?? "—", lat: idOrCoords.lat, lng: idOrCoords.lng };
}
const MXP = { lat: 45.6197, lng: 8.7603, name: "Aeroporto MXP / Indie Campers" };

// Transfer factory
function T(time, model, from, to, duration, distance, opts = {}) {
  return {
    type: "transfer",
    time,
    from,
    to,
    model,
    duration,
    distance,
    ...opts,
  };
}

// ---------------------------------------------------------------------------
// Transfer definitions: per day, with insertion anchor.
// `anchorAfterPoi`: insert Transfer immediately AFTER the schedule item that
//   references this poiId (or generic with this name).
// `anchorAfterName`: insert AFTER the first item whose name CONTAINS this string.
// `replaceItemAt`: replace the item at this index entirely.
// ---------------------------------------------------------------------------
const transfers = [
  // ── Day 1: MXP → Camp Fusina (replaces "Dirigir pela A4 leste") ──
  {
    dayNum: "1",
    anchorAfterName: "PRIMEIRA COMPRA DE SUPERMERCADO",
    transfer: T(
      "17:00",
      "drive",
      MXP,
      E("camp-fusina-venezia"),
      Math.round(196 * 1.3), // OSRM 196min × +30% margin = 255min
      302,
      { notes: "A4 leste — motorhome com +30% margin." },
    ),
  },

  // ── Day 2: Vaporetto Camp Fusina → San Marco (ferry, 30min, ~€8/pp = €16) ──
  {
    dayNum: "2",
    anchorBeforeName: "Piazza San Marco",
    transfer: T(
      "09:00",
      "ferry",
      E("camp-fusina-venezia"),
      E("basilica-san-marco"),
      30,
      9,
      { cost: 16, notes: "Vaporetto Linea 16 — Fusina ↔ Zattere → walk to S. Marco." },
    ),
  },
  // ── Day 2: return ferry S. Marco → Camp Fusina ──
  {
    dayNum: "2",
    anchorAfterName: "Vaporetto de volta",
    transfer: T(
      "22:00",
      "ferry",
      E("basilica-san-marco"),
      E("camp-fusina-venezia"),
      30,
      9,
      { cost: 16, notes: "Vaporetto Linea 16 noturno." },
    ),
  },

  // ── Day 3: Camp Fusina → Postojna (cross-border drive) ──
  {
    dayNum: "3",
    anchorAfterName: "Comprar e-vinheta",
    transfer: T(
      "07:30",
      "drive",
      E("camp-fusina-venezia"),
      E("postojna-cave"),
      170, // ~2h50 with margin
      230,
      { notes: "Travessia da fronteira IT/SI — verificar e-vinheta antes." },
    ),
  },
  // Postojna → Predjama (10 min, 9km)
  {
    dayNum: "3",
    anchorAfterPoi: "postojna-cave",
    transfer: T(
      "11:00",
      "drive",
      E("postojna-cave"),
      E("predjama-castle"),
      10,
      9,
    ),
  },
  // Predjama → Camp Bled
  {
    dayNum: "3",
    anchorAfterName: "Almoço (comida do motorhome)",
    transfer: T(
      "13:00",
      "drive",
      E("predjama-castle"),
      E("camp-bled"),
      105, // 1h30 + margin
      85,
      { notes: "Paisagem muda de planícies para Alpes Julianos." },
    ),
  },

  // ── Day 4: Camp Bled → Vintgar (4km) ──
  {
    dayNum: "4",
    anchorBeforeName: "Vintgar Gorge — 1.6km",
    transfer: T(
      "07:30",
      "drive",
      E("camp-bled"),
      E("vintgar-gorge"),
      8,
      4,
    ),
  },
  // Vintgar → Lago Bled
  {
    dayNum: "4",
    anchorAfterName: "Voltar para Bled",
    transfer: T(
      "09:30",
      "drive",
      E("vintgar-gorge"),
      E("lago-bled"),
      8,
      4,
    ),
  },
  // Lago Bled → Bled Castle (~1.5km, walkable but uphill — drive)
  {
    dayNum: "4",
    anchorBeforeName: "Bled Castle —",
    transfer: T(
      "11:45",
      "drive",
      E("lago-bled"),
      E("bled-castle"),
      6,
      1.5,
    ),
  },

  // ── Day 5: Camp Bled → Vogel (Bohinj) ──
  {
    dayNum: "5",
    anchorAfterName: "Maior lago glacial",
    transfer: T(
      "08:00",
      "drive",
      E("camp-bled"),
      E("vogel-cable-car"),
      40, // 30min + margin
      30,
    ),
  },
  // Vogel → Lago Bohinj (cable car descent + short drive)
  {
    dayNum: "5",
    anchorBeforeName: "Caminhar pela margem",
    transfer: T(
      "13:30",
      "drive",
      E("vogel-cable-car"),
      E("lago-bohinj"),
      8,
      3.5,
    ),
  },
  // Bohinj → Camp Bled return
  {
    dayNum: "5",
    anchorAfterName: "opcional",
    transfer: T(
      "17:00",
      "drive",
      E("savica-waterfall"),
      E("camp-bled"),
      40,
      32,
    ),
  },

  // ── Day 6: Camp Bled → Pokljuka ──
  {
    dayNum: "6",
    anchorAfterName: "Pokljuka Plateau (~30 min)",
    transfer: T(
      "10:30",
      "drive",
      E("camp-bled"),
      E("pokljuka-plateau"),
      40,
      26,
    ),
  },
  // Pokljuka → Pericnik
  {
    dayNum: "6",
    anchorAfterName: "Mojstrana",
    transfer: T(
      "13:30",
      "drive",
      E("pokljuka-plateau"),
      E("pericnik-waterfall"),
      40,
      30,
      { notes: "Via Mojstrana." },
    ),
  },
  // Pericnik → Zelenci
  {
    dayNum: "6",
    anchorAfterName: "Zelenci (~30 min via Kranjska Gora)",
    transfer: T(
      "14:30",
      "drive",
      E("pericnik-waterfall"),
      E("zelenci-nature-reserve"),
      35,
      24,
    ),
  },
  // Zelenci → Kranjska Gora
  {
    dayNum: "6",
    anchorAfterPoi: "zelenci-nature-reserve",
    transfer: T(
      "15:45",
      "drive",
      E("zelenci-nature-reserve"),
      E("kranjska-gora"),
      8,
      4.5,
    ),
  },

  // ── Day 7: Kranjska Gora → Jasna (~2 min) ──
  // (Jasna is 2 min away → skip Transfer, walk implicit ≤ 1km not applicable for car start)
  // But departure from free-parking → Jasna is 2.5km, drive needed
  {
    dayNum: "7",
    anchorAfterName: "Saída do free parking",
    transfer: T(
      "07:00",
      "drive",
      E("free-parking-kranjska-gora"),
      E("jasna-lake"),
      6,
      2.5,
    ),
  },
  // Jasna → Vrsic Pass top (start of pass)
  {
    dayNum: "7",
    anchorAfterName: "Início do Vršič",
    transfer: T(
      "09:45",
      "drive",
      E("jasna-lake"),
      E("vrsic-pass"),
      90, // 50 hairpins, slow with motorhome
      14,
      { notes: "50 hairpin turns — marcha baixa, buzinar nas curvas cegas." },
    ),
  },
  // Vrsic → Bovec/Camp Liza
  {
    dayNum: "7",
    anchorAfterName: "Descida pelo lado sul",
    transfer: T(
      "12:00",
      "drive",
      E("vrsic-pass"),
      E("camp-liza-bovec"),
      75,
      36,
      { notes: "Descida pelo vale do Trenta + Rio Soča." },
    ),
  },

  // ── Day 8: Camp Liza → Slap Kozjak ──
  {
    dayNum: "8",
    anchorAfterName: "Slap Kozjak (~25 min de Bovec)",
    transfer: T(
      "08:30",
      "drive",
      E("camp-liza-bovec"),
      E("slap-kozjak"),
      30,
      18,
    ),
  },
  // Slap Kozjak → Bovec (rafting)
  {
    dayNum: "8",
    anchorAfterName: "Volta para Bovec",
    transfer: T(
      "10:00",
      "drive",
      E("slap-kozjak"),
      E("rafting-rio-soca"),
      30,
      18,
    ),
  },

  // ── Day 9: Camp Liza → Predil ──
  {
    dayNum: "9",
    anchorAfterName: "Bovec → Predel Pass",
    transfer: T(
      "07:30",
      "drive",
      E("camp-liza-bovec"),
      E("lago-del-predil"),
      75,
      33,
      { notes: "Predel Pass — rota cênica pela montanha." },
    ),
  },
  // Predil → Fusine
  {
    dayNum: "9",
    anchorAfterName: "Tarvisio (~20 min)",
    transfer: T(
      "09:30",
      "drive",
      E("lago-del-predil"),
      E("lago-di-fusine"),
      25,
      14,
      { notes: "Cruzar para Itália — Tarvisio." },
    ),
  },
  // Fusine → Cortina
  {
    dayNum: "9",
    anchorAfterName: "Cortina d'Ampezzo (~2h30",
    transfer: T(
      "10:30",
      "drive",
      E("lago-di-fusine"),
      E("camp-dolomiti-cortina"),
      180, // 2h30 base + margin = 3h
      155,
      { notes: "Via Dobbiaco / SS51 — paisagem alpina toda a viagem." },
    ),
  },

  // ── Day 10: Camp Dolomiti → Rifugio Auronzo (toll road, ~52 min) ──
  {
    dayNum: "10",
    anchorAfterName: "Dirigir até a estrada pedagiada",
    transfer: T(
      "07:00",
      "drive",
      E("camp-dolomiti-cortina"),
      E("rifugio-auronzo"),
      85, // 52 base + margin
      35,
      { cost: 60, notes: "Toll road €60 motorhome. Reserva online obrigatória." },
    ),
  },
  // Auronzo → Camp Dolomiti return
  {
    dayNum: "10",
    anchorAfterName: "Voltar para Cortina",
    transfer: T(
      "14:00",
      "drive",
      E("rifugio-auronzo"),
      E("camp-dolomiti-cortina"),
      55,
      35,
    ),
  },

  // ── Day 11: Camp Dolomiti → Passo Tre Croci ──
  {
    dayNum: "11",
    anchorAfterName: "Estacionamento lota rápido",
    transfer: T(
      "06:30",
      "drive",
      E("camp-dolomiti-cortina"),
      E("passo-tre-croci"),
      25,
      8,
    ),
  },
  // Tre Croci → Camp Dolomiti return (after trail)
  {
    dayNum: "11",
    anchorAfterName: "Almoço tardio em Cortina",
    transfer: T(
      "13:30",
      "drive",
      E("passo-tre-croci"),
      E("camp-dolomiti-cortina"),
      25,
      8,
    ),
  },

  // ── Day 12: Cortina → Lago di Braies ──
  {
    dayNum: "12",
    anchorAfterName: "Lago di Braies via Dobbiaco",
    transfer: T(
      "08:30",
      "drive",
      E("camp-dolomiti-cortina"),
      E("lago-di-braies"),
      85,
      38,
    ),
  },
  // Braies → Camp Olympia
  {
    dayNum: "12",
    anchorAfterName: "Camping Olympia, Dobbiaco (~26 min)",
    transfer: T(
      "12:30",
      "drive",
      E("lago-di-braies"),
      E("camp-olympia-dobbiaco"),
      35,
      26,
    ),
  },

  // ── Day 14: Camp Olympia → Bressanone ──
  {
    dayNum: "14",
    anchorAfterName: "Bressanone via SS49",
    transfer: T(
      "08:30",
      "drive",
      E("camp-olympia-dobbiaco"),
      E("bressanone-brixen"),
      75,
      55,
    ),
  },
  // Bressanone → Chiusa
  {
    dayNum: "14",
    anchorAfterName: "Dirigir até Chiusa",
    transfer: T(
      "09:30",
      "drive",
      E("bressanone-brixen"),
      E("chiusa-klausen"),
      18,
      11,
    ),
  },
  // Chiusa → Val Gardena
  {
    dayNum: "14",
    anchorAfterName: "Dirigir até Val Gardena",
    transfer: T(
      "11:00",
      "drive",
      E("chiusa-klausen"),
      E("camp-seiser-alm-val-gardena"),
      35,
      22,
    ),
  },

  // ── Day 15: Cable car Ortisei ↔ Seceda ──
  {
    dayNum: "15",
    anchorBeforePoi: "seceda-ridgeline",
    transfer: T(
      "09:00",
      "drive",
      E("camp-seiser-alm-val-gardena"),
      E("ortisei-st-ulrich"),
      15,
      7,
      { notes: "Ortisei base station — depois cable car (transit)." },
    ),
  },

  // ── Day 16: Camp Seiser Alm → Compatsch (Siusi cable car ride) ──
  {
    dayNum: "16",
    anchorBeforePoi: "alpe-di-siusi-compatsch",
    transfer: T(
      "08:45",
      "drive",
      E("camp-seiser-alm-val-gardena"),
      { lat: 46.5468, lng: 11.5536, name: "Estação Cabinovia Siusi" },
      15,
      8,
      { notes: "Estação Siusi — cabinovia para Compatsch (~10 min, €60 RT)." },
    ),
  },

  // ── Day 17: Val Gardena → Carezza → Sirmione (long trunk) ──
  {
    dayNum: "17",
    anchorAfterName: "Carezza via Val d'Ega",
    transfer: T(
      "08:30",
      "drive",
      E("camp-seiser-alm-val-gardena"),
      E("lago-di-carezza"),
      85,
      48,
      { notes: "Via Val d'Ega." },
    ),
  },
  // Carezza → Desenzano (long trunk via A22 + A4)
  {
    dayNum: "17",
    anchorAfterName: "via A22 sul → A4 oeste",
    transfer: T(
      "11:00",
      "drive",
      E("lago-di-carezza"),
      E("free-parking-desenzano"),
      170,
      218,
      { notes: "A22 sul → A4 oeste. Posto Brescia/Bergamo é boa parada." },
    ),
  },
  // Desenzano → Sirmione (drive, 15 min)
  {
    dayNum: "17",
    anchorBeforeName: "Drive até Sirmione",
    transfer: T(
      "15:00",
      "drive",
      E("free-parking-desenzano"),
      E("sirmione"),
      15,
      8,
    ),
  },
  // Sirmione → free-parking Desenzano return
  {
    dayNum: "17",
    anchorAfterName: "Retorno ao free parking Desenzano",
    transfer: T(
      "18:00",
      "drive",
      E("sirmione"),
      E("free-parking-desenzano"),
      15,
      8,
    ),
  },

  // ── Day 18: Desenzano → MXP (long trunk) ──
  {
    dayNum: "18",
    anchorAfterName: "região de MXP pela A4",
    transfer: T(
      "17:30",
      "drive",
      E("free-parking-desenzano"),
      MXP,
      140, // ~2h base + margin
      170,
      { notes: "A4 oeste. Tanque cheio antes de devolver." },
    ),
  },

  // ── Day 19: Pernoite-MXP → Indie Campers (very short, ≤1km, can omit) ──
  // Skipped — pernoite is at the depot already.
];

// ---------------------------------------------------------------------------
// Insert transfers into the right schedule positions
// ---------------------------------------------------------------------------
function findAnchorIndex(schedule, anchor) {
  for (let i = 0; i < schedule.length; i++) {
    const item = schedule[i];
    if (anchor.anchorAfterPoi && item.poiId === anchor.anchorAfterPoi) return { afterIdx: i };
    if (anchor.anchorBeforePoi && item.poiId === anchor.anchorBeforePoi) return { beforeIdx: i };
    if (anchor.anchorAfterName && item.name?.includes(anchor.anchorAfterName)) return { afterIdx: i };
    if (anchor.anchorBeforeName && item.name?.includes(anchor.anchorBeforeName)) return { beforeIdx: i };
  }
  return null;
}

let inserted = 0;
let skipped = 0;

// Process transfers in reverse order per day so indices remain valid
const byDay = transfers.reduce((acc, t) => {
  acc[t.dayNum] ??= [];
  acc[t.dayNum].push(t);
  return acc;
}, {});

for (const day of trip.days) {
  const tList = byDay[day.num] ?? [];
  // We need to insert from latest to earliest in the schedule
  // First resolve all anchor indices in original schedule, then apply with offset compensation
  const resolved = [];
  for (const t of tList) {
    const idx = findAnchorIndex(day.schedule, t);
    if (!idx) {
      console.warn(`⚠ Day ${day.num}: anchor not found for transfer ${t.transfer.from.name} → ${t.transfer.to.name}`);
      skipped++;
      continue;
    }
    const insertAt = idx.afterIdx !== undefined ? idx.afterIdx + 1 : idx.beforeIdx;
    resolved.push({ insertAt, transfer: t.transfer });
  }
  // Sort descending so earlier indices stay valid as we splice
  resolved.sort((a, b) => b.insertAt - a.insertAt);
  for (const r of resolved) {
    day.schedule.splice(r.insertAt, 0, r.transfer);
    inserted++;
  }
}

writeFileSync(TRIP_PATH, JSON.stringify(trip, null, 2) + "\n");
console.log(`✓ Inserted ${inserted} transfers (skipped ${skipped})`);
