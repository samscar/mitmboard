import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { App } from "../src/App";
import { useStore } from "../src/store";
import type { FlowDetail, FlowMeta } from "../src/types";

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

/** `slow` collects the resolver of a hanging detail fetch, so an out-of-order
    response can be reproduced deliberately. */
type Resolver = (d: FlowDetail) => void;
function stubApi(flows: FlowMeta[], slow: Record<string, (resolve: Resolver) => void> = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/flows") return ok(flows);
    if (url === "/api/maplocal" && method === "PUT") return ok(JSON.parse(String(init!.body)));
    if (url === "/api/maplocal") return ok({ enabled: true, rules: [] });
    if (url === "/api/ssl-proxying" || url === "/api/paused" || url === "/api/clients") return ok({ enabled: true, exclude: [], revision: "" });
    if (url === "/api/breakpoints") return ok({ enabled: false, rules: [] });
    const m = url.match(/^\/api\/flows\/([^/]+)$/);
    if (m) {
      const flow = flows.find((f) => f.id === m[1]) ?? flows[0];
      if (slow[m[1]]) {
        return new Promise((resolve) => {
          slow[m[1]]((d) => resolve(ok(d)));
        });
      }
      return ok(detail(flow));
    }
    return ok({});
  }));
}

const hostRow = () => document.querySelector(".stree-host") as HTMLElement;
const folderCount = () => document.querySelectorAll(".stree-folder").length;

/** The tree starts fully collapsed (Charles), and folders nest: a host expands
    into its first-level folders, which start collapsed in turn. Tests that
    need to see leaves expand one folder per round until none is collapsed. */
const expandAllFolders = () => {
  for (let round = 0; round < 50; round++) {
    const caret = [...document.querySelectorAll(".stree-folder .stree-caret")]
      .find((c) => c.textContent === "▸") as HTMLElement | undefined;
    if (!caret) return;
    fireEvent.click(caret);
  }
};

describe("tree selection and keyboard", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setQuery(""); // clear() keeps the query on purpose
    useStore.getState().setListMode("structure");
  });

  it("selects a host on click instead of collapsing it", () => {
    stubApi([mk("a")]);
    useStore.getState().upsertFlow(mk("a"));
    render(<App />);

    const before = folderCount();
    fireEvent.click(hostRow());

    expect(hostRow()).toHaveClass("selected");
    expect(folderCount()).toBe(before); // still collapsed: selecting never expands
  });

  it("collapses only when the caret is clicked", () => {
    stubApi([mk("a")]);
    useStore.getState().upsertFlow(mk("a"));
    render(<App />);

    // Charles starts with every host collapsed; one caret click reveals the
    // host's first-level children, a second click folds them away again.
    expect(screen.queryByText("v2")).toBeNull();
    fireEvent.click(hostRow().querySelector(".stree-caret") as HTMLElement);
    expect(screen.getByText("v2")).toBeInTheDocument();
    fireEvent.click(hostRow().querySelector(".stree-caret") as HTMLElement);
    expect(screen.queryByText("v2")).toBeNull();
  });

  it("moves the selection with arrow keys and loads the last one", async () => {
    stubApi([mk("a"), mk("b", { path: "/v2/other" })]);
    useStore.getState().upsertFlow(mk("a"));
    useStore.getState().upsertFlow(mk("b", { path: "/v2/other" }));
    render(<App />);
    expandAllFolders();

    // Arrows walk every visible row, folders included (Charles selects groups
    // too): host → /v2 → leaf, in render order. Leaves are arrival order
    // (ADR-0010): a was captured first, so a comes before b.
    for (let i = 0; i < 3; i++) fireEvent.keyDown(window, { key: "ArrowDown" });
    await waitFor(() => expect(useStore.getState().selectedId).toBe("a"));

    fireEvent.keyDown(window, { key: "ArrowDown" });
    await waitFor(() => expect(useStore.getState().selectedId).toBe("b"));
  });

  it("appends later traffic for the same endpoint at the bottom, like Charles", async () => {
    // Leaf rows carry `${method} ${path}` as title; two requests sharing the
    // final path segment sit under the same node, so titles distinguish them.
    // The stub must carry the same paths as the upserted flows: App refetches
    // /api/flows on mount and overwrites same-id metas with the stub's values.
    stubApi([mk("a"), mk("b", { path: "/v2/items?n=1" })]);
    useStore.getState().upsertFlow(mk("a"));
    useStore.getState().upsertFlow(mk("b", { path: "/v2/items?n=1" }));
    render(<App />);
    expandAllFolders();

    const titles = () =>
      [...document.querySelectorAll(".stree-leaf")].map((r) => r.getAttribute("title"));
    expect(titles()).toEqual(["GET /v2/items", "GET /v2/items?n=1"]);

    // Traffic that arrives after the initial render joins at the bottom.
    useStore.getState().upsertFlow(mk("c", { path: "/v2/items?n=2" }));
    await waitFor(() => expect(titles()).toHaveLength(3));
    expect(titles()).toEqual(["GET /v2/items", "GET /v2/items?n=1", "GET /v2/items?n=2"]);
  });

  it("keeps the last selection when an earlier detail response lands late", async () => {
    let releaseSlow: Resolver | null = null;
    // a is the first leaf the arrow keys reach (arrival order, ADR-0010), and
    // its detail response is the one that lands after the user has already
    // moved on to b.
    stubApi([mk("a"), mk("b", { path: "/v2/other" })], {
      a: (resolve) => { releaseSlow = resolve; },
    });
    useStore.getState().upsertFlow(mk("a"));
    useStore.getState().upsertFlow(mk("b", { path: "/v2/other" }));
    render(<App />);
    expandAllFolders();

    for (let i = 0; i < 3; i++) fireEvent.keyDown(window, { key: "ArrowDown" }); // → a, hangs
    fireEvent.keyDown(window, { key: "ArrowDown" }); // → b, resolves
    await waitFor(() => expect(useStore.getState().selectedId).toBe("b"));

    await act(async () => { releaseSlow!(detail(mk("a"))); });
    expect(useStore.getState().selectedId).toBe("b");
  });

  it("focuses the filter box on ⌘/Ctrl+F", () => {
    stubApi([mk("a")]);
    useStore.getState().upsertFlow(mk("a"));
    render(<App />);

    fireEvent.keyDown(window, { key: "f", metaKey: true });
    expect(document.activeElement).toBe(screen.getByLabelText("Filter"));
  });
});

describe("focus", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setQuery(""); // clear() keeps the query on purpose
    useStore.getState().setListMode("structure");
  });

  const twoHosts = () => {
    const a = mk("a", { host: "api.soum.sa" });
    const b = mk("b", { host: "cdn.soum.sa", path: "/img/logo.png" });
    stubApi([a, b]);
    useStore.getState().upsertFlow(a);
    useStore.getState().upsertFlow(b);
  };

  it("pins a focused host and gathers the rest under Other Hosts", async () => {
    twoHosts();
    render(<App />);

    fireEvent.contextMenu(hostRow(), { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Focus" }));

    await waitFor(() => expect(screen.getByText("Other Hosts")).toBeInTheDocument());
    const hosts = [...document.querySelectorAll(".stree-host .stree-name")].map((n) => n.textContent);
    // Charles marks focus by pinning the host above Other Hosts, not by a badge.
    expect(hosts[0]).toBe("api.soum.sa");
    expect(useStore.getState().focus).toEqual(["api.soum.sa"]);
  });

  it("clears focus on Escape before clearing the selection", async () => {
    twoHosts();
    useStore.getState().setFocus(["api.soum.sa"]);
    useStore.getState().selectNode("api.soum.sa");
    render(<App />);

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(useStore.getState().focus).toEqual([]));
    expect(useStore.getState().selectedNode).toBe("api.soum.sa");

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(useStore.getState().selectedNode).toBeNull());
  });

  it("only shows focused traffic in Sequence view when the Focused toggle is on", async () => {
    const a = mk("a", { host: "api.soum.sa" });
    const b = mk("b", { host: "cdn.soum.sa", path: "/img/logo.png" });
    stubApi([a, b]);
    useStore.getState().upsertFlow(a);
    useStore.getState().upsertFlow(b);
    useStore.getState().setListMode("sequence");
    useStore.getState().setFocus(["api.soum.sa"]);
    render(<App />);

    const rows = () => document.querySelectorAll(".flowrow").length;
    expect(rows()).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "Focused" }));
    await waitFor(() => expect(rows()).toBe(1));
  });
});

describe("multiple focused hosts", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setQuery(""); // clear() keeps the query on purpose
    useStore.getState().setListMode("structure");
  });

  it("pins every focused host and leaves the rest pinned when one is unfocused", async () => {
    const a = mk("a", { host: "api.soum.sa" });
    const b = mk("b", { host: "cdn.soum.sa", path: "/img/logo.png" });
    const c = mk("c", { host: "other.soum.sa", path: "/x/y.png" });
    stubApi([a, b, c]);
    [a, b, c].forEach((f) => useStore.getState().upsertFlow(f));
    useStore.getState().setFocus(["api.soum.sa", "cdn.soum.sa"]);
    render(<App />);

    const hosts = () => [...document.querySelectorAll(".stree-host .stree-name")].map((n) => n.textContent);
    expect(hosts()).toEqual(["api.soum.sa", "cdn.soum.sa"]);
    expect(screen.getByText("Other Hosts")).toBeInTheDocument(); // other.soum.sa lives there

    act(() => useStore.getState().toggleFocus("api.soum.sa"));
    expect(hosts()).toEqual(["cdn.soum.sa"]);
    expect(screen.getByText("Other Hosts")).toBeInTheDocument();
  });

  it("intersects Focus with the filter query in Sequence view", () => {
    const a = mk("a", { host: "api.soum.sa" });
    const b = mk("b", { host: "cdn.soum.sa", path: "/img/logo.png" });
    stubApi([a, b]);
    useStore.getState().upsertFlow(a);
    useStore.getState().upsertFlow(b);
    useStore.getState().setListMode("sequence");
    useStore.getState().setFocus(["api.soum.sa"]);
    useStore.getState().setFocusFilter(true);
    useStore.getState().setQuery("cdn");
    render(<App />);

    // The query matches cdn.soum.sa, Focus keeps api.soum.sa: the intersection
    // is empty rather than one filter winning over the other.
    expect(document.querySelectorAll(".flowrow").length).toBe(0);
  });
});

describe("filter autocomplete for devices", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setQuery(""); // clear() keeps the query on purpose
    useStore.getState().setListMode("sequence");
  });

  it("suggests a known device by name when typing device:", () => {
    stubApi([mk("a")]);
    useStore.getState().upsertFlow(mk("a"));
    render(<App />);

    const input = screen.getByLabelText("Filter");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "device:" } });

    expect(screen.getByText("device:iPhone")).toBeInTheDocument();
    expect(screen.getByText("device:1.1.1.1")).toBeInTheDocument();
  });
});

describe("Other Hosts container", () => {
  beforeEach(() => {
    useStore.getState().clear();
    useStore.getState().setQuery(""); // clear() keeps the query on purpose
    useStore.getState().setListMode("structure");
  });

  it("toggles instead of selecting the pseudo node", () => {
    const a = mk("a", { host: "api.soum.sa" });
    const b = mk("b", { host: "cdn.soum.sa", path: "/img/logo.png" });
    stubApi([a, b]);
    useStore.getState().upsertFlow(a);
    useStore.getState().upsertFlow(b);
    useStore.getState().setFocus(["api.soum.sa"]);
    render(<App />);

    fireEvent.click(document.querySelector(".stree-other") as HTMLElement);

    expect(useStore.getState().selectedNode).toBeNull();
    expect(screen.queryByRole("region", { name: "Node summary" })).toBeNull();
  });
});

