import { useEffect } from 'react';
import { api } from './api';
import { existingPhonePushSubscription, PHONE_PUSH_PREFERENCE_EVENT } from './push';

const KEY = 'gym-video-logger.active-workout-reminder';

/** Forgets the stored reminder record without contacting the server. */
export function clearActiveWorkoutReminderKey(
  storage: Pick<Storage, 'removeItem'> = window.localStorage,
): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // Storage can be unavailable in private modes.
  }
}

// Serialize scheduling and cancellation, including when a workout changes mid-request.
let pending = Promise.resolve();

export async function synchronizeActiveWorkoutReminder(startedAt: number | null): Promise<void> {
  const previous = window.localStorage.getItem(KEY);
  const subscription = startedAt === null ? null : await existingPhonePushSubscription();
  const current =
    subscription && startedAt !== null
      ? { endpoint: subscription.endpoint, timer_id: String(startedAt) }
      : null;
  if (previous && previous !== JSON.stringify(current)) {
    await api.cancelActiveWorkoutReminder(JSON.parse(previous));
    window.localStorage.removeItem(KEY);
  }
  if (current && startedAt !== null) {
    // Store before sending so a lost response can still be cancelled later.
    window.localStorage.setItem(KEY, JSON.stringify(current));
    await api.scheduleActiveWorkoutReminder({ ...current, started_at: startedAt / 1000 });
  }
}

export function useActiveWorkoutReminder(startedAt: number | null): void {
  useEffect(() => {
    const reminderStartedAt =
      startedAt !== null && Date.now() - startedAt <= 24 * 60 * 60 * 1000 ? startedAt : null;
    const sync = () => {
      pending = pending
        .catch(() => {})
        .then(async () => {
          await synchronizeActiveWorkoutReminder(reminderStartedAt);
        })
        .catch(() => {
          /* Retry on reconnect or the next tick. */
        });
    };
    sync();
    const interval = window.setInterval(sync, 60_000);
    window.addEventListener('online', sync);
    window.addEventListener('focus', sync);
    window.addEventListener(PHONE_PUSH_PREFERENCE_EVENT, sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener(PHONE_PUSH_PREFERENCE_EVENT, sync);
    };
  }, [startedAt]);
}
