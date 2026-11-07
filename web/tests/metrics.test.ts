import { describe, it, expect } from "vitest";
import { dashboard } from "../src/metrics";
import type { FlowMeta, DeviceKind } from "../src/types";

const mk = (o: Omit<Partial<FlowMeta>, "kind"> & { ip?: string; status?: number | null; ms?: number | null; size?: number; deviceKind?: DeviceKind }): FlowMeta => ({
  id: Math.random() + "", timestamp: o.timestamp ?? 1, method: o.method ?? "GET",
  client: { ip: o.ip ?? "1.1.1.1", label: o.ip ?? "1.1.1.1", kind: o.deviceKind ?? "unknown" },
  scheme: "https", host: o.host ?? "api.x", port: 443, path: o.path ?? "/", query: "", http_version: "HTTP/2",
  request: { headers: [], size: 100 },
  response: o.status === null ? null : { status: o.status ?? 200, reason: "", headers: [], size: o.size ?? 200, content_type: "application/json" },
  duration_ms: o.ms === undefined ? 100 : o.ms, state: "complete", error: null,
});

describe("dashboard", () => {
  it("buckets statuses, computes error rate and top hosts", () => {
    const d = dashboard([
      mk({ status: 200, host: "a.com" }), mk({ status: 200, host: "a.com" }),
      mk({ status: 404, host: "b.com" }), mk({ status: 503, host: "a.com" }),
      mk({ status: null, ms: null, host: "b.com" }),   // pending
    ]);
    expect(d.total).toBe(5);
    expect(d.buckets).toMatchObject({ s2: 2, s4: 1, s5: 1, pending: 1 });
    expect(d.errorRate).toBeCloseTo(2 / 5);
    expect(d.topHosts[0]).toEqual({ host: "a.com", count: 3 });
  });
  it("is safe on empty input", () => {
    const d = dashboard([]);
    expect(d.total).toBe(0);
    expect(d.errorRate).toBe(0);
    expect(d.topHosts).toEqual([]);
  });
});
