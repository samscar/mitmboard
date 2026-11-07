/** Shared keyboard guards, so list navigation never fights a text field or a
    modal that happens to be open on top of the list. */

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

export function isOverlayOpen(): boolean {
  return !!document.querySelector(".modal-backdrop, .ctxmenu");
}

/** Arrow navigation should also stand down while a modal owns the keyboard. */
export function arrowKeysAvailable(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
  if (isTypingTarget(e.target)) return false;
  return !isOverlayOpen();
}
