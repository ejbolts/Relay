/**
 * Whether a document pointerdown/focusin should close a popup menu rendered inside `root`.
 * Safari does not focus a tapped button; it moves focus to the nearest focusable ancestor,
 * such as a sheet with tabIndex=-1. That focus change is not leaving the menu, and closing
 * there would unmount the item before its click arrives.
 */
export function leavesMenu(root: Node | null, event: Event) {
  const target = event.target;
  if (!root || !(target instanceof Node) || root.contains(target)) return false;
  return event.type !== 'focusin' || !target.contains(root);
}
