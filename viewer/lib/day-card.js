/**
 * Render a single TripDay as an HTML element.
 * Schedule items are discriminated on `type` — Experience, Transfer, or Insight.
 *
 * Day-level "Depart from" and "Stay at" banners are derived from the schedule:
 * find the last item with category=stay in the previous day and in this day,
 * respectively. No separate `day.stay` field — single source of truth.
 */

import {
  KIND_ICONS,
  TRANSFER_ICONS,
  CATEGORY_LABELS,
  formatDuration,
  formatCost,
  dayIsoDate,
} from "./schema-types.js";

/**
 * @param {import("./schema-types.js").TripDay} day
 * @param {import("./schema-types.js").Trip} trip
 * @param {{ startDate?: string, currency: string }} ctx
 */
export function renderDayCard(day, trip, ctx) {
  const card = document.createElement("article");
  card.className = `day-card ${day.cls || ""}`.trim();

  const dateIso = dayIsoDate(ctx.startDate, day.num);

  // Stays are derived from schedule[] — last item with category=stay.
  const dayIdx = trip.days.indexOf(day);
  const prevDay = dayIdx > 0 ? trip.days[dayIdx - 1] : null;
  const prevDayStay = prevDay ? findStay(prevDay) : null;
  const thisDayStay = findStay(day);

  card.innerHTML = `
    <header class="day-head">
      <span class="day-num">Day ${escape(day.num)}</span>
      <h2 class="day-title">${escape(day.title)}</h2>
      ${dateIso ? `<span class="day-date">${escape(dateIso)}</span>` : ""}
      ${day.dayCost ? `<span class="day-cost">${escape(day.dayCost)}</span>` : ""}
    </header>
    ${day.desc ? `<p class="day-desc">${escape(day.desc)}</p>` : ""}
    ${prevDayStay ? renderDepartBanner(prevDayStay) : ""}
    <div class="schedule"></div>
    ${thisDayStay ? renderStayBanner(thisDayStay) : ""}
    ${day.planB ? `<div class="planb"><strong>Plan B:</strong> ${escape(day.planB)}</div>` : ""}
  `;

  const scheduleEl = card.querySelector(".schedule");
  (day.schedule || []).forEach((item) => {
    if (item.type === "experience") {
      scheduleEl.appendChild(renderExperience(item, ctx));
    } else if (item.type === "transfer") {
      scheduleEl.appendChild(renderTransfer(item, ctx));
    } else if (item.type === "insight") {
      scheduleEl.appendChild(renderInsight(item));
    }
  });

  return card;
}

function findStay(day) {
  if (!day || !Array.isArray(day.schedule)) return null;
  for (let i = day.schedule.length - 1; i >= 0; i--) {
    const item = day.schedule[i];
    if (item.type === "experience" && item.category === "stay") return item;
  }
  return null;
}

function renderDepartBanner(stay) {
  return `
    <div class="depart-from">
      <span class="banner-icon">🌅</span>
      <span class="banner-label">Depart from</span>
      <strong>${escape(stay.name)}</strong>
    </div>
  `;
}

function renderStayBanner(stay) {
  const cost = stay.cost !== undefined ? ` · ${escape(formatCostInline(stay.cost))}` : "";
  return `
    <div class="stay-at">
      <span class="banner-icon">🌙</span>
      <span class="banner-label">Stay at</span>
      <strong>${escape(stay.name)}</strong>
      ${stay.desc ? `<span class="banner-desc"> — ${escape(stay.desc)}</span>` : ""}
      ${cost}
    </div>
  `;
}

function formatCostInline(amount) {
  if (!Number.isFinite(amount)) return "";
  return `£${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// Shared layout: every schedule item is `[icon] [time] [body] [trailing?]`.
// Insight is the only one without a time column (icon + body, body fills the
// time slot too). Column widths are kept consistent in styles.css so all three
// types align vertically across the day.

function renderExperience(exp, ctx) {
  const el = document.createElement("div");
  el.className = "schedule-experience";
  const kindIcon = exp.kind ? KIND_ICONS[exp.kind] : "";
  const categoryLabel = CATEGORY_LABELS[exp.category] || exp.category;
  const links = (exp.links || [])
    .map(
      (l) =>
        `<a href="${escape(l.url)}" target="_blank" rel="noopener">${escape(l.type)} ↗</a>`,
    )
    .join(" · ");

  el.innerHTML = `
    <span class="schedule-icon">${kindIcon}</span>
    <span class="time">${escape(exp.time)}</span>
    <div class="body">
      <div class="name">${escape(exp.name)}</div>
      ${exp.desc ? `<div class="desc">${escape(exp.desc)}</div>` : ""}
      ${exp.notes ? `<div class="notes">${escape(exp.notes)}</div>` : ""}
      <div class="meta">
        <span class="kind-icon">${escape(categoryLabel)}${exp.kind ? " · " + escape(exp.kind) : ""}</span>
        ${exp.cost !== undefined ? `<span>${escape(formatCost(exp.cost, ctx.currency))}</span>` : ""}
        ${exp.source ? `<span>via ${escape(exp.source)}</span>` : ""}
        ${exp.popularity !== undefined ? `<span class="popularity" title="Popularity score from Wikipedia pageviews">🔥 ${exp.popularity.toFixed(1)}</span>` : ""}
        ${links ? `<span>${links}</span>` : ""}
      </div>
    </div>
    ${exp.picture ? `<img class="picture" src="${escape(exp.picture)}" alt="${escape(exp.name)}" loading="lazy">` : ""}
  `;

  return el;
}

function renderTransfer(tr, ctx) {
  const el = document.createElement("div");
  el.className = "schedule-transfer";
  const icon = TRANSFER_ICONS[tr.model] || "→";
  const legs = [];
  if (tr.duration) legs.push(formatDuration(tr.duration));
  if (tr.distance) legs.push(`${tr.distance.toLocaleString("en-US")} km`);
  if (tr.cost !== undefined) legs.push(formatCost(tr.cost, ctx.currency));

  el.innerHTML = `
    <span class="schedule-icon">${icon}</span>
    <span class="time">${tr.time ? escape(tr.time) : ""}</span>
    <div class="body from-to">
      <div class="name"><strong>${escape(tr.from.name)}</strong> → <strong>${escape(tr.to.name)}</strong></div>
      ${tr.notes ? `<div class="desc">${escape(tr.notes)}</div>` : ""}
    </div>
    ${legs.length ? `<span class="legs">${legs.join(" · ")}</span>` : ""}
  `;

  return el;
}

function renderInsight(insight) {
  const el = document.createElement("div");
  el.className = "schedule-insight";

  const highlights = (insight.highlights || [])
    .map((h) => `<li class="insight-highlight">${escape(h)}</li>`)
    .join("");
  const warnings = (insight.warnings || [])
    .map((w) => `<li class="insight-warning">${escape(w)}</li>`)
    .join("");

  // Insight uses icon + body only — no time column. Body fills the space the
  // time column would occupy on Experience/Transfer rows.
  el.innerHTML = `
    <span class="schedule-icon insight-icon-wrap">
      <img class="insight-icon" src="lib/insights.png" alt="" onerror="this.outerHTML='💡'">
    </span>
    <div class="body">
      <ul class="insight-list">${highlights}${warnings}</ul>
    </div>
  `;
  return el;
}

function escape(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
