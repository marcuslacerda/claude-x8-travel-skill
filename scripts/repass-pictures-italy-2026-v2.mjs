#!/usr/bin/env node
// Second pass: fetch missing og:images for POIs that have wikiTitle but no picture.
// Lower concurrency + skip HEAD validation (Wikimedia og:images are server-generated,
// reliably exist). If validation matters, we do a quick GET-2KB instead of HEAD.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const TRIP_DIR = join(REPO_ROOT, "trips", "italy-2026-v2");
const TRIP_PATH = join(TRIP_DIR, "trip.json");

const trip = JSON.parse(readFileSync(TRIP_PATH, "utf-8"));

// Need wikiTitle map again — re-import is hard, so reuse a subset by matching name patterns
const wikiTitles = {
  venezia: "Venice",
  "basilica-san-marco": "St_Mark's_Basilica",
  "campanile-san-marco": "St_Mark's_Campanile",
  "palazzo-ducale-itinerari-segreti": "Doge's_Palace",
  "basilica-santi-giovanni-paolo": "Santi_Giovanni_e_Paolo,_Venice",
  "chiesa-gesuiti": "Santa_Maria_Assunta,_Venice",
  "ponte-di-rialto": "Rialto_Bridge",
  "basilica-dei-frari": "Frari_Basilica",
  "santa-maria-della-salute": "Santa_Maria_della_Salute",
  "cividale-del-friuli": "Cividale_del_Friuli",
  "postojna-cave": "Postojna_Cave",
  "predjama-castle": "Predjama_Castle",
  "vintgar-gorge": "Vintgar_Gorge",
  "lago-bled": "Lake_Bled",
  "bled-castle": "Bled_Castle",
  "lago-bohinj": "Lake_Bohinj",
  "st-john-baptist-bohinj": "Church_of_St._John_the_Baptist,_Bohinj",
  "savica-waterfall": "Savica_Falls",
  "pokljuka-plateau": "Pokljuka",
  "pericnik-waterfall": "Peričnik_Falls",
  "kranjska-gora": "Kranjska_Gora",
  "vrsic-pass": "Vršič_Pass",
  "russian-chapel": "Russian_Chapel_on_the_Vršič_Pass",
  bovec: "Bovec",
  "lago-del-predil": "Lago_del_Predil",
  "lago-di-fusine": "Fusine_Lakes",
  "cortina-d-ampezzo": "Cortina_d'Ampezzo",
  "tre-cime-di-lavaredo": "Tre_Cime_di_Lavaredo",
  "rifugio-locatelli": "Dreizinnenhütte",
  "lago-di-sorapis": "Lake_Sorapiss",
  "lago-di-braies": "Pragser_Wildsee",
  "dobbiaco-san-candido": "Dobbiaco",
  "bressanone-brixen": "Brixen",
  "chiusa-klausen": "Klausen,_South_Tyrol",
  "monastero-di-sabiona": "Säben_Abbey",
  "ortisei-st-ulrich": "Urtijëi",
  "seceda-ridgeline": "Seceda",
  "alpe-di-siusi-compatsch": "Alpe_di_Siusi",
  castelrotto: "Kastelruth",
  "lago-di-carezza": "Lake_Carezza",
  "desenzano-del-garda": "Desenzano_del_Garda",
  sirmione: "Sirmione",
  "castello-scaligero-sirmione": "Scaliger_Castle,_Sirmione",
  "grotte-di-catullo": "Grottoes_of_Catullus",
};

const UA = "claude-x8-travel-skill/1.0";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOgImage(title, retries = 2) {
  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status === 429) {
        await sleep(3000);
        continue;
      }
      if (!res.ok) return null;
      const html = await res.text();
      const m = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
      return m ? m[1] : null;
    } catch {
      await sleep(1000);
    }
  }
  return null;
}

async function quickValidate(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Use Range to only fetch first 1KB — cheap validation
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Range: "bytes=0-1023" },
      });
      if (res.status === 429) {
        await sleep(3000);
        continue;
      }
      if (!res.ok && res.status !== 206) return false;
      const ct = res.headers.get("content-type") ?? "";
      return ct.startsWith("image/");
    } catch {
      await sleep(1000);
    }
  }
  return false;
}

// Find POIs missing pictures
const missing = [];
for (const day of trip.days) {
  for (const item of day.schedule ?? []) {
    if (item.type !== "experience") continue;
    if (!item.poiId) continue;
    if (item.picture) continue;
    const title = wikiTitles[item.poiId];
    if (!title) continue;
    if (missing.find((m) => m.poiId === item.poiId)) continue;
    missing.push({ poiId: item.poiId, title });
  }
}

console.log(`Re-fetching ${missing.length} missing pictures with concurrency 2...\n`);

const fetched = {};
let idx = 0;
async function worker() {
  while (idx < missing.length) {
    const i = idx++;
    const { poiId, title } = missing[i];
    const og = await fetchOgImage(title);
    if (!og) {
      console.log(`[${i + 1}/${missing.length}] ${poiId}: og:image=null`);
      await sleep(500);
      continue;
    }
    const ok = await quickValidate(og);
    if (ok) {
      fetched[poiId] = og;
      console.log(`[${i + 1}/${missing.length}] ${poiId}: ✓ ${og.split("/").pop().slice(0, 50)}`);
    } else {
      console.log(`[${i + 1}/${missing.length}] ${poiId}: validate failed`);
    }
    await sleep(800);
  }
}
await Promise.all([worker(), worker()]); // concurrency 2

// Apply
let applied = 0;
for (const day of trip.days) {
  for (const item of day.schedule ?? []) {
    if (item.type !== "experience" || !item.poiId) continue;
    if (item.picture) continue;
    const pic = fetched[item.poiId];
    if (pic) {
      item.picture = pic;
      applied++;
    }
  }
}

writeFileSync(TRIP_PATH, JSON.stringify(trip, null, 2) + "\n");
console.log(`\n✓ Applied ${applied} new pictures (${Object.keys(fetched).length} unique POIs)`);
