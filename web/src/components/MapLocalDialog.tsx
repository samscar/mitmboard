import { useState } from "react";
import type { MapLocalRule } from "../types";
import { saveCapturedResponse, uploadMaplocalFile } from "../api";

const METHODS = ["", "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** One dialog for creating and editing a Map Local rule.

    It mirrors Charles' Map Local sheet: a single editable file path, with a
    "Choose…" button that uploads in the browser (a server path is not
    reachable from there) and "Use captured response" as a shortcut that fills
    the same field rather than introducing a second kind of file source. */
export function MapLocalDialog({ initial, flowId, onSave, onClose }: {
  initial: MapLocalRule;
  flowId?: string | null;
  onSave: (rule: MapLocalRule) => Promise<void>;
  onClose: () => void;
}) {
  const [rule, setRule] = useState<MapLocalRule>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = (p: Partial<MapLocalRule>) => setRule((r) => ({ ...r, ...p }));

  const useCaptured = async () => {
    if (!flowId) return;
    setBusy(true); setError(null);
    try {
      const saved = await saveCapturedResponse(flowId);
      patch({ file: saved.path });
    } catch (e) {
      setError(String((e as Error)?.message ?? "") === "422"
        ? "That response is larger than 20 MB. Type a path to a file on the server instead."
        : "Could not write the captured response to a file.");
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const saved = await uploadMaplocalFile(file);
      patch({ file: saved.path });
    } catch (e) {
      const status = String((e as Error)?.message ?? "");
      setError(status === "422"
        ? "That file is larger than 20 MB. Type a path to a file on the server instead."
        : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const file = rule.file.trim();
    if (!file) {
      setError("Use the captured response, choose a file, or type a path.");
      return;
    }
    setBusy(true); setError(null);
    try {
      await onSave({ ...rule, file });
    } catch {
      setError("Could not save the rule.");
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal ml-dialog" role="dialog" aria-label="Map Local rule"
           onClick={(e) => e.stopPropagation()}>
        <h2>Map Local</h2>

        <div className="ml-field">
          <label htmlFor="ml-host">Host</label>
          <input id="ml-host" aria-label="Host" value={rule.host} spellCheck={false}
                 placeholder="api.example.com" onChange={(e) => patch({ host: e.target.value })} />
        </div>
        <div className="ml-field">
          <label htmlFor="ml-path">Path</label>
          <input id="ml-path" aria-label="Path" value={rule.path} spellCheck={false}
                 placeholder="/v1/*" onChange={(e) => patch({ path: e.target.value })} />
        </div>
        <div className="ml-row">
          <div className="ml-field">
            <label htmlFor="ml-method">Method</label>
            <select id="ml-method" aria-label="Method" value={rule.method}
                    onChange={(e) => patch({ method: e.target.value })}>
              {METHODS.map((m) => <option key={m || "any"} value={m}>{m || "any"}</option>)}
            </select>
          </div>
          <div className="ml-field ml-status">
            <label htmlFor="ml-status">Status</label>
            <input id="ml-status" aria-label="Status" type="number" min={100} max={599}
                   value={rule.status}
                   onChange={(e) => patch({ status: Number(e.target.value) })} />
          </div>
        </div>

        <div className="ml-field">
          <label htmlFor="ml-file">Local file</label>
          <input id="ml-file" aria-label="Local file" value={rule.file} spellCheck={false}
                 placeholder="/path/to/mock.json"
                 onChange={(e) => patch({ file: e.target.value })} />
        </div>
        <div className="ml-file-actions">
          <button className="chip" disabled={busy || !flowId} onClick={useCaptured}>
            Use captured response
          </button>
          <label className={"chip ml-choose" + (busy ? " disabled" : "")}>
            Choose file…
            <input type="file" aria-label="Choose file" disabled={busy}
                   onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>

        <p className="ml-hint">Query parameters are not part of the match: <code>?id=1</code> and <code>?id=2</code> hit the same rule.</p>
        {error && <div className="bp-error">{error}</div>}

        <div className="bp-actions">
          <span className="bp-spacer" />
          <button className="chip" onClick={onClose}>Cancel</button>
          <button className="chip primary" disabled={busy} onClick={submit}>Save</button>
        </div>
      </div>
    </div>
  );
}
