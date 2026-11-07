import { fetchDetail } from "./api";
import { useStore } from "./store";

/** Selection is last-write-wins.

    Rapidly arrowing through the list fires one detail fetch per row; without a
    guard the slowest response can land last and show a row the user already
    moved past. A monotonically increasing token makes stale loads no-ops. */
let seq = 0;

export async function selectFlow(id: string): Promise<void> {
  const mine = ++seq;
  const state = useStore.getState();
  const paused = state.paused[id];
  if (paused) {
    state.select(id, paused.flow);
    return;
  }
  // Mark the row selected before the fetch resolves: the highlight (and the
  // next arrow-key step) must follow the user's keypress, not the network.
  state.select(id, null);
  const detail = await fetchDetail(id);
  if (mine === seq) useStore.getState().select(id, detail);
}

/** Selecting a tree node cancels any in-flight request load. */
export function selectNode(key: string | null): void {
  seq++;
  useStore.getState().selectNode(key);
}

export function clearSelection(): void {
  seq++;
  useStore.getState().clearSelection();
}
