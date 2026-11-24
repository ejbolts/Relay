import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';
import { request } from '../../data/api';
import { sessionToken } from '../../data/session';
import { nextSessionEpoch } from '../../session/sessionEpoch';
import { memoryKv } from '../../testing/memoryKvStore';
import { showToast } from '../../ui/Toast';
import { Section, SectionError } from '../settings/SettingsList';
import { PhoneAlertsRow, TestAlertRow, usePhoneAlerts } from './PhoneAlertsRows';
import { resetRemotePushForTests, setRemotePushAccount, syncRemotePush } from './remotePush';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('../../data/api', () => ({
  ApiError: jest.requireActual('../../data/api').ApiError,
  serverOrigin: () => 'https://relay.test',
  request: jest.fn(async () => undefined),
}));
jest.mock('../../data/session', () => ({ sessionToken: jest.fn(async () => 'bearer-alice') }));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn(), toastAccount: () => 'user:alice' }));
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
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  getExpoPushTokenAsync: jest.fn(async () => ({ type: 'expo', data: 'ExponentPushToken[phone]' })),
}));

function Notifications_() {
  const alerts = usePhoneAlerts();
  return (
    <>
      <Section title="Notifications">
        <PhoneAlertsRow alerts={alerts} />
        {alerts.enabled && <TestAlertRow alerts={alerts} />}
      </Section>
      <SectionError message={alerts.error} />
    </>
  );
}

const send = jest.mocked(request);
const sentAs = (path: string, method: string, body?: unknown) =>
  expect(send).toHaveBeenCalledWith(
    path,
    expect.objectContaining({ method, ...(body ? { body: JSON.stringify(body) } : {}) }),
    'bearer-alice',
  );

beforeEach(() => {
  memoryKv.clear();
  resetRemotePushForTests();
  send.mockReset().mockResolvedValue(undefined);
  jest.mocked(showToast).mockClear();
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.mocked(isRunningInExpoGo).mockReturnValue(false);
  mockConstants.expoConfig = { extra: { eas: { projectId: 'project-1' } } };
  mockConstants.easConfig = null;
  jest.mocked(sessionToken).mockResolvedValue('bearer-alice');
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({ granted: true, canAskAgain: true } as never);
  nextSessionEpoch();
  setRemotePushAccount('alice');
});

afterEach(() => jest.restoreAllMocks());

test('in Expo Go on Android the switch is off and disabled, and (?) says why', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.mocked(isRunningInExpoGo).mockReturnValue(true);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await render(<Notifications_ />);
  await act(() => syncRemotePush(true));
  expect(screen.getByLabelText('Phone alerts')).toBeDisabled();
  expect(screen.queryByText('Send test alert')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Why phone alerts are unavailable'));
  expect(alert).toHaveBeenCalledWith('Phone alerts', expect.stringContaining('Expo Go on Android'));
});

test('a registered phone shows the switch on, sends a test alert, and turns off', async () => {
  await render(<Notifications_ />);
  await act(() => syncRemotePush(true));
  expect(screen.getByLabelText('Phone alerts')).toHaveProp('value', true);
  expect(screen.queryByLabelText('Why phone alerts are unavailable')).toBeNull();

  await fireEvent.press(screen.getByText('Send test alert'));
  await waitFor(() =>
    expect(showToast).toHaveBeenCalledWith('Test alert sent', undefined, {
      account: 'user:alice',
    }),
  );
  sentAs('/api/notifications/expo/tokens/test', 'POST', { token: 'ExponentPushToken[phone]' });

  await fireEvent(screen.getByLabelText('Phone alerts'), 'valueChange', false);
  await waitFor(() => expect(screen.queryByText('Send test alert')).toBeNull());
  sentAs('/api/notifications/expo/tokens', 'DELETE', { token: 'ExponentPushToken[phone]' });
  expect(showToast).toHaveBeenCalledWith('Phone alerts off', undefined, { account: 'user:alice' });
});

test('turning it on when notifications are blocked shows how to fix it beside the section', async () => {
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({ granted: false, canAskAgain: false } as never);
  await render(<Notifications_ />);
  await act(() => syncRemotePush(true));
  expect(screen.getByLabelText('Phone alerts')).toHaveProp('value', false);
  await fireEvent(screen.getByLabelText('Phone alerts'), 'valueChange', true);
  expect(
    await screen.findByText(
      'Notifications are blocked. Allow them in your phone settings, then try again.',
    ),
  ).toBeTruthy();
  expect(showToast).not.toHaveBeenCalled();
});

test('turning it off offline says alerts stop once back online, without a confirmation', async () => {
  await render(<Notifications_ />);
  await act(() => syncRemotePush(true));
  send.mockImplementation(async (_path, init) => {
    if (init?.method === 'DELETE') throw new Error('Could not reach Relay.');
    return undefined as never;
  });
  await fireEvent(screen.getByLabelText('Phone alerts'), 'valueChange', false);
  expect(
    await screen.findByText(
      "Couldn't reach Relay. Phone alerts will stop for this phone once it's back online.",
    ),
  ).toBeTruthy();
  expect(screen.getByLabelText('Phone alerts')).toHaveProp('value', false);
  expect(showToast).not.toHaveBeenCalledWith('Phone alerts off', undefined, expect.anything());
});
