import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../src/App";
import { useStore } from "../src/store";
import type { PassthroughHost } from "../src/types";

const host = (o: Partial<PassthroughHost>): PassthroughHost => ({
  host: "h.example.com", source: "auto", active: true, failures: 1,
  clients: [], first_seen: 0, last_seen: 0, ...o,
});

const ENTRIES = [
  host({ host: "pinned.example.com", active: true, failures: 3 }),
  host({ host: "watch.example.com", active: false, failures: 1 }),
  host({ host: "cfg.example.com", source: "config", active: true, failures: 2 }),
];

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

let current: PassthroughHost[];
let deleteStatus: number;

function stubApi() {
  current = [...ENTRIES];
  deleteStatus = 200;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/passthrough") return ok(current);
    if (url.startsWith("/api/passthrough/") && (init?.method ?? "GET") === "DELETE") {
      if (deleteStatus !== 200) return { ok: false, status: deleteStatus, json: async () => ({}) } as unknown as Response;
      const removed = decodeURIComponent(url.split("/").pop() as string);
      current = current.filter((p) => p.host !== removed);
      return ok({ removed: true });
    }
    if (url === "/api/flows") return ok([]);
    if (url === "/api/maplocal") return ok({ enabled: true, rules: [] });
    if (url === "/api/breakpoints") return ok({ enabled: false, rules: [] });
    if (url === "/api/paused" || url === "/api/clients") return ok([]);
    return ok({});
  }));
}

describe("passthrough modal", () => {
  beforeEach(() => {
    useStore.getState().clear();
    stubApi();
    useStore.getState().setPassthrough(ENTRIES);
  });

  it("opens from the top-bar count and lists hosts with their state", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /2 passthrough/ }));

    const modal = await screen.findByRole("dialog", { name: "Passthrough hosts" });
    expect(modal).toHaveTextContent("pinned.example.com");
    expect(modal).toHaveTextContent("pinned · 3 refused");
    expect(modal).toHaveTextContent("watching · 1 refused");
    expect(modal).toHaveTextContent("config");
  });

  it("offers Retry only for pinned, non-config hosts", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /2 passthrough/ }));
    const modal = await screen.findByRole("dialog", { name: "Passthrough hosts" });

    expect(modal.querySelectorAll("button.chip")).toHaveLength(2); // retry + close
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toBeInTheDocument();
  });

  it("removes the host from the list after a successful retry", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /2 passthrough/ }));
    await screen.findByRole("dialog", { name: "Passthrough hosts" });

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.queryByText("pinned.example.com")).toBeNull());
    expect(useStore.getState().passthrough.map((p) => p.host)).toEqual(["watch.example.com", "cfg.example.com"]);
  });

  it("keeps the row and shows an inline error when retry is refused", async () => {
    deleteStatus = 409;
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /2 passthrough/ }));
    await screen.findByRole("dialog", { name: "Passthrough hosts" });

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByText("Couldn't remove — try again")).toBeInTheDocument());
    expect(screen.getByText("pinned.example.com")).toBeInTheDocument();
  });
});
