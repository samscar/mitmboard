import { useEffect, useRef } from "react";

/** Charles-style bottom find bar for one body viewer: magnifier, query input,
 *  "N of M" counter, Find Prev / Find Next, close. Enter = Next,
 *  Shift+Enter = Prev, Escape = close. The match highlighting itself lives in
 *  RawLines; this bar only owns the query UI. */
export function FindBar({ query, count, active, onQuery, onNext, onPrev, onClose }: {
  query: string;
  count: number;
  active: number;
  onQuery: (q: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div className="findbar" role="search" aria-label="Find bar">
      <svg className="findbar-icon" width="13" height="13" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.8-3.8" />
      </svg>
      <input
        ref={inputRef}
        className={"findbar-input" + (query && count === 0 ? " is-empty" : "")}
        aria-label="Find in body"
        placeholder="Text to find"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onPrev(); else onNext();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <span className="findbar-count" aria-live="polite">
        {query ? (count > 0 ? `${Math.min(active + 1, count)} of ${count}` : "0 results") : ""}
      </span>
      <button className="chip" onClick={onPrev} disabled={count === 0}>Find Prev</button>
      <button className="chip" onClick={onNext} disabled={count === 0}>Find Next</button>
      <button className="chip findbar-close" onClick={onClose} aria-label="Close find bar">✕</button>
    </div>
  );
}
