import { saveBreakpoints } from "./api";
import { useStore } from "./store";
import { useUi } from "./uiStore";
import {
  clearSession, copySelectedAsCurl, exportSession, focusFilterBox,
  repeatSelected, requestsFullScreen, saveSession,
} from "./sessionActions";

/** The menubar, as data.
 *
 *  Charles 5.2.2 ships eight top-level menus; this mirrors that skeleton so
 *  someone who knows Charles does not have to learn a second set of paths.
 *  Entries Charles has but Mitmboard has not implemented are still listed and
 *  render greyed with a "Coming soon" tooltip -- the empty slot is the point,
 *  it is what makes the path memorable. Entries that can never exist here
 *  (Publish Gist, installing the CA into a Java VM or an iOS simulator) are
 *  left out rather than shown as permanent dead ends.
 *
 *  Shortcuts are deliberately absent: the browser owns ⌘R/⌘T/⌘N/⌘1-⌘9, so
 *  printing them next to the labels would be a lie. */

export type MenuEntry = MenuCommand | "-";

export interface MenuCommand {
  label: string;
  /** Absent = Charles has this command, Mitmboard does not implement it yet. */
  run?: () => void;
  enabled?: boolean;
  checked?: boolean;
  items?: MenuEntry[];
  /** Charles has no shortcut column here yet; kept for future non-browser hosts. */
  hint?: string;
}

export interface Menu {
  label: string;
  items: MenuEntry[];
}

const cmd = (label: string, run: () => void, extra: Partial<MenuCommand> = {}): MenuCommand =>
  ({ label, run, enabled: true, ...extra });

const todo = (label: string, extra: Partial<MenuCommand> = {}): MenuCommand =>
  ({ label, enabled: false, ...extra });

const openDialog = (d: Parameters<ReturnType<typeof useUi.getState>["openDialog"]>[0]) => () =>
  useUi.getState().openDialog(d);

const setTab = (t: Parameters<ReturnType<typeof useUi.getState>["setDetailTab"]>[0]) => () =>
  useUi.getState().setDetailTab(t);

async function toggleBreakpoints() {
  const current = useStore.getState().breakpoints;
  const next = { ...current, enabled: !current.enabled };
  try {
    useStore.getState().setBreakpoints(await saveBreakpoints(next));
  } catch {
    console.warn("[mitmboard] breakpoints toggle failed");
  }
}

export interface MenuContext {
  onPickSessionFile: () => void;
  hasSelection: boolean;
  listMode: "structure" | "sequence";
  breakpointsEnabled: boolean;
  /** Charles check-marks a Tools entry when the tool is actually in effect. */
  maplocalArmed: boolean;
}

export function buildMenus(ctx: MenuContext): Menu[] {
  return [
    {
      // Charles' first menu is its application menu; here it carries the
      // product name so the toolbar does not need a separate wordmark.
      label: "Mitmboard",
      items: [
        todo("About Mitmboard"),
        cmd("Settings…", openDialog("settings")),
      ],
    },
    {
      label: "File",
      items: [
        todo("New Session"),
        cmd("Open Session…", ctx.onPickSessionFile),
        "-",
        cmd("Clear Session", () => { clearSession().catch(() => {}); }),
        todo("Close Session"),
        "-",
        cmd("Save Session", saveSession),
        todo("Save Session As…"),
        "-",
        todo("Import…"),
        cmd("Export Session…", exportSession),
      ],
    },
    {
      label: "Edit",
      items: [
        todo("Undo"),
        todo("Redo"),
        "-",
        todo("Cut"),
        todo("Copy"),
        todo("Paste"),
        todo("Select All"),
        "-",
        cmd("Find…", focusFilterBox),
        todo("Find Next"),
        todo("Find Previous"),
        "-",
        todo("Find in Session…"),
        todo("Find Next in Session"),
        todo("Find Previous in Session"),
        "-",
        // Not a Charles command: it has no cURL export at all.
        cmd("Copy as cURL", copySelectedAsCurl, { enabled: ctx.hasSelection }),
      ],
    },
    {
      label: "View",
      items: [
        cmd("Structure", () => useStore.getState().setListMode("structure"), { checked: ctx.listMode === "structure" }),
        cmd("Sequence", () => useStore.getState().setListMode("sequence"), { checked: ctx.listMode === "sequence" }),
        "-",
        cmd("Overview", setTab("overview"), { enabled: ctx.hasSelection }),
        cmd("Contents", setTab("contents"), { enabled: ctx.hasSelection }),
        cmd("Summary", setTab("summary"), { enabled: ctx.hasSelection }),
        cmd("Chart", setTab("chart"), { enabled: ctx.hasSelection }),
        cmd("Notes", setTab("notes"), { enabled: ctx.hasSelection }),
        "-",
        todo("View Request As", { items: [todo("JSON"), todo("Text"), todo("Raw"), todo("Hex")] }),
        todo("View Response As", { items: [todo("JSON"), todo("Text"), todo("Raw"), todo("Hex")] }),
        "-",
        todo("Highlight Rules…"),
        todo("Focused Hosts…"),
        todo("Viewer Mappings…"),
        "-",
        todo("Protobuf Viewer Settings…"),
      ],
    },
    {
      label: "Proxy",
      items: [
        todo("Start Recording"),
        todo("Start SSL Proxying"),
        todo("Start Throttling"),
        cmd(ctx.breakpointsEnabled ? "Disable Breakpoints" : "Enable Breakpoints", () => { toggleBreakpoints().catch(() => {}); }),
        "-",
        todo("Recording Settings…"),
        cmd("SSL Proxying Settings…", openDialog("sslproxying")),
        todo("Throttling Settings…"),
        cmd("Breakpoints Settings…", openDialog("breakpoints")),
        todo("Reverse Proxies"),
        todo("Port Forwarding"),
        "-",
        todo("macOS Proxy"),
        "-",
        todo("Proxy Settings…"),
        todo("DNS Settings…"),
        todo("Access Control Settings…"),
        todo("External Proxies"),
        todo("External DNS Resolver Settings…"),
        todo("Web Interface Settings…"),
      ],
    },
    {
      label: "Tools",
      items: [
        todo("No Caching"),
        todo("Block Cookies"),
        "-",
        todo("Map Remote"),
        cmd("Map Local", openDialog("maplocal"), { checked: ctx.maplocalArmed }),
        todo("Rewrite"),
        todo("DNS Spoofing"),
        "-",
        todo("Block List"),
        todo("Allow List"),
        "-",
        todo("Mirror"),
        todo("Auto Save"),
        todo("Client Process"),
        "-",
        todo("Compose…"),
        todo("Compose New…"),
        cmd("Repeat", repeatSelected, { enabled: ctx.hasSelection }),
        todo("Repeat Advanced…"),
        todo("Validate"),
        "-",
        todo("Import/Export Settings…"),
        todo("Profiles…"),
      ],
    },
    {
      label: "Window",
      items: [
        todo("Error Log"),
        todo("Active Connections"),
        "-",
        cmd("Enter Full Screen", requestsFullScreen),
      ],
    },
    {
      label: "Help",
      items: [
        todo("Local IP Addresses"),
        todo("SSL Proxying", {
          items: [
            todo("About Root Certificate"),
            todo("Install Root Certificate"),
            cmd("Install Root Certificate on a Mobile Device or Remote Browser", openDialog("connect")),
            todo("Save Root Certificate…"),
            todo("Reset Root Certificate…"),
          ],
        }),
        "-",
        todo("Check for Updates"),
      ],
    },
  ];
}
