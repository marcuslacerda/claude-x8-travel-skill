/**
 * MapLibre GL renderer for the trip viewer.
 * Loads the map with OpenStreetMap raster tiles (no API key required) and
 * draws POIs as kind-styled markers + routes as colored polylines.
 *
 * Caller passes the parsed `mapData` (TripMapData) and a container element.
 */

import { KIND_ICONS, ROUTE_KIND_DEFAULTS } from "./schema-types.js";

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
  layers: [
    {
      id: "osm-tiles",
      type: "raster",
      source: "osm",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

/**
 * @param {HTMLElement} container
 * @param {import("./schema-types.js").TripMapData} mapData
 * @param {{ initialDayFilter?: number }} [opts]
 * @returns {{ map: any, setDayFilter: (n: number | null) => void }}
 */
export function renderMap(container, mapData, opts = {}) {
  if (typeof maplibregl === "undefined") {
    container.innerHTML =
      '<div class="error">MapLibre failed to load. Check the &lt;script&gt; tag in trip.html.</div>';
    return { map: null, setDayFilter: () => {} };
  }

  // Initialize with a safe center/zoom — passing `bounds` to the constructor
  // throws "failed to invert matrix" when the container hasn't been measured
  // yet (display:none → block transitions). We fitBounds() after load instead.
  const bounds = computeBounds(mapData);
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

  /** @type {any[]} */
  const markers = [];

  map.on("load", () => {
    // Ensure the map has its real size now that the panel is visible
    map.resize();

    if (bounds) {
      try {
        map.fitBounds(bounds, { padding: 50, animate: false });
      } catch {
        // Bounds invalid — keep the fallback center/zoom
      }
    }

    // Add route sources/layers (one per route to allow per-route colors)
    mapData.routes.forEach((route) => {
      const sourceId = `route-${route.id}`;
      const layerId = `route-layer-${route.id}`;
      const color = route.color || ROUTE_KIND_DEFAULTS[route.kind] || "#888888";

      map.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: { dayNum: route.dayNum ?? null, name: route.name ?? "" },
          geometry: {
            type: "LineString",
            coordinates: route.coordinates.map((c) => [c.lng, c.lat]),
          },
        },
      });
      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": color,
          "line-width": route.kind === "flight" ? 2 : 4,
          "line-dasharray": route.kind === "flight" ? [2, 2] : route.kind === "ferry" ? [4, 2] : [1, 0],
          "line-opacity": 0.85,
        },
      });

      if (route.name) {
        map.on("click", layerId, (e) => {
          new maplibregl.Popup({ closeButton: true })
            .setLngLat(e.lngLat)
            .setHTML(`<div class="poi-popup"><div class="poi-name">${escape(route.name)}</div></div>`)
            .addTo(map);
        });
        map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
      }
    });

    // Add POI markers
    mapData.pois.forEach((poi) => {
      const el = createMarkerEl(poi);
      const marker = new maplibregl.Marker({ element: el }).setLngLat([poi.lng, poi.lat]).addTo(map);

      const popup = new maplibregl.Popup({ closeButton: true, offset: 22 }).setHTML(
        renderPoiPopup(poi),
      );
      marker.setPopup(popup);

      markers.push({ marker, poi });
    });

    if (opts.initialDayFilter !== undefined) {
      setDayFilter(opts.initialDayFilter);
    }
  });

  function setDayFilter(dayNum) {
    // Show only POIs/routes for this day, plus trip-wide (no dayNum)
    markers.forEach(({ marker, poi }) => {
      const visible = dayNum === null || poi.dayNum === undefined || poi.dayNum === dayNum;
      marker.getElement().style.display = visible ? "" : "none";
    });
    mapData.routes.forEach((route) => {
      const layerId = `route-layer-${route.id}`;
      const visible = dayNum === null || route.dayNum === undefined || route.dayNum === dayNum;
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
      }
    });
  }

  return { map, setDayFilter };
}

function computeBounds(mapData) {
  const coords = [];
  mapData.pois.forEach((p) => coords.push([p.lng, p.lat]));
  mapData.routes.forEach((r) => r.coordinates.forEach((c) => coords.push([c.lng, c.lat])));
  if (coords.length === 0) return null;
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
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
