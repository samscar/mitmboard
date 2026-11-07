import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DetailPane } from "../src/components/DetailPane";
import { useStore } from "../src/store";
import type { FlowDetail, PausedEntry } from "../src/types";

vi.mock("../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api")>();
  return { ...actual, resumePaused: vi.fn(), dropPaused: vi.fn() };
});

const detail: FlowDetail = {
  id: "a", timestamp: 1, client: { ip: "1.1.1.1", label: "x" }, method: "GET",
  scheme: "https", host: "api.soum.sa", port: 443, path: "/v2/x", query: "", http_version: "HTTP/2",
  request: { headers: [["accept", "*/*"]], size: 0, body: null },
  response: { status: 200, reason: "OK", headers: [["content-type", "application/json"]], size: 3, content_type: "application/json", body: '{"ok":true}' },
  duration_ms: 142, state: "complete", error: null,
  timing: { start: 1, req_done: 1, resp_start: 1, resp_done: 143, duration_ms: 142, connect_ms: null, tls_ms: null, ttfb_ms: 100, download_ms: 10 },
};

describe("DetailPane layout", () => {
  beforeEach(() => useStore.getState().select("a", detail));

  it("shows one line with method, URL and status above the tabs", () => {
    render(<DetailPane />);
    expect(screen.getByText("https://api.soum.sa/v2/x")).toBeInTheDocument();
    expect(screen.getByText("GET")).toBeInTheDocument();
    expect(screen.getAllByText("200").length).toBeGreaterThan(0);
  });

  it("offers Overview, Contents, Summary and Notes", () => {
    render(<DetailPane />);
    for (const name of ["Overview", "Contents", "Summary", "Notes"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("calls the client row Device in Overview", () => {
    render(<DetailPane />);
    expect(screen.getByText("Device")).toBeInTheDocument();
    expect(screen.queryByText("Client")).toBeNull();
  });

  it("splits Contents into a request pane above a response pane, headers separated", () => {
    render(<DetailPane />);
    fireEvent.click(screen.getByRole("button", { name: "Contents" }));

    expect(screen.getByLabelText("Request contents")).toBeInTheDocument();
    expect(screen.getByLabelText("Response contents")).toBeInTheDocument();
    expect(screen.getByText("accept")).toBeInTheDocument();        // request-only header
    expect(screen.getByText("content-type")).toBeInTheDocument();  // response-only header
  });

  it("shows query parameters and cookies in their own request sub-tabs", () => {
    const withQuery: FlowDetail = {
      ...detail,
      path: "/v2/x?page=2&q=hello",
      query: "page=2&q=hello",
      request: { headers: [["cookie", "sid=abc; theme=dark"]], size: 0, body: null },
    };
    useStore.getState().select("a", withQuery);
    render(<DetailPane />);
    fireEvent.click(screen.getByRole("button", { name: "Contents" }));

    fireEvent.click(screen.getByRole("button", { name: "Query" }));
    expect(screen.getByText("page")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cookies" }));
    expect(screen.getByText("sid")).toBeInTheDocument();
    expect(screen.getByText("dark")).toBeInTheDocument();
  });

  it("shows request and response JSON in their own panes", () => {
    const post: FlowDetail = {
      ...detail,
      method: "POST",
      request: { headers: [["content-type", "application/json"]], size: 10, body: '{"name":"x"}' },
    };
    useStore.getState().select("a", post);
    render(<DetailPane />);
    fireEvent.click(screen.getByRole("button", { name: "Contents" }));

    const jsonButtons = screen.getAllByRole("button", { name: "Json" });
    fireEvent.click(jsonButtons[0]);
    expect(screen.getByText(/"name"/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Json" })[1]);
    expect(screen.getByText(/"ok"/)).toBeInTheDocument();
  });

  it("shows a binary-body note when a request body was not decoded", () => {
    const binaryDetail: FlowDetail = {
      ...detail,
      method: "POST",
      request: { headers: [["content-type", "application/octet-stream"]], size: 2048, body: null },
    };
    useStore.getState().select("a", binaryDetail);
    render(<DetailPane />);
    fireEvent.click(screen.getByRole("button", { name: "Contents" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Text" })[0]);
    expect(screen.getByText("binary body, 2048 bytes")).toBeInTheDocument();
  });
});

describe("DetailPane live ws meta", () => {
  const wsDetail: FlowDetail = {
    ...detail, id: "w", kind: "ws", response: null,
    ws: { messages: 2, open: true, closed_by: null, close_code: null, close_reason: null },
  };

  it("updates the Overview Frames line from a live upsertFlow without re-selecting", async () => {
    useStore.getState().clear();
    useStore.getState().upsertFlow({ ...wsDetail });
    useStore.getState().select("w", wsDetail);
    render(<DetailPane />);
    fireEvent.click(screen.getByRole("button", { name: /Overview/i }));
    expect(screen.getByText("2 · open")).toBeInTheDocument();
    useStore.getState().upsertFlow({ ...wsDetail, ws: { messages: 7, open: true, closed_by: null, close_code: null, close_reason: null } });
    await waitFor(() => expect(screen.getByText("7 · open")).toBeInTheDocument());
  });

  it("makes the Messages tab reachable once a plain-selected row turns out to be a ws flow", () => {
    // A row can be selected while it is still a pending/plain flow.new event,
    // before the websocket_start update tags it kind: "ws" -- the detail
    // pane must react to that live upgrade even though `detail` itself
    // (fetched once at selection time) is stale.
    useStore.getState().clear();
    const plainMeta = { ...wsDetail, kind: undefined, ws: null };
    useStore.getState().upsertFlow(plainMeta);
    useStore.getState().select("w", plainMeta as FlowDetail);
    useStore.getState().upsertFlow({ ...wsDetail, ws: { messages: 3, open: true, closed_by: null, close_code: null, close_reason: null } });
    render(<DetailPane />);
    expect(screen.getByRole("button", { name: /Messages/i })).toBeInTheDocument();
  });
});

describe("DetailPane paused editor keying", () => {
  const flowA: FlowDetail = {
    ...detail, id: "pa", response: null, state: "paused_request",
    request: { headers: [["content-type", "application/json"]], size: 6, body: "A-body" },
  };
  const flowB: FlowDetail = {
    ...detail, id: "pb", response: null, state: "paused_request",
    request: { headers: [["content-type", "application/json"]], size: 6, body: "B-body" },
  };
  const baseEntry: Omit<PausedEntry, "flow"> = {
    flow_id: "pa", phase: "request", rule_id: "r", since: 0, deadline: Date.now() / 1000 + 45,
  };

  it("does not leak a previous paused flow's local edits when the selection switches to a different paused flow", async () => {
    useStore.getState().clear();
    useStore.getState().addPaused({ ...baseEntry, flow_id: "pa" }, flowA);
    useStore.getState().addPaused({ ...baseEntry, flow_id: "pb" }, flowB);
    useStore.getState().select("pa", flowA);
    render(<DetailPane />);
    fireEvent.change(screen.getByLabelText(/^body$/i), { target: { value: "EDITED" } });
    expect(screen.getByLabelText(/^body$/i)).toHaveValue("EDITED");

    useStore.getState().select("pb", flowB);
    await waitFor(() => expect(screen.getByLabelText(/^body$/i)).toHaveValue("B-body"));
  });
});
