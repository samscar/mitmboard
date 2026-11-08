import { useEffect, useState } from "react";
import { caInfo, fetchConnectInfo } from "../api";
import { useStore } from "../store";
import { useUi } from "../uiStore";
import { clearSession, repeatSelected } from "../sessionActions";
import { LockOpenIcon } from "./LockOpenIcon";

/** The window toolbar, as Charles arranges it.
 *
 *  Charles keeps a menubar *and* a toolbar, and every enabled icon mirrors a
 *  menu command. That is how its icons stay discoverable: the menu is the
 *  legend. Mitmboard's previous top bar had six unlabelled icons with no menu
 *  behind them, which is why they read as meaningless. This toolbar keeps
 *  Charles' silhouette -- Structure/Sequence, then Clear/Compose/Repeat, then
 *  the proxy toggles -- and leaves the ones with no implementation greyed out
 *  rather than silently absent. */

type IconName =
  | "clear" | "compose" | "repeat"
  | "proxying" | "record" | "ssl" | "throttle" | "breakpoints";

function Icon({ name }: { name: IconName }) {
  const common = { width: 15, height: 15, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" } as const;
  switch (name) {
    case "clear":
      return (<svg {...common}><path d="M9.4 2.6l4 4-5.2 5.2H4.6L2.4 9.6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M6 4.6l4.4 4.4M2.6 13.4h10.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>);
    case "compose":
      return (<svg {...common}><path d="M10.6 2.6l2.8 2.8-7.2 7.2-3.6.8.8-3.6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M9.2 4l2.8 2.8" stroke="currentColor" strokeWidth="1.3" /></svg>);
    case "repeat":
      return (<svg {...common}><path d="M13 8a5 5 0 1 1-1.7-3.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M13 2.5v3.2h-3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>);
    case "proxying":
      return (<svg {...common}><circle cx="8" cy="8" r="5.4" stroke="currentColor" strokeWidth="1.3" /><path d="M2.6 8h10.8M8 2.6c3 3 3 7.8 0 10.8M8 2.6c-3 3-3 7.8 0 10.8" stroke="currentColor" strokeWidth="1.1" /></svg>);
    case "record":
      return (<svg {...common}><circle cx="8" cy="8" r="4.6" fill="currentColor" /></svg>);
    case "ssl":
      return (<svg {...common}><rect x="3.4" y="7" width="9.2" height="6.4" rx="1.4" stroke="currentColor" strokeWidth="1.3" /><path d="M5.8 7V5.4a2.2 2.2 0 0 1 4.4 0V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>);
    case "throttle":
      return (<svg {...common}><path d="M8 2.6c2.6 2.6 3.2 4.2 3.2 5.6a3.2 3.2 0 0 1-6.4 0c0-1.4.6-3 3.2-5.6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M6.4 13.2h3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>);
    case "breakpoints":
      return (<svg {...common}><path d="M8 2.2l4.9 2.85v5.9L8 13.8 3.1 10.95v-5.9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M6.7 6.4v3.2M9.3 6.4v3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>);
  }
}

function ToolButton({ icon, label, onClick, disabled, children }: {
  icon: IconName; label: string; onClick?: () => void; disabled?: boolean; children?: React.ReactNode;
}) {
  // Greyed buttons keep `aria-disabled` instead of the native attribute:
  // browsers suppress hover and tooltips on truly disabled controls, and the
  // tooltip is the only way these icons explain themselves.
  return (
    <button
      className={"tb-icon" + (disabled ? " is-disabled" : "")}
      data-tip={disabled ? `${label} — not implemented yet` : label}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}>
      <Icon name={icon} />
      {children}
    </button>
  );
}

export function TopBar() {
  const selectedId = useStore((s) => s.selectedId);
  const listMode = useStore((s) => s.listMode);
  const setListMode = useStore((s) => s.setListMode);
  const passthroughActiveCount = useStore((s) => s.passthrough.filter((p) => p.active).length);
  const breakpoints = useStore((s) => s.breakpoints);
  const pausedCount = useStore((s) => Object.keys(s.paused).length);
  const openDialog = useUi((s) => s.openDialog);
  const armed = breakpoints.enabled && breakpoints.rules.some((r) => r.enabled);
  const [proxy, setProxy] = useState<string | null>(null);
  const [caOk, setCaOk] = useState<boolean | null>(null);

  useEffect(() => {
    fetchConnectInfo().then((i) => setProxy(i.proxy_hint)).catch(() => {});
    caInfo().then((c) => setCaOk(!!c.present)).catch(() => {});
  }, []);

  return (
    <div className="topbar" data-tauri-drag-region="true">
      <div className="seg view-switch" role="group" aria-label="View">
        <button className={"seg-item" + (listMode === "structure" ? " active" : "")}
                onClick={() => setListMode("structure")}>Structure</button>
        <button className={"seg-item" + (listMode === "sequence" ? " active" : "")}
                onClick={() => setListMode("sequence")}>Sequence</button>
      </div>

      <span className="tb-sep" />
      <ToolButton icon="clear" label="Clear Session" onClick={() => { clearSession().catch(() => {}); }} />
      <ToolButton icon="compose" label="Compose" disabled />
      <ToolButton icon="repeat" label="Repeat" onClick={repeatSelected} disabled={!selectedId} />

      <span className="tb-sep" />
      <ToolButton icon="proxying" label="macOS Proxy" disabled />
      <ToolButton icon="record" label="Start Recording" disabled />
      <ToolButton icon="ssl" label="SSL Proxying" disabled />
      <ToolButton icon="throttle" label="Throttling" disabled />
      <ToolButton icon="breakpoints" label="Breakpoints" onClick={() => openDialog("breakpoints")}>
        {pausedCount > 0
          ? <span className="tb-bp-paused">{pausedCount}</span>
          : <span className={"tb-bp-dot " + (armed ? "armed" : "off")} />}
      </ToolButton>

      <span className="topbar-spacer" />
      <span className="tb-status"><span className="tb-dot live" />Listening
        <code className="tb-addr">{proxy ?? "…"}</code></span>
      <span className="tb-status">
        <span className={"tb-dot " + (caOk ? "ok" : "off")} />
        {caOk == null ? "CA…" : caOk ? "CA trusted" : "CA not installed"}
      </span>
      {passthroughActiveCount > 0 && (
        <button className="tb-status tb-passthrough" onClick={() => openDialog("passthrough")}
                title="Hosts forwarded encrypted — their apps refused the proxy certificate">
          <LockOpenIcon size={13} />{passthroughActiveCount} encrypted
        </button>
      )}
    </div>
  );
}
