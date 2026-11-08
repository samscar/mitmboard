import { useMemo, useState } from "react";
import { useStore } from "../store";
import { suggest } from "../filters/suggest";
import { listSaved, saveFilter } from "../savedFilters";
import { DslHelp } from "./DslHelp";

/** Charles keeps a single filter field at the bottom of the list panel. The
    quick-chip row this once had made the panel two rows tall and pushed the
    detail pane around, so the chips are gone: the DSL with autocomplete covers
    the same queries by typing, and the star keeps saved filters reachable. */
export function FilterBar() {
  const query = useStore((s) => s.query);
  const setQuery = useStore((s) => s.setQuery);
  const listMode = useStore((s) => s.listMode);
  const focus = useStore((s) => s.focus);
  const focusFilterOn = useStore((s) => s.focusFilterOn);
  const setFocusFilter = useStore((s) => s.setFocusFilter);
  const [focused, setFocused] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const tokens = query.split(/\s+/).filter(Boolean);
  const flows = useStore((s) => s.flows);
  // Known devices for `device:` completion, one entry per IP.
  const devices = useMemo(() => {
    const seen = new Map<string, { ip: string; label: string }>();
    for (const f of flows.values()) {
      if (!seen.has(f.client.ip)) seen.set(f.client.ip, { ip: f.client.ip, label: f.client.label });
    }
    return [...seen.values()];
  }, [flows]);
  const suggestions = focused && query ? suggest(query, devices) : [];

  const applySuggestion = (token: string) => {
    const parts = query.split(/\s+/);
    parts[parts.length - 1] = token;
    setQuery(parts.join(" "));
  };
  const removeToken = (i: number) => setQuery(tokens.filter((_, j) => j !== i).join(" "));

  return (
    <div className="filterbar">
      <div className="chips">
        {tokens.map((t, i) => (
          <span key={t + i} className="active-chip">{t}<button onClick={() => removeToken(i)}>✕</button></span>
        ))}
      </div>
      <div className="filterline">
        <input className="search" aria-label="Filter" placeholder="status:>=400  host:*.soum.sa  path:/v2/*"
               value={query} onChange={(e) => setQuery(e.target.value)}
               onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 120)} />
        {listMode === "sequence" && focus.length > 0 && (
          // Charles puts a Focused checkbox in Sequence view; it hides unfocused
          // hosts without touching Focus itself.
          <button className={"chip" + (focusFilterOn ? " primary" : "")} aria-pressed={focusFilterOn}
                  onClick={() => setFocusFilter(!focusFilterOn)}>Focused</button>
        )}
        <button className="fbtn" aria-label="Saved filters" data-tip="Saved filters"
                onClick={() => setShowSaved((v) => !v)}>★</button>
        <button className="fbtn" aria-label="Filter syntax help" data-tip="Filter syntax help"
                onClick={() => setShowHelp((v) => !v)}>?</button>
      </div>
      {suggestions.length > 0 && (
        <div className="ac-dropdown">
          {suggestions.map((s) => (
            <div key={s.token} className="ac-item" onClick={() => applySuggestion(s.token)}>
              <span className="ac-token">{s.token}</span><span className="ac-desc">{s.desc}</span>
            </div>
          ))}
        </div>
      )}
      {showSaved && (
        <div className="saved-menu">
          {listSaved().map((f) => (
            <div key={f.name} className="saved-item" onClick={() => { setQuery(f.query); setShowSaved(false); }}>
              {f.fav ? "★ " : ""}{f.name} <span className="saved-q">{f.query}</span>
            </div>
          ))}
          <button className="saved-add" onClick={() => { const n = window.prompt("Filter name"); if (n) saveFilter(n, query); }}>＋ Save current</button>
        </div>
      )}
      {showHelp && <DslHelp />}
    </div>
  );
}
