/** Wildcard shorthand -> canonical mitmproxy ignore_hosts regex.

The output mirrors mitmproxy 12's matcher: `re.search` with IGNORECASE
against `host:port`, so the pattern must tolerate an optional `:port`
suffix. A strict `^…$` would never match a real connection.

This module owns the conversion. The backend only ever stores the raw
regex; shorthand never reaches config.yaml (ADR 0014, spec D3/D4).
*/
const SPECIAL = new Set("()[]{}?*+-|^$\\.&~# \t\n\r\v\f".split(""));

export type EntryMode = "wildcard" | "regex";

export function wildcardToRegex(input: string, onlyHttps = false): string {
  const value = input.trim();
  if (!value) throw new Error("An exclude pattern must not be empty");
  let body = "";
  for (const ch of value) {
    if (ch === "*") body += ".*";
    else if (ch === "?") body += ".";
    else body += SPECIAL.has(ch) ? "\\" + ch : ch;
  }
  return "^" + body + (onlyHttps ? ":443" : "(:\\d+)?") + "$";
}

/** Convert an input in the chosen mode into the regex that gets persisted. */
export function toCanonicalRegex(input: string, mode: EntryMode, onlyHttps = false): string {
  const value = input.trim();
  if (!value) throw new Error("An exclude pattern must not be empty");
  return mode === "wildcard" ? wildcardToRegex(value, onlyHttps) : value;
}

/** Python's inline `(?i)` / `(?i:...)` are not valid JS regex syntax. */
export function toJsRegExp(pattern: string): RegExp {
  const js = pattern.replace(/\(\?i\)/g, "").replace(/\(\?i:/g, "(?:");
  return new RegExp(js, "i");
}

/** Mirrors mitmproxy's `re.search(pattern, host:port)` + IGNORECASE. */
export function matchesHostPort(pattern: string, hostPort: string): boolean {
  return toJsRegExp(pattern).test(hostPort);
}

export function isValidJsRegex(pattern: string): boolean {
  try { toJsRegExp(pattern); return true; } catch { return false; }
}
