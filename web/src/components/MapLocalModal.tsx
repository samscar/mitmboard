import { useEffect, useRef, useState } from "react";
import type { MapLocal, MapLocalRule } from "../types";
import { saveMaplocal } from "../api";
import { useStore } from "../store";
import { MapLocalDialog } from "./MapLocalDialog";
import { newRuleId } from "../maplocal";

const blankRule = (): MapLocalRule => ({
  id: newRuleId(), enabled: true, host: "", path: "", method: "", file: "", status: 200,
});

const source = (r: MapLocalRule): string =>
  `${r.host || "*"}${r.path || ""}${r.method ? ` · ${r.method}` : ""}`;

const invalid = (r: MapLocalRule) => r.enabled && !(r.host || r.path);

/** The rule list behind the top-bar Map Local entry.

    Editing an existing rule reuses the same dialog the context menu opens, so
    there is one place that knows what a rule looks like. The list is drafted
    locally and saved as a whole: the server treats PUT as "this is the list",
    which is also what makes its cleanup step meaningful. */
export function MapLocalModal({ onClose }: { onClose: () => void }) {
  const stored = useStore((s) => s.maplocal);
  const setMaplocal = useStore((s) => s.setMaplocal);
  const [draft, setDraft] = useState<MapLocal>(stored);
  const [editing, setEditing] = useState<{ rule: MapLocalRule; index: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);

  // Another tab's save arrives over the websocket; adopt it unless the user is
  // in the middle of their own edits, which would be silently discarded.
  useEffect(() => {
    if (!dirty.current) setDraft(stored);
  }, [stored]);

  const setRules = (rules: MapLocalRule[]) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, rules }));
  };
  const patchRule = (i: number, p: Partial<MapLocalRule>) =>
    setRules(draft.rules.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const removeRule = (i: number) => setRules(draft.rules.filter((_, j) => j !== i));
  const move = (i: number, delta: number) => {
    const next = [...draft.rules];
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setRules(next);
  };
  const applyEdit = (rule: MapLocalRule) => {
    setRules(editing?.index == null ? [rule, ...draft.rules]
      : draft.rules.map((r, i) => (i === editing.index ? rule : r)));
    setEditing(null);
  };

  const handleSave = async () => {
    if (draft.rules.some(invalid)) {
      setError("Set a host or a path for every enabled rule.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const saved = await saveMaplocal({ ...draft, enabled: draft.enabled });
      dirty.current = false;
      setMaplocal(saved);
      onClose();
    } catch {
      setError("Could not save the rules.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal ml-modal" role="dialog" aria-label="Map Local rules" onClick={(e) => e.stopPropagation()}>
        <h2>Map Local</h2>
        <label className="bp-enabled">
          <input type="checkbox" aria-label="Map Local enabled" checked={draft.enabled}
                 onChange={(e) => { dirty.current = true; setDraft((d) => ({ ...d, enabled: e.target.checked })); }} />
          Map Local enabled
        </label>

        <div className="bp-rules">
          {draft.rules.length === 0 && <div className="ml-empty">No rules yet. Add one, or right-click a request.</div>}
          {draft.rules.map((r, i) => (
            <div className="bp-row ml-rule" key={r.id}>
              <input type="checkbox" aria-label={`Enable ${source(r)}`} checked={r.enabled}
                     onChange={(e) => patchRule(i, { enabled: e.target.checked })} />
              <span className="ml-rule-source" title={source(r)}>{source(r)}</span>
              <span className="ml-rule-file" title={r.file}>{r.file || <em>no file</em>}</span>
              <span className="ml-rule-status">{r.status}</span>
              <button className="bp-del ml-move" aria-label={`Move ${source(r)} up`} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
              <button className="bp-del ml-move" aria-label={`Move ${source(r)} down`} disabled={i === draft.rules.length - 1} onClick={() => move(i, 1)}>▼</button>
              <button className="chip" onClick={() => setEditing({ rule: r, index: i })}>Edit</button>
              <button className="bp-del" aria-label={`Delete ${source(r)}`} onClick={() => removeRule(i)}>✕</button>
            </div>
          ))}
        </div>

        <button className="bp-add" onClick={() => setEditing({ rule: blankRule(), index: null })}>Add rule</button>
        {error && <div className="bp-error">{error}</div>}

        <div className="bp-actions">
          <span className="bp-spacer" />
          <button className="chip" onClick={onClose}>Cancel</button>
          <button className="chip primary" disabled={saving} onClick={handleSave}>Save</button>
        </div>

        {editing && (
          <MapLocalDialog
            initial={editing.rule} flowId={null}
            onSave={async (rule) => applyEdit(rule)}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    </div>
  );
}
