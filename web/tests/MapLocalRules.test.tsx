import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../src/App";
import { useStore } from "../src/store";
import type { FlowDetail, FlowMeta, MapLocal } from "../src/types";

const mk = (id: string, o: Partial<FlowMeta> = {}): FlowMeta => ({
  id, timestamp: Date.now(), client: { ip: "1.1.1.1", label: "iPhone", kind: "phone" }, method: "GET",
  scheme: "https", host: "api.soum.sa", port: 443, path: "/v2/items", query: "", http_version: "HTTP/2",
  request: { headers: [], size: 50 },
  response: { status: 200, reason: "OK", headers: [], size: 300, content_type: "application/json" },
  duration_ms: 120, state: "complete", error: null, ...o,
});

const detail = (f: FlowMeta): FlowDetail => ({
  ...f,
  request: { ...f.request, body: null },
  response: f.response ? { ...f.response, body: "{}" } : null,
  timing: { start: f.timestamp, req_done: null, resp_start: null, resp_done: null, duration_ms: 120,
            connect_ms: null, tls_ms: null, ttfb_ms: null, download_ms: null },
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

let puts: MapLocal[];
let replayed: string[];
let copied: string[];

function stubApi(flows: FlowMeta[], maplocal: MapLocal = { enabled: true, rules: [] }) {
  puts = [];
  replayed = [];
  copied = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (t: string) => { copied.push(t); } },
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/flows") return ok(flows);
    if (url.match(/^\/api\/flows\/[^/]+\/replay$/)) { replayed.push(url); return ok({ ok: true }); }
    if (url === "/api/maplocal" && method === "PUT") {
      const body = JSON.parse(String(init!.body)) as MapLocal;
      puts.push(body);
      return ok(body);
    }
    if (url === "/api/maplocal") return ok(maplocal);
    if (url.startsWith("/api/maplocal/files")) return ok({ path: "/managed/up.json", size: 3 });
    if (url === "/api/passthrough" || url === "/api/paused" || url === "/api/clients") return ok([]);
    if (url === "/api/breakpoints") return ok({ enabled: false, rules: [] });
    if (url.startsWith("/api/flows/")) return ok(detail(flows[0]));
    return ok({});
  }));
}

const rule = (over: Partial<MapLocal["rules"][number]> = {}) => ({
  id: "r1", enabled: true, host: "api.soum.sa", path: "/v2/*", method: "", file: "/managed/a.json", status: 200,
  ...over,
});

/** Map Local lives under the Tools menu, the way Charles organises it. */
const openMapLocalDialog = () => {
  fireEvent.click(screen.getByRole("menuitem", { name: "Tools" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Map Local" }));
};

describe("Map Local rules modal", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setListMode("sequence");
    useStore.getState().setMaplocal({ enabled: true, rules: [] });
  });

  it("check-marks Map Local in the Tools menu only when a rule can actually fire", async () => {
    stubApi([mk("a")], { enabled: true, rules: [rule({ enabled: false })] });
    useStore.getState().setMaplocal({ enabled: true, rules: [rule({ enabled: false })] });
    useStore.getState().upsertFlow(mk("a"));
    render(<App />);

    const armed = () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Tools" }));
      const item = screen.getByRole("menuitem", { name: "Map Local" });
      const on = item.className.includes("is-checked");
      fireEvent.keyDown(document, { key: "Escape" });
      return on;
    };

    expect(armed()).toBe(false);
    useStore.getState().setMaplocal({ enabled: true, rules: [rule()] });
    await waitFor(() => expect(armed()).toBe(true));
  });

  it("saves a toggled-off rule", async () => {
    stubApi([mk("a")], { enabled: true, rules: [rule()] });
    useStore.getState().setMaplocal({ enabled: true, rules: [rule()] });
    render(<App />);

    openMapLocalDialog();
    fireEvent.click(screen.getByLabelText("Enable api.soum.sa/v2/*"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].rules[0].enabled).toBe(false);
  });

  it("reorders rules so the first match follows the list order", async () => {
    const two = [rule({ id: "r1" }), rule({ id: "r2", path: "/v2/other" })];
    stubApi([mk("a")], { enabled: true, rules: two });
    useStore.getState().setMaplocal({ enabled: true, rules: two });
    render(<App />);

    openMapLocalDialog();
    fireEvent.click(screen.getByLabelText("Move api.soum.sa/v2/* down"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].rules.map((r) => r.id)).toEqual(["r2", "r1"]);
  });

  it("edits a rule through the same dialog the context menu uses", async () => {
    stubApi([mk("a")], { enabled: true, rules: [rule()] });
    useStore.getState().setMaplocal({ enabled: true, rules: [rule()] });
    render(<App />);

    openMapLocalDialog();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Map Local rule" });
    expect(screen.getByLabelText("Local file")).toHaveValue("/managed/a.json");

    fireEvent.change(screen.getByLabelText("Path"), { target: { value: "/v3/*" } });
    fireEvent.click(dialog.querySelector(".chip.primary") as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].rules[0].path).toBe("/v3/*");
  });

  it("deletes a rule", async () => {
    stubApi([mk("a")], { enabled: true, rules: [rule()] });
    useStore.getState().setMaplocal({ enabled: true, rules: [rule()] });
    render(<App />);

    openMapLocalDialog();
    fireEvent.click(screen.getByLabelText("Delete api.soum.sa/v2/*"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].rules).toEqual([]);
  });
});

describe("structure tree context menus", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setListMode("structure");
    useStore.getState().setMaplocal({ enabled: true, rules: [] });
  });

  it("prefills a host rule with the host alone", async () => {
    stubApi([mk("a")]);
    useStore.getState().upsertFlow(mk("a"));
    render(<App />);

    fireEvent.contextMenu(document.querySelector(".stree-host") as HTMLElement, { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Map Local…" }));

    await waitFor(() => screen.getByRole("dialog", { name: "Map Local rule" }));
    expect(screen.getByLabelText("Host")).toHaveValue("api.soum.sa");
    expect(screen.getByLabelText("Path")).toHaveValue("");
    expect(screen.getByLabelText("Method")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Use captured response" })).toBeDisabled();
  });

  it("prefills a directory rule with the whole prefix", async () => {
    stubApi([mk("a")]);
    useStore.getState().upsertFlow(mk("a"));
    render(<App />);

    const dir = document.querySelector(".stree-folder:not(.stree-host)") as HTMLElement;
    fireEvent.contextMenu(dir, { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Map Local…" }));

    await waitFor(() => screen.getByRole("dialog", { name: "Map Local rule" }));
    expect(screen.getByLabelText("Path")).toHaveValue("/v2/*");
    expect(screen.getByLabelText("Method")).toHaveValue("");
  });
});

describe("request context menu actions", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setListMode("sequence");
    useStore.getState().setMaplocal({ enabled: true, rules: [] });
  });

  it("offers copy, replay and edit-and-resend alongside Map Local", async () => {
    stubApi([mk("a")]);
    useStore.getState().upsertFlow(mk("a"));
    render(<App />);

    fireEvent.contextMenu(document.querySelectorAll(".flowrow")[0] as HTMLElement, { clientX: 10, clientY: 10 });
    expect(screen.getByRole("menuitem", { name: "Copy URL" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy cURL" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit & Resend" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Replay" }));
    await waitFor(() => expect(replayed).toHaveLength(1));

    fireEvent.contextMenu(document.querySelectorAll(".flowrow")[0] as HTMLElement, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy URL" }));
    await waitFor(() => expect(copied[0]).toBe("https://api.soum.sa/v2/items"));
  });
});

describe("a flow that already hit a rule", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setListMode("sequence");
  });

  const hit = mk("a", { maplocal_rule_id: "r1", maplocal_file: "/managed/a.json" });

  it("offers edit and disable instead of a blank Map Local sheet", () => {
    stubApi([hit], { enabled: true, rules: [rule()] });
    useStore.getState().setMaplocal({ enabled: true, rules: [rule()] });
    useStore.getState().upsertFlow(hit);
    render(<App />);

    fireEvent.contextMenu(document.querySelectorAll(".flowrow")[0] as HTMLElement, { clientX: 10, clientY: 10 });
    expect(screen.getByRole("menuitem", { name: "Edit Map Local rule…" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Disable this rule" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Map Local…" })).toBeNull();
  });

  it("loads the matched rule into the dialog and replaces it in place", async () => {
    stubApi([hit], { enabled: true, rules: [rule()] });
    useStore.getState().setMaplocal({ enabled: true, rules: [rule()] });
    useStore.getState().upsertFlow(hit);
    render(<App />);

    fireEvent.contextMenu(document.querySelectorAll(".flowrow")[0] as HTMLElement, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit Map Local rule…" }));

    await waitFor(() => screen.getByRole("dialog", { name: "Map Local rule" }));
    expect(screen.getByLabelText("Path")).toHaveValue("/v2/*");
    expect(screen.getByLabelText("Local file")).toHaveValue("/managed/a.json");

    fireEvent.change(screen.getByLabelText("Local file"), { target: { value: "/managed/b.json" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].rules).toHaveLength(1); // replaced, not duplicated
    expect(puts[0].rules[0].file).toBe("/managed/b.json");
  });

  it("disables the matched rule without deleting it", async () => {
    stubApi([hit], { enabled: true, rules: [rule()] });
    useStore.getState().setMaplocal({ enabled: true, rules: [rule()] });
    useStore.getState().upsertFlow(hit);
    render(<App />);

    fireEvent.contextMenu(document.querySelectorAll(".flowrow")[0] as HTMLElement, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Disable this rule" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].rules).toHaveLength(1);
    expect(puts[0].rules[0].enabled).toBe(false);
  });
});

describe("context menu scope after the layout review", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setListMode("structure");
    useStore.getState().setMaplocal({ enabled: true, rules: [] });
    useStore.getState().setFocus([]);
  });

  it("offers Map Local only on a directory, never Focus", () => {
    stubApi([mk("a")]);
    useStore.getState().upsertFlow(mk("a"));
    render(<App />);

    const dir = document.querySelector(".stree-folder:not(.stree-host)") as HTMLElement;
    fireEvent.contextMenu(dir, { clientX: 10, clientY: 10 });

    expect(screen.getByRole("menuitem", { name: "Map Local…" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Focus" })).toBeNull();
  });

  it("keeps a host inside Other Hosts a host: host-only prefill plus Focus", async () => {
    const a = mk("a", { host: "api.soum.sa" });
    const b = mk("b", { host: "cdn.soum.sa", path: "/img/logo.png" });
    stubApi([a, b]);
    useStore.getState().upsertFlow(a);
    useStore.getState().upsertFlow(b);
    useStore.getState().setFocus(["api.soum.sa"]);
    render(<App />);

    // Expand Other Hosts, then right-click the host that lives inside it.
    fireEvent.click(document.querySelector(".stree-other .stree-caret") as HTMLElement);
    // The pinned host comes first; the one under Other Hosts is second.
    const otherHost = [...document.querySelectorAll(".stree-host")][1] as HTMLElement;
    fireEvent.contextMenu(otherHost, { clientX: 10, clientY: 10 });

    expect(screen.getByRole("menuitem", { name: "Focus" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Map Local…" }));

    await waitFor(() => screen.getByRole("dialog", { name: "Map Local rule" }));
    expect(screen.getByLabelText("Host")).toHaveValue("cdn.soum.sa");
    expect(screen.getByLabelText("Path")).toHaveValue("");
  });
});

