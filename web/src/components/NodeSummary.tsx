import { useStore } from "../store";
import { useUi } from "../uiStore";
import { flowsUnderNode } from "../nodeFlows";
import { dashboard } from "../metrics";
import { bytes } from "../format";
import { selectFlow } from "../selection";
import { StatusChart } from "./StatusChart";
import { Waterfall, entriesFromFlows } from "./Waterfall";

/** The right pane for a selected host or directory.
 *
 *  Charles gives a group exactly three tabs -- Overview, Summary, Chart -- and
 *  its Chart is a timeline of everything under that node, not a status
 *  histogram. The histogram moved into Overview, where the aggregate counts
 *  already live, so the tab now means what it means in Charles. */
export function NodeSummary({ nodeKey }: { nodeKey: string }) {
  const rows = useStore((s) => s.visibleFlows());
  const flows = flowsUnderNode(rows, nodeKey);
  const stats = dashboard(flows);
  const requested = useUi((s) => s.detailTab);
  const setTab = useUi((s) => s.setDetailTab);
  // A group has three of the six tabs; the View menu can ask for any of them.
  const tab = requested === "summary" || requested === "chart" ? requested : "overview";

  return (
    <div className="detail" role="region" aria-label="Node summary">
      <div className="detail-title">
        <span className="detail-node-key">{nodeKey}</span>
      </div>
      <div className="detail-tabs">
        {(["overview", "summary", "chart"] as const).map((t) => (
          <button key={t} className={"tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="general">
            <div className="gen-head">GENERAL</div>
            <div className="gen-row"><span className="gk">Node</span><span className="gv mono">{nodeKey}</span></div>
            <div className="gen-row"><span className="gk">Requests</span><span className="gv mono">{stats.total}</span></div>
            <div className="gen-row"><span className="gk">Completed</span><span className="gv mono">{stats.total - stats.buckets.pending}</span></div>
            <div className="gen-row"><span className="gk">Pending</span><span className="gv mono">{stats.buckets.pending}</span></div>
            <div className="gen-row"><span className="gk">Failed</span><span className="gv mono">{stats.buckets.s4 + stats.buckets.s5}</span></div>
            <div className="gen-row"><span className="gk">Bytes</span><span className="gv mono">{bytes(stats.bytesDown + stats.bytesUp)}</span></div>
          </div>
          <div className="node-chart">
            <StatusChart buckets={stats.buckets} />
          </div>
        </>
      )}

      {tab === "summary" && (
        <div className="general">
          <div className="gen-head">SUMMARY</div>
          <div className="gen-row"><span className="gk">Requests</span><span className="gv mono">{stats.total}</span></div>
          <div className="gen-row"><span className="gk">2xx / 3xx</span><span className="gv mono">{stats.buckets.s2} / {stats.buckets.s3}</span></div>
          <div className="gen-row"><span className="gk">4xx / 5xx</span><span className="gv mono">{stats.buckets.s4} / {stats.buckets.s5}</span></div>
          <div className="gen-row"><span className="gk">Pending</span><span className="gv mono">{stats.buckets.pending}</span></div>
          <div className="gen-row"><span className="gk">Bytes</span><span className="gv mono">{bytes(stats.bytesDown + stats.bytesUp)}</span></div>
          <div className="gen-row"><span className="gk">Average</span><span className="gv mono">{stats.avgMs} ms</span></div>
          <div className="gen-row"><span className="gk">P95</span><span className="gv mono">{stats.p95Ms} ms</span></div>
        </div>
      )}

      {tab === "chart" && (
        <div className="chart-wrap">
          <Waterfall entries={entriesFromFlows(flows)} onSelect={(id) => { selectFlow(id).catch(() => {}); }} />
        </div>
      )}
    </div>
  );
}
