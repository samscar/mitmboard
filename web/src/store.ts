import { create } from "zustand";
import type { FlowMeta, FlowDetail, WsMessage, Breakpoints, PausedEntry, MapLocal, SSLProxying } from "./types";
import { parseQuery } from "./filters/dsl";

export type ListMode = "sequence" | "structure";

const DETAIL_WIDTH_KEY = "mitmboard.detailWidth";
const LIST_MODE_KEY = "mitmboard.listMode";
// Charles gives the detail side roughly half the window and lets you drag it
// most of the way across; the old 60% cap is what stopped the pane from
// moving further left.
const DETAIL_MIN = 320;
// Charles opens with the detail pane taking about 60% of the window; widths
// saved below that floor come from the older layouts, not from a drag.
const DETAIL_LEGACY_FLOOR = 560;

function loadListMode(): ListMode {
  try {
    // Charles opens on Structure; the default follows.
    return localStorage.getItem(LIST_MODE_KEY) === "sequence" ? "sequence" : "structure";
  } catch {
    return "structure";
  }
}

const detailDefault = () => Math.max(DETAIL_LEGACY_FLOOR, Math.round(window.innerWidth * 0.62));

function clampDetailWidth(n: number): number {
  const max = Math.max(DETAIL_MIN, Math.round(window.innerWidth * 0.8));
  return Math.min(Math.max(n, DETAIL_MIN), max);
}

function loadDetailWidth(): number {
  try {
    const raw = localStorage.getItem(DETAIL_WIDTH_KEY);
    if (raw == null) return detailDefault();
    const n = Number(raw);
    if (!Number.isFinite(n)) return detailDefault();
    // A width saved under the old layout can sit below the new default;
    // treat it as legacy rather than re-serving the cramped split.
    if (n < DETAIL_LEGACY_FLOOR) return detailDefault();
    return clampDetailWidth(n);
  } catch {
    return detailDefault();
  }
}

interface State {
  flows: Map<string, FlowMeta>;
  order: string[];
  selectedId: string | null;
  detail: FlowDetail | null;
  query: string;
  selectedNode: string | null;
  focus: string[];
  focusFilterOn: boolean;
  listMode: ListMode;
  sslproxying: SSLProxying;
  detailWidth: number;
  wsMessages: Record<string, WsMessage[]>;
  breakpoints: Breakpoints;
  paused: Record<string, PausedEntry>;
  maplocal: MapLocal;
  setListMode: (m: ListMode) => void;
  upsertFlow: (f: FlowMeta) => void;
  setQuery: (q: string) => void;
  select: (id: string | null, detail?: FlowDetail | null) => void;
  selectNode: (key: string | null) => void;
  clearSelection: () => void;
  setFocus: (hosts: string[]) => void;
  toggleFocus: (host: string) => void;
  setFocusFilter: (on: boolean) => void;
  setSslproxying: (s: SSLProxying) => void;
  setDetailWidth: (n: number) => void;
  appendWsMessage: (flowId: string, m: WsMessage) => void;
  setWsMessages: (flowId: string, msgs: WsMessage[]) => void;
  mergeWsMessages: (flowId: string, msgs: WsMessage[]) => void;
  setBreakpoints: (b: Breakpoints) => void;
  setMaplocal: (m: MapLocal) => void;
  setPaused: (list: PausedEntry[]) => void;
  addPaused: (entry: Omit<PausedEntry, "flow">, flow: FlowDetail) => void;
  removePaused: (flowId: string) => void;
  clear: () => void;
  visibleFlows: () => FlowMeta[];
  allFlows: () => FlowMeta[];
  pausedFlows: () => FlowDetail[];
}

export const useStore = create<State>((set, get) => ({
  flows: new Map(), order: [], selectedId: null, detail: null,
  query: "", listMode: loadListMode(), sslproxying: { enabled: true, exclude: [], revision: "" },
  selectedNode: null, focus: [], focusFilterOn: false,
  detailWidth: loadDetailWidth(),
  wsMessages: {},
  breakpoints: { enabled: false, rules: [] },
  paused: {},
  maplocal: { enabled: true, rules: [] },
  setListMode: (listMode) => {
    try { localStorage.setItem(LIST_MODE_KEY, listMode); } catch { /* ignore */ }
    set({ listMode });
  },
  setSslproxying: (sslproxying) => set({ sslproxying }),
  setDetailWidth: (n) => {
    const detailWidth = clampDetailWidth(n);
    try { localStorage.setItem(DETAIL_WIDTH_KEY, String(detailWidth)); } catch { /* ignore */ }
    set({ detailWidth });
  },
  upsertFlow: (f) => set((s) => {
    const flows = new Map(s.flows);
    const isNew = !flows.has(f.id);
    flows.set(f.id, f);
    let order = s.order;
    if (isNew) { order = [...s.order, f.id]; if (order.length > 5000) order = order.slice(-5000); }
    return { flows, order };
  }),
  setQuery: (query) => set({ query }),
  select: (selectedId, detail = null) => set({ selectedId, detail, selectedNode: null }),
  selectNode: (key) => set({ selectedId: null, detail: null, selectedNode: key }),
  clearSelection: () => set({ selectedId: null, detail: null, selectedNode: null }),
  setFocus: (focus) => set({ focus }),
  toggleFocus: (host) => set((s) => ({
    focus: s.focus.includes(host) ? s.focus.filter((h) => h !== host) : [...s.focus, host],
  })),
  setFocusFilter: (focusFilterOn) => set({ focusFilterOn }),
  appendWsMessage: (flowId, m) => set((s) => {
    const cur = s.wsMessages[flowId] ?? [];
    const next = cur.length >= 500 ? [...cur.slice(cur.length - 499), m] : [...cur, m];
    return { wsMessages: { ...s.wsMessages, [flowId]: next } };
  }),
  setWsMessages: (flowId, msgs) => set((s) => ({ wsMessages: { ...s.wsMessages, [flowId]: msgs.slice(-500) } })),
  mergeWsMessages: (flowId, msgs) => set((s) => {
    const byI = new Map<number, WsMessage>();
    for (const m of s.wsMessages[flowId] ?? []) byI.set(m.i, m);
    for (const m of msgs) byI.set(m.i, m);
    const next = Array.from(byI.values()).sort((a, b) => a.i - b.i).slice(-500);
    return { wsMessages: { ...s.wsMessages, [flowId]: next } };
  }),
  setBreakpoints: (breakpoints) => set({ breakpoints }),
  setMaplocal: (maplocal) => set({ maplocal }),
  setPaused: (list) => set({ paused: Object.fromEntries(list.map((e) => [e.flow_id, e])) }),
  addPaused: (entry, flow) => set((s) => ({ paused: { ...s.paused, [entry.flow_id]: { ...entry, flow } } })),
  removePaused: (flowId) => set((s) => {
    if (!(flowId in s.paused)) return s;
    const paused = { ...s.paused };
    delete paused[flowId];
    return { paused };
  }),
  // Clearing the session wipes traffic and selection, but the filter query
  // survives: Charles keeps the filter text across session clears, and losing
  // it makes the post-clear tree look broken. Only the user edits the filter.
  clear: () => set({ flows: new Map(), order: [], selectedId: null, detail: null, wsMessages: {},
                     selectedNode: null, focus: [], focusFilterOn: false }),
  visibleFlows: () => {
    const s = get();
    const pred = parseQuery(s.query);
    // Focus is a second, independent filter: in Sequence view it only bites
    // when the Focused toggle is on, and it intersects with the query rather
    // than replacing it.
    const focusOn = s.listMode === "sequence" && s.focusFilterOn && s.focus.length > 0;
    const out: FlowMeta[] = [];
    for (let i = s.order.length - 1; i >= 0; i--) {
      const f = s.flows.get(s.order[i])!;
      if (focusOn && !s.focus.includes(f.host)) continue;
      if (pred(f)) out.push(f);
    }
    return out;
  },
  allFlows: () => {
    const s = get();
    return s.order.map((id) => s.flows.get(id)!).reverse();
  },
  pausedFlows: () => {
    const s = get();
    return Object.values(s.paused)
      .sort((a, b) => b.since - a.since)
      .map((e) => e.flow);
  },
}));
