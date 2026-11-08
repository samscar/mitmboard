import { useCallback, useEffect, useRef } from "react";
import { MenuBar } from "./components/MenuBar";
import { TopBar } from "./components/TopBar";
import { ListPanel } from "./components/ListPanel";
import { DetailPane } from "./components/DetailPane";
import { StatusBar } from "./components/StatusBar";
import { EmptyState } from "./components/EmptyState";
import { Dialogs } from "./components/Dialogs";
import { useUi } from "./uiStore";
import { connectWS } from "./ws";
import { fetchFlows, fetchPassthrough, fetchWsMessages, fetchBreakpoints, fetchPaused, fetchMaplocal } from "./api";
import { useStore } from "./store";
import { clearSelection } from "./selection";
import { isOverlayOpen, isTypingTarget } from "./keyboard";
import "./theme.css";

export function App() {
  const openDialog = useUi((s) => s.openDialog);
  const upsert = useStore((s) => s.upsertFlow);
  const setPassthrough = useStore((s) => s.setPassthrough);
  const appendWsMessage = useStore((s) => s.appendWsMessage);
  const mergeWsMessages = useStore((s) => s.mergeWsMessages);
  const setBreakpoints = useStore((s) => s.setBreakpoints);
  const setMaplocal = useStore((s) => s.setMaplocal);
  const setPaused = useStore((s) => s.setPaused);
  const addPaused = useStore((s) => s.addPaused);
  const removePaused = useStore((s) => s.removePaused);
  const isEmpty = useStore((s) => s.flows.size === 0);
  const detailWidth = useStore((s) => s.detailWidth);
  const setDetailWidth = useStore((s) => s.setDetailWidth);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const onSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    dragState.current = { startX: e.clientX, startWidth: useStore.getState().detailWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMouseMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const delta = dragState.current.startX - ev.clientX;
      setDetailWidth(dragState.current.startWidth + delta);
    };
    const onMouseUp = () => {
      dragState.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [setDetailWidth]);

  useEffect(() => {
    // Re-clamp on resize: a pane sized against a wide window can otherwise
    // stay pinned past the 60%-of-viewport cap after the window shrinks.
    const onResize = () => setDetailWidth(useStore.getState().detailWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setDetailWidth]);
  useEffect(() => {
    // Running inside the Tauri desktop shell on macOS (seamless title bar) —
    // leave room for the macOS traffic-light buttons in the top bar. Other
    // platforms' Tauri windows use a normal title bar, so skip the padding.
    const w = window as unknown as { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown };
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform) || /Macintosh/.test(navigator.userAgent);
    if ((w.__TAURI_INTERNALS__ || w.__TAURI__) && isMac) document.body.classList.add("in-tauri");
  }, []);
  useEffect(() => {
    // Global shortcuts: ⌘/Ctrl+F jumps to the filter box, Escape walks back one
    // layer -- Focus first, then selection -- the way Charles does.
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        const input = document.querySelector<HTMLInputElement>(".filterbar .search");
        if (input) { e.preventDefault(); input.focus(); input.select(); }
        return;
      }
      if (e.key !== "Escape") return;
      if (isOverlayOpen() || isTypingTarget(e.target)) return;
      const state = useStore.getState();
      if (state.focus.length > 0) { state.setFocus([]); return; }
      clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const resync = () => {
      fetchFlows().then((fs) => fs.forEach(upsert)).catch(() => {});
      fetchPassthrough().then(setPassthrough).catch(() => {});
      fetchBreakpoints().then(setBreakpoints).catch(() => {});
      fetchMaplocal().then(setMaplocal).catch(() => {});
      fetchPaused().then(setPaused).catch(() => {});
      // A reconnect can follow a dropped connection during which frames on
      // the currently open ws flow were missed, so re-pull its buffer too.
      const { selectedId } = useStore.getState();
      if (selectedId && useStore.getState().flows.get(selectedId)?.kind === "ws") {
        fetchWsMessages(selectedId).then((r) => mergeWsMessages(selectedId, r.messages)).catch(() => {});
      }
    };
    resync();
    return connectWS(
      (e) => {
        if (e.type === "flow.update") upsert(e.flow);
        else if (e.type === "breakpoints.update") setBreakpoints({ enabled: e.enabled, rules: e.rules });
        else if (e.type === "maplocal.update") setMaplocal({ enabled: e.enabled, rules: e.rules });
        else if (e.type === "breakpoint.paused") addPaused(e.entry, e.flow);
        else if (e.type === "breakpoint.resumed" || e.type === "breakpoint.dropped" || e.type === "breakpoint.timeout") removePaused(e.flow_id);
        else if ("flow" in e) upsert(e.flow);
        else if (e.type === "ws.message") {
          if (e.flow_id === useStore.getState().selectedId) appendWsMessage(e.flow_id, e.message);
        }
        else if (e.type === "passthrough.update") setPassthrough(e.hosts);
      },
      resync,
    );
  }, [upsert, setPassthrough, appendWsMessage, mergeWsMessages, setBreakpoints, setPaused, addPaused, removePaused, setMaplocal]);
  return (
    <div className="app">
      <MenuBar />
      <TopBar />
      <div className="body">
        {isEmpty ? (
          <EmptyState onConnect={() => openDialog("connect")} />
        ) : (
          <>
            <ListPanel />
            <div
              className="splitter"
              role="separator"
              aria-orientation="vertical"
              onMouseDown={onSplitterMouseDown}
            />
            <DetailPane width={detailWidth} />
          </>
        )}
      </div>
      <StatusBar />
      <Dialogs />
    </div>
  );
}
