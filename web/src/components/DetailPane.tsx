import { useEffect, useState } from "react";
import { useStore } from "../store";
import { toCurl } from "../curl";
import { replay } from "../api";
import { clockTime } from "../format";
import { bytes } from "../format";
import { RawLines } from "./JsonView";
import { Timing } from "./Timing";
import { ReplayModal } from "./ReplayModal";
import { WsMessages } from "./WsMessages";
import { PausedEditor } from "./PausedEditor";
import { MapLocalDialog } from "./MapLocalDialog";
import { NodeSummary } from "./NodeSummary";
import { draftRuleForFlow, replaceRule, ruleFor, ruleWasDeleted, saveRuleFirst, setRuleEnabled } from "../maplocal";
import type { MapLocalRule } from "../types";

type Tab = "overview" | "contents" | "summary" | "messages" | "notes";
type ReqTab = "headers" | "query" | "cookies" | "text" | "json" | "raw";
type RespTab = "headers" | "text" | "json" | "raw";

const REQ_TABS: ReqTab[] = ["headers", "query", "cookies", "text", "json", "raw"];
const RESP_TABS: RespTab[] = ["headers", "text", "json", "raw"];

const label = (t: string) => t[0].toUpperCase() + t.slice(1);

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

function BodyText({ body, size, view }: { body: string | null; size: number; view?: string | null }) {
  if (body == null) return <pre className="jv-raw jv-empty">{size > 0 ? `binary body, ${size} bytes` : "(no body)"}</pre>;
  return (
    <div className="pane-body-scroll">
      {view && <div className="pane-view-badge">decoded: {view}</div>}
      <RawLines text={body} />
    </div>
  );
}

function JsonBody({ body, size }: { body: string | null; size: number }) {
  if (body == null) return <pre className="jv-raw jv-empty">{size > 0 ? `binary body, ${size} bytes` : "(no body)"}</pre>;
  try {
    return <div className="pane-body-scroll"><RawLines text={JSON.stringify(JSON.parse(body), null, 2)} /></div>;
  } catch {
    return <div className="empty">Body is not JSON</div>;
  }
}

export function DetailPane({ width }: { width?: number } = {}) {
  const detail = useStore((s) => s.detail);
  const selectedNode = useStore((s) => s.selectedNode);
  // The detail body/headers/etc. come from the one-shot fetch at selection
  // time, but the ws summary (open/messages/closed_by) keeps changing while
  // a socket is live -- pull it from the live flow map so the Overview line
  // and the Messages tab's reachability track flow.update events instead of
  // freezing at whatever `detail` looked like when the row was selected.
  const liveMeta = useStore((s) => (s.selectedId ? s.flows.get(s.selectedId) : undefined));
  const meta = liveMeta ?? detail ?? undefined;
  const isWs = meta?.kind === "ws";
  const ws = meta?.ws;
  const [tab, setTab] = useState<Tab>("overview");
  const [reqTab, setReqTab] = useState<ReqTab>("headers");
  const [respTab, setRespTab] = useState<RespTab>("headers");
  const [replayOpen, setReplayOpen] = useState(false);
  const [mlDialog, setMlDialog] = useState<MapLocalRule | null>(null);
  const maplocal = useStore((s) => s.maplocal);
  const setMaplocal = useStore((s) => s.setMaplocal);
  useEffect(() => {
    setTab("overview");
    setReqTab("headers");
    setRespTab("headers");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id]);
  const pausedEntry = useStore((s) => (detail ? s.paused[detail.id] : undefined));
  const style = width != null ? { width } : undefined;

  if (pausedEntry) return <div className="detail" style={style}><PausedEditor key={pausedEntry.flow_id} entry={pausedEntry} /></div>;
  if (selectedNode) return <div className="detail" style={style}><NodeSummary nodeKey={selectedNode} /></div>;
  if (!detail) return <div className="detail empty" style={style}>Select a request</div>;
  const r = detail.response;
  const tabs: Tab[] = isWs
    ? ["overview", "contents", "summary", "messages", "notes"]
    : ["overview", "contents", "summary", "notes"];
  const deleted = ruleWasDeleted(maplocal, detail.maplocal_rule_id);
  const hitRule = ruleFor(maplocal, detail.maplocal_rule_id);
  const requestCookie = detail.request.headers.find(([k]) => k.toLowerCase() === "cookie")?.[1];
  const setCookie = r?.headers.filter(([k]) => k.toLowerCase() === "set-cookie").map(([, v]) => v).join("\n");

  return (
    <div className="detail" style={style}>
      {/* Charles shows the request as one line: method, URL, then the outcome. */}
      <div className="detail-title">
        <span className={"m-badge m-" + detail.method}>{detail.method}</span>
        <span className="detail-title-url" title={`${detail.scheme}://${detail.host}${detail.path}`}>
          {detail.scheme}://{detail.host}{detail.path}
        </span>
        <span className="detail-title-arrow">→</span>
        {r ? (
          <span className={"s-badge s-" + (r.status >= 500 ? 5 : r.status >= 400 ? 4 : r.status >= 300 ? 3 : 2)}>
            {r.status}
          </span>
        ) : <span className="s-badge">{detail.state}</span>}
      </div>
      <div className="detail-actions">
        {!isWs && (
          <button className="chip primary" onClick={() => replay(detail.id).catch(() => {})}>
            <span className="play-ico">▶</span> Replay
          </button>
        )}
        {!isWs && <button className="chip" onClick={() => setReplayOpen(true)}>Edit &amp; Resend</button>}
        {!isWs && !hitRule && (
          <button className="chip" onClick={() => setMlDialog(draftRuleForFlow(detail))}>Map Local…</button>
        )}
        {!isWs && hitRule && (
          <>
            <button className="chip" onClick={() => setMlDialog(hitRule)}>Edit Map Local rule…</button>
            <button className="chip" onClick={() => {
              setRuleEnabled(maplocal, hitRule.id, false).then(setMaplocal).catch(() => {});
            }}>Disable this rule</button>
          </>
        )}
        <button className="chip" onClick={() => navigator.clipboard.writeText(toCurl(detail))}>Copy as cURL</button>
      </div>
      {replayOpen && <ReplayModal detail={detail} onClose={() => setReplayOpen(false)} />}
      {mlDialog && (
        <MapLocalDialog
          initial={mlDialog} flowId={detail.id}
          onSave={async (rule) => {
            // A mapped request edits its rule in place; only an unmapped one
            // creates a rule at the front of the list.
            setMaplocal(await (hitRule ? replaceRule(maplocal, rule) : saveRuleFirst(maplocal, rule)));
            setMlDialog(null);
          }}
          onClose={() => setMlDialog(null)}
        />
      )}
      <div className="detail-tabs">
        {tabs.map((t) => (
          <button key={t} className={"tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
            {label(t)}
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
          <div className="gen-row"><span className="gk">Size</span><span className="gv mono">{bytes((r?.size ?? 0) + detail.request.size)}</span></div>
          {isWs && ws && (
            <div className="gen-row"><span className="gk">Frames</span><span className="gv mono">{wsFramesLine(ws)}</span></div>
          )}
        </div>
      )}

      {tab === "contents" && (
        <div className="contents-split">
          <section className="contents-pane" aria-label="Request contents">
            <div className="pane-head">
              <span className="pane-title">REQUEST</span>
              <div className="seg">
                {REQ_TABS.map((t) => (
                  <button key={t} className={"seg-item" + (reqTab === t ? " active" : "")} onClick={() => setReqTab(t)}>
                    {label(t)}
                  </button>
                ))}
              </div>
            </div>
            <div className="pane-body">
              {reqTab === "headers" && <RowList rows={detail.request.headers} colon empty="Request has no headers" />}
              {reqTab === "query" && <RowList rows={queryRows(detail.query)} empty="No query parameters" />}
              {reqTab === "cookies" && <RowList rows={cookieRows(requestCookie)} empty="No request cookies" />}
              {reqTab === "text" && <BodyText body={detail.request.body} size={detail.request.size} view={detail.request.body_view} />}
              {reqTab === "json" && <JsonBody body={detail.request.body} size={detail.request.size} />}
              {reqTab === "raw" && <BodyText body={detail.request.body} size={detail.request.size} />}
            </div>
          </section>

          <div className="contents-divider" />

          <section className="contents-pane" aria-label="Response contents">
            <div className="pane-head">
              <span className="pane-title">RESPONSE</span>
              <div className="seg">
                {RESP_TABS.map((t) => (
                  <button key={t} className={"seg-item" + (respTab === t ? " active" : "")} onClick={() => setRespTab(t)}>
                    {label(t)}
                  </button>
                ))}
              </div>
            </div>
            <div className="pane-body">
              {respTab === "headers" && <RowList rows={r?.headers ?? []} colon empty="Response has no headers" />}
              {respTab === "text" && <BodyText body={r?.body ?? null} size={r?.size ?? 0} view={r?.body_view} />}
              {respTab === "json" && <JsonBody body={r?.body ?? null} size={r?.size ?? 0} />}
              {respTab === "raw" && <BodyText body={r?.body ?? null} size={r?.size ?? 0} />}
            </div>
          </section>
        </div>
      )}

      {tab === "summary" && <Timing timing={detail.timing} />}
      {tab === "messages" && <WsMessages key={detail.id} flowId={detail.id} />}
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
