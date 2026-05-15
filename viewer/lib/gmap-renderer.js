/**
 * Google Maps renderer for the v3 trip viewer — optional, only used when the
 * user has `GOOGLE_MAPS_API_KEY` + `GOOGLE_MAP_ID` in `.env.local`.
 *
 * Mirrors the MapLibre renderer (chips, day selector, idea pins, rich
 * popups) but with Google's AdvancedMarker + MarkerClusterer for clustering
 * and InfoWindow for the rich popup card.
 */

import { KIND_EMOJI, CATEGORY_LABELS } from "./schema-types.js";
import { safeDecode } from "./polyline-decoder.js";
import { getRouteStyle, visibleRoutes, mappablePlaces } from "./route-style.js";
import { buildHydration } from "./hydrate.js";

const FILTERABLE_CATEGORIES = ["attraction", "stay", "food", "shopping", "transport"];

let bootstrapped = false;

/**
 * Install Google Maps' Inline Bootstrap Loader. After this runs,
 * `google.maps.importLibrary(...)` works. Idempotent.
 */
function bootstrapGoogleMaps(apiKey) {
  if (bootstrapped) return;
  if (window.google?.maps?.importLibrary) {
    bootstrapped = true;
    return;
  }

  ((g) => {
    let h,
      a,
      k,
      p = "The Google Maps JavaScript API",
      c = "google",
      l = "importLibrary",
      q = "__ib__",
      m = document,
      b = window;
    b = b[c] || (b[c] = {});
    const d = b.maps || (b.maps = {}),
      r = new Set(),
      e = new URLSearchParams(),
      u = () =>
        h ||
        (h = new Promise(async (f, n) => {
          await (a = m.createElement("script"));
          e.set("libraries", [...r] + "");
          for (k in g)
            e.set(
              k.replace(/[A-Z]/g, (t) => "_" + t[0].toLowerCase()),
              g[k],
            );
          e.set("callback", c + ".maps." + q);
          a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
          d[q] = f;
          a.onerror = () => (h = n(Error(p + " could not load.")));
          a.nonce = m.querySelector("script[nonce]")?.nonce || "";
          m.head.append(a);
        }));
    d[l]
      ? console.warn(p + " only loads once. Ignoring:", g)
      : (d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)));
  })({ key: apiKey, v: "weekly" });
  bootstrapped = true;
}

/**
 * @param {HTMLElement} container
 * @param {import("./schema-types.js").Trip} trip
 * @param {{ apiKey: string, mapId: string, hydration?: ReturnType<typeof buildHydration>, onSeeInItinerary?: (placeId: string, dayIndex: number) => void }} config
 */
export async function renderGoogleMap(container, trip, config) {
  window.gm_authFailure = () => {
    container.innerHTML = `
      <div class="error" style="margin:1rem">
        <strong>Google Maps auth failed.</strong><br>
        Most common causes:
        <ol style="margin:0.5rem 0 0.5rem 1.25rem">
          <li>Maps JavaScript API not enabled in your Google Cloud project</li>
          <li>Billing not enabled (required even with free-tier credit)</li>
          <li>HTTP referrer restriction missing <code>http://localhost:8000/*</code></li>
          <li>Map ID in a different project than the API key</li>
        </ol>
        Check the JavaScript console (DevTools → Console) for the specific error code.
      </div>
    `;
  };

  bootstrapGoogleMaps(config.apiKey);
  const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
    google.maps.importLibrary("maps"),
    google.maps.importLibrary("marker"),
  ]);

  // Dynamically import MarkerClusterer via ESM CDN (no build step required).
  const { MarkerClusterer } =
    await import("https://cdn.jsdelivr.net/npm/@googlemaps/markerclusterer@2.5.3/+esm");

  const hydration = config.hydration || buildHydration(trip);
  const onSeeInItinerary = config.onSeeInItinerary || defaultSeeInItinerary;

  // Headline places (trip origin) and FLIGHT routes are excluded — they pull
  // bounds to a different continent. (Day view of the day-1 schedule still
  // shows the flight context via the schedule card.)
  const places = mappablePlaces(trip.places || []);
  const routes = (trip.routes || []).filter((r) => r.mode !== "FLIGHT");

  const bounds = computeBounds(places, routes);
  const center = bounds
    ? { lat: (bounds.south + bounds.north) / 2, lng: (bounds.east + bounds.west) / 2 }
    : { lat: 0, lng: 0 };

  const map = new Map(container, {
    mapId: config.mapId,
    center,
    zoom: 5,
    gestureHandling: "greedy",
    streetViewControl: true,
    fullscreenControl: true,
    mapTypeControl: false,
  });

  if (bounds) {
    try {
      map.fitBounds(bounds, 50);
    } catch {
      /* keep default */
    }
  }

  /** UI state */
  const state = {
    enabledCategories: new Set(FILTERABLE_CATEGORIES),
    view: /** @type {"overview" | { dayIndex: number }} */ ("overview"),
  };

  /** @type {Array<{ marker: any, place: any }>} */
  const markerEntries = [];
  /** @type {Array<{ route: any, polyline: any }>} */
  const polylines = [];
  let clusterer = null;

  for (const place of places) {
    if (!place.geo) continue;
    const isIdea = !hydration.scheduledPlaceIds.has(place.id);
    const el = createMarkerEl(place, isIdea);
    const marker = new AdvancedMarkerElement({
      map,
      position: { lat: place.geo.lat, lng: place.geo.lng },
      content: el,
      title: place.name,
      gmpClickable: true,
    });

    const info = new google.maps.InfoWindow({ content: renderPlacePopup(place), maxWidth: 320 });
    marker.addEventListener("gmp-click", () => {
      info.open({ map, anchor: marker });
      // Hydrate the CTA after the InfoWindow renders to the DOM
      setTimeout(() => {
        const ctaEl = document.querySelector(".gm-style .popup-cta");
        if (ctaEl && !ctaEl.dataset.bound) {
          ctaEl.dataset.bound = "1";
          ctaEl.addEventListener("click", () => {
            const dayIdx = (hydration.placeToDays.get(place.id) || [])[0];
            if (dayIdx != null) onSeeInItinerary(place.id, dayIdx);
            info.close();
          });
        }
      }, 0);
    });

    markerEntries.push({ marker, place });
  }

  // Marker clustering — pass all advanced markers; clusterer will manage visibility.
  clusterer = new MarkerClusterer({
    map,
    markers: markerEntries.map((e) => e.marker),
  });

  for (const route of routes) {
    const coords = safeDecode(route.polyline, route.id);
    if (coords.length < 2) continue;
    const path = coords.map(([lat, lng]) => ({ lat, lng }));
    const style = getRouteStyle(route);
    const isFlight = route.mode === "FLIGHT";
    const polyline = new google.maps.Polyline({
      path,
      geodesic: false,
      strokeColor: style.strokeColor,
      strokeOpacity: isFlight ? 0 : style.strokeOpacity,
      strokeWeight: isFlight ? 0 : style.strokeWeight,
      icons: isFlight
        ? [
            {
              icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
              offset: "0",
              repeat: "12px",
            },
          ]
        : undefined,
      map,
    });

    if (!isFlight) {
      polyline.addListener("mouseover", () =>
        polyline.setOptions({ strokeWeight: style.strokeWeight + 2, strokeOpacity: 1 }),
      );
      polyline.addListener("mouseout", () =>
        polyline.setOptions({
          strokeWeight: style.strokeWeight,
          strokeOpacity: style.strokeOpacity,
        }),
      );
    }
    if (route.name) {
      polyline.addListener("click", (e) => {
        const info = new google.maps.InfoWindow({
          content: renderRoutePopup(route),
          position: e.latLng,
        });
        info.open({ map });
      });
    }
    polylines.push({ route, polyline });
  }

  function applyFilters() {
    // Filter markers (idea pins always visible regardless of day filter)
    const updatedVisible = [];
    for (const { marker, place } of markerEntries) {
      const isIdea = !hydration.scheduledPlaceIds.has(place.id);
      const categoryOk = state.enabledCategories.has(place.category);
      let dayOk = true;
      if (state.view !== "overview") {
        const dayIdx = state.view.dayIndex;
        const days = hydration.placeToDays.get(place.id) || [];
        dayOk = isIdea || days.includes(dayIdx);
      }
      const visible = categoryOk && dayOk;
      marker.map = visible ? map : null;
      if (visible) updatedVisible.push(marker);
    }
    // Re-feed the clusterer so it doesn't try to cluster hidden markers
    clusterer?.clearMarkers();
    clusterer?.addMarkers(updatedVisible);

    // Filter routes
    const placesByIdForRoutes = new Map((trip.places || []).map((p) => [p.id, p]));
    const visible = new Set(
      visibleRoutes(routes, state.view, trip.days || [], placesByIdForRoutes).map((r) => r.id),
    );
    for (const { route, polyline } of polylines) {
      polyline.setMap(visible.has(route.id) ? map : null);
    }
  }

  mountChrome(container, trip, state, applyFilters);

  return { map };
}

function mountChrome(container, trip, state, applyFilters) {
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

function computeBounds(places, routes) {
  let south = 90,
    north = -90,
    west = 180,
    east = -180;
  let any = false;
  const visit = (lat, lng) => {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    any = true;
  };
  for (const p of places) {
    if (p.geo) visit(p.geo.lat, p.geo.lng);
  }
  for (const r of routes) {
    const decoded = safeDecode(r.polyline, r.id);
    for (const [lat, lng] of decoded) visit(lat, lng);
  }
  return any ? { south, north, west, east } : null;
}

function createMarkerEl(place, isIdea) {
  const el = document.createElement("div");
  el.className = isIdea ? "map-pin idea-pin" : "map-pin";
  el.textContent = isIdea ? "💡" : KIND_EMOJI[place.kind] || categoryEmoji(place.category);
  return el;
}

function categoryEmoji(category) {
  return (
    { attraction: "📍", stay: "🛏️", food: "🍽️", shopping: "🛍️", transport: "🚉", custom: "📍" }[
      category
    ] || "📍"
  );
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
