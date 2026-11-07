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
    expect(document.querySelector(".view-switch")).toBeNull();
  });

  it("keeps the Sequence/Structure switch in the tree panel header", () => {
    useStore.getState().upsertFlow(mk("1"));
    render(<App />);

    const head = document.querySelector(".listpanel .lp-head") as HTMLElement;
    expect(head).toBeInTheDocument();
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

  it("keeps only icon actions, each with a tooltip label", () => {
    useStore.getState().upsertFlow(mk("1"));
    render(<App />);

    const labels = [...document.querySelectorAll(".topbar .tb-icon")].map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(["Clear", "Replay", "Connect device", "Export", "Map Local", "Settings"]);
    expect(document.querySelector(".topbar")!.textContent).not.toContain("Recording");
  });

  it("disables Replay until a request is selected", () => {
    useStore.getState().upsertFlow(mk("1"));
    render(<App />);
    expect(screen.getByLabelText("Replay")).toBeDisabled();
  });

  it("opens Breakpoints from the status bar", async () => {
    useStore.getState().upsertFlow(mk("1"));
    render(<App />);

    fireEvent.click(document.querySelector(".statusbar .sb-bp") as HTMLElement);
    expect(await screen.findByRole("heading", { name: "Breakpoints" })).toBeInTheDocument();
  });
});

