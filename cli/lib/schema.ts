import { z } from "zod/v4";

// ============================================================================
// Schema v2 — see /skill/sources-travel-experience.md and spec.md
// Canonical source: ~/dev/marcus/travel/src/lib/schemas/trip.ts
// This file is vendored. Schema-drift CI keeps both files byte-identical.
// ============================================================================

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
// Experience taxonomy — shared between schedule items and map POIs
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

/** Travel source — the platform/service that informed the POI or pricing.
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
// Schedule items — discriminated union of Experience | Transfer
// ----------------------------------------------------------------------------

export const ExperienceLinkSchema = z.object({
  /** Free-form link type (e.g. "official", "tickets", "menu", "trail-map").
   *  Travel-source links use TravelSource slugs; arbitrary links use any kebab-case. */
  type: z.string(),
  url: z.string(),
});
export type ExperienceLink = z.infer<typeof ExperienceLinkSchema>;

export const ExperienceSchema = z.object({
  type: z.literal("experience"),
  /** Time of day or duration (e.g. "09:00", "2h", "afternoon"). */
  time: z.string(),
  name: z.string(),
  desc: z.string().optional(),
  /** Tips, instructions, review notes. **User-only field** — the skill never
   *  writes here. Reserved for manual edits by the traveler in the viewer
   *  or directly in trip.json. Skill-generated observations belong in an
   *  Insight item in the schedule, not in notes. */
  notes: z.string().optional(),
  /** Cost in trip currency. Use 0 for free. Omit if unknown. */
  cost: z.number().optional(),
  category: ExperienceCategorySchema,
  kind: ExperienceKindSchema.optional(),
  source: TravelSourceSchema.optional(),
  /** Public image URL. Wikipedia/Unsplash/official sites only — no socials. */
  picture: z.string().optional(),
  links: z.array(ExperienceLinkSchema).optional(),
  /** When set, this Experience is **specific** — it refers to a real place
   *  with coordinates, and a corresponding MapPOI exists in map.json with
   *  the same id. When absent, the Experience is **generic** (a time block
   *  without a specific location, e.g. "Lunch break"). kebab-case. */
  poiId: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, { message: "poiId must be lowercase kebab-case" })
    .optional(),
  /** Popularity score (0–10 decimal) derived from Wikipedia annual pageviews:
   *  `min(log10(annual_views), 10.0)`. Set only when the POI has a Wikipedia
   *  entry — a cheap signal of "how known is this place". Skill-written;
   *  not user-edited. See skill/guideline.md "Popularity score". */
  popularity: z.number().min(0).max(10).optional(),
});
export type Experience = z.infer<typeof ExperienceSchema>;

export const TransferModelSchema = z.enum(["drive", "walk", "ferry", "flight", "train"]);
export type TransferModel = z.infer<typeof TransferModelSchema>;

export const TransferEndpointSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type TransferEndpoint = z.infer<typeof TransferEndpointSchema>;

export const TransferSchema = z.object({
  type: z.literal("transfer"),
  time: z.string().optional(),
  from: TransferEndpointSchema,
  to: TransferEndpointSchema,
  model: TransferModelSchema,
  /** Duration in minutes. */
  duration: z.number(),
  /** Distance in kilometers. */
  distance: z.number().optional(),
  cost: z.number().optional(),
  notes: z.string().optional(),
});
export type Transfer = z.infer<typeof TransferSchema>;

/** Skill-generated observation about the segment of the day around it.
 *  Inserted between Experiences/Transfers to surface highlights (good light,
 *  small crowds, photo angles) and warnings (parking fills early, traffic at
 *  certain hours, weather risks). Never user-edited — manual notes live in
 *  Experience.notes. */
export const InsightSchema = z
  .object({
    type: z.literal("insight"),
    /** Positive observations the traveler should know in advance. */
    highlights: z.array(z.string()).optional(),
    /** Cautions and constraints the traveler should plan around. */
    warnings: z.array(z.string()).optional(),
  })
  .refine(
    (i) => (i.highlights && i.highlights.length > 0) || (i.warnings && i.warnings.length > 0),
    { message: "Insight must have at least one highlight or warning" },
  );
export type Insight = z.infer<typeof InsightSchema>;

export const ScheduleItemSchema = z.discriminatedUnion("type", [
  ExperienceSchema,
  TransferSchema,
  InsightSchema,
]);
export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;

// ----------------------------------------------------------------------------
// Trip day
// ----------------------------------------------------------------------------

export const TripDaySchema = z.object({
  /** Day index as string ("1", "2", ...). Date is derived from trip.startDate + (num - 1). */
  num: z.string(),
  title: z.string(),
  /** CSS class hint for the viewer (e.g. "drive-day", "rest-day"). */
  cls: z.string(),
  desc: z.string().optional(),
  /** Single source of truth for the day's itinerary. Stay (lodging) is
   *  represented as an Experience with category="stay" — the viewer derives
   *  "Stay at X" by finding the last such item. Warnings/highlights are
   *  represented as Insight items interleaved with Experiences/Transfers. */
  schedule: z.array(ScheduleItemSchema).optional(),
  dayCost: z.string().optional(),
  /** Contingency notes — what to do on rain / closure / unexpected change.
   *  Memory of planning context for stress moments mid-trip. */
  planB: z.string().optional(),
});
export type TripDay = z.infer<typeof TripDaySchema>;

// ----------------------------------------------------------------------------
// Checklist (merged with packing — discriminated by type)
// ----------------------------------------------------------------------------

export const ChecklistItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, {
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
// Bookings
// ----------------------------------------------------------------------------

export const BookingSchema = z.object({
  /** ISO date for the booking (e.g. flight day, check-in day). */
  date: z.string(),
  /** Description of the ticket/reservation (e.g. "LATAM | Flight GRU → MXP | round-trip"). */
  item: z.string(),
  status: z.enum(["confirmed", "pending"]),
  /** True when the booking must be secured early (sold-out / price-spike risk). */
  critical: z.boolean(),
  /** Booking URL. The viewer chooses the label dynamically:
   *   - status=pending or critical=true → "Booking"
   *   - status=confirmed → "Open" */
  link: z.string().optional(),
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
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, {
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
// Map data
// ----------------------------------------------------------------------------

/** Provenance of a map mutation. */
export const MapUpdatedBySchema = z.enum(["skill", "chat", "webui"]);
export type MapUpdatedBy = z.infer<typeof MapUpdatedBySchema>;

export const MapPOISchema = z.object({
  /** Stable id — chat tool targets via this. Unique within trip. kebab-case. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, {
    message: "POI id must be lowercase kebab-case",
  }),
  lat: z.number(),
  lng: z.number(),
  name: z.string(),
  description: z.string().optional(),
  category: ExperienceCategorySchema,
  kind: ExperienceKindSchema.optional(),
  /** Travel-platform source (booking, tripadvisor, ...). For UI infowindow link. */
  source: TravelSourceSchema.optional(),
  /** Who/what last touched this POI. */
  updatedBy: MapUpdatedBySchema.default("skill"),
  /** Omit = trip-wide overview. Number = single day (e.g. `10`). Array =
   *  multiple days (e.g. `[9, 10, 11]` for a multi-night stay that
   *  doubles as the next morning's departure point). */
  dayNum: z
    .union([z.number().int().positive(), z.array(z.number().int().positive()).nonempty()])
    .optional(),
  /** Popularity score (0–10) — same value as the linked Experience's
   *  `popularity`. Mirrored here for map-tab UI (e.g. sort POIs by score). */
  popularity: z.number().min(0).max(10).optional(),
});
export type MapPOI = z.infer<typeof MapPOISchema>;

export const MapRouteKindSchema = z.enum([
  "driving",
  "walking",
  "ferry",
  "transit",
  "flight",
  "train",
]);
export type MapRouteKind = z.infer<typeof MapRouteKindSchema>;

export const MapRouteSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, {
    message: "Route id must be lowercase kebab-case",
  }),
  name: z.string().optional(),
  /** Hex color for polyline stroke (e.g. "#669944"). */
  color: z.string(),
  kind: MapRouteKindSchema,
  /** Omit = trip-wide overview polyline. Number = drawn only inside day N.
   *  Array = drawn on each listed day (e.g. a multi-day driving leg that
   *  the user wants visible from both endpoints' day filters). */
  dayNum: z
    .union([z.number().int().positive(), z.array(z.number().int().positive()).nonempty()])
    .optional(),
  coordinates: z.array(z.object({ lat: z.number(), lng: z.number() })),
  updatedBy: MapUpdatedBySchema.default("skill"),
});
export type MapRoute = z.infer<typeof MapRouteSchema>;

export const TripMapDataSchema = z
  .object({
    pois: z.array(MapPOISchema),
    routes: z.array(MapRouteSchema),
  })
  .refine((m) => new Set(m.pois.map((p) => p.id)).size === m.pois.length, {
    message: "POI ids must be unique within trip",
  })
  .refine((m) => new Set(m.routes.map((r) => r.id)).size === m.routes.length, {
    message: "Route ids must be unique within trip",
  });
export type TripMapData = z.infer<typeof TripMapDataSchema>;

// ----------------------------------------------------------------------------
// Trip (root)
// ----------------------------------------------------------------------------

/** Loose ISO date or year-month: "2027-02-14" or "2027-02". */
const StartDatePattern = /^\d{4}-\d{2}(-\d{2})?$/;

export const TripSchema = z.object({
  /** Optional — assigned at publish time by explor8. */
  id: z.string().optional(),
  /** kebab-case, unique per owner. */
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string(),
  destination: DestinationSchema,
  /** Optional. ISO date "YYYY-MM-DD" if known, else "YYYY-MM" for month-only. */
  startDate: z
    .string()
    .regex(StartDatePattern, {
      message: 'startDate must be "YYYY-MM-DD" or "YYYY-MM"',
    })
    .optional(),
  status: TripStatusSchema,
  /** ISO 4217 currency of the destination (EUR, GBP, USD, BRL, ...). */
  currency: z.string(),
  /** IANA timezone for the destination (e.g. "Europe/Rome"). Drives todayISO() in viewer/explor8. */
  timezone: z.string().optional(),
  coverImage: z.string().optional(),
  ogImage: z.string().optional(),
  isPublic: z.boolean().optional(),
  days: z.array(TripDaySchema),
  checklist: z.array(ChecklistGroupSchema).optional(),
  bookings: z.array(BookingSchema).optional(),
  budget: z.array(BudgetItemSchema).optional(),
});
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

// ----------------------------------------------------------------------------
// Publish envelope — what x8-travel publish POSTs to /api/admin/trips/publish
// ----------------------------------------------------------------------------

export const PublishPayloadSchema = z.object({
  trip: TripSchema,
  mapData: TripMapDataSchema.optional().nullable(),
});
export type PublishPayload = z.infer<typeof PublishPayloadSchema>;
