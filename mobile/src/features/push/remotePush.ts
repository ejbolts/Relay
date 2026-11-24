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

function emit() {
  listeners.forEach((listener) => listener());
}

function setStatus(next: RemotePushStatus) {
  status = next;
  emit();
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

function setPreference(value: string | null) {
  writeJson(PREFERENCE_KEY, value);
  emit();
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
  writeJson(PENDING_DELETE_KEY, list.length ? list : null);
  emit();
}

/**
 * Whether this account turned Phone alerts off here but the server hasn't confirmed it yet. Read
 * from what is saved, so it is still shown after Settings is opened again.
 */
export function turnOffWaiting(): boolean {
  return (
    !!account && !phoneAlertsPreferred() && pendingDeletes().some((item) => item.userId === account)
  );
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

// --- each change for the session it was asked in ------------------------------------------------

/** The account and session a change was asked for in, taken when it is asked. */
interface Ctx {
  userId: string;
  epoch: number;
}

interface Bound extends Ctx {
  bearer: string;
}

class Stale extends Error {
  constructor() {
    super('Signed out.');
  }
}

const ctxNow = (): Ctx | null => (account ? { userId: account, epoch: sessionEpoch() } : null);
const isCurrent = (ctx: Ctx) => ctx.epoch === sessionEpoch() && account === ctx.userId;

/** That session's own token, or null once it is no longer the one signed in. */
async function bind(ctx: Ctx): Promise<Bound | null> {
  if (!isCurrent(ctx)) return null;
  const bearer = await sessionToken(serverOrigin()).catch(() => null);
  if (!bearer || !isCurrent(ctx)) return null;
  return { ...ctx, bearer };
}

/** A request carrying the bound session's own token, never a newer account's. */
function send<T>(bound: Bound, path: string, method: 'POST' | 'PUT' | 'DELETE', body: unknown) {
  if (!isCurrent(bound)) return Promise.reject(new Stale());
  return request<T>(
    path,
    { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    bound.bearer,
  );
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs a change to this phone's registration after the ones before it, for the session `ctx` was
 * taken in when the change was asked for. A change whose session has ended by its turn is dropped
 * before it reads or writes anything.
 */
function inTurnFor<T>(ctx: Ctx | null, change: (ctx: Ctx) => Promise<T>): Promise<T> {
  const run = queue.then(() => {
    if (!ctx || !isCurrent(ctx)) throw new Stale();
    return change(ctx);
  });
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Tells the server about tokens turned off here, until it confirms. A turn-off the phone has
 * since undone (alerts on again with the same token) is dropped instead. False if any still wait.
 */
async function flushDeletes(ctx: Ctx): Promise<boolean> {
  let done = true;
  for (const item of pendingDeletes().filter((entry) => entry.userId === ctx.userId)) {
    if (phoneAlertsPreferred() && registration()?.token === item.token) {
      setPendingDeletes(pendingDeletes().filter((entry) => entry.token !== item.token));
      continue;
    }
    const bound = await bind(ctx);
    if (!bound) return false;
    try {
      await send<void>(bound, TOKENS, 'DELETE', { token: item.token });
    } catch (error) {
      // Settled when removed, already gone (404) or its session has ended (401); anything else,
      // such as no connection, a server error or a rate limit, is tried again later.
      if (!(error instanceof ApiError && (error.status === 404 || error.status === 401))) {
        done = false;
        continue;
      }
    }
    setPendingDeletes(pendingDeletes().filter((entry) => entry.token !== item.token));
  }
  return done;
}

let lookingUp: { projectId: string; run: Promise<string> } | null = null;

/** Expo's token for this install. Looked up outside the queue: it can be slow. */
function lookupToken(projectId: string): Promise<string> {
  if (lookingUp?.projectId === projectId) return lookingUp.run;
  const run = Notifications.getExpoPushTokenAsync({ projectId })
    .then(({ data }) => {
      if (typeof data !== 'string' || !/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(data))
        throw new Error('Expo returned an unexpected push token.');
      return data;
    })
    .finally(() => {
      if (lookingUp?.run === run) lookingUp = null;
    });
  lookingUp = { projectId, run };
  return run;
}

/**
 * Registers this phone for the session `ctx` was taken in, unless alerts were turned off or the
 * session ended meanwhile. A successful registration settles any older turn-off of the same token.
 */
async function registerFor(ctx: Ctx, projectId: string): Promise<Registration | null> {
  await ensureAlertChannel();
  const token = await lookupToken(projectId);
  return inTurnFor(ctx, async (current) => {
    if (!phoneAlertsPreferred()) return null;
    const bound = await bind(current);
    if (!bound) throw new Stale();
    await send<void>(bound, TOKENS, 'POST', {
      token,
      platform: Platform.OS,
      local_alerts: LOCAL_ALERTS,
    });
    // Turned off or signed out while the request was out: the turn-off stays queued.
    if (!isCurrent(current) || !phoneAlertsPreferred()) return null;
    const saved = { token, userId: current.userId };
    writeJson(REGISTRATION_KEY, saved);
    setPendingDeletes(
      pendingDeletes().filter((item) => !(item.token === token && item.userId === saved.userId)),
    );
    lastSync = Date.now();
    reported = null;
    scheduleReport(0);
    return saved;
  });
}

let syncing: { epoch: number; run: Promise<void> } | null = null;

/**
 * Keeps this phone registered for the signed-in account, as the web's existing subscription
 * check does: once notifications are allowed, Phone alerts register unless turned off. Also sends
 * turn-offs the server hasn't confirmed. Runs on launch, on coming back and on reconnecting.
 */
export function syncRemotePush(force = false): Promise<void> {
  const ctx = ctxNow();
  if (!ctx) return Promise.resolve();
  if (syncing?.epoch === ctx.epoch) return syncing.run;
  const run = syncFor(ctx, force)
    .catch(() => undefined)
    .finally(() => {
      if (syncing?.run === run) syncing = null;
    });
  syncing = { epoch: ctx.epoch, run };
  return run;
}

async function syncFor(ctx: Ctx, force: boolean) {
  const availability = remotePushAvailability();
  if (!availability.available) {
    setStatus({ kind: 'unavailable', reason: availability.reason });
    return;
  }
  await inTurnFor(ctx, flushDeletes);
  // Checked every time, such as on coming back from the phone's settings.
  const allowed = await permission();
  if (!isCurrent(ctx)) return;
  setLocalAllowed(!!allowed?.granted);
  if (!allowed?.granted) {
    setStatus({ kind: allowed && !allowed.canAskAgain ? 'blocked' : 'available' });
    return;
  }
  if (!phoneAlertsPreferred()) {
    setStatus({ kind: 'available' });
    return;
  }
  // A registered phone registers again now and then.
  if (!force && registration() && Date.now() - lastSync < RESYNC_MS) {
    setStatus({ kind: 'enabled' });
    return;
  }
  try {
    const saved = await registerFor(ctx, availability.projectId);
    if (isCurrent(ctx) && phoneAlertsPreferred())
      setStatus({ kind: saved || registration() ? 'enabled' : 'available' });
  } catch {
    // Offline or refused: shown as on if this phone was registered before, and retried later.
    if (isCurrent(ctx) && phoneAlertsPreferred())
      setStatus({ kind: registration() ? 'enabled' : 'available' });
  }
}

/** Turns Phone alerts on from Settings: asks for permission and registers this phone. */
export async function enableRemotePush(): Promise<void> {
  const availability = remotePushAvailability();
  if (!availability.available) throw new Error(unavailableMessage(availability.reason));
  const ctx = ctxNow();
  if (!ctx) throw new Error('Sign in to turn on phone alerts.');
  await ensureAlertChannel();
  const current = await permission();
  const granted =
    current?.granted ||
    (current?.canAskAgain !== false &&
      (await Notifications.requestPermissionsAsync().catch(() => null))?.granted);
  if (!isCurrent(ctx)) throw new Stale();
  if (!granted) {
    setStatus({ kind: 'blocked' });
    throw new Error(
      'Notifications are blocked. Allow them in your phone settings, then try again.',
    );
  }
  setLocalAllowed(true);
  const before = readJson<string>(PREFERENCE_KEY);
  // The choice is made first, so a refresh running meanwhile doesn't undo it.
  setPreference('enabled');
  try {
    if (!(await registerFor(ctx, availability.projectId))) throw new Stale();
  } catch (error) {
    if (isCurrent(ctx) && readJson<string>(PREFERENCE_KEY) === 'enabled') setPreference(before);
    throw error;
  }
  if (isCurrent(ctx)) setStatus({ kind: 'enabled' });
}

/** The message when a turn-off is saved here but the server hasn't been told yet. */
export const TURN_OFF_WAITING =
  "Couldn't reach Relay. Phone alerts will stop for this phone once it's back online.";

/**
 * Turns Phone alerts off from Settings. The choice applies at once, so a refresh already running
 * can't turn them back on; the token is kept until the server confirms it has removed it.
 */
export function disableRemotePush(): Promise<void> {
  const ctx = ctxNow();
  setPreference('disabled');
  cancelReport();
  const saved = registration();
  writeJson(REGISTRATION_KEY, null);
  if (saved)
    setPendingDeletes([...pendingDeletes().filter((item) => item.token !== saved.token), saved]);
  setStatus({ kind: 'available' });
  return inTurnFor(ctx, async (current) => {
    if (!(await flushDeletes(current)) && isCurrent(current)) throw new Error(TURN_OFF_WAITING);
  });
}

/** Sends a test alert to this phone alone; it fails if Expo or the phone refused it. */
export function sendTestAlert(): Promise<void> {
  return inTurnFor(ctxNow(), async (ctx) => {
    const bound = await bind(ctx);
    const saved = registration();
    if (!bound || !saved) throw new Error('Turn on phone alerts first.');
    await send<void>(bound, `${TOKENS}/test`, 'POST', { token: saved.token });
  });
}

/**
 * The signed-in account, or null once signed out. Signing out forgets this phone's registration
 * here, and the server removes the token with the sign-in itself, even if the phone was offline:
 * the app retries that sign-out until the server confirms it. So the previous account's waiting
 * turn-offs are settled by its sign-out. As on the web, the preference goes back to its default
 * for the next account.
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

let reports: Promise<void> = Promise.resolve();

/**
 * Sends the reminder claim on its own chain, for the session it was asked in: it never waits for
 * a token lookup or a registration, so it can go out before the phone suspends Relay.
 */
function sendReport(): Promise<void> {
  const ctx = ctxNow();
  reports = reports.then(async () => {
    if (!ctx || !isCurrent(ctx)) return;
    const saved = registration();
    const target = effective();
    if (!saved || sameReminder(reported, target)) return;
    const bound = await bind(ctx);
    if (!bound) return;
    try {
      await send<void>(bound, `${TOKENS}/local-reminder`, 'PUT', {
        token: saved.token,
        workout_started_at: target.workout,
        due_at_ms: target.dueAt,
      });
      if (isCurrent(ctx)) reported = target;
    } catch {
      // Offline: the next change, reconnect or return to the app sends it.
    }
  });
  return reports;
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
  lookingUp = null;
  queue = Promise.resolve();
  reports = Promise.resolve();
  cancelReport();
  wanted = NONE;
  reported = null;
  localAllowed = true;
}
