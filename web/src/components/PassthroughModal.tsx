import { useState } from "react";
import { useStore } from "../store";
import { fetchPassthrough, removePassthrough } from "../api";
import { LockOpenIcon } from "./LockOpenIcon";

/** The passthrough list, moved out of the (soon removed) device sidebar.

    Retry means "forget this host was ever pinned": mitmproxy gets another
    chance to intercept it, which is the only recovery the backend offers. */
export function PassthroughModal({ onClose }: { onClose: () => void }) {
  const passthrough = useStore((s) => s.passthrough);
  const setPassthrough = useStore((s) => s.setPassthrough);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const retry = (host: string) => {
    setErrors((m) => { const { [host]: _drop, ...rest } = m; return rest; });
    removePassthrough(host)
      .then(() => fetchPassthrough())
      .then(setPassthrough)
      .catch(() => {
        // A config-managed host (409) or a race with another tab (404) both
        // land here; swallowing it would leave a Retry that never worked.
        setErrors((m) => ({ ...m, [host]: "Couldn't remove — try again" }));
      });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal pt-modal" role="dialog" aria-label="Passthrough hosts" onClick={(e) => e.stopPropagation()}>
        <h2>Passthrough</h2>
        <p className="pt-intro">
          Hosts whose apps refused the proxy certificate. They are forwarded encrypted, so their
          traffic cannot be inspected until Retry succeeds.
        </p>
        {passthrough.length === 0 ? (
          <div className="empty">No passthrough hosts</div>
        ) : (
          <div className="pt-list">
            {passthrough.map((p) => {
              const watching = !p.active;
              const subText = watching ? `watching · ${p.failures} refused`
                : p.source === "config" ? "config" : `pinned · ${p.failures} refused`;
              const canRetry = p.source !== "config" && !watching;
              return (
                <div key={p.host} className="pt-row">
                  <span className="pt-ico"><LockOpenIcon /></span>
                  <span className="pt-main">
                    <span className="pt-name mono">{p.host}</span>
                    <span className="pt-sub">{subText}</span>
                    {errors[p.host] && <span className="pt-err">{errors[p.host]}</span>}
                  </span>
                  {canRetry ? (
                    <button className="chip" onClick={() => retry(p.host)}>Retry</button>
                  ) : p.source === "config" ? (
                    <span className="chip pt-tag">config</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        <div className="bp-actions">
          <span className="bp-spacer" />
          <button className="chip" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
