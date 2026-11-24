import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { useLayoutEffect, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  addFinishedWorkout,
  type FinishedWorkout,
} from '../../../../frontend/src/finishedWorkoutQueue';
import { addDays, weekStartFor } from '../../../../frontend/src/trainingSummary';
import type { DashboardData, Exercise, TrackedWorkout, User } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import type { ActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import { createWorkoutSet } from '../../../../frontend/src/workoutSets';
import { DEFAULT_WORKOUT_TYPES } from '../../../../frontend/src/workoutTypes';
import {
  reviewCardioWeek,
  reviewSet,
  reviewWorkout,
} from '../../../../frontend/src/weeklyReviewFixtures';
import { ApiError, apiGet, apiSend } from '../../data/api';
import { deviceStorage } from '../../data/deviceStorage';
import { memoryKv } from '../../testing/memoryKvStore';
import { useLogger, useWorkout, WorkoutProvider } from '../workout/WorkoutProvider';
import { forgetJustSavedWorkouts } from './justSavedWorkouts';
import { resetNoticeMemory } from './noticeMemory';
import { WeeklyReviewScreen } from './WeeklyReviewScreen';
import { MuscleSetsCard } from '../home/MuscleSetsCard';

const mockRouter = {
  push: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: () => true,
  setParams: jest.fn(),
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useIsFocused: () => true,
  Stack: { Screen: () => null },
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiOrigin: 'https://relay.test',
  apiGet: jest.fn(),
  apiSend: jest.fn(),
  request: jest.fn(),
  currentUser: jest.fn(),
  serverOrigin: () => 'https://relay.test',
}));
jest.mock('../../data/livePresence', () => ({
  connectLivePresence: () => ({ report: jest.fn(), stop: jest.fn() }),
}));
jest.mock('../workout/restAlerts', () => ({
  askForRestAlerts: jest.fn(async () => undefined),
  syncRestAlert: jest.fn(async () => undefined),
}));
jest.mock('../workout/workoutReminders', () => ({
  onWorkoutReminderOpened: () => () => undefined,
  remindAboutRestAlerts: jest.fn(async () => undefined),
  syncInactiveReminder: jest.fn(async () => undefined),
  takeLaunchReminder: jest.fn(async () => undefined),
}));
jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));

let mockUser: User;
jest.mock('../../session/SessionProvider', () => ({
  useUser: () => mockUser,
  useOptionalSession: () => ({ status: { kind: 'signed-in', user: mockUser } }),
}));

const today = localDate();
const thisWeek = weekStartFor(today, 1);
const lastWeek = addDays(thisWeek, -7);
const weekBefore = addDays(thisWeek, -14);

const bench: Exercise = {
  id: 'bench',
  name: 'Bench Press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
  default_muscle_set_credits: [
    { muscle_name: 'Chest', sets: 1 },
    { muscle_name: 'Triceps', sets: 0.5 },
  ],
};

const muscleWeek = (
  start: string,
  groups: {
    muscle_group: string;
    raw_sets: number;
    contributions?: {
      workout_id: string;
      workout_name: string;
      workout_date: string;
      movement_id: string;
      exercise_id: string;
      exercise_name: string;
      working_sets: number;
      credit_per_set: number;
      set_credits: number;
    }[];
  }[],
) => ({
  week_start: start,
  week_end: addDays(start, 6),
  muscle_groups: groups.map((group) => ({ contributions: [], ...group })),
});

const completedSet = (key: string) => ({
  ...createWorkoutSet('strength', undefined, false),
  key,
  weight_kg: 100,
  reps: 5,
  completed: true,
});

const LIVE_SESSION_ID = '11111111-1111-4111-8111-111111111111';
const FINISHED_SESSION_ID = '22222222-2222-4222-8222-222222222222';

const makeDraft = (overrides: Partial<ActiveWorkoutDraft> = {}): ActiveWorkoutDraft => ({
  version: 1,
  startedAt: 1000,
  updatedAt: 2000,
  clientSessionId: LIVE_SESSION_ID,
  name: 'Push Day',
  workoutDate: today,
  category: 'push',
  notes: '',
  movements: [
    {
      key: 'm-bench',
      exerciseId: 'bench',
      notes: '',
      machinePhotoIds: [],
      supersetKey: null,
      sets: [completedSet('s1'), completedSet('s2'), completedSet('s3')],
    },
  ],
  ...overrides,
});

const makeFinished = (
  userId: string,
  overrides: Partial<ActiveWorkoutDraft> = {},
  workoutId: string | null = null,
): FinishedWorkout => {
  const base = makeDraft(overrides);
  return {
    ...base,
    pendingSave: {
      userId,
      workoutId,
      finishedAt: 3000,
      payload: {
        client_session_id: base.clientSessionId,
        name: base.name,
        workout_date: base.workoutDate,
        category: base.category,
        notes: null,
        duration_minutes: 45,
        start_time: null,
        end_time: null,
        movements: [
          {
            exercise_id: 'bench',
            notes: null,
            machine_photo_ids: [],
            sets: [
              { reps: 5, weight_kg: 100, completed: true, warmup: false, set_type: 'normal' },
              { reps: 5, weight_kg: 100, completed: true, warmup: false, set_type: 'normal' },
              { reps: 5, weight_kg: 100, completed: true, warmup: false, set_type: 'normal' },
            ],
          },
        ],
      } as unknown as FinishedWorkout['pendingSave']['payload'],
    },
  };
};

let serverDashboard: DashboardData;
let serverWorkouts: TrackedWorkout[];
let client: QueryClient;

function renderWithClient(ui: ReactNode) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  memoryKv.clear();
  resetNoticeMemory();
  forgetJustSavedWorkouts();
  onlineManager.setOnline(true);
  mockUser = {
    id: 'me',
    username: 'preview',
    display_name: 'Preview',
    profile_photo_url: null,
    is_admin: false,
    created_at: '2025-01-01T00:00:00Z',
  } as User;
  serverDashboard = {
    weekly_sets: muscleWeek(thisWeek, [{ muscle_group: 'Chest', raw_sets: 2 }]),
    weekly_sets_history: [
      muscleWeek(lastWeek, [{ muscle_group: 'Chest', raw_sets: 6 }]),
      muscleWeek(weekBefore, [{ muscle_group: 'Chest', raw_sets: 4 }]),
    ],
    cardio_weeks: [
      reviewCardioWeek(thisWeek, 0, {}),
      reviewCardioWeek(lastWeek, 30, { 2: [30, 150] }),
    ],
  } as unknown as DashboardData;
  serverWorkouts = [
    reviewWorkout('last', addDays(lastWeek, 2), [reviewSet(100, 5)]),
    reviewWorkout('before', addDays(weekBefore, 2), [reviewSet(90, 5)]),
  ];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path.startsWith('/api/dashboard')) return serverDashboard;
    if (path.startsWith('/api/workouts/snapshot'))
      return { revision: '1', workouts: serverWorkouts };
    if (path.startsWith('/api/personal-records')) return [];
    if (path === '/api/training-preferences') return { weekly_muscle_set_goal: 10 };
    if (path === '/api/exercises') return [bench];
    if (path === '/api/workout-types') return DEFAULT_WORKOUT_TYPES;
    if (path === '/api/workout-type-exercises') return [];
    if (path === '/api/body-measurements') return [];
    if (path === '/api/body-weight-goals') return [];
    if (path === '/api/training-blocks') return { blocks: [] };
    if (path === '/api/app-notices') return { release_seen: null, weekly_review_seen: null };
    if (path === '/api/active-workout') return { revision: 0, draft: null };
    if (path === '/api/workout-auto-save') return { after_minutes: null };
    if (path.startsWith('/api/workouts/history-baselines')) return {};
    return [];
  });
});

afterEach(() => {
  client.clear();
  forgetJustSavedWorkouts();
  onlineManager.setOnline(true);
  memoryKv.clear();
});

/** The server's week once it counts `sets` working sets of Bench Press from `workoutId`. */
const savedWeek = (start: string, baseChest: number, sets: number, workoutId: string) => {
  const contribution = (credit: number) => ({
    workout_id: workoutId,
    workout_name: 'Push Day',
    workout_date: today,
    movement_id: 'm1',
    exercise_id: 'bench',
    exercise_name: 'Bench Press',
    working_sets: sets,
    credit_per_set: credit,
    set_credits: sets * credit,
  });
  return muscleWeek(start, [
    { muscle_group: 'Chest', raw_sets: baseChest + sets, contributions: [contribution(1)] },
    { muscle_group: 'Triceps', raw_sets: sets / 2, contributions: [contribution(0.5)] },
  ]);
};

const benchMovement = (sets: number) => ({
  key: 'm-bench',
  exercise: bench,
  notes: '',
  machinePhotosInitialized: true,
  machinePhotoIds: [],
  supersetKey: null,
  isComplete: true,
  sets: Array.from({ length: sets }, (_, index) => completedSet(`s${index}`)),
});

let workoutApi: ReturnType<typeof useWorkout>;
let loggerApi: ReturnType<typeof useLogger>;
function Harness() {
  const workout = useWorkout();
  const logger = useLogger();
  useLayoutEffect(() => {
    workoutApi = workout;
    loggerApi = logger;
  });
  return <WeeklyReviewScreen />;
}

async function renderReview() {
  const view = await renderWithClient(
    <WorkoutProvider>
      <Harness />
    </WorkoutProvider>,
  );
  await screen.findByText('Last week');
  await waitFor(() => expect(loggerApi).not.toBeNull());
  return view;
}

const movers = () => within(screen.getByLabelText('Biggest changes on the week before'));

async function showThisWeek() {
  await fireEvent.press(screen.getByRole('button', { name: 'Next week' }));
  expect(screen.getByText('This week')).toBeVisible();
}

test('counts the workout in progress in its own week and drops it on discard', async () => {
  const view = await renderReview();
  await showThisWeek();
  expect(screen.queryByText('Triceps')).toBeNull();

  await act(async () => workoutApi.start({ kind: 'empty' }));
  await waitFor(() => expect(loggerApi?.state).not.toBeNull());
  await act(async () => {
    loggerApi!.change((current) => ({ ...current, movements: [benchMovement(3)] }));
  });
  // Chest 2 + 3 = 5 (one less than last week's 6); Triceps 1.5 from nothing.
  expect(await screen.findByText('Triceps')).toBeVisible();
  expect(movers().getByText(/^1\.5/)).toBeVisible();
  expect(movers().getByText(/^5/)).toBeVisible();

  // Moved to a day last week, it counts there instead: Chest 6 + 3 = 9 against 4.
  await act(async () => {
    loggerApi!.change((current) => ({ ...current, workoutDate: addDays(lastWeek, 3) }));
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Previous week' }));
  expect(screen.getByText('Last week')).toBeVisible();
  await waitFor(() => expect(movers().getByText(/^9/)).toBeVisible());

  await act(async () => workoutApi.discard());
  await waitFor(() => expect(screen.queryByText('Triceps')).toBeNull());
  expect(movers().getByText(/^6/)).toBeVisible();

  await view.unmount();
});

test('counts a finished workout waiting to sync, but not a refused one', async () => {
  const REFUSED_SESSION_ID = '33333333-3333-4333-8333-333333333333';
  addFinishedWorkout(makeFinished('me', { clientSessionId: REFUSED_SESSION_ID }), deviceStorage);
  addFinishedWorkout(makeFinished('me', { clientSessionId: FINISHED_SESSION_ID }), deviceStorage);
  // Another account's queue on this phone never counts.
  addFinishedWorkout(
    makeFinished('other', { clientSessionId: '44444444-4444-4444-8444-444444444444' }),
    deviceStorage,
  );
  // The server refuses the first; the second is still sending.
  jest.mocked(apiSend).mockImplementation((path, method, body) => {
    if (path === '/api/workouts' && method === 'POST')
      return (body as { client_session_id: string }).client_session_id === REFUSED_SESSION_ID
        ? Promise.reject(new ApiError(422, 'Workout name is required.'))
        : new Promise(() => undefined);
    return Promise.resolve({});
  });
  const view = await renderReview();
  await waitFor(() => expect(workoutApi.queue.refusals).toHaveProperty([REFUSED_SESSION_ID]));
  await showThisWeek();
  // Chest 2 + 3 from the one still sending, Triceps 1.5.
  expect(await screen.findByText('Triceps')).toBeVisible();
  expect(movers().getByText(/^1\.5/)).toBeVisible();
  expect(movers().getByText(/^5/)).toBeVisible();
  await view.unmount();
});

test('counts a finished workout once while it saves and until the dashboard includes it', async () => {
  let resolveSave!: (workout: TrackedWorkout) => void;
  jest.mocked(apiSend).mockImplementation((path, method, body) => {
    if (path === '/api/active-workout' && method === 'PUT')
      return Promise.resolve({
        revision: 1,
        draft: (body as { draft: unknown }).draft,
        conflict: false,
      });
    if (path === '/api/workouts' && method === 'POST')
      return new Promise<TrackedWorkout>((resolve) => {
        resolveSave = resolve;
      });
    return Promise.resolve({});
  });
  const view = await renderReview();
  await showThisWeek();

  await act(async () => workoutApi.start({ kind: 'empty' }));
  await waitFor(() => expect(loggerApi?.state).not.toBeNull());
  await act(async () => {
    loggerApi!.change((current) => ({ ...current, movements: [benchMovement(2)] }));
  });
  // Chest 2 + 2 = 4, Triceps 1.
  expect(await screen.findByText('Triceps')).toBeVisible();
  expect(movers().getByText(/^4/)).toBeVisible();

  // Finished and sending: counted once, from the queue.
  await act(async () => {
    expect(await loggerApi!.finish()).toEqual({ ok: true });
  });
  expect(loggerApi?.state).toBeNull();
  expect(movers().getByText(/^4/)).toBeVisible();

  // Saved, with the dashboard's refresh still on its way: still counted once.
  let resolveDashboard: ((value: DashboardData) => void) | undefined;
  const fallback = jest.mocked(apiGet).getMockImplementation()!;
  jest.mocked(apiGet).mockImplementation((path: string, signal?: AbortSignal) =>
    path.startsWith('/api/dashboard')
      ? new Promise<DashboardData>((resolve) => {
          resolveDashboard = resolve;
        })
      : fallback(path, signal),
  );
  const savedWorkout = {
    ...reviewWorkout('saved-live', today, [reviewSet(100, 5), reviewSet(100, 5)]),
    client_session_id: loggerApi?.finished?.sessionId ?? null,
  };
  await act(async () => resolveSave(savedWorkout));
  await waitFor(() => expect(loggerApi?.finished?.savedId).toBe('saved-live'));
  expect(workoutApi.queue.waiting).toBe(0);
  expect(screen.getByText('Triceps')).toBeVisible();
  expect(movers().getByText(/^4/)).toBeVisible();

  // The refreshed dashboard counts it itself: 4, never 6.
  serverWorkouts = [...serverWorkouts, savedWorkout];
  await waitFor(() => expect(resolveDashboard).toBeDefined());
  const refreshed = savedWeek(thisWeek, 2, 2, 'saved-live');
  await act(async () =>
    resolveDashboard!({ ...serverDashboard, weekly_sets: refreshed } as DashboardData),
  );
  await waitFor(() =>
    expect(client.getQueryData<DashboardData>(['dashboard', today])?.weekly_sets).toEqual(
      refreshed,
    ),
  );
  expect(screen.getByText('Triceps')).toBeVisible();
  expect(movers().getByText(/^4/)).toBeVisible();
  expect(movers().queryByText(/^6/)).toBeNull();

  await view.unmount();
});

test('counts a resumed saved workout in place of its saved sets through queue, save and refresh', async () => {
  // Saved this week with 2 sets: Chest 2 + 2 = 4, Triceps 1.
  const saved = reviewWorkout('w-this', today, [reviewSet(100, 5), reviewSet(100, 5)]);
  serverWorkouts = [...serverWorkouts, saved];
  serverDashboard = {
    ...serverDashboard,
    weekly_sets: savedWeek(thisWeek, 2, 2, 'w-this'),
  } as DashboardData;
  let resolveSave!: (workout: TrackedWorkout) => void;
  jest.mocked(apiSend).mockImplementation((path, method, body) => {
    if (path === '/api/active-workout' && method === 'PUT')
      return Promise.resolve({
        revision: 1,
        draft: (body as { draft: unknown }).draft,
        conflict: false,
      });
    if (path === '/api/workouts/w-this' && method === 'PUT')
      return new Promise<TrackedWorkout>((resolve) => {
        resolveSave = resolve;
      });
    return Promise.resolve({});
  });
  const view = await renderReview();
  await showThisWeek();
  expect(await screen.findByText('Triceps')).toBeVisible();
  expect(movers().getByText(/^4/)).toBeVisible();

  // Resumed with 5 sets: they replace its 2, never add to them (Chest 7, Triceps 2.5).
  await act(async () => workoutApi.resume(saved));
  await waitFor(() => expect(loggerApi?.state?.resumingWorkoutId).toBe('w-this'));
  await act(async () => {
    loggerApi!.change((current) => ({ ...current, movements: [benchMovement(5)] }));
  });
  await waitFor(() => expect(movers().getByText(/^2\.5/)).toBeVisible());
  expect(movers().getByText(/^7/)).toBeVisible();

  // Finished: the queued edit carries the saved id, so it still replaces them.
  await act(async () => {
    expect(await loggerApi!.finish()).toEqual({ ok: true });
  });
  expect(loggerApi?.state).toBeNull();
  expect(movers().getByText(/^2\.5/)).toBeVisible();
  expect(movers().getByText(/^7/)).toBeVisible();

  // Saved, with the dashboard's refresh on its way, then refreshed: Chest 7, never 9.
  let resolveDashboard: ((value: DashboardData) => void) | undefined;
  const fallback = jest.mocked(apiGet).getMockImplementation()!;
  jest.mocked(apiGet).mockImplementation((path: string, signal?: AbortSignal) =>
    path.startsWith('/api/dashboard')
      ? new Promise<DashboardData>((resolve) => {
          resolveDashboard = resolve;
        })
      : fallback(path, signal),
  );
  const edited = {
    ...saved,
    movements: [{ ...saved.movements[0], sets: Array(5).fill(reviewSet(100, 5)) }],
  };
  await act(async () => resolveSave(edited));
  await waitFor(() => expect(workoutApi.queue.waiting).toBe(0));
  expect(movers().getByText(/^2\.5/)).toBeVisible();
  expect(movers().getByText(/^7/)).toBeVisible();

  serverWorkouts = serverWorkouts.map((item) => (item.id === 'w-this' ? edited : item));
  await waitFor(() => expect(resolveDashboard).toBeDefined());
  const refreshed = savedWeek(thisWeek, 2, 5, 'w-this');
  await act(async () =>
    resolveDashboard!({ ...serverDashboard, weekly_sets: refreshed } as DashboardData),
  );
  await waitFor(() =>
    expect(client.getQueryData<DashboardData>(['dashboard', today])?.weekly_sets).toEqual(
      refreshed,
    ),
  );
  expect(movers().getByText(/^2\.5/)).toBeVisible();
  expect(movers().getByText(/^7/)).toBeVisible();
  expect(movers().queryByText(/^3\.5/)).toBeNull();
  expect(movers().queryByText(/^9/)).toBeNull();

  await view.unmount();
});

test("Home's muscle sets card counts the workout in progress, and its row opens the logger", async () => {
  function HomeCard() {
    const workout = useWorkout();
    const logger = useLogger();
    useLayoutEffect(() => {
      workoutApi = workout;
      loggerApi = logger;
    });
    return <MuscleSetsCard />;
  }
  const view = await renderWithClient(
    <WorkoutProvider>
      <HomeCard />
    </WorkoutProvider>,
  );
  expect(await screen.findByLabelText(/^Chest: 2 of/)).toBeVisible();
  await waitFor(() => expect(loggerApi).not.toBeNull());

  await act(async () => workoutApi.start({ kind: 'empty' }));
  await waitFor(() => expect(loggerApi?.state).not.toBeNull());
  mockRouter.push.mockClear();
  await act(async () => {
    loggerApi!.change((current) => ({ ...current, movements: [benchMovement(3)] }));
  });
  expect(await screen.findByLabelText(/^Chest: 5 of/)).toBeVisible();
  expect(screen.getByLabelText(/^Triceps: 1\.5 of/)).toBeVisible();

  // The live workout's contribution opens the logger, not a saved session.
  await fireEvent.press(screen.getByLabelText(/^Triceps: 1\.5 of/));
  await fireEvent.press(await screen.findByLabelText(/^View Bench Press in /));
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/workout'));
  expect(mockRouter.push).not.toHaveBeenCalledWith(
    expect.objectContaining({ pathname: '/training/session/[id]' }),
  );

  await view.unmount();
});
