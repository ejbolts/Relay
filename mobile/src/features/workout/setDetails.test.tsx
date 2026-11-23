import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { readActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import { apiGet, currentUser } from '../../data/api';
import { deviceStorage } from '../../data/deviceStorage';
import { useUpNext } from '../../data/queries';
import { SessionProvider } from '../../session/SessionProvider';
import { memoryKv } from '../../testing/memoryKvStore';
import { promptText, showMenu, type MenuOption } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
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

async function openLogger() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const captured: { start?: ReturnType<typeof useWorkout>['start'] } = {};
  function Probe() {
    const workout = useWorkout();
    useEffect(() => {
      captured.start = workout.start;
    });
    return null;
  }
  await render(
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
  await act(async () => captured.start!({ kind: 'up-next' }));
  expect(await screen.findByText('Bench Press')).toBeVisible();
}

/** Opens a menu (the set pill's, or a submenu) and returns its options. */
function menu(index: number): MenuOption[] {
  return jest.mocked(showMenu).mock.calls[index][1];
}
const option = (options: MenuOption[], label: string) => {
  const found = options.find((item) => item.label.startsWith(label));
  if (!found) throw new Error(`No ${label} in ${options.map((item) => item.label).join(', ')}`);
  return found;
};

test('RPE and a note are set from the set menu and show beneath the set', async () => {
  await openLogger();
  await fireEvent.press(screen.getByRole('button', { name: 'Set 1 type: Working set' }));
  // Last time's RPE is offered as a guide (the fixture's last bench had none).
  await act(async () => option(menu(0), 'RPE').onPress());
  expect(menu(1).map((item) => item.label)).toEqual([
    'No RPE ✓',
    '5',
    '6',
    '6.5',
    '7',
    '7.5',
    '8',
    '8.5',
    '9',
    '9.5',
    '10',
  ]);
  await act(async () => option(menu(1), '8.5').onPress());
  expect(screen.getByLabelText('RPE 8.5 for set 1')).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: 'Set 1 type: Working set' }));
  expect(option(menu(2), 'RPE').label).toBe('RPE 8.5');
  await act(async () => option(menu(2), 'Add note').onPress());
  const request = jest.mocked(promptText).mock.calls[0][0];
  expect(request).toMatchObject({ title: 'Note for set 1', multiline: true });
  await act(async () => request.onSubmit('Paused at the bottom'));
  expect(screen.getByText('Paused at the bottom')).toBeVisible();
  expect(readActiveWorkoutDraft(deviceStorage)?.movements[0].sets[0]).toMatchObject({
    rpe: 8.5,
    notes: 'Paused at the bottom',
  });

  // Clearing the note leaves none, rather than an empty one.
  await fireEvent.press(screen.getByRole('button', { name: /Edit note for set 1/ }));
  await act(async () => jest.mocked(promptText).mock.calls[1][0].onSubmit('  '));
  expect(screen.queryByText('Paused at the bottom')).toBeNull();
  expect(readActiveWorkoutDraft(deviceStorage)?.movements[0].sets[0].notes).toBeNull();
});

test('a set that beats a record shows its badge and is celebrated once', async () => {
  await openLogger();
  await fireEvent.changeText(
    screen.getByLabelText('Weight kilograms for set 1, suggested value'),
    '85',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Complete set 1' }));
  expect(screen.getByLabelText('Set 1: Weight PR')).toBeVisible();
  expect(showToast).toHaveBeenCalledTimes(1);
  expect(jest.mocked(showToast).mock.calls[0][0]).toBe(
    '🏆 Weight PR\nBench Press · 8 reps at 85 kg',
  );

  // Unticking and ticking the same set again is not a new record.
  await fireEvent.press(screen.getByRole('button', { name: 'Mark set 1 incomplete' }));
  expect(screen.queryByLabelText('Set 1: Weight PR')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Complete set 1' }));
  expect(screen.getByLabelText('Set 1: Weight PR')).toBeVisible();
  expect(showToast).toHaveBeenCalledTimes(1);

  // Matching last time's 80 kg × 8 is no record.
  await fireEvent.changeText(screen.getByLabelText(/^Weight kilograms for set 2/), '80');
  await fireEvent.press(screen.getByRole('button', { name: 'Complete set 2' }));
  expect(screen.queryByLabelText(/^Set 2: /)).toBeNull();
});

test('older history fills in an exercise the loaded workouts never had', async () => {
  jest.mocked(apiGet).mockImplementation(async (path: string) =>
    path.startsWith('/api/exercise-history-baselines')
      ? [
          {
            exercise_id: 'press',
            best_weight_kg: 50,
            reps_by_weight: [{ weight_kg: 50, reps: 6 }],
            latest: {
              workout_id: 'old',
              workout_date: '2025-03-01',
              workout_name: 'Old push',
              movement_notes: null,
              sets: [
                {
                  id: 's1',
                  order_index: 0,
                  reps: 6,
                  weight_kg: 50,
                  rpe: 9,
                  rest_seconds: 120,
                  duration_seconds: null,
                  distance_km: null,
                  incline_percent: null,
                  speed_kph: null,
                  bodyweight_kg: null,
                  percentile: null,
                  warmup: false,
                  set_type: 'normal',
                  failed: false,
                  target_reps: null,
                  notes: null,
                  completed: true,
                },
              ],
            },
          },
        ]
      : [],
  );
  await openLogger();
  await waitFor(() =>
    expect(apiGet).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/exercise-history-baselines\?before=\d{4}-\d{2}-01$/),
      expect.anything(),
    ),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Add exercise' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add 1' }));
  const sets = readActiveWorkoutDraft(deviceStorage)?.movements[1].sets;
  expect(sets?.map((item) => [item.weight_kg, item.reps, item.fromPrevious])).toEqual([
    [50, 6, true],
  ]);
  // Last time's RPE is offered as a guide.
  await fireEvent.press(screen.getAllByRole('button', { name: 'Set 1 type: Working set' })[1]);
  expect(option(menu(0), 'RPE').label).toBe('RPE · 9 last time');
  // Matching the older best is no record; beating it is, though the loaded workouts lack it.
  await fireEvent.press(screen.getAllByRole('button', { name: 'Complete set 1' })[1]);
  expect(screen.queryByLabelText('Set 1: Weight PR')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Mark set 1 incomplete' }));
  await fireEvent.changeText(screen.getAllByLabelText(/^Weight kilograms for set 1/)[1], '52.5');
  await fireEvent.press(screen.getAllByRole('button', { name: 'Complete set 1' })[1]);
  expect(screen.getByLabelText('Set 1: Weight PR')).toBeVisible();
});
