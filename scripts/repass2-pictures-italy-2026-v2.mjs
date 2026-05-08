#!/usr/bin/env node
// Final pass for pictures: trust og:image URLs (Wikimedia is reliable), fall back to REST API summary.
// No validation HEAD requests (rate-limited).

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const TRIP_DIR = join(REPO_ROOT, "trips", "italy-2026-v2");
const TRIP_PATH = join(TRIP_DIR, "trip.json");

const trip = JSON.parse(readFileSync(TRIP_PATH, "utf-8"));

const wikiTitles = {
  "basilica-dei-frari": "Frari",
  "st-john-baptist-bohinj": "Church_of_St._John_the_Baptist,_Bohinj",
  "pokljuka-plateau": "Pokljuka",
  "pericnik-waterfall": "Peričnik_Falls",
  "kranjska-gora": "Kranjska_Gora",
  "vrsic-pass": "Vršič_Pass",
  "russian-chapel": "Russian_Chapel_on_the_Vršič_Pass",
  bovec: "Bovec",
  "lago-del-predil": "Lago_del_Predil",
  "lago-di-fusine": "Laghi_di_Fusine",
  "tre-cime-di-lavaredo": "Tre_Cime_di_Lavaredo",
  "rifugio-locatelli": "Drei_Zinnen_Hut",
  "lago-di-sorapis": "Lake_Sorapiss",
  "lago-di-braies": "Pragser_Wildsee",
  "dobbiaco-san-candido": "Toblach",
  "bressanone-brixen": "Brixen",
  "chiusa-klausen": "Klausen,_South_Tyrol",
  "monastero-di-sabiona": "Säben_Abbey",
  "ortisei-st-ulrich": "Urtijëi",
  "seceda-ridgeline": "Seceda",
  "alpe-di-siusi-compatsch": "Alpe_di_Siusi",
  castelrotto: "Kastelruth",
  "lago-di-carezza": "Karersee",
  sirmione: "Sirmione",
  "castello-scaligero-sirmione": "Sirmione_Castle",
  "grotte-di-catullo": "Grottoes_of_Catullus",
};

const UA = "claude-x8-travel-skill/1.0";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOgImage(title) {
  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status === 429) { await sleep(2000); continue; }
      if (res.status === 404) return { error: "404", url: null };
      if (!res.ok) return { error: `${res.status}`, url: null };
      const html = await res.text();
      const m = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
      if (m) return { url: m[1] };
      // Fallback: look for any og:image-like
      const m2 = html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/);
      if (m2) return { url: m2[1] };
      return { error: "no-og-image", url: null };
    } catch (err) {
      await sleep(1000);
    }
  }
  return { error: "fail", url: null };
}

async function fetchRestSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Find missing
const missing = [];
const seen = new Set();
for (const day of trip.days) {
  for (const item of day.schedule ?? []) {
    if (item.type !== "experience" || !item.poiId || item.picture) continue;
    if (seen.has(item.poiId)) continue;
    const title = wikiTitles[item.poiId];
    if (!title) continue;
    seen.add(item.poiId);
    missing.push({ poiId: item.poiId, title });
  }
}

console.log(`Re-fetching ${missing.length} missing pictures (no validation, trust Wikimedia)...\n`);

const found = {};
for (let i = 0; i < missing.length; i++) {
  const { poiId, title } = missing[i];
  const og = await fetchOgImage(title);
  let pic = og.url;
  if (!pic) {
    // Fallback to REST summary
    const summary = await fetchRestSummary(title);
    if (summary?.originalimage?.source) {
      pic = summary.originalimage.source.replace(/\/(\d{2,4})px-/, "/1280px-");
    } else if (summary?.thumbnail?.source) {
      pic = summary.thumbnail.source;
    }
  }
  if (pic) {
    found[poiId] = pic;
    console.log(`[${i + 1}/${missing.length}] ${poiId} (${title}): ✓ ${pic.split("/").pop().slice(0, 50)}`);
  } else {
    console.log(`[${i + 1}/${missing.length}] ${poiId} (${title}): SKIP (${og.error || "no-image"})`);
  }
  await sleep(700);
}

let applied = 0;
for (const day of trip.days) {
  for (const item of day.schedule ?? []) {
    if (item.type !== "experience" || !item.poiId || item.picture) continue;
    const pic = found[item.poiId];
    if (pic) {
      item.picture = pic;
      applied++;
    }
  }
}

writeFileSync(TRIP_PATH, JSON.stringify(trip, null, 2) + "\n");
console.log(`\n✓ Applied ${applied} pictures (${Object.keys(found).length} unique POIs)`);
