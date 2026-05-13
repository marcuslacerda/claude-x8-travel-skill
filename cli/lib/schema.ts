import { z } from "zod/v4";

// ============================================================================
// Schema v3 — single-document Trip (catalog + thin schedule)
// Design spec: ~/.claude/plans/fa-a-uma-analise-critica-lucky-hennessy.md
// Reference fixture: ~/dev/marcus/travel/docs/spec/trip-v3-scheme.json
// Canonical source: ~/dev/marcus/travel/src/lib/schemas/trip.ts
// This file is vendored. Schema-drift CI keeps both files byte-identical.
// ============================================================================

const SCHEMA_VERSION = 3 as const;

// ----------------------------------------------------------------------------
// Primitive helpers — shared regex / formats
// ----------------------------------------------------------------------------

const KEBAB_RE = /^[a-z0-9][a-z0-9-]*$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DURATION_RE = /^P(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)$/;
const GOOGLE_PLACE_ID_RE = /^ChIJ[A-Za-z0-9_-]+$/;
const START_DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;

export const KebabId = z.string().regex(KEBAB_RE, { message: "id must be lowercase kebab-case" });
export const HHMM = z.string().regex(HHMM_RE, { message: "time must be HH:MM (00:00–23:59)" });
export const IsoDuration = z
  .string()
  .regex(ISO_DURATION_RE, { message: "duration must be ISO 8601 (e.g. PT45M, PT2H, PT1H30M)" });
export const GooglePlaceId = z
  .string()
  .regex(GOOGLE_PLACE_ID_RE, { message: "googlePlaceId must start with ChIJ" });

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
  /** Where the trip ends — usually equal to startLocation, sometimes different
   *  (e.g. one-way road trip ending in another city). */
  headlineFrom: z.string(),
});
export type Destination = z.infer<typeof DestinationSchema>;

// ----------------------------------------------------------------------------
// Experience taxonomy — shared between schedule items and place catalog
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

/** 28 kinds across 5 categories. `custom` category accepts any kind (or none).
 *  v3 note: `town` was added alongside the legacy `vila` — both are valid
 *  ("vila" = villa/village ambiguity from v2; "town" is the clear name). */
export const ExperienceKindSchema = z.enum([
  // attraction (15)
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

/** Travel source — the platform/service that informed the place or pricing.
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
  // catch-alls (3)
  "official",
  "website",
  "custom",
]);
export type TravelSource = z.infer<typeof TravelSourceSchema>;

// ----------------------------------------------------------------------------
// Travel mode — unified for routes (v3). Replaces v2 TransferModel + MapRouteKind.
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
// Links & pictures
// ----------------------------------------------------------------------------

export const ExperienceLinkSchema = z.object({
  /** Free-form link type (e.g. "official", "tickets", "menu", "trail-map").
   *  Travel-source links use TravelSource slugs; arbitrary links use any kebab-case. */
  type: z.string(),
  url: z.string(),
});
export type ExperienceLink = z.infer<typeof ExperienceLinkSchema>;

/** Picture metadata — replaces v2's `picture: string` with a structured object
 *  carrying credit and source-of-truth (Wikimedia / Google Photos / official site / Unsplash). */
export const PictureSchema = z.object({
  url: z.string(),
  credit: z.string().optional(),
  source: z.enum(["wikipedia", "google-places", "official", "unsplash", "custom"]).optional(),
});
export type Picture = z.infer<typeof PictureSchema>;

// ----------------------------------------------------------------------------
// Place — top-level catalog entry. Replaces v2 MapPOI + de-duplicates the
// per-occurrence Experience data (name, description, picture, links, kind, ...).
// `dayNum` is gone — day membership is derived from schedule[].placeId.
// ----------------------------------------------------------------------------

export const PlaceSchema = z.object({
  id: KebabId,
  name: z.string(),
  geo: z.object({ lat: z.number(), lng: z.number() }),
  category: ExperienceCategorySchema,
  kind: ExperienceKindSchema.optional(),
  /** Google Places ID — when present, unlocks Photos / Hours / deep-link.
   *  Format: ChIJ... (Google standard). */
  googlePlaceId: GooglePlaceId.optional(),
  /** Popularity score (0–10 decimal) — `min(log10(annual_views), 10.0)`.
   *  Set only when Wikipedia (or Google ratings fallback) yields a signal. */
  popularity: z.number().min(0).max(10).optional(),
  source: TravelSourceSchema.optional(),
  description: z.string().optional(),
  picture: PictureSchema.optional(),
  links: z.array(ExperienceLinkSchema).optional(),
  /** Reference price for budget hint (per-person, in trip.currency). Schedule
   *  items can override with a real `cost` for that specific occurrence. */
  priceHint: z.number().optional(),
});
export type Place = z.infer<typeof PlaceSchema>;

// ----------------------------------------------------------------------------
// Route — top-level catalog entry. Replaces v2 MapRoute. Polyline is encoded
// (Google algorithm precision 5) instead of [{lat,lng}] arrays — ~6× smaller.
// `color` removed (now derived from `mode` in viewer); `dayNum` removed
// (derived from schedule[].routeId).
// ----------------------------------------------------------------------------

export const RouteSchema = z.object({
  id: KebabId,
  name: z.string().optional(),
  mode: TravelModeSchema,
  /** Encoded polyline (Google algorithm, precision 5). Decode in client. */
  polyline: z.string(),
  /** ISO 8601 duration (e.g. PT45M, PT2H30M). */
  duration: IsoDuration,
  /** Distance in meters. Optional — KML-only routes may lack it. */
  distance: z.number().int().nonnegative().optional(),
  /** Semantic tags for UI emphasis (e.g. "scenic", "highlight", "panoramic"). */
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type Route = z.infer<typeof RouteSchema>;

// ----------------------------------------------------------------------------
// Insight — skill observation (highlights + warnings). v3: lives inline on a
// ScheduleItem (`item.insights[]`) or on the Day (`day.insights[]`). No longer
// a sibling Schedule type. Always skill-written, never user-edited.
// ----------------------------------------------------------------------------

export const InsightSchema = z
  .object({
    highlights: z.array(z.string()).optional(),
    warnings: z.array(z.string()).optional(),
  })
  .refine(
    (i) => (i.highlights && i.highlights.length > 0) || (i.warnings && i.warnings.length > 0),
    { message: "Insight must have at least one highlight or warning" },
  );
export type Insight = z.infer<typeof InsightSchema>;

// ----------------------------------------------------------------------------
// ScheduleItem — three flavors collapsed into one shape:
//   - place reference:  { time, placeId, cost?, duration?, notes?, insights? }
//   - route reference:  { time, routeId, cost?, notes?, insights? }
//   - generic block:    { time, name, category, cost?, duration?, notes?, insights? }
// Discriminator is implicit: presence of placeId, routeId, or name.
// ----------------------------------------------------------------------------

export const ScheduleItemSchema = z
  .object({
    time: HHMM,
    placeId: KebabId.optional(),
    routeId: KebabId.optional(),
    /** Generic block name (e.g. "Almoço livre"). Used when neither placeId nor routeId applies. */
    name: z.string().optional(),
    category: ExperienceCategorySchema.optional(),
    /** Actual cost for THIS occurrence (overrides Place.priceHint for budget). */
    cost: z.number().optional(),
    duration: IsoDuration.optional(),
    notes: z.string().optional(),
    insights: z.array(InsightSchema).optional(),
  })
  .refine((i) => Boolean(i.placeId || i.routeId || i.name), {
    message: "ScheduleItem must have placeId, routeId, or name",
  });
export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;

// ----------------------------------------------------------------------------
// Day — array index IS the day number (Day 1 = days[0]). No `num` field:
// reorder = splice (no renumeration); dates derived from startDate + index.
// ----------------------------------------------------------------------------

export const DaySchema = z.object({
  title: z.string(),
  /** CSS class hint for the viewer (e.g. "active-day", "drive-day", "rest-day"). */
  cls: z.string().optional(),
  /** Ordered intra-day timeline. */
  schedule: z.array(ScheduleItemSchema),
  /** Day-wide insights (weather, crowds, traffic) — distinct from per-item insights. */
  insights: z.array(InsightSchema).optional(),
  /** Contingency note — what to do on rain / closure / unexpected change. */
  planB: z.string().optional(),
  dayCost: z.string().optional(),
});
export type Day = z.infer<typeof DaySchema>;

// ----------------------------------------------------------------------------
// Checklist (merged with packing — discriminated by type)
// ----------------------------------------------------------------------------

export const ChecklistItemSchema = z.object({
  id: z.string().regex(KEBAB_RE, {
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
// Bookings — v3 adds optional placeId linking to the Place catalog. Viewer
// hydrates the booking row with the place's picture + click focuses pin on map.
// ----------------------------------------------------------------------------

export const BookingSchema = z.object({
  /** ISO date for the booking (e.g. flight day, check-in day). */
  date: z.string(),
  /** Description of the ticket/reservation (e.g. "LATAM | Flight GRU → MXP | round-trip"). */
  item: z.string(),
  status: z.enum(["confirmed", "pending"]),
  /** True when the booking must be secured early (sold-out / price-spike risk). */
  critical: z.boolean(),
  /** Booking URL. */
  link: z.string().optional(),
  /** Optional anchor into the Place catalog (e.g. hotel reservation → its pin). */
  placeId: KebabId.optional(),
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
  id: z.string().regex(KEBAB_RE, {
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
// Trip (root) — single document. Replaces v2 Trip + TripMapData.
// ----------------------------------------------------------------------------

export const TripSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    /** Optional — assigned on import by explor8. */
    id: z.string().optional(),
    /** kebab-case, unique per owner. */
    slug: KebabId,
    title: z.string(),
    destination: DestinationSchema,
    /** Optional. ISO date "YYYY-MM-DD" if known, else "YYYY-MM" for month-only. */
    startDate: z
      .string()
      .regex(START_DATE_RE, { message: 'startDate must be "YYYY-MM-DD" or "YYYY-MM"' })
      .optional(),
    status: TripStatusSchema,
    /** ISO 4217 currency of the destination (EUR, GBP, USD, BRL, ...). */
    currency: z.string(),
    /** Traveler's home/preferred display currency (ISO 4217). When set, viewer
     *  and budget mode show converted costs alongside destination currency. */
    homeCurrency: z.string().optional(),
    /** IANA timezone for the destination (e.g. "Europe/Rome"). */
    timezone: z.string().optional(),
    coverImage: z.string().optional(),
    ogImage: z.string().optional(),
    isPublic: z.boolean().optional(),
    /** Place catalog — top-level. Schedule items reference these by `placeId`. */
    places: z.array(PlaceSchema),
    /** Route catalog — top-level. Schedule items reference these by `routeId`. */
    routes: z.array(RouteSchema),
    days: z.array(DaySchema),
    checklist: z.array(ChecklistGroupSchema).optional(),
    bookings: z.array(BookingSchema).optional(),
    budget: z.array(BudgetItemSchema).optional(),
  })
  .refine((t) => new Set(t.places.map((p) => p.id)).size === t.places.length, {
    message: "Place ids must be unique within trip",
  })
  .refine((t) => new Set(t.routes.map((r) => r.id)).size === t.routes.length, {
    message: "Route ids must be unique within trip",
  })
  .refine(
    /** Referential integrity: schedule[].placeId/routeId and bookings[].placeId
     *  must point at actual Place/Route ids. Catches skill typos like
     *  "castelo-blead" vs "castelo-bled" that would otherwise silently break
     *  rendering (placeholder pin on a real day's schedule). */
    (t) => {
      const placeIds = new Set(t.places.map((p) => p.id));
      const routeIds = new Set(t.routes.map((r) => r.id));
      for (const day of t.days) {
        for (const item of day.schedule) {
          if (item.placeId && !placeIds.has(item.placeId)) return false;
          if (item.routeId && !routeIds.has(item.routeId)) return false;
        }
      }
      for (const b of t.bookings ?? []) {
        if (b.placeId && !placeIds.has(b.placeId)) return false;
      }
      return true;
    },
    { message: "schedule/bookings reference unknown placeId or routeId" },
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
  coverImage: z.string().optional(),
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
