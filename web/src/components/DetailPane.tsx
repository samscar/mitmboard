import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { useUi, type DetailTab, type RequestView, type ResponseView } from "../uiStore";
import { clockTime } from "../format";
import { bytes } from "../format";
import { RawLines } from "./JsonView";
import { FindBar } from "./FindBar";
import { countMatches } from "../json/highlight";
import { Waterfall, entryFromDetail } from "./Waterfall";
import { WsMessages } from "./WsMessages";
import { PausedEditor } from "./PausedEditor";
import { NodeSummary } from "./NodeSummary";
import { ruleWasDeleted } from "../maplocal";
import type { Header } from "../types";

/** Charles 5.2.2's actual detail layout: Overview / Contents / Summary /
 *  Chart / Notes, with Contents stacking the request above the response, each
 *  side carrying its own row of viewers. Viewer choices live in uiStore rather
 *  than component state because Charles keeps them sticky across selections. */
const REQ_TABS: { id: RequestView; label: string }[] = [
  { id: "headers", label: "Headers" },
  { id: "query", label: "Query String" },
  { id: "cookies", label: "Cookies" },
  { id: "text", label: "Text" },
  { id: "json", label: "JSON" },
  { id: "raw", label: "Raw" },
];

const RESP_TABS: { id: ResponseView; label: string }[] = [
  { id: "headers", label: "Headers" },
  { id: "text", label: "Text" },
  { id: "json", label: "JSON" },
  { id: "raw", label: "Raw" },
];

const TAB_LABEL: Record<DetailTab, string> = {
  overview: "Overview",
  contents: "Contents",
  websocket: "WebSocket",
  summary: "Summary",
  chart: "Chart",
  notes: "Notes",
};

const BASE_TABS: DetailTab[] = ["overview", "contents", "summary", "chart", "notes"];

function wsFramesLine(ws: NonNullable<import("../types").FlowMeta["ws"]>): string {
  if (ws.open) return `${ws.messages} · open`;
  if (ws.closed_by) return `${ws.messages} · closed by ${ws.closed_by}${ws.close_code != null ? ` (${ws.close_code})` : ""}`;
  return `${ws.messages}`;
}

/** Headers read "name: value"; query and cookie rows read as two columns. */
function RowList({ rows, empty, colon = false }: { rows: [string, string][]; empty: string; colon?: boolean }) {
  if (rows.length === 0) return <div className="empty">{empty}</div>;
  return (
    <div className="hlist">
      {rows.map(([k, v], i) => (
        <div key={i} className="hrow">
          <span className="hkey">{k}</span>{colon ? ": " : null}<span className="hval">{v}</span>
        </div>
      ))}
    </div>
  );
}

function queryRows(query: string): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of new URLSearchParams(query)) out.push([k, v]);
  return out;
}

function cookieRows(header: string | undefined): [string, string][] {
  if (!header) return [];
  return header.split(";").map((part) => {
    const [k, ...rest] = part.split("=");
    return [k.trim(), rest.join("=").trim()] as [string, string];
  }).filter(([k]) => k.length > 0);
}

/** Wire size of a header block: `name: value\r\n` per row plus the final CRLF. */
function headerBytes(headers: Header[]): number {
  return headers.reduce((n, [k, v]) => n + k.length + v.length + 4, 2);
}

/** The text a body viewer actually renders: the JSON viewer pretty-prints
 *  first, so find offsets must be computed against the same string. */
function viewerText(body: string | null, viewer: string): string | null {
  if (body == null) return null;
  if (viewer === "json") {
    try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
  }
  return body;
}

function BodyText({ body, size, view, find }: { body: string | null; size: number; view?: string | null;
  find?: { query: string; active: number } }) {
  if (body == null) return <pre className="jv-raw jv-empty">{size > 0 ? `binary body, ${size} bytes` : "(no body)"}</pre>;
  return (
    <div className="pane-body-scroll">
      {view && <div className="pane-view-badge">decoded: {view}</div>}
      <RawLines text={body} find={find} />
    </div>
  );
}

function JsonBody({ body, size, find }: { body: string | null; size: number;
  find?: { query: string; active: number } }) {
  if (body == null) return <pre className="jv-raw jv-empty">{size > 0 ? `binary body, ${size} bytes` : "(no body)"}</pre>;
  try {
    return <div className="pane-body-scroll"><RawLines text={JSON.stringify(JSON.parse(body), null, 2)} lang="json" find={find} /></div>;
  } catch {
    // Charles shows the body as-is rather than a "not JSON" verdict.
    return <div className="pane-body-scroll"><RawLines text={body} find={find} /></div>;
  }
}

export function DetailPane({ width }: { width?: number } = {}) {
  const detail = useStore((s) => s.detail);
  const selectedNode = useStore((s) => s.selectedNode);
  // The detail body/headers/etc. come from the one-shot fetch at selection
  // time, but the ws summary (open/messages/closed_by) keeps changing while
  // a socket is live -- pull it from the live flow map so the Overview line
  // and the WebSocket tab's reachability track flow.update events instead of
  // freezing at whatever `detail` looked like when the row was selected.
  const liveMeta = useStore((s) => (s.selectedId ? s.flows.get(s.selectedId) : undefined));
  const meta = liveMeta ?? detail ?? undefined;
  const isWs = meta?.kind === "ws";
  const ws = meta?.ws;
  const tab = useUi((s) => s.detailTab);
  const setTab = useUi((s) => s.setDetailTab);
  // Viewer choices persist across selections, the way Charles keeps
  // "Contents + Headers" sticky while you walk the tree.
  const reqTab = useUi((s) => s.reqView);
  const setReqTab = useUi((s) => s.setReqView);
  const respTab = useUi((s) => s.respView);
  const setRespTab = useUi((s) => s.setRespView);
  const maplocal = useStore((s) => s.maplocal);
  const pausedEntry = useStore((s) => (detail ? s.paused[detail.id] : undefined));
  // Repeat / Edit & Resend / Map Local / Copy as cURL all live in the row's
  // context menu, so a second copy of the buttons here only added noise.
  // Hooks live above the early returns below -- their count must not depend
  // on whether a flow is selected.
  const splitRef = useRef<HTMLDivElement>(null);
  const reqShare = useUi((s) => s.reqShare);
  const setReqShare = useUi((s) => s.setReqShare);
  const drag = useRef<{ startY: number; startShare: number; rect: DOMRect } | null>(null);
  const onDividerMouseDown = (e: React.MouseEvent) => {
    const rect = splitRef.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { startY: e.clientY, startShare: useUi.getState().reqShare, rect };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      if (!drag.current) return;
      const d = (ev.clientY - drag.current.startY) / drag.current.rect.height;
      setReqShare(drag.current.startShare + d);
    };
    const onUp = () => {
      drag.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const style = width != null ? { width } : undefined;

  // Per-side find bar state. The query lives in uiStore (survives flow and
  // viewer switches); the active match ordinal is local and resets whenever
  // the query or the rendered text changes.
  const findReqOpen = useUi((s) => s.findReqOpen);
  const findRespOpen = useUi((s) => s.findRespOpen);
  const reqQuery = useUi((s) => s.findReq);
  const respQuery = useUi((s) => s.findResp);
  const [reqActive, setReqActive] = useState(0);
  const [respActive, setRespActive] = useState(0);
  const reqText = viewerText(detail?.request.body ?? null, reqTab);
  const respText = viewerText(detail?.response?.body ?? null, respTab);
  const reqCount = countMatches(reqText ?? "", reqQuery);
  const respCount = countMatches(respText ?? "", respQuery);
  useEffect(() => { setReqActive(0); }, [reqText, reqQuery]);
  useEffect(() => { setRespActive(0); }, [respText, respQuery]);

  if (pausedEntry) return <div className="detail" style={style}><PausedEditor key={pausedEntry.flow_id} entry={pausedEntry} /></div>;
  if (selectedNode) return <div className="detail" style={style}><NodeSummary nodeKey={selectedNode} /></div>;
  if (!detail) return <div className="detail empty" style={style}>Select a request</div>;
  const r = detail.response;
  const tabs: DetailTab[] = isWs
    ? ["overview", "contents", "websocket", "summary", "chart", "notes"]
    : BASE_TABS;
  const deleted = ruleWasDeleted(maplocal, detail.maplocal_rule_id);
  const requestCookie = detail.request.headers.find(([k]) => k.toLowerCase() === "cookie")?.[1];
  const url = `${detail.scheme}://${detail.host}${detail.path}`;
  const headerTotal = headerBytes(detail.request.headers) + headerBytes(r?.headers ?? []);
  const bodyTotal = (r?.size ?? 0) + detail.request.size;

  const viewerBar = (items: { id: string; label: string }[], active: string, pick: (id: string) => void, title: string,
                     extra?: React.ReactNode) => (
    <div className="pane-head">
      <span className="pane-title">{title}</span>
      <div className="seg">
        {items.map((t) => (
          <button key={t.id} className={"seg-item" + (active === t.id ? " active" : "")} onClick={() => pick(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {extra}
    </div>
  );

  /** Magnifier toggle at the right end of a body viewer's head; the find bar
   *  itself only exists for body viewers (Headers/Query/Cookies get none). */
  const findToggle = (open: boolean, setOpen: (b: boolean) => void, label: string) => (
    <button
      className={"chip find-toggle" + (open ? " active" : "")}
      aria-label={label}
      aria-pressed={open}
      title="Find in body"
      onClick={() => setOpen(!open)}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.8-3.8" />
      </svg>
    </button>
  );

  const isBodyView = (v: string) => v === "text" || v === "json" || v === "raw";
  const reqFind = findReqOpen && isBodyView(reqTab) ? { query: reqQuery, active: reqActive } : undefined;
  const respFind = findRespOpen && isBodyView(respTab) ? { query: respQuery, active: respActive } : undefined;

  return (
    <div className="detail" style={style}>
      {/* Charles shows the request as one line: method, URL, then the outcome. */}
      <div className="detail-title">
        <span className={"m-badge m-" + detail.method}>{detail.method}</span>
        <span className="detail-title-url" title={url}>{url}</span>
        <span className="detail-title-arrow">→</span>
        {r ? (
          <span className={"s-badge s-" + (r.status >= 500 ? 5 : r.status >= 400 ? 4 : r.status >= 300 ? 3 : 2)}>
            {r.status}
          </span>
        ) : <span className="s-badge">{detail.state}</span>}
      </div>
      <div className="detail-tabs">
        {tabs.map((t) => (
          <button key={t} className={"tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="general">
          <div className="gen-head">GENERAL</div>
          <div className="gen-row"><span className="gk">Device</span><span className="gv">{detail.client.label} · {detail.client.ip}</span></div>
          <div className="gen-row"><span className="gk">Remote</span><span className="gv mono">{detail.server_addr ?? `${detail.host}:${detail.port}`}</span></div>
          <div className="gen-row"><span className="gk">Protocol</span><span className="gv mono">{detail.http_version || "—"}{detail.tls_version ? ` · ${detail.tls_version}` : ""}</span></div>
          <div className="gen-row"><span className="gk">Status</span><span className="gv">{r ? `${r.status} ${r.reason}` : detail.state}</span></div>
          <div className="gen-row"><span className="gk">Started</span><span className="gv mono">{clockTime(detail.timestamp)}</span></div>
          <div className="gen-row"><span className="gk">Duration</span><span className="gv mono">{detail.duration_ms != null ? `${detail.duration_ms} ms` : "—"}</span></div>
          <div className="gen-row"><span className="gk">Size</span><span className="gv mono">{bytes(bodyTotal)}</span></div>
          {isWs && ws && (
            <div className="gen-row"><span className="gk">Frames</span><span className="gv mono">{wsFramesLine(ws)}</span></div>
          )}
        </div>
      )}

      {tab === "contents" && (
        // Charles stacks the request above the response so both are visible
        // at once, each with its own viewer row; the boundary drags.
        <div className="contents-split" ref={splitRef}>
          <section className="contents-pane" aria-label="Request contents"
                   style={{ height: `${reqShare * 100}%`, flex: "0 0 auto", minHeight: 72 }}>
            {viewerBar(REQ_TABS, reqTab, (id) => setReqTab(id as RequestView), "REQUEST",
              isBodyView(reqTab) ? findToggle(findReqOpen, useUi.getState().setFindReqOpen, "Find in request body") : null)}
            <div className="pane-body">
              {reqTab === "headers" && <RowList rows={detail.request.headers} colon empty="Request has no headers" />}
              {reqTab === "query" && <RowList rows={queryRows(detail.query)} empty="No query parameters" />}
              {reqTab === "cookies" && <RowList rows={cookieRows(requestCookie)} empty="No request cookies" />}
              {reqTab === "text" && <BodyText body={detail.request.body} size={detail.request.size} view={detail.request.body_view} find={reqFind} />}
              {reqTab === "json" && <JsonBody body={detail.request.body} size={detail.request.size} find={reqFind} />}
              {reqTab === "raw" && <BodyText body={detail.request.body} size={detail.request.size} find={reqFind} />}
            </div>
            {findReqOpen && isBodyView(reqTab) && (
              <FindBar
                query={reqQuery}
                count={reqCount}
                active={reqActive}
                onQuery={useUi.getState().setFindReq}
                onNext={() => reqCount > 0 && setReqActive((a) => (a + 1) % reqCount)}
                onPrev={() => reqCount > 0 && setReqActive((a) => (a - 1 + reqCount) % reqCount)}
                onClose={() => useUi.getState().setFindReqOpen(false)}
              />
            )}
          </section>

          <div className="contents-divider is-handle" role="separator" aria-orientation="horizontal"
               aria-label="Resize response pane" title="Drag to resize"
               onMouseDown={onDividerMouseDown} />

          <section className="contents-pane" aria-label="Response contents">
            {viewerBar(RESP_TABS, respTab, (id) => setRespTab(id as ResponseView), "RESPONSE",
              isBodyView(respTab) ? findToggle(findRespOpen, useUi.getState().setFindRespOpen, "Find in response body") : null)}
            <div className="pane-body">
              {respTab === "headers" && <RowList rows={r?.headers ?? []} colon empty="Response has no headers" />}
              {respTab === "text" && <BodyText body={r?.body ?? null} size={r?.size ?? 0} view={r?.body_view} find={respFind} />}
              {respTab === "json" && <JsonBody body={r?.body ?? null} size={r?.size ?? 0} find={respFind} />}
              {respTab === "raw" && <BodyText body={r?.body ?? null} size={r?.size ?? 0} find={respFind} />}
            </div>
            {findRespOpen && isBodyView(respTab) && (
              <FindBar
                query={respQuery}
                count={respCount}
                active={respActive}
                onQuery={useUi.getState().setFindResp}
                onNext={() => respCount > 0 && setRespActive((a) => (a + 1) % respCount)}
                onPrev={() => respCount > 0 && setRespActive((a) => (a - 1 + respCount) % respCount)}
                onClose={() => useUi.getState().setFindRespOpen(false)}
              />
            )}
          </section>
        </div>
      )}

      {tab === "summary" && (
        <div className="sum-wrap">
          <table className="sum-table">
            <thead>
              <tr>
                <th>#</th><th>Resource</th><th>Host</th><th>Code</th>
                <th>Mime Type</th><th className="num">Header</th><th className="num">Body</th><th className="num">Time</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td className="path" title={detail.path}>{detail.path || "/"}</td>
                <td>{detail.host}</td>
                <td>{r?.status ?? "—"}</td>
                <td>{r?.content_type?.split(";")[0] ?? "—"}</td>
                <td className="num">{bytes(headerTotal)}</td>
                <td className="num">{bytes(bodyTotal)}</td>
                <td className="num">{detail.duration_ms != null ? `${detail.duration_ms} ms` : "—"}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>Total</td>
                <td className="num">{bytes(headerTotal)}</td>
                <td className="num">{bytes(bodyTotal)}</td>
                <td className="num">{detail.duration_ms != null ? `${detail.duration_ms} ms` : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {tab === "chart" && (
        <div className="chart-wrap">
          <Waterfall entries={[entryFromDetail(detail)]} />
        </div>
      )}

      {tab === "websocket" && <WsMessages key={detail.id} flowId={detail.id} />}
      {tab === "notes" && (
        <div className="notes">
          {detail.maplocal_file ? (
            <div className="note">
              <span className="note-key">Map Local</span>
              <span className="note-val mono">
                Mapped to local file: {detail.maplocal_file}{deleted ? " (rule deleted)" : ""}
              </span>
            </div>
          ) : (
            <div className="empty">No notes for this request</div>
          )}
        </div>
      )}
    </div>
  );
}
