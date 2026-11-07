import { useEffect, useRef, useState } from "react";
import { clearFlows, download, fetchFlows, loadSession, caInfo, fetchConnectInfo, replay } from "../api";
import { useStore } from "../store";
import { ExportMenu } from "./ExportMenu";
import { Settings } from "./Settings";
import { LockOpenIcon } from "./LockOpenIcon";
import { MapLocalModal } from "./MapLocalModal";
import { PassthroughModal } from "./PassthroughModal";

type IconName = "clear" | "replay" | "connect" | "export" | "settings" | "maplocal";

/** Inline 16px glyphs: the top bar keeps actions icon-only, with the label in
    a tooltip, the way Charles' toolbar does. */
function Icon({ name }: { name: IconName }) {
  const common = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" } as const;
  switch (name) {
    case "clear":
      return (<svg {...common}><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>);
    case "replay":
      return (<svg {...common}><path d="M13 8a5 5 0 1 1-1.7-3.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M13 2.5v3.2h-3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>);
    case "connect":
      return (<svg {...common}><path d="M6 2.5v3.2M10 2.5v3.2M4 5.7h8v1.9a4 4 0 0 1-8 0z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /><path d="M8 11.6v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>);
    case "export":
      return (<svg {...common}><path d="M8 2.5v7M5.2 6.8 8 9.6l2.8-2.8M3 12.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>);
    case "settings":
      return (<svg {...common}><circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.3" /><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>);
    case "maplocal":
      return (<svg {...common}><path d="M3 3.5h5l1.4 1.6H13v7.4H3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M7 7.2v3M5.8 8.5 7 9.7l1.2-1.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>);
  }
}

function IconButton({ icon, label, onClick, disabled, children }: {
  icon: IconName; label: string; onClick: () => void; disabled?: boolean; children?: React.ReactNode;
}) {
  return (
    <button className="tb-icon" title={label} aria-label={label} onClick={onClick} disabled={disabled}>
      <Icon name={icon} />
      {children}
    </button>
  );
}

export function TopBar({ onConnect }: { onConnect: () => void }) {
  const clear = useStore((s) => s.clear);
  const upsert = useStore((s) => s.upsertFlow);
  const selectedId = useStore((s) => s.selectedId);
  const passthroughActiveCount = useStore((s) => s.passthrough.filter((p) => p.active).length);
  const maplocal = useStore((s) => s.maplocal);
  // "In effect" means the master switch is on and at least one rule is on:
  // an enabled switch with every rule unchecked changes no traffic.
  const mlArmed = maplocal.enabled && maplocal.rules.some((r) => r.enabled);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMaplocal, setShowMaplocal] = useState(false);
  const [showPassthrough, setShowPassthrough] = useState(false);
  const [proxy, setProxy] = useState<string | null>(null);
  const [caOk, setCaOk] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fetchConnectInfo().then((i) => setProxy(i.proxy_hint)).catch(() => {});
    caInfo().then((c) => setCaOk(!!c.present)).catch(() => {});
  }, []);

  const handleSave = () => {
    download("/api/session", "mitmboard-session.json");
    setMenuOpen(false);
  };

  const handleLoad = () => {
    fileInputRef.current?.click();
    setMenuOpen(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await loadSession(JSON.parse(text));
    const flows = await fetchFlows();
    flows.forEach(upsert);
    // reset input so same file can be re-loaded
    e.target.value = "";
  };

  const handleExportHar = () => {
    download("/api/export/har", "mitmboard.har");
    setMenuOpen(false);
  };

  const handleClear = async () => {
    try { await clearFlows(); } catch { console.warn("[mitmboard] clear failed"); }
    clear();
    setMenuOpen(false);
  };

  const handleReplay = () => {
    if (selectedId) replay(selectedId).catch(() => {});
  };

  return (
    <div className="topbar" data-tauri-drag-region="true">
      <div className="topbar-left">
        <span className="brand" data-tauri-drag-region="true">Mitmboard<span className="beta">BETA</span></span>
        <span className="tb-status"><span className="tb-dot live" />Listening
          <code className="tb-addr">{proxy ?? "…"}</code></span>
        <span className="tb-status">
          <span className={"tb-dot " + (caOk ? "ok" : "off")} />
          {caOk == null ? "CA…" : caOk ? "CA trusted" : "CA not installed"}
        </span>
        {passthroughActiveCount > 0 && (
          <button className="tb-status tb-passthrough" onClick={() => setShowPassthrough(true)}
                  title="Hosts whose apps refused the proxy certificate; forwarded encrypted">
            <LockOpenIcon size={13} />{passthroughActiveCount} passthrough
          </button>
        )}
      </div>
      <span className="topbar-spacer" />
      <IconButton icon="clear" label="Clear" onClick={handleClear} />
      <IconButton icon="replay" label="Replay" onClick={handleReplay} disabled={!selectedId} />
      <IconButton icon="connect" label="Connect device" onClick={onConnect} />
      <div style={{ position: "relative" }}>
        <IconButton icon="export" label="Export" onClick={() => setMenuOpen((o) => !o)} />
        {menuOpen && (
          <div style={{ position: "absolute", right: 0, top: "100%", zIndex: 100 }}>
            <ExportMenu
              onSave={handleSave}
              onLoad={handleLoad}
              onExportHar={handleExportHar}
              onClear={handleClear}
            />
          </div>
        )}
      </div>
      <IconButton icon="maplocal" label="Map Local" onClick={() => setShowMaplocal(true)}>
        <span className={"tb-bp-dot " + (mlArmed ? "armed" : "off")} />
      </IconButton>
      <IconButton icon="settings" label="Settings" onClick={() => setShowSettings(true)} />
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {showMaplocal && <MapLocalModal onClose={() => setShowMaplocal(false)} />}
      {showPassthrough && <PassthroughModal onClose={() => setShowPassthrough(false)} />}
    </div>
  );
}
