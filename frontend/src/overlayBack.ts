/**
 * Back (the header, the edge swipe or the browser's Back) closes the newest open sheet or dialog
 * before it changes screen. The live workout is left alone: it has its own minimise gesture.
 */
export function topOverlay(): HTMLElement | null {
  const open = [
    ...document.querySelectorAll<HTMLElement>('dialog[open], [aria-modal="true"]'),
  ].filter((element) => !element.closest('[hidden], .live-workout-sheet'));
  // Sheets and dialogs are portalled to the end of the page as they open, so the last is on top.
  return open.at(-1) ?? null;
}

/** Closes the newest sheet or dialog as Escape would; returns false when none is open. */
export function closeTopOverlay(): boolean {
  const overlay = topOverlay();
  if (!overlay) return false;
  if (overlay instanceof HTMLDialogElement) {
    // A dialog's own cancel handler closes it the way it chooses; otherwise the browser's way.
    if (overlay.dispatchEvent(new Event('cancel', { cancelable: true }))) overlay.close();
  } else {
    overlay.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
  }
  return true;
}
