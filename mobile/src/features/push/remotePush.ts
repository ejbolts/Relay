import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiSend } from '../../data/api';
import { readJson, writeJson } from '../../data/deviceStorage';
import { sessionEpoch } from '../../session/sessionEpoch';

// Phone alerts from the server, as the web's "Phone alerts" (frontend/src/push.ts), through Expo's
// push service instead of Web Push: the app registers this phone's Expo push token with the
// signed-in account, and the server sends account-wide alerts to it (Still working out?,
// Workout saved, a finished video, admin requests). Rest alerts stay on the phone (restAlerts.ts).
//
// The phone also schedules "Still working out?" itself (workoutReminders.ts), so it tells the
// server which workout's reminder it has scheduled and when it is due; the server then skips this
// phone for that one, so an idle workout never alerts it twice.

/** The alert kinds this app schedules on the phone itself, which the server leaves to it. */
export const LOCAL_ALERTS = ['inactive-workout'];

const PREFERENCE_KEY = 'relay.mobile.phone-alerts.v1';
const REGISTRATION_KEY = 'relay.mobile.expo-push-token.v1';
const TOKENS = '/api/notifications/expo/tokens';
const REPORT_DELAY_MS = 5_000;
const RESYNC_MS = 10 * 60_000;

export type Unavailable = 'expo-go-android' | 'no-project' | 'unsupported';

export type RemotePushAvailability =
  { available: true; projectId: string } | { available: false; reason: Unavailable };

/**
 * Whether this build can get an Expo push token. Expo Go on Android has no remote push (since
 * SDK 53), and a token needs the EAS project id, which only a configured build carries.
 */
export function remotePushAvailability(): RemotePushAvailability {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android')
    return { available: false, reason: 'unsupported' };
  if (
    Platform.OS === 'android' &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  )
    return { available: false, reason: 'expo-go-android' };
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const projectId = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (typeof projectId !== 'string' || !projectId.trim())
    return { available: false, reason: 'no-project' };
  return { available: true, projectId: projectId.trim() };
}

/** Why Phone alerts can't be turned on here, for the (?) beside the switch. */
export function unavailableMessage(reason: Unavailable): string {
  const local = 'Relay still alerts you from this phone when a rest ends or a workout goes quiet.';
  switch (reason) {
    case 'expo-go-android':
      return `Expo Go on Android can't receive alerts from the server. ${local}`;
    case 'no-project':
      return `Alerts from the server need an installed build of Relay. ${local}`;
    default:
      return `This phone can't receive alerts from the server. ${local}`;
  }
}

export type RemotePushStatus =
  | { kind: 'checking' }
  | { kind: 'unavailable'; reason: Unavailable }
  | { kind: 'enabled' }
  | { kind: 'available' }
  | { kind: 'blocked' };

interface Registration {
  token: string;
  userId: string;
}

let account: string | null = null;
let status: RemotePushStatus = { kind: 'checking' };
const listeners = new Set<() => void>();
let lastSync = 0;
let syncing: Promise<void> | null = null;

function setStatus(next: RemotePushStatus) {
  status = next;
  listeners.forEach((listener) => listener());
}

/** For useSyncExternalStore. */
export function subscribeRemotePush(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const remotePushStatus = () => status;

/** Phone alerts start on, as on the web: only turning them off in Settings stops them. */
export function phoneAlertsPreferred(): boolean {
  return readJson<string>(PREFERENCE_KEY) !== 'disabled';
}

function registration(): Registration | null {
  const saved = readJson<Registration>(REGISTRATION_KEY);
  return saved && saved.userId === account ? saved : null;
}

async function permission() {
  try {
    return await Notifications.getPermissionsAsync();
  } catch {
    return null;
  }
}

async function register(projectId: string, userId: string): Promise<Registration> {
  const epoch = sessionEpoch();
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await apiSend<void>(TOKENS, 'POST', {
    token,
    platform: Platform.OS,
    local_alerts: LOCAL_ALERTS,
  });
  // A late answer after a sign-out or account switch is never recorded for the next account.
  if (epoch !== sessionEpoch() || account !== userId) throw new Error('Signed out.');
  const saved = { token, userId };
  writeJson(REGISTRATION_KEY, saved);
  reported = null;
  scheduleReport(0);
  return saved;
}

/**
 * Keeps this phone registered for the signed-in account, as the web's existing subscription
 * check does: once notifications are allowed, Phone alerts register unless turned off.
 */
export function syncRemotePush(force = false): Promise<void> {
  // A registered phone refreshes now and then; any other state is checked again each time, such
  // as on coming back from the phone's settings.
  if (!force && status.kind === 'enabled' && Date.now() - lastSync < RESYNC_MS)
    return syncing ?? Promise.resolve();
  syncing ??= (async () => {
    lastSync = Date.now();
    const availability = remotePushAvailability();
    if (!availability.available) {
      setStatus({ kind: 'unavailable', reason: availability.reason });
      return;
    }
    const userId = account;
    if (!userId) return;
    const allowed = await permission();
    if (!allowed?.granted) {
      setStatus({ kind: allowed && !allowed.canAskAgain ? 'blocked' : 'available' });
      return;
    }
    if (!phoneAlertsPreferred()) {
      setStatus({ kind: 'available' });
      return;
    }
    try {
      await register(availability.projectId, userId);
      if (account === userId) setStatus({ kind: 'enabled' });
    } catch {
      // Offline or refused: shown as on if this phone was registered before, and retried later.
      if (account === userId) setStatus({ kind: registration() ? 'enabled' : 'available' });
    }
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/** Turns Phone alerts on from Settings: asks for permission and registers this phone. */
export async function enableRemotePush(): Promise<void> {
  const availability = remotePushAvailability();
  if (!availability.available) throw new Error(unavailableMessage(availability.reason));
  const userId = account;
  if (!userId) throw new Error('Sign in to turn on phone alerts.');
  const current = await permission();
  const granted =
    current?.granted ||
    (current?.canAskAgain !== false &&
      (await Notifications.requestPermissionsAsync().catch(() => null))?.granted);
  if (!granted) {
    setStatus({ kind: 'blocked' });
    throw new Error(
      'Notifications are blocked. Allow them in your phone settings, then try again.',
    );
  }
  await register(availability.projectId, userId);
  writeJson(PREFERENCE_KEY, 'enabled');
  setStatus({ kind: 'enabled' });
}

/** Turns Phone alerts off from Settings; the server stops alerting this phone. */
export async function disableRemotePush(): Promise<void> {
  writeJson(PREFERENCE_KEY, 'disabled');
  const saved = registration();
  writeJson(REGISTRATION_KEY, null);
  cancelReport();
  setStatus({ kind: 'available' });
  if (saved) await apiSend<void>(TOKENS, 'DELETE', { token: saved.token }).catch(() => undefined);
}

/** Sends a test alert to every phone and browser with alerts on for this account. */
export function sendTestAlert(): Promise<void> {
  return apiSend<void>('/api/notifications/push/test', 'POST');
}

/**
 * The signed-in account, or null once signed out. Signing out forgets this phone's registration
 * here; the server removes the token with the sign-in itself, even if the phone is offline. As on
 * the web, the preference goes back to its default for the next account.
 */
export function setRemotePushAccount(userId: string | null) {
  if (userId === account) return;
  const previous = account;
  account = userId;
  lastSync = 0;
  cancelReport();
  reported = null;
  if (previous !== null) {
    writeJson(REGISTRATION_KEY, null);
    writeJson(PREFERENCE_KEY, null);
  }
  setStatus({ kind: 'checking' });
}

// "Still working out?" the phone has scheduled itself, reported a moment after it changes.
interface Reminder {
  workout: string | null;
  dueAt: number | null;
}
let wanted: Reminder = { workout: null, dueAt: null };
let reported: Reminder | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function cancelReport() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function scheduleReport(delay = REPORT_DELAY_MS) {
  cancelReport();
  timer = setTimeout(() => {
    timer = null;
    void sendReport();
  }, delay);
}

async function sendReport() {
  const saved = registration();
  const target = wanted;
  if (!saved || (reported?.workout === target.workout && reported?.dueAt === target.dueAt)) return;
  const epoch = sessionEpoch();
  try {
    await apiSend<void>(`${TOKENS}/local-reminder`, 'PUT', {
      token: saved.token,
      workout_started_at: target.workout,
      due_at_ms: target.dueAt,
    });
    if (epoch === sessionEpoch()) reported = target;
  } catch {
    // Offline: the next change or the next sync sends it.
  }
}

/**
 * Called by workoutReminders.ts whenever its own "Still working out?" is scheduled (the workout's
 * start time and when it is due) or cancelled (nulls).
 */
export function reportLocalReminder(startedAt: number | null, dueAt: number | null) {
  wanted =
    startedAt === null || dueAt === null
      ? { workout: null, dueAt: null }
      : { workout: String(Math.trunc(startedAt)), dueAt: Math.trunc(dueAt) };
  if (registration()) scheduleReport();
}

/** Retries a report that couldn't be sent, such as when the connection or the app comes back. */
export function retryLocalReminderReport() {
  if (registration() && (reported?.workout !== wanted.workout || reported?.dueAt !== wanted.dueAt))
    scheduleReport(0);
}

/**
 * The screen a tapped server alert opens, from the web address it carries. Workout reminders
 * (`kind: 'workout'`) are opened by workoutReminders.ts, as its own reminders are.
 */
export function remoteAlertRoute(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const { kind, url } = data as { kind?: unknown; url?: unknown };
  if (kind === 'workout' || kind === 'rest' || typeof url !== 'string') return null;
  const [path, hash = ''] = url.split('#');
  const query = new URLSearchParams(path.split('?')[1] ?? '');
  if (hash === 'admin') {
    const id = query.get('admin-account');
    return id && /^[A-Za-z0-9-]{1,64}$/.test(id) ? `/admin/account/${id}` : '/admin';
  }
  if (hash === 'history') return '/training';
  return null;
}

/** For tests: forget everything. */
export function resetRemotePushForTests() {
  account = null;
  status = { kind: 'checking' };
  listeners.clear();
  lastSync = 0;
  syncing = null;
  cancelReport();
  wanted = { workout: null, dueAt: null };
  reported = null;
}
