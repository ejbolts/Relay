import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ApiError, request } from '../../data/api';
import { readJson } from '../../data/deviceStorage';
import { sessionToken } from '../../data/session';
import { nextSessionEpoch } from '../../session/sessionEpoch';
import { memoryKv } from '../../testing/memoryKvStore';
import {
  ALERT_CHANNEL,
  disableRemotePush,
  enableRemotePush,
  flushLocalReminderReport,
  LOCAL_ALERTS,
  remoteAlertRoute,
  remotePushAvailability,
  remotePushStatus,
  reportLocalReminder,
  resetRemotePushForTests,
  retryLocalReminderReport,
  sendTestAlert,
  setRemotePushAccount,
  syncRemotePush,
  TURN_OFF_WAITING,
  unavailableMessage,
} from './remotePush';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('../../data/api', () => ({
  ApiError: jest.requireActual('../../data/api').ApiError,
  serverOrigin: () => 'https://relay.test',
  request: jest.fn(async () => undefined),
}));
jest.mock('../../data/session', () => ({ sessionToken: jest.fn() }));
jest.mock('expo', () => ({
  ...jest.requireActual('expo'),
  isRunningInExpoGo: jest.fn(() => false),
}));
jest.mock('expo-constants', () => {
  const actual = jest.requireActual('expo-constants');
  return { ...actual, __esModule: true, default: { ...actual.default } };
});
// The mocked constants, changed by each test.
const mockConstants = Constants as unknown as {
  expoConfig: { extra?: { eas?: { projectId?: string } } } | null;
  easConfig: { projectId?: string } | null;
};
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  AndroidImportance: { HIGH: 4 },
}));

const TOKEN = 'ExponentPushToken[phone]';
const TOKENS = '/api/notifications/expo/tokens';
const sent = jest.mocked(request);
const permissions = jest.mocked(Notifications.getPermissionsAsync);
const ask = jest.mocked(Notifications.requestPermissionsAsync);
const lookup = jest.mocked(Notifications.getExpoPushTokenAsync);
let bearer = 'bearer-alice';

function allow(granted: boolean, canAskAgain = true) {
  permissions.mockResolvedValue({ granted, canAskAgain } as never);
}

/** Each request as [path, method, body, bearer]. */
function calls(method?: string) {
  return sent.mock.calls
    .map(([path, init, token]) => [
      path,
      init?.method,
      init?.body ? JSON.parse(init.body as string) : undefined,
      token,
    ])
    .filter(([, used]) => !method || used === method);
}

/** Signs in as another account, as SessionProvider and RemotePushSync do. */
function switchTo(userId: string) {
  nextSessionEpoch();
  setRemotePushAccount(null);
  nextSessionEpoch();
  bearer = `bearer-${userId}`;
  setRemotePushAccount(userId);
}

beforeEach(() => {
  jest.useFakeTimers();
  memoryKv.clear();
  resetRemotePushForTests();
  sent.mockReset().mockResolvedValue(undefined);
  ask.mockReset();
  lookup.mockReset().mockResolvedValue({ type: 'expo', data: TOKEN });
  jest.mocked(Notifications.setNotificationChannelAsync).mockClear();
  bearer = 'bearer-alice';
  jest.mocked(sessionToken).mockImplementation(async () => bearer);
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.mocked(isRunningInExpoGo).mockReturnValue(false);
  mockConstants.expoConfig = { extra: { eas: { projectId: 'project-1' } } };
  mockConstants.easConfig = null;
  allow(true);
  nextSessionEpoch();
  setRemotePushAccount('alice');
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('availability', () => {
  test('Expo Go on Android has no remote push, and nothing is registered', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.mocked(isRunningInExpoGo).mockReturnValue(true);
    expect(remotePushAvailability()).toEqual({ available: false, reason: 'expo-go-android' });
    await syncRemotePush(true);
    expect(remotePushStatus()).toEqual({ kind: 'unavailable', reason: 'expo-go-android' });
    expect(lookup).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
    await expect(enableRemotePush()).rejects.toThrow("Expo Go on Android can't receive alerts");
  });

  test('a development build on Android has remote push', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    // Development builds report the same execution environment as Expo Go.
    (mockConstants as { executionEnvironment?: string }).executionEnvironment = 'storeClient';
    expect(remotePushAvailability()).toEqual({ available: true, projectId: 'project-1' });
  });

  test('a build without an EAS project id is unavailable', () => {
    mockConstants.expoConfig = { extra: {} };
    expect(remotePushAvailability()).toEqual({ available: false, reason: 'no-project' });
    expect(unavailableMessage('no-project')).toMatch(/installed build/);
  });

  test('the project id comes from the app config, or the EAS config', () => {
    expect(remotePushAvailability()).toEqual({ available: true, projectId: 'project-1' });
    mockConstants.expoConfig = null;
    mockConstants.easConfig = { projectId: 'project-2' };
    expect(remotePushAvailability()).toEqual({ available: true, projectId: 'project-2' });
  });
});

describe('registration', () => {
  test('once notifications are allowed, the phone registers for the account by default', async () => {
    await syncRemotePush(true);
    expect(lookup).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(calls('POST')).toEqual([
      [
        TOKENS,
        'POST',
        { token: TOKEN, platform: 'ios', local_alerts: LOCAL_ALERTS },
        'bearer-alice',
      ],
    ]);
    expect(remotePushStatus()).toEqual({ kind: 'enabled' });
  });

  test('on Android the alerts channel exists before permission is asked and a token looked up', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    allow(false);
    const order: string[] = [];
    jest.mocked(Notifications.setNotificationChannelAsync).mockImplementation(async (id) => {
      order.push(`channel:${id}`);
      return null;
    });
    ask.mockImplementationOnce(async () => {
      order.push('ask');
      return { granted: true } as never;
    });
    lookup.mockImplementationOnce(async () => {
      order.push('token');
      return { type: 'expo', data: TOKEN };
    });
    await enableRemotePush();
    expect(order.slice(0, 2)).toEqual([`channel:${ALERT_CHANNEL}`, 'ask']);
    expect(order).toContain('token');
    expect(calls('POST')[0][2]).toMatchObject({ platform: 'android' });
  });

  test('nothing registers without permission; a refusal shows as blocked', async () => {
    allow(false);
    await syncRemotePush(true);
    expect(remotePushStatus()).toEqual({ kind: 'available' });
    allow(false, false);
    await syncRemotePush(true);
    expect(remotePushStatus()).toEqual({ kind: 'blocked' });
    expect(sent).not.toHaveBeenCalled();
  });

  test('a phone that was refused is checked again when Relay comes back', async () => {
    allow(false, false);
    await syncRemotePush(true);
    expect(remotePushStatus()).toEqual({ kind: 'blocked' });
    allow(true);
    await syncRemotePush();
    expect(remotePushStatus()).toEqual({ kind: 'enabled' });
    sent.mockClear();
    await syncRemotePush();
    expect(sent).not.toHaveBeenCalled();
  });

  test('turning it on asks for permission, and a refusal explains what to do', async () => {
    allow(false);
    ask.mockResolvedValueOnce({ granted: false, canAskAgain: false } as never);
    await expect(enableRemotePush()).rejects.toThrow('Notifications are blocked.');
    expect(remotePushStatus()).toEqual({ kind: 'blocked' });

    ask.mockResolvedValueOnce({ granted: true } as never);
    allow(false, true);
    await enableRemotePush();
    expect(calls('POST')).toHaveLength(1);
    expect(remotePushStatus()).toEqual({ kind: 'enabled' });
  });

  test('turning it off removes the token, and it stays off', async () => {
    await syncRemotePush(true);
    await disableRemotePush();
    expect(calls('DELETE')).toEqual([[TOKENS, 'DELETE', { token: TOKEN }, 'bearer-alice']]);
    sent.mockClear();
    await syncRemotePush(true);
    expect(sent).not.toHaveBeenCalled();
    expect(remotePushStatus()).toEqual({ kind: 'available' });
  });

  test('turning it off during a refresh is never undone by that refresh', async () => {
    await syncRemotePush(true);
    sent.mockClear();
    let found: (value: unknown) => void = () => undefined;
    lookup.mockImplementationOnce(() => new Promise((resolve) => (found = resolve)) as never);
    const refresh = syncRemotePush(true);
    await jest.advanceTimersByTimeAsync(0);
    const off = disableRemotePush();
    found({ type: 'expo', data: TOKEN });
    await refresh;
    await off;
    expect(calls('POST')).toEqual([]);
    expect(calls('DELETE')).toHaveLength(1);
    expect(remotePushStatus()).toEqual({ kind: 'available' });
  });

  test('turning it off offline keeps the token to remove, and removes it once back online', async () => {
    await syncRemotePush(true);
    sent.mockRejectedValueOnce(new Error('Could not reach Relay.'));
    await expect(disableRemotePush()).rejects.toThrow(TURN_OFF_WAITING);
    expect(readJson('relay.mobile.expo-push-pending-delete.v1')).toEqual([
      { token: TOKEN, userId: 'alice' },
    ]);
    sent.mockClear();
    await syncRemotePush();
    expect(calls('DELETE')).toEqual([[TOKENS, 'DELETE', { token: TOKEN }, 'bearer-alice']]);
    expect(readJson('relay.mobile.expo-push-pending-delete.v1')).toBeNull();
    expect(calls('POST')).toEqual([]);
  });

  test('a removal the server answers is settled, even if the token was already gone', async () => {
    await syncRemotePush(true);
    sent.mockRejectedValueOnce(new ApiError(404, 'Not found.'));
    await expect(disableRemotePush()).resolves.toBeUndefined();
    expect(readJson('relay.mobile.expo-push-pending-delete.v1')).toBeNull();
  });

  test("a lookup that finishes after an account switch never registers with the new account's sign-in", async () => {
    let found: (value: unknown) => void = () => undefined;
    lookup.mockImplementationOnce(() => new Promise((resolve) => (found = resolve)) as never);
    const old = syncRemotePush(true);
    await jest.advanceTimersByTimeAsync(0);
    switchTo('bob');
    const fresh = syncRemotePush(true);
    found({ type: 'expo', data: 'ExponentPushToken[alice-lookup]' });
    await old;
    await fresh;
    expect(calls('POST')).toEqual([
      [TOKENS, 'POST', { token: TOKEN, platform: 'ios', local_alerts: LOCAL_ALERTS }, 'bearer-bob'],
    ]);
    // The new account's own check finished rather than waiting on the old one.
    expect(remotePushStatus()).toEqual({ kind: 'enabled' });
  });

  test('an offline phone that registered before still shows as on, and retries later', async () => {
    await syncRemotePush(true);
    sent.mockRejectedValueOnce(new Error('offline'));
    await syncRemotePush(true);
    expect(remotePushStatus()).toEqual({ kind: 'enabled' });
  });

  test('signing out forgets the registration and resets the choice for the next account', async () => {
    await syncRemotePush(true);
    await disableRemotePush();
    switchTo('bob');
    sent.mockClear();
    await syncRemotePush(true);
    // Bob starts with alerts on, as a new account does on the web.
    expect(calls('POST')).toHaveLength(1);
  });

  test("the test alert goes to this phone alone, and Expo's refusal is reported", async () => {
    await syncRemotePush(true);
    sent.mockClear();
    await sendTestAlert();
    expect(calls()).toEqual([[`${TOKENS}/test`, 'POST', { token: TOKEN }, 'bearer-alice']]);
    sent.mockRejectedValueOnce(new ApiError(502, "The test alert couldn't be sent. Try again."));
    await expect(sendTestAlert()).rejects.toThrow("The test alert couldn't be sent.");
  });
});

describe('the reminder the phone schedules itself', () => {
  async function registered() {
    await syncRemotePush(true);
    await jest.advanceTimersByTimeAsync(10_000);
    sent.mockClear();
  }

  test('a new workout is reported at once, a moved due time shortly after', async () => {
    await registered();
    reportLocalReminder(1_700_000_000_000, 1_700_000_100_000);
    await jest.advanceTimersByTimeAsync(0);
    expect(calls('PUT')).toEqual([
      [
        `${TOKENS}/local-reminder`,
        'PUT',
        { token: TOKEN, workout_started_at: '1700000000000', due_at_ms: 1_700_000_100_000 },
        'bearer-alice',
      ],
    ]);
    reportLocalReminder(1_700_000_000_000, 1_700_000_200_000);
    await jest.advanceTimersByTimeAsync(4_000);
    expect(calls('PUT')).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(2_000);
    expect(calls('PUT').at(-1)?.[2]).toMatchObject({ due_at_ms: 1_700_000_200_000 });

    reportLocalReminder(null, null);
    await jest.advanceTimersByTimeAsync(0);
    expect(calls('PUT').at(-1)?.[2]).toEqual({
      token: TOKEN,
      workout_started_at: null,
      due_at_ms: null,
    });
  });

  test('a report still waiting is sent as Relay goes to the background', async () => {
    await registered();
    reportLocalReminder(5, 10);
    await jest.advanceTimersByTimeAsync(0);
    reportLocalReminder(5, 20);
    await flushLocalReminderReport();
    expect(calls('PUT').at(-1)?.[2]).toMatchObject({ due_at_ms: 20 });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(calls('PUT')).toHaveLength(2);
  });

  test('a report that failed offline is sent again when the app comes back', async () => {
    await registered();
    sent.mockRejectedValueOnce(new Error('offline'));
    reportLocalReminder(5, 10);
    await jest.advanceTimersByTimeAsync(0);
    retryLocalReminderReport();
    await jest.advanceTimersByTimeAsync(0);
    expect(calls('PUT')).toHaveLength(2);
    retryLocalReminderReport();
    await jest.advanceTimersByTimeAsync(0);
    expect(calls('PUT')).toHaveLength(2);
  });

  test('without notification permission the phone stops claiming its reminder', async () => {
    await registered();
    reportLocalReminder(5, 10);
    await jest.advanceTimersByTimeAsync(0);
    allow(false);
    await syncRemotePush();
    await jest.advanceTimersByTimeAsync(0);
    expect(calls('PUT').at(-1)?.[2]).toMatchObject({ workout_started_at: null, due_at_ms: null });
  });

  test('is not reported by a phone without Phone alerts', async () => {
    allow(false);
    await syncRemotePush(true);
    reportLocalReminder(5, 10);
    await jest.advanceTimersByTimeAsync(6_000);
    expect(sent).not.toHaveBeenCalled();
  });
});

test('a tapped server alert opens the screen it is about', () => {
  expect(remoteAlertRoute({ url: '/?admin-account=abc-123#admin', tag: 'x' })).toBe(
    '/admin/account/abc-123',
  );
  expect(remoteAlertRoute({ url: '/?admin-account=../x#admin' })).toBe('/admin');
  expect(remoteAlertRoute({ url: '/#history', tag: 'inactive-workout' })).toBe('/training');
  // Video alerts keep the web's address and add the app's own destination.
  expect(remoteAlertRoute({ url: '/', screen: 'videos' })).toBe('/videos');
  // Workout reminders open through workoutReminders.ts; rest alerts are only local.
  expect(remoteAlertRoute({ kind: 'workout', startedAt: 1, url: '/#log' })).toBeNull();
  expect(remoteAlertRoute({ kind: 'rest' })).toBeNull();
  expect(remoteAlertRoute({ url: '/' })).toBeNull();
  expect(remoteAlertRoute(undefined)).toBeNull();
  expect(remoteAlertRoute({ url: 5 })).toBeNull();
});
