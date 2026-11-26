import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { localDate } from '../../../../frontend/src/utils';
import { readActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import { apiGet, currentUser } from '../../data/api';
import { deviceStorage } from '../../data/deviceStorage';
import { useUpNext } from '../../data/queries';
import { SessionProvider } from '../../session/SessionProvider';
import { memoryKv } from '../../testing/memoryKvStore';
import { showMenu, type MenuOption } from '../../ui/prompts';
import { pushDay, types } from './testFixtures';
import { useWorkout, WorkoutProvider } from './WorkoutProvider';
import { WorkoutSheet } from './WorkoutSheet';

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
jest.mock('./restAlerts', () => ({
  askForRestAlerts: jest.fn(async () => undefined),
  syncRestAlert: jest.fn(async () => undefined),
}));
jest.mock('../../ui/prompts', () => ({
  promptText: jest.fn(),
  showMenu: jest.fn(),
  PromptHost: () => null,
}));
jest.mock('../../ui/Toast', () => ({
  showToast: jest.fn(),
  ToastHost: () => null,
  toastShowing: () => false,
  toastAccount: () => 'u1',
  toastAccountFor: () => 'u1',
  isToastAccountCurrent: () => true,
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
    useDashboard: () => ({
      data: {
        recommendation: { category: 'push' },
        history: { first_workout_date: '2025-01-04' },
      },
    }),
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
let client: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  memoryKv.clear();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.mocked(currentUser).mockResolvedValue(user);
  jest.mocked(useUpNext).mockReturnValue({
    template: pushDay,
    label: 'Push',
    recommendation: { category: 'push' },
    type: types.find((type) => type.id === 'push'),
  } as unknown as ReturnType<typeof useUpNext>);
});
afterEach(() => client.clear());

async function openLogger(start = true) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const captured: { start?: ReturnType<typeof useWorkout>['start'] } = {};
  function Probe() {
    const workout = useWorkout();
    useEffect(() => {
      captured.start = workout.start;
    });
    return null;
  }
  const view = await render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <WorkoutProvider>
          <WorkoutSheet />
          <Probe />
        </WorkoutProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(currentUser).toHaveBeenCalled());
  await waitFor(() => expect(captured.start).toBeDefined());
  if (start) await act(async () => captured.start!({ kind: 'up-next' }));
  expect(await screen.findByText('Bench Press')).toBeVisible();
  return view;
}

const option = (options: MenuOption[], label: string) => {
  const found = options.find((item) => item.label.startsWith(label));
  if (!found) throw new Error(`No ${label} in ${options.map((item) => item.label).join(', ')}`);
  return found;
};

const draftSet = (movement: number, set: number) =>
  readActiveWorkoutDraft(deviceStorage)?.movements[movement].sets[set];
const menuCall = (title: string) => {
  const call = jest.mocked(showMenu).mock.calls.find(([heading]) => heading === title);
  if (!call) throw new Error(`No menu ${title}`);
  return call[1] as MenuOption[];
};

test('a cleared suggestion stops showing last time, and the set logs without that weight', async () => {
  await openLogger();
  const weight = screen.getByLabelText('Weight kilograms for set 1, suggested value');
  expect(weight.props.value).toBe('80');
  await fireEvent.changeText(weight, '');
  const cleared = screen.getByLabelText(/^Weight kilograms for set 1/);
  // The field shows it is empty, not last time's 80.
  expect(cleared.props.value).toBe('');
  expect(cleared.props.placeholder).toBe('–');
  await fireEvent.press(screen.getAllByRole('button', { name: 'Complete set 1' })[0]);
  expect(draftSet(0, 0)).toMatchObject({ completed: true, weight_kg: null, reps: 8 });
});

test('a cleared field stays empty after the workout is reopened, without last time’s value', async () => {
  const first = await openLogger();
  await fireEvent.changeText(
    screen.getByLabelText('Weight kilograms for set 1, suggested value'),
    '',
  );
  expect(draftSet(0, 0)?.weight_kg).toBeNull();
  await first.unmount();
  client.clear();
  await openLogger(false);
  const reopened = screen.getByLabelText(/^Weight kilograms for set 1/);
  expect(reopened.props.value).toBe('');
  // Last time's 80 doesn't come back as a hint: the web's empty set field shows nothing.
  expect(reopened.props.placeholder).toBe('–');
});

test('the RPE column sets the RPE from its own menu', async () => {
  await openLogger();
  await fireEvent.press(screen.getAllByRole('button', { name: 'RPE for set 1' })[0]);
  await act(async () => option(menuCall('RPE · set 1'), '8.5').onPress());
  expect(screen.getAllByLabelText('RPE 8.5 for set 1')[0]).toBeVisible();
  expect(draftSet(0, 0)?.rpe).toBe(8.5);
});

test('a logged set keeps the day’s bodyweight and shows its ratio', async () => {
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) =>
      path === '/api/body-measurements'
        ? [{ id: 'm1', measurement_date: localDate(), weight_kg: 80 }]
        : [],
    );
  await openLogger();
  await waitFor(() =>
    expect(apiGet).toHaveBeenCalledWith('/api/body-measurements', expect.anything()),
  );
  await act(async () => undefined);
  await fireEvent.changeText(
    screen.getByLabelText('Weight kilograms for set 1, suggested value'),
    '100',
  );
  await fireEvent.press(screen.getAllByRole('button', { name: 'Complete set 1' })[0]);
  expect(await screen.findByText('1.25× BW · at 80 kg BW')).toBeVisible();
  expect(draftSet(0, 0)).toMatchObject({ completed: true, weight_kg: 100, bodyweight_kg: 80 });
});

test('workout notes in the details card come back with the restored workout', async () => {
  const first = await openLogger();
  await fireEvent.press(screen.getByRole('button', { name: 'Workout details' }));
  await fireEvent.changeText(screen.getByLabelText('Workout notes'), 'Short on time');
  expect(readActiveWorkoutDraft(deviceStorage)?.notes).toBe('Short on time');
  await first.unmount();
  client.clear();
  await openLogger(false);
  expect(screen.getByRole('button', { name: 'Workout details' })).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ expanded: true }),
  );
  expect(screen.getByLabelText('Workout notes').props.value).toBe('Short on time');
});
