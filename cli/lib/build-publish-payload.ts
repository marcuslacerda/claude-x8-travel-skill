/**
 * Combine `trip.json` + `map.json` into a single publish payload.
 *
 * Pure function — takes the parsed JSONs and returns the `{ trip, mapData }`
 * envelope expected by explor8's `/api/admin/trips/publish` endpoint.
 *
 * Validates trip against TripSchema and map against TripMapDataSchema before
 * combining. Map is optional — pass null/undefined to publish a trip without
 * a map (clears the column on update).
 */

import { z } from "zod/v4";
import { TripSchema, TripMapDataSchema } from "./schema.ts";

export type Trip = z.infer<typeof TripSchema>;
export type TripMapData = z.infer<typeof TripMapDataSchema>;

export interface PublishPayload {
  trip: Trip;
  mapData: TripMapData | null;
}

/**
 * Already-wrapped input passes through unchanged. Otherwise treats the input
 * as a flat trip and wraps it. Validates trip + map against schemas; throws
 * with a structured error message on failure.
 */
export function buildPublishPayload(
  tripRaw: unknown,
  mapRaw: unknown | null = null,
): PublishPayload {
  // Already wrapped? Pass through unchanged.
  if (
    tripRaw &&
    typeof tripRaw === "object" &&
    "trip" in tripRaw &&
    typeof (tripRaw as { trip: unknown }).trip === "object"
  ) {
    return tripRaw as PublishPayload;
  }

  const tripResult = TripSchema.safeParse(tripRaw);
  if (!tripResult.success) {
    throw schemaError("trip.json fails TripSchema", tripResult.error);
  }

  if (mapRaw == null) {
    return { trip: tripResult.data, mapData: null };
  }

  const mapResult = TripMapDataSchema.safeParse(mapRaw);
  if (!mapResult.success) {
    throw schemaError("map.json fails TripMapDataSchema", mapResult.error);
  }

  return { trip: tripResult.data, mapData: mapResult.data };
}

function schemaError(prefix: string, err: z.ZodError): Error {
  const issues = err.issues
    .map((issue) => {
      const at = issue.path.join(".") || "<root>";
      return `   • ${at} — ${issue.message}`;
    })
    .join("\n");
  return new Error(`${prefix}:\n${issues}`);
}
