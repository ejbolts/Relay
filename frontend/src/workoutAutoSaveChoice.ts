import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import { setInactiveWorkoutLimitMinutes } from './activeWorkoutTimeout';

export {
  autoSaveChoiceLabel,
  autoSaveChoices,
  DEFAULT_WORKOUT_AUTO_SAVE_MINUTES,
  WORKOUT_AUTO_SAVE_CHOICES,
} from './trainingSettings';

const EVENT = 'relay-workout-auto-save';
const keyFor = (userId: string) => `relay-workout-auto-save:${userId}`;

let account: string | null = null;
let minutes: number | null = null;

function cached(userId: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(keyFor(userId)));
    return Number.isInteger(value) && value >= 30 && value <= 720 ? value : null;
  } catch {
    return null;
  }
}

function apply(userId: string | null, value: number | null) {
  account = userId;
  minutes = userId ? value : null;
  setInactiveWorkoutLimitMinutes(minutes);
}

/**
 * Switch to the signed-in account's choice before anything below computes a cutoff. Called
 * while rendering, so a workout opened on the first render already uses it; it is idempotent.
 */
export function selectWorkoutAutoSaveAccount(userId: string | null): void {
  if (userId !== account) apply(userId, userId ? cached(userId) : null);
}

export function workoutAutoSaveMinutes(): number | null {
  return minutes;
}

function store(userId: string, value: number | null) {
  try {
    if (value === null) window.localStorage.removeItem(keyFor(userId));
    else window.localStorage.setItem(keyFor(userId), String(value));
  } catch {
    /* The server keeps the choice; this device reads it again on the next start. */
  }
  if (account === userId) {
    apply(userId, value);
    window.dispatchEvent(new Event(EVENT));
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** Keeps this device's copy of the account's choice current. */
export function useWorkoutAutoSaveAccount(userId: string | null): void {
  selectWorkoutAutoSaveAccount(userId);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api
      .workoutAutoSave()
      .then((result) => {
        if (!cancelled) store(userId, result.after_minutes);
      })
      .catch(() => {
        /* Offline: keep the last known choice. */
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
}

/** The account's auto-save time in minutes, or null when unfinished workouts ask instead. */
export function useWorkoutAutoSaveMinutes(): number | null {
  return useSyncExternalStore(subscribe, workoutAutoSaveMinutes, () => null);
}

export async function saveWorkoutAutoSave(userId: string, value: number | null): Promise<void> {
  const result = await api.updateWorkoutAutoSave(value);
  store(userId, result.after_minutes);
}
