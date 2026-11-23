import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, Platform } from 'react-native';
import type { TrackedWorkout, WorkoutInput } from '../../../../frontend/src/types';
import { apiGet, apiSend, currentUser } from '../../data/api';
import { useUpNext } from '../../data/queries';
import { showMenu, type MenuOption } from '../../ui/prompts';
import { SessionProvider } from '../../session/SessionProvider';
import { memoryKv } from '../../testing/memoryKvStore';
import { EditWorkoutScreen } from './EditWorkoutScreen';
import { lastPush, pushDay, trackedSet, types } from './testFixtures';
import { useWorkout, WorkoutProvider } from './WorkoutProvider';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePreventRemove: jest.fn(),
}));
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
jest.mock('expo-image-picker', () => ({}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
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
  apiGet: jest.fn(),
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

// The native pickers, as text fields the test can type a value into.
jest.mock('../body/DateField', () => {
  const { TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
  const Field = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
  }) => <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} />;
  return { DateField: Field, TimeField: Field };
});

const user = { id: 'u1', username: 'preview' } as Awaited<ReturnType<typeof currentUser>>;
let client: QueryClient;
let puts: { path: string; body: WorkoutInput }[];

const saved: TrackedWorkout = {
  ...lastPush,
  id: 'w1',
  revision: 4,
  duration_minutes: 50,
  start_time: null,
  end_time: null,
  movements: [{ ...lastPush.movements[0], sets: [trackedSet(0, { reps: 8, weight_kg: 80 })] }],
};

beforeEach(() => {
  jest.clearAllMocks();
  memoryKv.clear();
  puts = [];
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.mocked(currentUser).mockResolvedValue(user);
  jest.mocked(useUpNext).mockReturnValue({
    template: pushDay,
    label: 'Push',
    recommendation: { category: 'push' },
    type: types.find((type) => type.id === 'push'),
  } as unknown as ReturnType<typeof useUpNext>);
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) =>
      path === '/api/workouts/w1'
        ? saved
        : path === '/api/active-workout'
          ? { revision: 0, draft: null }
          : [],
    );
  jest.mocked(apiSend).mockImplementation(async (path, method, body) => {
    if (path === '/api/active-workout')
      return { revision: 1, draft: (body as { draft: unknown }).draft, conflict: false };
    if (method === 'PUT') puts.push({ path, body: body as WorkoutInput });
    return { ...saved, revision: 5 };
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => client?.clear());

async function renderEditor() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  function Probe() {
    useWorkout();
    return null;
  }
  await render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <WorkoutProvider>
          <EditWorkoutScreen workoutId="w1" />
          <Probe />
        </WorkoutProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Bench Press', {}, { timeout: 5000 })).toBeVisible();
}

test('an edit moves the workout to another day and records its times', async () => {
  await renderEditor();
  await fireEvent.changeText(screen.getByLabelText('Date'), '2026-11-02');
  await fireEvent.press(screen.getByRole('button', { name: 'Add start and end times' }));
  await fireEvent.changeText(screen.getByLabelText('Start time'), '17:30');
  await fireEvent.changeText(screen.getByLabelText('End time'), '18:45');
  // Recorded times set the duration, which can no longer be typed.
  expect(screen.getByLabelText('Duration: 1h 15min')).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Save workout' }));
  await waitFor(() => expect(puts).toHaveLength(1));
  expect(puts[0].body).toMatchObject({
    workout_date: '2026-11-02',
    start_time: '17:30',
    end_time: '18:45',
    duration_minutes: 75,
    base_revision: 4,
  });
});

test('clearing the times keeps the duration and saves without them', async () => {
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) =>
      path === '/api/workouts/w1'
        ? { ...saved, start_time: '06:00:00', end_time: '07:10:00', duration_minutes: 70 }
        : path === '/api/active-workout'
          ? { revision: 0, draft: null }
          : [],
    );
  await renderEditor();
  expect(screen.getByLabelText('Start time')).toHaveDisplayValue('06:00');
  await fireEvent.press(screen.getByRole('button', { name: 'Clear start and end times' }));
  expect(screen.queryByLabelText('Start time')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Save workout' }));
  await waitFor(() => expect(puts).toHaveLength(1));
  expect(puts[0].body).toMatchObject({ start_time: null, end_time: null, duration_minutes: 70 });
});

test('a 24-hour workout keeps its duration and is not offered start and end times', async () => {
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) =>
      path === '/api/workouts/w1'
        ? { ...saved, duration_minutes: 1440 }
        : path === '/api/active-workout'
          ? { revision: 0, draft: null }
          : [],
    );
  await renderEditor();
  expect(screen.getByRole('button', { name: /^Duration: 24h/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Add start and end times' })).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Date'), '2026-11-02');
  await fireEvent.press(screen.getByRole('button', { name: 'Save workout' }));
  await waitFor(() => expect(puts).toHaveLength(1));
  expect(puts[0].body).toMatchObject({ duration_minutes: 1440, start_time: null, end_time: null });
});

test('the bodyweight comes from the workout as opened, so removing a set changes nothing', async () => {
  // One set logged at an 80 kg bodyweight, an older one saved without one, and a later 85 kg
  // check-in for that day.
  const opened: TrackedWorkout = {
    ...saved,
    movements: [
      {
        ...lastPush.movements[0],
        sets: [
          trackedSet(0, { reps: 8, weight_kg: 80, bodyweight_kg: 80 }),
          trackedSet(1, { reps: 5, weight_kg: 100 }),
        ],
      },
    ],
  };
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) =>
      path === '/api/workouts/w1'
        ? opened
        : path === '/api/active-workout'
          ? { revision: 0, draft: null }
          : path === '/api/body-measurements'
            ? [{ id: 'm1', measurement_date: opened.workout_date, weight_kg: 85 }]
            : [],
    );
  await renderEditor();
  await waitFor(() =>
    expect(apiGet).toHaveBeenCalledWith('/api/body-measurements', expect.anything()),
  );
  // The heaviest set, saved without a bodyweight, uses the workout's own 80 kg.
  expect(await screen.findByText('1.25× BW · at 80 kg BW')).toBeVisible();

  // Removing the set that carried the bodyweight changes neither the ratio nor new sets.
  await fireEvent.press(screen.getByRole('button', { name: 'Set 1 type: Working set' }));
  const setMenu = jest.mocked(showMenu).mock.calls.at(-1)![1] as MenuOption[];
  await act(async () => setMenu.find((item) => item.label === 'Delete set')!.onPress());
  expect(screen.queryByRole('button', { name: 'Set 2 type: Working set' })).toBeNull();
  expect(screen.getByText('1.25× BW · at 80 kg BW')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Add set to Bench Press' }));
  const added = screen.getByRole('button', { name: /^(Complete|Mark) set 2/ });
  if (added.props.accessibilityLabel?.startsWith('Complete')) await fireEvent.press(added);
  await fireEvent.press(screen.getByRole('button', { name: 'Save workout' }));
  await waitFor(() => expect(puts).toHaveLength(1));
  expect(puts[0].body.movements[0].sets.map((item) => item.bodyweight_kg)).toEqual([null, 80]);
});
