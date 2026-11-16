/** Sets added by the Add set button, so only their rows (not every row on mount) animate in. */
const added = new Map<string, number>();
const RECENT_MS = 2000;

export function markSetAdded(key: string): void {
  added.set(key, Date.now());
}

/** True once for a set added moments ago; later renders and other rows get false. */
export function takeSetAdded(key: string | undefined): boolean {
  if (!key) return false;
  const at = added.get(key);
  added.delete(key);
  return at !== undefined && Date.now() - at < RECENT_MS;
}
