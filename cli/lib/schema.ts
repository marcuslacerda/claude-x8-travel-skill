import { z } from "zod/v4";

// ============================================================================
// Trip schema v3 — single document, catalog + thin schedule
//
// See:
//   ~/.claude/plans/fa-a-uma-analise-critica-lucky-hennessy.md  (design rationale)
//   ~/dev/marcus/travel/docs/spec/trip-v3-scheme.json           (canonical fixture)
//   ~/dev/marcus/travel/docs/tasks/schema-v3.md                 (consumer plan)
//
// Canonical source: this file. The skill (claude-x8-travel-skill) vendors it
// and schema-drift CI keeps the two byte-identical.
// ============================================================================

const SCHEMA_VERSION = 3 as const;

// Loose ISO date or year-month: "2027-02-14" or "2027-02".
const StartDatePattern = /^\d{4}-\d{2}(-\d{2})?$/;
const KebabIdPattern = /^[a-z0-9][a-z0-9-]*$/;
// Route IDs are machine-generated as `${fromPlaceId}__to__${toPlaceId}` (double
// underscore prevents ambiguous parsing when placeIds themselves are kebab-case).
// Same shape as KebabIdPattern but additionally allows underscore. Applied only
// to Route.id and ScheduleItem.routeId; place / day / expense IDs stay strict.
const RouteIdPattern = /^[a-z0-9][a-z0-9_-]*$/;
const HHMMPattern = /^([01]\d|2[0-3]):[0-5]\d$/;
// ISO 8601 duration — at least one part (H/M/S) required after PT.
const IsoDurationPattern = /^PT(\d+[HMS])+$/;
const GooglePlaceIdPattern = /^ChIJ[A-Za-z0-9_-]+$/;

// ----------------------------------------------------------------------------
// Trip status & destination
// ----------------------------------------------------------------------------

export const TripStatusSchema = z.enum(["draft", "planned", "active", "completed"]);
export type TripStatus = z.infer<typeof TripStatusSchema>;

export const DestinationSchema = z.object({
  /** Origin city / region the traveler departs from (e.g. "São Paulo"). */
  startLocation: z.string(),
  /** Primary destination headline (e.g. "Edinburgh", "Italian Dolomites"). */
  headlineTo: z.string(),
  /** Where the trip ends — usually equal to startLocation, sometimes different. */
  headlineFrom: z.string(),
});
export type Destination = z.infer<typeof DestinationSchema>;

// ----------------------------------------------------------------------------
// Travel taxonomy — categories, kinds, sources
// ----------------------------------------------------------------------------

export const ExperienceCategorySchema = z.enum([
  "attraction",
  "stay",
  "food",
  "shopping",
  "transport",
  "custom",
]);
export type ExperienceCategory = z.infer<typeof ExperienceCategorySchema>;

/** 27 kinds across 5 categories. `custom` category accepts any kind (or none). */
export const ExperienceKindSchema = z.enum([
  // attraction (14)
  "nature",
  "lake",
  "castle",
  "trek",
  "scenic",
  "viewpoint",
  "waterfall",
  "cave",
  "city",
  "town",
  // `vila` — deprecated synonym for `town`. Kept during v3 migration; producers should emit `town`.
  "vila",
  "unesco",
  "memorial",
  "wellness",
  "adventure",
  // stay (3)
  "hotel",
  "camp",
  "apartment",
  // food (3)
  "restaurant",
  "coffee",
  "bar",
  // shopping (2)
  "shop",
  "market",
  // transport (5)
  "headline",
  "destination",
  "ferry",
  "parking",
  "station",
]);
export type ExperienceKind = z.infer<typeof ExperienceKindSchema>;

/** Travel source — the platform/service that informed the place/route.
 *  See /skill/sources-travel-experience.md for full descriptions. */
export const TravelSourceSchema = z.enum([
  // Tier 1 — core (10)
  "google-maps",
  "booking",
  "skyscanner",
  "rome2rio",
  "trainline",
  "wikivoyage",
  "tripadvisor",
  "wise",
  "eu-reopen",
  "etias",
  // Tier 2 — long-form / motorhome / trekking (10)
  "alltrails",
  "komoot",
  "park4night",
  "acsi-eurocampings",
  "camping-info",
  "campercontact",
  "meteoblue",
  "mountain-forecast",
  "refuges-info",
  "open-meteo",
  // Tier 3 — specialized (6)
  "getyourguide",
  "tiqets",
  "civitatis",
  "thefork",
  "frankfurter",
  "reddit",
  // catch-alls (5 — adds wikipedia + unsplash for Place.source provenance)
  "official",
  "website",
  "custom",
  "wikipedia",
  "unsplash",
]);
export type TravelSource = z.infer<typeof TravelSourceSchema>;

export const ExperienceLinkSchema = z.object({
  /** Free-form link type (e.g. "official", "tickets", "menu", "trail-map"). */
  type: z.string(),
  url: z.string(),
});
export type ExperienceLink = z.infer<typeof ExperienceLinkSchema>;

// ----------------------------------------------------------------------------
// Travel mode — unified enum (Google Routes API + flight + ferry)
// ----------------------------------------------------------------------------

export const TravelModeSchema = z.enum([
  "DRIVE",
  "WALK",
  "BICYCLE",
  "TRANSIT",
  "TRAIN",
  "FLIGHT",
  "FERRY",
]);
export type TravelMode = z.infer<typeof TravelModeSchema>;

// ----------------------------------------------------------------------------
// Picture — attribution-aware image reference
// ----------------------------------------------------------------------------

export const PictureSchema = z.object({
  url: z.string().url(),
  credit: z.string().optional(),
  source: z.enum(["wikipedia", "google-places", "official", "unsplash", "custom"]).optional(),
});
export type Picture = z.infer<typeof PictureSchema>;

// ----------------------------------------------------------------------------
// Place — entity in the trip catalog (trip.places[])
// Schedule items + bookings reference places by stable kebab-case id.
// ----------------------------------------------------------------------------

export const PlaceSchema = z.object({
  /** Stable kebab-case id — chat tool and schedule items target this. */
  id: z.string().regex(KebabIdPattern, "id must be lowercase kebab-case"),
  name: z.string(),
  geo: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  category: ExperienceCategorySchema,
  kind: ExperienceKindSchema.optional(),
  /** Google Places API id (`ChIJ…`) — unlocks photo/hours/website via Places API. */
  googlePlaceId: z.string().regex(GooglePlaceIdPattern).optional(),
  /** Popularity score (0–10) — `min(log10(annual_wikipedia_pageviews), 10)`.
   *  Skill-written, not user-edited. */
  popularity: z.number().min(0).max(10).optional(),
  source: TravelSourceSchema.optional(),
  description: z.string().optional(),
  picture: PictureSchema.optional(),
  links: z.array(ExperienceLinkSchema).optional(),
  /** Indicative cost in trip currency (entry ticket, parking, nightly rate…). */
  priceHint: z.number().optional(),
});
export type Place = z.infer<typeof PlaceSchema>;

// ----------------------------------------------------------------------------
// Route — atomic geometry between two places (trip.routes[])
//
// endpoints declares intent (which two places this route connects).
// polyline/duration/distance are the cached result of the last Routes API
// compute — when endpoints change, the cache goes stale and is refined by
// the post-pass sync helper.
// ----------------------------------------------------------------------------

export const RouteEndpointSchema = z.object({
  /** Stable kebab-case reference into trip.places[]. */
  placeId: z.string().regex(KebabIdPattern, "endpoint placeId must be lowercase kebab-case"),
  /** Cache of trip.places[placeId].geo at compute time — protects against drift. */
  geo: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  /** Free-form human label (e.g. "Sirmione harbour", "Postojna entrance"). */
  label: z.string().optional(),
});
export type RouteEndpoint = z.infer<typeof RouteEndpointSchema>;

export const RouteSchema = z.object({
  id: z
    .string()
    .regex(RouteIdPattern, "id must be lowercase kebab-case (underscore allowed; e.g. 'a__to__b')"),
  name: z.string().optional(),
  mode: TravelModeSchema,
  /** From → to. placeId required on both ends; toda rota conecta places do catálogo. */
  endpoints: z.object({
    from: RouteEndpointSchema,
    to: RouteEndpointSchema,
  }),
  /** Google encoded polyline (precision 5). Cache of the last compute. */
  polyline: z.string(),
  /** ISO 8601 duration (e.g. "PT45M", "PT4H30M"). Cache of the last compute. */
  duration: z.string().regex(IsoDurationPattern, "duration must be ISO 8601 (e.g. PT45M)"),
  /** Distance in meters (int, non-negative). Cache of the last compute. */
  distance: z.number().int().nonnegative().optional(),
  /** True when polyline/duration/distance are estimated (haversine fallback) or
   *  out of sync with endpoints — needs Routes API recompute. */
  stale: z.boolean().optional(),
  /** Free-form flags like "highlight", "scenic" — drive rendering weight/opacity. */
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type Route = z.infer<typeof RouteSchema>;

// ----------------------------------------------------------------------------
// Insight — nested observation (item.insights[] or day.insights[])
// Replaces the v2 `type: "insight"` schedule item — insights are no longer
// items themselves, they hang off the item or day they describe.
// ----------------------------------------------------------------------------

export const InsightSchema = z
  .object({
    /** Positive observations the traveler should know in advance. */
    highlights: z.array(z.string()).optional(),
    /** Cautions and constraints the traveler should plan around. */
    warnings: z.array(z.string()).optional(),
  })
  .refine((i) => (i.highlights?.length ?? 0) + (i.warnings?.length ?? 0) > 0, {
    message: "Insight must have at least one highlight or warning",
  });
export type Insight = z.infer<typeof InsightSchema>;

// ----------------------------------------------------------------------------
// Schedule item — thin reference into the catalog
// Either references a Place / Route by id, or stands alone as a generic block
// (Lunch break, free time) via the `name` field.
// ----------------------------------------------------------------------------

export const ScheduleItemSchema = z
  .object({
    /** Time of day "HH:MM" (24h). */
    time: z.string().regex(HHMMPattern, "time must be HH:MM (24h)"),
    /** Reference into trip.places[]. */
    placeId: z.string().regex(KebabIdPattern).optional(),
    /** Reference into trip.routes[] — same shape as Route.id (allows __to__). */
    routeId: z.string().regex(RouteIdPattern).optional(),
    /** Inline name when no Place exists (generic blocks like "Lunch break"). */
    name: z.string().optional(),
    /** Category — required for name-only blocks; otherwise inherited from Place. */
    category: ExperienceCategorySchema.optional(),
    cost: z.number().optional(),
    /** ISO 8601 duration — overrides route.duration when set. */
    duration: z.string().regex(IsoDurationPattern).optional(),
    notes: z.string().optional(),
    /** Item-level insights — highlights/warnings about this specific occurrence. */
    insights: z.array(InsightSchema).optional(),
  })
  .refine((i) => Boolean(i.placeId || i.routeId || i.name), {
    message: "schedule item must have placeId, routeId, or name",
  });
export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;

// ----------------------------------------------------------------------------
// Day — position in trip.days[] IS the day number (Day N = days[N-1]).
// No `num` field: reorder = splice. Dates derive from startDate + index.
// ----------------------------------------------------------------------------

export const DaySchema = z.object({
  title: z.string(),
  /** CSS class hint for the viewer (e.g. "active-day", "drive-day"). */
  cls: z.string().optional(),
  schedule: z.array(ScheduleItemSchema),
  /** Day-level insights — broader observations covering the whole day. */
  insights: z.array(InsightSchema).optional(),
  /** Contingency notes — what to do on rain / closure / unexpected change. */
  planB: z.string().optional(),
  /** Pre-computed day cost string (e.g. "€85"). */
  dayCost: z.string().optional(),
});
export type Day = z.infer<typeof DaySchema>;

// ----------------------------------------------------------------------------
// Checklist (merged with packing — discriminated by group type)
// ----------------------------------------------------------------------------

export const ChecklistItemSchema = z.object({
  id: z.string().regex(KebabIdPattern, {
    message: "id must be lowercase kebab-case (e.g. 'book-flights', 'p-passport')",
  }),
  text: z.string(),
  status: z.enum(["done", "pending"]),
  critical: z.boolean().optional(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const ChecklistGroupSchema = z.object({
  /** "2 months before", "Documents", "Travel day", "Clothing", etc. */
  title: z.string(),
  /** "checklist" groups have time-based titles; "packing" groups have category titles. */
  type: z.enum(["checklist", "packing"]),
  items: z.array(ChecklistItemSchema),
});
export type ChecklistGroup = z.infer<typeof ChecklistGroupSchema>;

// ----------------------------------------------------------------------------
// Bookings — reservation entries, optionally anchored to a Place
// ----------------------------------------------------------------------------

export const BookingSchema = z.object({
  /** ISO date for the booking (e.g. flight day, check-in day). */
  date: z.string(),
  /** Description of the ticket/reservation. */
  item: z.string(),
  status: z.enum(["confirmed", "pending"]),
  /** True when the booking must be secured early (sold-out / price-spike risk). */
  critical: z.boolean(),
  /** Booking URL — viewer label depends on status. */
  link: z.string().optional(),
  /** Reference into trip.places[] — unifies reservations with map pins. */
  placeId: z.string().regex(KebabIdPattern).optional(),
});
export type Booking = z.infer<typeof BookingSchema>;

// ----------------------------------------------------------------------------
// Budget
// ----------------------------------------------------------------------------

export const BudgetCategorySchema = z.enum([
  "flights",
  "accommodations",
  "fuel",
  "insurance",
  "food",
  "attractions",
  "shopping",
  "transportation",
  "entertainment",
  "unplanned",
]);
export type BudgetCategory = z.infer<typeof BudgetCategorySchema>;

export const BudgetItemSchema = z.object({
  /** Stable kebab-case slug. Reserved: "unplanned" (must exist on every trip). */
  id: z.string().regex(KebabIdPattern, {
    message: "id must be lowercase kebab-case (e.g. 'flights', 'tolls-vinhetas', 'unplanned')",
  }),
  category: BudgetCategorySchema,
  amount: z.number(),
  pct: z.number(),
  status: z.enum(["paid", "confirmed", "estimated", "reserve"]),
  notes: z.string().optional(),
  links: z.array(ExperienceLinkSchema).optional(),
});
export type BudgetItem = z.infer<typeof BudgetItemSchema>;

// ----------------------------------------------------------------------------
// Trip (root) — single-document v3
// ----------------------------------------------------------------------------

export const TripSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    /** Optional — assigned at publish time by explor8. */
    id: z.string().optional(),
    slug: z.string().regex(KebabIdPattern),
    title: z.string(),
    destination: DestinationSchema,
    /** Optional. ISO "YYYY-MM-DD" if known, else "YYYY-MM" for month-only. */
    startDate: z
      .string()
      .regex(StartDatePattern, 'startDate must be "YYYY-MM-DD" or "YYYY-MM"')
      .optional(),
    status: TripStatusSchema,
    /** ISO 4217 currency of the destination (EUR, GBP, USD, BRL, ...). */
    currency: z.string(),
    /** Traveler's home/preferred display currency (ISO 4217). */
    homeCurrency: z.string().optional(),
    /** IANA timezone for the destination (e.g. "Europe/Rome"). */
    timezone: z.string().optional(),
    ogImage: z.string().optional(),
    isPublic: z.boolean().optional(),
    /** Catalog — referenced by schedule items and bookings via id. */
    places: z.array(PlaceSchema),
    /** Geometry catalog — referenced by schedule items via id. */
    routes: z.array(RouteSchema),
    days: z.array(DaySchema),
    bookings: z.array(BookingSchema).optional(),
    budget: z.array(BudgetItemSchema).optional(),
    checklist: z.array(ChecklistGroupSchema).optional(),
  })
  .refine((t) => new Set(t.places.map((p) => p.id)).size === t.places.length, {
    message: "Place ids must be unique",
  })
  .refine((t) => new Set(t.routes.map((r) => r.id)).size === t.routes.length, {
    message: "Route ids must be unique",
  })
  .refine(
    (t) => {
      // Referential integrity — schedule, bookings, and route endpoints can
      // only reference places/routes that exist in the catalog. Prevents typos
      // in the skill from silently breaking the viewer or map sync.
      const placeIds = new Set(t.places.map((p) => p.id));
      const routeIds = new Set(t.routes.map((r) => r.id));
      for (const day of t.days) {
        for (const item of day.schedule) {
          if (item.placeId && !placeIds.has(item.placeId)) return false;
          if (item.routeId && !routeIds.has(item.routeId)) return false;
        }
      }
      for (const r of t.routes) {
        if (!placeIds.has(r.endpoints.from.placeId)) return false;
        if (!placeIds.has(r.endpoints.to.placeId)) return false;
      }
      for (const b of t.bookings ?? []) {
        if (b.placeId && !placeIds.has(b.placeId)) return false;
      }
      return true;
    },
    { message: "schedule/bookings/route endpoints reference unknown placeId or routeId" },
  );
export type Trip = z.infer<typeof TripSchema>;

// ----------------------------------------------------------------------------
// Summary & API input schemas (used by explor8 dashboard listing + create/update)
// ----------------------------------------------------------------------------

export const TripSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  destination: DestinationSchema,
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: TripStatusSchema,
  ogImage: z.string().optional(),
  dayCount: z.number(),
  isPublic: z.boolean(),
});
export type TripSummary = z.infer<typeof TripSummarySchema>;

export const TripCreateSchema = z.object({
  title: z.string(),
  destination: DestinationSchema,
  startDate: z.string().optional(),
  currency: z.string().default("EUR"),
});
export type TripCreate = z.infer<typeof TripCreateSchema>;

export const TripUpdateSchema = z.object({
  title: z.string().optional(),
  destination: DestinationSchema.optional(),
  startDate: z.string().optional(),
  status: TripStatusSchema.optional(),
  currency: z.string().optional(),
});
export type TripUpdate = z.infer<typeof TripUpdateSchema>;

// ----------------------------------------------------------------------------
// Publish envelope — `{ trip }` wrapper accepted by POST /api/trips/publish
// (the user-facing /import upload endpoint).
// ----------------------------------------------------------------------------

export const PublishPayloadSchema = z.object({
  trip: TripSchema,
});
export type PublishPayload = z.infer<typeof PublishPayloadSchema>;
