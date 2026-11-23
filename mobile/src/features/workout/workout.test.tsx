import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect, type ReactNode } from 'react';
import { Alert, Text } from 'react-native';
import { readFinishedWorkouts } from '../../../../frontend/src/finishedWorkoutQueue';
import type { TrackedWorkout, WorkoutInput } from '../../../../frontend/src/types';
import { readActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import { apiSend, currentUser } from '../../data/api';
import { deviceStorage } from '../../data/deviceStorage';
import { useUpNext } from '../../data/queries';
import { SessionProvider } from '../../session/SessionProvider';
import { memoryKv } from '../../testing/memoryKvStore';
import { restTimerPreference } from '../settings/devicePreferences';
import { StartSheet } from './StartSheet';
import { exercises, lastPush, pushDay, types } from './testFixtures';
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
let client: QueryClient;
let saved: WorkoutInput[];

beforeEach(() => {
  jest.clearAllMocks();
  memoryKv.clear();
  saved = [];
  jest.mocked(currentUser).mockResolvedValue(user);
  jest.mocked(useUpNext).mockReturnValue({
    template: pushDay,
    label: 'Push',
    recommendation: { category: 'push' },
    type: types.find((type) => type.id === 'push'),
  } as unknown as ReturnType<typeof useUpNext>);
  jest.mocked(apiSend).mockImplementation(async (_path, _method, body) => {
    saved.push(body as WorkoutInput);
    return { id: 'saved-1' } as TrackedWorkout;
  });
  // Pick the last button of any alert (Finish workout, Discard workout, Log set).
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.at(-1)?.onPress?.();
  });
});
afterEach(() => client.clear());

function Controls() {
  const workout = useWorkout();
  return (
    <>
      <Text>{workout.live ? `Live: ${workout.live.name}` : 'No workout'}</Text>
      <Text onPress={workout.openStartMenu}>Start tab</Text>
      <Text onPress={() => workout.start({ kind: 'empty' })}>Start empty</Text>
      <Text onPress={workout.discard}>Discard</Text>
      <Text>{`Waiting: ${workout.queue.waiting}`}</Text>
    </>
  );
}

async function open(children: ReactNode) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = await render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <WorkoutProvider>{children}</WorkoutProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  // Signed in: the engine has mounted, with or without a restored workout.
  await waitFor(() => expect(currentUser).toHaveBeenCalled());
  await act(async () => undefined);
  return view;
}

test('the Start tab opens the Start menu, then the live workout once one is running', async () => {
  await open(<Controls />);
  await fireEvent.press(screen.getByText('Start tab'));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/start-workout');

  await fireEvent.press(screen.getByText('Start empty'));
  expect(screen.getByText('Live: Push workout')).toBeVisible();
  expect(mockRouter.push).toHaveBeenLastCalledWith('/workout');

  await fireEvent.press(screen.getByText('Start tab'));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/workout');

  await fireEvent.press(screen.getByText('Discard'));
  expect(screen.getByText('No workout')).toBeVisible();
  expect(readActiveWorkoutDraft(deviceStorage)).toBeNull();
});

test('starting again while a workout is live reopens it instead of replacing it', async () => {
  await open(<Controls />);
  await fireEvent.press(screen.getByText('Start empty'));
  const session = readActiveWorkoutDraft(deviceStorage)?.clientSessionId;
  await fireEvent.press(screen.getByText('Start empty'));
  expect(readActiveWorkoutDraft(deviceStorage)?.clientSessionId).toBe(session);
  expect(mockRouter.push).toHaveBeenCalledTimes(2);
});

test('the Start menu offers Cardio, Up next and Empty, and the logger replaces it', async () => {
  await open(
    <>
      <StartSheet />
      <Controls />
    </>,
  );
  expect(screen.getByRole('button', { name: 'Cardio' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Empty' })).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Up next: Push day' }));
  expect(screen.getByText('Live: Push workout')).toBeVisible();
  expect(mockRouter.replace).toHaveBeenCalledWith('/workout');
  expect(mockRouter.push).not.toHaveBeenCalled();
});

test('with the rest timer off, a logged set starts no rest, and turning it off ends one', async () => {
  await open(
    <>
      <StartSheet />
      <WorkoutSheet />
    </>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Up next: Push day' }));
  expect(await screen.findByText('Bench Press')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Complete set 1' }));
  expect(screen.getByRole('button', { name: 'Skip rest' })).toBeVisible();
  try {
    await act(async () => restTimerPreference.set(false));
    expect(screen.queryByRole('button', { name: 'Skip rest' })).toBeNull();
    expect(screen.queryByLabelText('Rest timer')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Complete set 2' }));
    expect(screen.queryByRole('button', { name: 'Skip rest' })).toBeNull();
  } finally {
    restTimerPreference.set(true);
  }
});

test('logs Up next, starts the rest, and finishes into a saved summary', async () => {
  await open(
    <>
      <StartSheet />
      <WorkoutSheet />
    </>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Up next: Push day' }));
  expect(await screen.findByText('Bench Press')).toBeVisible();
  // Planned sets show last time's values as suggestions.
  const weight = screen.getByLabelText('Weight kilograms for set 1, suggested value');
  expect(weight.props.value).toBe('80');
  await fireEvent.changeText(weight, '85');
  await fireEvent.press(screen.getByRole('button', { name: 'Complete set 1' }));
  expect(screen.getByRole('button', { name: 'Mark set 1 incomplete' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Skip rest' })).toBeVisible();
  // The untouched next set now suggests what was just lifted.
  expect(screen.getByLabelText('Weight kilograms for set 2, suggested value').props.value).toBe(
    '85',
  );
  expect(readActiveWorkoutDraft(deviceStorage)?.movements[0].sets[0]).toMatchObject({
    weight_kg: 85,
    completed: true,
  });

  await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
  expect(Alert.alert).toHaveBeenCalledWith(
    'Finish workout?',
    '1 of 2 sets ticked',
    expect.anything(),
  );
  expect(await screen.findByText('Workout complete')).toBeVisible();
  await waitFor(() => expect(screen.getByText('Saved')).toBeVisible());
  expect(apiSend).toHaveBeenCalledTimes(1);
  expect(apiSend).toHaveBeenCalledWith('/api/workouts', 'POST', expect.anything());
  expect(saved[0]).toMatchObject({
    client_session_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    name: 'Push workout',
    category: 'push',
  });
  expect(saved[0].movements[0].sets.map((set) => [set.weight_kg, set.reps, set.completed])).toEqual(
    [
      [85, 8, true],
      [85, 8, false],
    ],
  );
  expect(readActiveWorkoutDraft(deviceStorage)).toBeNull();
  expect(readFinishedWorkouts(deviceStorage)).toEqual([]);
});

test('a workout survives the app closing, finishes offline and saves once back online', async () => {
  jest.mocked(apiSend).mockRejectedValue(new Error('Could not reach Relay.'));
  const first = await open(<WorkoutSheet />);
  const { start } = await captureWorkout();
  await act(async () => start({ kind: 'up-next' }));
  await fireEvent.changeText(screen.getByLabelText(/Repetitions for set 1/), '9');
  await first.unmount();
  client.clear();

  // Reopened: the same workout and its entries are back.
  await open(<WorkoutSheet />);
  expect(await screen.findByText('Bench Press')).toBeVisible();
  expect(screen.getByLabelText(/Repetitions for set 1/).props.value).toBe('9');
  await fireEvent.press(screen.getByRole('button', { name: 'Complete set 1' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
  expect(await screen.findByText('Workout complete')).toBeVisible();
  await waitFor(() => expect(screen.getByText('Waiting to sync')).toBeVisible());
  expect(readFinishedWorkouts(deviceStorage)).toHaveLength(1);

  // Back online twice: one save.
  jest.mocked(apiSend).mockImplementation(async (_path, _method, body) => {
    saved.push(body as WorkoutInput);
    return { id: 'saved-1' } as TrackedWorkout;
  });
  await act(async () => {
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
  });
  await waitFor(() => expect(screen.getByText('Saved')).toBeVisible());
  await act(async () => {
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
  });
  expect(saved).toHaveLength(1);
  expect(readFinishedWorkouts(deviceStorage)).toEqual([]);
});

/** Renders a probe next to the screen to reach the workout API. */
async function captureWorkout() {
  const captured: { api: ReturnType<typeof useWorkout> | null } = { api: null };
  function Probe() {
    const workout = useWorkout();
    useEffect(() => {
      captured.api = workout;
    });
    return null;
  }
  await screen.rerender(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <WorkoutProvider>
          <WorkoutSheet />
          <Probe />
        </WorkoutProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(captured.api?.queue).toBeDefined());
  return captured.api!;
}

test('the logger adds exercises from the search, in the order picked', async () => {
  await open(<WorkoutSheet />);
  const { start } = await captureWorkout();
  await act(async () => start({ kind: 'empty' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Add exercise' }));
  await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'ohp');
  expect(screen.queryByRole('checkbox', { name: 'Rowing Machine' })).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'press');
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Bench Press' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add 2' }));
  expect(readActiveWorkoutDraft(deviceStorage)?.movements.map((item) => item.exerciseId)).toEqual([
    'press',
    'bench',
  ]);
  // Bench comes with last time's sets; Overhead Press, never done, with one blank warm-up.
  expect(screen.getByLabelText('Weight kilograms for set 2, suggested value')).toBeVisible();
  expect(exercises).toContain(lastPush.movements[0].exercise);
});
