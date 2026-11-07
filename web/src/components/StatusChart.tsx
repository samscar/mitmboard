import type { Dashboard } from "../metrics";

const STATUS = [
  { key: "s2", label: "2xx", desc: "Success", color: "var(--get)" },
  { key: "s3", label: "3xx", desc: "Redirect", color: "var(--redir)" },
  { key: "s4", label: "4xx", desc: "Client error", color: "var(--err4xx)" },
  { key: "s5", label: "5xx", desc: "Server error", color: "var(--err5xx)" },
] as const;

/** Status-code distribution bar plus legend.

    Extracted from the Dashboard page so a node's Chart tab shows exactly the
    same breakdown its Summary reports -- one component, one set of buckets. */
export function StatusChart({ buckets }: { buckets: Dashboard["buckets"] }) {
  const total = buckets.s2 + buckets.s3 + buckets.s4 + buckets.s5 || 1;
  return (
    <div className="dash-panel" role="region" aria-label="Status distribution">
      <div className="dash-panel-h">Status codes</div>
      <div className="dash-bar">
        {STATUS.map((s) => {
          const n = buckets[s.key];
          return n ? <span key={s.key} className="dash-seg" style={{ width: `${(n / total) * 100}%`, background: s.color }} /> : null;
        })}
      </div>
      <div className="dash-legend">
        {STATUS.map((s) => (
          <div key={s.key} className="dash-leg-row">
            <span className="dash-dot" style={{ background: s.color }} />
            <span className="dash-leg-code mono">{s.label}</span>
            <span className="dash-leg-desc">{s.desc}</span>
            <span className="dash-leg-n mono">{buckets[s.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
