import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  BACK_ONLINE_MS,
  CONFIRM_OFFLINE_MS,
  MIN_OFFLINE_SHOWN_MS,
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
