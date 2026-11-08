import { create } from "zustand";

/** Dialog visibility and the detail-pane tab selection.
 *
 *  Charles pairs every dialog with a menu command, so the same dialog has to
 *  open from the menubar, from the toolbar and from the status bar. Keeping
 *  these in one store avoids threading callbacks through all three, and it is
 *  deliberately separate from `store.ts`: that one holds captured traffic,
 *  this one holds where the user is looking. */

export type UiDialog = "settings" | "maplocal" | "breakpoints" | "passthrough" | "connect";

/** Charles 5.2.2 detail tabs, in the order its View menu counts them.
 *  The tab *and* the viewer choices persist across selections -- Charles keeps
 *  "Contents + Headers" sticky while you walk the tree, and so do we. */
export type DetailTab = "overview" | "contents" | "websocket" | "summary" | "chart" | "notes";
export type RequestView = "headers" | "query" | "cookies" | "text" | "json" | "raw";
export type ResponseView = "headers" | "text" | "json" | "raw";

/** Share of the Contents area taken by the request pane; the rest is response. */
const REQ_SHARE_KEY = "mitmboard.reqShare";
const REQ_SHARE_MIN = 0.15;
const REQ_SHARE_MAX = 0.85;

function loadReqShare(): number {
  try {
    const n = Number(localStorage.getItem(REQ_SHARE_KEY));
    if (!Number.isFinite(n) || n <= 0) return 0.5;
    return Math.min(Math.max(n, REQ_SHARE_MIN), REQ_SHARE_MAX);
  } catch {
    return 0.5;
  }
}

function clampReqShare(n: number): number {
  return Math.min(Math.max(n, REQ_SHARE_MIN), REQ_SHARE_MAX);
}

interface UiState {
  dialog: UiDialog | null;
  detailTab: DetailTab;
  reqView: RequestView;
  respView: ResponseView;
  reqShare: number;
  /** Per-side body find bar: the query survives flow and viewer switches
   *  (spec: 切换选中流或 viewer 时保留输入词), the bar itself starts closed. */
  findReq: string;
  findResp: string;
  findReqOpen: boolean;
  findRespOpen: boolean;
  openDialog: (d: UiDialog) => void;
  closeDialog: () => void;
  setDetailTab: (t: DetailTab) => void;
  setReqView: (v: RequestView) => void;
  setRespView: (v: ResponseView) => void;
  setReqShare: (share: number) => void;
  setFindReq: (q: string) => void;
  setFindResp: (q: string) => void;
  setFindReqOpen: (open: boolean) => void;
  setFindRespOpen: (open: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  dialog: null,
  detailTab: "overview",
  reqView: "headers",
  respView: "headers",
  reqShare: loadReqShare(),
  findReq: "",
  findResp: "",
  findReqOpen: false,
  findRespOpen: false,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  setDetailTab: (detailTab) => set({ detailTab }),
  setReqView: (reqView) => set({ reqView }),
  setRespView: (respView) => set({ respView }),
  setFindReq: (findReq) => set({ findReq }),
  setFindResp: (findResp) => set({ findResp }),
  setFindReqOpen: (findReqOpen) => set({ findReqOpen }),
  setFindRespOpen: (findRespOpen) => set({ findRespOpen }),
  setReqShare: (share) => {
    const reqShare = clampReqShare(share);
    try { localStorage.setItem(REQ_SHARE_KEY, String(reqShare)); } catch { /* ignore */ }
    set({ reqShare });
  },
}));
