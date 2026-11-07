import { useState } from "react";
import { useStore } from "../store";
import { flowsUnderNode } from "../nodeFlows";
import { dashboard } from "../metrics";
import { bytes } from "../format";
import { StatusChart } from "./StatusChart";

type Tab = "overview" | "summary" | "chart";

/** The right pane for a selected host or directory.

    Numbers come from the same aggregator the Dashboard used, so a node's
    summary and the global dashboard can never disagree about what "P95" or
    "average" means. */
export function NodeDetail({ nodeKey }: { nodeKey: string }) {
  const rows = useStore((s) => s.visibleFlows());
  const flows = flowsUnderNode(rows, nodeKey);
  const stats = dashboard(flows);
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="detail" role="region" aria-label="Node detail">
      <div className="detail-title">
        <span className="detail-node-key">{nodeKey}</span>
      </div>
      <div className="detail-tabs">
        {(["overview", "summary", "chart"] as Tab[]).map((t) => (
          <button key={t} className={"tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="general">
          <div className="gen-head">GENERAL</div>
          <div className="gen-row"><span className="gk">Node</span><span className="gv mono">{nodeKey}</span></div>
          <div className="gen-row"><span className="gk">Requests</span><span className="gv mono">{stats.total}</span></div>
          <div className="gen-row"><span className="gk">Bytes</span><span className="gv mono">{bytes(stats.bytesDown + stats.bytesUp)}</span></div>
          <div className="gen-row">
            <span className="gk">Errors</span>
            <span className="gv mono">{Math.round(stats.errorRate * 100)}%</span>
          </div>
        </div>
      )}

      {tab === "summary" && (
        <div className="general">
          <div className="gen-head">SUMMARY</div>
          <div className="gen-row"><span className="gk">Requests</span><span className="gv mono">{stats.total}</span></div>
          <div className="gen-row"><span className="gk">2xx / 3xx</span><span className="gv mono">{stats.buckets.s2} / {stats.buckets.s3}</span></div>
          <div className="gen-row"><span className="gk">4xx / 5xx</span><span className="gv mono">{stats.buckets.s4} / {stats.buckets.s5}</span></div>
          <div className="gen-row"><span className="gk">Pending</span><span className="gv mono">{stats.buckets.pending}</span></div>
          <div className="gen-row"><span className="gk">Average</span><span className="gv mono">{stats.avgMs} ms</span></div>
          <div className="gen-row"><span className="gk">P95</span><span className="gv mono">{stats.p95Ms} ms</span></div>
          <div className="gen-row"><span className="gk">Throughput</span><span className="gv mono">{stats.perMin}/min</span></div>
        </div>
      )}

      {tab === "chart" && (
        <div className="node-chart">
          <StatusChart buckets={stats.buckets} />
        </div>
      )}
    </div>
  );
}
