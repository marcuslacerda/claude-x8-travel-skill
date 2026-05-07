/**
 * Parse a KML journey map into TripMapData (see schema.ts).
 *
 * Pure function — takes KML content string and optional trip start date
 * (used to resolve route name prefixes like "Jun 11 (Thu):" → dayNum).
 * Returns parsed data + warnings array.
 *
 * Folder conventions in the source KML:
 *   - "Pontos de Interesse" (or "POI") → POIs (Placemarks with <Point>)
 *   - "Rotas" (or "Routes")            → routes (Placemarks with <LineString>)
 *
 * Style ids:
 *   - <Style id="lake">, <Style id="camp">, etc. — single token mapped via
 *     resolveCategoryKind() (legacy or new naming both supported)
 *   - <Style id="route-N"> with <LineStyle><color> — color extracted, used for
 *     polyline rendering
 */

import { z } from "zod/v4";
import { TripMapDataSchema } from "./schema.ts";
import { resolveCategoryKind, genStableId, parseRouteDayNum } from "./map-taxonomy.ts";

export type TripMapData = z.infer<typeof TripMapDataSchema>;

function kmlColorToHex(kmlColor: string): string {
  const raw = kmlColor.replace(/^#/, "");
  if (raw.length !== 8) return "#888888";
  const rr = raw.slice(6, 8);
  const gg = raw.slice(4, 6);
  const bb = raw.slice(2, 4);
  return `#${rr}${gg}${bb}`;
}

function allMatches(text: string, regex: RegExp): RegExpExecArray[] {
  const results: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) results.push(m);
  return results;
}

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = re.exec(xml);
  return m ? m[1].trim() : null;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export interface KmlParseResult {
  data: TripMapData;
  warnings: string[];
}

export function parseKmlToMapData(kmlContent: string, tripStartDate?: string): KmlParseResult {
  const warnings: string[] = [];

  // 1. Parse route styles: Style id="route-*" → color
  const routeStyles: Record<string, string> = {};
  const styleRe = /<Style id="(route-[^"]+)">\s*<LineStyle>\s*<color>([^<]+)<\/color>/g;
  for (const m of allMatches(kmlContent, styleRe)) {
    routeStyles[`#${m[1]}`] = kmlColorToHex(m[2]);
  }

  // 2. Find folders
  const folderRe = /<Folder>([\s\S]*?)<\/Folder>/g;
  const folders = allMatches(kmlContent, folderRe);

  type ParsedPOI = TripMapData["pois"][number];
  type ParsedRoute = TripMapData["routes"][number];

  const pois: ParsedPOI[] = [];
  const routes: ParsedRoute[] = [];
  const poiIds = new Set<string>();
  const routeIds = new Set<string>();
  let routeIndex = 0;
  let startEndCount = 0;

  for (const folder of folders) {
    const folderContent = folder[1];
    const folderName = extractTag(folderContent, "name") || "";

    const placemarkRe = /<Placemark>([\s\S]*?)<\/Placemark>/g;
    for (const pm of allMatches(folderContent, placemarkRe)) {
      const block = pm[1];
      const name = unescapeXml(extractTag(block, "name") || "");
      const desc = unescapeXml(extractTag(block, "description") || "");
      const styleUrl = extractTag(block, "styleUrl") || "";
      const point = extractTag(block, "coordinates");

      if (folderName.includes("Pontos de Interesse") || folderName.includes("POI")) {
        if (!point) continue;
        const [lng, lat] = point.split(",").map(Number);
        const token = styleUrl.replace("#", "");

        let category: ParsedPOI["category"];
        let kind: ParsedPOI["kind"];
        try {
          ({ category, kind } = resolveCategoryKind(token));
        } catch (err) {
          warnings.push((err as Error).message);
          continue;
        }

        // Roundtrip: second `start-end` (or anything tagged "Return") = destination
        if (kind === "headline") {
          startEndCount += 1;
          const isReturn = startEndCount > 1 || /return/i.test(name) || /return/i.test(desc);
          if (isReturn) kind = "destination";
        }

        pois.push({
          id: genStableId(name, poiIds),
          name,
          description: desc,
          category,
          kind,
          lat,
          lng,
          source: "advisor",
        });
      } else if (folderName.includes("Rotas") || folderName.includes("Routes")) {
        const lineString = extractTag(block, "coordinates");
        if (!lineString) continue;
        const color = routeStyles[styleUrl] || "#888888";
        const coordinates = lineString
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((coord) => {
            const [lng, lat] = coord.split(",").map(Number);
            return { lat, lng };
          });

        const dayNum = tripStartDate ? parseRouteDayNum(name, tripStartDate) : undefined;
        if (tripStartDate && dayNum === undefined) {
          warnings.push(`route "${name}" — could not parse dayNum from name prefix`);
        }

        const baseId = dayNum !== undefined ? `route-day-${dayNum}` : `route-${routeIndex + 1}`;
        const id = genStableId(baseId, routeIds);
        routes.push({
          id,
          name,
          color,
          kind: "driving",
          ...(dayNum !== undefined ? { dayNum } : {}),
          coordinates,
          source: "advisor",
        });
        routeIndex += 1;
      }
    }
  }

  // 3. Validate before returning — fail loud.
  const result = TripMapDataSchema.safeParse({ pois, routes });
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const at = issue.path.join(".") || "<root>";
        return `   • ${at} — ${issue.message}`;
      })
      .join("\n");
    throw new Error(`KML parse produced invalid TripMapData:\n${issues}`);
  }

  return { data: result.data, warnings };
}
