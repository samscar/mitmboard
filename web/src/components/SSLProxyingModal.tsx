import { useEffect, useMemo, useState } from "react";
import { fetchSslProxying, SslProxyingConflict, saveSslProxying } from "../api";
import { useStore } from "../store";
import {
  EntryMode, isValidJsRegex, matchesHostPort, toCanonicalRegex, wildcardToRegex,
} from "../sslProxying";

/** SSL Proxying Settings — ADR 0014.

    config.yaml's ignore_hosts is the single source of truth. Every mutation
    is written immediately (no Save/Cancel draft), so a long-lived draft can
    never silently overwrite an external edit. The list shows raw regexes in
    full; wildcard shorthand is only an input aid that expands to a canonical
    regex before it reaches the file. */
type SyncStatus = "synced" | "syncing" | "error";

export function SSLProxyingModal({ onClose }: { onClose: () => void }) {
  const stored = useStore((s) => s.sslproxying);
  const setSslproxying = useStore((s) => s.setSslproxying);

  const [entry, setEntry] = useState("");
  const [mode, setMode] = useState<EntryMode>("wildcard");
  const [onlyHttps, setOnlyHttps] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [status, setStatus] = useState<SyncStatus>("synced");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ enabled: boolean; exclude: string[]; revision: string } | null>(null);
  // The list the user tried to write. On a 409 the store still holds the old
  // list, so "overwrite with my list" must use this, not `stored`.
  const [pending, setPending] = useState<{ enabled: boolean; exclude: string[] } | null>(null);

  const [converterOpen, setConverterOpen] = useState(false);
  const [convertInput, setConvertInput] = useState("");
  const [convertOnlyHttps, setConvertOnlyHttps] = useState(false);
  const [trial, setTrial] = useState("");
  const [copied, setCopied] = useState<number | null>(null);

  // A broadcast from another tab carries the new revision; adopt it so the
  // next write is not rejected as a stale-revision conflict (spec D12).
  useEffect(() => { if (!conflict) setStatus("synced"); }, [stored.revision, conflict]);

  const preview = useMemo(() => {
    if (!entry.trim()) return null;
    try { return toCanonicalRegex(entry, mode, onlyHttps); } catch { return null; }
  }, [entry, mode, onlyHttps]);

  const persist = async (
    next: { enabled: boolean; exclude: string[] },
    opts: { force?: boolean; revision?: string } = {},
  ): Promise<boolean> => {
    setStatus("syncing");
    setError(null);
    setPending(next);
    try {
      const saved = await saveSslProxying({
        ...next, revision: opts.revision ?? stored.revision, force: opts.force ?? false,
      });
      setSslproxying(saved);
      setConflict(null);
      setPending(null);
      setStatus("synced");
      return true;
    } catch (e) {
      setStatus("error");
      if (e instanceof SslProxyingConflict) {
        setConflict(e.state);
        setError("config.yaml 已在外部修改，请选择处理方式。");
      } else {
        setError(e instanceof Error ? e.message : "写入失败");
      }
      return false;
    }
  };

  const resetEntry = () => {
    setEntry(""); setEditing(null); setMode("wildcard"); setOnlyHttps(false);
  };

  const commitEntry = async () => {
    if (!entry.trim() || !preview) return;
    if (mode === "wildcard" && !isValidJsRegex(preview)) {
      setStatus("error"); setError("生成的 regex 无效，请检查输入。"); return;
    }
    const exclude = [...stored.exclude];
    if (editing == null) exclude.push(preview);
    else exclude[editing] = preview;
    if (await persist({ enabled: stored.enabled, exclude })) resetEntry();
  };

  const removeAt = (i: number) => {
    const exclude = stored.exclude.filter((_, j) => j !== i);
    if (editing === i) resetEntry();
    void persist({ enabled: stored.enabled, exclude });
  };

  const startEdit = (i: number) => {
    setEditing(i); setEntry(stored.exclude[i]); setMode("regex"); setOnlyHttps(false);
  };

  const reload = async () => {
    try {
      const fresh = await fetchSslProxying();
      setSslproxying(fresh);
      setConflict(null); setPending(null); setError(null); setStatus("synced");
    } catch (e) {
      setStatus("error"); setError(e instanceof Error ? e.message : "重载失败");
    }
  };

  const addConverted = (regexes: string[]) => {
    const exclude = [...stored.exclude];
    for (const r of regexes) if (!exclude.includes(r)) exclude.push(r);
    void persist({ enabled: stored.enabled, exclude });
  };

  const conversions = useMemo(() => {
    return convertInput.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      try {
        const regex = wildcardToRegex(line, convertOnlyHttps);
        return { input: line, regex, error: null as string | null };
      } catch (e) {
        return { input: line, regex: "", error: e instanceof Error ? e.message : "转换失败" };
      }
    });
  }, [convertInput, convertOnlyHttps]);

  const trialMatches = (regex: string): boolean | null => {
    if (!trial.trim() || !regex) return null;
    try { return matchesHostPort(regex, trial.trim()); } catch { return null; }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sslproxy-modal" role="dialog" aria-label="SSL Proxying Settings"
           onClick={(e) => e.stopPropagation()}>
        <h2>SSL Proxying Settings</h2>
        <label className="bp-enabled">
          <input type="checkbox" aria-label="Enable SSL Proxying" checked={stored.enabled}
                 disabled={status === "syncing"}
                 onChange={(e) => void persist({ enabled: e.target.checked, exclude: stored.exclude })} />
          Enable SSL Proxying
        </label>

        <div className="cd-tabs" role="tablist">
          <button className="cd-tab" disabled title="Not implemented yet">Include</button>
          <button className="cd-tab active" role="tab" aria-selected="true">Exclude</button>
        </div>

        <p className="sslproxy-hint">
          条目来自 <code>~/.mitmproxy/config.yaml</code> 的 <code>ignore_hosts</code>，按目标 host:port
          匹配，改动即时写回该文件；刷新网页会读取外部编辑。通配符速记 <code>*</code> 与 <code>?</code>{' '}
          在加入前展开为原始 regex。
        </p>

        <div className="sslproxy-status" role="status" data-status={status}>
          <span>{status === "syncing" ? "同步中…" : status === "error" ? "未同步" : "已同步"}</span>
          <button className="chip" onClick={() => void reload()}>重载</button>
        </div>
        {error && <div className="bp-error">{error}</div>}

        {conflict && (
          <div className="sslproxy-conflict" role="alert">
            <div>服务端的最新名单与本次修改不一致，未自动覆盖。</div>
            <div className="sslproxy-conflict-actions">
              <button className="chip" onClick={() => void reload()}>以文件为准重载</button>
              <button className="chip primary" onClick={() => {
                const next = pending ?? { enabled: stored.enabled, exclude: stored.exclude };
                setConflict(null);
                void persist(next, { force: true, revision: conflict.revision });
              }}>以我的列表覆盖</button>
            </div>
          </div>
        )}

        <div className="bp-rules sslproxy-rules">
          {stored.exclude.length === 0 && <div className="ml-empty">No excluded hosts.</div>}
          {stored.exclude.map((pattern, i) => (
            <div className="sslproxy-row" key={`${i}-${pattern}`}>
              <code className="sslproxy-pattern" title={pattern}>{pattern}</code>
              <button className="chip" onClick={() => startEdit(i)}>Edit</button>
              <button className="bp-del" aria-label={`Delete ${pattern}`} onClick={() => removeAt(i)}>✕</button>
            </div>
          ))}
        </div>

        <div className="sslproxy-add">
          <input type="text" placeholder="10.53.*.*" aria-label="Exclude pattern"
                 value={entry} onChange={(e) => setEntry(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void commitEntry(); } }} />
          <button className="bp-add" disabled={!preview || status === "syncing"}
                  onClick={() => void commitEntry()}>{editing == null ? "Add" : "Update"}</button>
          {editing != null && <button className="chip" onClick={resetEntry}>Cancel</button>}
        </div>
        <div className="sslproxy-entry-opts">
          <div className="sslproxy-mode" role="group" aria-label="Entry mode">
            <button className={`chip ${mode === "wildcard" ? "primary" : ""}`}
                    aria-pressed={mode === "wildcard"} onClick={() => setMode("wildcard")}>通配符速记</button>
            <button className={`chip ${mode === "regex" ? "primary" : ""}`}
                    aria-pressed={mode === "regex"} onClick={() => setMode("regex")}>原始 Regex</button>
          </div>
          {mode === "wildcard" && (
            <label className="sslproxy-check">
              <input type="checkbox" checked={onlyHttps} onChange={(e) => setOnlyHttps(e.target.checked)} />
              仅 HTTPS :443
            </label>
          )}
        </div>
        {entry.trim() && (
          <div className="sslproxy-preview">
            <span>写入为</span>
            <code>{preview}</code>
            {preview && !isValidJsRegex(preview) && <span className="bp-error">regex 无效</span>}
          </div>
        )}

        <div className="sslproxy-converter-toggle">
          <button className="chip" aria-expanded={converterOpen} onClick={() => setConverterOpen((v) => !v)}>
            {converterOpen ? "收起转换器" : "转换为 Regex"}
          </button>
        </div>
        {converterOpen && (
          <div className="sslproxy-converter">
            <label className="sslproxy-converter-label" htmlFor="convert-input">
              每行一条通配符速记，输出可直接写入 config.yaml 的规范 regex
            </label>
            <textarea id="convert-input" aria-label="Wildcard shorthand list" rows={3}
                      placeholder={"10.53.*.*\n*.example.com"}
                      value={convertInput} onChange={(e) => setConvertInput(e.target.value)} />
            <label className="sslproxy-check">
              <input type="checkbox" checked={convertOnlyHttps}
                     onChange={(e) => setConvertOnlyHttps(e.target.checked)} />
              仅 HTTPS :443
            </label>
            {conversions.length > 0 && (
              <>
                <div className="sslproxy-convert-head">
                  <span>试匹配（host:port）</span>
                  <input type="text" aria-label="Trial host and port" placeholder="10.53.1.20:443"
                         value={trial} onChange={(e) => setTrial(e.target.value)} />
                </div>
                <div className="sslproxy-convert-list">
                  {conversions.map((c, i) => (
                    <div className="sslproxy-convert-row" key={`${c.input}-${i}`}>
                      <code title={c.regex}>{c.error ?? c.regex}</code>
                      {!c.error && (
                        <>
                          {trialMatches(c.regex) !== null && (
                            <span className={trialMatches(c.regex) ? "sslproxy-hit" : "sslproxy-miss"}>
                              {trialMatches(c.regex) ? "命中" : "未命中"}
                            </span>
                          )}
                          <button className="chip" onClick={() => {
                            void navigator.clipboard?.writeText(c.regex);
                            setCopied(i);
                          }}>{copied === i ? "已复制" : "复制"}</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <div className="sslproxy-convert-actions">
                  <span className="bp-spacer" />
                  <button className="chip primary" disabled={status === "syncing"}
                          onClick={() => addConverted(conversions.filter((c) => !c.error).map((c) => c.regex))}>
                    全部加入排除
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="bp-actions">
          <span className="bp-spacer" />
          <button className="chip" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
