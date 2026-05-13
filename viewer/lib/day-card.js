/**
 * Render a Day (v3) as an HTML element.
 *
 * Schedule items are hydrated against the Place / Route catalogs:
 *   - item.placeId → resolve display from Place; cost/notes/insights from item
 *   - item.routeId → resolve display from Route; cost/notes/insights from item
 *   - item.name    → generic block, no catalog reference
 *
 * Insights live inline on items (`item.insights[]`) or at day level
 * (`day.insights[]`). The legacy v2 standalone Insight schedule type is gone.
 *
 * Day-level "Depart from" / "Stay at" banners are derived from schedule[]:
 * find the last item whose placeId resolves to a stay-category Place.
 */

import {
  KIND_EMOJI,
  MODE_EMOJI,
  CATEGORY_LABELS,
  formatDuration,
  formatDistance,
  formatCost,
  dayIsoDate,
} from "./schema-types.js";
import { hydrateScheduleItem } from "./hydrate.js";

/**
 * @param {import("./schema-types.js").Day} day
 * @param {import("./schema-types.js").Trip} trip
 * @param {{
 *   dayIndex: number,
 *   startDate?: string,
 *   currency: string,
 *   hydration: import("./hydrate.js").buildHydration extends (...a:any)=>infer R ? R : never,
 * }} ctx
 */
export function renderDayCard(day, trip, ctx) {
  const card = document.createElement("article");
  card.className = `day-card ${day.cls || ""}`.trim();
  card.id = `day-${ctx.dayIndex}`;

  const dateIso = dayIsoDate(ctx.startDate, ctx.dayIndex);

  // Derive stays from schedule[].placeId
  const prevDay = ctx.dayIndex > 0 ? trip.days[ctx.dayIndex - 1] : null;
  const prevDayStay = prevDay ? findStay(prevDay, ctx.hydration) : null;
  const thisDayStay = findStay(day, ctx.hydration);

  card.innerHTML = `
    <header class="day-head">
      <span class="day-num">Day ${ctx.dayIndex + 1}</span>
      <h2 class="day-title">${escape(day.title)}</h2>
      ${dateIso ? `<span class="day-date">${escape(dateIso)}</span>` : ""}
      ${day.dayCost ? `<span class="day-cost">${escape(day.dayCost)}</span>` : ""}
    </header>
    ${renderDayInsights(day.insights)}
    ${prevDayStay ? renderDepartBanner(prevDayStay) : ""}
    <div class="schedule"></div>
    ${thisDayStay ? renderStayBanner(thisDayStay, ctx) : ""}
    ${day.planB ? `<div class="planb"><strong>Plan B:</strong> ${escape(day.planB)}</div>` : ""}
  `;

  const scheduleEl = card.querySelector(".schedule");
  for (const item of day.schedule || []) {
    const hydrated = hydrateScheduleItem(item, ctx.hydration);
    if (hydrated.kind === "place") {
      scheduleEl.appendChild(renderPlaceItem(hydrated.place, item, ctx));
    } else if (hydrated.kind === "route") {
      scheduleEl.appendChild(renderRouteItem(hydrated.route, item, ctx));
    } else {
      scheduleEl.appendChild(renderGenericItem(item, ctx));
    }
    if (item.insights && item.insights.length > 0) {
      scheduleEl.appendChild(renderInsightCallout(item.insights, "item-insights"));
    }
  }

  return card;
}

// ---------------------------------------------------------------------------
// Stay derivation (v3 — via schedule.placeId)
// ---------------------------------------------------------------------------

function findStay(day, hydration) {
  if (!day || !Array.isArray(day.schedule)) return null;
  for (let i = day.schedule.length - 1; i >= 0; i--) {
    const item = day.schedule[i];
    if (!item.placeId) continue;
    const place = hydration.placesById.get(item.placeId);
    if (place && place.category === "stay") return { place, item };
  }
  return null;
}

function renderDepartBanner({ place }) {
  return `
    <div class="depart-from">
      <span class="banner-icon">🌅</span>
      <span class="banner-label">Depart from</span>
      <strong>${escape(place.name)}</strong>
    </div>
  `;
}

function renderStayBanner({ place, item }, ctx) {
  const cost = item.cost != null ? ` · ${escape(formatCost(item.cost, ctx.currency))}` : "";
  const thumb = place.picture?.url
    ? `<img class="banner-thumb" src="${escape(place.picture.url)}" alt="" loading="lazy">`
    : "";
  return `
    <div class="stay-at">
      ${thumb}
      <span class="banner-icon">🌙</span>
      <span class="banner-label">Stay at</span>
      <strong>${escape(place.name)}</strong>
      ${place.description ? `<span class="banner-desc"> — ${escape(place.description)}</span>` : ""}
      ${cost}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Schedule item renderers
// ---------------------------------------------------------------------------

function renderPlaceItem(place, item, ctx) {
  const el = document.createElement("div");
  el.className = "schedule-experience";
  el.id = `item-${place.id}-${item.time.replace(":", "")}`;
  const kindIcon = place.kind
    ? KIND_EMOJI[place.kind] || categoryEmoji(place.category)
    : categoryEmoji(place.category);
  const categoryLabel = CATEGORY_LABELS[place.category] || place.category;
  const links = (place.links || [])
    .map((l) => `<a href="${escape(l.url)}" target="_blank" rel="noopener">${escape(l.type)} ↗</a>`)
    .join(" · ");

  const cost = item.cost != null ? formatCost(item.cost, ctx.currency) : null;
  const duration = item.duration ? formatDuration(item.duration) : null;

  el.innerHTML = `
    <span class="schedule-icon">${kindIcon}</span>
    <span class="time">${escape(item.time)}</span>
    <div class="body">
      <div class="name">${escape(place.name)}</div>
      ${place.description ? `<div class="desc">${escape(place.description)}</div>` : ""}
      ${item.notes ? `<div class="notes">${escape(item.notes)}</div>` : ""}
      <div class="meta">
        <span class="kind-icon">${escape(categoryLabel)}${place.kind ? " · " + escape(place.kind) : ""}</span>
        ${cost ? `<span>${escape(cost)}</span>` : ""}
        ${duration ? `<span>${escape(duration)}</span>` : ""}
        ${place.source ? `<span>via ${escape(place.source)}</span>` : ""}
        ${
          place.popularity != null
            ? `<span class="popularity" title="Popularity score from Wikipedia pageviews">🔥 ${place.popularity.toFixed(1)}</span>`
            : ""
        }
        ${links ? `<span>${links}</span>` : ""}
      </div>
    </div>
    ${
      place.picture?.url
        ? `<img class="picture" src="${escape(place.picture.url)}" alt="${escape(place.name)}" loading="lazy">`
        : ""
    }
  `;
  return el;
}

function renderRouteItem(route, item, ctx) {
  const el = document.createElement("div");
  el.className = "schedule-transfer";
  const icon = MODE_EMOJI[route.mode] || "→";
  const legs = [];
  if (route.duration) legs.push(formatDuration(route.duration));
  if (route.distance) legs.push(formatDistance(route.distance));
  if (item.cost != null) legs.push(formatCost(item.cost, ctx.currency));

  el.innerHTML = `
    <span class="schedule-icon">${icon}</span>
    <span class="time">${escape(item.time)}</span>
    <div class="body from-to">
      <div class="name">${escape(route.name || route.mode)}</div>
      ${route.notes ? `<div class="desc">${escape(route.notes)}</div>` : ""}
      ${item.notes ? `<div class="notes">${escape(item.notes)}</div>` : ""}
    </div>
    ${legs.length ? `<span class="legs">${legs.join(" · ")}</span>` : ""}
  `;
  return el;
}

function renderGenericItem(item, ctx) {
  const el = document.createElement("div");
  el.className = "schedule-experience";
  const icon = item.category ? categoryEmoji(item.category) : "📍";
  const categoryLabel = item.category ? CATEGORY_LABELS[item.category] || item.category : "";
  const cost = item.cost != null ? formatCost(item.cost, ctx.currency) : null;
  const duration = item.duration ? formatDuration(item.duration) : null;

  el.innerHTML = `
    <span class="schedule-icon">${icon}</span>
    <span class="time">${escape(item.time)}</span>
    <div class="body">
      <div class="name">${escape(item.name || "")}</div>
      ${item.notes ? `<div class="notes">${escape(item.notes)}</div>` : ""}
      ${
        categoryLabel || cost || duration
          ? `<div class="meta">
        ${categoryLabel ? `<span class="kind-icon">${escape(categoryLabel)}</span>` : ""}
        ${cost ? `<span>${escape(cost)}</span>` : ""}
        ${duration ? `<span>${escape(duration)}</span>` : ""}
      </div>`
          : ""
      }
    </div>
  `;
  return el;
}

// ---------------------------------------------------------------------------
// Insights — day-level + per-item callouts
// ---------------------------------------------------------------------------

function renderDayInsights(insights) {
  if (!insights || insights.length === 0) return "";
  return `<div class="day-insights">${insightsListHtml(insights)}</div>`;
}

function renderInsightCallout(insights, className) {
  const el = document.createElement("div");
  el.className = className;
  el.innerHTML = insightsListHtml(insights);
  return el;
}

function insightsListHtml(insights) {
  const items = [];
  for (const insight of insights) {
    for (const h of insight.highlights || []) {
      items.push(`<li class="insight-highlight">${escape(h)}</li>`);
    }
    for (const w of insight.warnings || []) {
      items.push(`<li class="insight-warning">${escape(w)}</li>`);
    }
  }
  return `<ul class="insight-callout-list">${items.join("")}</ul>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function categoryEmoji(category) {
  return (
    { attraction: "📍", stay: "🛏️", food: "🍽️", shopping: "🛍️", transport: "🚉", custom: "📍" }[
      category
    ] || "📍"
  );
}

function escape(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
