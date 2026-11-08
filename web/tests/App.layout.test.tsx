import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { App } from "../src/App";
import { useStore } from "../src/store";
import type { FlowMeta } from "../src/types";

const mk = (id: string): FlowMeta => ({
  id, timestamp: Date.now(), client: { ip: "1.1.1.1", label: "iPhone", kind: "phone" }, method: "GET",
  scheme: "https", host: "api.soum.sa", port: 443, path: "/v2/" + id, query: "", http_version: "HTTP/2",
  request: { headers: [], size: 50 },
  response: { status: 200, reason: "OK", headers: [], size: 300, content_type: "application/json" },
  duration_ms: 120, state: "complete", error: null,
});

describe("Inspector layout", () => {
  beforeEach(() => useStore.getState().clear());

  it("shows the first-run empty state when there are no flows", () => {
    render(<App />);
    expect(screen.getByText(/Waiting for traffic/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect a device/i })).toBeInTheDocument();
  });

  it("has no Devices or Dashboard top-level pages any more", () => {
    useStore.getState().upsertFlow(mk("1"));
    render(<App />);
    expect(screen.queryByRole("tab", { name: "Devices" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Dashboard" })).toBeNull();
  });

  it("puts the Sequence/Structure switch in the toolbar, not a panel header", () => {
    useStore.getState().upsertFlow(mk("1"));
    render(<App />);

    // Charles keeps the switch in the window toolbar; the panel has no header.
    expect(document.querySelector(".listpanel .lp-head")).toBeNull();
    expect(document.querySelector(".topbar .view-switch")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Structure" }));
    expect(document.querySelector(".listpanel .stree")).toBeInTheDocument();
  });

  it("pins the filter box to the bottom of the tree panel", () => {
    useStore.getState().upsertFlow(mk("1"));
    render(<App />);
    const panel = document.querySelector(".listpanel") as HTMLElement;
    expect(panel.querySelector(".filterbar")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter")).toBeInTheDocument();
    // No device sidebar, and the detail pane is the only other column.
    expect(document.querySelector(".sidebar")).toBeNull();
  });
});

describe("top bar and status bar chrome", () => {
  beforeEach(() => useStore.getState().clear());

  it("mirrors Charles' toolbar, each icon labelled in a tooltip", () => {
    useStore.getState().upsertFlow(mk("1"));
    render(<App />);

    const labels = [...document.querySelectorAll(".topbar .tb-icon")].map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Clear Session", "Compose", "Repeat",
      "macOS Proxy", "Start Recording", "SSL Proxying", "Throttling", "Breakpoints",
    ]);
  });

  it("marks Repeat inert until a request is selected", () => {
    useStore.getState().upsertFlow(mk("1"));
    render(<App />);
    expect(screen.getByLabelText("Repeat")).toHaveAttribute("aria-disabled", "true");
  });

  it("opens Breakpoints from the status bar", async () => {
    useStore.getState().upsertFlow(mk("1"));
    render(<App />);

    fireEvent.click(document.querySelector(".statusbar .sb-bp") as HTMLElement);
    expect(await screen.findByRole("heading", { name: "Breakpoints" })).toBeInTheDocument();
  });
});
