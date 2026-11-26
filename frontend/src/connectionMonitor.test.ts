import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  BACK_ONLINE_MS,
  CHECK_BACKOFF_MS,
  CONFIRM_OFFLINE_MS,
  MIN_OFFLINE_SHOWN_MS,
  OFFLINE_CHECK_MS,
  connectionDetailRows,
  createConnectionMonitor,
  nextCheckText,
  offlineNoticeLabel,
  offlineNoticeVisible,
  type CheckOutcome,
  type ConnectionEvents,
  type ConnectionState,
} from './connectionMonitor';

let offline: boolean;
let events: ConnectionEvents | null;
const stopListening = vi.fn();
const check = vi.fn<() => Promise<CheckOutcome>>();

function monitor() {
  return createConnectionMonitor({
    deviceOffline: () => offline,
    check,
    listen: (heard) => {
      events = heard;
      return stopListening;
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 26, 9, 30));
  offline = false;
  events = null;
  stopListening.mockReset();
  check.mockReset();
  check.mockResolvedValue(false);
});
afterEach(() => vi.useRealTimers());

it('names an outage only after twenty seconds and two failures, and only while watched', async () => {
  const status = monitor();
  // Nothing shows the status, so nothing is checked.
  status.checkConnectionNow();
  await vi.advanceTimersByTimeAsync(0);
  status.reportConnectionFailure();
  await vi.advanceTimersByTimeAsync(CONFIRM_OFFLINE_MS * 2);
  expect(status.view().phase).toBe('online');
  status.reset();
  check.mockClear();

  const stop = status.subscribe(() => undefined);
  expect(events).not.toBeNull();
  status.reportConnectionFailure();
  await vi.advanceTimersByTimeAsync(CONFIRM_OFFLINE_MS - 1);
  expect(status.view().phase).toBe('online');
  expect(status.state().phase).toBe('checking');
  expect(check).toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(status.view()).toMatchObject({ phase: 'offline', cause: 'server' });

  stop();
  expect(stopListening).toHaveBeenCalledTimes(1);
  expect(status.view().phase).toBe('online');
});

it('says there is no internet when the device reports it, then confirms it is back', async () => {
  const status = monitor();
  status.subscribe(() => undefined);
  offline = true;
  events!.offline();
  await vi.advanceTimersByTimeAsync(CONFIRM_OFFLINE_MS);
  expect(status.view()).toMatchObject({ phase: 'offline', cause: 'device' });
  expect(check).not.toHaveBeenCalled();

  offline = false;
  check.mockResolvedValue(true);
  events!.online();
  await vi.advanceTimersByTimeAsync(0);
  expect(check).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(MIN_OFFLINE_SHOWN_MS);
  expect(status.view().phase).toBe('back');
  await vi.advanceTimersByTimeAsync(BACK_ONLINE_MS);
  expect(status.view().phase).toBe('online');
});

it('lets a test replace the check and restore the app’s own', async () => {
  const status = monitor();
  status.subscribe(() => undefined);
  const other = vi.fn(async (): Promise<CheckOutcome> => 'down');
  status.setCheck(other);
  status.checkConnectionNow();
  await vi.advanceTimersByTimeAsync(0);
  expect(other).toHaveBeenCalledTimes(1);
  expect(status.state().server).toBe('down');
  status.setCheck();
  status.checkConnectionNow();
  await vi.advanceTimersByTimeAsync(0);
  expect(check).toHaveBeenCalledTimes(1);
});

const state = (patch: Partial<ConnectionState>): ConnectionState => ({
  phase: 'offline',
  cause: 'server',
  server: 'unreachable',
  lastReachedAt: null,
  ...patch,
});

it('labels the notice as the web always has', () => {
  expect(offlineNoticeLabel(state({ cause: 'device' }))).toBe('No internet');
  expect(offlineNoticeLabel(state({}))).toBe('Offline');
  expect(offlineNoticeLabel(state({ phase: 'back', cause: 'device' }))).toBe('Back online');
  expect(offlineNoticeVisible(state({ phase: 'checking' }))).toBe(false);
  expect(offlineNoticeVisible(state({ phase: 'online' }))).toBe(false);
  expect(offlineNoticeVisible(state({ phase: 'back' }))).toBe(true);
});

it('lists the details rows, leaving out the server without internet', () => {
  const now = Date.now();
  const at = now - 60_000;
  expect(
    connectionDetailRows(state({ lastReachedAt: at }), { workouts: 1, checkIns: 2 }, now),
  ).toEqual([
    { label: 'Internet', value: 'Connected', state: 'ok' },
    { label: 'Server', value: 'Unreachable', state: 'bad' },
    {
      label: 'Last connected',
      value: new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    },
    { label: 'Saved on this phone', value: '1 workout · 2 check-ins' },
  ]);
  expect(
    connectionDetailRows(state({ cause: 'device', server: 'down' }), { workouts: 0, checkIns: 0 }),
  ).toEqual([{ label: 'Internet', value: 'Not connected', state: 'bad' }]);
  expect(
    connectionDetailRows(state({ server: 'down' }), { workouts: 3, checkIns: 0 })[1].value,
  ).toBe('Offline');
});

it('counts down to the next check', () => {
  const now = Date.now();
  expect(nextCheckText({ checking: true, nextCheckAt: now + 5000 }, now)).toBe('Checking…');
  expect(nextCheckText({ checking: false, nextCheckAt: null }, now)).toBe('');
  expect(nextCheckText({ checking: false, nextCheckAt: now + 4200 }, now)).toBe(
    'Next check in 5 s',
  );
  expect(nextCheckText({ checking: false, nextCheckAt: now - 10 }, now)).toBe('Next check in 1 s');
});

/** When each check ran, in milliseconds from the start of the test. */
function checkTimes() {
  const start = Date.now();
  const times: number[] = [];
  check.mockImplementation(async () => {
    times.push(Date.now() - start);
    return false;
  });
  return times;
}

it('backs off 2, 4 then 8 s while checking quietly, then checks every 10 s once offline', async () => {
  const status = monitor();
  status.subscribe(() => undefined);
  const times = checkTimes();
  status.reportConnectionFailure();
  await vi.advanceTimersByTimeAsync(CONFIRM_OFFLINE_MS - 1);
  const [two, four, eight] = CHECK_BACKOFF_MS;
  expect(times).toEqual([two, two + four, two + four + eight]);
  await vi.advanceTimersByTimeAsync(1);
  expect(status.view().phase).toBe('offline');
  // The 8 s back-off already due at 22 s runs, then the offline re-check every 10 s.
  await vi.advanceTimersByTimeAsync(2 * OFFLINE_CHECK_MS + 2_000);
  expect(times.slice(3)).toEqual([
    22_000,
    22_000 + OFFLINE_CHECK_MS,
    22_000 + 2 * OFFLINE_CHECK_MS,
  ]);
});

it('stays silent after twenty seconds with only one failure', async () => {
  const status = monitor();
  status.subscribe(() => undefined);
  // The check never answers, so there is never a second failure.
  check.mockImplementation(() => new Promise<CheckOutcome>(() => undefined));
  status.reportConnectionFailure();
  await vi.advanceTimersByTimeAsync(CONFIRM_OFFLINE_MS * 3);
  expect(status.state().phase).toBe('checking');
  expect(status.view().phase).toBe('online');
});

it('keeps the notice at least four seconds when an answer comes sooner', async () => {
  const status = monitor();
  status.subscribe(() => undefined);
  check.mockImplementation(() => new Promise<CheckOutcome>(() => undefined));
  status.reportConnectionFailure();
  status.reportConnectionFailure();
  await vi.advanceTimersByTimeAsync(CONFIRM_OFFLINE_MS);
  expect(status.view().phase).toBe('offline');
  await vi.advanceTimersByTimeAsync(1_000);
  status.reportServerReached();
  await vi.advanceTimersByTimeAsync(MIN_OFFLINE_SHOWN_MS - 1_000 - 1);
  expect(status.view().phase).toBe('offline');
  await vi.advanceTimersByTimeAsync(1);
  expect(status.view().phase).toBe('back');
});

it('checks at once when the app wakes during an outage, and not otherwise', async () => {
  const status = monitor();
  status.subscribe(() => undefined);
  events!.wake();
  await vi.advanceTimersByTimeAsync(0);
  expect(check).not.toHaveBeenCalled();
  status.reportConnectionFailure();
  events!.wake();
  await vi.advanceTimersByTimeAsync(0);
  expect(check).toHaveBeenCalledTimes(1);
});

it('checks a slow read quietly at most every fifteen seconds', async () => {
  const status = monitor();
  status.subscribe(() => undefined);
  check.mockResolvedValue(true);
  status.verifyConnection();
  await vi.advanceTimersByTimeAsync(0);
  status.verifyConnection();
  await vi.advanceTimersByTimeAsync(14_999);
  status.verifyConnection();
  expect(check).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  status.verifyConnection();
  await vi.advanceTimersByTimeAsync(0);
  expect(check).toHaveBeenCalledTimes(2);
  expect(status.view().phase).toBe('online');
});

it('ignores a check that finishes after nothing shows the status any more', async () => {
  const status = monitor();
  const stop = status.subscribe(() => undefined);
  let answer!: (outcome: CheckOutcome) => void;
  check.mockImplementation(() => new Promise<CheckOutcome>((resolve) => (answer = resolve)));
  status.reportConnectionFailure();
  await vi.advanceTimersByTimeAsync(CHECK_BACKOFF_MS[0]);
  expect(check).toHaveBeenCalledTimes(1);
  stop();
  answer(false);
  await vi.advanceTimersByTimeAsync(CONFIRM_OFFLINE_MS * 2);
  // The late failure is dropped: no outage, no further checks.
  expect(status.state().phase).toBe('online');
  expect(status.progress()).toEqual({ checking: false, nextCheckAt: null });
  expect(check).toHaveBeenCalledTimes(1);
});
