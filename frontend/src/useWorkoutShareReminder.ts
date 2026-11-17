import { useSyncExternalStore } from 'react';
import { useUserSession } from './userContext';

const EVENT = 'relay-workout-share-reminder';
const fallback = new Map<string, boolean>();
const keyFor = (userId: string | null) => `relay-workout-share-reminder:${userId ?? 'device'}`;

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

/** Account-scoped on this device, like other local notification/display choices. */
export function useWorkoutShareReminder(): [boolean, (enabled: boolean) => void] {
  const { user } = useUserSession();
  const key = keyFor(user?.id ?? null);
  const enabled = useSyncExternalStore(
    subscribe,
    () => {
      if (fallback.has(key)) return fallback.get(key)!;
      try {
        return window.localStorage.getItem(key) !== 'off';
      } catch {
        return true;
      }
    },
    () => true,
  );
  return [
    enabled,
    (value) => {
      try {
        window.localStorage.setItem(key, value ? 'on' : 'off');
        fallback.delete(key);
      } catch {
        fallback.set(key, value);
      }
      window.dispatchEvent(new Event(EVENT));
    },
  ];
}
