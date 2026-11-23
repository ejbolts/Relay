import * as Notifications from 'expo-notifications';
import { Alert, Linking } from 'react-native';
import { writeJson } from '../../data/deviceStorage';
import { memoryKv } from '../../testing/memoryKvStore';
import { showToast } from '../../ui/Toast';
import { restTimerPreference } from '../settings/devicePreferences';
import {
  INACTIVE_REMINDER_MS,
  remindAboutRestAlerts,
  resetWorkoutRemindersForTests,
  REST_ALERTS_ASKED_KEY,
  syncInactiveReminder,
  takeLaunchReminder,
} from './workoutReminders';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  dismissNotificationAsync: jest.fn(async () => undefined),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const now = new Date(2026, 10, 23, 9, 0).getTime();
const permission = (granted: boolean, canAskAgain = true) =>
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({ granted, canAskAgain } as never);
const buttons = () => jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;

beforeEach(() => {
  jest.clearAllMocks();
  memoryKv.clear();
  resetWorkoutRemindersForTests();
  restTimerPreference.set(true);
  jest.spyOn(Date, 'now').mockReturnValue(now);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  permission(false);
});

describe('the rest alert reminder', () => {
  it('waits for the first rest to ask, then reminds while alerts are off', async () => {
    await remindAboutRestAlerts();
    expect(Alert.alert).not.toHaveBeenCalled();
    writeJson(REST_ALERTS_ASKED_KEY, true);
    await remindAboutRestAlerts();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Turn on rest alerts?',
      expect.any(String),
      expect.any(Array),
    );
  });

  it("stays quiet with alerts on, the rest timer off, or after Don't show again", async () => {
    writeJson(REST_ALERTS_ASKED_KEY, true);
    permission(true);
    await remindAboutRestAlerts();
    permission(false);
    restTimerPreference.set(false);
    await remindAboutRestAlerts();
    expect(Alert.alert).not.toHaveBeenCalled();
    restTimerPreference.set(true);
    await remindAboutRestAlerts();
    buttons().find((button) => button.text === "Don't show again")!.onPress!();
    await remindAboutRestAlerts();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it('Turn on asks for permission, or opens Settings once it was refused', async () => {
    writeJson(REST_ALERTS_ASKED_KEY, true);
    jest
      .mocked(Notifications.requestPermissionsAsync)
      .mockResolvedValue({ granted: true } as never);
    await remindAboutRestAlerts();
    await buttons().find((button) => button.text === 'Turn on')!.onPress!();
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
    expect(showToast).toHaveBeenCalledWith('Rest alerts on');

    permission(false, false);
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await remindAboutRestAlerts();
    buttons().find((button) => button.text === 'Turn on')!.onPress!();
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
    expect(openSettings).toHaveBeenCalled();
  });
});

describe('the inactive workout reminder', () => {
  it('follows the last activity, and is cancelled when the workout ends', async () => {
    permission(true);
    await syncInactiveReminder(now, now - 600_000);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({
        identifier: 'relay-workout-inactive',
        content: expect.objectContaining({
          title: 'Still working out?',
          data: { kind: 'workout', startedAt: now - 600_000 },
        }),
        trigger: { type: 'date', date: now + INACTIVE_REMINDER_MS },
      }),
    );
    await syncInactiveReminder(now, now - 600_000);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    await syncInactiveReminder(now + 60_000, now - 600_000);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({
        trigger: { type: 'date', date: now + 60_000 + INACTIVE_REMINDER_MS },
      }),
    );
    await syncInactiveReminder(null);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenLastCalledWith(
      'relay-workout-inactive',
    );
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('is never scheduled without notification permission', async () => {
    await syncInactiveReminder(now);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('a reminder that launched Relay', () => {
  const response = (data: Record<string, unknown>) =>
    ({ notification: { request: { content: { data } } } }) as never;

  it('is taken once, with the workout it is about, and cleared', async () => {
    jest
      .mocked(Notifications.getLastNotificationResponseAsync)
      .mockResolvedValue(response({ kind: 'workout', startedAt: 42 }));
    expect(await takeLaunchReminder()).toBe(42);
    expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
    expect(await takeLaunchReminder()).toBeUndefined();
  });

  it('ignores other notifications', async () => {
    jest
      .mocked(Notifications.getLastNotificationResponseAsync)
      .mockResolvedValue(response({ kind: 'rest' }));
    expect(await takeLaunchReminder()).toBeUndefined();
    expect(Notifications.clearLastNotificationResponseAsync).not.toHaveBeenCalled();
  });
});
