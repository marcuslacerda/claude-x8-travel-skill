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
 *
 * Use `--verbose` to print env config (masked), request headers, and
 * response headers for diagnosing 401/auth issues against Vercel.
 */

import { readFileSync, existsSync, statSync } from "fs";
import { createHash } from "node:crypto";
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

/** Mask a secret for terminal output: first 8 chars + ellipsis + last 6 chars.
 *  Returns "***" for very short strings to avoid leaking the whole value. */
function maskToken(s: string): string {
  if (s.length <= 14) return "***";
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

/** SHA-256 hex of a string. Lets the user compare tokens across machines
 *  without exposing the raw value (run the same hash on Vercel + compare). */
function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function printVerboseConfig(opts: {
  slug: string;
  cliVersion: string;
  apiUrl: string;
  apiUrlSource: "env" | "default";
  token: string;
  bodyPath: string;
  bodyBytes: number;
  fullUrl: string;
}): void {
  const sep = "─".repeat(70);
  console.log(sep);
  log.info("publish (verbose)");
  console.log(sep);
  log.step(`Slug:           ${opts.slug}`);
  log.step(`CLI version:    x8-travel/${opts.cliVersion}`);
  console.log("");
  log.info("Environment");
  log.step(
    `EXPLOR8_API_URL        ${opts.apiUrl}  (${opts.apiUrlSource === "env" ? "from env" : "default — env var not set"})`,
  );
  log.step(`EXPLOR8_PUBLISH_TOKEN`);
  log.step(`  length:              ${opts.token.length}`);
  log.step(`  preview:             ${maskToken(opts.token)}`);
  log.step(`  sha256:              ${sha256Hex(opts.token)}`);
  log.step(`  hasTrailingNewline:  ${opts.token.endsWith("\n")}`);
  log.step(`  hasLeadingSpace:     ${opts.token.startsWith(" ")}`);
  console.log("");
  log.info("Request");
  log.step(`POST ${opts.fullUrl}`);
  log.step(`  Content-Type:        application/json`);
  log.step(`  Authorization:       Bearer ${maskToken(opts.token)}`);
  log.step(`  X-Publish-Source:    x8-travel/${opts.cliVersion}`);
  log.step(`  Body:                ${opts.bodyPath} (${formatBytes(opts.bodyBytes)})`);
  console.log("");
  log.info("To compare with Vercel without exposing the value");
  log.step(`# In the explor8 server repo:`);
  log.step(`vercel env pull /tmp/.env.prod --environment=production`);
  log.step(`printf "%s" "$(grep '^EXPLOR8_ADMIN_TOKEN' /tmp/.env.prod | cut -d'=' -f2 | tr -d '"')" \\`);
  log.step(`  | shasum -a 256`);
  log.step(`# Match the sha256 above. If different → token desalinhado.`);
  console.log(sep);
}

function printVerboseResponse(res: Response, bodyText: string): void {
  console.log("");
  log.info("Response");
  log.step(`Status:                ${res.status} ${res.statusText}`);
  log.step(`Headers:`);
  // Iterate header pairs; filter to the most useful for debugging
  const interesting = new Set([
    "content-type",
    "content-length",
    "server",
    "x-vercel-id",
    "x-vercel-cache",
    "x-matched-path",
    "x-publish-source",
    "date",
  ]);
  for (const [k, v] of res.headers) {
    if (interesting.has(k.toLowerCase())) {
      log.step(`  ${k}: ${v}`);
    }
  }
  log.step(`Body (${bodyText.length} bytes):`);
  // Indent the body for readability
  for (const line of bodyText.split("\n").slice(0, 20)) {
    log.step(`  ${line}`);
  }
}

export async function publish(
  slug: string,
  options: { verbose?: boolean } = {},
): Promise<void> {
  const verbose = options.verbose ?? false;
  const paths = resolveTripPaths(slug);
  assertDirExists(paths);

  const apiUrlEnv = process.env.EXPLOR8_API_URL;
  const apiUrl = (apiUrlEnv || DEFAULT_API_URL).replace(/\/$/, "");
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
  const bodyBytes = statSync(paths.publishJson).size;
  const cliVersion = readPackageVersion();
  const url = apiUrl + PUBLISH_PATH;

  if (verbose) {
    printVerboseConfig({
      slug,
      cliVersion,
      apiUrl,
      apiUrlSource: apiUrlEnv ? "env" : "default",
      token,
      bodyPath: paths.publishJson,
      bodyBytes,
      fullUrl: url,
    });
  } else {
    log.info(`POST ${url}`);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Publish-Source": `x8-travel/${cliVersion}`,
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

  if (verbose) printVerboseResponse(res, text);

  if (!res.ok) {
    log.error(`publish failed (HTTP ${res.status})`);
    if (!verbose) {
      // In non-verbose mode, surface the body so users still see why.
      if (typeof parsed === "object" && parsed !== null) {
        console.error(JSON.stringify(parsed, null, 2));
      } else {
        console.error(parsed);
      }
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
