import { useEffect, useRef, useState } from "react";
import { saveSslProxying } from "../api";
import { useStore } from "../store";

/** The SSL Proxying Settings dialog, mirroring Charles'.

    Charles pairs an "Enable SSL Proxying" checkbox with Include/Exclude
    location lists. Two deliberate deviations (ADR-0010):

    - Entries are host wildcards only, no `:port` field: mitmproxy's
      ignore_hosts matches hosts, and a port field would suggest otherwise.
    - The Include tab is a greyed placeholder until allow_hosts gets a UI --
      the empty slot is the promise, same philosophy as the menubar.

    The exclude list has two layers: patterns captured at startup from
    ~/.mitmproxy/config.yaml or --ignore-hosts (shown read-only -- they are
    regexes maintained in their own files) and the UI-managed wildcard list
    persisted in config.json. Saving re-emits both layers, so new entries
    sync into the global ignore_hosts without dropping the baseline.

    Semantics: with the checkbox on, every listed host passes through
    encrypted and unintercepted (mitmproxy ignore_hosts). With it off, *all*
    TLS goes through untouched -- Charles's checkbox behavior. Excluded
    connections never appear in the flow list: the list itself is the only
    source of truth. */
export function SSLProxyingModal({ onClose }: { onClose: () => void }) {
  const stored = useStore((s) => s.sslproxying);
  const setSslproxying = useStore((s) => s.setSslproxying);
  const [draft, setDraft] = useState(stored);
  const [entry, setEntry] = useState<string>("");
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);

  // Another tab's save arrives over the websocket; adopt it unless the user
  // is in the middle of their own edits, which would be silently discarded.
  useEffect(() => {
    if (!dirty.current) setDraft(stored);
  }, [stored]);

  const setEnabled = (enabled: boolean) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, enabled }));
  };

  const commitEntry = () => {
    const value = entry.trim();
    if (!value) return;
    const exclude = [...draft.exclude];
    if (editing == null) exclude.push(value);
    else exclude[editing] = value;
    dirty.current = true;
    setDraft((d) => ({ ...d, exclude }));
    setEntry("");
    setEditing(null);
  };

  const removeAt = (i: number) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, exclude: d.exclude.filter((_, j) => j !== i) }));
    if (editing === i) { setEditing(null); setEntry(""); }
  };

  const startEdit = (i: number) => {
    setEditing(i);
    setEntry(draft.exclude[i]);
  };

  const handleSave = async () => {
    if (entry.trim() && entry.trim() !== draft.exclude[editing ?? -1]) {
      setError("Confirm or discard the entry being edited before saving.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const saved = await saveSslProxying({ enabled: draft.enabled, exclude: draft.exclude, base: draft.base });
      dirty.current = false;
      setSslproxying(saved);
      onClose();
    } catch {
      setError("Could not save the exclude list.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="SSL Proxying Settings" onClick={(e) => e.stopPropagation()}>
        <h2>SSL Proxying Settings</h2>
        <label className="bp-enabled">
          <input type="checkbox" aria-label="Enable SSL Proxying" checked={draft.enabled}
                 onChange={(e) => setEnabled(e.target.checked)} />
          Enable SSL Proxying
        </label>

        <div className="cd-tabs" role="tablist">
          <button className="cd-tab" disabled title="Not implemented yet">Include</button>
          <button className="cd-tab active" role="tab" aria-selected="true">Exclude</button>
        </div>

        <p className="sslproxy-hint">
          Matching hosts are passed through encrypted and unintercepted — their apps
          never see the proxy certificate. Wildcards: <code>*</code> matches any string,
          <code>?</code> one character. Excluded connections do not appear in the flow list.
        </p>

        {draft.base.length > 0 && (
          <div className="sslproxy-base">
            <div className="sslproxy-base-head">
              From ~/.mitmproxy/config.yaml or --ignore-hosts — always in effect, edit those files to change:
            </div>
            {draft.base.map((pattern, i) => (
              <div className="bp-row sslproxy-base-row" key={`base-${i}`}>
                <code className="sslproxy-pattern" title={pattern}>{pattern}</code>
              </div>
            ))}
          </div>
        )}

        <div className="bp-rules">
          {draft.exclude.length === 0 && <div className="ml-empty">No excluded hosts.</div>}
          {draft.exclude.map((pattern, i) => (
            <div className="bp-row" key={`${i}-${pattern}`}>
              <code className="sslproxy-pattern" title={pattern}>{pattern}</code>
              <span className="bp-spacer" />
              <button className="chip" onClick={() => startEdit(i)}>Edit</button>
              <button className="bp-del" aria-label={`Delete ${pattern}`} onClick={() => removeAt(i)}>✕</button>
            </div>
          ))}
        </div>

        <div className="sslproxy-add">
          <input
            type="text"
            placeholder="*.example.com"
            aria-label="Exclude pattern"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitEntry(); } }}
          />
          <button className="bp-add" onClick={commitEntry}>{editing == null ? "Add" : "Update"}</button>
          {editing != null && <button className="chip" onClick={() => { setEditing(null); setEntry(""); }}>Cancel</button>}
        </div>
        {error && <div className="bp-error">{error}</div>}

        <div className="bp-actions">
          <span className="bp-spacer" />
          <button className="chip" onClick={onClose}>Cancel</button>
          <button className="chip primary" disabled={saving} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
