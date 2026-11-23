import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect, type ReactNode } from 'react';
import { Alert, Platform } from 'react-native';
import { readFinishedWorkouts } from '../../../../frontend/src/finishedWorkoutQueue';
import type { TrackedWorkout, WorkoutInput } from '../../../../frontend/src/types';
import {
  readActiveWorkoutDraft,
  type ActiveWorkoutDraft,
} from '../../../../frontend/src/workoutDraft';
import { apiGet, apiSend, currentUser } from '../../data/api';
import { deviceStorage } from '../../data/deviceStorage';
import { connectLivePresence } from '../../data/livePresence';
import { useUpNext } from '../../data/queries';
import { SessionProvider } from '../../session/SessionProvider';
import { memoryKv } from '../../testing/memoryKvStore';
import { showToast } from '../../ui/Toast';
import { pushDay, sessionId, types } from './testFixtures';
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
jest.mock('../../data/livePresence', () => ({
  connectLivePresence: jest.fn(() => ({ report: jest.fn(), stop: jest.fn() })),
}));
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

/**
 * The server's shared copy, as backend/app/active_workouts.py keeps it: a revision that moves
 * with every change, edits accepted against the copy they were based on, a conflict otherwise,
 * and the copy consumed by the save that names its revision.
 */
let server: { revision: number; draft: ActiveWorkoutDraft | null; refuseNextEdit: boolean };
let puts: {
  revision: number;
  base: ActiveWorkoutDraft | null;
  draft: ActiveWorkoutDraft | null;
  replace?: boolean;
}[];
let saved: WorkoutInput[];

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function remoteDraft(values: Partial<ActiveWorkoutDraft> = {}): ActiveWorkoutDraft {
  return {
    version: 1,
    clientSessionId: sessionId,
    startedAt: Date.now() - 10 * 60_000,
    updatedAt: Date.now(),
    lastActiveAt: Date.now() - 60_000,
    name: '',
    workoutDate: '2026-11-23',
    category: 'push',
    workoutTypeExplicit: true,
    notes: 'Started on the web',
    movements: [
      {
        key: 'web-bench',
        exerciseId: 'bench',
        notes: '',
        machinePhotoIds: [],
        supersetKey: null,
        sets: [
          {
            key: 'web-set-1',
            reps: 8,
            weight_kg: 80,
            rpe: null,
            rest_seconds: 120,
            duration_seconds: null,
            distance_km: null,
            notes: null,
            completed: true,
          },
        ],
      },
    ],
    ...values,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  memoryKv.clear();
  server = { revision: 0, draft: null, refuseNextEdit: false };
  puts = [];
  saved = [];
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
      path === '/api/active-workout' ? structuredClone(server) : [],
    );
  jest.mocked(apiSend).mockImplementation(async (path, method, body) => {
    if (path === '/api/active-workout') {
      const change = body as (typeof puts)[number];
      puts.push(change);
      const answer = (conflict: boolean) => ({
        revision: server.revision,
        draft: server.draft,
        conflict,
      });
      if (same(change.draft, server.draft)) return answer(false);
      const accepts =
        (change.replace && change.revision === server.revision) ||
        (change.base === null
          ? server.draft === null && change.revision === server.revision
          : server.draft?.clientSessionId === change.base.clientSessionId &&
            (same(change.base, server.draft) || !server.refuseNextEdit));
      if (!accepts) return answer(true);
      server = { ...server, revision: server.revision + 1, draft: change.draft };
      return answer(false);
    }
    const workout = body as WorkoutInput;
    if (method === 'POST' && workout.active_workout_revision !== undefined) {
      if (workout.active_workout_revision !== server.revision) throw new Error('Changed elsewhere');
      server = { ...server, revision: server.revision + 1, draft: null };
    }
    saved.push(workout);
    return { id: 'saved-1' } as TrackedWorkout;
  });
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.at(-1)?.onPress?.();
  });
});
afterEach(() => client.clear());

async function openApp() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const captured: { workout?: ReturnType<typeof useWorkout> } = {};
  function Probe() {
    const workout = useWorkout();
    useEffect(() => {
      captured.workout = workout;
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
  await waitFor(() => expect(captured.workout).toBeDefined());
  return { captured, view };
}

/** Reconnecting is one of the moments the phone checks the shared copy. */
async function reconnect() {
  await act(async () => {
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
  });
}

test('a workout started on another device opens in the app, and edits here reach it', async () => {
  server = { revision: 3, draft: remoteDraft(), refuseNextEdit: false };
  const { captured } = await openApp();
  expect(await screen.findByText('Bench Press')).toBeVisible();
  expect(captured.workout!.live?.loggedSets).toBe(1);
  expect(readActiveWorkoutDraft(deviceStorage)?.clientSessionId).toBe(sessionId);

  await fireEvent.press(screen.getByRole('button', { name: 'Add set to Bench Press' }));
  await waitFor(() => expect(server.draft?.movements[0].sets).toHaveLength(2), { timeout: 2000 });
  expect(puts.at(-1)).toMatchObject({
    revision: 3,
    base: expect.objectContaining({ notes: 'Started on the web' }),
  });
  expect(server.revision).toBe(4);
});

test('a live invalidation fetches a remote workout without polling or reconnecting', async () => {
  await openApp();
  await waitFor(() => expect(connectLivePresence).toHaveBeenCalledTimes(1));
  const live = jest.mocked(connectLivePresence).mock.calls[0][0];
  server = { revision: 1, draft: remoteDraft(), refuseNextEdit: false };
  await act(async () => live.onActiveWorkout());
  expect(await screen.findByText('Bench Press')).toBeVisible();
  expect(readActiveWorkoutDraft(deviceStorage)?.clientSessionId).toBe(sessionId);
});

test("another device's change shows up here, and its finish closes the workout", async () => {
  server = { revision: 3, draft: remoteDraft(), refuseNextEdit: false };
  await openApp();
  expect(await screen.findByText('Bench Press')).toBeVisible();

  const changed = remoteDraft({ notes: 'Changed on the web' });
  changed.movements[0].sets[0] = { ...changed.movements[0].sets[0], reps: 10 };
  server = { revision: 4, draft: changed, refuseNextEdit: false };
  await reconnect();
  await waitFor(() =>
    expect(screen.getByLabelText('Repetitions for set 1').props.value).toBe('10'),
  );

  server = { revision: 5, draft: null, refuseNextEdit: false };
  await reconnect();
  expect(await screen.findByText('No workout in progress')).toBeVisible();
  expect(readActiveWorkoutDraft(deviceStorage)).toBeNull();
  expect(showToast).toHaveBeenCalledWith('Workout ended on another device');
});

test('finishing consumes the shared copy it agreed with, exactly once', async () => {
  server = { revision: 3, draft: remoteDraft(), refuseNextEdit: false };
  await openApp();
  expect(await screen.findByText('Bench Press')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
  expect(await screen.findByText('Workout complete')).toBeVisible();
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]).toMatchObject({
    client_session_id: sessionId,
    active_workout_revision: 3,
    active_workout_session_id: sessionId,
  });
  expect(server.draft).toBeNull();
  await reconnect();
  await reconnect();
  expect(saved).toHaveLength(1);
  expect(readFinishedWorkouts(deviceStorage)).toEqual([]);
});

test('edits on both devices that cannot combine ask which to keep', async () => {
  server = { revision: 3, draft: remoteDraft(), refuseNextEdit: false };
  const { captured } = await openApp();
  expect(await screen.findByText('Bench Press')).toBeVisible();
  // Meanwhile the web changes the same set.
  const theirs = remoteDraft();
  theirs.movements[0].sets[0] = { ...theirs.movements[0].sets[0], weight_kg: 95 };
  server = { revision: 4, draft: theirs, refuseNextEdit: true };
  await fireEvent.changeText(screen.getByLabelText(/^Weight kilograms for set 1/), '85');
  await waitFor(() => expect(captured.workout!.syncConflict).not.toBeNull(), { timeout: 2000 });
  expect(screen.getByText('Workout sync conflict')).toBeVisible();
  expect(screen.getByText('This device: 85 kg × 8 reps ✓')).toBeVisible();
  expect(screen.getByText('Other device: 95 kg × 8 reps ✓')).toBeVisible();

  // Closing it leaves a way back; keeping this device replaces the other version.
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Resolve workout sync' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Keep this device' }));
  await waitFor(() => expect(server.draft?.movements[0].sets[0].weight_kg).toBe(85));
  expect(puts.at(-1)).toMatchObject({ replace: true, revision: 4 });
  expect(captured.workout!.syncConflict).toBeNull();
});
