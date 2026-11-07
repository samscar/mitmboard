import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../src/App";
import { useStore } from "../src/store";
import type { FlowDetail, FlowMeta, MapLocal } from "../src/types";

const mk = (id: string, o: Partial<FlowMeta> = {}): FlowMeta => ({
  id, timestamp: Date.now(), client: { ip: "1.1.1.1", label: "iPhone", kind: "phone" }, method: "GET",
  scheme: "https", host: "api.soum.sa", port: 443, path: "/v2/items?id=1", query: "id=1", http_version: "HTTP/2",
  request: { headers: [], size: 50 },
  response: { status: 200, reason: "OK", headers: [], size: 300, content_type: "application/json" },
  duration_ms: 120, state: "complete", error: null, ...o,
});

const detail = (f: FlowMeta): FlowDetail => ({
  ...f,
  request: { ...f.request, body: null },
  response: f.response ? { ...f.response, body: '{"ok":true}' } : null,
  timing: { start: f.timestamp, req_done: null, resp_start: null, resp_done: null, duration_ms: 120,
            connect_ms: null, tls_ms: null, ttfb_ms: null, download_ms: null },
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const err = (status: number) => ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

let savedRulePut: MapLocal | null;

function stubApi(flows: FlowMeta[], maplocal: MapLocal = { enabled: true, rules: [] }) {
  savedRulePut = null;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/flows") return ok(flows);
    if (url.startsWith("/api/flows/") && url.endsWith("/maplocal-file")) {
      return ok({ path: "/Users/u/.mitmboard/maplocal/abc123.json", size: 11 });
    }
    if (url.startsWith("/api/flows/")) return ok(detail(flows.find((f) => url.endsWith(f.id)) ?? flows[0]));
    if (url === "/api/maplocal" && method === "PUT") {
      savedRulePut = JSON.parse(String(init!.body)) as MapLocal;
      return ok(savedRulePut);
    }
    if (url === "/api/maplocal") return ok(maplocal);
    if (url.startsWith("/api/maplocal/files")) return ok({ path: "/Users/u/.mitmboard/maplocal/up.json", size: 3 });
    if (url === "/api/passthrough" || url === "/api/breakpoints" || url === "/api/paused") {
      return ok(url === "/api/breakpoints" ? { enabled: false, rules: [] } : []);
    }
    if (url === "/api/clients") return ok([]);
    return ok({});
  }));
}

const firstRow = () => document.querySelectorAll(".flowrow")[0] as HTMLElement;

describe("Map Local from a request row", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setMaplocal({ enabled: true, rules: [] });
    useStore.getState().setListMode("sequence");
  });

  it("right-clicking a request offers Map Local… and prefills host, path and method", async () => {
    stubApi([mk("a")]);
    useStore.getState().upsertFlow(mk("a"));
    render(<App />);

    fireEvent.contextMenu(firstRow(), { clientX: 40, clientY: 30 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Map Local…" }));

    await waitFor(() => expect(screen.getByRole("dialog", { name: "Map Local rule" })).toBeInTheDocument());
    expect(screen.getByLabelText("Host")).toHaveValue("api.soum.sa");
    expect(screen.getByLabelText("Path")).toHaveValue("/v2/items"); // query stripped: the matcher ignores it
    expect(screen.getByLabelText("Method")).toHaveValue("GET");
    expect(screen.getByLabelText("Status")).toHaveValue(200);
    expect(screen.getByText(/Query parameters are not part of the match/)).toBeInTheDocument();
  });

  it("uses the captured response as the file and saves the new rule first in the list", async () => {
    stubApi([mk("a")]);
    useStore.getState().upsertFlow(mk("a"));
    render(<App />);

    fireEvent.contextMenu(firstRow(), { clientX: 40, clientY: 30 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Map Local…" }));
    await waitFor(() => screen.getByRole("dialog", { name: "Map Local rule" }));

    fireEvent.click(screen.getByRole("button", { name: "Use captured response" }));
    await waitFor(() => expect(screen.getByLabelText("Local file")).toHaveValue("/Users/u/.mitmboard/maplocal/abc123.json"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(savedRulePut).not.toBeNull());
    expect(savedRulePut!.rules[0].file).toBe("/Users/u/.mitmboard/maplocal/abc123.json");
    expect(savedRulePut!.rules[0].method).toBe("GET");
    expect(useStore.getState().maplocal.rules).toHaveLength(1);
  });

  it("keeps the dialog open with a hint when no file is chosen", async () => {
    stubApi([mk("a")]);
    useStore.getState().upsertFlow(mk("a"));
    render(<App />);

    fireEvent.contextMenu(firstRow(), { clientX: 40, clientY: 30 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Map Local…" }));
    await waitFor(() => screen.getByRole("dialog", { name: "Map Local rule" }));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText(/Use the captured response, choose a file, or type a path/)).toBeInTheDocument());
    expect(savedRulePut).toBeNull();
  });
});

describe("MAPPED marker", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setMaplocal({ enabled: true, rules: [] });
    useStore.getState().setListMode("sequence");
  });

  it("shows the badge on a hit and names the file in the detail overview", async () => {
    const hit = mk("a", { maplocal_rule_id: "r1", maplocal_file: "/tmp/mock.json" });
    stubApi([hit]);
    useStore.getState().upsertFlow(hit);
    render(<App />);

    expect(screen.getByText("MAPPED")).toBeInTheDocument();

    fireEvent.click(firstRow());
    fireEvent.click(await screen.findByRole("button", { name: "Notes" }));
    await waitFor(() => expect(screen.getByText(/Mapped to local file: \/tmp\/mock\.json/)).toBeInTheDocument());
  });

  it("notes that the rule is gone once it no longer exists", async () => {
    const hit = mk("a", { maplocal_rule_id: "gone", maplocal_file: "/tmp/mock.json" });
    stubApi([hit]);
    useStore.getState().upsertFlow(hit);
    render(<App />);

    fireEvent.click(firstRow());
    fireEvent.click(await screen.findByRole("button", { name: "Notes" }));
    await waitFor(() => expect(screen.getByText(/Mapped to local file: \/tmp\/mock\.json \(rule deleted\)/)).toBeInTheDocument());
  });

  it("does not mark flows that were never mapped", () => {
    stubApi([mk("b")]);
    useStore.getState().upsertFlow(mk("b"));
    render(<App />);
    expect(screen.queryByText("MAPPED")).toBeNull();
  });
});

describe("Map Local upload limit", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setMaplocal({ enabled: true, rules: [] });
    useStore.getState().setListMode("sequence");
  });

  it("explains the 20 MB limit when an upload is rejected", async () => {
    stubApi([mk("a")]);
    useStore.getState().upsertFlow(mk("a"));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.startsWith("/api/maplocal/files")) return err(422);
      if (url === "/api/flows") return ok([mk("a")]);
      if (url === "/api/maplocal") return ok({ enabled: true, rules: [] });
      if (url === "/api/passthrough" || url === "/api/paused" || url === "/api/clients") return ok([]);
      if (url === "/api/breakpoints") return ok({ enabled: false, rules: [] });
      return ok(detail(mk("a")));
    }));
    render(<App />);

    fireEvent.contextMenu(firstRow(), { clientX: 40, clientY: 30 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Map Local…" }));
    await waitFor(() => screen.getByRole("dialog", { name: "Map Local rule" }));

    const file = new File(["x"], "big.bin", { type: "application/octet-stream" });
    fireEvent.change(screen.getByLabelText("Choose file"), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/larger than 20 MB/)).toBeInTheDocument());
  });
});

describe("a mapped request in the detail pane", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setListMode("sequence");
  });

  it("offers edit and disable instead of a second Map Local rule", async () => {
    const hit = mk("a", { maplocal_rule_id: "r1", maplocal_file: "/managed/a.json" });
    const mapped = { id: "r1", enabled: true, host: "api.soum.sa", path: "/v2/items", method: "GET",
                     file: "/managed/a.json", status: 200 };
    stubApi([hit], { enabled: true, rules: [mapped] });
    useStore.getState().setMaplocal({ enabled: true, rules: [mapped] });
    useStore.getState().upsertFlow(hit);
    render(<App />);

    fireEvent.click(firstRow());
    await waitFor(() => screen.getByRole("button", { name: "Edit Map Local rule…" }));
    expect(screen.getByRole("button", { name: "Disable this rule" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Map Local…" })).toBeNull();
  });
});

