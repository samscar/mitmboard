import type { FlowDetail, FlowMeta } from "../types";

/** Charles' Chart tab: a timeline waterfall, not a phase-by-phase bar list.
 *
 *  Each row is one request on a shared clock, split into the three phases
 *  Charles colours: Request (upload), Latency (waiting for the server) and
 *  Response (download). Rows that only have a `FlowMeta` (a whole host or
 *  folder, where no per-phase timing was fetched) draw a single neutral bar
 *  spanning the measured duration instead of inventing a split. */

export interface WaterfallEntry {
  id: string;
  label: string;
  start: number;
  duration: number;
  segments: { request: number; latency: number; response: number } | null;
  error: boolean;
}

const clamp = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

function segmentsFromTiming(detail: FlowDetail): WaterfallEntry["segments"] {
  const t = detail.timing;
  if (t.req_done == null || t.resp_start == null) return null;
  const request = clamp(t.req_done - t.start);
  const latency = clamp(t.resp_start - t.req_done);
  const response = t.resp_done != null ? clamp(t.resp_done - t.resp_start) : 0;
  if (request + latency + response === 0) return null;
  return { request, latency, response };
}

export function entryFromDetail(detail: FlowDetail): WaterfallEntry {
  const dur = detail.timing.duration_ms ?? detail.duration_ms ?? 0;
  return {
    id: detail.id,
    label: detail.path || "/",
    start: detail.timing.start,
    duration: dur,
    segments: segmentsFromTiming(detail),
    error: detail.state === "error" || (detail.response?.status ?? 0) >= 500,
  };
}

export function entriesFromFlows(flows: FlowMeta[]): WaterfallEntry[] {
  return flows.map((f) => ({
    id: f.id,
    label: f.path || "/",
    start: f.timestamp,
    duration: f.duration_ms ?? 0,
    segments: null,
    error: f.state === "error" || (f.response?.status ?? 0) >= 500,
  }));
}

export function Waterfall({ entries, onSelect }: {
  entries: WaterfallEntry[];
  onSelect?: (id: string) => void;
}) {
  if (entries.length === 0) return <div className="empty">No timing data</div>;
  const t0 = Math.min(...entries.map((e) => e.start));
  const tEnd = Math.max(...entries.map((e) => e.start + Math.max(e.duration, 1)));
  const span = Math.max(tEnd - t0, 1);
  const hasSegments = entries.some((e) => e.segments);

  return (
    <div className="waterfall">
      <div className="wf-head">
        <span className="wf-head-label">Timeline · {(span / 1000).toFixed(2)} s</span>
        {hasSegments && (
          <span className="wf-legend">
            <span className="wf-key wf-req">Request</span>
            <span className="wf-key wf-lat">Latency</span>
            <span className="wf-key wf-resp">Response</span>
          </span>
        )}
      </div>
      {entries.map((e) => {
        const left = ((e.start - t0) / span) * 100;
        const width = Math.max((Math.max(e.duration, 1) / span) * 100, 0.6);
        return (
          <div key={e.id} className={"wf-row" + (onSelect ? " clickable" : "")}
               onClick={onSelect ? () => onSelect(e.id) : undefined}>
            <span className="wf-label" title={e.label}>{e.label}</span>
            <span className="wf-track">
              <span className={"wf-bar" + (e.error ? " is-error" : "")}
                    style={{ left: `${left}%`, width: `${width}%` }}>
                {e.segments && (
                  <>
                    <span className="wf-seg wf-req" style={{ flexGrow: e.segments.request }} />
                    <span className="wf-seg wf-lat" style={{ flexGrow: e.segments.latency }} />
                    <span className="wf-seg wf-resp" style={{ flexGrow: e.segments.response }} />
                  </>
                )}
              </span>
            </span>
            <span className="wf-ms">{e.duration ? `${Math.round(e.duration)} ms` : "—"}</span>
          </div>
        );
      })}
    </div>
  );
}
