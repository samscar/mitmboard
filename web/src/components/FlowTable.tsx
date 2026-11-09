import { useEffect, useState } from "react";
import { useStore } from "../store";
import { fetchDetail } from "../api";
import { bytes, methodColor, statusColor, typeLabel } from "../format";
import { replaceRule, saveRuleFirst, setRuleEnabled } from "../maplocal";
import { flowMenuItems } from "../flowMenu";
import { selectFlow } from "../selection";
import { arrowKeysAvailable } from "../keyboard";
import { ContextMenu } from "./ContextMenu";
import { MapLocalDialog } from "./MapLocalDialog";
import { ReplayModal } from "./ReplayModal";
import type { FlowDetail, FlowMeta, MapLocalRule } from "../types";

export function FlowTable() {
  const paused = useStore((s) => s.paused);
  const total = useStore((s) => s.flows.size);
  const pausedFlows = useStore((s) => s.pausedFlows());
  const rows = useStore((s) => s.visibleFlows()).filter((f) => !(f.id in paused));
  const selectedId = useStore((s) => s.selectedId);
  const maplocal = useStore((s) => s.maplocal);
  const setMaplocal = useStore((s) => s.setMaplocal);
  const focus = useStore((s) => s.focus);
  const toggleFocus = useStore((s) => s.toggleFocus);
  const [menu, setMenu] = useState<{ x: number; y: number; flow: FlowMeta } | null>(null);
  const [dialog, setDialog] = useState<{ rule: MapLocalRule; flowId: string; replace?: boolean } | null>(null);
  const [resend, setResend] = useState<FlowDetail | null>(null);

  const onClick = (f: FlowMeta) => { selectFlow(f.id).catch(() => {}); };
  const onClickPaused = (flow: FlowDetail) => { selectFlow(flow.id).catch(() => {}); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (!arrowKeysAvailable(e) || rows.length === 0) return;
      e.preventDefault();
      const at = rows.findIndex((f) => f.id === selectedId);
      const next = e.key === "ArrowDown" ? at + 1 : at - 1;
      const target = rows[at === -1 ? 0 : Math.max(0, Math.min(rows.length - 1, next))];
      if (target) selectFlow(target.id).catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selectedId]);

  const openMenu = (e: React.MouseEvent, f: FlowMeta) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, flow: f });
  };

  const saveRule = async (rule: MapLocalRule) => {
    // A rule opened from an already-mapped flow is edited in place; a new one
    // goes to the front, because the first match wins and a narrower new rule
    // must not sit behind an older, broader one.
    setMaplocal(await (dialog?.replace ? replaceRule(maplocal, rule) : saveRuleFirst(maplocal, rule)));
    setDialog(null);
  };

  const items = (f: FlowMeta) => flowMenuItems(f, {
    maplocal,
    focused: focus.includes(f.host),
    onFocus: toggleFocus,
    onMapLocal: (rule, replace) => setDialog({ rule, flowId: f.id, replace }),
    onDisableRule: (ruleId) => { setRuleEnabled(maplocal, ruleId, false).then(setMaplocal).catch(() => {}); },
    onResend: (flowId) => { fetchDetail(flowId).then(setResend).catch(() => {}); },
  });

  return (
    <div className="flowtable" role="table">
      <div className="flowhead" role="row">
        <span /><span>METHOD</span><span>STATUS</span><span>HOST</span>
        <span>PATH</span><span>TYPE</span><span className="ta-r">SIZE</span><span className="ta-r">TIME</span>
      </div>
      {pausedFlows.length > 0 && (
        <>
          <div className="paused-group-head">Paused ({pausedFlows.length})</div>
          {pausedFlows.map((f) => (
            <div key={f.id} role="row" className={"flowrow" + (f.id === selectedId ? " selected" : "")}
                 onClick={() => onClickPaused(f)}>
              <span className="dot" style={{ background: statusColor(f.response?.status) }} />
              <span className="method" style={{ color: methodColor[f.method] ?? "#1F2430" }}>{f.method}</span>
              <span className="status"><span className="p-badge">PAUSED</span></span>
              <span className="host">{f.host}</span>
              <span className="path">{f.path}</span>
              <span className="type">{typeLabel(f.response?.content_type)}</span>
              <span className="size ta-r">{bytes(f.response?.size)}</span>
              <span className="time ta-r">{f.duration_ms != null ? `${f.duration_ms} ms` : ""}</span>
            </div>
          ))}
        </>
      )}
      {rows.length === 0 && pausedFlows.length === 0 ? (
        <div className="empty">{total > 0 ? "No requests match the filter" : "No requests"}</div>
      ) : rows.map((f) => (
        <div key={f.id} role="row" className={"flowrow" + (f.id === selectedId ? " selected" : "")}
             onClick={() => onClick(f)}
             onContextMenu={(e) => openMenu(e, f)}>
          <span className="dot" style={{ background: statusColor(f.response?.status) }} />
          <span className="method" style={{ color: methodColor[f.method] ?? "#1F2430" }}>{f.method}</span>
          <span className="status" style={{ color: statusColor(f.response?.status) }}>
            {f.maplocal_rule_id && <span className="mapped-badge">MAPPED</span>}
            {f.response?.status ?? "…"}
          </span>
          <span className="host">{f.host}</span>
          <span className="path">{f.path}</span>
          {f.kind === "ws" ? (
            <span className="type type-ws">ws{f.ws?.open && <span className="ws-live" />}</span>
          ) : (
            <span className="type">{typeLabel(f.response?.content_type)}</span>
          )}
          <span className="size ta-r">{f.kind === "ws" ? `${f.ws?.messages ?? 0} msgs` : bytes(f.response?.size)}</span>
          <span className="time ta-r">{f.duration_ms != null ? `${f.duration_ms} ms` : ""}</span>
        </div>
      ))}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={items(menu.flow)} onClose={() => setMenu(null)} />
      )}
      {dialog && (
        <MapLocalDialog
          initial={dialog.rule} flowId={dialog.flowId}
          onSave={saveRule} onClose={() => setDialog(null)}
        />
      )}
      {resend && <ReplayModal detail={resend} onClose={() => setResend(null)} />}
    </div>
  );
}
