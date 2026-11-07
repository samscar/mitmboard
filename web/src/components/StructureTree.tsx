import { Fragment, useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { fetchDetail } from "../api";
import { bytes, methodColor, statusColor } from "../format";
import { draftRuleForDir, draftRuleForFlow, draftRuleForHost, replaceRule, ruleFor, saveRuleFirst, setRuleEnabled } from "../maplocal";
import { copyCurl, copyUrl, replayFlow } from "../flowActions";
import { selectFlow, selectNode } from "../selection";
import { arrowKeysAvailable } from "../keyboard";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { MapLocalDialog } from "./MapLocalDialog";
import { ReplayModal } from "./ReplayModal";
import type { FlowDetail, FlowMeta, MapLocalRule } from "../types";

interface Folder {
  key: string;
  name: string;
  count: number;
  folders: Map<string, Folder>;
  leaves: FlowMeta[];
}

const OTHER_HOSTS = "__other_hosts__";

function folder(key: string, name: string): Folder {
  return { key, name, count: 0, folders: new Map(), leaves: [] };
}

/** Hosts at the root, one folder per intermediate path segment, requests as
    leaves. The final segment names the leaf instead of becoming a folder, so
    `/api/v1/orders.json` renders as v1 → orders.json rather than nesting an
    `orders.json` folder around an `orders.json` request.

    A node can still hold both requests and subfolders: a request for
    `/v1/users` sits beside the `users` folder created by `/v1/users/42`. */
function buildTree(flows: FlowMeta[]): Folder[] {
  const hosts = new Map<string, Folder>();
  for (const f of flows) {
    let node = hosts.get(f.host);
    if (!node) {
      node = folder(f.host, f.host);
      hosts.set(f.host, node);
    }
    node.count++;
    const segments = f.path.split("?")[0].split("/").filter(Boolean);
    let cur = node;
    for (const seg of segments.slice(0, -1)) {
      let next = cur.folders.get(seg);
      if (!next) {
        next = folder(`${cur.key}/${seg}`, seg);
        cur.folders.set(seg, next);
      }
      next.count++;
      cur = next;
    }
    cur.leaves.push(f);
  }
  return [...hosts.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function allFolderKeys(folders: Folder[], out: string[] = []): string[] {
  for (const f of folders) {
    out.push(f.key);
    allFolderKeys([...f.folders.values()], out);
  }
  return out;
}

type Item = { kind: "folder"; node: Folder; depth: number } | { kind: "leaf"; flow: FlowMeta; depth: number };

export function StructureTree() {
  const rows = useStore((s) => s.visibleFlows());
  const total = useStore((s) => s.flows.size);
  const paused = useStore((s) => s.paused);
  const selectedId = useStore((s) => s.selectedId);
  const selectedNode = useStore((s) => s.selectedNode);
  const focus = useStore((s) => s.focus);
  const toggleFocus = useStore((s) => s.toggleFocus);
  const maplocal = useStore((s) => s.maplocal);
  const setMaplocal = useStore((s) => s.setMaplocal);
  // Other Hosts starts collapsed, like Charles: focusing one host is meant to
  // quiet the noise, not to re-render it one level lower.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set([OTHER_HOSTS]));
  const [menu, setMenu] = useState<{
    x: number; y: number; flow?: FlowMeta; folder?: { key: string; name: string; depth: number; host?: string };
  } | null>(null);
  const [dialog, setDialog] = useState<{ rule: MapLocalRule; flowId: string | null; replace?: boolean } | null>(null);
  const [resend, setResend] = useState<FlowDetail | null>(null);

  // `rows` is a fresh array on every store write, so this rebuilds per update.
  // At the 5000-flow cap it is still a single linear pass, same order of cost
  // as FlowTable's own render.
  const tree = useMemo(() => buildTree(rows), [rows]);

  // Focused hosts pin to the top in focus order; everything else lands in one
  // Other Hosts folder instead of disappearing.
  const { top, focusedCount } = useMemo(() => {
    const byHost = new Map(tree.map((n) => [n.name, n]));
    const pinned = focus.map((h) => byHost.get(h)).filter((n): n is Folder => !!n);
    // With nothing focused there is no Other Hosts grouping at all -- the tree
    // is just the tree.
    if (pinned.length === 0) return { top: tree, focusedCount: 0 };
    const rest = tree.filter((n) => !focus.includes(n.name));
    if (rest.length === 0) return { top: pinned, focusedCount: pinned.length };
    const other = folder(OTHER_HOSTS, "Other Hosts");
    other.count = rest.reduce((sum, n) => sum + n.count, 0);
    for (const n of rest) other.folders.set(n.name, n);
    return { top: [...pinned, other], focusedCount: pinned.length };
  }, [tree, focus]);

  const items = useMemo(() => {
    const out: Item[] = [];
    const walk = (nodes: Folder[], depth: number) => {
      for (const n of nodes) {
        out.push({ kind: "folder", node: n, depth });
        if (collapsed.has(n.key)) continue;
        walk([...n.folders.values()].sort((a, b) => a.name.localeCompare(b.name)), depth + 1);
        for (const f of n.leaves) out.push({ kind: "leaf", flow: f, depth: depth + 1 });
      }
    };
    walk(top, 0);
    return out;
  }, [top, collapsed]);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        if (!arrowKeysAvailable(e) || !selectedNode) return;
        const isCollapsed = collapsed.has(selectedNode);
        if (e.key === "ArrowRight" && isCollapsed) { e.preventDefault(); toggle(selectedNode); }
        if (e.key === "ArrowLeft" && !isCollapsed) { e.preventDefault(); toggle(selectedNode); }
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (!arrowKeysAvailable(e) || items.length === 0) return;
      e.preventDefault();
      const at = items.findIndex((it) =>
        it.kind === "leaf" ? it.flow.id === selectedId : it.node.key === selectedNode);
      let next = e.key === "ArrowDown" ? at + 1 : at - 1;
      if (at === -1) next = 0;
      next = Math.max(0, Math.min(items.length - 1, next));
      const target = items[next];
      if (target.kind === "leaf") selectFlow(target.flow.id).catch(() => {});
      else selectNode(target.node.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selectedId, selectedNode, collapsed]);

  const saveRule = async (rule: MapLocalRule) => {
    setMaplocal(await (dialog?.replace ? replaceRule(maplocal, rule) : saveRuleFirst(maplocal, rule)));
    setDialog(null);
  };

  const openFlowMenu = (e: React.MouseEvent, f: FlowMeta) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, flow: f });
  };

  const openFolderMenu = (e: React.MouseEvent, node: Folder, depth: number, host?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, folder: { key: node.key, name: node.name, depth, host } });
  };

  const focusItem = (host: string): MenuItem => ({
    label: focus.includes(host) ? "Unfocus" : "Focus",
    onSelect: () => toggleFocus(host),
  });

  const requestItems = (f: FlowMeta): MenuItem[] => {
    const hit = ruleFor(maplocal, f.maplocal_rule_id);
    const map: MenuItem[] = hit
      ? [
          { label: "Edit Map Local rule…", onSelect: () => setDialog({ rule: hit, flowId: f.id, replace: true }) },
          { label: "Disable this rule", onSelect: () => { setRuleEnabled(maplocal, hit.id, false).then(setMaplocal).catch(() => {}); } },
        ]
      : [{ label: "Map Local…", onSelect: () => setDialog({ rule: draftRuleForFlow(f), flowId: f.id }) }];
    return [
      ...map,
      { label: focus.includes(f.host) ? "Unfocus" : "Focus", onSelect: () => toggleFocus(f.host) },
      { separator: true },
      { label: "Copy URL", onSelect: () => { copyUrl(f).catch(() => {}); } },
      { label: "Copy cURL", onSelect: () => { copyCurl(f).catch(() => {}); } },
      { separator: true },
      { label: "Replay", onSelect: () => { replayFlow(f).catch(() => {}); } },
      { label: "Edit & Resend", onSelect: () => { fetchDetail(f.id).then(setResend).catch(() => {}); } },
    ];
  };

  const menuItems = (): MenuItem[] => {
    if (menu?.flow) return requestItems(menu.flow);
    if (!menu?.folder) return [];
    const { key, name, depth, host } = menu.folder;
    // The tree key is "host/seg/seg"; the host node is the key itself.
    const rule = depth === 0
      ? draftRuleForHost(name)
      : draftRuleForDir(key.split("/")[0], "/" + key.split("/").slice(1).join("/"));
    const mapItem: MenuItem = { label: "Map Local…", onSelect: () => setDialog({ rule, flowId: null }) };
    const focusHost = depth === 0 ? name : host;
    return focusHost ? [mapItem, focusItem(focusHost)] : [mapItem];
  };

  const renderLeaf = (f: FlowMeta, depth: number) => {
    const p = paused[f.id];
    const segments = f.path.split("?")[0].split("/").filter(Boolean);
    const name = segments.length ? segments[segments.length - 1] : "/";
    const status = f.response?.status;
    return (
      <div key={f.id} role="row"
           className={"stree-row stree-leaf" + (f.id === selectedId ? " selected" : "")}
           style={{ paddingLeft: 14 + depth * 14 }}
           onClick={() => { selectFlow(f.id).catch(() => {}); }}
           onContextMenu={(e) => openFlowMenu(e, f)}>
        <span className="stree-caret leaf" aria-hidden="true">·</span>
        <span className="stree-method" style={{ color: methodColor[f.method] ?? "#E7EAF0" }}>{f.method}</span>
        <span className="stree-name" title={f.path}>{name}</span>
        {p ? (
          <span className="p-badge">PAUSED</span>
        ) : (
          <span className="stree-status" style={{ color: statusColor(status) }}>
            {f.maplocal_rule_id && <span className="mapped-badge">MAPPED</span>}
            {status ?? "…"}
          </span>
        )}
        <span className="stree-size">
          {f.kind === "ws" ? `${f.ws?.messages ?? 0} msg` : bytes(f.response?.size)}
        </span>
      </div>
    );
  };

  const renderFolder = (node: Folder, depth: number, parentHost?: string): React.ReactNode => {
    const isCollapsed = collapsed.has(node.key);
    const children = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
    const isHost = depth === 0 && node.key !== OTHER_HOSTS;
    const host = isHost ? node.name : parentHost;
    const isOther = node.key === OTHER_HOSTS;
    return (
      <Fragment key={node.key}>
        <div role="row"
             className={"stree-row stree-folder" + (isHost ? " stree-host" : "") + (isOther ? " stree-other" : "")
                        + (node.key === selectedNode ? " selected" : "")}
             style={{ paddingLeft: 14 + depth * 14 }}
             onClick={() => selectNode(node.key)}
             onContextMenu={(e) => openFolderMenu(e, node, depth, host)}>
          {/* Charles: clicking the row selects, only the caret collapses. */}
          <span className="stree-caret" aria-hidden="true"
                onClick={(e) => { e.stopPropagation(); toggle(node.key); }}>
            {isCollapsed ? "▸" : "▾"}
          </span>
          <span className="stree-name" title={node.key}>{node.name}</span>
          {isHost && focus.includes(node.name) && <span className="stree-focus" aria-label="Focused" />}
          <span className="stree-count">{node.count}</span>
        </div>
        {!isCollapsed && (
          <>
            {children.map((c) => renderFolder(c, depth + 1, host))}
            {node.leaves.map((f) => renderLeaf(f, depth + 1))}
          </>
        )}
      </Fragment>
    );
  };

  return (
    <div className="stree" role="table">
      <div className="stree-head" role="row">
        <span className="stree-head-title">
          {tree.length} host{tree.length === 1 ? "" : "s"} · {rows.length} request{rows.length === 1 ? "" : "s"}
          {focusedCount > 0 && ` · ${focusedCount} focused`}
        </span>
        <button className="stree-act" onClick={() => setCollapsed(new Set())}>Expand all</button>
        <button className="stree-act" onClick={() => setCollapsed(new Set(allFolderKeys(tree)))}>Collapse all</button>
      </div>
      {rows.length === 0 ? (
        <div className="empty">{total > 0 ? "No requests match the filter" : "Waiting for traffic…"}</div>
      ) : (
        top.map((n) => renderFolder(n, 0))
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems()} onClose={() => setMenu(null)} />
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
