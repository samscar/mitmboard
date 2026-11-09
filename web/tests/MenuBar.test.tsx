import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MenuBar } from "../src/components/MenuBar";
import { clearFlows } from "../src/api";
import { useStore } from "../src/store";
import { useUi } from "../src/uiStore";

vi.mock("../src/api", () => ({
  clearFlows: vi.fn(() => Promise.resolve({ ok: true })),
  download: vi.fn(() => Promise.resolve()),
  fetchFlows: vi.fn(() => Promise.resolve([])),
  loadSession: vi.fn(() => Promise.resolve({})),
  replay: vi.fn(() => Promise.resolve({})),
  saveBreakpoints: vi.fn((b: unknown) => Promise.resolve(b)),
}));

const openMenu = (label: string) =>
  fireEvent.click(screen.getByRole("menuitem", { name: label }));

describe("MenuBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.getState().clear();
    useStore.getState().setListMode("sequence");
  });

  it("carries Charles' eight top-level menus in order", () => {
    render(<MenuBar />);
    const titles = [...document.querySelectorAll(".mb-title")].map((n) => n.textContent);
    expect(titles).toEqual(["Mitmboard", "File", "Edit", "View", "Proxy", "Tools", "Window", "Help"]);
  });

  it("runs File → Clear Session", async () => {
    useStore.getState().upsertFlow({
      id: "f1", timestamp: 1, client: { ip: "1.1.1.1", label: "x" }, method: "GET",
      scheme: "https", host: "a.b", port: 443, path: "/x", query: "", http_version: "HTTP/2",
      request: { headers: [], size: 0 }, response: null, duration_ms: null, state: "pending", error: null,
    });
    render(<MenuBar />);
    openMenu("File");
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear Session" }));
    // Clearing waits for the server call to land before wiping the store.
    await waitFor(() => expect(useStore.getState().flows.size).toBe(0));
    expect(clearFlows).toHaveBeenCalled();
  });

  it("switches the view from View → Structure", () => {
    render(<MenuBar />);
    openMenu("View");
    fireEvent.click(screen.getByRole("menuitem", { name: "Structure" }));
    expect(useStore.getState().listMode).toBe("structure");
  });

  it("keeps Charles commands Mitmboard has not implemented visible but inert", () => {
    render(<MenuBar />);
    openMenu("File");
    const newSession = screen.getByRole("menuitem", { name: "New Session" });
    expect(newSession).toHaveAttribute("aria-disabled", "true");
  });

  it("closes on Escape", () => {
    render(<MenuBar />);
    openMenu("File");
    expect(screen.getByRole("menuitem", { name: "New Session" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menuitem", { name: "New Session" })).toBeNull();
  });

  it("opens a submenu, so Help → SSL Proxying keeps Charles' nesting", () => {
    render(<MenuBar />);
    openMenu("Help");
    const ssl = screen.getByRole("menuitem", { name: "SSL Proxying" });
    fireEvent.mouseEnter(ssl.parentElement as HTMLElement);
    expect(screen.getByRole("menuitem", { name: /Install Root Certificate on a Mobile Device/ })).toBeInTheDocument();
  });

  it("keeps the submenu open while the pointer moves into its rows", () => {
    // Regression: hovering a row inside the submenu used to close the submenu
    // itself, making "SSL Proxying → Install … on a Mobile Device" unreachable.
    render(<MenuBar />);
    openMenu("Help");
    const ssl = screen.getByRole("menuitem", { name: "SSL Proxying" });
    fireEvent.mouseEnter(ssl.parentElement as HTMLElement);

    const child = screen.getByRole("menuitem", { name: /Install Root Certificate on a Mobile Device/ });
    fireEvent.mouseEnter(child.closest(".mb-row") as HTMLElement);

    // The rest of the submenu must still be there.
    expect(screen.getByRole("menuitem", { name: "Save Root Certificate…" })).toBeInTheDocument();
    // And the entry is clickable.
    fireEvent.click(child);
    expect(useUi.getState().dialog).toBe("connect");
  });
});
