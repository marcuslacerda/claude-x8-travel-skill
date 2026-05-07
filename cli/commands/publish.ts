/**
 * `x8-travel publish <slug>` — POST `<slug>/publish.json` to the configured
 * explor8 publish endpoint.
 *
 * Configuration (env, optional `.env` in cwd is loaded by the runtime if
 * present):
 *   EXPLOR8_API_URL       — default https://www.explor8.ai
 *   EXPLOR8_PUBLISH_TOKEN — required (Bearer token)
 *
 * Sends `X-Publish-Source: x8-travel/<version>` for telemetry.
 *
 * Auto-builds publish.json if missing (calls `build` first). On non-2xx
 * response, prints the server's error body and exits non-zero.
 */

import { readFileSync, existsSync } from "fs";
import { resolveTripPaths, assertDirExists } from "../lib/paths.ts";
import { build } from "./build.ts";
import { log } from "../lib/log.ts";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "..", "..", "package.json"), "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const DEFAULT_API_URL = "https://www.explor8.ai";
const PUBLISH_PATH = "/api/admin/trips/publish";

export async function publish(slug: string): Promise<void> {
  const paths = resolveTripPaths(slug);
  assertDirExists(paths);

  const apiUrl = (process.env.EXPLOR8_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
  const token = process.env.EXPLOR8_PUBLISH_TOKEN;

  if (!token) {
    log.error("EXPLOR8_PUBLISH_TOKEN not set.");
    log.step("Publishing requires a token bound to your explor8.ai account.");
    log.step("Today explor8 is invite-only — see docs/publish-to-explor8.md.");
    log.step("To skip publishing, the skill works fully without it.");
    process.exit(1);
  }

  if (!existsSync(paths.publishJson)) {
    log.info("publish.json not found — running build first");
    build(slug);
  }

  const body = readFileSync(paths.publishJson, "utf-8");
  const version = readPackageVersion();
  const url = apiUrl + PUBLISH_PATH;

  log.info(`POST ${url}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Publish-Source": `x8-travel/${version}`,
    },
    body,
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    log.error(`publish failed (HTTP ${res.status})`);
    if (typeof parsed === "object" && parsed !== null) {
      console.error(JSON.stringify(parsed, null, 2));
    } else {
      console.error(parsed);
    }
    process.exit(1);
  }

  log.success(`Published — HTTP ${res.status}`);
  if (typeof parsed === "object" && parsed !== null) {
    const summary = parsed as Record<string, unknown>;
    if (typeof summary.url === "string") log.step(`URL: ${summary.url}`);
    if (typeof summary.slug === "string") log.step(`slug: ${summary.slug}`);
    if (Array.isArray(summary.warnings) && summary.warnings.length > 0) {
      log.warn(`${summary.warnings.length} warning(s) from server:`);
      for (const w of summary.warnings) log.step(String(w));
    }
  }
}
