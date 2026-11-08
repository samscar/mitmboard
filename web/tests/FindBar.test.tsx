import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DetailPane } from "../src/components/DetailPane";
import { useStore } from "../src/store";
import { useUi } from "../src/uiStore";
import { findMatches } from "../src/json/highlight";
import type { FlowDetail } from "../src/types";

vi.mock("../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api")>();
  return { ...actual, resumePaused: vi.fn(), dropPaused: vi.fn() };
});

const detail: FlowDetail = {
  id: "a", timestamp: 1, client: { ip: "1.1.1.1", label: "x" }, method: "GET",
  scheme: "https", host: "api.x.io", port: 443, path: "/v1/x", query: "", http_version: "HTTP/2",
  request: { headers: [["accept", "*/*"]], size: 0, body: null },
  response: {
    status: 200, reason: "OK", headers: [["content-type", "application/json"]], size: 40,
    content_type: "application/json",
    body: JSON.stringify({ retcode: 0, locker_id: 1, locker_name: "A", next_locker_id: 2, next_locker_name: "B" }),
  },
  duration_ms: 10, state: "complete", error: null,
  timing: { start: 1, req_done: 1, resp_start: 1, resp_done: 11, duration_ms: 10, connect_ms: null, tls_ms: null, ttfb_ms: 5, download_ms: 5 },
};

/** Only the response bar is open in most tests: input [1] = response, [0] = request. */
function openResponseFind() {
  fireEvent.click(screen.getByRole("button", { name: "Contents" }));
  fireEvent.click(screen.getAllByRole("button", { name: "JSON" })[1]);
  fireEvent.click(screen.getByRole("button", { name: "Find in response body" }));
}

describe("findMatches", () => {
  it("is case-insensitive, per-line and non-overlapping, in reading order", () => {
    const m = findMatches('{"A": 1}\n"a" after a a', "a");
    expect(m.map((x) => [x.line, x.start])).toEqual([[0, 2], [1, 1], [1, 4], [1, 10], [1, 12]]);
  });
  it("returns nothing for an empty query", () => {
    expect(findMatches("abc", "")).toEqual([]);
  });
});

describe("DetailPane body find bar", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().select("a", detail);
    useUi.setState({
      detailTab: "overview", reqView: "headers", respView: "headers", reqShare: 0.5,
      findReq: "", findResp: "", findReqOpen: false, findRespOpen: false,
    });
  });

  it("appears only on body viewers: no toggle on Headers, one on JSON", () => {
    render(<DetailPane />);
    fireEvent.click(screen.getByRole("button", { name: "Contents" }));
    expect(screen.queryByRole("button", { name: "Find in response body" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "JSON" })[1]);
    expect(screen.getByRole("button", { name: "Find in response body" })).toBeInTheDocument();
  });

  it("highlights every match and steps through them with wrap-around", () => {
    render(<DetailPane />);
    openResponseFind();
    const input = screen.getByLabelText("Find in body");
    fireEvent.change(input, { target: { value: "locker_name" } });
    expect(document.querySelectorAll(".jv-find")).toHaveLength(2);
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Find Next" }));
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    expect(document.querySelector(".jv-find-current")).not.toBeNull();
    // Wrap around: next from the last lands back on the first.
    fireEvent.click(screen.getByRole("button", { name: "Find Next" }));
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Find Prev" }));
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
  });

  it("marks the current match stronger and keeps token color classes on marks", () => {
    render(<DetailPane />);
    openResponseFind();
    const input = screen.getByLabelText("Find in body");
    fireEvent.change(input, { target: { value: "retcode" } });
    const mark = document.querySelector("mark.jv-find")!;
    expect(mark).toHaveClass("jv-key");          // token color survives the mark
    expect(mark).toHaveClass("jv-find-current"); // single match is current
  });

  it("shows 0 results without a dialog when nothing matches", () => {
    render(<DetailPane />);
    openResponseFind();
    const input = screen.getByLabelText("Find in body");
    fireEvent.change(input, { target: { value: "no-such-field" } });
    expect(screen.getByText("0 results")).toBeInTheDocument();
    expect(input).toHaveClass("is-empty");
    expect(screen.getByRole("button", { name: "Find Next" })).toBeDisabled();
  });

  it("searches request and response independently", () => {
    render(<DetailPane />);
    fireEvent.click(screen.getByRole("button", { name: "Contents" }));
    fireEvent.click(screen.getAllByRole("button", { name: "JSON" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "JSON" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Find in request body" }));
    fireEvent.click(screen.getByRole("button", { name: "Find in response body" }));
    const inputs = screen.getAllByLabelText("Find in body") as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: "req-only" } });
    fireEvent.change(inputs[1], { target: { value: "locker_id" } });
    // "locker_id" also matches inside "next_locker_id" — substring semantics.
    expect(screen.getByText("0 results")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("supports Enter as Find Next and Shift+Enter as Find Prev", () => {
    render(<DetailPane />);
    openResponseFind();
    const input = screen.getByLabelText("Find in body");
    fireEvent.change(input, { target: { value: "locker_" } });
    expect(screen.getByText("1 of 4")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("2 of 4")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.getByText("1 of 4")).toBeInTheDocument();
    // Wrap backwards from the first match.
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.getByText("4 of 4")).toBeInTheDocument();
  });

  it("keeps the query across selection changes and recomputes matches", () => {
    const other: FlowDetail = {
      ...detail, id: "b", path: "/v1/y",
      response: { ...detail.response!, body: JSON.stringify({ retcode: 0, locker_name: "ZZZ" }) },
    };
    useStore.getState().upsertFlow(other);
    render(<DetailPane />);
    openResponseFind();
    const input = screen.getByLabelText("Find in body");
    fireEvent.change(input, { target: { value: "locker_name" } });
    expect(screen.getByText("1 of 2")).toBeInTheDocument();

    act(() => { useStore.getState().select("b", other); });
    expect((screen.getByLabelText("Find in body") as HTMLInputElement).value).toBe("locker_name");
    expect(screen.getByText("1 of 1")).toBeInTheDocument(); // recomputed for the new body
  });

  it("closes via the close button and Escape", () => {
    render(<DetailPane />);
    openResponseFind();
    expect(screen.getByRole("search", { name: "Find bar" })).toBeInTheDocument();
    const input = screen.getByLabelText("Find in body");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("search", { name: "Find bar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Find in response body" }));
    fireEvent.click(screen.getByRole("button", { name: "Close find bar" }));
    expect(screen.queryByRole("search", { name: "Find bar" })).toBeNull();
  });
});
