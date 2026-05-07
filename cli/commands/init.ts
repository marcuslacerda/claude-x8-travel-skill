/**
 * `x8-travel init <slug>` — scaffold a new trip directory from the bundled
 * template at `templates/trip-skeleton/`.
 *
 * Creates `<slug>/` (default: cwd-relative) with the skeleton files. Refuses
 * to overwrite an existing non-empty directory.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { log } from "../lib/log.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = resolve(__dirname, "..", "..", "templates", "trip-skeleton");

function copyDir(src: string, dest: string, replacements: Record<string, string>): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath, replacements);
    } else {
      let content = readFileSync(srcPath, "utf-8");
      for (const [token, value] of Object.entries(replacements)) {
        content = content.replaceAll(token, value);
      }
      writeFileSync(destPath, content, "utf-8");
    }
  }
}

export function init(slug: string): void {
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(
      `Invalid slug: "${slug}". Use lowercase letters, numbers, and hyphens (e.g. "italy-2026").`,
    );
  }

  const targetDir = resolve(process.cwd(), slug);
  if (existsSync(targetDir)) {
    const entries = readdirSync(targetDir).filter((f) => !f.startsWith("."));
    if (entries.length > 0) {
      throw new Error(`Directory ${targetDir} already exists and is not empty.`);
    }
  }

  if (!existsSync(TEMPLATE_DIR)) {
    throw new Error(`Template not found at ${TEMPLATE_DIR}. Reinstall x8-travel.`);
  }

  log.info(`Scaffolding trip "${slug}" at ${targetDir}`);
  copyDir(TEMPLATE_DIR, targetDir, { "{{SLUG}}": slug });

  log.success(`Created ${slug}/ with skeleton:`);
  for (const f of readdirSync(targetDir)) {
    log.step(f);
  }
  console.log("");
  log.info("Next steps:");
  log.step("1. Open in Claude Code and run: /travel-planner use " + slug);
  log.step("2. Use skill modes (research, weather, budget, ...) to fill in journey-plan.md");
  log.step("3. When ready: /travel-planner export → writes trip.json");
  log.step("4. Then run: x8-travel map " + slug + " (KML → map.json)");
  log.step("5. Then run: x8-travel build " + slug + " (combine → publish.json)");
}
