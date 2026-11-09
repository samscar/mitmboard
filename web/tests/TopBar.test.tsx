import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TopBar } from "../src/components/TopBar";
import { useStore } from "../src/store";

vi.mock("../src/api", () => ({
  clearFlows: vi.fn(() => Promise.resolve({ ok: true })),
  download: vi.fn(),
  fetchFlows: vi.fn(() => Promise.resolve([])),
  loadSession: vi.fn(() => Promise.resolve({})),
  replay: vi.fn(() => Promise.resolve({})),
  caInfo: vi.fn(() => Promise.resolve({ present: true })),
  fetchConnectInfo: vi.fn(() => Promise.resolve({ proxy_hint: "127.0.0.1:8080" })),
}));

describe("TopBar window drag region (Tauri desktop shell)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.getState().clear();
  });

  it("marks the root topbar element as a Tauri drag region", () => {
    const { container } = render(<TopBar />);
    expect(container.querySelector(".topbar")).toHaveAttribute("data-tauri-drag-region");
  });
});

describe("TopBar mirrors Charles' toolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.getState().clear();
  });

  it("puts the Structure/Sequence switch in the toolbar rather than the panel", () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "Structure" }));
    expect(useStore.getState().listMode).toBe("structure");
    fireEvent.click(screen.getByRole("button", { name: "Sequence" }));
    expect(useStore.getState().listMode).toBe("sequence");
  });

  it("keeps the unimplemented Charles buttons visible but inert", () => {
    render(<TopBar />);
    for (const label of ["Compose", "macOS Proxy", "Start Recording", "SSL Proxying", "Throttling"]) {
      // aria-disabled rather than the native attribute, so hover tooltips work.
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("labels every icon button, including the greyed ones", () => {
    render(<TopBar />);
    for (const label of ["Compose", "Start Recording"]) {
      expect(screen.getByRole("button", { name: label }))
        .toHaveAttribute("data-tip", `${label} — not implemented yet`);
    }
  });

  it("leaves the implemented ones enabled", () => {
    render(<TopBar />);
    expect(screen.getByRole("button", { name: "Clear Session" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Breakpoints" })).toBeEnabled();
  });

  it("marks Repeat inert until a request is selected", () => {
    render(<TopBar />);
    expect(screen.getByRole("button", { name: "Repeat" })).toHaveAttribute("aria-disabled", "true");
  });
});
