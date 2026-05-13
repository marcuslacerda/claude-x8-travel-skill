/**
 * Validate raw JSON against the v3 TripSchema and wrap it in the publish
 * envelope expected by explor8's `/api/admin/trips/publish` endpoint.
 *
 * Pure function — no I/O.
 *
 * In v3 the publish payload is `{ trip }` (single key). The previous
 * `{ trip, mapData }` envelope is gone: places + routes now live inside the
 * trip document.
 */

import { z } from "zod/v4";
import { TripSchema, type Trip } from "./schema.ts";

export interface PublishPayload {
  trip: Trip;
}

/**
 * Accepts either a bare trip document or a pre-wrapped `{ trip }` payload
 * (validates the inner trip in either case).
 */
export function validateTripForPublish(raw: unknown): PublishPayload {
  const candidate = isWrapped(raw) ? raw.trip : raw;
  const result = TripSchema.safeParse(candidate);
  if (!result.success) {
    throw schemaError("trip.json fails TripSchema v3", result.error);
  }
  return { trip: result.data };
}

function isWrapped(x: unknown): x is { trip: unknown } {
  return (
    !!x &&
    typeof x === "object" &&
    "trip" in (x as Record<string, unknown>) &&
    typeof (x as { trip: unknown }).trip === "object"
  );
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
