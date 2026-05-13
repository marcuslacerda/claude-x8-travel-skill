/**
 * JSDoc shapes mirroring cli/lib/schema.ts (v3). Used for editor hints in the
 * viewer; no runtime validation (the viewer trusts the JSON the skill produced).
 *
 * Source of truth: /cli/lib/schema.ts
 */

/**
 * @typedef {Object} Destination
 * @property {string} startLocation
 * @property {string} headlineTo
 * @property {string} headlineFrom
 */

/**
 * @typedef {Object} Picture
 * @property {string} url
 * @property {string} [credit]
 * @property {"wikipedia" | "google-places" | "official" | "unsplash" | "custom"} [source]
 */

/**
 * @typedef {{type: string, url: string}} Link
 */

/**
 * @typedef {Object} Place
 * @property {string} id                — kebab-case
 * @property {string} name
 * @property {{lat: number, lng: number}} geo
 * @property {string} category          — attraction|stay|food|shopping|transport|custom
 * @property {string} [kind]
 * @property {string} [googlePlaceId]   — ChIJ... when known
 * @property {number} [popularity]      — 0–10 (log10 of Wikipedia annual views)
 * @property {string} [source]
 * @property {string} [description]
 * @property {Picture} [picture]
 * @property {Link[]} [links]
 * @property {number} [priceHint]
 */

/**
 * @typedef {"DRIVE" | "WALK" | "BICYCLE" | "TRANSIT" | "TRAIN" | "FLIGHT" | "FERRY"} TravelMode
 */

/**
 * @typedef {Object} Route
 * @property {string} id
 * @property {string} [name]
 * @property {TravelMode} mode
 * @property {string} polyline    — Google encoded (precision 5)
 * @property {string} duration    — ISO 8601 (e.g. "PT45M")
 * @property {number} [distance]  — meters
 * @property {string[]} [tags]    — e.g. ["scenic", "highlight"]
 * @property {string} [notes]
 */

/**
 * @typedef {Object} Insight
 * @property {string[]} [highlights]
 * @property {string[]} [warnings]
 */

/**
 * @typedef {Object} ScheduleItem
 * @property {string} time           — "HH:MM"
 * @property {string} [placeId]      — references Trip.places[].id
 * @property {string} [routeId]      — references Trip.routes[].id
 * @property {string} [name]         — generic block (no placeId/routeId)
 * @property {string} [category]
 * @property {number} [cost]
 * @property {string} [duration]     — ISO 8601
 * @property {string} [notes]
 * @property {Insight[]} [insights]  — inline per-item insights
 */

/**
 * @typedef {Object} Day
 * @property {string} title
 * @property {string} [cls]
 * @property {ScheduleItem[]} schedule
 * @property {Insight[]} [insights]  — day-wide insights
 * @property {string} [planB]
 * @property {string} [dayCost]
 */

/**
 * @typedef {Object} ChecklistItem
 * @property {string} id
 * @property {string} text
 * @property {"done" | "pending"} status
 * @property {boolean} [critical]
 *
 * @typedef {Object} ChecklistGroup
 * @property {string} title
 * @property {"checklist" | "packing"} type
 * @property {ChecklistItem[]} items
 */

/**
 * @typedef {Object} Booking
 * @property {string} date
 * @property {string} item
 * @property {"confirmed" | "pending"} status
 * @property {boolean} critical
 * @property {string} [link]
 * @property {string} [placeId]   — optional anchor to Trip.places[]
 */

/**
 * @typedef {Object} BudgetItem
 * @property {string} id
 * @property {string} category
 * @property {number} amount
 * @property {number} pct
 * @property {"paid" | "confirmed" | "estimated" | "reserve"} status
 * @property {string} [notes]
 * @property {Link[]} [links]
 */

/**
 * @typedef {Object} Trip
 * @property {3} schemaVersion
 * @property {string} [id]
 * @property {string} slug
 * @property {string} title
 * @property {Destination} destination
 * @property {string} [startDate]
 * @property {"draft" | "planned" | "active" | "completed"} status
 * @property {string} currency
 * @property {string} [homeCurrency]
 * @property {string} [timezone]
 * @property {string} [coverImage]
 * @property {string} [ogImage]
 * @property {boolean} [isPublic]
 * @property {Place[]} places
 * @property {Route[]} routes
 * @property {Day[]} days
 * @property {ChecklistGroup[]} [checklist]
 * @property {Booking[]} [bookings]
 * @property {BudgetItem[]} [budget]
 */

// ---------------------------------------------------------------------------
// Display helpers — closed enums as plain JS objects
// ---------------------------------------------------------------------------

/** Emoji per Place.kind (and as fallback per Route.mode). */
export const KIND_EMOJI = {
  // attraction
  nature: "🌲",
  lake: "💧",
  castle: "🏰",
  trek: "🥾",
  scenic: "🏞️",
  viewpoint: "👁️",
  waterfall: "💦",
  cave: "🕳️",
  city: "🏙️",
  town: "🏘️",
  vila: "🏘️",
  unesco: "🏛️",
  memorial: "🕯️",
  wellness: "♨️",
  adventure: "🎢",
  // stay
  hotel: "🛏️",
  camp: "⛺",
  apartment: "🏢",
  // food
  restaurant: "🍽️",
  coffee: "☕",
  bar: "🍺",
  // shopping
  shop: "🛍️",
  market: "🏪",
  // transport
  headline: "🛫",
  destination: "🛬",
  ferry: "⛴️",
  parking: "🅿️",
  station: "🚉",
};

/** Backward-compat alias — old code used `KIND_ICONS`. */
export const KIND_ICONS = KIND_EMOJI;

/** Emoji per Route.mode (TravelMode enum, uppercase). */
export const MODE_EMOJI = {
  DRIVE: "🚗",
  WALK: "🚶",
  BICYCLE: "🚲",
  TRANSIT: "🚍",
  TRAIN: "🚆",
  FLIGHT: "✈️",
  FERRY: "⛴️",
};

export const CATEGORY_LABELS = {
  attraction: "Attractions",
  stay: "Camping/Hotel",
  food: "Food",
  shopping: "Shopping",
  transport: "Transport",
  custom: "Custom",
};

export const BUDGET_CATEGORY_LABELS = {
  flights: "Flights",
  accommodations: "Accommodations",
  fuel: "Fuel",
  insurance: "Insurance",
  food: "Food",
  attractions: "Attractions",
  shopping: "Shopping",
  transportation: "Transportation",
  entertainment: "Entertainment",
  unplanned: "Unplanned",
};

// ---------------------------------------------------------------------------
// Date / cost / duration helpers
// ---------------------------------------------------------------------------

/** Day index → ISO date, given trip.startDate. `dayIndex` is 0-based.
 *  Returns undefined if startDate is missing or month-only (YYYY-MM). */
export function dayIsoDate(startDate, dayIndex) {
  if (!startDate || startDate.length < 10) return undefined;
  if (!Number.isFinite(dayIndex) || dayIndex < 0) return undefined;
  const d = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setUTCDate(d.getUTCDate() + dayIndex);
  return d.toISOString().slice(0, 10);
}

/** Format trip date range for display. Handles month-only dates. */
export function formatDateRange(startDate, dayCount) {
  if (!startDate) return "Flexible dates";
  if (startDate.length === 7) return `${startDate} (1 month window)`;
  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return startDate;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + dayCount - 1);
  const fmt = (d) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const yearSuffix =
    start.getUTCFullYear() === end.getUTCFullYear() ? `, ${start.getUTCFullYear()}` : "";
  return `${fmt(start)} → ${fmt(end)}${yearSuffix}`;
}

/** Parse ISO 8601 duration (PT1H30M / PT45M / PT2H) → minutes. */
export function parseIsoDuration(iso) {
  if (typeof iso !== "string") return 0;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const h = Number.parseInt(m[1] || "0", 10);
  const min = Number.parseInt(m[2] || "0", 10);
  const s = Number.parseInt(m[3] || "0", 10);
  return h * 60 + min + Math.floor(s / 60);
}

/** Format ISO 8601 duration or raw minutes as "Xh YYm" / "YYm". */
export function formatDuration(input) {
  let minutes;
  if (typeof input === "string") minutes = parseIsoDuration(input);
  else if (typeof input === "number") minutes = input;
  else return "";
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Meters → human-readable "Xkm" / "Ym". */
export function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}km`;
}

/** Format cost as `<currency> <amount>`. Currency is the trip currency. */
export function formatCost(amount, currency) {
  if (!Number.isFinite(amount)) return "";
  const symbol = { EUR: "€", GBP: "£", USD: "$", BRL: "R$", JPY: "¥" }[currency] || `${currency} `;
  return `${symbol}${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
