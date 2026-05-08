/**
 * Load and parse `.env.local` from the repo root.
 *
 * The viewer is a static page with no build step, so we don't have access to
 * Node-style `process.env`. Instead, we fetch `.env.local` over HTTP (which
 * `python3 -m http.server` and similar dev servers happily serve) and parse
 * `KEY=value` lines client-side.
 *
 * Returns an object map. Returns `{}` if the file doesn't exist or fails to
 * parse — callers should treat absence as "feature disabled".
 *
 * Format:
 *   - Blank lines and lines starting with `#` are ignored
 *   - `KEY=value` — value may be quoted with " or ' (quotes stripped)
 *   - `export KEY=value` — `export` prefix is tolerated
 */
export async function loadEnvConfig() {
  try {
    const res = await fetch("../.env.local", { headers: { Accept: "text/plain" } });
    if (!res.ok) return {};
    const text = await res.text();
    return parseEnv(text);
  } catch {
    return {};
  }
}

export function parseEnv(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const stripped = line.startsWith("export ") ? line.slice(7) : line;
    const idx = stripped.indexOf("=");
    if (idx === -1) continue;
    const key = stripped.slice(0, idx).trim();
    let value = stripped.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) env[key] = value;
  }
  return env;
}
