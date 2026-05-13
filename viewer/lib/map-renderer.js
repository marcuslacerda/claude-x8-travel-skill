/**
 * MapLibre GL renderer for the v3 trip viewer.
 *
 * Renders a single Trip document (places + routes catalogs at the top level)
 * onto an OpenStreetMap raster basemap. No API key required.
 *
 * Features:
 *   - Category filter chips (Atrações / Camping / Comida / Mercado / Transporte)
 *   - Day selector (Overview / Day N) — filters routes by day.schedule[].routeId
 *   - Idea pins for places NOT referenced by any day (dashed border + 💡)
 *   - Rich popup: picture + popularity + description + "Ver no roteiro" CTA
 *   - Polyline decode (Google encoded) → GeoJSON LineString
 *   - Per-mode color + tag-driven stroke weight via route-style.js
 */

import { KIND_EMOJI, CATEGORY_LABELS } from "./schema-types.js";
import { safeDecode } from "./polyline-decoder.js";
import { getRouteStyle, visibleRoutes, mappablePlaces } from "./route-style.js";
import { buildHydration } from "./hydrate.js";

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: "osm-tiles", type: "raster", source: "osm", minzoom: 0, maxzoom: 19 }],
};

const FILTERABLE_CATEGORIES = ["attraction", "stay", "food", "shopping", "transport"];

/**
 * @param {HTMLElement} container
 * @param {import("./schema-types.js").Trip} trip
 * @param {{ hydration?: ReturnType<typeof buildHydration>, onSeeInItinerary?: (placeId: string, dayIndex: number) => void }} [opts]
 */
export function renderMap(container, trip, opts = {}) {
  if (typeof maplibregl === "undefined") {
    container.innerHTML =
      '<div class="error">MapLibre failed to load. Check the &lt;script&gt; tag in trip.html.</div>';
    return { map: null };
  }

  const hydration = opts.hydration || buildHydration(trip);
  const onSeeInItinerary = opts.onSeeInItinerary || defaultSeeInItinerary;

  // Headline places (trip origin) and FLIGHT routes are excluded from the
  // map — they pull bounds to a different continent and aren't useful at the
  // regional scope the viewer renders.
  const places = mappablePlaces(trip.places || []);
  const routes = (trip.routes || []).filter((r) => r.mode !== "FLIGHT");

  const bounds = computeBounds(places, routes);
  const fallbackCenter = bounds
    ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]
    : [0, 0];

  const map = new maplibregl.Map({
    container,
    style: OSM_STYLE,
    center: fallbackCenter,
    zoom: 5,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  map.addControl(new maplibregl.FullscreenControl(), "top-left");

  /** UI state */
  const state = {
    enabledCategories: new Set(FILTERABLE_CATEGORIES),
    view: /** @type {"overview" | { dayIndex: number }} */ ("overview"),
  };

  /** @type {Array<{ marker: any, place: any }>} */
  const markerEntries = [];
  /** routeId → array of layer ids (one per route for visibility toggling) */
  const routeLayerIds = new Map();

  function renderRouteLayer(route) {
    const sourceId = `route-${route.id}`;
    const layerId = `route-layer-${route.id}`;
    const coords = safeDecode(route.polyline, route.id);
    if (coords.length < 2) return;

    const style = getRouteStyle(route);
    map.addSource(sourceId, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: { name: route.name || "" },
        geometry: { type: "LineString", coordinates: coords.map(([lat, lng]) => [lng, lat]) },
      },
    });
    map.addLayer({
      id: layerId,
      type: "line",
      source: sourceId,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": style.strokeColor,
        "line-width": style.strokeWeight,
        "line-dasharray":
          route.mode === "FLIGHT" ? [4, 4] : route.mode === "FERRY" ? [3, 2] : [1, 0],
        "line-opacity": style.strokeOpacity,
      },
    });
    routeLayerIds.set(route.id, layerId);

    const baseWidth = style.strokeWeight;
    map.on("mouseenter", layerId, () => {
      map.setPaintProperty(layerId, "line-width", baseWidth + 2);
      map.setPaintProperty(layerId, "line-opacity", 1);
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layerId, () => {
      map.setPaintProperty(layerId, "line-width", baseWidth);
      map.setPaintProperty(layerId, "line-opacity", style.strokeOpacity);
      map.getCanvas().style.cursor = "";
    });
    if (route.name) {
      map.on("click", layerId, (e) => {
        new maplibregl.Popup({ closeButton: true })
          .setLngLat(e.lngLat)
          .setHTML(renderRoutePopup(route))
          .addTo(map);
      });
    }
  }

  function applyFilters() {
    for (const { marker, place } of markerEntries) {
      const isIdea = !hydration.scheduledPlaceIds.has(place.id);
      const categoryOk = state.enabledCategories.has(place.category);
      let dayOk = true;
      if (state.view !== "overview") {
        const dayIdx = state.view.dayIndex;
        const days = hydration.placeToDays.get(place.id) || [];
        // Show day's places + idea places (always visible).
        dayOk = isIdea || days.includes(dayIdx);
      }
      marker.getElement().style.display = categoryOk && dayOk ? "" : "none";
    }
    const visible = new Set(visibleRoutes(routes, state.view, trip.days || []).map((r) => r.id));
    for (const [routeId, layerId] of routeLayerIds) {
      if (!map.getLayer(layerId)) continue;
      map.setLayoutProperty(layerId, "visibility", visible.has(routeId) ? "visible" : "none");
    }
  }

  function mountChrome() {
    // Filter chips
    const chipBar = document.createElement("div");
    chipBar.className = "map-chip-bar";
    for (const cat of FILTERABLE_CATEGORIES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map-chip active";
      btn.dataset.category = cat;
      btn.textContent = CATEGORY_LABELS[cat] || cat;
      btn.addEventListener("click", () => {
        if (state.enabledCategories.has(cat)) state.enabledCategories.delete(cat);
        else state.enabledCategories.add(cat);
        btn.classList.toggle("active", state.enabledCategories.has(cat));
        applyFilters();
      });
      chipBar.appendChild(btn);
    }
    container.appendChild(chipBar);

    // Day selector
    const daySelect = document.createElement("select");
    daySelect.className = "map-day-select";
    const overviewOption = document.createElement("option");
    overviewOption.value = "overview";
    overviewOption.textContent = "Overview";
    daySelect.appendChild(overviewOption);
    (trip.days || []).forEach((day, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = `Day ${idx + 1} — ${day.title}`;
      daySelect.appendChild(opt);
    });
    daySelect.addEventListener("change", () => {
      state.view =
        daySelect.value === "overview" ? "overview" : { dayIndex: parseInt(daySelect.value, 10) };
      applyFilters();
    });
    container.appendChild(daySelect);
  }

  map.on("load", () => {
    map.resize();
    if (bounds) {
      try {
        map.fitBounds(bounds, { padding: 50, animate: false });
      } catch {
        /* invalid bounds */
      }
    }

    for (const route of routes) renderRouteLayer(route);

    for (const place of places) {
      if (!place.geo) continue;
      const isIdea = !hydration.scheduledPlaceIds.has(place.id);
      const el = createMarkerEl(place, isIdea);
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([place.geo.lng, place.geo.lat])
        .addTo(map);

      el.addEventListener("click", () => {
        const popup = new maplibregl.Popup({ closeButton: true, offset: 22, maxWidth: "320px" });
        popup.setLngLat([place.geo.lng, place.geo.lat]).setHTML(renderPlacePopup(place)).addTo(map);

        // Bind CTA after the popup HTML is inserted
        popup.once("open", () => {
          const root = popup.getElement();
          const cta = root?.querySelector(".popup-cta");
          if (cta) {
            cta.addEventListener("click", () => {
              const dayIdx = (hydration.placeToDays.get(place.id) || [])[0];
              if (dayIdx != null) onSeeInItinerary(place.id, dayIdx);
              popup.remove();
            });
          }
        });
      });

      markerEntries.push({ marker, place });
    }

    mountChrome();
    applyFilters();
  });

  return { map };
}

function createMarkerEl(place, isIdea) {
  const container = document.createElement("div");
  container.style.cssText = "width: 32px; height: 32px;";
  const inner = document.createElement("div");
  inner.className = isIdea ? "map-pin idea-pin" : "map-pin";
  inner.textContent = isIdea ? "💡" : KIND_EMOJI[place.kind] || categoryEmoji(place.category);
  container.appendChild(inner);
  return container;
}

function categoryEmoji(category) {
  return (
    { attraction: "📍", stay: "🛏️", food: "🍽️", shopping: "🛍️", transport: "🚉", custom: "📍" }[
      category
    ] || "📍"
  );
}

function computeBounds(places, routes) {
  const coords = [];
  for (const p of places) {
    if (p.geo) coords.push([p.geo.lng, p.geo.lat]);
  }
  for (const r of routes) {
    const decoded = safeDecode(r.polyline, r.id);
    for (const [lat, lng] of decoded) coords.push([lng, lat]);
  }
  if (coords.length === 0) return null;
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

function renderPlacePopup(place) {
  const emoji = KIND_EMOJI[place.kind] || categoryEmoji(place.category);
  const picture = place.picture
    ? `<img class="popup-picture" src="${escape(place.picture.url)}" alt="${escape(place.name)}" loading="lazy">`
    : "";
  const popularity =
    place.popularity != null
      ? `<div class="popup-popularity"><span class="pop-score">🔥 ${place.popularity.toFixed(1)}</span><span class="pop-suffix">/ 10</span></div>`
      : "";
  const desc = place.description ? `<div class="poi-desc">${escape(place.description)}</div>` : "";
  const gmapsHref = place.googlePlaceId
    ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.googlePlaceId)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`;
  const credit = place.picture?.credit
    ? `<div class="popup-credit">Foto: ${escape(place.picture.credit)}</div>`
    : "";

  return `
    <div class="poi-popup">
      ${picture}
      <div class="popup-kind">${emoji} ${escape(place.category)}${place.kind ? " · " + escape(place.kind) : ""}</div>
      <div class="poi-name">${escape(place.name)}</div>
      ${popularity}
      ${desc}
      <div class="popup-actions">
        <a href="${escape(gmapsHref)}" target="_blank" rel="noopener" class="poi-source">Maps ↗</a>
        <button type="button" class="popup-cta">Ver no roteiro</button>
      </div>
      ${credit}
    </div>
  `;
}

function renderRoutePopup(route) {
  return `
    <div class="poi-popup">
      <div class="popup-kind">${escape(route.mode)}</div>
      <div class="poi-name">${escape(route.name || "Route")}</div>
      ${route.notes ? `<div class="poi-desc">${escape(route.notes)}</div>` : ""}
    </div>
  `;
}

function defaultSeeInItinerary(placeId, dayIndex) {
  const target = document.getElementById(`day-${dayIndex}`);
  if (target) {
    const itinTab = document.querySelector('[data-tab="itinerary"]');
    itinTab?.click();
    setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
}

function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
