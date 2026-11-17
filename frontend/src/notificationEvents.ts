const NOTIFICATIONS_CHANGED = 'relay:notifications-changed';

/** A socket update or reconnection invalidates the current account's inbox snapshot. */
export function notifyNotificationsChanged(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

export function onNotificationsChanged(listener: () => void): () => void {
  window.addEventListener(NOTIFICATIONS_CHANGED, listener);
  return () => window.removeEventListener(NOTIFICATIONS_CHANGED, listener);
}
