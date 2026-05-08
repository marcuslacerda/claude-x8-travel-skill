#!/usr/bin/env node
// Builds trip.json + map.json (base structure, no routes, no enrichment yet)
// for slug `italy-2026-v2` from the user-provided seed.
//
// After running this: routes come from Phase 4 (OSRM), enrichment from Phase 6.

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const TRIP_DIR = join(REPO_ROOT, "trips", "italy-2026-v2");
mkdirSync(TRIP_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// POIs — id, lat, lng, name, category, kind, dayNum (where applicable)
// description left empty → Phase 6 fills via Wikipedia summary
// ---------------------------------------------------------------------------
const pois = [
  { id: "indie-campers-mxp-pickup-return", lat: 45.6197, lng: 8.7603, name: "Indie Campers MXP", category: "transport", kind: "destination" },
  // Day 1 — Venezia base
  { id: "venezia", lat: 45.4408, lng: 12.3375, name: "Venezia", category: "attraction", kind: "city", dayNum: 2 },
  { id: "camp-fusina-venezia", lat: 45.4208, lng: 12.2582, name: "Camping Fusina, Venezia", category: "stay", kind: "camp", dayNum: 2 },
  // Day 2 — Veneza POIs
  { id: "basilica-san-marco", lat: 45.4347, lng: 12.3398, name: "Basilica di San Marco", category: "attraction", kind: "city", dayNum: 3 },
  { id: "campanile-san-marco", lat: 45.4341, lng: 12.339, name: "Campanile di San Marco", category: "attraction", kind: "viewpoint", dayNum: 3 },
  { id: "palazzo-ducale-itinerari-segreti", lat: 45.4337, lng: 12.3402, name: "Palazzo Ducale — Itinerari Segreti", category: "attraction", kind: "castle", dayNum: 3 },
  { id: "basilica-santi-giovanni-paolo", lat: 45.4392, lng: 12.3424, name: "Basilica dei Santi Giovanni e Paolo", category: "attraction", kind: "city", dayNum: 3 },
  { id: "chiesa-gesuiti", lat: 45.4422, lng: 12.339, name: "Chiesa di Santa Maria Assunta ai Gesuiti", category: "attraction", kind: "city", dayNum: 3 },
  { id: "ponte-di-rialto", lat: 45.438, lng: 12.336, name: "Ponte di Rialto", category: "attraction", kind: "city", dayNum: 3 },
  { id: "bacari-do-rialto", lat: 45.4382, lng: 12.3354, name: "Bacari do Rialto (Cantina Do Mori)", category: "food", kind: "restaurant", dayNum: 3 },
  { id: "basilica-dei-frari", lat: 45.4366, lng: 12.3262, name: "Basilica dei Frari", category: "attraction", kind: "city", dayNum: 3 },
  { id: "santa-maria-della-salute", lat: 45.4308, lng: 12.3342, name: "Santa Maria della Salute", category: "attraction", kind: "city", dayNum: 3 },
  { id: "concerto-vivaldi-i-musici-veneziani", lat: 45.434, lng: 12.336, name: "Concerto Vivaldi — I Musici Veneziani", category: "attraction", kind: "city", dayNum: 3 },
  // Day 3 — Veneza → Bled
  { id: "cividale-del-friuli", lat: 46.0959, lng: 13.4275, name: "Cividale del Friuli (opcional)", category: "attraction", kind: "unesco", dayNum: 4 },
  { id: "postojna-cave", lat: 45.783, lng: 14.2038, name: "Postojna Cave", category: "attraction", kind: "cave", dayNum: 4 },
  { id: "predjama-castle", lat: 45.8158, lng: 14.1269, name: "Predjama Castle", category: "attraction", kind: "castle", dayNum: 4 },
  { id: "camp-bled", lat: 46.3614, lng: 14.081, name: "Camping Bled", category: "stay", kind: "camp", dayNum: 4 },
  // Day 4 — Bled day
  { id: "vintgar-gorge", lat: 46.3936, lng: 14.0857, name: "Vintgar Gorge", category: "attraction", kind: "nature", dayNum: 5 },
  { id: "lago-bled", lat: 46.3636, lng: 14.0938, name: "Lago Bled", category: "attraction", kind: "lake", dayNum: 5 },
  { id: "bled-castle", lat: 46.3699, lng: 14.1006, name: "Bled Castle", category: "attraction", kind: "castle", dayNum: 5 },
  { id: "confeitaria-park-bled", lat: 46.3677, lng: 14.1131, name: "Confeitaria Park (Kremšnita)", category: "food", kind: "coffee", dayNum: 5 },
  // Day 5 — Bohinj/Vogel
  { id: "lago-bohinj", lat: 46.284, lng: 13.8594, name: "Lago Bohinj", category: "attraction", kind: "lake", dayNum: 6 },
  { id: "vogel-cable-car", lat: 46.2757, lng: 13.8354, name: "Vogel Cable Car (1.535m)", category: "attraction", kind: "trek", dayNum: 6 },
  { id: "st-john-baptist-bohinj", lat: 46.2802, lng: 13.8836, name: "Igreja de St. John the Baptist", category: "attraction", kind: "city", dayNum: 6 },
  { id: "savica-waterfall", lat: 46.2927, lng: 13.7968, name: "Savica Waterfall (opcional)", category: "attraction", kind: "waterfall", dayNum: 6 },
  // Day 6 — Pokljuka/Pericnik/Zelenci/Kranjska
  { id: "pokljuka-plateau", lat: 46.3397, lng: 13.9236, name: "Pokljuka Plateau", category: "attraction", kind: "nature", dayNum: 7 },
  { id: "pericnik-waterfall", lat: 46.4392, lng: 13.8938, name: "Peričnik Waterfall", category: "attraction", kind: "waterfall", dayNum: 7 },
  { id: "zelenci-nature-reserve", lat: 46.4926, lng: 13.7378, name: "Zelenci Nature Reserve", category: "attraction", kind: "nature", dayNum: 7 },
  { id: "kranjska-gora", lat: 46.4859, lng: 13.7898, name: "Kranjska Gora", category: "attraction", kind: "vila", dayNum: 7 },
  { id: "free-parking-kranjska-gora", lat: 46.4859, lng: 13.7898, name: "Free Parking Kranjska Gora", category: "stay", kind: "camp", dayNum: 7 },
  // Day 7 — Vršič → Soča
  { id: "jasna-lake", lat: 46.474, lng: 13.7841, name: "Jasna Lake", category: "attraction", kind: "lake", dayNum: 8 },
  { id: "vrsic-pass", lat: 46.4329, lng: 13.7431, name: "Vršič Pass (1.611m)", category: "attraction", kind: "scenic", dayNum: 8 },
  { id: "russian-chapel", lat: 46.4426, lng: 13.7677, name: "Russian Chapel", category: "attraction", kind: "memorial", dayNum: 8 },
  { id: "great-soca-gorge", lat: 46.3372, lng: 13.6459, name: "Velika Korita Soče (Great Soča Gorge)", category: "attraction", kind: "nature", dayNum: 8 },
  { id: "bovec", lat: 46.3376, lng: 13.5517, name: "Bovec", category: "attraction", kind: "city", dayNum: 8 },
  { id: "camp-liza-bovec", lat: 46.3308, lng: 13.56, name: "Camp Liza, Bovec", category: "stay", kind: "camp", dayNum: 8 },
  // Day 8 — Slap Kozjak + rafting
  { id: "slap-kozjak", lat: 46.2648, lng: 13.5653, name: "Slap Kozjak", category: "attraction", kind: "waterfall", dayNum: 9 },
  { id: "rafting-rio-soca", lat: 46.29, lng: 13.56, name: "Rafting Rio Soča (SportMix)", category: "attraction", kind: "adventure", dayNum: 9 },
  // Day 9 — Soča → Predil → Fusine → Cortina
  { id: "lago-del-predil", lat: 46.4188, lng: 13.5651, name: "Lago del Predil", category: "attraction", kind: "lake", dayNum: 10 },
  { id: "lago-di-fusine", lat: 46.4797, lng: 13.6706, name: "Lago di Fusine", category: "attraction", kind: "lake", dayNum: 10 },
  { id: "cortina-d-ampezzo", lat: 46.5378, lng: 12.1359, name: "Cortina d'Ampezzo", category: "attraction", kind: "city", dayNum: 10 },
  { id: "camp-dolomiti-cortina", lat: 46.542, lng: 12.145, name: "Camping Dolomiti, Cortina", category: "stay", kind: "camp", dayNum: 10 },
  // Day 10 — Tre Cime
  { id: "tre-cime-di-lavaredo", lat: 46.6187, lng: 12.3028, name: "Tre Cime di Lavaredo", category: "attraction", kind: "trek", dayNum: 11 },
  { id: "rifugio-auronzo", lat: 46.6131, lng: 12.2956, name: "Rifugio Auronzo", category: "attraction", kind: "trek", dayNum: 11 },
  { id: "rifugio-locatelli", lat: 46.6166, lng: 12.3091, name: "Rifugio Locatelli", category: "attraction", kind: "trek", dayNum: 11 },
  // Day 11 — Sorapis
  { id: "lago-di-sorapis", lat: 46.5206, lng: 12.2235, name: "Lago di Sorapis", category: "attraction", kind: "lake", dayNum: 12 },
  { id: "passo-tre-croci", lat: 46.5618, lng: 12.1853, name: "Passo Tre Croci (Sorapis trailhead)", category: "transport", kind: "parking", dayNum: 12 },
  // Day 12 — Cortina → Braies → Dobbiaco
  { id: "lago-di-braies", lat: 46.6943, lng: 12.0854, name: "Lago di Braies", category: "attraction", kind: "lake", dayNum: 13 },
  { id: "dobbiaco-san-candido", lat: 46.7344, lng: 12.1937, name: "Dobbiaco / San Candido", category: "attraction", kind: "vila", dayNum: 13 },
  { id: "camp-olympia-dobbiaco", lat: 46.7344, lng: 12.1937, name: "Camping Olympia, Dobbiaco", category: "stay", kind: "camp", dayNum: 13 },
  // Day 13 — Wellness rest day (no new POIs)
  // Day 14 — Dobbiaco → Bressanone → Chiusa → Val Gardena
  { id: "bressanone-brixen", lat: 46.7104, lng: 11.6525, name: "Bressanone (Brixen)", category: "attraction", kind: "city", dayNum: 15 },
  { id: "chiusa-klausen", lat: 46.6392, lng: 11.5641, name: "Chiusa (Klausen)", category: "attraction", kind: "vila", dayNum: 15 },
  { id: "monastero-di-sabiona", lat: 46.6432, lng: 11.5653, name: "Monastero di Sabiona", category: "attraction", kind: "city", dayNum: 15 },
  { id: "ortisei-st-ulrich", lat: 46.5762, lng: 11.6745, name: "Ortisei (St. Ulrich)", category: "attraction", kind: "vila", dayNum: 15 },
  { id: "camp-seiser-alm-val-gardena", lat: 46.56, lng: 11.65, name: "Camping Seiser Alm, Val Gardena", category: "stay", kind: "camp", dayNum: 15 },
  // Day 15 — Seceda
  { id: "seceda-ridgeline", lat: 46.5598, lng: 11.7049, name: "Seceda Ridgeline (2.519m)", category: "attraction", kind: "trek", dayNum: 16 },
  { id: "rifugio-firenze", lat: 46.5689, lng: 11.7286, name: "Rifugio Firenze (Regensburger Hütte)", category: "attraction", kind: "trek", dayNum: 16 },
  { id: "ortisei-jantar-tiroles", lat: 46.5762, lng: 11.6745, name: "Jantar tirolês — Tubladel/Concordia", category: "food", kind: "restaurant", dayNum: 16 },
  // Day 16 — Alpe di Siusi
  { id: "alpe-di-siusi-compatsch", lat: 46.5412, lng: 11.617, name: "Alpe di Siusi (Compatsch)", category: "attraction", kind: "trek", dayNum: 17 },
  { id: "castelrotto", lat: 46.5669, lng: 11.56, name: "Castelrotto (opcional)", category: "attraction", kind: "vila", dayNum: 17 },
  // Day 17 — Val Gardena → Carezza → Sirmione
  { id: "lago-di-carezza", lat: 46.4114, lng: 11.6014, name: "Lago di Carezza (Karersee)", category: "attraction", kind: "lake", dayNum: 18 },
  { id: "desenzano-del-garda", lat: 45.4691, lng: 10.5418, name: "Desenzano del Garda", category: "attraction", kind: "city", dayNum: 18 },
  { id: "sirmione", lat: 45.4925, lng: 10.6082, name: "Sirmione", category: "attraction", kind: "city", dayNum: 18 },
  { id: "free-parking-desenzano", lat: 45.4597, lng: 10.5597, name: "Free Parking: Desenzano del Garda", category: "stay", kind: "camp", dayNum: 18 },
  // Day 18 — Sirmione → MXP
  { id: "castello-scaligero-sirmione", lat: 45.4925, lng: 10.6082, name: "Castello Scaligero (Sirmione)", category: "attraction", kind: "castle", dayNum: 19 },
  { id: "grotte-di-catullo", lat: 45.4982, lng: 10.6098, name: "Grotte di Catullo", category: "attraction", kind: "unesco", dayNum: 19 },
  { id: "farewell-lunch-garda", lat: 45.492, lng: 10.608, name: "Farewell Lunch — Lago di Garda", category: "food", kind: "restaurant", dayNum: 19 },
];

// Build lookup map id → POI for schedule referencing
const poiById = Object.fromEntries(pois.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function E(time, name, category, opts = {}) {
  // Generic Experience (no kind, no poiId) — narrative time block
  return { type: "experience", time, name, category, ...opts };
}
function EP(time, poiId, name, opts = {}) {
  // Specific Experience tied to a POI
  const p = poiById[poiId];
  if (!p) throw new Error(`Unknown poi: ${poiId}`);
  return {
    type: "experience",
    time,
    name: name || p.name,
    category: p.category,
    kind: p.kind,
    poiId,
    ...opts,
  };
}
function STAY(name, lat, lng, poiId) {
  // Day-end camp/stay marker
  return {
    type: "experience",
    time: "",
    name,
    category: "stay",
    kind: "camp",
    poiId,
  };
}
function INSIGHT({ highlights, warnings }) {
  const item = { type: "insight" };
  if (highlights?.length) item.highlights = highlights;
  if (warnings?.length) item.warnings = warnings;
  return item;
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------
const days = [
  // ── Day 0 — São Paulo → Milão ─────────────────────────────────
  {
    num: "0",
    cls: "",
    title: "São Paulo → Milão",
    schedule: [
      E("18:05", "Embarque no GRU — voo LATAM LA8072 direto para Milão (~12h)", "transport"),
    ],
  },
  // ── Day 1 — MXP → Venezia ─────────────────────────────────
  {
    num: "1",
    cls: "",
    title: "Milão → Venezia",
    dayCost: "~€350 (motorhome pickup + supermercado D1)",
    schedule: [
      INSIGHT({ highlights: ["🚗 MXP → Venezia | ~308km / ~3h19 base / ~4h19 com margem +30% | A4 leste"] }),
      E("10:15", "Chegada em Milano Malpensa. Imigração e retirar bagagem", "transport"),
      E("11:30", "Descanso no aeroporto — café e organizar malas", "custom"),
      EP("16:00", "indie-campers-mxp-pickup-return", "Retirar motorhome na Indie Campers (MXP). Inspeção do veículo e orientações"),
      E("16:15", "⛽ Tanque cheio do pickup MXP (incluído na retirada)", "transport"),
      E("16:30", "🛒 PRIMEIRA COMPRA DE SUPERMERCADO — Esselunga ou Carrefour perto de MXP. Essenciais para 3 dias: massas, azeite, café, pão, queijos, frutas, água, temperos", "shopping"),
      E("17:00", "Dirigir pela A4 leste até Venezia (~3h)", "transport"),
      E("20:00", "Chegada no Camping Fusina — frente à laguna. Montar camp", "stay"),
      E("20:15", "💧 Encher tanque de água limpa no Camping Fusina", "stay"),
      E("20:30", "Jantar no motorhome — primeira refeição da viagem!", "food"),
      STAY("Camping Fusina, Venezia", 45.4208, 12.2582, "camp-fusina-venezia"),
    ],
  },
  // ── Day 2 — Veneza dia inteiro ─────────────────────────────────
  {
    num: "2",
    cls: "city",
    title: "Venezia Dia Inteiro + Concerto Vivaldi",
    dayCost: "~€215 (vaporetto €32 + basílica €24 + campanile €30 + palazzo €80 + frari €10 + concerto €130 + refeições)",
    schedule: [
      INSIGHT({
        warnings: [
          "Palazzo Ducale Itinerari Segreti: RESERVAR ONLINE com antecedência — grupos pequenos, esgota",
          "Concerto Vivaldi I Musici Veneziani: comprar tickets antecipados",
          "Basilica di San Marco: ingresso online OBRIGATÓRIO desde Jul/2025 (timed-entry)",
        ],
      }),
      E("09:00", "Vaporetto Fusina → San Marco (~30 min, ~€8/pp)", "transport"),
      E("09:30", "Piazza San Marco — a sala de estar da Europa", "custom"),
      EP("09:45", "basilica-san-marco", "Basilica di San Marco — mosaicos bizantinos do séc. XI", { cost: 3, time: "09:45" }),
      EP("10:45", "campanile-san-marco", "Campanile di San Marco — vista 360° da laguna", { cost: 15, time: "10:45" }),
      EP("11:30", "palazzo-ducale-itinerari-segreti", "Palazzo Ducale — Itinerari Segreti", { cost: 40, time: "11:30" }),
      EP("13:15", "basilica-santi-giovanni-paolo", "Basilica dei SS. Giovanni e Paolo — panteão dos doges", { cost: 3.5, time: "13:15" }),
      EP("14:00", "chiesa-gesuiti", "Chiesa di Santa Maria Assunta ai Gesuiti — teto barroco espetacular", { cost: 0, time: "14:00" }),
      EP("14:45", "bacari-do-rialto", "Almoço — Cicchetti + spritz nos bacari (Cantina Do Mori desde 1462)"),
      EP("15:30", "ponte-di-rialto", "Ponte di Rialto — a ponte mais famosa de Veneza"),
      EP("16:00", "basilica-dei-frari", "Basilica dei Frari — Tiziano e Bellini", { cost: 5, time: "16:00" }),
      EP("17:00", "santa-maria-della-salute", "Santa Maria della Salute — cúpula barroca na entrada do Grand Canal", { cost: 0, time: "17:00" }),
      E("18:30", "Jantar leve em Veneza", "food"),
      EP("20:30", "concerto-vivaldi-i-musici-veneziani", "🎻 Concerto I Musici Veneziani: Vivaldi Four Seasons — Scuola Grande di San Teodoro", { cost: 65, time: "20:30" }),
      E("22:00", "Vaporetto de volta para Fusina", "transport"),
      STAY("Camping Fusina, Venezia", 45.4208, 12.2582, "camp-fusina-venezia"),
    ],
  },
  // ── Day 3 — Veneza → Postojna → Predjama → Bled ─────────────────────────────────
  {
    num: "3",
    cls: "",
    title: "Venezia → Postojna → Predjama → Bled 🇸🇮",
    dayCost: "~€110 (combo €94 + vinheta €16)",
    schedule: [
      INSIGHT({
        warnings: [
          "Comprar e-vinheta eslovena ONLINE antes da fronteira: evinjeta.dars.si (~€15)",
          "Comprar combo Postojna + Predjama online — preço melhor",
          "Cividale del Friuli é desvio +41 km / +45 min via Palmanova — opcional, depende do horário de saída",
        ],
      }),
      E("07:00", "Desmontar camp em Fusina", "stay"),
      E("07:30", "Dirigir até Postojna (~2h10). ⚠️ Comprar e-vinheta antes da fronteira!", "transport"),
      EP("09:45", "postojna-cave", "Postojna Cave — maior caverna turística da Europa. Tour 1h30: trem subterrâneo 3.7km + galerias", { cost: 47, time: "09:45" }),
      EP("11:15", "predjama-castle", "Predjama Castle — castelo no paredão de 123m", { cost: 0, time: "11:15" }),
      E("12:30", "Almoço (comida do motorhome)", "food"),
      E("13:00", "Dirigir até Bled (~1h30). Paisagem muda de planícies para Alpes", "transport"),
      E("14:30", "Montar camp no Camping Bled — à beira do lago", "stay"),
      E("15:30", "Primeira caminhada pelo Lago Bled — pôr do sol com a ilha e o castelo", "custom"),
      E("19:00", "Jantar no motorhome", "food"),
      STAY("Camping Bled", 46.3614, 14.081, "camp-bled"),
    ],
  },
  // ── Day 4 — Bled day ─────────────────────────────────
  {
    num: "4",
    cls: "",
    title: "Lago Bled & Vintgar Gorge",
    dayCost: "~€105 (gorge €30 + boat €40 + castle €38 + kremšnita)",
    schedule: [
      INSIGHT({ warnings: ["Vintgar Gorge: INGRESSO ONLINE obrigatório, time slots esgotam"] }),
      E("07:30", "Ir até a Vintgar Gorge (~4 km do camping). Abre às 8h", "transport"),
      EP("08:00", "vintgar-gorge", "Vintgar Gorge — 1.6km de passarelas sobre o rio esmeralda + Cascata Sum (16m)", { cost: 15, time: "08:00" }),
      E("09:30", "Voltar para Bled", "transport"),
      EP("10:00", "lago-bled", "Barco Pletna até a ilha de Bled — 99 degraus + sino dos desejos", { cost: 20, time: "10:00" }),
      EP("12:00", "bled-castle", "Bled Castle — séc. XI no penhasco. Vista do lago e dos Alpes", { cost: 19, time: "12:00" }),
      EP("13:30", "confeitaria-park-bled", "Kremšnita (bolo de creme típico) na Confeitaria Park"),
      E("14:30", "Volta ao redor do Lago Bled a pé — circuito plano de 6 km (~1.5h)", "custom"),
      E("17:00", "Descanso no camping. 🧺 Lavar roupa", "stay"),
      E("19:00", "Jantar no motorhome", "food"),
      STAY("Camping Bled", 46.3614, 14.081, "camp-bled"),
    ],
  },
  // ── Day 5 — Bohinj/Vogel ─────────────────────────────────
  {
    num: "5",
    cls: "",
    title: "Lago Bohinj & Vogel",
    dayCost: "~€72 (cable car €66 + Savica €6)",
    schedule: [
      E("08:00", "Dirigir até o Lake Bohinj (~30 min). Maior lago glacial da Eslovênia", "transport"),
      EP("09:00", "vogel-cable-car", "Teleférico Vogel até 1.535m. Vista panorâmica do Triglav e dos Alpes Julianos", { cost: 33, time: "09:00" }),
      E("10:30", "Caminhada no planalto de Vogel — trilhas leves de 1–2h com vistas 360°", "custom"),
      E("12:30", "Descer de teleférico. Piquenique à beira do lago", "food"),
      EP("14:00", "lago-bohinj", "Caminhar pela margem norte do Bohinj"),
      EP("14:30", "st-john-baptist-bohinj", "Igreja de St. John the Baptist (afrescos do séc. XV)"),
      EP("15:30", "savica-waterfall", "Savica Waterfall (opcional) — cachoeira de 78m em 2 estágios", { cost: 3, time: "15:30" }),
      E("17:30", "Voltar para o Camping Bled", "transport"),
      E("19:00", "Jantar no motorhome", "food"),
      STAY("Camping Bled", 46.3614, 14.081, "camp-bled"),
    ],
  },
  // ── Day 6 — Pokljuka / Peričnik / Zelenci ─────────────────────────────────
  {
    num: "6",
    cls: "rest",
    title: "REST — Pokljuka, Peričnik & Zelenci",
    dayCost: "~€10 (tudo grátis, só café)",
    schedule: [
      E("08:00", "💧 Reabastecer água + 🧺 lavanderia no camping", "stay"),
      E("09:00", "Dormir até mais tarde. Café da manhã tranquilo", "food"),
      E("10:30", "Dirigir até o Pokljuka Plateau (~30 min)", "transport"),
      EP("11:30", "pokljuka-plateau", "Pokljuka Gorge — desfiladeiro curto na floresta de abetos"),
      E("12:30", "Piquenique no planalto", "food"),
      E("13:30", "Dirigir até Mojstrana (~30 min)", "transport"),
      EP("14:00", "pericnik-waterfall", "Peričnik Waterfall — cachoeira de 52m, dá pra caminhar atrás da cortina d'água!"),
      E("14:30", "Dirigir até Zelenci (~30 min via Kranjska Gora)", "transport"),
      EP("15:00", "zelenci-nature-reserve", "Zelenci — nascentes esmeralda a 6°C o ano todo. Passarela 20 min"),
      EP("16:00", "kranjska-gora", "Passear por Kranjska Gora — vila alpina com cafés e artesanato"),
      E("17:00", "🅿️ Estacionar no free parking de Kranjska Gora — pé do Vršič para sair cedo amanhã", "stay"),
      E("19:00", "Jantar no motorhome", "food"),
      STAY("Free parking — Kranjska Gora", 46.4859, 13.7898, "free-parking-kranjska-gora"),
    ],
  },
  // ── Day 7 — Vršič → Vale do Soča ─────────────────────────────────
  {
    num: "7",
    cls: "",
    title: "Jasna Lake → Vršič Pass → Vale do Soča",
    dayCost: "~€10 (grátis, só lanches)",
    schedule: [
      INSIGHT({
        warnings: [
          "⚠️ MOTORHOME NO VRŠIČ: 50 hairpins, cobblestones escorregadios, curvas sem linha divisória, gradiente >10%. Motorhome (2.7m alt × 6.3m) PASSA mas exige atenção máxima",
          "Sair CEDO para evitar trânsito; usar marcha baixa na descida; buzinar nas curvas cegas",
          "Se choveu na véspera: cobblestones ficam perigosos — considerar Predel Pass como alternativa",
        ],
      }),
      E("07:00", "Saída do free parking em Kranjska Gora — sair cedo", "transport"),
      EP("07:45", "jasna-lake", "Jasna Lake — reflexo perfeito do Triglav e estátua do Zlatorog. Passeio matinal"),
      E("09:45", "Início do Vršič Pass — estrada de montanha mais alta da Eslovênia, 50 curvas de ferradura", "transport"),
      EP("10:15", "russian-chapel", "Russian Chapel (curva 8) — memorial dos prisioneiros russos da 1ª Guerra"),
      E("10:45", "Paradas nos mirantes — vistas dos Alpes Julianos", "custom"),
      EP("11:15", "vrsic-pass", "Topo do Vršič — parada para fotos. Vista dos dois lados do passo"),
      E("11:45", "Descida pelo lado sul — vistas do vale do Trenta e do Rio Soča", "transport"),
      E("12:15", "Opcional: Izvir Soče — trilha curta (~30 min) até a nascente do rio", "custom"),
      E("13:00", "Chegada em Bovec. Montar camp", "stay"),
      EP("15:00", "great-soca-gorge", "Velika Korita Soče — gargantas estreitas com água verde-esmeralda (~30 min walk)"),
      EP("16:00", "bovec", "Caminhada pelo Soča Trail perto de Bovec — trilha à beira do rio"),
      E("19:00", "Jantar no motorhome", "food"),
      STAY("Camp Liza, Bovec", 46.3308, 13.56, "camp-liza-bovec"),
    ],
  },
  // ── Day 8 — Slap Kozjak + rafting ─────────────────────────────────
  {
    num: "8",
    cls: "",
    title: "Slap Kozjak & Rafting no Soča",
    dayCost: "~€150 (rafting €140 + almoço)",
    schedule: [
      E("08:30", "Dirigir até Slap Kozjak (~25 min de Bovec)", "transport"),
      EP("09:00", "slap-kozjak", "Slap Kozjak — cachoeira espetacular em gruta semicircular. Trilha curta e fácil (~30 min ida)", { cost: 0, time: "09:00" }),
      E("10:00", "Volta para Bovec. Tempo livre no centro", "custom"),
      E("12:00", "Almoço em Bovec", "food"),
      EP("14:00", "rafting-rio-soca", "Rafting no Rio Soča com SportMix — corredeiras II-III em águas esmeralda", { cost: 70, time: "14:00" }),
      E("17:00", "Voltar para o camping. Secar e descansar", "stay"),
      E("19:00", "Jantar no motorhome — última noite na Eslovênia", "food"),
      STAY("Camp Liza, Bovec", 46.3308, 13.56, "camp-liza-bovec"),
    ],
  },
  // ── Day 9 — Soça → Predil → Fusine → Cortina ─────────────────────────────────
  {
    num: "9",
    cls: "",
    title: "Soča → Predil → Fusine → Cortina",
    dayCost: "~€15 (lagos grátis, só lanches)",
    schedule: [
      E("07:00", "Desmontar camp. Última caminhada matinal pelo Rio Soča", "stay"),
      E("07:30", "Dirigir: Bovec → Predel Pass (rota cênica pela montanha)", "transport"),
      EP("08:30", "lago-del-predil", "Lago del Predil — lago alpino esmeralda na fronteira IT/SI"),
      E("09:30", "Seguir até Tarvisio (~20 min)", "transport"),
      EP("09:50", "lago-di-fusine", "Lago di Fusine — dois lagos glaciais com reflexo do Monte Mangart"),
      E("10:30", "Dirigir até Cortina d'Ampezzo (~2h30 via Dobbiaco/SS51)", "transport"),
      E("13:00", "Chegada em Cortina. Montar camp no Camping Dolomiti", "stay"),
      E("14:00", "Almoço (comida do motorhome)", "food"),
      E("15:00", "🔥 TROCAR GÁS — Conad ou Eurospar em Cortina, ou no camping", "shopping"),
      E("15:30", "🛒 Compra grande supermercado: Conad City / Eurospar Cortina", "shopping"),
      EP("16:00", "cortina-d-ampezzo", "Passeio por Cortina — sede dos Jogos Olímpicos de Inverno 2026. Souvenirs: speck, queijo, grappa"),
      E("19:00", "Jantar no motorhome", "food"),
      STAY("Camping Dolomiti, Cortina", 46.542, 12.145, "camp-dolomiti-cortina"),
    ],
  },
  // ── Day 10 — Tre Cime ─────────────────────────────────
  {
    num: "10",
    cls: "",
    title: "Tre Cime di Lavaredo",
    dayCost: "~€75 (toll €60 motorhome + rifúgio)",
    schedule: [
      INSIGHT({
        warnings: [
          "RESERVA ONLINE OBRIGATÓRIA da estrada pedagiada — pass.auronzo.info, abre 30 dias antes",
          "Pedágio motorhome €60. Sair às 7h para garantir vaga e evitar trânsito",
        ],
      }),
      E("07:00", "Dirigir até a estrada pedagiada do Rifugio Auronzo (~52 min)", "transport"),
      EP("08:30", "tre-cime-di-lavaredo", "Trilha Tre Cime — circuito de 10km ao redor das três torres (3–4h). A trilha mais icônica das Dolomitas", { cost: 60, time: "08:30" }),
      EP("10:30", "rifugio-locatelli", "Rifugio Locatelli — a vista clássica das Tre Cime"),
      EP("12:30", "rifugio-auronzo", "Voltar ao Rifugio Auronzo. Café"),
      E("14:00", "Voltar para Cortina (~40 min)", "transport"),
      E("15:00", "Descanso no camping — recuperação", "stay"),
      E("19:00", "Jantar no motorhome", "food"),
      STAY("Camping Dolomiti, Cortina", 46.542, 12.145, "camp-dolomiti-cortina"),
    ],
  },
  // ── Day 11 — Sorapis ─────────────────────────────────
  {
    num: "11",
    cls: "",
    title: "Lago di Sorapis",
    dayCost: "~€15 (rifúgio)",
    schedule: [
      INSIGHT({
        warnings: [
          "Sair ANTES das 7h — parking de Passo Tre Croci lota rápido",
          "Cabos de aço em alguns trechos — levar luvas. NÃO fazer se choveu",
          "Rifugio Vandelli: SOMENTE CASH",
        ],
      }),
      E("06:30", "Dirigir até Passo Tre Croci (~20 min). Estacionamento lota rápido", "transport"),
      EP("07:00", "passo-tre-croci", "Trailhead Passo Tre Croci"),
      EP("07:30", "lago-di-sorapis", "Trilha do Lago di Sorapis — 11.5km, 5–6h. Lago turquesa leitoso. Trecho com cabos de aço"),
      E("11:30", "Trilha de volta", "custom"),
      E("14:00", "Almoço tardio em Cortina", "food"),
      E("15:30", "Descanso no camping — recuperação após trilha puxada", "stay"),
      E("19:00", "Jantar no motorhome", "food"),
      STAY("Camping Dolomiti, Cortina", 46.542, 12.145, "camp-dolomiti-cortina"),
    ],
  },
  // ── Day 12 — Cortina → Lago di Braies → Dobbiaco ─────────────────────────────────
  {
    num: "12",
    cls: "",
    title: "Cortina → Lago di Braies → Dobbiaco",
    dayCost: "~€50 (barco + jantar)",
    schedule: [
      INSIGHT({
        warnings: [
          "Sair cedo (08:00) — estacionamento de Braies enche rápido no verão",
          "Restrições de acesso a Braies: livre em junho, restrito após 10/Jul (sistema de reservas)",
        ],
      }),
      E("07:30", "Desmontar camp em Cortina", "stay"),
      E("08:30", "Dirigir até Lago di Braies via Dobbiaco (~1h05)", "transport"),
      EP("09:45", "lago-di-braies", "Caminhada ao redor do Lago di Braies (3.5km, circuito) + barco a remo (~€18/30min)", { cost: 18, time: "09:45" }),
      E("11:30", "Piquenique à beira do lago", "food"),
      E("12:30", "Dirigir até Camping Olympia, Dobbiaco (~26 min)", "transport"),
      E("13:00", "Montar camp no Camping Olympia. 🧺 Lavanderia", "stay"),
      E("13:30", "💧 Reabastecer água + 🚽 scarico no camping", "stay"),
      EP("15:00", "dobbiaco-san-candido", "Explorar Dobbiaco e/ou San Candido — vilas tirolesas charmosas, gelato"),
      E("19:00", "🍽️ Jantar em restaurante tirolês em Dobbiaco/San Candido", "food"),
      STAY("Camping Olympia, Dobbiaco", 46.7344, 12.1937, "camp-olympia-dobbiaco"),
    ],
  },
  // ── Day 13 — REST DAY Wellness ─────────────────────────────────
  {
    num: "13",
    cls: "rest",
    title: "REST — Wellness Olympia & Dobbiaco",
    dayCost: "~€10 (wellness incluso, só snacks)",
    schedule: [
      E("09:00", "Dormir até mais tarde. Café da manhã tranquilo", "food"),
      E("10:30", "🧖 Wellness no Camping Olympia — sauna finlandesa, banho turco, infravermelhos, piscinas. Incluso na diária!", "stay"),
      E("12:30", "Almoço no motorhome", "food"),
      E("14:00", "Passeio por Dobbiaco e/ou San Candido — artesanato, gelato", "custom"),
      E("16:00", "🧖 Mais wellness — sauna e piscinas no final da tarde", "stay"),
      E("19:00", "Jantar no motorhome", "food"),
      STAY("Camping Olympia, Dobbiaco", 46.7344, 12.1937, "camp-olympia-dobbiaco"),
    ],
  },
  // ── Day 14 — Dobbiaco → Chiusa → Val Gardena ─────────────────────────────────
  {
    num: "14",
    cls: "",
    title: "Dobbiaco → Chiusa → Val Gardena",
    dayCost: "~€5",
    schedule: [
      E("08:00", "Desmontar camp em Olympia", "stay"),
      E("08:30", "Dirigir até Bressanone via SS49 (~1h)", "transport"),
      EP("09:00", "bressanone-brixen", "Bressanone (Brixen) — parada breve opcional"),
      E("09:30", "Dirigir até Chiusa (~15 min)", "transport"),
      EP("09:45", "chiusa-klausen", "Chiusa (Klausen) — vielas medievais"),
      EP("10:30", "monastero-di-sabiona", "Subida ao Monastero di Sabiona — mosteiro beneditino no penhasco"),
      E("11:00", "Dirigir até Val Gardena (~25 min)", "transport"),
      E("11:30", "Montar camp no Camping Seiser Alm", "stay"),
      E("12:00", "Almoço no motorhome", "food"),
      EP("14:00", "ortisei-st-ulrich", "Explorar Ortisei (St. Ulrich) — capital de Val Gardena. Tradição em escultura em madeira, gelato"),
      E("19:00", "Jantar no motorhome", "food"),
      STAY("Camping Seiser Alm, Val Gardena", 46.56, 11.65, "camp-seiser-alm-val-gardena"),
    ],
  },
  // ── Day 15 — Seceda ─────────────────────────────────
  {
    num: "15",
    cls: "",
    title: "Seceda Ridgeline",
    dayCost: "~€195 (cable car €148 RT + rifúgio + jantar)",
    schedule: [
      INSIGHT({
        warnings: [
          "RESERVA ONLINE OBRIGATÓRIA em 2026 — seceda.it. Não-reembolsável",
          "€74/pp RT cable car. Verificar clima na manhã antes de comprar",
          "Taxa de €5/pp no torniquete (NOVO 2026) — proibido sair das trilhas demarcadas",
        ],
      }),
      EP("09:00", "seceda-ridgeline", "Cable car Ortisei → Seceda. Trilha Seceda Ridgeline — circuito 10km pela crista com vista das Odle (3–4h)", { cost: 74, time: "09:00" }),
      EP("13:00", "rifugio-firenze", "Café e lanche no Rifugio Firenze (Regensburger Hütte)"),
      E("15:00", "Descer de teleférico. Passear por Ortisei e gelato", "custom"),
      EP("19:00", "ortisei-jantar-tiroles", "Jantar tirolês em Ortisei — Tubladel, Concordia ou Hotel Nives"),
      STAY("Camping Seiser Alm, Val Gardena", 46.56, 11.65, "camp-seiser-alm-val-gardena"),
    ],
  },
  // ── Day 16 — Alpe di Siusi ─────────────────────────────────
  {
    num: "16",
    cls: "",
    title: "Alpe di Siusi — Peak Wildflower Season",
    dayCost: "~€75 (cable car €60 RT + snack)",
    schedule: [
      EP("08:45", "alpe-di-siusi-compatsch", "Teleférico Siusi → Compatsch + caminhada pelo maior prado alpino da Europa (5–6km, easy). Pico de flores em junho", { cost: 60, time: "08:45" }),
      E("12:00", "Piquenique no planalto com vista do Sciliar", "food"),
      E("13:00", "Descer de teleférico", "transport"),
      EP("14:00", "castelrotto", "Tarde livre / opcional Castelrotto — vila medieval tirolesa a 10 min do camping"),
      E("19:00", "Jantar no motorhome", "food"),
      STAY("Camping Seiser Alm, Val Gardena", 46.56, 11.65, "camp-seiser-alm-val-gardena"),
    ],
  },
  // ── Day 17 — Val Gardena → Carezza → Sirmione ─────────────────────────────────
  {
    num: "17",
    cls: "",
    title: "Val Gardena → Lago di Carezza → Sirmione",
    dayCost: "~€10 (estacionamento + snack)",
    schedule: [
      E("08:00", "Desmontar camp em Val Gardena", "stay"),
      E("08:30", "Dirigir até Lago di Carezza via Val d'Ega (~48km, 1h10)", "transport"),
      EP("09:45", "lago-di-carezza", "Lago di Carezza (Karersee) — reflexo do Latemar e Catinaccio. Caminhada curta (~30 min). Despedida das Dolomitas"),
      E("10:30", "Packed lunch perto do lago", "food"),
      E("11:00", "Dirigir até Desenzano del Garda via A22 sul → A4 oeste (~175km, 2h10)", "transport"),
      EP("13:15", "desenzano-del-garda", "Chegada em Desenzano. Estacionar no free parking Via Michelangelo 9. Centro medieval, porto"),
      EP("15:00", "sirmione", "Drive até Sirmione (~15 min). Centro storico, gelato"),
      E("19:00", "Retorno ao free parking Desenzano. Jantar no motorhome", "food"),
      STAY("Free parking Desenzano", 45.4597, 10.5597, "free-parking-desenzano"),
    ],
  },
  // ── Day 18 — Sirmione → MXP ─────────────────────────────────
  {
    num: "18",
    cls: "city",
    title: "Sirmione → MXP",
    dayCost: "~€74 (castelo €16 + grotte €20 + farewell lunch)",
    schedule: [
      INSIGHT({ warnings: ["Perguntar à Indie Campers se pode pernoitar no pátio na véspera da devolução"] }),
      E("08:30", "Café da manhã no motorhome com vista do Lago di Garda", "food"),
      EP("09:30", "castello-scaligero-sirmione", "Castello Scaligero — fortaleza do séc. XIII sobre o lago. Subir na torre", { cost: 8, time: "09:30" }),
      EP("11:00", "grotte-di-catullo", "Caminhar pela península até as Grotte di Catullo — ruínas de villa romana", { cost: 10, time: "11:00" }),
      EP("12:30", "farewell-lunch-garda", "🍽️ ALMOÇO DE DESPEDIDA — restaurante com terraço no Lago di Garda. Peixe (lavarello, luccioperca) + vinho Lugana DOC"),
      E("14:30", "Último passeio por Sirmione. Gelato e souvenir", "custom"),
      E("15:30", "🧹 LIMPEZA FINAL DO MOTORHOME — esvaziar geladeira, limpar fogão/bancada/pia, varrer, scarico WC + tanque cinza, recolher varal, separar lixo, conferir armários, organizar malas", "stay"),
      E("17:00", "⛽ Abastecer diesel na A4 (Brescia/Bergamo) — tanque cheio para devolver", "transport"),
      E("17:30", "Dirigir de Sirmione até a região de MXP pela A4 (~2h)", "transport"),
      E("19:30", "Chegada perto do aeroporto. Dormir no motorhome (pátio Indie Campers ou Park4Night)", "stay"),
      STAY("Pernoite livre perto de MXP", 45.6197, 8.7603, "indie-campers-mxp-pickup-return"),
    ],
  },
  // ── Day 19 — Return ─────────────────────────────────
  {
    num: "19",
    cls: "",
    title: "Return Motorhome → São Paulo",
    schedule: [
      E("07:00", "Acordar tranquilo — perto do aeroporto", "transport"),
      E("07:30", "Café da manhã no motorhome. Últimos preparativos", "food"),
      EP("08:00", "indie-campers-mxp-pickup-return", "Devolver motorhome na Indie Campers (MXP). Inspeção do veículo"),
      E("09:00", "Transfer até o terminal. Check-in e despachar malas", "transport"),
      E("10:30", "Tempo livre no aeroporto — duty free, último espresso italiano", "food"),
      E("13:00", "Voo LATAM LA8073 → GRU", "transport"),
      E("20:00", "Chegada em São Paulo", "transport"),
    ],
  },
];

// ---------------------------------------------------------------------------
// Bookings (verbatim from seed, with date normalized)
// Note: seed used ISO dates "8 Jun" — converting to YYYY-MM-DD for 2026
// ---------------------------------------------------------------------------
const bookings = [
  { date: "2026-06-08", item: "Seguro Viagem (Mastercard Black / AIG)", link: "https://drive.google.com/file/d/1132jG9xZs7ZdOnMdiwAs0yJX8xMwc44r/view", status: "confirmed", critical: false },
  { date: "2026-06-08", item: "Passagem aérea GRU ↔ MXP (LATAM LA8072/LA8073)", link: "https://drive.google.com/file/d/12SaF4BwKbDIEtcUD9daWoB2NSgWge0hN/view", status: "confirmed", critical: false },
  { date: "2026-06-09", item: "Contrato Motorhome Indie Campers", link: "https://drive.google.com/file/d/1dbNhWoKDhOdCfTDo-us1MgPaYyHh-zYQ/view", status: "confirmed", critical: false },
  { date: "2026-06-09", item: "Reserva Camping Fusina", link: "https://drive.google.com/file/d/1HfWfW2MmMemtNkGSdo8pQRB8JPEYQq8H/view", status: "confirmed", critical: false },
  { date: "2026-06-10", item: "Itinerari Segreti — Palazzo Ducale", status: "confirmed", critical: false },
  { date: "2026-06-10", item: "Ingresso Basilica di San Marco", link: "https://tickets.basilicasanmarco.it/en/store", status: "pending", critical: true },
  { date: "2026-06-10", item: "Concerto Vivaldi — Four Seasons (I Musici Veneziani)", link: "https://www.imusiciveneziani.com/en/concerts/a-vivaldis-four-seasons/", status: "pending", critical: true },
  { date: "2026-06-11", item: "E-vinheta eslovena (7 dias)", link: "https://evinjeta.dars.si/en", status: "pending", critical: false },
  { date: "2026-06-11", item: "Postojna Cave + Predjama Castle combo", link: "https://tickets.postojnska-jama.eu/en/postojna-cave-predjama-castle/pack-107.html", status: "pending", critical: false },
  { date: "2026-06-11", item: "Reserva Camping Bled", link: "https://drive.google.com/file/d/1wxOdJxbN1d0-QOZJ_DKeTmWuCTNM3euD/view", status: "confirmed", critical: false },
  { date: "2026-06-12", item: "Ingresso Vintgar Gorge", link: "https://www.vintgar.si/en/", status: "pending", critical: false },
  { date: "2026-06-12", item: "Ingresso Bled Castle", link: "https://www.blejski-grad.si/en/", status: "pending", critical: false },
  { date: "2026-06-13", item: "Vogel Cable Car", link: "https://www.vogel.si/en/", status: "pending", critical: false },
  { date: "2026-06-16", item: "Rafting Rio Soča (SportMix)", link: "https://sportmix.si/en/rafting/", status: "pending", critical: false },
  { date: "2026-06-18", item: "Tre Cime toll road (slot 7h–8h)", link: "https://pass.auronzo.info", status: "pending", critical: true },
  { date: "2026-06-20", item: "Camping Olympia (Dobbiaco)", link: "https://drive.google.com/file/d/1S4mlh_jpZnoxD2iFZAVtgeFOgpWZxOhJ/view", status: "confirmed", critical: false },
  { date: "2026-06-23", item: "Seceda Cable Car", link: "https://www.seceda.it/en/", status: "pending", critical: true },
  { date: "2026-06-23", item: "Jantar tirolês em Ortisei", status: "pending", critical: false },
  { date: "2026-06-25", item: "Free parking Desenzano (Park4Night)", link: "https://park4night.com/en/place/14906", status: "confirmed", critical: false },
  { date: "2026-06-26", item: "Pernoite pátio Indie Campers", status: "pending", critical: false },
];

// ---------------------------------------------------------------------------
// Budget — categories remapped to schema enum
// ---------------------------------------------------------------------------
const budget = [
  { id: "flights", category: "flights", amount: 2090, pct: 27, status: "paid", notes: "LATAM GRU↔MXP — R$ 12.997" },
  { id: "motorhome", category: "transportation", amount: 2170, pct: 28, status: "confirmed", notes: "Indie Campers roundtrip MXP + gás" },
  { id: "campgrounds", category: "accommodations", amount: 714, pct: 9, status: "estimated", notes: "18 nights × ~€42 avg" },
  { id: "fuel", category: "fuel", amount: 430, pct: 5, status: "estimated", notes: "~1.870 km × ~11L/100km × €1.85/L" },
  { id: "tolls-vinhetas", category: "transportation", amount: 81, pct: 1, status: "estimated", notes: "Autostrada (~€65) + e-vinheta SI (€16)" },
  { id: "restaurantes", category: "food", amount: 350, pct: 4, status: "estimated", notes: "4 experiências gastronômicas" },
  { id: "rifugios", category: "food", amount: 220, pct: 3, status: "estimated", notes: "Coffee, snacks, sopas" },
  { id: "supermercado", category: "food", amount: 580, pct: 8, status: "estimated", notes: "~€32/dia × 18 dias" },
  { id: "cable-cars", category: "attractions", amount: 218, pct: 3, status: "estimated", notes: "Seceda + Siusi + Vogel" },
  { id: "wellness", category: "entertainment", amount: 50, pct: 1, status: "estimated", notes: "Camping Olympia (incluído)" },
  { id: "activities", category: "attractions", amount: 488, pct: 6, status: "estimated", notes: "Postojna, Vintgar, Bled Castle, rafting, Tre Cime…" },
  { id: "souvenirs", category: "shopping", amount: 130, pct: 2, status: "estimated", notes: "Speck, grappa, mel esloveno" },
  { id: "translado-gru", category: "transportation", amount: 48, pct: 1, status: "confirmed", notes: "R$ 300" },
  { id: "pet-care", category: "unplanned", amount: 322, pct: 4, status: "confirmed", notes: "Aurora R$ 2.000 (20 dias)" },
  { id: "unplanned", category: "unplanned", amount: 717, pct: 8, status: "reserve", notes: "Catch-all para imprevistos" },
];

// ---------------------------------------------------------------------------
// Checklist — verbatim from seed (reformatted)
// ---------------------------------------------------------------------------
const checklist = [
  {
    title: "Março 2026 — 3 meses antes",
    type: "checklist",
    items: [
      { id: "c-voo", text: "Voos LATAM GRU↔MXP — Confirmado", status: "done" },
      { id: "c-mh", text: "Motorhome Indie Campers — Confirmado", status: "done" },
      { id: "c-seg", text: "Seguro viagem Mastercard Black / AIG", status: "done" },
    ],
  },
  {
    title: "Abril 2026 — 2 meses antes",
    type: "checklist",
    items: [
      { id: "c-trecime", text: "✅ Tre Cime toll road — cadastro criado em pass.auronzo.info. Tickets abrem ~final de maio", status: "done" },
      { id: "c-vrsic", text: "✅ Vršič Pass: motorhome PASSA mas desafiador. Sair cedo, marcha baixa na descida. Plan B: Predel Pass se chover", status: "done" },
      { id: "c-seceda", text: "Seceda cable car — RESERVA ONLINE OBRIGATÓRIA em 2026 com time slot. seceda.it para Jun 23", status: "pending", critical: true },
      { id: "c-palazzo", text: "⚠️ Itinerari Segreti — Palazzo Ducale (tour inglês 11:30, Jun 10) — solicitação enviada, aguardando confirmação", status: "pending", critical: true },
      { id: "c-sanmarco", text: "⚠️ Comprar ingresso Basilica di San Marco online — timed-entry obrigatório desde Jul/2025", status: "pending", critical: true },
      { id: "c-fisico", text: "Condicionamento físico (trilhas de 6h com 700m+ desnível)", status: "done" },
      { id: "c-fusina", text: "Reservar Camping Fusina (Venezia) — Jun 9–11 — Confirmado", status: "done" },
      { id: "c-bled", text: "Reservar Camping Bled (Jun 11–14) — 3 noites confirmadas", status: "done" },
      { id: "c-olympia", text: "Reservar Camping Olympia (Dobbiaco) — Jun 20–22, €65.50/noite. Confirmado", status: "done" },
      { id: "c-sirmione-camp", text: "Camping Sirmione não aceita 1 noite. Alternativa: free parking Desenzano (Park4Night)", status: "done" },
      { id: "c-postojna", text: "Comprar combo Postojna+Predjama online (~€47/pp)", status: "pending" },
      { id: "c-rafting", text: "Reservar rafting Soča (SportMix)", status: "pending" },
      { id: "c-indie-overnight", text: "Perguntar Indie Campers sobre pernoite no pátio na noite de 26 Jun", status: "pending" },
    ],
  },
  {
    title: "Maio 2026 — 1 mês antes",
    type: "checklist",
    items: [
      { id: "c-translado", text: "Translado Indaiatuba → GRU — ônibus 09:30 + Uber. R$300", status: "done" },
      { id: "c-aurora", text: "Aurora (pet care) confirmada. R$100/dia × 20 dias = R$2.000", status: "done" },
      { id: "c-confirmar", text: "Confirmar todas as reservas (motorhome, campings, voos)", status: "pending" },
      { id: "c-vinheta", text: "Comprar e-vinheta eslovena (evinjeta.dars.si) — 7-day pass, Cat 2A", status: "pending" },
      { id: "c-banco", text: "Avisar banco sobre viagem (Itália + Eslovênia)", status: "done" },
      { id: "c-cnh", text: "Verificar carteira de motorista internacional", status: "done" },
      { id: "c-roaming", text: "Verificar roaming celular (EU roaming cobre IT + SI)", status: "done" },
      { id: "c-drone-dflight", text: "Drone Avata 2 — Registrar D-Flight (d-flight.it). €6/ano", status: "pending", critical: true },
      { id: "c-drone-seguro", text: "Drone — Contratar seguro RC (obrigatório UE, ~€920k cobertura)", status: "pending", critical: true },
      { id: "c-drone-qr", text: "Drone — Colar QR code (eID) no Avata 2", status: "pending" },
      { id: "c-drone-app", text: "Drone — Baixar app D-Flight", status: "pending" },
      { id: "c-drone-guide", text: "Drone — Estudar drone-guide.md. Spots permitidos vs proibidos", status: "pending" },
      { id: "c-placa-mh", text: "Pedir placa do motorhome a Indie Campers — necessária para Tre Cime toll", status: "pending", critical: true },
      { id: "c-franquia", text: "Verificar franquia seguro Indie Campers (€1.500-3.000). Considerar redução (~€10-15/dia)", status: "pending", critical: true },
      { id: "c-ztl", text: "Estudar ZTL (Zona Traffico Limitato) das cidades italianas", status: "pending" },
      { id: "c-farois-si", text: "Eslovênia: faróis baixos obrigatórios 24h/dia. Multa ~€40", status: "pending" },
      { id: "c-mapas", text: "Baixar mapas offline: Google Maps (IT + SI), Komoot/AllTrails", status: "pending" },
      { id: "c-apps", text: "Baixar apps: Park4Night, CamperContact, MeteoTrentino, ARSO", status: "pending" },
    ],
  },
  {
    title: "Semanas anterior (início de junho)",
    type: "checklist",
    items: [
      { id: "c-trecime-ticket", text: "⚠️ ~19 Mai (30 dias antes): Reservar Tre Cime toll road ticket — placa do veículo necessária", status: "pending", critical: true },
      { id: "c-concerto", text: "⚠️ Comprar tickets Concerto I Musici Veneziani (Jun 10, 20:30) — ~€65/pp", status: "pending", critical: true },
      { id: "c-missa", text: "Verificar horário de missas na Basilica di San Marco (orarimesse.it)", status: "pending" },
      { id: "c-clima", text: "Verificar condições climáticas de longo prazo", status: "pending" },
      { id: "c-vrsicopen", text: "Verificar se Vršič Pass está aberto (geralmente abre maio/junho)", status: "pending" },
      { id: "c-vrsic-vespera", text: "⚠️ Véspera do Vršič: checar condições da estrada. Se choveu → Predel Pass", status: "pending", critical: true },
      { id: "c-sorapis-check", text: "Verificar condições Lago di Sorapis (1 semana antes): neve/gelo nos cabos. Instagram Rifugio Vandelli", status: "pending", critical: true },
      { id: "c-neve", text: "Verificar condições de neve nos passes dolomíticos (Gardena, Sella)", status: "pending" },
      { id: "c-cash", text: "Trocar €300 em espécie (notas pequenas)", status: "pending" },
      { id: "c-playlist", text: "Preparar playlist/podcasts para estrada", status: "pending" },
      { id: "c-mala", text: "Fazer mala seguindo packing list", status: "pending" },
      { id: "c-eletro", text: "Carregar eletrônicos + power bank", status: "pending" },
      { id: "c-checkin", text: "Check-in LATAM (24h antes do voo)", status: "pending" },
    ],
  },
  {
    title: "2-3 dias antes do voo (05-06/06)",
    type: "checklist",
    items: [
      { id: "c-seguro2", text: "⚠️ Emitir NOVO seguro viagem premium — bilhete expira 07/06. NÃO deixar para o dia do voo!", status: "pending", critical: true },
    ],
  },
  {
    title: "Dia do voo — 08/06/2026",
    type: "checklist",
    items: [
      { id: "c-seceda2", text: "Seceda cable car — confirmar time slot Jun 23. Levar €10 cash para taxa da crista (€5/pp)", status: "pending", critical: true },
    ],
  },
  // Packing groups
  {
    title: "🔴 Documentos & Dinheiro",
    type: "packing",
    items: [
      { id: "p-passaporte", text: "Passaportes (validade 6+ meses)", status: "pending" },
      { id: "p-cnh", text: "Carteira de motorista internacional", status: "pending" },
      { id: "p-cartoes", text: "Cartões de crédito (avisar banco!)", status: "pending" },
      { id: "p-cash", text: "€300 em cash (notas pequenas — rifúgios só aceitam cash)", status: "pending" },
      { id: "p-reservas", text: "Confirmações impressas: motorhome, voos, campings, Tre Cime, Seceda, Postojna, rafting", status: "pending" },
      { id: "p-copiadigital", text: "Cópia digital de todos os docs no celular", status: "pending" },
      { id: "p-seguro", text: "Seguro viagem emitido (emitir 08/06)", status: "pending" },
      { id: "p-vinheta", text: "E-vinheta eslovena comprada (evinjeta.dars.si)", status: "pending" },
    ],
  },
  {
    title: "🥾 Trekking",
    type: "packing",
    items: [
      { id: "p-botas", text: "Botas de trekking impermeáveis (já amaciadas!)", status: "pending" },
      { id: "p-mochila", text: "Mochila de trilha 25-35L com capa de chuva", status: "pending" },
      { id: "p-bastoes", text: "Bastões de caminhada telescópicos", status: "pending" },
      { id: "p-garrafa", text: "Garrafa d'água reutilizável 1L cada", status: "pending" },
      { id: "p-luvas", text: "Luvas leves de trekking (cabos de aço em Sorapis)", status: "pending" },
      { id: "p-headlamp", text: "Headlamp/lanterna de cabeça (Postojna + saídas cedo)", status: "pending" },
      { id: "p-protetor", text: "Protetor solar SPF 50 + protetor labial com FPS", status: "pending" },
      { id: "p-oculos", text: "Óculos de sol categoria 3-4 (mountain-grade)", status: "pending" },
      { id: "p-buff", text: "Buff / neck gaiter (multiuso)", status: "pending" },
      { id: "p-sacoseco", text: "Saco estanque para eletrônicos (chuvas Dolomitas)", status: "pending" },
      { id: "p-apito", text: "Apito de emergência", status: "pending" },
      { id: "p-snacks", text: "Snacks de trilha: barras energéticas, frutas secas, nuts", status: "pending" },
    ],
  },
  {
    title: "💊 Saúde & Segurança",
    type: "packing",
    items: [
      { id: "p-bolhas", text: "Kit primeiros socorros: band-aids/Compeed, fita atlética, gaze, esparadrapo", status: "pending" },
      { id: "p-antisseptico", text: "Antisséptico: Povidona iodada (Betadine) sachês", status: "pending" },
      { id: "p-analgesico", text: "Ibuprofeno 400mg + Paracetamol 750mg", status: "pending" },
      { id: "p-antidiarreia", text: "Loperamida/Imosec — mudança de dieta", status: "pending" },
      { id: "p-antialergico", text: "Loratadina/Cetirizina — pólen alpino em junho", status: "pending" },
      { id: "p-antiacido", text: "Omeprazol — jantares pesados (Tyrolean cuisine)", status: "pending" },
      { id: "p-relaxante", text: "Ciclobenzaprina/Miosan — pernas após trilhas", status: "pending" },
      { id: "p-sro", text: "Sal de reidratação oral (2-3 sachês)", status: "pending" },
      { id: "p-colirio", text: "Colírio lubrificante", status: "pending" },
      { id: "p-buscopan", text: "Buscopan — cólica por frio/alimentação", status: "pending" },
      { id: "p-repelente", text: "Repelente de insetos (lagos ao entardecer)", status: "pending" },
      { id: "p-medicamentos", text: "Medicamentos pessoais + receitas", status: "pending" },
      { id: "p-pastilhas", text: "Pastilhas para purificar água (emergência)", status: "pending" },
      { id: "p-emergencia", text: "Emergência: 112 (Europa), 118 (resgate montanha IT)", status: "pending" },
    ],
  },
  {
    title: "👕 Roupas (Junho: 8-30°C, variável por altitude)",
    type: "packing",
    items: [
      { id: "p-camisetas", text: "Base layer: 5-6 camisetas técnicas dry-fit", status: "pending" },
      { id: "p-fleece", text: "Mid layer: 2 fleece / softshell", status: "pending" },
      { id: "p-jaqueta", text: "Outer layer: 1 jaqueta corta-vento impermeável (ESSENCIAL)", status: "pending" },
      { id: "p-puffer", text: "Insulation: 1 puffer jacket leve (noites em altitude 2-8°C)", status: "pending" },
      { id: "p-calcas", text: "2 calças de trekking (1 conversível em shorts)", status: "pending" },
      { id: "p-shorts", text: "2 shorts para vales quentes (20-28°C)", status: "pending" },
      { id: "p-calcacasual", text: "1 calça casual/jeans para cidades", status: "pending" },
      { id: "p-meias", text: "5 pares meias trekking merino (não algodão!)", status: "pending" },
      { id: "p-meiasnormais", text: "2 pares de meias normais", status: "pending" },
      { id: "p-chinelo", text: "Chinelo para camping/wellness", status: "pending" },
      { id: "p-tenis", text: "Tênis casual/walking shoes para cidades", status: "pending" },
      { id: "p-casual", text: "2-3 conjuntos casuais para cidades e jantares", status: "pending" },
      { id: "p-bone", text: "Boné / chapéu de sol UV", status: "pending" },
      { id: "p-toalha", text: "Toalha de secagem rápida (microfiber)", status: "pending" },
      { id: "p-banho", text: "Roupa de banho (piscinas, Bohinj, rafting)", status: "pending" },
      { id: "p-canga", text: "Canga ou roupão leve (wellness)", status: "pending" },
      { id: "p-interior", text: "Roupa interior para ~7 dias (lavar mid-trip)", status: "pending" },
    ],
  },
  {
    title: "🚐 Motorhome — itens para trazer do Brasil",
    type: "packing",
    items: [
      { id: "p-bedding", text: "⚠️ Bedding Kit — verificar reserva Indie Campers ou alugar Essential Travel Kit", status: "pending" },
      { id: "p-toalhas", text: "Toalhas de banho microfiber (2) — Indie Campers NÃO fornece", status: "pending" },
      { id: "p-panosprato", text: "Panos de prato / multiuso (3-4)", status: "pending" },
      { id: "p-abridor", text: "Abridor de lata/garrafa + saca-rolhas", status: "pending" },
      { id: "p-facachef", text: "Faca de chef pequena (facas do kit são básicas)", status: "pending" },
      { id: "p-moka", text: "Moka pot para café italiano", status: "pending" },
      { id: "p-varal", text: "Varal + pregadores (secar em 2-3h ao sol)", status: "pending" },
      { id: "p-prendedores", text: "Prendedores de mola / clips", status: "pending" },
      { id: "p-faca", text: "Faca multiuso / canivete", status: "pending" },
      { id: "p-tupperware", text: "Tupperware / potes herméticos para packed lunch", status: "pending" },
      { id: "p-sacotermico", text: "Saco térmico pequeno", status: "pending" },
      { id: "p-lanterna", text: "Lanterna (camping sem iluminação)", status: "pending" },
      { id: "p-extensao", text: "Extensão elétrica curta", status: "pending" },
      { id: "p-adaptgas", text: "Adaptador de gás europeu universal", status: "pending" },
      { id: "p-temperos", text: "Temperos básicos em potes pequenos: sal, pimenta, azeite mini", status: "pending" },
    ],
  },
  {
    title: "🛒 Motorhome — comprar no primeiro supermercado (D1)",
    type: "packing",
    items: [
      { id: "p-limpeza", text: "Kit de limpeza: esponja, detergente, pano de chão", status: "pending" },
      { id: "p-lixo", text: "Sacos de lixo extras (separar reciclável — obrigatório IT)", status: "pending" },
      { id: "p-papeltoalha", text: "Papel toalha + papel higiênico", status: "pending" },
      { id: "p-pastilhaswc", text: "Pastilhas WC químico (Thetford Aqua Kem)", status: "pending" },
      { id: "p-temperosgrandes", text: "Azeite, sal, temperos (embalagens maiores)", status: "pending" },
    ],
  },
  {
    title: "📱 Tech & Navegação",
    type: "packing",
    items: [
      { id: "p-carregador", text: "Celulares + carregadores + power bank 10.000+ mAh", status: "pending" },
      { id: "p-cabousb", text: "Cabo USB-C extra (backup)", status: "pending" },
      { id: "p-adaptador", text: "Adaptador de tomada europeu Tipo C/F", status: "pending" },
      { id: "p-roaming", text: "Celular com roaming EU ativo", status: "pending" },
      { id: "p-mapas2", text: "Mapas offline: Google Maps (Trentino + Eslovênia), AllTrails (7 trilhas), Komoot", status: "pending" },
      { id: "p-apps2", text: "Apps: Park4Night, CamperContact, MeteoTrentino, ARSO, AllTrails, Google Translate", status: "pending" },
    ],
  },
  {
    title: "📷 Câmera & Fotografia",
    type: "packing",
    items: [
      { id: "p-camera", text: "Câmera + carregador + bateria reserva", status: "pending" },
      { id: "p-cartao", text: "Cartão de memória extra", status: "pending" },
      { id: "p-tripe", text: "Tripé compacto / gorillapod (long exposure em lagos)", status: "pending" },
      { id: "p-panolente", text: "Pano de limpeza para lente", status: "pending" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Trip root
// ---------------------------------------------------------------------------
const trip = {
  slug: "italy-2026-v2",
  title: "Itália + Eslovênia + Dolomitas — Motorhome Loop",
  destination: {
    startLocation: "São Paulo",
    headlineTo: "Italy",
    headlineFrom: "São Paulo",
  },
  startDate: "2026-06-08",
  status: "planned",
  currency: "EUR",
  timezone: "Europe/Rome",
  isPublic: false,
  days,
  bookings,
  budget,
  checklist,
};

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------
const mapData = {
  pois: pois.map((p) => ({ ...p, updatedBy: "skill" })),
  routes: [], // Phase 4 populates this
};

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------
writeFileSync(join(TRIP_DIR, "trip.json"), JSON.stringify(trip, null, 2) + "\n");
writeFileSync(join(TRIP_DIR, "map.json"), JSON.stringify(mapData, null, 2) + "\n");

console.log(`✓ Wrote ${days.length} days, ${bookings.length} bookings, ${budget.length} budget items, ${checklist.length} checklist groups`);
console.log(`✓ Wrote ${pois.length} POIs, 0 routes (Phase 4 fills routes via OSRM)`);
