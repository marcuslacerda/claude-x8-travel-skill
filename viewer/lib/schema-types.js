/**
 * JSDoc shapes mirroring cli/lib/schema.ts (v2). Used for editor hints in the
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
 * @typedef {"experience"} ExperienceType
 *
 * @typedef {Object} Experience
 * @property {ExperienceType} type
 * @property {string} time
 * @property {string} name
 * @property {string} [desc]
 * @property {string} [notes]      - User-only field; skill never writes
 * @property {number} [cost]
 * @property {string} category     - attraction|stay|food|shopping|transport|custom
 * @property {string} [kind]
 * @property {string} [source]
 * @property {string} [picture]
 * @property {{type: string, url: string}[]} [links]
 * @property {string} [poiId]      - Set when this is a specific experience linked to a MapPOI; absent for generic experiences
 * @property {number} [popularity] - 0–10 decimal, log10 of Wikipedia annual pageviews. Skill-set; absent for POIs without Wikipedia entries.
 */

/**
 * @typedef {Object} Insight
 * @property {"insight"} type
 * @property {string[]} [highlights]
 * @property {string[]} [warnings]
 */

/**
 * @typedef {Object} TransferEndpoint
 * @property {string} name
 * @property {number} lat
 * @property {number} lng
 *
 * @typedef {"transfer"} TransferType
 *
 * @typedef {Object} Transfer
 * @property {TransferType} type
 * @property {string} [time]
 * @property {TransferEndpoint} from
 * @property {TransferEndpoint} to
 * @property {string} model       - drive|walk|ferry|flight|train
 * @property {number} duration    - minutes
 * @property {number} [distance]  - km
 * @property {number} [cost]
 * @property {string} [notes]
 */

/**
 * @typedef {Experience | Transfer | Insight} ScheduleItem
 */

/**
 * @typedef {Object} TripDay
 * @property {string} num
 * @property {string} title
 * @property {string} cls
 * @property {string} [desc]
 * @property {ScheduleItem[]} [schedule]   - Single source of truth; stay derived from items with category=stay; warnings live in Insight items
 * @property {string} [dayCost]
 * @property {string} [planB]
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
 */

/**
 * @typedef {Object} BudgetItem
 * @property {string} id
 * @property {string} category    - flights|accommodations|fuel|insurance|food|attractions|shopping|transportation|entertainment|unplanned
 * @property {number} amount
 * @property {number} pct
 * @property {"paid" | "confirmed" | "estimated" | "reserve"} status
 * @property {string} [notes]
 * @property {{type: string, url: string}[]} [links]
 */

/**
 * @typedef {Object} MapPOI
 * @property {string} id
 * @property {number} lat
 * @property {number} lng
 * @property {string} name
 * @property {string} [description]
 * @property {string} category
 * @property {string} [kind]
 * @property {string} [source]
 * @property {string} updatedBy
 * @property {number} [dayNum]
 * @property {number} [popularity] - mirrored from the linked Experience
 *
 * @typedef {Object} MapRoute
 * @property {string} id
 * @property {string} [name]
 * @property {string} color
 * @property {string} kind        - driving|walking|ferry|transit|flight|train
 * @property {number} [dayNum]
 * @property {{lat: number, lng: number}[]} coordinates
 * @property {string} updatedBy
 *
 * @typedef {Object} TripMapData
 * @property {MapPOI[]} pois
 * @property {MapRoute[]} routes
 */

/**
 * @typedef {Object} Trip
 * @property {string} [id]
 * @property {string} slug
 * @property {string} title
 * @property {Destination} destination
 * @property {string} [startDate]
 * @property {"draft" | "planned" | "active" | "completed"} status
 * @property {string} currency
 * @property {string} [timezone]
 * @property {string} [coverImage]
 * @property {string} [ogImage]
 * @property {boolean} [isPublic]
 * @property {TripDay[]} days
 * @property {ChecklistGroup[]} [checklist]
 * @property {Booking[]} [bookings]
 * @property {BudgetItem[]} [budget]
 */

// Display helpers — closed enums as plain JS objects ----------------------

export const KIND_ICONS = {
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

export const TRANSFER_ICONS = {
  drive: "🚗",
  walk: "🚶",
  ferry: "⛴️",
  flight: "✈️",
  train: "🚆",
};

export const CATEGORY_LABELS = {
  attraction: "Attraction",
  stay: "Stay",
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

export const ROUTE_KIND_DEFAULTS = {
  driving: "#444444",
  walking: "#669944",
  ferry: "#4a6fa5",
  transit: "#7c5b9b",
  flight: "#c97e3f",
  train: "#777777",
};

/** Day index → ISO date, given trip.startDate. Returns undefined if startDate
 *  is missing or month-only (YYYY-MM). */
export function dayIsoDate(startDate, num) {
  if (!startDate || startDate.length < 10) return undefined;
  const idx = parseInt(num, 10) - 1;
  if (!Number.isFinite(idx) || idx < 0) return undefined;
  const d = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setUTCDate(d.getUTCDate() + idx);
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
  const yearSuffix = start.getUTCFullYear() === end.getUTCFullYear() ? `, ${start.getUTCFullYear()}` : "";
  return `${fmt(start)} → ${fmt(end)}${yearSuffix}`;
}

/** Format minutes as "Xh YYm" or "YYm". */
export function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Format cost as `<currency> <amount>`. Currency is the trip currency. */
export function formatCost(amount, currency) {
  if (!Number.isFinite(amount)) return "";
  const symbol = { EUR: "€", GBP: "£", USD: "$", BRL: "R$" }[currency] || `${currency} `;
  return `${symbol}${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
