import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { memoryKv } from '../../testing/memoryKvStore';
import { askForRestAlerts, resetRestAlertsForTests, syncRestAlert } from './restAlerts';
import { NO_REST, pauseRest, startRest } from './restTimer';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  dismissNotificationAsync: jest.fn(async () => undefined),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const now = new Date(2026, 10, 23, 9, 0).getTime();

beforeEach(() => {
  jest.clearAllMocks();
  memoryKv.clear();
  resetRestAlertsForTests();
  jest.spyOn(Date, 'now').mockReturnValue(now);
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({ granted: true, canAskAgain: true } as never);
});

const scheduled = () =>
  jest.mocked(Notifications.scheduleNotificationAsync).mock.calls.map(([request]) => request);

test('a running rest schedules "Rest complete" for when it ends, naming the next set', async () => {
  await syncRestAlert(startRest(90, 'm1', now, 'r1'), 'Bench Press · Set 2 · 80 kg × 8');
  expect(scheduled()).toEqual([
    expect.objectContaining({
      content: expect.objectContaining({
        title: 'Rest complete',
        body: 'Bench Press · Set 2 · 80 kg × 8',
        data: { kind: 'rest' },
      }),
      trigger: expect.objectContaining({ type: 'date', date: now + 90_000 }),
    }),
  ]);
});

test('±30 s moves the alert, while pausing, skipping or finishing cancels it', async () => {
  const rest = startRest(90, 'm1', now, 'r1');
  await syncRestAlert(rest, null);
  await syncRestAlert(rest, null);
  expect(scheduled()).toHaveLength(1);
  const longer = { ...rest, timer: { ...rest.timer!, endsAt: now + 120_000 } };
  await syncRestAlert(longer, null);
  expect(scheduled().at(-1)?.trigger).toMatchObject({ date: now + 120_000 });
  expect(scheduled().at(-1)?.content.body).toBe('Time for your next set.');

  jest.clearAllMocks();
  await syncRestAlert(pauseRest(longer, now), null);
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalled();
  expect(scheduled()).toEqual([]);
  // A paused rest is still showing, so nothing already delivered is cleared yet.
  expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalled();

  await syncRestAlert(NO_REST, null);
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalled();
  expect(scheduled()).toEqual([]);
});

test('without permission nothing is scheduled', async () => {
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({ granted: false, canAskAgain: false } as never);
  await syncRestAlert(startRest(60, null, now, 'r1'), null);
  expect(scheduled()).toEqual([]);
});

test('the first rest asks once, then schedules the rest that asked', async () => {
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({ granted: false, canAskAgain: true } as never);
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ granted: true } as never);
  const asking = askForRestAlerts();
  void syncRestAlert(startRest(60, null, now, 'r1'), null);
  await asking;
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(scheduled()).toHaveLength(1);

  await askForRestAlerts();
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
});

test('on Android the alert uses its own high-importance channel, or the default one', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await syncRestAlert(startRest(60, null, now, 'r1'), null);
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('rest-timer', {
    name: 'Rest timer',
    importance: 4,
  });
  expect(scheduled()[0].trigger).toMatchObject({ channelId: 'rest-timer' });

  // Expo Go refuses some channels; the alert still goes out on the default channel.
  resetRestAlertsForTests();
  jest.mocked(Notifications.setNotificationChannelAsync).mockRejectedValueOnce(new Error('no'));
  await syncRestAlert(startRest(45, null, now, 'r2'), null);
  expect(scheduled().at(-1)?.trigger).not.toHaveProperty('channelId');
});
