import { Fragment, useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { fetchDetail } from "../api";
import { draftRuleForDir, draftRuleForHost, replaceRule, saveRuleFirst, setRuleEnabled } from "../maplocal";
import { flowMenuItems, type MenuItem } from "../flowMenu";
import { selectFlow, selectNode } from "../selection";
import { arrowKeysAvailable } from "../keyboard";
import { ContextMenu } from "./ContextMenu";
import { FlowIcon, FolderIcon } from "./FlowIcon";
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
  // Charles opens with every host collapsed and requests appear only once a
  // folder is expanded, so the set tracks expansions rather than collapses:
  // an empty set is the default view, and hosts that arrive later start
  // collapsed too.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<{
    x: number; y: number; flow?: FlowMeta;
    folder?: { key: string; name: string; isHost: boolean };
  } | null>(null);
  const [dialog, setDialog] = useState<{ rule: MapLocalRule; flowId: string | null; replace?: boolean } | null>(null);
  const [resend, setResend] = useState<FlowDetail | null>(null);

  // `rows` is a fresh array on every store write, so this rebuilds per update.
  // At the 5000-flow cap it is still a single linear pass, same order of cost
  // as FlowTable's own render.
  // `rows` arrives newest-first (Sequence's order). Leaves must be arrival
  // order -- old on top, new appended at the bottom, like Charles' tree --
  // so the input is reversed here and nowhere else: the store stays
  // newest-first for FlowTable (ADR-0010).
  const tree = useMemo(() => buildTree([...rows].reverse()), [rows]);

  const query = useStore((s) => s.query);

  // Focused hosts pin to the top in focus order; everything else lands in one
  // Other Hosts folder instead of disappearing.
  const { top } = useMemo(() => {
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
        if (!expanded.has(n.key)) continue;
        walk([...n.folders.values()].sort((a, b) => a.name.localeCompare(b.name)), depth + 1);
        for (const f of n.leaves) out.push({ kind: "leaf", flow: f, depth: depth + 1 });
      }
    };
    walk(top, 0);
    return out;
  }, [top, expanded]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        if (!arrowKeysAvailable(e) || !selectedNode) return;
        const isCollapsed = !expanded.has(selectedNode);
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
  }, [items, selectedId, selectedNode, expanded]);

  const saveRule = async (rule: MapLocalRule) => {
    setMaplocal(await (dialog?.replace ? replaceRule(maplocal, rule) : saveRuleFirst(maplocal, rule)));
    setDialog(null);
  };

  const openFlowMenu = (e: React.MouseEvent, f: FlowMeta) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, flow: f });
  };

  const openFolderMenu = (e: React.MouseEvent, node: Folder, isHost: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, folder: { key: node.key, name: node.name, isHost } });
  };

  const focusItem = (host: string): MenuItem => ({
    label: focus.includes(host) ? "Unfocus" : "Focus",
    onSelect: () => toggleFocus(host),
  });

  const requestItems = (f: FlowMeta): MenuItem[] => flowMenuItems(f, {
    maplocal,
    focused: focus.includes(f.host),
    onFocus: toggleFocus,
    onMapLocal: (rule, replace) => setDialog({ rule, flowId: f.id, replace }),
    onDisableRule: (ruleId) => { setRuleEnabled(maplocal, ruleId, false).then(setMaplocal).catch(() => {}); },
    onResend: (flowId) => { fetchDetail(flowId).then(setResend).catch(() => {}); },
  });

  const menuItems = (): MenuItem[] => {
    if (menu?.flow) return requestItems(menu.flow);
    if (!menu?.folder) return [];
    const { key, name, isHost } = menu.folder;
    // Host nodes carry their own name as key; directories are "host/seg/seg".
    const rule = isHost
      ? draftRuleForHost(name)
      : draftRuleForDir(key.split("/")[0], "/" + key.split("/").slice(1).join("/"));
    const mapItem: MenuItem = { label: "Map Local…", onSelect: () => setDialog({ rule, flowId: null }) };
    // Focus is host-level only: a directory menu has no Focus entry.
    return isHost ? [mapItem, focusItem(name)] : [mapItem];
  };

  const renderLeaf = (f: FlowMeta, depth: number) => {
    const p = paused[f.id];
    const segments = f.path.split("?")[0].split("/").filter(Boolean);
    const name = segments.length ? segments[segments.length - 1] : "/";
    return (
      <div key={f.id} role="row"
           className={"stree-row stree-leaf"
                      + (f.id === selectedId ? " selected" : "")
                      + (p ? " is-paused" : "")}
           style={{ paddingLeft: 14 + depth * 14 }}
           title={p ? `${f.method} ${f.path} — paused at a breakpoint` : `${f.method} ${f.path}`}
           onClick={() => { selectFlow(f.id).catch(() => {}); }}
           onContextMenu={(e) => openFlowMenu(e, f)}>
        <span className="stree-caret leaf" aria-hidden="true" />
        <FlowIcon flow={f} />
        <span className="stree-name">{name}</span>
      </div>
    );
  };

  const renderFolder = (node: Folder, depth: number): React.ReactNode => {
    const isExpanded = expanded.has(node.key);
    const children = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
    // A host node's key is its own name, wherever it sits -- including inside
    // Other Hosts, where it is one level deeper than the pinned ones.
    const isHost = node.key !== OTHER_HOSTS && node.key === node.name;
    const isOther = node.key === OTHER_HOSTS;
    return (
      <Fragment key={node.key}>
        <div role="row"
             className={"stree-row stree-folder" + (isHost ? " stree-host" : "") + (isOther ? " stree-other" : "")
                        + (node.key === selectedNode ? " selected" : "")}
             style={{ paddingLeft: 14 + depth * 14 }}
             title={node.key}
             onClick={() => (isOther ? toggle(node.key) : selectNode(node.key))}
             onContextMenu={(e) => openFolderMenu(e, node, isHost)}>
          {/* Charles: clicking the row selects, only the caret collapses. */}
          <span className="stree-caret" aria-hidden="true"
                onClick={(e) => { e.stopPropagation(); toggle(node.key); }}>
            {isExpanded ? "▾" : "▸"}
          </span>
          <FolderIcon open={isExpanded} />
          <span className="stree-name">{node.name}</span>
        </div>
        {isExpanded && (
          <>
            {children.map((c) => renderFolder(c, depth + 1))}
            {node.leaves.map((f) => renderLeaf(f, depth + 1))}
          </>
        )}
      </Fragment>
    );
  };

  return (
    <div className="stree" role="table">
      {rows.length === 0 ? (
        <div className="empty">{total > 0 ? "No requests match the filter" : "No requests"}</div>
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
