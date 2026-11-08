import { useEffect, useMemo, useRef, useState } from "react";
import { buildMenus, type MenuEntry } from "../menuModel";
import { openSessionFile } from "../sessionActions";
import { useStore } from "../store";

/** The in-page menubar.
 *
 *  Charles' menus live in the macOS system menu bar, which a browser tab cannot
 *  own. The product targets headless hosts reached over a browser (CONTEXT.md
 *  scenario B) and the Tauri shell is paused (ADR 0005), so the menu bar is
 *  rendered inside the page instead. Behaviour follows the platform convention:
 *  click opens, hovering another title while open switches, Escape and an
 *  outside click close, and disabled entries stay visible but inert. */
export function MenuBar() {
  const hasSelection = useStore((s) => s.selectedId !== null || s.selectedNode !== null);
  const listMode = useStore((s) => s.listMode);
  const breakpointsEnabled = useStore((s) => s.breakpoints.enabled);
  const maplocalArmed = useStore((s) => s.maplocal.enabled && s.maplocal.rules.some((r) => r.enabled));
  const [open, setOpen] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const menus = useMemo(() => buildMenus({
    onPickSessionFile: () => fileRef.current?.click(),
    hasSelection,
    listMode,
    breakpointsEnabled,
    maplocalArmed,
  }), [hasSelection, listMode, breakpointsEnabled, maplocalArmed]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(null);
        setSub(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(null);
      setSub(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => { setOpen(null); setSub(null); };

  const renderItems = (items: MenuEntry[], depth: number): React.ReactNode =>
    items.map((entry, i) => {
      if (entry === "-") return <div key={`sep-${depth}-${i}`} className="mb-sep" role="separator" />;
      const hasSub = !!entry.items?.length;
      const disabled = !entry.run || entry.enabled === false;
      const key = `${depth}:${entry.label}`;
      const subOpen = sub === key;
      return (
        <div key={`${depth}-${entry.label}-${i}`}
             className={"mb-row" + (hasSub ? " has-sub" : "")}
             onMouseEnter={() => { if (open) setSub(hasSub ? key : null); }}>
          <button
            className={"mb-item" + (disabled ? " is-disabled" : "") + (entry.checked ? " is-checked" : "")}
            role="menuitem"
            aria-disabled={disabled}
            title={disabled ? "Not implemented yet" : undefined}
            onClick={() => {
              if (disabled || hasSub) return;
              entry.run?.();
              close();
            }}>
            <span className="mb-check" aria-hidden="true">{entry.checked ? "✓" : ""}</span>
            <span className="mb-label">{entry.label}</span>
            {hasSub && <span className="mb-arrow" aria-hidden="true">›</span>}
          </button>
          {hasSub && subOpen && (
            <div className="mb-drop mb-subdrop" role="menu">
              {renderItems(entry.items!, depth + 1)}
            </div>
          )}
        </div>
      );
    });

  return (
    <div className="menubar" role="menubar" ref={rootRef}>
      {menus.map((menu) => {
        const isOpen = open === menu.label;
        return (
          <div className="mb-menu" key={menu.label}>
            <button
              className={"mb-title" + (isOpen ? " is-open" : "")}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onClick={() => { setSub(null); setOpen(isOpen ? null : menu.label); }}
              onMouseEnter={() => { if (open && open !== menu.label) { setSub(null); setOpen(menu.label); } }}>
              {menu.label}
            </button>
            {isOpen && (
              <div className="mb-drop" role="menu">
                {renderItems(menu.items, 0)}
              </div>
            )}
          </div>
        );
      })}
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) openSessionFile(file).catch(() => {});
          e.target.value = "";
        }}
      />
    </div>
  );
}
