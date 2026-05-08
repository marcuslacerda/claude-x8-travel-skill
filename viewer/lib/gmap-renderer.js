/**
 * Google Maps renderer — optional, only loaded when the user has
 * GOOGLE_MAPS_API_KEY and GOOGLE_MAP_ID set in `.env.local`.
 *
 * Mirrors the MapLibre renderer (POI markers + route polylines + click info)
 * but uses Google's vector rendering with a custom Map ID style. Better
 * geocoding accuracy + Street View, at the cost of needing an API key.
 */

import { KIND_ICONS, ROUTE_KIND_DEFAULTS } from "./schema-types.js";

let bootstrapped = false;

/**
 * Install Google Maps' Inline Bootstrap Loader. After this runs,
 * `google.maps.importLibrary("...")` works (returns a promise that resolves to
 * the library). This is the official recommended pattern from
 * https://developers.google.com/maps/documentation/javascript/load-maps-js-api
 *
 * The classic `<script src="...?libraries=marker">` loader does NOT expose
 * `importLibrary` — that's why we use the bootstrap. Idempotent: subsequent
 * calls are no-ops once installed.
 */
function bootstrapGoogleMaps(apiKey) {
  if (bootstrapped) return;
  if (window.google?.maps?.importLibrary) {
    bootstrapped = true;
    return;
  }
  // Verbatim from Google's bootstrap snippet, with `key` + `v` parameterized.
  // eslint-disable-next-line
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
          for (k in g) e.set(k.replace(/[A-Z]/g, (t) => "_" + t[0].toLowerCase()), g[k]);
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
 * @param {import("./schema-types.js").TripMapData} mapData
 * @param {{ apiKey: string, mapId: string }} config
 */
export async function renderGoogleMap(container, mapData, config) {
  // Hook BEFORE the bootstrap kicks off — Google calls this if the API key
  // is rejected (referrer not allowed, API not enabled, billing missing,
  // invalid key). Without this, Google paints a generic "Oops!" overlay
  // inside the container and we never get a thrown error to react to.
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

  const bounds = computeBounds(mapData);
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
      // bounds invalid — keep default center/zoom
    }
  }

  // POI markers
  for (const poi of mapData.pois) {
    const el = createMarkerEl(poi);
    const marker = new AdvancedMarkerElement({
      map,
      position: { lat: poi.lat, lng: poi.lng },
      content: el,
      title: poi.name,
    });
    const info = new google.maps.InfoWindow({ content: renderPoiPopup(poi) });
    // AdvancedMarkerElement uses `gmp-click` per the new event model
    // (regular `click` works but logs a deprecation warning).
    marker.addEventListener("gmp-click", () => info.open({ map, anchor: marker }));
  }

  // Route polylines
  for (const route of mapData.routes) {
    const path = route.coordinates.map((c) => ({ lat: c.lat, lng: c.lng }));
    const color = route.color || ROUTE_KIND_DEFAULTS[route.kind] || "#888888";
    const polyline = new google.maps.Polyline({
      path,
      geodesic: false,
      strokeColor: color,
      strokeOpacity: route.kind === "flight" ? 0 : 0.85,
      strokeWeight: route.kind === "flight" ? 0 : 4,
      icons:
        route.kind === "flight"
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

    if (route.name) {
      polyline.addListener("click", (e) => {
        const info = new google.maps.InfoWindow({
          content: `<div class="poi-popup"><div class="poi-name">${escape(route.name)}</div></div>`,
          position: e.latLng,
        });
        info.open({ map });
      });
    }
  }

  return { map };
}

function computeBounds(mapData) {
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
  mapData.pois.forEach((p) => visit(p.lat, p.lng));
  mapData.routes.forEach((r) => r.coordinates.forEach((c) => visit(c.lat, c.lng)));
  return any ? { south, north, west, east } : null;
}

function createMarkerEl(poi) {
  const el = document.createElement("div");
  const icon = poi.kind ? KIND_ICONS[poi.kind] || "📍" : "📍";
  el.style.cssText = `
    width: 32px; height: 32px;
    background: #fff;
    border: 2px solid #c97e3f;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  `;
  el.textContent = icon;
  return el;
}

function renderPoiPopup(poi) {
  const sourceLink = poi.source
    ? `<div class="poi-source"><a href="${sourceUrl(poi.source, poi.name)}" target="_blank" rel="noopener">${escape(poi.source)} ↗</a></div>`
    : "";
  return `
    <div class="poi-popup">
      <div class="poi-name">${escape(poi.name)}</div>
      ${poi.description ? `<div class="poi-desc">${escape(poi.description)}</div>` : ""}
      ${sourceLink}
    </div>
  `;
}

function sourceUrl(slug, query) {
  const q = encodeURIComponent(query);
  switch (slug) {
    case "google-maps":
      return `https://www.google.com/maps/search/?api=1&query=${q}`;
    case "tripadvisor":
      return `https://www.tripadvisor.com/Search?q=${q}`;
    case "booking":
      return `https://www.booking.com/searchresults.html?ss=${q}`;
    case "alltrails":
      return `https://www.alltrails.com/search?q=${q}`;
    case "park4night":
      return `https://park4night.com/en/search?q=${q}`;
    case "thefork":
      return `https://www.thefork.com/search/?cityName=${q}`;
    case "official":
    case "website":
      return `https://www.google.com/search?q=${q}+official+site`;
    default:
      return `https://www.google.com/search?q=${q}+${encodeURIComponent(slug)}`;
  }
}

function escape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
