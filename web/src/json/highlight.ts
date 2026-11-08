import Prism from "prismjs";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markup";

/** One highlighted segment of a line. `cls` maps onto the jv-* palette in
 *  theme.css; undefined means plain text. */
export type HlToken = { text: string; cls?: string };

export type HlLang = "json" | "markup";

/** Prism token type -> jv-* class. JSON grammar (prism-json.js) emits
 *  property/string/number/boolean/null/punctuation/operator/comment; markup
 *  emits tag/attr-name/attr-value among others. A type may carry aliases
 *  ("null keyword"), so try each word. */
const CLS: Record<string, string | undefined> = {
  property: "jv-key",
  string: "jv-string",
  number: "jv-number",
  boolean: "jv-boolean",
  null: "jv-null",
  keyword: "jv-null",
  comment: "jv-punct",
  operator: "jv-punct",
  punctuation: "jv-punct",
  tag: "jv-tag",
  "attr-name": "jv-key",
  "attr-value": "jv-string",
};

function typeCls(type: string): string | undefined {
  for (const t of type.split(/\s+/)) {
    const c = CLS[t];
    if (c) return c;
  }
  return undefined;
}

/** Prism nests tokens (a markup `tag` contains punctuation, attr-name, ...).
 *  Flatten the stream. A nested piece keeps its own mapped class, or inherits
 *  the enclosing token's class when it has none of its own — so the bare word
 *  inside `<body ...>` still reads as a tag. */
function flatten(parts: (string | Prism.Token)[], out: HlToken[], inherit?: string): void {
  for (const part of parts) {
    if (typeof part === "string") {
      if (part) out.push({ text: part, cls: inherit });
      continue;
    }
    const cls = typeCls(part.type) ?? inherit;
    if (typeof part.content === "string") {
      out.push({ text: part.content, cls });
    } else if (Array.isArray(part.content)) {
      flatten(part.content, out, cls);
    }
  }
}

/** Tokenize `text` into per-line token arrays, one entry per rendered line,
 *  matching `text.split("\n")` indexes. Lines carry colored spans so the
 *  gutter stays a plain line-number column and a later find-bar can slice
 *  matches inside tokens. */
export function tokenizeLines(text: string, lang: HlLang): HlToken[][] {
  const grammar = Prism.languages[lang];
  const flat: HlToken[] = [];
  if (grammar) flatten(Prism.tokenize(text, grammar), flat);
  else flat.push({ text });
  const lines: HlToken[][] = [[]];
  for (const tok of flat) {
    const segs = tok.text.split("\n");
    segs.forEach((seg, i) => {
      if (i > 0) lines.push([]);
      if (seg) lines[lines.length - 1].push({ text: seg, cls: tok.cls });
    });
  }
  return lines;
}

/** One match inside the body: line index (0-based, matching
 *  `text.split("\n")`), start offset within that line, and length. */
export type HlMatch = { line: number; start: number; length: number };

/** Case-insensitive substring matches, in reading order. Matching is per
 *  line — a query never matches across a newline — and non-overlapping. */
export function findMatches(text: string, query: string): HlMatch[] {
  if (!query) return [];
  const q = query.toLowerCase();
  const out: HlMatch[] = [];
  text.split("\n").forEach((ln, line) => {
    const hay = ln.toLowerCase();
    let from = 0;
    for (;;) {
      const at = hay.indexOf(q, from);
      if (at < 0) break;
      out.push({ line, start: at, length: q.length });
      from = at + q.length;
    }
  });
  return out;
}

/** Number of matches for the find bar counter. */
export function countMatches(text: string, query: string): number {
  return query ? findMatches(text, query).length : 0;
}
