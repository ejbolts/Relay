import { render, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { RemotePushSync, resetRemotePushSyncForTests } from './RemotePushSync';
import { resetRemotePushForTests } from './remotePush';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('../../data/api', () => ({
  ApiError: jest.requireActual('../../data/api').ApiError,
  serverOrigin: () => 'https://relay.test',
  request: jest.fn(async () => undefined),
}));
jest.mock('../../data/session', () => ({ sessionToken: jest.fn(async () => 'bearer') }));
jest.mock('../workout/restAlerts', () => ({ setUpHandler: jest.fn() }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
}));

const response = (data: Record<string, unknown>) =>
  ({ notification: { request: { content: { data } } } }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  resetRemotePushForTests();
  resetRemotePushSyncForTests();
});

test('a server alert tapped while Relay runs opens its screen', async () => {
  const view = await render(<RemotePushSync userId="alice" />);
  const opened = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock
    .calls[0][0];
  opened(response({ url: '/', tag: null, screen: 'videos' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/videos');
  // Workout reminders are left to the workout, which may still be loading.
  opened(response({ kind: 'workout', startedAt: 1, url: '/#log' }));
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  await view.unmount();
});

test('a server alert that launched Relay opens its screen once, and is cleared', async () => {
  jest
    .mocked(Notifications.getLastNotificationResponseAsync)
    .mockResolvedValue(response({ url: '/?admin-account=abc-123#admin' }));
  const view = await render(<RemotePushSync userId="alice" />);
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/admin/account/abc-123'));
  expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
  await view.unmount();
  await render(<RemotePushSync userId="alice" />);
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
});

test('a workout reminder that launched Relay is left for the workout to open', async () => {
  jest
    .mocked(Notifications.getLastNotificationResponseAsync)
    .mockResolvedValue(response({ kind: 'workout', startedAt: 5 }));
  const view = await render(<RemotePushSync userId="alice" />);
  await waitFor(() => expect(Notifications.getLastNotificationResponseAsync).toHaveBeenCalled());
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(Notifications.clearLastNotificationResponseAsync).not.toHaveBeenCalled();
  await view.unmount();
});
