import { useState } from "react";
import { useStore } from "../store";
import { useShallow } from "zustand/react/shallow";
import { deriveClients } from "../clients";
import { bytes } from "../format";
import { BreakpointsModal } from "./BreakpointsModal";

function BreakpointIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="6" y="5" width="1.6" height="6" rx="0.5" fill="currentColor" />
      <rect x="9" y="5" width="1.6" height="6" rx="0.5" fill="currentColor" />
    </svg>
  );
}

export function StatusBar() {
  const flows = useStore(useShallow((s) => s.allFlows()));
  const clients = deriveClients(flows, {});
  const breakpoints = useStore((s) => s.breakpoints);
  const pausedCount = useStore((s) => Object.keys(s.paused).length);
  const armed = breakpoints.enabled && breakpoints.rules.some((r) => r.enabled);
  const [showBreakpoints, setShowBreakpoints] = useState(false);
  let down = 0, up = 0;
  const cutoff = Date.now() - 60_000;
  let recent = 0;
  for (const f of flows) {
    down += f.response?.size ?? 0;
    up += f.request?.size ?? 0;
    if (f.timestamp >= cutoff) recent++;
  }
  const protocols = new Set(flows.map((f) => f.http_version).filter(Boolean));
  const proto = protocols.size === 1 ? [...protocols][0] : protocols.size ? "mixed" : "—";
  return (
    <div className="statusbar">
      <span className="sb-dot rec" />
      <span className="sb-item">Recording</span>
      <span className="sb-sep">·</span>
      <span className="sb-item mono">{flows.length.toLocaleString()} requests</span>
      <span className="sb-sep">·</span>
      <span className="sb-item">{clients.length} {clients.length === 1 ? "client" : "clients"}</span>
      <span className="sb-spacer" />
      <span className="sb-item">{proto}</span>
      <span className="sb-sep">·</span>
      <span className="sb-item mono">↓ {bytes(down)}  ↑ {bytes(up)}</span>
      <span className="sb-sep">·</span>
      <span className="sb-item mono">{recent}/min</span>
      <button className="sb-bp" aria-label="Breakpoints" title="Breakpoints" onClick={() => setShowBreakpoints(true)}>
        <span className={"tb-bp-dot " + (armed ? "armed" : "off")} />
        <BreakpointIcon />
        {pausedCount > 0 && <span className="tb-bp-paused">{pausedCount}</span>}
      </button>
      {showBreakpoints && <BreakpointsModal onClose={() => setShowBreakpoints(false)} />}
    </div>
  );
}
