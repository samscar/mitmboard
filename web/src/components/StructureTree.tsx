import { Fragment, useMemo, useState } from "react";
import { useStore } from "../store";
import { fetchDetail } from "../api";
import { bytes, methodColor, statusColor } from "../format";
import type { FlowMeta } from "../types";

interface Folder {
  key: string;
  name: string;
  count: number;
  folders: Map<string, Folder>;
  leaves: FlowMeta[];
}

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

export function StructureTree() {
  const rows = useStore((s) => s.visibleFlows());
  const total = useStore((s) => s.flows.size);
  const paused = useStore((s) => s.paused);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // `rows` is a fresh array on every store write, so this rebuilds per update.
  // At the 5000-flow cap it is still a single linear pass, same order of cost
  // as FlowTable's own render.
  const tree = useMemo(() => buildTree(rows), [rows]);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const open = async (f: FlowMeta) => {
    const p = paused[f.id];
    select(f.id, p ? p.flow : await fetchDetail(f.id));
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
           onClick={() => open(f)}>
        <span className="stree-caret leaf" aria-hidden="true">·</span>
        <span className="stree-method" style={{ color: methodColor[f.method] ?? "#E7EAF0" }}>{f.method}</span>
        <span className="stree-name" title={f.path}>{name}</span>
        {p ? (
          <span className="p-badge">PAUSED</span>
        ) : (
          <span className="stree-status" style={{ color: statusColor(status) }}>{status ?? "…"}</span>
        )}
        <span className="stree-size">
          {f.kind === "ws" ? `${f.ws?.messages ?? 0} msg` : bytes(f.response?.size)}
        </span>
      </div>
    );
  };

  const renderFolder = (node: Folder, depth: number): React.ReactNode => {
    const isCollapsed = collapsed.has(node.key);
    const children = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
    return (
      <Fragment key={node.key}>
        <div role="row"
             className={"stree-row stree-folder" + (depth === 0 ? " stree-host" : "")}
             style={{ paddingLeft: 14 + depth * 14 }}
             onClick={() => toggle(node.key)}>
          <span className="stree-caret" aria-hidden="true">{isCollapsed ? "▸" : "▾"}</span>
          <span className="stree-name" title={node.key}>{node.name}</span>
          <span className="stree-count">{node.count}</span>
        </div>
        {!isCollapsed && (
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
      <div className="stree-head" role="row">
        <span className="stree-head-title">
          {tree.length} host{tree.length === 1 ? "" : "s"} · {rows.length} request{rows.length === 1 ? "" : "s"}
        </span>
        <button className="stree-act" onClick={() => setCollapsed(new Set())}>Expand all</button>
        <button className="stree-act" onClick={() => setCollapsed(new Set(allFolderKeys(tree)))}>Collapse all</button>
      </div>
      {rows.length === 0 ? (
        <div className="empty">{total > 0 ? "No requests match the filter" : "Waiting for traffic…"}</div>
      ) : (
        tree.map((n) => renderFolder(n, 0))
      )}
    </div>
  );
}
