export type Header = [string, string];
export type FlowState = "pending" | "complete" | "error" | "paused_request" | "paused_response";
export type DeviceKind = "phone" | "tablet" | "laptop" | "desktop" | "unknown";
export interface ClientRef { ip: string; label: string; kind?: DeviceKind; }
export interface ReqMeta { headers: Header[]; size: number; body_view?: string | null; }
export interface RespMeta { status: number; reason: string; headers: Header[]; size: number; content_type: string; body_view?: string | null; }
export interface TimingDetail {
  start: number;
  req_done: number | null;
  resp_start: number | null;
  resp_done: number | null;
  duration_ms: number | null;
  connect_ms: number | null;
  tls_ms: number | null;
  ttfb_ms: number | null;
  download_ms: number | null;
}
export interface WsMessage {
  i: number; t: number; dir: "in" | "out"; type: "text" | "binary"; size: number;
  text: string | null; view: string | null; pretty: string | null;
}
export interface WsSummary {
  messages: number; open: boolean; closed_by: "client" | "server" | null;
  close_code: number | null; close_reason: string | null;
}
export interface FlowMeta {
  id: string; timestamp: number; client: ClientRef;
  method: string; scheme: string; host: string; port: number;
  path: string; query: string; http_version: string;
  server_addr?: string | null; tls_version?: string | null;
  request: ReqMeta; response: RespMeta | null;
  duration_ms: number | null; state: FlowState; error: string | null;
  kind?: "http" | "ws"; ws?: WsSummary | null; modified?: boolean;
  // Set once when a Map Local rule fired. Stays populated after the rule is
  // deleted or disabled: a hit is a fact about this flow, not a live lookup.
  maplocal_rule_id?: string | null;
  maplocal_file?: string | null;
}
export interface FlowDetail extends FlowMeta {
  request: ReqMeta & { body: string | null; body_pretty?: string | null };
  response: (RespMeta & { body: string | null; body_pretty?: string | null }) | null;
  timing: TimingDetail;
}
export interface ClientInfo { ip: string; label: string; count: number; kind?: DeviceKind; }
export interface SSLProxying {
  enabled: boolean;
  /** UI-managed wildcard entries, persisted in config.json. */
  exclude: string[];
  /** Startup ignore_hosts patterns (~/.mitmproxy/config.yaml / --ignore-hosts),
      shown read-only: they are regexes maintained in their own files. */
  base: string[];
}
export interface BreakpointRule {
  id: string; enabled: boolean; host: string; path: string; method: string;
  phase: "request" | "response" | "both";
}
export interface Breakpoints { enabled: boolean; rules: BreakpointRule[]; }
export interface MapLocalRule {
  id: string; enabled: boolean; host: string; path: string; method: string;
  file: string; status: number;
}
export interface MapLocal { enabled: boolean; rules: MapLocalRule[]; }
export interface PausedEntry {
  flow_id: string; phase: "request" | "response"; rule_id: string | null;
  since: number; deadline: number; flow: FlowDetail;
}

export type WSEvent =
  | { type: "flow.new" | "flow.complete" | "flow.error"; flow: FlowMeta }
  | { type: "client.new"; client: ClientInfo }
  | { type: "sslproxying.update"; enabled: boolean; exclude: string[]; base: string[] }
  | { type: "flow.update"; flow: FlowMeta }
  | { type: "ws.message"; flow_id: string; message: WsMessage }
  | { type: "breakpoints.update"; enabled: boolean; rules: BreakpointRule[] }
  | { type: "maplocal.update"; enabled: boolean; rules: MapLocalRule[] }
  | { type: "breakpoint.paused"; entry: Omit<PausedEntry, "flow">; flow: FlowDetail }
  | { type: "breakpoint.resumed"; flow_id: string; modified: boolean }
  | { type: "breakpoint.dropped"; flow_id: string }
  | { type: "breakpoint.timeout"; flow_id: string };
