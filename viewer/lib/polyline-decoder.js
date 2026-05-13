/**
 * Pure-JS decoder for Google's encoded polyline algorithm.
 *
 * Spec: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 *
 * Output matches `@googlemaps/polyline-codec` decode: array of [lat, lng].
 * Precision 5 (Google standard) gives ~1.1m resolution per quantization step.
 *
 * No external dependencies — keeps the viewer build-step-free.
 */

/**
 * @param {string} encoded
 * @param {number} [precision=5]
 * @returns {Array<[number, number]>}
 */
export function decodePolyline(encoded, precision = 5) {
  if (typeof encoded !== "string" || encoded.length === 0) return [];
  const factor = Math.pow(10, precision);
  const len = encoded.length;
  let index = 0;
  let lat = 0;
  let lng = 0;
  const result = [];

  while (index < len) {
    let b;
    let shift = 0;
    let value = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      value |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = value & 1 ? ~(value >> 1) : value >> 1;
    lat += dlat;

    shift = 0;
    value = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      value |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = value & 1 ? ~(value >> 1) : value >> 1;
    lng += dlng;

    result.push([lat / factor, lng / factor]);
  }

  return result;
}

/**
 * Safe variant: decode that returns [] (and logs a warning) on malformed input
 * instead of throwing. Use in renderers so one bad route can't break the map.
 *
 * @param {string} encoded
 * @param {string} [routeId]  — for warning context
 */
export function safeDecode(encoded, routeId = "?") {
  try {
    return decodePolyline(encoded, 5);
  } catch (err) {
    console.warn(`[viewer] failed to decode polyline for route ${routeId}:`, err);
    return [];
  }
}
