import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect, type ReactNode } from 'react';
import { Platform } from 'react-native';
import type { Exercise } from '../../../../frontend/src/types';
import { readActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import { apiSend, currentUser } from '../../data/api';
import { deviceStorage } from '../../data/deviceStorage';
import { queryKeys, useExercises, useUpNext } from '../../data/queries';
import { SessionProvider } from '../../session/SessionProvider';
import { memoryKv } from '../../testing/memoryKvStore';
import { showMenu, type MenuOption } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { extraRepsOption } from '../exercises/extraRepsSetting';
import { bench, exercises, press, pushDay, row, types } from './testFixtures';
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
    useExercises: jest.fn(),
    useTrainingPreferences: () => ({
      data: { preferred_weight_unit: 'kg', default_rest_seconds: 90 },
    }),
    useUpNext: jest.fn(),
    refreshTraining: jest.fn(async () => undefined),
  };
});

const user = { id: 'u1', username: 'preview' } as Awaited<ReturnType<typeof currentUser>>;
const tracked: Exercise = { ...bench, extra_reps_enabled: true };
let client: QueryClient;

/** The exercises the phone's catalogue holds, which the logger reads the setting from. */
function catalogue(list: Exercise[]) {
  jest.mocked(useExercises).mockReturnValue({ data: list } as ReturnType<typeof useExercises>);
}

beforeEach(() => {
  jest.clearAllMocks();
  memoryKv.clear();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.mocked(currentUser).mockResolvedValue(user);
  catalogue(exercises);
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

const draftSet = (index = 0) => readActiveWorkoutDraft(deviceStorage)!.movements[0].sets[index];
const actionLabels = () =>
  jest
    .mocked(showMenu)
    .mock.calls.at(-1)![1]
    .map((item: MenuOption) => item.label);
const action = (label: string) =>
  jest
    .mocked(showMenu)
    .mock.calls.at(-1)![1]
    .find((item: MenuOption) => item.label === label)!;

test('an exercise that tracks them offers partial and assisted reps under each set', async () => {
  catalogue([tracked, press, row]);
  await openLogger();
  await fireEvent.changeText(screen.getByLabelText('Partial reps for set 1'), '4');
  await fireEvent.changeText(screen.getByLabelText('Assisted reps for set 1'), '2');
  // Entering them makes last time's suggestion this workout's set, as typing its reps does.
  expect(draftSet()).toMatchObject({
    reps: 8,
    partial_reps: 4,
    assisted_reps: 2,
    fromPrevious: false,
    // Typing a count never ticks the set; only its tick does.
    completed: false,
  });
  expect(screen.getByLabelText('Partial reps for set 2')).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: 'Complete set 1' }));
  expect(draftSet()).toMatchObject({ completed: true, reps: 8, partial_reps: 4 });
  // Clearing a field removes the count rather than recording a zero.
  await fireEvent.changeText(screen.getByLabelText('Assisted reps for set 1'), '');
  expect(draftSet().assisted_reps).toBeNull();
});

test('a set of partial reps alone is logged as 0 full reps', async () => {
  catalogue([tracked, press, row]);
  await openLogger();
  await fireEvent.changeText(screen.getByLabelText(/^Repetitions for set 1/), '');
  await fireEvent.changeText(screen.getByLabelText('Partial reps for set 1'), '15');
  await fireEvent.press(screen.getByRole('button', { name: 'Complete set 1' }));
  expect(draftSet()).toMatchObject({ completed: true, reps: 0, partial_reps: 15 });
});

test('an exercise that does not track them shows the fields only on a set that has some', async () => {
  await openLogger();
  expect(screen.queryByLabelText('Partial reps for set 1')).toBeNull();
  expect(screen.queryByLabelText('Assisted reps for set 1')).toBeNull();
});

test('the exercise’s menu turns tracking on and says so', async () => {
  jest.mocked(apiSend).mockResolvedValue(tracked);
  await openLogger();
  await fireEvent.press(screen.getByRole('button', { name: 'Actions for Bench Press' }));
  expect(actionLabels()).toContain('Track partial & assisted reps');
  await act(async () => action('Track partial & assisted reps').onPress());
  expect(apiSend).toHaveBeenCalledWith('/api/exercises/bench', 'PATCH', {
    extra_reps_enabled: true,
  });
  await waitFor(() =>
    expect(showToast).toHaveBeenCalledWith('Partial and assisted reps on for Bench Press'),
  );

  // Once the catalogue has the change, the same option turns it off again.
  client.setQueryData(queryKeys.exercises, [tracked, press, row]);
  await fireEvent.press(screen.getByRole('button', { name: 'Actions for Bench Press' }));
  expect(actionLabels()).toContain('Stop tracking partial & assisted reps');
  jest.mocked(apiSend).mockResolvedValue(bench);
  await act(async () => action('Stop tracking partial & assisted reps').onPress());
  expect(apiSend).toHaveBeenLastCalledWith('/api/exercises/bench', 'PATCH', {
    extra_reps_enabled: false,
  });
  await waitFor(() =>
    expect(showToast).toHaveBeenCalledWith('Partial and assisted reps off for Bench Press'),
  );
});

test('a change that could not be saved is reported, and cardio has no such option', async () => {
  const queries = new QueryClient();
  jest.mocked(apiSend).mockRejectedValue(new Error('Could not reach Relay.'));
  const [option] = extraRepsOption(queries, bench);
  await act(async () => option.onPress());
  await waitFor(() =>
    expect(showToast).toHaveBeenCalledWith('Could not reach Relay.', undefined, {
      variant: 'error',
    }),
  );
  expect(extraRepsOption(queries, row)).toEqual([]);
  queries.clear();
});
