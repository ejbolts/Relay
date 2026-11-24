import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import type { TrackedWorkout } from '../../../../frontend/src/types';
import { readActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import {
  relayLiveActivity,
  type RelayLiveActivityNative,
} from '../../../modules/relay-live-activity';
import { apiSend, currentUser } from '../../data/api';
import { deviceStorage } from '../../data/deviceStorage';
import { useUpNext } from '../../data/queries';
import { SessionProvider } from '../../session/SessionProvider';
import { memoryKv } from '../../testing/memoryKvStore';
import { resetRestActivityForTests } from './restActivity';
import { StartSheet } from './StartSheet';
import { pushDay, types } from './testFixtures';
import { WorkoutProvider } from './WorkoutProvider';
import { WorkoutSheet } from './WorkoutSheet';

// The live workout's rest drives the iPhone Live Activity through the native module, mocked here.

jest.mock('../../../modules/relay-live-activity', () => ({ relayLiveActivity: jest.fn() }));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual<typeof import('react-native-gesture-handler')>(
    'react-native-gesture-handler',
  ),
  usePanGesture: (config: unknown) => config,
  GestureDetector: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../../data/session', () => ({ sessionToken: jest.fn(async () => 'token') }));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiOrigin: 'https://relay.test',
  currentUser: jest.fn(),
  apiSend: jest.fn(),
  apiGet: jest.fn(async () => []),
}));
jest.mock('../../data/queries', () => {
  const fixtures = jest.requireActual<typeof import('./testFixtures')>('./testFixtures');
  return {
    ...jest.requireActual<typeof import('../../data/queries')>('../../data/queries'),
    useDashboard: () => ({ data: { recommendation: { category: 'push' } } }),
    useWorkoutHistory: () => ({ data: [fixtures.lastPush] }),
    useWorkoutTypes: () => ({
      data: fixtures.types,
      isPlaceholderData: false,
      fetchStatus: 'idle',
    }),
    useSavedExercises: () => ({ data: {} }),
    useExercises: () => ({ data: fixtures.exercises }),
    useTrainingPreferences: () => ({
      data: { preferred_weight_unit: 'kg', default_rest_seconds: 90 },
    }),
    useUpNext: jest.fn(),
    refreshTraining: jest.fn(async () => undefined),
  };
});

const user = { id: 'u1', username: 'preview' } as Awaited<ReturnType<typeof currentUser>>;
const native = {
  isSupported: jest.fn(() => true),
  show: jest.fn(async () => undefined),
  end: jest.fn(async () => undefined),
} satisfies RelayLiveActivityNative;
let client: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  memoryKv.clear();
  resetRestActivityForTests();
  jest.mocked(relayLiveActivity).mockReturnValue(native);
  jest.mocked(currentUser).mockResolvedValue(user);
  jest.mocked(useUpNext).mockReturnValue({
    template: pushDay,
    label: 'Push',
    recommendation: { category: 'push' },
    type: types.find((type) => type.id === 'push'),
  } as unknown as ReturnType<typeof useUpNext>);
  jest.mocked(apiSend).mockResolvedValue({ id: 'saved-1' } as TrackedWorkout);
  // Pick the last button of any alert (Finish workout, Discard workout).
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.at(-1)?.onPress?.();
  });
});
afterEach(() => client.clear());

async function open() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = await render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <WorkoutProvider>
          <StartSheet />
          <WorkoutSheet />
        </WorkoutProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(currentUser).toHaveBeenCalled());
  await act(async () => undefined);
  return view;
}

/** The last activity shown, as [exercise, next set, ends at, total, paused seconds]. */
const lastShown = () => (native.show.mock.calls.at(-1) as unknown[] | undefined)?.slice(1);

async function startRest() {
  await fireEvent.press(screen.getByRole('button', { name: 'Up next: Push day' }));
  expect(await screen.findByText('Bench Press')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Complete set 1' }));
  expect(screen.getByRole('button', { name: 'End rest timer' })).toBeVisible();
}

test('a logged set starts the activity, which follows pause, resume, ±30 s and skip', async () => {
  let now = new Date(2026, 10, 23, 9, 0).getTime();
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  await open();
  await startRest();
  const session = readActiveWorkoutDraft(deviceStorage)?.clientSessionId;
  expect(native.show).toHaveBeenLastCalledWith(
    session,
    'Bench Press',
    'Set 2 · 80 kg × 8',
    now + 120_000,
    120,
    null,
  );

  now += 20_000;
  await fireEvent.press(screen.getByRole('button', { name: 'Pause workout and rest timer' }));
  expect(lastShown()).toEqual(['Bench Press', 'Set 2 · 80 kg × 8', now + 100_000, 120, 100]);

  now += 60_000;
  await fireEvent.press(screen.getByRole('button', { name: 'Resume workout and rest timer' }));
  expect(lastShown()).toEqual(['Bench Press', 'Set 2 · 80 kg × 8', now + 100_000, 120, null]);

  await fireEvent.press(screen.getByRole('button', { name: 'Add 30 seconds to the rest' }));
  expect(lastShown()?.slice(2)).toEqual([now + 130_000, 130, null]);
  await fireEvent.press(screen.getByRole('button', { name: 'Take 30 seconds off the rest' }));
  expect(lastShown()?.slice(2)).toEqual([now + 100_000, 130, null]);

  native.end.mockClear();
  await fireEvent.press(screen.getByRole('button', { name: 'End rest timer' }));
  await waitFor(() => expect(native.end).toHaveBeenCalledTimes(1));
});

test('finishing the workout mid-rest ends the activity', async () => {
  await open();
  await startRest();
  expect(native.show).toHaveBeenCalled();
  native.end.mockClear();
  await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
  expect(await screen.findByText('Workout complete')).toBeVisible();
  await waitFor(() => expect(native.end).toHaveBeenCalled());
});

test('a rest that runs out ends the activity', async () => {
  let now = new Date(2026, 10, 23, 9, 0).getTime();
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  jest.useFakeTimers({ doNotFake: ['Date'] });
  try {
    await open();
    await startRest();
    native.end.mockClear();
    now += 121_000;
    await act(async () => jest.advanceTimersByTime(121_000));
    await waitFor(() => expect(native.end).toHaveBeenCalledTimes(1));
  } finally {
    jest.useRealTimers();
  }
});

test('relaunched mid-rest, the activity carries on with the same rest', async () => {
  const now = new Date(2026, 10, 23, 9, 0).getTime();
  jest.spyOn(Date, 'now').mockReturnValue(now);
  const first = await open();
  await startRest();
  const shownBefore = native.show.mock.calls.at(-1);
  await first.unmount();
  client.clear();

  // The app comes back 30 s later: the restored rest updates the activity left showing.
  jest.mocked(Date.now).mockReturnValue(now + 30_000);
  resetRestActivityForTests();
  native.show.mockClear();
  native.end.mockClear();
  await open();
  await waitFor(() => expect(native.show).toHaveBeenCalled());
  expect(native.show.mock.calls.at(-1)).toEqual(shownBefore);
  expect(native.end).not.toHaveBeenCalled();
});
