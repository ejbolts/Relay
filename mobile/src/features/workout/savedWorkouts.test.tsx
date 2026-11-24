import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect, type ReactNode } from 'react';
import { Alert, Platform, type AlertButton } from 'react-native';
import type { TrackedWorkout, WorkoutInput } from '../../../../frontend/src/types';
import { readActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import { ApiError, apiGet, apiSend, currentUser } from '../../data/api';
import { deviceStorage } from '../../data/deviceStorage';
import { useUpNext } from '../../data/queries';
import { SessionProvider } from '../../session/SessionProvider';
import { memoryKv } from '../../testing/memoryKvStore';
import { EditWorkoutScreen } from './EditWorkoutScreen';
import { loggerFromDraft, loggerToDraft, resumeLogger } from './loggerState';
import { SavedWorkoutActions } from './SavedWorkoutActions';
import { StartSheet } from './StartSheet';
import {
  exercises,
  keys,
  lastPush,
  pushDay,
  sessionId,
  startedAt,
  trackedSet,
  types,
} from './testFixtures';
import { useWorkout, WorkoutProvider } from './WorkoutProvider';
import { WorkoutSheet } from './WorkoutSheet';

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

const user = { id: 'u1', username: 'preview' } as Awaited<ReturnType<typeof currentUser>>;
let client: QueryClient;
let puts: { path: string; body: WorkoutInput }[];
let alerts: { title: string; message?: string | null; buttons: AlertButton[] }[];

/** Last week's push day, saved at revision 4 with a machine, an RPE and notes to keep. */
const saved: TrackedWorkout = {
  ...lastPush,
  id: 'w1',
  revision: 4,
  notes: 'Felt strong',
  start_time: null,
  end_time: null,
  movements: [
    {
      ...lastPush.movements[0],
      notes: 'Elbows tucked',
      machine_photos: [
        {
          id: 'cybex',
          exercise_id: 'bench',
          caption: 'Cybex',
          thumbnail_url: '',
          full_url: '',
          width: 1,
          height: 1,
          created_at: '',
        },
      ],
      machine_settings: [{ name: 'Seat', value: '4' }],
      sets: [
        trackedSet(0, {
          reps: 8,
          weight_kg: 80,
          rpe: 8,
          notes: 'Paused',
          machine_photo_id: 'cybex',
        }),
        trackedSet(1, { reps: 7, weight_kg: 80, completed: false }),
      ],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  memoryKv.clear();
  puts = [];
  alerts = [];
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
    // The shared copy accepts each change as it is.
    if (path === '/api/active-workout')
      return { revision: 1, draft: (body as { draft: unknown }).draft, conflict: false };
    if (method === 'PUT') puts.push({ path, body: body as WorkoutInput });
    return { ...saved, revision: 5 };
  });
  jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    alerts.push({ title: title ?? '', message, buttons: buttons ?? [] });
  });
});
afterEach(() => client?.clear());

const press = async (title: string, button: string) =>
  act(async () =>
    alerts
      .filter((alert) => alert.title === title)
      .at(-1)!
      .buttons.find((item) => item.text === button)!
      .onPress?.(),
  );

async function renderApp(children: ReactNode) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const captured: { workout?: ReturnType<typeof useWorkout> } = {};
  function Probe() {
    const workout = useWorkout();
    useEffect(() => {
      captured.workout = workout;
    });
    return null;
  }
  await render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <WorkoutProvider>
          {children}
          <Probe />
        </WorkoutProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(currentUser).toHaveBeenCalled());
  await waitFor(() => expect(captured.workout).toBeDefined());
  return captured;
}

test('a resumed workout keeps its sets, machine and revision, and survives being stored', () => {
  const state = resumeLogger(saved, { now: startedAt, clientSessionId: sessionId }, keys());
  expect(state).toMatchObject({
    resumingWorkoutId: 'w1',
    resumingWorkoutRevision: 4,
    previousDurationMinutes: 50,
    notes: 'Felt strong',
  });
  expect(state.movements[0]).toMatchObject({
    machinePhotoIds: ['cybex'],
    machineSettings: [{ name: 'Seat', value: '4' }],
    notes: 'Elbows tucked',
  });
  // Unticked saved sets stay planned; ticked ones keep everything they recorded.
  expect(state.movements[0].sets.map((item) => [item.completed, item.fromPrevious])).toEqual([
    [true, false],
    [false, true],
  ]);
  expect(state.movements[0].sets[0]).toMatchObject({
    rpe: 8,
    notes: 'Paused',
    machine_photo_id: 'cybex',
  });
  const restored = loggerFromDraft(loggerToDraft(state, startedAt), exercises);
  expect(restored).toMatchObject({
    resumingWorkoutId: 'w1',
    resumingWorkoutRevision: 4,
    previousDurationMinutes: 50,
  });
});

test('Resume reopens a saved workout, and Finish saves over it with its revision', async () => {
  await renderApp(
    <>
      <SavedWorkoutActions workout={saved} />
      <WorkoutSheet />
    </>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Resume Push workout' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/workout');
  expect(await screen.findByText('Bench Press')).toBeVisible();
  expect(readActiveWorkoutDraft(deviceStorage)?.resumingWorkoutId).toBe('w1');

  await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
  await press('Finish workout?', 'Finish workout');
  // Finishing syncs, queues and saves before the summary shows; under a full parallel run that
  // can take longer than findBy's default second.
  expect(await screen.findByText('Workout complete', {}, { timeout: 5000 })).toBeVisible();
  await waitFor(() => expect(puts).toHaveLength(1));
  expect(puts[0].path).toBe('/api/workouts/w1');
  expect(puts[0].body).toMatchObject({ base_revision: 4, notes: 'Felt strong' });
  expect(puts[0].body).not.toHaveProperty('client_session_id');
  // Its saved 50 minutes and the time logged now add up.
  expect(puts[0].body.duration_minutes).toBeGreaterThanOrEqual(50);
});

test('a resumed save refused because another device changed it can keep this version', async () => {
  // The first save over the workout is refused: another device saved it meanwhile.
  const send = jest.mocked(apiSend).getMockImplementation()!;
  let refusedOnce = false;
  jest.mocked(apiSend).mockImplementation(async (path, method, body) => {
    if (path === '/api/workouts/w1' && !refusedOnce) {
      refusedOnce = true;
      throw new ApiError(409, 'This workout changed on another device.', 'workout_conflict');
    }
    return send(path, method, body);
  });
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) =>
      path === '/api/workouts/w1'
        ? { ...saved, revision: 7 }
        : path === '/api/active-workout'
          ? { revision: 0, draft: null }
          : [],
    );
  const captured = await renderApp(
    <>
      <StartSheet />
      <WorkoutSheet />
    </>,
  );
  await act(async () => captured.workout!.resume(saved));
  await fireEvent.press(await screen.findByRole('button', { name: 'Finish workout' }));
  await press('Finish workout?', 'Finish workout');
  await waitFor(() =>
    expect(captured.workout!.refused).toEqual([expect.objectContaining({ conflict: true })]),
  );
  await fireEvent.press(
    screen.getAllByRole('button', { name: 'Keep my version of Push workout' })[0],
  );
  await waitFor(() => expect(puts.at(-1)?.body.base_revision).toBe(7));
  await waitFor(() => expect(captured.workout!.refused).toEqual([]));
});

test('an edit sends the whole workout with its revision, and asks on a conflict', async () => {
  jest.mocked(apiSend).mockImplementationOnce(async (path, method, body) => {
    puts.push({ path, body: body as WorkoutInput });
    throw new ApiError(409, 'Changed elsewhere.', 'workout_conflict');
  });
  jest
    .mocked(apiGet)
    .mockImplementation(async (path: string) =>
      path === '/api/workouts/w1'
        ? puts.length
          ? { ...saved, revision: 6 }
          : saved
        : path === '/api/active-workout'
          ? { revision: 0, draft: null }
          : [],
    );
  await renderApp(<EditWorkoutScreen workoutId="w1" />);
  expect(await screen.findByText('Bench Press')).toBeVisible();
  await fireEvent.changeText(screen.getByLabelText(/^Repetitions for set 1/), '9');
  await fireEvent.press(screen.getByRole('button', { name: 'Save workout' }));

  // The first save is refused: another device saved it meanwhile. Keep mine retries over it.
  await waitFor(() =>
    expect(alerts.map((alert) => alert.title)).toContain('Changed on another device'),
  );
  await press('Changed on another device', 'Keep my version');
  await waitFor(() => expect(puts).toHaveLength(2));
  expect(puts.map((item) => item.body.base_revision)).toEqual([4, 6]);
  const sent = puts[1].body;
  expect(sent).toMatchObject({ name: 'Push workout', notes: 'Felt strong', duration_minutes: 50 });
  expect(sent.movements[0]).toMatchObject({
    notes: 'Elbows tucked',
    machine_photo_ids: ['cybex'],
    machine_settings: [{ name: 'Seat', value: '4' }],
  });
  expect(sent.movements[0].sets[0]).toMatchObject({
    reps: 9,
    weight_kg: 80,
    rpe: 8,
    notes: 'Paused',
    machine_photo_id: 'cybex',
    completed: true,
  });
  expect(sent.movements[0].sets[1]).toMatchObject({ reps: 7, completed: false });
  await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
});

test('a saved workout is deleted after asking', async () => {
  jest.mocked(apiSend).mockResolvedValue(undefined);
  await renderApp(<SavedWorkoutActions workout={saved} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Delete workout' }));
  expect(apiSend).not.toHaveBeenCalledWith('/api/workouts/w1', 'DELETE');
  await press('Delete this workout?', 'Delete workout');
  await waitFor(() => expect(apiSend).toHaveBeenCalledWith('/api/workouts/w1', 'DELETE'));
  await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
});
