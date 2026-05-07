/**
 * Tiny logger. No dependencies — uses ANSI codes so it works in any TTY.
 * Falls back to no-color when NO_COLOR is set or stdout is not a TTY.
 */

const isTty = process.stdout.isTTY && !process.env.NO_COLOR;

function color(code: string, text: string): string {
  return isTty ? `\x1b[${code}m${text}\x1b[0m` : text;
}

export const log = {
  info: (msg: string) => console.log(color("36", "•") + " " + msg),
  success: (msg: string) => console.log(color("32", "✓") + " " + msg),
  warn: (msg: string) => console.warn(color("33", "⚠") + " " + msg),
  error: (msg: string) => console.error(color("31", "✖") + " " + msg),
  step: (msg: string) => console.log(color("90", `  ${msg}`)),
};
