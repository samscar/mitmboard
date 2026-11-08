import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DetailPane } from "../src/components/DetailPane";
import { useStore } from "../src/store";
import { useUi } from "../src/uiStore";
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
  beforeEach(() => {
    useStore.getState().select("a", detail);
    useUi.setState({ detailTab: "overview", reqView: "headers", respView: "headers", reqShare: 0.5 });
  });

  it("shows one line with method, URL and status above the tabs", () => {
    render(<DetailPane />);
    expect(screen.getByText("https://api.soum.sa/v2/x")).toBeInTheDocument();
    expect(screen.getByText("GET")).toBeInTheDocument();
    expect(screen.getAllByText("200").length).toBeGreaterThan(0);
  });

  it("uses Charles 5.2.2's tabs: Overview, Contents, Summary, Chart, Notes", () => {
    render(<DetailPane />);
    for (const name of ["Overview", "Contents", "Summary", "Chart", "Notes"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("calls the client row Device in Overview", () => {
    render(<DetailPane />);
    expect(screen.getByText("Device")).toBeInTheDocument();
    expect(screen.queryByText("Client")).toBeNull();
  });

  it("shows request above response at the same time inside Contents", () => {
    render(<DetailPane />);
    fireEvent.click(screen.getByRole("button", { name: "Contents" }));

    expect(screen.getByLabelText("Request contents")).toBeInTheDocument();
    expect(screen.getByLabelText("Response contents")).toBeInTheDocument();
    expect(screen.getByText("accept")).toBeInTheDocument();        // request-only header
    expect(screen.getByText("content-type")).toBeInTheDocument();  // response-only header
  });

  it("shows query parameters and cookies in their own request viewers", () => {
    const withQuery: FlowDetail = {
      ...detail,
      path: "/v2/x?page=2&q=hello",
      query: "page=2&q=hello",
      request: { headers: [["cookie", "sid=abc; theme=dark"]], size: 0, body: null },
    };
    useStore.getState().select("a", withQuery);
    render(<DetailPane />);
    fireEvent.click(screen.getByRole("button", { name: "Contents" }));

    fireEvent.click(screen.getByRole("button", { name: "Query String" }));
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

    const jsonButtons = screen.getAllByRole("button", { name: "JSON" });
    fireEvent.click(jsonButtons[0]);
    expect(screen.getByText(/"name"/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "JSON" })[1]);
    expect(screen.getByText(/"ok"/)).toBeInTheDocument();
  });

  it("renders the JSON viewer as colored text: keys, values and gutter keep their classes", () => {
    render(<DetailPane />);
    fireEvent.click(screen.getByRole("button", { name: "Contents" }));
    fireEvent.click(screen.getAllByRole("button", { name: "JSON" })[1]);
    expect(screen.getByText('"ok"')).toHaveClass("jv-key");
    expect(screen.getByText("true")).toHaveClass("jv-boolean");
    expect(document.querySelector(".jv-line .jv-punct")).not.toBeNull();
  });

  it("falls back to plain text when the body is not JSON", () => {
    const bad: FlowDetail = {
      ...detail,
      response: { ...detail.response!, body: "not json at all" },
    };
    useStore.getState().select("a", bad);
    render(<DetailPane />);
    fireEvent.click(screen.getByRole("button", { name: "Contents" }));
    fireEvent.click(screen.getAllByRole("button", { name: "JSON" })[1]);
    expect(screen.getByText("not json at all")).toBeInTheDocument();
    expect(screen.queryByText(/Body is not JSON/)).toBeNull();
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

  it("keeps the chosen tab and viewers sticky across selection changes", async () => {
    const other: FlowDetail = {
      ...detail, id: "b", path: "/v2/y?page=9",
      query: "page=9",
      request: { headers: [["x-other", "1"]], size: 0, body: null },
    };
    useStore.getState().select("a", detail);
    render(<DetailPane />);
    fireEvent.click(screen.getByRole("button", { name: "Contents" }));
    fireEvent.click(screen.getByRole("button", { name: "Query String" }));

    // Walking to another request keeps "Contents + Query String", as Charles does.
    useStore.getState().select("b", other);
    await waitFor(() => expect(screen.getByText("page")).toBeInTheDocument());
    expect(screen.getByLabelText("Request contents")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("has no action-button row: those commands live in the context menu", () => {
    render(<DetailPane />);
    expect(document.querySelector(".detail-actions")).toBeNull();
    for (const name of ["Repeat", "Edit & Resend", "Copy as cURL"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("sizes the request pane from the draggable split share", () => {
    useUi.setState({ detailTab: "contents", reqShare: 0.7 });
    render(<DetailPane />);
    const req = screen.getByLabelText("Request contents") as HTMLElement;
    expect(req.style.height).toBe("70%");
    expect(screen.getByLabelText("Resize response pane")).toBeInTheDocument();

    // The share clamps so neither pane can be dragged out of existence.
    useUi.getState().setReqShare(5);
    expect(useUi.getState().reqShare).toBe(0.85);
    useUi.getState().setReqShare(0.01);
    expect(useUi.getState().reqShare).toBe(0.15);
  });

  it("renders the Summary tab as a resource table, not the timing chart", () => {
    render(<DetailPane />);
    fireEvent.click(screen.getByRole("button", { name: "Summary" }));
    expect(screen.getByRole("columnheader", { name: "Resource" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Mime Type" })).toBeInTheDocument();
    expect(screen.getByText("application/json")).toBeInTheDocument();
  });

  it("renders the Chart tab as a timeline waterfall", () => {
    render(<DetailPane />);
    fireEvent.click(screen.getByRole("button", { name: "Chart" }));
    expect(screen.getByText(/Timeline/)).toBeInTheDocument();
    expect(document.querySelectorAll(".wf-row").length).toBe(1);
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
    useUi.setState({ detailTab: "overview", reqView: "headers", respView: "headers" });
    render(<DetailPane />);
    fireEvent.click(screen.getByRole("button", { name: /Overview/i }));
    expect(screen.getByText("2 · open")).toBeInTheDocument();
    useStore.getState().upsertFlow({ ...wsDetail, ws: { messages: 7, open: true, closed_by: null, close_code: null, close_reason: null } });
    await waitFor(() => expect(screen.getByText("7 · open")).toBeInTheDocument());
  });

  it("makes the WebSocket tab reachable once a plain-selected row turns out to be a ws flow", () => {
    // A row can be selected while it is still a pending/plain flow.new event,
    // before the websocket_start update tags it kind: "ws" -- the detail
    // pane must react to that live upgrade even though `detail` itself
    // (fetched once at selection time) is stale.
    useStore.getState().clear();
    const plainMeta = { ...wsDetail, kind: undefined, ws: null };
    useStore.getState().upsertFlow(plainMeta);
    useStore.getState().select("w", plainMeta as FlowDetail);
    useStore.getState().upsertFlow({ ...wsDetail, ws: { messages: 3, open: true, closed_by: null, close_code: null, close_reason: null } });
    useUi.setState({ detailTab: "overview", reqView: "headers", respView: "headers" });
    render(<DetailPane />);
    expect(screen.getByRole("button", { name: /WebSocket/i })).toBeInTheDocument();
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
    useUi.setState({ detailTab: "overview" });
    render(<DetailPane />);
    fireEvent.change(screen.getByLabelText(/^body$/i), { target: { value: "EDITED" } });
    expect(screen.getByLabelText(/^body$/i)).toHaveValue("EDITED");

    useStore.getState().select("pb", flowB);
    await waitFor(() => expect(screen.getByLabelText(/^body$/i)).toHaveValue("B-body"));
  });
});
