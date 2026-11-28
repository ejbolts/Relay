import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect, type ReactNode } from 'react';
import { Alert, Platform, type AlertButton } from 'react-native';
import { readFinishedWorkouts } from '../../../../frontend/src/finishedWorkoutQueue';
import type { TrackedWorkout, WorkoutInput } from '../../../../frontend/src/types';
import { readActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import { ApiError, apiSend, currentUser } from '../../data/api';
import { deviceStorage } from '../../data/deviceStorage';
import { useUpNext } from '../../data/queries';
import { SessionProvider } from '../../session/SessionProvider';
import { memoryKv } from '../../testing/memoryKvStore';
import { showMenu } from '../../ui/prompts';
import { StartSheet } from './StartSheet';
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
jest.mock('../../data/session', () => ({ sessionToken: jest.fn(async () => 'token') }));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  serverOrigin: () => 'https://relay.test',
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
let alerts: { title: string; message?: string | null; buttons: AlertButton[] }[];

/** 9:00 local time on 23 November 2026. */
const nine = new Date(2026, 10, 23, 9, 0).getTime();
let now = nine;

beforeEach(() => {
  jest.clearAllMocks();
  memoryKv.clear();
  saved = [];
  alerts = [];
  now = nine;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  jest.replaceProperty(Platform, 'OS', 'android');
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
  jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    alerts.push({ title: title ?? '', message, buttons: buttons ?? [] });
  });
});
afterEach(() => client.clear());

const lastAlert = (title: string) => {
  const found = alerts.filter((alert) => alert.title === title).at(-1);
  if (!found) throw new Error(`No "${title}" alert in ${alerts.map((a) => a.title).join(', ')}`);
  return found;
};
const press = async (title: string, button: string) =>
  act(async () =>
    lastAlert(title)
      .buttons.find((item) => item.text === button)!
      .onPress?.(),
  );

async function openLogger(extra?: ReactNode) {
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
          <WorkoutSheet />
          {extra}
          <Probe />
        </WorkoutProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(currentUser).toHaveBeenCalled());
  await waitFor(() => expect(captured.workout).toBeDefined());
  await act(async () => captured.workout!.start({ kind: 'up-next' }));
  expect(await screen.findByText('Bench Press')).toBeVisible();
  return captured;
}

test('a workout with only warm-ups logged names them before it finishes', async () => {
  await openLogger();
  await fireEvent.press(screen.getByRole('button', { name: 'Set 1 type: Working set' }));
  const options = jest.mocked(showMenu).mock.calls[0][1];
  await act(async () => options.find((item) => item.label === 'Warm-up')!.onPress());
  await fireEvent.press(screen.getByRole('button', { name: 'Complete set 1' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));

  // It doubles as the confirmation: no separate "1 of 2 sets ticked" question.
  expect(lastAlert('No working sets').message).toBe('Bench Press: W 80 kg × 8');
  expect(alerts.map((alert) => alert.title)).toEqual(['No working sets']);
  await press('No working sets', 'Keep working out');
  expect(screen.queryByText('Workout complete')).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
  await press('No working sets', 'Finish anyway');
  expect(await screen.findByText('Workout complete')).toBeVisible();
});

test('a workout left running asks to be saved at its last activity, resumed or discarded', async () => {
  await openLogger();
  now = nine + 20 * 60_000;
  await fireEvent.press(screen.getByRole('button', { name: 'Complete set 1' }));
  expect(alerts).toEqual([]);

  // Three hours later nothing is saved unasked. Entering reps counts as logging that set.
  now = nine + 4 * 60 * 60_000;
  await fireEvent.changeText(screen.getByLabelText(/^Repetitions for set 2/), '7');
  const prompt = lastAlert('Unfinished workout');
  expect(prompt.message).toMatch(/^Push workout\nStarted .+ · ended .+ · 2 sets logged$/);
  expect(prompt.buttons.map((button) => button.text)).toEqual([
    'Discard',
    'Resume',
    'Save workout',
  ]);
  expect(saved).toEqual([]);

  // Resume carries on from now, so the prompt doesn't return straight away.
  await press('Unfinished workout', 'Resume');
  expect(mockRouter.push).toHaveBeenLastCalledWith('/workout');
  const resumed = readActiveWorkoutDraft(deviceStorage)!;
  expect(resumed.lastActiveAt).toBe(now);
  expect(resumed.inactiveFinishAt).toBeGreaterThan(now);
  await fireEvent.changeText(screen.getByLabelText(/^Repetitions for set 2/), '6');
  expect(alerts.filter((alert) => alert.title === 'Unfinished workout')).toHaveLength(1);

  // Left again: Save workout ends it at its last activity, not when it was noticed.
  const lastActivity = now;
  now += 5 * 60 * 60_000;
  await fireEvent.changeText(screen.getByLabelText(/^Repetitions for set 2/), '5');
  await press('Unfinished workout', 'Save workout');
  expect(await screen.findByText('Workout complete')).toBeVisible();
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0].duration_minutes).toBe(Math.round((lastActivity - nine) / 60_000));
});

test('discarding from the prompt asks first; keeping the workout asks again', async () => {
  const captured = await openLogger();
  await fireEvent.press(screen.getByRole('button', { name: 'Complete set 1' }));
  now = nine + 4 * 60 * 60_000;
  await fireEvent.changeText(screen.getByLabelText(/^Repetitions for set 2/), '7');
  await press('Unfinished workout', 'Discard');
  await press('Discard this workout?', 'Keep workout');
  expect(alerts.filter((alert) => alert.title === 'Unfinished workout')).toHaveLength(2);
  await press('Unfinished workout', 'Discard');
  await press('Discard this workout?', 'Discard workout');
  expect(captured.workout!.live).toBeNull();
  expect(readActiveWorkoutDraft(deviceStorage)).toBeNull();
});

test('a save the server refuses can be reviewed, changed and sent again, once', async () => {
  jest
    .mocked(apiSend)
    .mockRejectedValueOnce(new ApiError(422, 'Choose a machine for every set of Bench Press.'));
  const captured = await openLogger(<StartSheet />);
  await fireEvent.press(screen.getByRole('button', { name: 'Complete set 1' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
  await press('Finish workout?', 'Finish workout');
  expect(await screen.findByText('Workout complete')).toBeVisible();

  // The summary and the Start menu both say why, and offer Review and Discard.
  await waitFor(() =>
    expect(screen.getAllByText('Choose a machine for every set of Bench Press.')).toHaveLength(2),
  );
  expect(captured.workout!.refused).toEqual([
    expect.objectContaining({ name: 'Push workout', resumed: false }),
  ]);
  const session = readFinishedWorkouts(deviceStorage)[0].clientSessionId;

  await fireEvent.press(screen.getAllByRole('button', { name: 'Review Push workout' })[0]);
  expect(await screen.findByText('Bench Press')).toBeVisible();
  expect(readFinishedWorkouts(deviceStorage)).toEqual([]);
  expect(captured.workout!.refused).toEqual([]);
  const reopened = readActiveWorkoutDraft(deviceStorage)!;
  expect(reopened.clientSessionId).toBe(session);
  expect(reopened.movements[0].sets[0]).toMatchObject({ weight_kg: 80, completed: true });

  await fireEvent.press(screen.getByRole('button', { name: 'Complete set 2' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
  expect(await screen.findByText('Workout complete')).toBeVisible();
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(apiSend).toHaveBeenCalledTimes(2);
  expect(saved[0].client_session_id).toBe(session);
  expect(saved[0].movements[0].sets.map((item) => item.completed)).toEqual([true, true]);
  expect(readFinishedWorkouts(deviceStorage)).toEqual([]);
});

test('a refused save can be discarded after asking', async () => {
  jest.mocked(apiSend).mockRejectedValueOnce(new ApiError(422, 'Not valid.'));
  const captured = await openLogger();
  await fireEvent.press(screen.getByRole('button', { name: 'Complete set 1' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
  await press('Finish workout?', 'Finish workout');
  await waitFor(() => expect(captured.workout!.refused).toHaveLength(1));
  await fireEvent.press(screen.getByRole('button', { name: 'Discard Push workout' }));
  expect(lastAlert('Discard this workout?').message).toBe(
    'This workout has not synced and will be lost.',
  );
  await press('Discard this workout?', 'Discard workout');
  expect(readFinishedWorkouts(deviceStorage)).toEqual([]);
  expect(captured.workout!.refused).toEqual([]);
  expect(saved).toEqual([]);
});
