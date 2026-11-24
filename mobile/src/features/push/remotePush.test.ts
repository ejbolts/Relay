import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiSend } from '../../data/api';
import { memoryKv } from '../../testing/memoryKvStore';
import {
  disableRemotePush,
  enableRemotePush,
  LOCAL_ALERTS,
  remoteAlertRoute,
  remotePushAvailability,
  remotePushStatus,
  reportLocalReminder,
  resetRemotePushForTests,
  retryLocalReminderReport,
  setRemotePushAccount,
  syncRemotePush,
  unavailableMessage,
} from './remotePush';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('../../data/api', () => ({ apiSend: jest.fn(async () => undefined) }));

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
  getExpoPushTokenAsync: jest.fn(async () => ({ type: 'expo', data: 'ExponentPushToken[phone]' })),
}));

const TOKEN = 'ExponentPushToken[phone]';
const send = jest.mocked(apiSend);
const permissions = jest.mocked(Notifications.getPermissionsAsync);
const request = jest.mocked(Notifications.requestPermissionsAsync);

function allow(granted: boolean, canAskAgain = true) {
  permissions.mockResolvedValue({ granted, canAskAgain } as never);
}

function calls(method: string) {
  return send.mock.calls.filter(([, used]) => used === method);
}

beforeEach(() => {
  jest.useFakeTimers();
  memoryKv.clear();
  resetRemotePushForTests();
  send.mockReset().mockResolvedValue(undefined);
  request.mockReset();
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.mocked(isRunningInExpoGo).mockReturnValue(false);
  mockConstants.expoConfig = { extra: { eas: { projectId: 'project-1' } } };
  mockConstants.easConfig = null;
  allow(true);
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
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
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
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(calls('POST')).toEqual([
      [
        '/api/notifications/expo/tokens',
        'POST',
        { token: TOKEN, platform: 'ios', local_alerts: LOCAL_ALERTS },
      ],
    ]);
    expect(remotePushStatus()).toEqual({ kind: 'enabled' });
  });

  test('nothing registers without permission; a refusal shows as blocked', async () => {
    allow(false);
    await syncRemotePush(true);
    expect(remotePushStatus()).toEqual({ kind: 'available' });
    allow(false, false);
    await syncRemotePush(true);
    expect(remotePushStatus()).toEqual({ kind: 'blocked' });
    expect(send).not.toHaveBeenCalled();
  });

  test('a phone that was refused is checked again when Relay comes back', async () => {
    allow(false, false);
    await syncRemotePush(true);
    expect(remotePushStatus()).toEqual({ kind: 'blocked' });
    allow(true);
    await syncRemotePush();
    expect(remotePushStatus()).toEqual({ kind: 'enabled' });
    send.mockClear();
    await syncRemotePush();
    expect(send).not.toHaveBeenCalled();
  });

  test('turning it on asks for permission, and a refusal explains what to do', async () => {
    allow(false);
    request.mockResolvedValueOnce({ granted: false, canAskAgain: false } as never);
    await expect(enableRemotePush()).rejects.toThrow('Notifications are blocked.');
    expect(remotePushStatus()).toEqual({ kind: 'blocked' });

    request.mockResolvedValueOnce({ granted: true } as never);
    allow(false, true);
    await enableRemotePush();
    expect(calls('POST')).toHaveLength(1);
    expect(remotePushStatus()).toEqual({ kind: 'enabled' });
  });

  test('turning it off removes the token, and it stays off', async () => {
    await syncRemotePush(true);
    await disableRemotePush();
    expect(calls('DELETE')).toEqual([
      ['/api/notifications/expo/tokens', 'DELETE', { token: TOKEN }],
    ]);
    send.mockClear();
    await syncRemotePush(true);
    expect(send).not.toHaveBeenCalled();
    expect(remotePushStatus()).toEqual({ kind: 'available' });
  });

  test('an offline phone that registered before still shows as on, and retries later', async () => {
    await syncRemotePush(true);
    send.mockRejectedValueOnce(new Error('offline'));
    await syncRemotePush(true);
    expect(remotePushStatus()).toEqual({ kind: 'enabled' });
  });

  test('signing out forgets the registration and resets the choice for the next account', async () => {
    await syncRemotePush(true);
    await disableRemotePush();
    setRemotePushAccount(null);
    setRemotePushAccount('bob');
    send.mockClear();
    await syncRemotePush(true);
    // Bob starts with alerts on, as a new account does on the web.
    expect(calls('POST')).toHaveLength(1);
  });

  test("a registration that finishes after a sign-out isn't kept for the next account", async () => {
    let finish: () => void = () => undefined;
    send.mockImplementationOnce(
      () => new Promise<undefined>((done) => (finish = () => done(undefined))),
    );
    const pending = syncRemotePush(true);
    await jest.advanceTimersByTimeAsync(0);
    setRemotePushAccount(null);
    setRemotePushAccount('bob');
    finish();
    await pending;
    send.mockClear();
    reportLocalReminder(1000, 2000);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(calls('PUT')).toEqual([]);
  });
});

describe('the reminder the phone schedules itself', () => {
  test('is reported a moment after it changes, once per change', async () => {
    await syncRemotePush(true);
    await jest.advanceTimersByTimeAsync(10_000);
    send.mockClear();
    reportLocalReminder(1_700_000_000_000, 1_700_000_100_000);
    reportLocalReminder(1_700_000_000_000, 1_700_000_200_000);
    await jest.advanceTimersByTimeAsync(4_000);
    expect(calls('PUT')).toEqual([]);
    await jest.advanceTimersByTimeAsync(2_000);
    expect(calls('PUT')).toEqual([
      [
        '/api/notifications/expo/tokens/local-reminder',
        'PUT',
        { token: TOKEN, workout_started_at: '1700000000000', due_at_ms: 1_700_000_200_000 },
      ],
    ]);
    reportLocalReminder(1_700_000_000_000, 1_700_000_200_000);
    await jest.advanceTimersByTimeAsync(6_000);
    expect(calls('PUT')).toHaveLength(1);

    reportLocalReminder(null, null);
    await jest.advanceTimersByTimeAsync(6_000);
    expect(calls('PUT').at(-1)?.[2]).toEqual({
      token: TOKEN,
      workout_started_at: null,
      due_at_ms: null,
    });
  });

  test('a report that failed offline is sent again when the app comes back', async () => {
    await syncRemotePush(true);
    await jest.advanceTimersByTimeAsync(10_000);
    send.mockClear();
    send.mockRejectedValueOnce(new Error('offline'));
    reportLocalReminder(5, 10);
    await jest.advanceTimersByTimeAsync(6_000);
    retryLocalReminderReport();
    await jest.advanceTimersByTimeAsync(0);
    expect(calls('PUT')).toHaveLength(2);
    retryLocalReminderReport();
    await jest.advanceTimersByTimeAsync(0);
    expect(calls('PUT')).toHaveLength(2);
  });

  test('is not reported by a phone without Phone alerts', async () => {
    allow(false);
    await syncRemotePush(true);
    reportLocalReminder(5, 10);
    await jest.advanceTimersByTimeAsync(6_000);
    expect(send).not.toHaveBeenCalled();
  });
});

test('a tapped server alert opens the screen its web address points to', () => {
  expect(remoteAlertRoute({ url: '/?admin-account=abc-123#admin', tag: 'x' })).toBe(
    '/admin/account/abc-123',
  );
  expect(remoteAlertRoute({ url: '/?admin-account=../x#admin' })).toBe('/admin');
  expect(remoteAlertRoute({ url: '/#history', tag: 'inactive-workout' })).toBe('/training');
  // Workout reminders open through workoutReminders.ts; rest alerts are only local.
  expect(remoteAlertRoute({ kind: 'workout', startedAt: 1, url: '/#log' })).toBeNull();
  expect(remoteAlertRoute({ kind: 'rest' })).toBeNull();
  expect(remoteAlertRoute({ url: '/' })).toBeNull();
  expect(remoteAlertRoute(undefined)).toBeNull();
  expect(remoteAlertRoute({ url: 5 })).toBeNull();
});
