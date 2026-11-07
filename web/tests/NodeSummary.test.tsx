import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../src/App";
import { useStore } from "../src/store";
import type { FlowDetail, FlowMeta } from "../src/types";

const mk = (id: string, over: Partial<FlowMeta> = {}): FlowMeta => ({
  id, timestamp: Date.now(), client: { ip: "1.1.1.1", label: "iPhone", kind: "phone" }, method: "GET",
  scheme: "https", host: "api.soum.sa", port: 443, path: "/v2/a", query: "", http_version: "HTTP/2",
  request: { headers: [], size: 10 },
  response: { status: 200, reason: "OK", headers: [], size: 100, content_type: "application/json" },
  duration_ms: 100, state: "complete", error: null, ...over,
});

const detail = (f: FlowMeta): FlowDetail => ({
  ...f,
  request: { ...f.request, body: null },
  response: f.response ? { ...f.response, body: "{}" } : null,
  timing: { start: f.timestamp, req_done: null, resp_start: null, resp_done: null, duration_ms: 100,
            connect_ms: null, tls_ms: null, ttfb_ms: null, download_ms: null },
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

function stubApi(flows: FlowMeta[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/flows") return ok(flows);
    if (url === "/api/maplocal") return ok({ enabled: true, rules: [] });
    if (url === "/api/passthrough" || url === "/api/paused" || url === "/api/clients") return ok([]);
    if (url === "/api/breakpoints") return ok({ enabled: false, rules: [] });
    const m = url.match(/^\/api\/flows\/([^/]+)$/);
    if (m) return ok(detail(flows.find((f) => f.id === m[1]) ?? flows[0]));
    return ok({});
  }));
}

const flows = () => {
  const a = mk("a", { path: "/v2/a", response: { status: 200, reason: "OK", headers: [], size: 100, content_type: "application/json" } });
  const b = mk("b", { path: "/v2/b", duration_ms: 300, response: { status: 500, reason: "ERR", headers: [], size: 40, content_type: "text/plain" } });
  const c = mk("c", { host: "cdn.soum.sa", path: "/img/logo.png" });
  return [a, b, c];
};

describe("node summary", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setListMode("structure");
    const list = flows();
    stubApi(list);
    list.forEach((f) => useStore.getState().upsertFlow(f));
  });

  it("shows the node's request count when a host is selected", async () => {
    render(<App />);
    fireEvent.click(document.querySelector(".stree-host") as HTMLElement);

    const node = await screen.findByRole("region", { name: "Node summary" });
    expect(node).toHaveTextContent("api.soum.sa");
    expect(screen.getByText("Requests")).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
  });

  it("summarises status buckets, average and P95 for the node", async () => {
    render(<App />);
    fireEvent.click(document.querySelector(".stree-host") as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: "Summary" }));

    expect(screen.getByText("4xx / 5xx")).toBeInTheDocument();
    expect(screen.getByText("0 / 1")).toBeInTheDocument();  // one 500 under api.soum.sa
    expect(screen.getByText("Average")).toBeInTheDocument();
    expect(screen.getByText("200 ms")).toBeInTheDocument(); // (100 + 300) / 2
    expect(screen.getByText("Bytes")).toBeInTheDocument();  // total traffic belongs in Summary
  });

  it("goes back to the request detail when a request is selected again", async () => {
    render(<App />);
    fireEvent.click(document.querySelector(".stree-host") as HTMLElement);
    await screen.findByRole("region", { name: "Node summary" });

    fireEvent.click(document.querySelector(".stree-leaf") as HTMLElement);
    await waitFor(() => expect(screen.getByText(/https:\/\/api\.soum\.sa\/v2\/[ab]/)).toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Node summary" })).toBeNull();
  });
});

describe("node summary for a directory", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setListMode("structure");
    const list = flows();
    stubApi(list);
    list.forEach((f) => useStore.getState().upsertFlow(f));
  });

  it("counts only the requests under that path prefix", async () => {
    render(<App />);
    const dir = document.querySelector(".stree-folder:not(.stree-host)") as HTMLElement;
    fireEvent.click(dir);

    const node = await screen.findByRole("region", { name: "Node summary" });
    expect(node).toHaveTextContent("api.soum.sa/v2");
    expect(node).toHaveTextContent("Requests");
    // /v2/a and /v2/b belong here; the cdn host does not.
    const requestsRow = [...node.querySelectorAll(".gen-row")].find((r) => r.textContent?.includes("Requests"));
    expect(requestsRow?.textContent).toContain("2");
  });
});

describe("node chart", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setListMode("structure");
    const list = flows();
    stubApi(list);
    list.forEach((f) => useStore.getState().upsertFlow(f));
  });

  it("shows the same status distribution the summary reports", async () => {
    render(<App />);
    fireEvent.click(document.querySelector(".stree-host") as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: "Chart" }));

    const chart = await screen.findByRole("region", { name: "Status distribution" });
    expect(chart).toHaveTextContent("2xx");
    expect(chart).toHaveTextContent("5xx");
    expect(chart).toHaveTextContent("Server error");
  });
});

