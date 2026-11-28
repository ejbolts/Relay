import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  BACK_ONLINE_MS,
  CONFIRM_OFFLINE_MS,
  MIN_OFFLINE_SHOWN_MS,
  MINIMISE_AFTER_MS,
  type CheckOutcome,
} from '../../../../frontend/src/connectionMonitor';
import { connection } from '../../data/connectionStatus';
import { reportRequestOutcome } from '../../data/requestOutcome';
import { OfflineNotice } from './OfflineNotice';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('../workout/WorkoutProvider', () => ({ useWorkout: () => ({ queue: { waiting: 1 } }) }));

const check = jest.fn<Promise<CheckOutcome>, []>();
let view: Awaited<ReturnType<typeof render>>;

beforeEach(async () => {
  jest.useFakeTimers();
  onlineManager.setOnline(true);
  check.mockReset();
  check.mockResolvedValue(false);
  connection.setCheck(check);
  connection.reset();
  // Relay answered earlier this session.
  connection.reportServerReached();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockClear();
  view = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <OfflineNotice />
    </SafeAreaProvider>,
  );
});

afterEach(async () => {
  await act(async () => view.unmount());
  connection.setCheck();
  connection.reset();
  onlineManager.setOnline(true);
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const advance = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));
/** A request data/api.ts sent that reached nothing. */
const unreachableRead = () => act(async () => reportRequestOutcome({ kind: 'unreachable' }));
/** A request Relay (or a proxy in front of it) answered. */
const answered = (status: number) =>
  act(async () => reportRequestOutcome({ kind: 'answered', status }));
const pill = (name: string) => screen.queryByRole('button', { name });

it('names a lasting outage, shrinks to an icon, opens the details and confirms it is back', async () => {
  await unreachableRead();
  await advance(CONFIRM_OFFLINE_MS - 1);
  expect(pill('Offline')).toBeNull();
  await advance(1);
  expect(pill('Offline')).toBeOnTheScreen();
  expect(screen.getByText('Offline')).toBeOnTheScreen();
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith('Offline');

  // After saying it once it shrinks to its icon, still named for screen readers.
  await advance(MINIMISE_AFTER_MS);
  expect(screen.queryByText('Offline')).toBeNull();
  expect(pill('Offline')).toBeCollapsed();

  await fireEvent.press(pill('Offline')!);
  expect(pill('Offline')).toBeExpanded();
  expect(screen.getByLabelText('Internet: Connected')).toBeOnTheScreen();
  expect(screen.getByLabelText('Server: Unreachable')).toBeOnTheScreen();
  expect(screen.getByLabelText(/^Last connected: /)).toBeOnTheScreen();
  expect(screen.getByLabelText('Saved on this phone: 1 workout')).toBeOnTheScreen();
  expect(screen.getByText(/^Next check in \d+ s$/)).toBeOnTheScreen();

  check.mockResolvedValue(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Try now' }));
  // It has shown for three seconds, and stays at least four, so it never flashes.
  await advance(MIN_OFFLINE_SHOWN_MS - MINIMISE_AFTER_MS - 1);
  expect(pill('Offline')).toBeOnTheScreen();
  await advance(1);
  expect(screen.getByLabelText('Back online')).toBeOnTheScreen();
  expect(pill('Back online')).toBeNull();
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith('Back online');
  await advance(BACK_ONLINE_MS);
  expect(screen.queryByLabelText('Back online')).toBeNull();
});

it('says there is no internet when the phone is offline, without asking the server', async () => {
  await act(async () => onlineManager.setOnline(false));
  await advance(CONFIRM_OFFLINE_MS + 10_000);
  expect(pill('No internet')).toBeOnTheScreen();
  expect(check).not.toHaveBeenCalled();
  await fireEvent.press(pill('No internet')!);
  expect(screen.getByLabelText('Internet: Not connected')).toBeOnTheScreen();
  expect(screen.queryByLabelText(/^Server: /)).toBeNull();

  check.mockResolvedValue(true);
  await act(async () => onlineManager.setOnline(true));
  // Shown for well over four seconds already, so "Back online" comes straight away.
  await advance(0);
  expect(screen.getByLabelText('Back online')).toBeOnTheScreen();
  await advance(BACK_ONLINE_MS);
  expect(screen.queryByLabelText('Back online')).toBeNull();
});

it('says nothing about a drop that an answer ends within twenty seconds', async () => {
  await unreachableRead();
  await advance(10_000);
  // Any answer from Relay, even a refusal, means it is reachable.
  await answered(500);
  await advance(CONFIRM_OFFLINE_MS * 2);
  expect(pill('Offline')).toBeNull();
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
});

it('names a server that a proxy says is down from the answers alone', async () => {
  // The health check never answers, so only the requests' 503s say what is wrong.
  check.mockImplementation(() => new Promise<CheckOutcome>(() => undefined));
  await answered(503);
  await advance(10_000);
  await answered(502);
  await advance(CONFIRM_OFFLINE_MS);
  await fireEvent.press(pill('Offline')!);
  expect(screen.getByLabelText('Server: Offline')).toBeOnTheScreen();
});
