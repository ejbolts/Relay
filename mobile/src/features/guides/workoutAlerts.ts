import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { useLogger, useWorkout } from '../workout/WorkoutProvider';

// The web's "Still working out?" push, as a local notification the phone delivers by itself: the
// server sends it to web push subscriptions after 45 minutes without workout activity
// (backend/app/notifications.py), and Expo Go can't receive remote push. Each change to the live
// workout moves it back; finishing or discarding the workout cancels it.

const ID = 'relay-inactive-workout';
export const INACTIVE_WORKOUT_MINUTES = 45;
export const INACTIVE_WORKOUT_ALERT = {
  title: 'Still working out?',
  body: 'No workout activity for 45 minutes. Resume your workout or finish and save it.',
};

let applied: number | null = null;
let queue: Promise<void> = Promise.resolve();

async function apply(at: number | null) {
  if (at === applied) return;
  await Notifications.cancelScheduledNotificationAsync(ID).catch(() => undefined);
  applied = null;
  if (at === null || at <= Date.now()) return;
  // Only where notifications are already allowed; Settings and the first rest ask for them.
  const permission = await Notifications.getPermissionsAsync().catch(() => null);
  if (!permission?.granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: ID,
    content: { ...INACTIVE_WORKOUT_ALERT, data: { kind: 'inactive-workout' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
  });
  applied = at;
}

/** Schedules the alert for `lastActiveAt` plus 45 minutes, or cancels it with no live workout. */
export function syncInactiveWorkoutAlert(lastActiveAt: number | null): Promise<void> {
  const at = lastActiveAt === null ? null : lastActiveAt + INACTIVE_WORKOUT_MINUTES * 60_000;
  queue = queue.then(() => apply(at)).catch(() => undefined);
  return queue;
}

/** Keeps the alert in step with the live workout, and opens the logger when it is tapped. */
export function useInactiveWorkoutAlert() {
  const lastActiveAt = useLogger()?.state?.lastActiveAt ?? null;
  const { open } = useWorkout();
  useEffect(() => {
    void syncInactiveWorkoutAlert(lastActiveAt);
  }, [lastActiveAt]);
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.kind === 'inactive-workout') open();
    });
    // Test environments stand in an object without remove.
    return () => subscription?.remove?.();
  }, [open]);
}

/** For tests: forget what was scheduled. */
export function resetInactiveWorkoutAlertForTests() {
  applied = null;
  queue = Promise.resolve();
}
