import { useEffect, useRef, useState } from "react";
import { classify, collapsedLabel } from "../json/summary";
import { tokenizeLines, findMatches, type HlToken } from "../json/highlight";

function parse(body: string | null): { ok: boolean; value?: unknown } {
  if (body == null) return { ok: false };
  try { return { ok: true, value: JSON.parse(body) }; } catch { return { ok: false }; }
}

function Leaf({ value }: { value: unknown }) {
  const t = classify(value);
  const text = t === "string" ? `"${value as string}"` : String(value);
  return <span className={`jv-${t}`}>{text}</span>;
}

function Node({ k, value, depth, collapseSignal }: { k?: string; value: unknown; depth: number; collapseSignal: number }) {
  const t = classify(value);
  const container = t === "object" || t === "array";
  const [open, setOpen] = useState(true);
  const [sig, setSig] = useState(collapseSignal);
  if (sig !== collapseSignal) { setSig(collapseSignal); if (container) setOpen(false); }
  const pad = { paddingLeft: depth * 16 };
  const keyEl = k !== undefined ? <><span className="jv-key">{`"${k}"`}</span><span className="jv-punct">: </span></> : null;

  if (!container) {
    return <div className="jv-row" style={pad}>{keyEl}<Leaf value={value} /></div>;
  }
  const entries: [string | number, unknown][] = Array.isArray(value)
    ? value.map((v, i) => [i, v]) : Object.entries(value as object);
  const openTok = Array.isArray(value) ? "[" : "{";
  const closeTok = Array.isArray(value) ? "]" : "}";
  return (
    <div>
      <div className="jv-row jv-toggle" style={pad} onClick={() => setOpen((o) => !o)}>
        {keyEl}
        {open ? <span className="jv-punct">{openTok}</span>
              : <span className="jv-collapsed">{collapsedLabel(value)}</span>}
      </div>
      {open && entries.map(([ck, cv]) => (
        <Node key={String(ck)} k={Array.isArray(value) ? undefined : String(ck)} value={cv} depth={depth + 1} collapseSignal={collapseSignal} />
      ))}
      {open && <div className="jv-row" style={{ paddingLeft: depth * 16 }}><span className="jv-punct">{closeTok}</span></div>}
    </div>
  );
}

/** One find match with its position in the whole-body reading order. */
type LineMatch = { line: number; start: number; length: number; ordinal: number };

/** Render one line as runs of (class, mark) segments. Matched characters are
 *  wrapped in <mark> that keeps the token class, so token color and find
 *  highlight stack without nested spans. */
function findLineNodes(pieces: HlToken[], matches: LineMatch[], active: number) {
  const chars: { ch: string; cls?: string; mark: number }[] = [];
  for (const p of pieces) for (const ch of p.text) chars.push({ ch, cls: p.cls, mark: -1 });
  for (const m of matches) {
    for (let i = m.start; i < m.start + m.length && i < chars.length; i++) chars[i].mark = m.ordinal;
  }
  const runs: React.ReactNode[] = [];
  let i = 0, key = 0;
  while (i < chars.length) {
    const { cls, mark } = chars[i];
    let j = i;
    while (j < chars.length && chars[j].cls === cls && chars[j].mark === mark) j++;
    const text = chars.slice(i, j).map((c) => c.ch).join("");
    if (mark >= 0) {
      runs.push(<mark key={key++} className={["jv-find", cls, mark === active ? "jv-find-current" : ""].filter(Boolean).join(" ")}>{text}</mark>);
    } else if (cls) {
      runs.push(<span key={key++} className={cls}>{text}</span>);
    } else {
      runs.push(text);
    }
    i = j;
  }
  return runs.length ? runs : "​";
}

export function RawLines({ text, lang, find }: { text: string; lang?: "json" | "markup"; find?: { query: string; active: number } }) {
  const lines = text.split("\n");
  // Token rendering keeps the gutter a plain line-number column; each line is
  // a list of colored spans. An empty line still needs the zero-width space
  // to hold its height, same as the plain path.
  const tokens = lang ? tokenizeLines(text, lang) : null;
  const query = find?.query ?? "";
  const active = find?.active ?? -1;
  const allMatches = query ? findMatches(text, query) : [];
  const byLine = new Map<number, LineMatch[]>();
  allMatches.forEach((m, ordinal) => {
    const list = byLine.get(m.line) ?? [];
    list.push({ ...m, ordinal });
    byLine.set(m.line, list);
  });
  // Jump to the current match whenever it moves.
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!query) return;
    const el = wrapRef.current?.querySelector(".jv-find-current") as HTMLElement | null;
    // jsdom (tests) has no scrollIntoView.
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  }, [query, active, text, lang]);
  return (
    <div className="jv-raw-wrap" ref={wrapRef}>
      <div className="jv-gutter">{lines.map((_, i) => <div key={i}>{i + 1}</div>)}</div>
      <pre className="jv-raw">
        {lines.map((ln, i) => {
          const lineMatches = byLine.get(i);
          let content: React.ReactNode;
          if (lineMatches) {
            const pieces = tokens ? (tokens[i] ?? []) : [{ text: ln }];
            content = findLineNodes(pieces, lineMatches, active);
          } else if (tokens) {
            content = tokens[i]?.length
              ? tokens[i].map((tok, j) => <span key={j} className={tok.cls}>{tok.text}</span>)
              : "​";
          } else {
            content = ln || "​";
          }
          return <div key={i} className="jv-line">{content}</div>;
        })}
      </pre>
    </div>
  );
}

type Mode = "pretty" | "raw" | "preview";

export function JsonView({ body, contentType, status, reason, label = "RESPONSE BODY", view, pretty, size }:
  { body: string | null; contentType?: string; status?: number; reason?: string;
    label?: string; view?: string | null; pretty?: string | null; size?: number }) {
  const [mode, setMode] = useState<Mode>("pretty");
  const [collapseSignal, setCollapseSignal] = useState(0);
  const parsed = parse(body);
  const ct = (contentType ?? "").toLowerCase();
  const isJson = parsed.ok && (ct.includes("json") || ct === "");
  const isMarkup = ct.includes("html") || ct.includes("xml");
  const canPreview = ct.includes("html") && body != null;
  const isError = status != null && status >= 400;
  const effMode: Mode = mode === "preview" && !canPreview ? "pretty" : mode;
  const prettyJson = isJson ? JSON.stringify(parsed.value, null, 2) : "";
  const hasDecodedView = !!(view && pretty);
  const binaryPlaceholder = body == null && size != null && size > 0
    ? `binary body, ${size} bytes` : null;

  return (
    <div className="jsonview">
      <div className="jv-toolbar">
        <span className="jv-label">{label}</span>
        {contentType && <span className="jv-ct">{contentType.split(";")[0]}</span>}
        {view && <span className="jv-ct jv-view-badge">{view}</span>}
        <span className="jv-tbspace" />
        <div className="seg">
          <button className={"seg-item" + (effMode === "pretty" ? " active" : "")} onClick={() => setMode("pretty")}>Pretty</button>
          <button className={"seg-item" + (effMode === "raw" ? " active" : "")} onClick={() => setMode("raw")}>Raw</button>
          {canPreview && <button className={"seg-item" + (effMode === "preview" ? " active" : "")} onClick={() => setMode("preview")}>Preview</button>}
        </div>
        {isJson && effMode === "pretty" && <button className="chip" onClick={() => setCollapseSignal((s) => s + 1)}>Collapse all</button>}
        <button className="chip" onClick={() => body && navigator.clipboard.writeText(body)}>Copy</button>
      </div>
      {isError && <div className="jv-errbanner">⚠ {status} {reason || "Error response"}</div>}
      {hasDecodedView && effMode !== "raw" ? (
        <RawLines text={pretty as string} />
      ) : body == null ? (
        effMode === "raw" && binaryPlaceholder ? (
          <pre className="jv-raw jv-empty">{binaryPlaceholder}</pre>
        ) : (
          <pre className="jv-raw jv-empty">(no body)</pre>
        )
      ) : effMode === "preview" ? (
        <iframe className="jv-preview" sandbox="" srcDoc={body} title="Response preview" />
      ) : isJson && effMode === "pretty" ? (
        <div className="jv-tree"><Node value={parsed.value} depth={0} collapseSignal={collapseSignal} /></div>
      ) : (
        <RawLines text={isJson ? prettyJson : body} lang={isMarkup ? "markup" : undefined} />
      )}
    </div>
  );
}
