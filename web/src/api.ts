import type { FlowMeta, FlowDetail, ClientInfo, WsMessage, Breakpoints, PausedEntry, MapLocal, SSLProxying } from "./types";
const j = async (r: Response) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); };
export const fetchFlows = (): Promise<FlowMeta[]> => fetch("/api/flows").then(j);
export const fetchDetail = (id: string): Promise<FlowDetail> => fetch(`/api/flows/${id}`).then(j);
export const fetchWsMessages = (id: string, after = -1): Promise<{ messages: WsMessage[]; total: number }> =>
  fetch(`/api/flows/${id}/ws?after=${after}`).then(j);
export const clearFlows = () => fetch("/api/flows", { method: "DELETE" }).then(j);
export const fetchClients = (): Promise<ClientInfo[]> => fetch("/api/clients").then(j);
export const setClientLabel = (ip: string, label: string) =>
  fetch(`/api/clients/${ip}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ label }) }).then(j);
export const fetchConnectInfo = () => fetch("/api/connect-info").then(j);
export const loadSession = (flows: unknown) =>
  fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(flows) }).then(j);
export const caInfo = () => fetch("/api/ca-info").then(j);
export const fetchSslProxying = (): Promise<SSLProxying> => fetch("/api/ssl-proxying").then(j);
export const saveSslProxying = (s: SSLProxying): Promise<SSLProxying> =>
  fetch("/api/ssl-proxying", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(s) }).then(j);
export const replay = (id: string) => fetch(`/api/flows/${id}/replay`, { method: "POST" }).then(j);
export interface ReplayEdit { method?: string; url?: string; headers?: [string, string][]; body?: string | null; }
export const replayEdited = (id: string, edits: ReplayEdit) =>
  fetch(`/api/flows/${id}/replay-edited`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(edits) }).then(j);
export const fetchBreakpoints = (): Promise<Breakpoints> => fetch("/api/breakpoints").then(j);
export const saveBreakpoints = (b: Breakpoints): Promise<Breakpoints> =>
  fetch("/api/breakpoints", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(j);
export const fetchPaused = (): Promise<PausedEntry[]> => fetch("/api/paused").then(j);
export const resumePaused = (id: string, edits?: Record<string, unknown>): Promise<{ ok: boolean; modified: boolean }> =>
  fetch(`/api/paused/${id}/resume`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(edits ?? {}) }).then(j);
export const dropPaused = (id: string): Promise<{ ok: boolean }> =>
  fetch(`/api/paused/${id}/drop`, { method: "POST" }).then(j);
export const download = async (path: string, filename: string) => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(String(res.status));
  const blob = await res.blob();
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
};

export const fetchMaplocal = (): Promise<MapLocal> => fetch("/api/maplocal").then(j);
export const saveMaplocal = (m: MapLocal): Promise<MapLocal> =>
  fetch("/api/maplocal", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(m) }).then(j);
/** Upload a local file into the managed directory; the name only supplies the extension. */
export const uploadMaplocalFile = (file: File): Promise<{ path: string; size: number }> =>
  fetch(`/api/maplocal/files?filename=${encodeURIComponent(file.name)}`, { method: "POST", body: file }).then(j);
/** Write a captured response body into the managed directory and return its path. */
export const saveCapturedResponse = (id: string): Promise<{ path: string; size: number }> =>
  fetch(`/api/flows/${id}/maplocal-file`, { method: "POST" }).then(j);
