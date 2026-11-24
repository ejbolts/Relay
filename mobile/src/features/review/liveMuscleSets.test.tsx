import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
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
import { apiGet, apiSend } from '../../data/api';
import { deviceStorage } from '../../data/deviceStorage';
import { memoryKv } from '../../testing/memoryKvStore';
import { useLogger, useWorkout, WorkoutProvider } from '../workout/WorkoutProvider';
import {
  clearLiveWorkoutSources,
  publishLiveWorkoutSources,
  rememberSavedWorkout,
} from './liveWorkoutSources';
import { resetNoticeMemory } from './noticeMemory';
import { WeeklyReviewScreen } from './WeeklyReviewScreen';

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
  clearLiveWorkoutSources();
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
  clearLiveWorkoutSources();
  onlineManager.setOnline(true);
  memoryKv.clear();
});

test('includes an unsaved live workout draft in this week and earlier weeks, and drops it on discard', async () => {
  publishLiveWorkoutSources({
    owner: 'me',
    draft: makeDraft(),
    exercises: [bench],
    refusals: {},
  });

  const view = await renderWithClient(<WeeklyReviewScreen />);
  // Step from Last week to This week.
  await screen.findByText('Last week');
  await fireEvent.press(screen.getByRole('button', { name: 'Next week' }));
  expect(screen.getByText('This week')).toBeVisible();

  // Baseline Chest was 2; live draft adds 3 Chest (5 total, -1 vs last week's 6) and 1.5 Triceps (+1.5 vs 0).
  const movers = () => within(screen.getByLabelText('Biggest changes on the week before'));
  expect(await screen.findByText('Triceps')).toBeVisible();
  expect(movers().getByText(/^1\.5/)).toBeVisible();
  expect(movers().getByText(/^5/)).toBeVisible();

  // Discarding the live workout immediately returns to the dashboard baseline (Chest 2, no Triceps).
  await act(async () => {
    publishLiveWorkoutSources({ owner: 'me', draft: null, exercises: [bench], refusals: {} });
  });
  expect(screen.queryByText('Triceps')).toBeNull();
  expect(movers().getByText(/^2/)).toBeVisible();

  // Logging a live workout on a date in last week updates Last week too.
  await fireEvent.press(screen.getByRole('button', { name: 'Previous week' }));
  expect(screen.getByText('Last week')).toBeVisible();
  await act(async () => {
    publishLiveWorkoutSources({
      owner: 'me',
      draft: makeDraft({ workoutDate: addDays(lastWeek, 3) }),
      exercises: [bench],
      refusals: {},
    });
  });
  // Last week Chest becomes 6 + 3 = 9 (+5 vs weekBefore's 4), Triceps becomes 1.5.
  expect(await screen.findByText('Triceps')).toBeVisible();
  expect(movers().getByText(/^9/)).toBeVisible();

  await view.unmount();
});

test('counts a queued finished workout, excludes refused ones, and never double-counts once saved', async () => {
  const finished = makeFinished('me', { clientSessionId: FINISHED_SESSION_ID });
  addFinishedWorkout(finished, deviceStorage);
  publishLiveWorkoutSources({
    owner: 'me',
    draft: null,
    exercises: [bench],
    refusals: {},
    waiting: 1,
  });

  const view = await renderWithClient(<WeeklyReviewScreen />);
  const movers = () => within(screen.getByLabelText('Biggest changes on the week before'));
  await screen.findByText('Last week');
  await fireEvent.press(screen.getByRole('button', { name: 'Next week' }));
  expect(await screen.findByText('Triceps')).toBeVisible();
  // Chest = 2 baseline + 3 finished = 5.
  expect(movers().getByText(/^5/)).toBeVisible();

  // A refused workout waits for review and is not counted as saved.
  await act(async () => {
    publishLiveWorkoutSources({
      owner: 'me',
      draft: null,
      exercises: [bench],
      refusals: { [FINISHED_SESSION_ID]: 'Check sets.' },
      waiting: 1,
    });
  });
  expect(screen.queryByText('Triceps')).toBeNull();
  expect(movers().getByText(/^2/)).toBeVisible();

  // Once the server confirms the save, keep counting it while dashboard is still stale.
  memoryKv.clear();
  const dashboardState = client.getQueryState(['dashboard', today]);
  await act(async () => {
    publishLiveWorkoutSources({
      owner: 'me',
      draft: null,
      exercises: [bench],
      refusals: {},
      waiting: 0,
    });
    rememberSavedWorkout(
      'me',
      'saved-w99',
      finished,
      serverDashboard,
      dashboardState?.dataUpdatedAt ?? 0,
    );
  });
  expect(await screen.findByText('Triceps')).toBeVisible();
  expect(movers().getByText(/^5/)).toBeVisible();

  // When the refreshed dashboard arrives with saved-w99, Chest stays 5 (never 8).
  serverDashboard = {
    ...serverDashboard,
    weekly_sets: muscleWeek(thisWeek, [
      {
        muscle_group: 'Chest',
        raw_sets: 5,
        contributions: [
          {
            workout_id: 'saved-w99',
            workout_name: 'Push Day',
            workout_date: today,
            movement_id: 'm1',
            exercise_id: 'bench',
            exercise_name: 'Bench Press',
            working_sets: 3,
            credit_per_set: 1,
            set_credits: 3,
          },
        ],
      },
      {
        muscle_group: 'Triceps',
        raw_sets: 1.5,
        contributions: [
          {
            workout_id: 'saved-w99',
            workout_name: 'Push Day',
            workout_date: today,
            movement_id: 'm1',
            exercise_id: 'bench',
            exercise_name: 'Bench Press',
            working_sets: 3,
            credit_per_set: 0.5,
            set_credits: 1.5,
          },
        ],
      },
    ]),
  } as unknown as DashboardData;
  await act(async () => {
    await client.refetchQueries({ queryKey: ['dashboard'] });
  });
  expect(movers().getByText(/^5/)).toBeVisible();
  expect(movers().getByText(/^1\.5/)).toBeVisible();

  await view.unmount();
});

test('does not double-count a resumed saved workout or leak another account’s draft', async () => {
  serverDashboard = {
    ...serverDashboard,
    weekly_sets: muscleWeek(thisWeek, [
      {
        muscle_group: 'Chest',
        raw_sets: 5,
        contributions: [
          {
            workout_id: 'w-existing',
            workout_name: 'Push Day',
            workout_date: today,
            movement_id: 'm1',
            exercise_id: 'bench',
            exercise_name: 'Bench Press',
            working_sets: 3,
            credit_per_set: 1,
            set_credits: 3,
          },
        ],
      },
      {
        muscle_group: 'Triceps',
        raw_sets: 1.5,
        contributions: [
          {
            workout_id: 'w-existing',
            workout_name: 'Push Day',
            workout_date: today,
            movement_id: 'm1',
            exercise_id: 'bench',
            exercise_name: 'Bench Press',
            working_sets: 3,
            credit_per_set: 0.5,
            set_credits: 1.5,
          },
        ],
      },
    ]),
  } as unknown as DashboardData;

  // Resuming w-existing with 4 completed sets replaces its 3 sets (Chest becomes 6, not 9).
  publishLiveWorkoutSources({
    owner: 'me',
    draft: makeDraft({
      resumingWorkoutId: 'w-existing',
      movements: [
        {
          key: 'm-bench',
          exerciseId: 'bench',
          notes: '',
          machinePhotoIds: [],
          supersetKey: null,
          sets: [completedSet('s1'), completedSet('s2'), completedSet('s3'), completedSet('s4')],
        },
      ],
    }),
    exercises: [bench],
    refusals: {},
  });

  const view = await renderWithClient(<WeeklyReviewScreen />);
  const movers = () => within(screen.getByLabelText('Biggest changes on the week before'));
  await screen.findByText('Last week');
  await fireEvent.press(screen.getByRole('button', { name: 'Next week' }));
  // Chest = 6 (same as last week's 6 -> 0 change, not a mover); Triceps = 2 (+2 vs 0).
  expect(await screen.findByText('Triceps')).toBeVisible();
  expect(movers().getByText(/^2/)).toBeVisible();

  // Another account's draft is ignored completely.
  await act(async () => {
    publishLiveWorkoutSources({
      owner: 'other-user',
      draft: makeDraft(),
      exercises: [bench],
      refusals: {},
    });
  });
  // Back to baseline Triceps = 1.5.
  expect(movers().getByText(/^1\.5/)).toBeVisible();

  await view.unmount();
});

test('updates WeeklyReviewScreen end-to-end through WorkoutProvider from live sets to saved workout', async () => {
  let workoutApi!: ReturnType<typeof useWorkout>;
  let loggerApi!: ReturnType<typeof useLogger>;
  function Harness() {
    workoutApi = useWorkout();
    loggerApi = useLogger();
    return <WeeklyReviewScreen />;
  }

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

  const view = await renderWithClient(
    <WorkoutProvider>
      <Harness />
    </WorkoutProvider>,
  );

  await screen.findByText('Last week');
  await waitFor(() => expect(loggerApi).not.toBeNull());
  await fireEvent.press(screen.getByRole('button', { name: 'Next week' }));
  expect(screen.getByText('This week')).toBeVisible();
  expect(screen.queryByText('Triceps')).toBeNull();

  // Start a workout and log 2 working sets of Bench Press.
  await act(async () => {
    workoutApi.start({ kind: 'empty' });
  });
  await waitFor(() => expect(loggerApi?.state).not.toBeNull());
  await act(async () => {
    loggerApi!.change((current) => ({
      ...current,
      movements: [
        {
          key: 'm-bench',
          exercise: bench,
          notes: '',
          machinePhotoIds: [],
          machinePhotosInitialized: true,
          supersetKey: null,
          isComplete: true,
          sets: [completedSet('s1'), completedSet('s2')],
        },
      ],
    }));
  });

  // Live sets immediately show in Weekly review: Chest = 2 + 2 = 4, Triceps = 1.
  expect(await screen.findByText('Triceps')).toBeVisible();
  expect(screen.getByText(/^4/)).toBeVisible();

  // Finish the workout: while POST /api/workouts is in flight, sets stay counted once.
  await act(async () => {
    const result = await loggerApi!.finish();
    expect(result).toEqual({ ok: true });
  });
  expect(screen.getByText('Triceps')).toBeVisible();
  expect(screen.getByText(/^4/)).toBeVisible();

  // Server confirms the save; before dashboard refreshes, sets stay counted once.
  serverDashboard = {
    ...serverDashboard,
    weekly_sets: muscleWeek(thisWeek, [
      {
        muscle_group: 'Chest',
        raw_sets: 4,
        contributions: [
          {
            workout_id: 'saved-live',
            workout_name: 'Push Day',
            workout_date: today,
            movement_id: 'm1',
            exercise_id: 'bench',
            exercise_name: 'Bench Press',
            working_sets: 2,
            credit_per_set: 1,
            set_credits: 2,
          },
        ],
      },
      {
        muscle_group: 'Triceps',
        raw_sets: 1,
        contributions: [
          {
            workout_id: 'saved-live',
            workout_name: 'Push Day',
            workout_date: today,
            movement_id: 'm1',
            exercise_id: 'bench',
            exercise_name: 'Bench Press',
            working_sets: 2,
            credit_per_set: 0.5,
            set_credits: 1,
          },
        ],
      },
    ]),
  } as unknown as DashboardData;
  await act(async () => {
    resolveSave({
      ...reviewWorkout('saved-live', today, [reviewSet(100, 5), reviewSet(100, 5)]),
      client_session_id: loggerApi?.finished?.sessionId ?? null,
    });
  });

  // Dashboard refetches and still shows Chest 4, Triceps 1 (never 6 / 2).
  await waitFor(() => expect(loggerApi?.finished?.savedId).toBe('saved-live'));
  expect(screen.getByText('Triceps')).toBeVisible();
  expect(screen.getByText(/^4/)).toBeVisible();

  await view.unmount();
});
