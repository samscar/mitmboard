import { useUi } from "../uiStore";
import { Settings } from "./Settings";
import { MapLocalModal } from "./MapLocalModal";
import { SSLProxyingModal } from "./SSLProxyingModal";
import { BreakpointsModal } from "./BreakpointsModal";
import { ConnectDeviceModal } from "./ConnectDeviceModal";

/** One owner for every dialog.
 *
 *  Charles reaches each of these from a menu command, a toolbar button and
 *  sometimes a status item, so they cannot be owned by any single one of those
 *  surfaces. `uiStore` holds which one is open; this renders it. */
export function Dialogs() {
  const dialog = useUi((s) => s.dialog);
  const close = useUi((s) => s.closeDialog);
  switch (dialog) {
    case "settings": return <Settings onClose={close} />;
    case "maplocal": return <MapLocalModal onClose={close} />;
    case "sslproxying": return <SSLProxyingModal onClose={close} />;
    case "breakpoints": return <BreakpointsModal onClose={close} />;
    case "connect": return <ConnectDeviceModal onClose={close} />;
    default: return null;
  }
}
