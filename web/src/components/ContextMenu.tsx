import { useEffect, useRef } from "react";

export interface MenuItem {
  label?: string;
  onSelect?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

/** A right-click menu anchored at a viewport point.

    Closes on Escape or a click outside, which is what every Charles context
    menu does and what keeps the menu from surviving a scroll-and-click. */
export function ContextMenu({ x, y, items, onClose }: {
  x: number; y: number; items: MenuItem[]; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="ctxmenu" role="menu" style={{ left: x, top: y }}>
      {items.map((item, i) =>
        item.separator ? (
          <div key={`sep-${i}`} className="ctxsep" role="separator" />
        ) : (
          <button
            key={`${item.label}-${i}`}
            role="menuitem"
            className="ctxitem"
            disabled={item.disabled}
            onClick={() => { onClose(); item.onSelect?.(); }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
