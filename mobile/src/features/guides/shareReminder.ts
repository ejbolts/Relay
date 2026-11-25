import { useSyncExternalStore } from 'react';
import {
  parseWorkoutShareReminder,
  storedWorkoutShareReminder,
  workoutShareReminderKey,
} from '../../../../frontend/src/workoutShareReminder';
import { deviceStorage } from '../../data/deviceStorage';
import { useUser } from '../../session/SessionProvider';

// The web's Share workout reminder: whether a saved workout offers Share straight away. On by
// default, for each account on this phone, under the web's key and format.

const memory = new Map<string, boolean>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function read(userId: string) {
  const key = workoutShareReminderKey(userId);
  if (memory.has(key)) return memory.get(key)!;
  let enabled = true;
  try {
    enabled = parseWorkoutShareReminder(deviceStorage.getItem(key));
  } catch {
    // On by default when storage is unavailable.
  }
  memory.set(key, enabled);
  return enabled;
}

export function setWorkoutShareReminder(userId: string, enabled: boolean) {
  const key = workoutShareReminderKey(userId);
  memory.set(key, enabled);
  try {
    deviceStorage.setItem(key, storedWorkoutShareReminder(enabled));
  } catch {
    // Kept for this session.
  }
  listeners.forEach((listener) => listener());
}

export function useWorkoutShareReminder(): [boolean, (enabled: boolean) => void] {
  const userId = useUser().id;
  const enabled = useSyncExternalStore(subscribe, () => read(userId));
  return [enabled, (value) => setWorkoutShareReminder(userId, value)];
}
