import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import { useStore } from "../src/store";
import { SSLProxyingModal } from "../src/components/SSLProxyingModal";

const mocks = vi.hoisted(() => {
  const save = vi.fn();
  const fetchState = vi.fn();
  class Conflict extends Error {
    state: unknown;
    constructor(state: unknown) { super("conflict"); this.state = state; }
  }
  return { save, fetchState, Conflict };
});

vi.mock("../src/api", () => ({
  fetchSslProxying: mocks.fetchState,
  saveSslProxying: mocks.save,
  SslProxyingConflict: mocks.Conflict,
}));

const LONG = "(?i)^(?:[^.:]+\\.)*(?:apple\\.com|icloud\\.com|mzstatic\\.com)\\.?:443$";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockImplementation(async (s: { enabled: boolean; exclude: string[] }) => ({
    enabled: s.enabled, exclude: s.exclude, revision: "rev2",
  }));
  mocks.fetchState.mockResolvedValue({ enabled: true, exclude: [], revision: "rev3" });
  useStore.getState().setSslproxying({ enabled: true, exclude: [], revision: "rev1" });
});

test("shows raw regexes in full, with no read-only baseline section", () => {
  useStore.getState().setSslproxying({ enabled: true, exclude: [LONG], revision: "rev1" });
  render(<SSLProxyingModal onClose={() => {}} />);
  expect(screen.getByText(LONG)).toBeInTheDocument();
  expect(screen.queryByText(/always in effect/i)).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("已同步");
  expect(screen.getByRole("button", { name: "Include" })).toBeDisabled();
});

test("adding wildcard shorthand writes the canonical regex immediately", async () => {
  render(<SSLProxyingModal onClose={() => {}} />);
  const input = screen.getByLabelText("Exclude pattern");
  fireEvent.change(input, { target: { value: "10.53.*.*" } });
  expect(screen.getByText("^10\\.53\\..*\\..*(:\\d+)?$")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({
    enabled: true, exclude: ["^10\\.53\\..*\\..*(:\\d+)?$"], revision: "rev1", force: false,
  }));
  expect(screen.getByRole("status")).toHaveTextContent("已同步");
  expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
});

test("toggling the checkbox and deleting a row both persist immediately", async () => {
  useStore.getState().setSslproxying({ enabled: true, exclude: [LONG], revision: "rev1" });
  render(<SSLProxyingModal onClose={() => {}} />);
  fireEvent.click(screen.getByLabelText("Enable SSL Proxying"));
  await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith({
    enabled: false, exclude: [LONG], revision: "rev1", force: false,
  }));
  fireEvent.click(screen.getByLabelText(`Delete ${LONG}`));
  await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ exclude: [] }),
  ));
});

test("converter expands batch input, tests a match and adds all", async () => {
  render(<SSLProxyingModal onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "转换为 Regex" }));
  fireEvent.change(screen.getByLabelText("Wildcard shorthand list"), {
    target: { value: "10.53.*.*\n*.example.com" },
  });
  expect(screen.getByText("^10\\.53\\..*\\..*(:\\d+)?$")).toBeInTheDocument();
  expect(screen.getByText("^.*\\.example\\.com(:\\d+)?$")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Trial host and port"), {
    target: { value: "10.53.1.20:8443" },
  });
  expect(screen.getByText("命中")).toBeInTheDocument();
  expect(screen.getByText("未命中")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "全部加入排除" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      exclude: ["^10\\.53\\..*\\..*(:\\d+)?$", "^.*\\.example\\.com(:\\d+)?$"],
    }),
  ));
});

test("a conflict is never silently overwritten and offers both explicit actions", async () => {
  mocks.save.mockRejectedValueOnce(new mocks.Conflict({
    enabled: true, exclude: ["(?i)bing"], revision: "rev9",
  }));
  render(<SSLProxyingModal onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("Exclude pattern"), { target: { value: "*.foo.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(screen.getByRole("status")).toHaveTextContent("未同步");
  expect(screen.getByRole("button", { name: "以我的列表覆盖" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "以文件为准重载" }));
  await waitFor(() => expect(mocks.fetchState).toHaveBeenCalled());
});

test("force overwrite sends force=true with the server revision", async () => {
  mocks.save.mockRejectedValueOnce(new mocks.Conflict({
    enabled: true, exclude: ["(?i)bing"], revision: "rev9",
  }));
  render(<SSLProxyingModal onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("Exclude pattern"), { target: { value: "*.foo.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "以我的列表覆盖" }));
  await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      force: true,
      revision: "rev9",
      // The pending edit must survive the conflict, not be replaced by the
      // stale list still in the store.
      exclude: ["^.*\\.foo\\.com(:\\d+)?$"],
    }),
  ));
});

test("a write failure surfaces 未同步 with the error message", async () => {
  mocks.save.mockRejectedValueOnce(new Error("config.yaml unavailable"));
  render(<SSLProxyingModal onClose={() => {}} />);
  fireEvent.click(screen.getByLabelText("Enable SSL Proxying"));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("未同步"));
  expect(screen.getByText("config.yaml unavailable")).toBeInTheDocument();
});
