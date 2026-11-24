import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ApiError, request, serverOrigin } from '../../data/api';
import { readJson, writeJson } from '../../data/deviceStorage';
import { sessionToken } from '../../data/session';
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
// Tokens turned off here that the server hasn't confirmed removing yet.
const PENDING_DELETE_KEY = 'relay.mobile.expo-push-pending-delete.v1';
/** The Android channel server alerts use; the server sets the same `channelId`. */
export const ALERT_CHANNEL = 'relay-alerts';
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
  // Not `executionEnvironment`: development builds report `storeClient` too, and they have push.
  if (Platform.OS === 'android' && isRunningInExpoGo())
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

function pendingDeletes(): Registration[] {
  const saved = readJson<Registration[]>(PENDING_DELETE_KEY);
  return Array.isArray(saved) ? saved.filter((item) => item?.token && item.userId) : [];
}

function setPendingDeletes(list: Registration[]) {
  writeJson(PENDING_DELETE_KEY, list.length ? list.slice(-10) : null);
}

async function permission() {
  try {
    return await Notifications.getPermissionsAsync();
  } catch {
    return null;
  }
}

/**
 * The channel server alerts arrive on (`relay-alerts`, as the server names it). Android 13 only
 * asks for notification permission once a channel exists, so it is made before asking.
 */
async function ensureAlertChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
    name: 'Alerts',
    // The enum is exported; the import plugin misreads the comment the build puts before it.
    // eslint-disable-next-line import/namespace
    importance: Notifications.AndroidImportance.HIGH,
  }).catch(() => undefined);
}

// --- one change at a time, for the session that asked for it -----------------------------------

/** The account and session a change started in; it is dropped if either has moved on. */
interface Bound {
  userId: string;
  epoch: number;
  bearer: string;
}

class Stale extends Error {
  constructor() {
    super('Signed out.');
  }
}

async function bind(): Promise<Bound | null> {
  const userId = account;
  const epoch = sessionEpoch();
  if (!userId) return null;
  const bearer = await sessionToken(serverOrigin()).catch(() => null);
  if (!bearer || epoch !== sessionEpoch() || account !== userId) return null;
  return { userId, epoch, bearer };
}

const stillCurrent = (bound: Bound) => bound.epoch === sessionEpoch() && account === bound.userId;

/** A request carrying the bound session's own token, never a newer account's. */
function send<T>(bound: Bound, path: string, method: 'POST' | 'PUT' | 'DELETE', body: unknown) {
  if (!stillCurrent(bound)) return Promise.reject(new Stale());
  return request<T>(
    path,
    { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    bound.bearer,
  );
}

let queue: Promise<unknown> = Promise.resolve();
function inTurn<T>(change: () => Promise<T>): Promise<T> {
  const run = queue.then(change, change);
  queue = run.catch(() => undefined);
  return run;
}

/** Tells the server about tokens turned off here until it confirms; false if any still wait. */
async function flushDeletes(bound: Bound): Promise<boolean> {
  let done = true;
  for (const item of pendingDeletes().filter((entry) => entry.userId === bound.userId)) {
    try {
      await send<void>(bound, TOKENS, 'DELETE', { token: item.token });
    } catch (error) {
      // No connection or a server error: kept for the next try. Any other answer settles it.
      if (error instanceof Stale || !(error instanceof ApiError) || error.status >= 500) {
        done = false;
        continue;
      }
    }
    setPendingDeletes(pendingDeletes().filter((entry) => entry.token !== item.token));
  }
  return done;
}

async function register(bound: Bound, projectId: string): Promise<Registration | null> {
  await ensureAlertChannel();
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  // Turned off, signed out or switched account while the phone looked the token up.
  if (!stillCurrent(bound) || !phoneAlertsPreferred()) return null;
  await send<void>(bound, TOKENS, 'POST', {
    token,
    platform: Platform.OS,
    local_alerts: LOCAL_ALERTS,
  });
  if (!stillCurrent(bound)) return null;
  const saved = { token, userId: bound.userId };
  writeJson(REGISTRATION_KEY, saved);
  lastSync = Date.now();
  reported = null;
  scheduleReport(0);
  return saved;
}

let syncing: { epoch: number; run: Promise<void> } | null = null;

/**
 * Keeps this phone registered for the signed-in account, as the web's existing subscription
 * check does: once notifications are allowed, Phone alerts register unless turned off. Also sends
 * turn-offs the server hasn't confirmed. Runs on launch, on coming back and on reconnecting.
 */
export function syncRemotePush(force = false): Promise<void> {
  const epoch = sessionEpoch();
  if (syncing?.epoch === epoch) return syncing.run;
  const run = inTurn(() => syncNow(force)).finally(() => {
    if (syncing?.run === run) syncing = null;
  });
  syncing = { epoch, run };
  return run;
}

async function syncNow(force: boolean) {
  const availability = remotePushAvailability();
  if (!availability.available) {
    setStatus({ kind: 'unavailable', reason: availability.reason });
    return;
  }
  const bound = await bind();
  if (!bound) return;
  await flushDeletes(bound);
  // Checked every time, such as on coming back from the phone's settings.
  const allowed = await permission();
  setLocalAllowed(!!allowed?.granted);
  if (!allowed?.granted) {
    if (stillCurrent(bound))
      setStatus({ kind: allowed && !allowed.canAskAgain ? 'blocked' : 'available' });
    return;
  }
  if (!phoneAlertsPreferred()) {
    if (stillCurrent(bound)) setStatus({ kind: 'available' });
    return;
  }
  // A registered phone registers again now and then.
  if (!force && registration() && Date.now() - lastSync < RESYNC_MS) {
    if (stillCurrent(bound)) setStatus({ kind: 'enabled' });
    return;
  }
  try {
    const saved = await register(bound, availability.projectId);
    if (stillCurrent(bound) && phoneAlertsPreferred())
      setStatus({ kind: saved || registration() ? 'enabled' : 'available' });
  } catch {
    // Offline or refused: shown as on if this phone was registered before, and retried later.
    if (stillCurrent(bound) && phoneAlertsPreferred())
      setStatus({ kind: registration() ? 'enabled' : 'available' });
  }
}

/** Turns Phone alerts on from Settings: asks for permission and registers this phone. */
export function enableRemotePush(): Promise<void> {
  return inTurn(async () => {
    const availability = remotePushAvailability();
    if (!availability.available) throw new Error(unavailableMessage(availability.reason));
    const bound = await bind();
    if (!bound) throw new Error('Sign in to turn on phone alerts.');
    await ensureAlertChannel();
    const current = await permission();
    const granted =
      current?.granted ||
      (current?.canAskAgain !== false &&
        (await Notifications.requestPermissionsAsync().catch(() => null))?.granted);
    if (!granted) {
      if (stillCurrent(bound)) setStatus({ kind: 'blocked' });
      throw new Error(
        'Notifications are blocked. Allow them in your phone settings, then try again.',
      );
    }
    setLocalAllowed(true);
    const before = readJson<string>(PREFERENCE_KEY);
    // The choice is made first, so a refresh running meanwhile doesn't undo it.
    writeJson(PREFERENCE_KEY, 'enabled');
    try {
      if (!(await register(bound, availability.projectId))) throw new Stale();
    } catch (error) {
      if (stillCurrent(bound)) writeJson(PREFERENCE_KEY, before);
      throw error;
    }
    setStatus({ kind: 'enabled' });
  });
}

/** The message when a turn-off is saved here but the server hasn't been told yet. */
export const TURN_OFF_WAITING =
  "Couldn't reach Relay. Phone alerts will stop for this phone once it's back online.";

/**
 * Turns Phone alerts off from Settings. The choice applies at once, so a refresh already running
 * can't turn them back on; the token is kept until the server confirms it has removed it.
 */
export function disableRemotePush(): Promise<void> {
  writeJson(PREFERENCE_KEY, 'disabled');
  cancelReport();
  setStatus({ kind: 'available' });
  return inTurn(async () => {
    const saved = registration();
    writeJson(REGISTRATION_KEY, null);
    if (saved)
      setPendingDeletes([...pendingDeletes().filter((item) => item.token !== saved.token), saved]);
    const bound = await bind();
    if (!bound) return;
    if (!(await flushDeletes(bound)) && stillCurrent(bound)) throw new Error(TURN_OFF_WAITING);
  });
}

/** Sends a test alert to this phone alone; it fails if Expo or the phone refused it. */
export function sendTestAlert(): Promise<void> {
  return inTurn(async () => {
    const bound = await bind();
    const saved = registration();
    if (!bound || !saved) throw new Error('Turn on phone alerts first.');
    await send<void>(bound, `${TOKENS}/test`, 'POST', { token: saved.token });
  });
}

/**
 * The signed-in account, or null once signed out. Signing out forgets this phone's registration
 * here; the server removes the token with the sign-in itself, even if the phone was offline (the
 * sign-out is retried until the server confirms it). As on the web, the preference goes back to
 * its default for the next account.
 */
export function setRemotePushAccount(userId: string | null) {
  if (userId === account) return;
  const previous = account;
  account = userId;
  lastSync = 0;
  syncing = null;
  cancelReport();
  reported = null;
  if (previous !== null) {
    writeJson(REGISTRATION_KEY, null);
    writeJson(PREFERENCE_KEY, null);
    // The previous account's sign-out removes its tokens on the server.
    setPendingDeletes(pendingDeletes().filter((item) => item.userId !== previous));
  }
  setStatus({ kind: 'checking' });
}

// "Still working out?" the phone has scheduled itself, reported when it changes. A new or ended
// workout is reported at once, a moved due time shortly after, and anything waiting is sent as
// Relay goes to the background, before the phone can suspend it.
interface Reminder {
  workout: string | null;
  dueAt: number | null;
}
const NONE: Reminder = { workout: null, dueAt: null };
let wanted: Reminder = NONE;
let reported: Reminder | null = null;
let localAllowed = true;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Without notification permission the phone can't show its own reminder: the server's counts. */
function effective(): Reminder {
  return localAllowed ? wanted : NONE;
}

function setLocalAllowed(allowed: boolean) {
  if (allowed === localAllowed) return;
  localAllowed = allowed;
  if (registration()) scheduleReport(0);
}

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

const sameReminder = (a: Reminder | null, b: Reminder) =>
  a?.workout === b.workout && a?.dueAt === b.dueAt;

function sendReport(): Promise<void> {
  return inTurn(async () => {
    const saved = registration();
    const target = effective();
    if (!saved || sameReminder(reported, target)) return;
    const bound = await bind();
    if (!bound) return;
    try {
      await send<void>(bound, `${TOKENS}/local-reminder`, 'PUT', {
        token: saved.token,
        workout_started_at: target.workout,
        due_at_ms: target.dueAt,
      });
      if (stillCurrent(bound)) reported = target;
    } catch {
      // Offline: the next change, reconnect or return to the app sends it.
    }
  });
}

/**
 * Called by workoutReminders.ts whenever its own "Still working out?" is scheduled (the workout's
 * start time and when it is due) or cancelled (nulls).
 */
export function reportLocalReminder(startedAt: number | null, dueAt: number | null) {
  wanted =
    startedAt === null || dueAt === null
      ? NONE
      : { workout: String(Math.trunc(startedAt)), dueAt: Math.trunc(dueAt) };
  if (!registration()) return;
  // Another workout (or none) is told at once; a later due time for the same one can wait.
  scheduleReport(reported?.workout === effective().workout ? REPORT_DELAY_MS : 0);
}

/** Sends a report still waiting, such as when Relay goes to the background or comes back. */
export function flushLocalReminderReport(): Promise<void> {
  if (!registration() || sameReminder(reported, effective())) return Promise.resolve();
  cancelReport();
  return sendReport();
}

/** Retries a report that couldn't be sent, such as when the connection or the app comes back. */
export function retryLocalReminderReport() {
  void flushLocalReminderReport();
}

/**
 * The screen a tapped server alert opens, from what it carries. Workout reminders
 * (`kind: 'workout'`) are opened by workoutReminders.ts, as its own reminders are.
 */
export function remoteAlertRoute(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const { kind, url, screen } = data as { kind?: unknown; url?: unknown; screen?: unknown };
  if (kind === 'workout' || kind === 'rest') return null;
  // An app-only destination the web address can't express, such as Videos.
  if (screen === 'videos') return '/videos';
  if (typeof url !== 'string') return null;
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
  queue = Promise.resolve();
  cancelReport();
  wanted = NONE;
  reported = null;
  localAllowed = true;
}
