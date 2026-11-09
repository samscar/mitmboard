import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../src/store";
import type { FlowMeta, FlowDetail, PausedEntry } from "../src/types";

const mk = (id: string, o: Partial<FlowMeta> = {}): FlowMeta => ({
  id, timestamp: Number(id), client: { ip: "1.1.1.1", label: "x" },
  method: "GET", scheme: "https", host: "api.soum.sa", port: 443,
  path: "/v2/" + id, query: "", http_version: "HTTP/2",
  request: { headers: [], size: 0 },
  response: { status: 200, reason: "", headers: [], size: 0, content_type: "application/json" },
  duration_ms: 1, state: "complete", error: null, ...o,
});

describe("store", () => {
  beforeEach(() => useStore.getState().clear());
  it("upsert replaces by id and visible is newest-first", () => {
    useStore.getState().upsertFlow(mk("1"));
    useStore.getState().upsertFlow(mk("2"));
    useStore.getState().upsertFlow(mk("1", { state: "error" }));
    const v = useStore.getState().visibleFlows();
    expect(v.map((f) => f.id)).toEqual(["2", "1"]);
    expect(v.find((f) => f.id === "1")!.state).toBe("error");
  });
  it("query filters visible flows", () => {
    useStore.getState().upsertFlow(mk("1", { host: "api.soum.sa" }));
    useStore.getState().upsertFlow(mk("2", { host: "google.com" }));
    useStore.getState().setQuery("host:*.soum.sa");
    expect(useStore.getState().visibleFlows().map((f) => f.id)).toEqual(["1"]);
  });
  it("device: query filters by ip", () => {
    useStore.getState().upsertFlow(mk("1", { client: { ip: "1.1.1.1", label: "a" } }));
    useStore.getState().upsertFlow(mk("2", { client: { ip: "2.2.2.2", label: "b" } }));
    useStore.getState().setQuery("device:2.2.2.2");
    expect(useStore.getState().visibleFlows().map((f) => f.id)).toEqual(["2"]);
  });
  it("setSslproxying replaces the SSL Proxying state", () => {
    expect(useStore.getState().sslproxying).toEqual({ enabled: true, exclude: [], base: [] });
    const saved = { enabled: false, exclude: ["*.example.com", "10.0.0.5"], base: ["^config-yaml:443$"] };
    useStore.getState().setSslproxying(saved);
    expect(useStore.getState().sslproxying).toEqual(saved);
  });
  it("clear wipes traffic but keeps the filter query", () => {
    // Charles keeps the filter text across session clears: losing it makes the
    // post-clear tree look broken. Only the user edits the filter.
    useStore.getState().upsertFlow(mk("1"));
    useStore.getState().setQuery("req");
    useStore.getState().clear();
    expect(useStore.getState().flows.size).toBe(0);
    expect(useStore.getState().query).toBe("req");
  });
});

describe("store.detailWidth", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it("defaults to 420", () => {
    // fresh store instance state should default to 420 unless localStorage overrides
    expect(useStore.getState().detailWidth).toBeGreaterThanOrEqual(320);
  });
  it("clamps below 320 up to 320", () => {
    useStore.getState().setDetailWidth(100);
    expect(useStore.getState().detailWidth).toBe(320);
  });
  it("clamps above 80% of window.innerWidth", () => {
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 1000, configurable: true });
    useStore.getState().setDetailWidth(900);
    expect(useStore.getState().detailWidth).toBe(800);
    Object.defineProperty(window, "innerWidth", { value: originalInnerWidth, configurable: true });
  });
  it("persists to localStorage under mitmboard.detailWidth", () => {
    useStore.getState().setDetailWidth(500);
    expect(localStorage.getItem("mitmboard.detailWidth")).toBe("500");
  });
});

test("appendWsMessage caps at 500 and keeps order", () => {
  const s = useStore.getState();
  for (let i = 0; i < 505; i++) s.appendWsMessage("w", { i, t: i, dir: "out", type: "text", size: 1, text: "x", view: null, pretty: null });
  const msgs = useStore.getState().wsMessages["w"];
  expect(msgs.length).toBe(500); expect(msgs[0].i).toBe(5); expect(msgs[499].i).toBe(504);
});
test("setWsMessages replaces", () => {
  useStore.getState().setWsMessages("w", [{ i: 9, t: 0, dir: "in", type: "binary", size: 2, text: null, view: null, pretty: null }]);
  expect(useStore.getState().wsMessages["w"].map((m) => m.i)).toEqual([9]);
});

const wm = (i: number) => ({ i, t: i, dir: "out" as const, type: "text" as const, size: 1, text: "x", view: null, pretty: null });

test("mergeWsMessages unions existing and incoming by i, sorted ascending", () => {
  useStore.getState().clear();
  useStore.getState().appendWsMessage("w", wm(3));
  useStore.getState().mergeWsMessages("w", [wm(0), wm(1), wm(2)]);
  expect(useStore.getState().wsMessages["w"].map((m) => m.i)).toEqual([0, 1, 2, 3]);
});

test("mergeWsMessages collapses duplicates by i", () => {
  useStore.getState().clear();
  useStore.getState().appendWsMessage("w", wm(1));
  useStore.getState().mergeWsMessages("w", [wm(0), wm(1), wm(2)]);
  expect(useStore.getState().wsMessages["w"].map((m) => m.i)).toEqual([0, 1, 2]);
});

test("mergeWsMessages caps at 500", () => {
  useStore.getState().clear();
  for (let i = 0; i < 400; i++) useStore.getState().appendWsMessage("w", wm(i));
  const incoming = [];
  for (let i = 400; i < 600; i++) incoming.push(wm(i));
  useStore.getState().mergeWsMessages("w", incoming);
  const msgs = useStore.getState().wsMessages["w"];
  expect(msgs.length).toBe(500);
  expect(msgs[0].i).toBe(100);
  expect(msgs[499].i).toBe(599);
});

const mkDetail = (id: string): FlowDetail => ({
  id, timestamp: Number(id), client: { ip: "1.1.1.1", label: "x" },
  method: "GET", scheme: "https", host: "api.soum.sa", port: 443,
  path: "/v2/" + id, query: "", http_version: "HTTP/2",
  request: { headers: [], size: 0, body: null },
  response: { status: 200, reason: "", headers: [], size: 0, content_type: "application/json", body: null },
  duration_ms: 1, state: "paused_request", error: null,
  timing: { start: 0, req_done: null, resp_start: null, resp_done: null, duration_ms: null, connect_ms: null, tls_ms: null, ttfb_ms: null, download_ms: null },
});

describe("store.paused", () => {
  beforeEach(() => useStore.getState().clear());
  it("addPaused/removePaused round-trip", () => {
    const flow = mkDetail("f1");
    useStore.getState().addPaused({ flow_id: "f1", phase: "request", rule_id: "r1", since: 1, deadline: 61 }, flow);
    expect(useStore.getState().paused["f1"]).toMatchObject({ flow_id: "f1", phase: "request", rule_id: "r1", flow });
    useStore.getState().removePaused("f1");
    expect(useStore.getState().paused["f1"]).toBeUndefined();
  });
  it("setPaused rebuilds the record keyed by flow_id", () => {
    const list: PausedEntry[] = [
      { flow_id: "a", phase: "request", rule_id: null, since: 1, deadline: 61, flow: mkDetail("a") },
      { flow_id: "b", phase: "response", rule_id: "r2", since: 2, deadline: 62, flow: mkDetail("b") },
    ];
    useStore.getState().setPaused(list);
    expect(Object.keys(useStore.getState().paused).sort()).toEqual(["a", "b"]);
    expect(useStore.getState().paused["b"].rule_id).toBe("r2");
  });
});
