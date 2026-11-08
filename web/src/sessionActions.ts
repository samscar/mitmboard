import { clearFlows, download, fetchFlows, loadSession, replay } from "./api";
import { toCurl } from "./curl";
import { useStore } from "./store";

/** Session-level commands.
 *
 *  These used to live inside TopBar's export dropdown. Now that the menubar is
 *  the single place Charles puts them (File → Save/Open/Clear Session), the
 *  commands live here so the menu and the toolbar can share one implementation
 *  instead of each carrying its own copy. */

export function focusFilterBox() {
  const input = document.querySelector<HTMLInputElement>(".filterbar .search");
  if (!input) return;
  input.focus();
  input.select();
}

export function saveSession() {
  download("/api/session", "mitmboard-session.json").catch(() => {});
}

/** Charles calls this "Export Session…"; HAR is the only export format we have. */
export function exportSession() {
  download("/api/export/har", "mitmboard.har").catch(() => {});
}

export async function clearSession() {
  try {
    await clearFlows();
  } catch {
    console.warn("[mitmboard] clear failed");
  }
  useStore.getState().clear();
}

export async function openSessionFile(file: File) {
  const text = await file.text();
  await loadSession(JSON.parse(text));
  const flows = await fetchFlows();
  const { upsertFlow } = useStore.getState();
  flows.forEach(upsertFlow);
}

/** Tools → Repeat. Charles acts on the selected request. */
export function repeatSelected() {
  const id = useStore.getState().selectedId;
  if (!id) return;
  replay(id).catch(() => {});
}

export function copySelectedAsCurl() {
  const detail = useStore.getState().detail;
  if (!detail) return;
  navigator.clipboard.writeText(toCurl(detail)).catch(() => {});
}

export function requestsFullScreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}
