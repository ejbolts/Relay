import * as Notifications from 'expo-notifications';
import { Alert, Linking } from 'react-native';
import { readJson, writeJson } from '../../data/deviceStorage';
import { sessionEpoch } from '../../session/sessionEpoch';
import { showToast } from '../../ui/Toast';
import { reportLocalReminder } from '../push/remotePush';
import { restTimerPreference } from '../settings/devicePreferences';

// The web's two workout reminders, adapted to the app's own local notifications:
// - "Turn on rest alerts?" when a workout starts and rest alerts are off (RestAlertReminder.tsx);
// - "Still working out?" when the live workout has had no activity for a while. On the web the
//   server pushes it (backend/app/notifications.py, deliver_inactive, which replaced the elapsed
//   time reminder in activeWorkoutReminder.ts for clients that share their live workout). The
//   phone schedules it itself, so it works offline too, and tells the server (features/push) so
//   the server's push skips this phone.

/** Set once the app has asked for notification permission at the first rest (restAlerts.ts). */
export const REST_ALERTS_ASKED_KEY = 'relay.mobile.rest-alert-asked.v1';
const REMINDER_DISMISSED_KEY = 'relay.mobile.rest-alert-reminder-dismissed.v1';

/** As the server's reminder: 45 minutes after the last change to the workout. */
export const INACTIVE_REMINDER_MS = 45 * 60_000;
const INACTIVE_ID = 'relay-workout-inactive';

async function notificationPermission() {
  try {
    return await Notifications.getPermissionsAsync();
  } catch {
    return null;
  }
}

/**
 * Whether starting a workout should ask to turn rest alerts on: the rest timer is on, the app
 * has already asked once at a rest (the first ask comes from there), alerts are still off, and
 * the person hasn't asked not to be reminded.
 */
export async function restAlertReminderDue(): Promise<boolean> {
  if (
    !restTimerPreference.get() ||
    !readJson<boolean>(REST_ALERTS_ASKED_KEY) ||
    readJson<boolean>(REMINDER_DISMISSED_KEY)
  )
    return false;
  const permission = await notificationPermission();
  // Unknown permission: alerts may well be on, so do not nag.
  return permission !== null && !permission.granted;
}

async function turnOnRestAlerts() {
  const current = await notificationPermission();
  if (current?.canAskAgain) {
    const asked = await Notifications.requestPermissionsAsync().catch(() => null);
    if (asked?.granted) {
      showToast('Rest alerts on');
      return;
    }
    if (asked && !asked.canAskAgain) return;
  }
  // Refused before: only the phone's Settings can turn them back on.
  await Linking.openSettings().catch(() => undefined);
}

/** Asks to turn rest alerts on, as the web's reminder does when a workout starts. */
export async function remindAboutRestAlerts(): Promise<void> {
  if (!(await restAlertReminderDue())) return;
  Alert.alert(
    'Turn on rest alerts?',
    'Get a notification when your rest is over, even with your phone locked.',
    [
      {
        text: "Don't show again",
        style: 'destructive',
        onPress: () => void writeJson(REMINDER_DISMISSED_KEY, true),
      },
      { text: 'Not now', style: 'cancel' },
      { text: 'Turn on', onPress: () => void turnOnRestAlerts() },
    ],
  );
}

let wantedAt: number | null = null;
let wantedWorkout: number | null = null;
let scheduledAt: number | null = null;
let queue: Promise<void> = Promise.resolve();

async function applyInactiveReminder() {
  const target = wantedAt;
  if (target === scheduledAt) return;
  await Notifications.cancelScheduledNotificationAsync(INACTIVE_ID).catch(() => undefined);
  scheduledAt = null;
  reportLocalReminder(null, null);
  if (target === null) {
    await Notifications.dismissNotificationAsync(INACTIVE_ID).catch(() => undefined);
    return;
  }
  // Never asks: the rest alerts ask for permission, and this reminder follows that answer.
  if (target <= Date.now() || !(await notificationPermission())?.granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: INACTIVE_ID,
    content: {
      title: 'Still working out?',
      body: 'No workout activity for 45 minutes. Resume your workout or finish and save it.',
      // Which workout it is about, so a tap on a stale reminder never opens another one.
      data: { kind: 'workout', startedAt: wantedWorkout },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target },
  });
  scheduledAt = target;
  reportLocalReminder(wantedWorkout, target);
}

/**
 * Keeps the "Still working out?" reminder 45 minutes after the live workout's last activity:
 * moved on by every change, and cancelled (`null`) when the workout is finished or discarded.
 */
export function syncInactiveReminder(
  lastActiveAt: number | null,
  startedAt: number | null = null,
): Promise<void> {
  wantedAt = lastActiveAt === null ? null : lastActiveAt + INACTIVE_REMINDER_MS;
  wantedWorkout = startedAt;
  queue = queue.then(applyInactiveReminder).catch(() => undefined);
  return queue;
}

/** The workout a reminder response is about: its start time, null when unknown, or undefined. */
function reminderWorkout(response: Notifications.NotificationResponse | null) {
  const data = response?.notification.request.content.data;
  if (data?.kind !== 'workout') return undefined;
  return typeof data.startedAt === 'number' ? data.startedAt : null;
}

let launchTaken = false;

/**
 * The workout reminder that launched the app, if one did, taken once: the start time of the
 * workout it is about (null when unknown), or undefined. Expo keeps the tap that cold-launched
 * Relay, which happened before any listener existed.
 */
export async function takeLaunchReminder(): Promise<number | null | undefined> {
  if (launchTaken) return undefined;
  launchTaken = true;
  try {
    const workout = reminderWorkout(await Notifications.getLastNotificationResponseAsync());
    if (workout !== undefined)
      await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    return workout;
  } catch {
    return undefined;
  }
}

/**
 * Calls `onOpen` with the reminder's workout (as takeLaunchReminder gives it) when a workout
 * reminder is tapped while Relay runs; returns the unsubscribe.
 */
export function onWorkoutReminderOpened(onOpen: (startedAt: number | null) => void): () => void {
  try {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const workout = reminderWorkout(response);
      if (workout !== undefined) onOpen(workout);
    });
    return () => subscription?.remove?.();
  } catch {
    return () => undefined;
  }
}

let held: { startedAt: number | null; epoch: number } | null = null;

/** Keeps a tapped reminder whose workout hasn't loaded yet, for this session only. */
export function holdReminder(startedAt: number | null) {
  held = { startedAt, epoch: sessionEpoch() };
}

/**
 * The held reminder, once the live workout it is about (`liveStartedAt`) has loaded: its start
 * time (null when unknown), or undefined while there is none for this workout and session.
 */
export function takeHeldReminder(liveStartedAt: number): number | null | undefined {
  if (!held) return undefined;
  if (held.epoch !== sessionEpoch()) {
    held = null;
    return undefined;
  }
  if (held.startedAt !== null && held.startedAt !== liveStartedAt) return undefined;
  const { startedAt } = held;
  held = null;
  return startedAt;
}

/** For tests: forget what was scheduled. */
export function resetWorkoutRemindersForTests() {
  held = null;
  wantedAt = null;
  wantedWorkout = null;
  scheduledAt = null;
  launchTaken = false;
  queue = Promise.resolve();
}
