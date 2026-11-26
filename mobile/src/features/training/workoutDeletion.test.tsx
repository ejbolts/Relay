import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { FinishedWorkout } from '../../../../frontend/src/finishedWorkoutQueue';
import { initialHistoryStart } from '../../../../frontend/src/historyWindow';
import type { DashboardData, HeatmapDay, TrackedWorkout } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { apiGet, apiSend } from '../../data/api';
import { queryKeys, useDashboard, useWorkoutHistory } from '../../data/queries';
import { nextSessionEpoch } from '../../session/sessionEpoch';
import { pendingActions } from '../../ui/pendingActions';
import { showToast, ToastHost } from '../../ui/Toast';
import {
  awaitingDashboard,
  forgetJustSavedWorkouts,
  justSavedWorkouts,
  rememberSavedWorkout,
} from '../review/justSavedWorkouts';
import {
  resetWorkoutDeletions,
  useWithoutPendingDeletions,
  useWorkoutDeletion,
  WORKOUT_KEPT_MESSAGE,
} from './workoutDeletion';

// The real toast host, pending store, deleted list and refresh: endings come from timers,
// replacements and taps, and a refresh reads this fake server.
jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
let mockStatus: { kind: string; user?: { id: string } } = { kind: 'signed-in', user: { id: 'u1' } };
jest.mock('../../session/SessionProvider', () => ({
  useOptionalSession: () => ({ status: mockStatus }),
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiSend: jest.fn(),
  apiGet: jest.fn(),
}));
const mockLive = {
  live: null as null | { resumedWorkoutId: string | null },
  discard: jest.fn(),
};
jest.mock('../workout/WorkoutProvider', () => ({ useWorkout: () => mockLive }));
let mockQueued: { pendingSave: { userId: string; workoutId: string | null } }[] = [];
jest.mock('../../../../frontend/src/finishedWorkoutQueue', () => ({
  readFinishedWorkouts: () => mockQueued,
}));

const workout = (id: string, date: string) =>
  ({
    id,
    name: id,
    workout_date: date,
    category: 'upper',
    movements: [],
  }) as unknown as TrackedWorkout;
const day = (date: string, ids: string[]): HeatmapDay => ({
  workout_date: date,
  categories: ['upper'],
  workout_count: ids.length,
  set_count: ids.length * 3,
  workouts: ids.map((id) => ({
    id,
    name: id,
    category: 'upper',
    duration_minutes: 40,
    exercises: [{ exercise_name: 'Bench', set_count: 3, bodyweight_kg: null }],
  })) as HeatmapDay['workouts'],
});
const all = [workout('c', '2026-11-21'), workout('b', '2026-11-20'), workout('a', '2026-11-19')];
const [c, b, a] = all;
const dashboardKey = queryKeys.dashboard(localDate());
const recentKey = queryKeys.workouts(initialHistoryStart());

// The server: what it holds, and the responses built from it.
let server: TrackedWorkout[] = [];
const dashboardFor = (workouts: TrackedWorkout[]) =>
  ({
    heatmap: [...workouts].reverse().map((item) => day(item.workout_date, [item.id])),
    recent_workouts: workouts,
  }) as unknown as DashboardData;

// Caches under the same prefixes that this feature doesn't own: they must come out untouched.
const bodyMeasurements = [{ id: 'm1', weight_kg: 80 }];
const progress = [{ exercise_id: 'bench', sessions: 3 }];
const older = {
  pages: [{ start: '2026-02-01', workouts: [a], heatmap: [day('2026-11-19', ['a'])] }],
  pageParams: ['2026-08-01'],
};

let client: QueryClient;
const seen: {
  request?: (item: TrackedWorkout) => boolean;
  dashboard?: DashboardData;
  recent?: TrackedWorkout[];
} = {};

/** Reads as Home does, and deletes as a saved workout's Delete does. */
function Probe() {
  const deletion = useWorkoutDeletion();
  const dashboard = useDashboard().data;
  const recent = useWorkoutHistory().data;
  useEffect(() => {
    seen.request = deletion.request;
    seen.dashboard = dashboard;
    seen.recent = recent;
  });
  return null;
}

const tree = () => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 },
    }}
  >
    <QueryClientProvider client={client}>
      <Probe />
      <ToastHost />
    </QueryClientProvider>
  </SafeAreaProvider>
);

async function show() {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  client.setQueryData(dashboardKey, dashboardFor(server));
  client.setQueryData(recentKey, { revision: '1', workouts: server });
  client.setQueryData(['workouts', 'body-measurements'], bodyMeasurements);
  client.setQueryData(['workouts', 'progress'], progress);
  client.setQueryData(['workouts', 'older', initialHistoryStart()], older);
  return render(tree());
}

const shown = () => ({
  calendar: seen.dashboard!.heatmap.map((entry) => entry.workout_date),
  home: seen.dashboard!.recent_workouts.map((item) => item.id),
  training: seen.recent!.map((item) => item.id),
});
const deletes = () =>
  jest
    .mocked(apiSend)
    .mock.calls.filter(([, method]) => method === 'DELETE')
    .map(([path]) => path);
// React Query tells its readers on a zero-delay timer, so each step lets that run.
const step = () => act(async () => jest.advanceTimersByTime(1));
const deleteNow = async (item: TrackedWorkout) => {
  await act(async () => void seen.request!(item));
  await step();
};
const wait = async (ms: number) => {
  await act(async () => jest.advanceTimersByTime(ms));
  // A request answered meanwhile tells its readers on the next timers.
  await step();
  await step();
};
const finished = (id: string) => ({ pendingSave: { workoutId: id } }) as unknown as FinishedWorkout;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  // Each test is a new session: the deleted list and pending store start empty.
  nextSessionEpoch();
  pendingActions.clear();
  resetWorkoutDeletions();
  forgetJustSavedWorkouts();
  mockStatus = { kind: 'signed-in', user: { id: 'u1' } };
  mockQueued = [];
  mockLive.live = null;
  server = [...all];
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path.startsWith('/api/dashboard')) return dashboardFor(server) as never;
    if (path.startsWith('/api/workouts/snapshot'))
      return { revision: '2', workouts: server } as never;
    return [] as never;
  });
  jest.mocked(apiSend).mockImplementation(async (path, method) => {
    if (method === 'DELETE') server = server.filter((item) => path !== `/api/workouts/${item.id}`);
    return undefined as never;
  });
});
afterEach(() => {
  client.clear();
  jest.useRealTimers();
});

test('a deleted workout leaves Home and Training at once; the delete is sent when its toast ends', async () => {
  await show();
  await deleteNow(a);
  expect(shown()).toEqual({
    calendar: ['2026-11-20', '2026-11-21'],
    home: ['c', 'b'],
    training: ['c', 'b'],
  });
  expect(screen.getByText('Workout deleted')).toBeOnTheScreen();
  // A refresh while the Undo shows can't bring it back to Home or Training.
  await act(async () => void client.refetchQueries());
  await wait(10);
  expect(apiGet).toHaveBeenCalled();
  expect(shown().home).toEqual(['c', 'b']);
  expect(shown().training).toEqual(['c', 'b']);
  // Resetting every query (as an import undo does) can't empty the deleted list either.
  await act(async () => void client.resetQueries());
  await wait(10);
  expect(shown().training).toEqual(['c', 'b']);
  await wait(2000);
  expect(deletes()).toEqual([]);
  await wait(20000);
  expect(deletes()).toEqual(['/api/workouts/a']);
  expect(shown()).toEqual({
    calendar: ['2026-11-20', '2026-11-21'],
    home: ['c', 'b'],
    training: ['c', 'b'],
  });
});

test('a confirmed delete leaves every other cached response exactly as it was', async () => {
  await show();
  const before = {
    body: client.getQueryData(['workouts', 'body-measurements']),
    progress: client.getQueryData(['workouts', 'progress']),
    older: client.getQueryData(['workouts', 'older', initialHistoryStart()]),
  };
  await deleteNow(a);
  await wait(20000);
  expect(deletes()).toEqual(['/api/workouts/a']);
  // Same objects: arrays stay arrays, and nothing was rewritten.
  expect(client.getQueryData(['workouts', 'body-measurements'])).toBe(before.body);
  expect(client.getQueryData(['workouts', 'progress'])).toBe(before.progress);
  expect(client.getQueryData(['workouts', 'older', initialHistoryStart()])).toBe(before.older);
  expect(Array.isArray(client.getQueryData(['workouts', 'body-measurements']))).toBe(true);
  // Training's older months still leave it out.
  let olderShown: { workouts: readonly TrackedWorkout[] } | undefined;
  function Older() {
    const history = useWithoutPendingDeletions({
      workouts: [b, a],
      heatmap: older.pages[0].heatmap,
    });
    useEffect(() => {
      olderShown = history;
    });
    return null;
  }
  await render(
    <QueryClientProvider client={client}>
      <Older />
    </QueryClientProvider>,
  );
  expect(olderShown!.workouts.map((item) => item.id)).toEqual(['b']);
});

test('a second delete sends the first; its Undo brings back only the second', async () => {
  await show();
  await deleteNow(a);
  await deleteNow(b);
  // Replacing A's toast ended it, so A was sent.
  expect(deletes()).toEqual(['/api/workouts/a']);
  expect(shown().training).toEqual(['c']);
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  await wait(10);
  expect(shown()).toEqual({
    calendar: ['2026-11-20', '2026-11-21'],
    home: ['c', 'b'],
    training: ['c', 'b'],
  });
  await wait(20000);
  expect(deletes()).toEqual(['/api/workouts/a']);
});

test('a failed delete comes back and says why, without cutting short another Undo', async () => {
  let fail!: (reason: Error) => void;
  jest.mocked(apiSend).mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
  await show();
  await deleteNow(a);
  await deleteNow(b);
  await act(async () => fail(new Error('No connection.')));
  await wait(10);
  // A is back everywhere.
  expect(shown().training).toEqual(['c', 'a']);
  // B's Undo still shows: the error waits instead of replacing it (which would send B).
  expect(screen.getByRole('button', { name: 'Undo' })).toBeOnTheScreen();
  expect(screen.queryByText('No connection.')).toBeNull();
  expect(deletes()).toEqual(['/api/workouts/a']);
  await wait(6000);
  expect(deletes()).toEqual(['/api/workouts/a', '/api/workouts/b']);
  await wait(1500);
  expect(screen.getByText('No connection.')).toBeOnTheScreen();
});

test('a held notice waits for a newer toast with an Undo, instead of ending it', async () => {
  let fail!: (reason: Error) => void;
  jest.mocked(apiSend).mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
  await show();
  await deleteNow(a);
  await deleteNow(b);
  await act(async () => fail(new Error('No connection.')));
  await wait(10);
  // Something else with an Undo replaces B's toast, which ends B.
  const goal = { label: 'Undo', run: jest.fn(), onDismiss: jest.fn() };
  await act(async () => showToast('Goal removed', goal));
  await wait(10);
  expect(screen.getByText('Goal removed')).toBeOnTheScreen();
  expect(goal.onDismiss).not.toHaveBeenCalled();
  expect(screen.queryByText('No connection.')).toBeNull();
  // Once the goal's toast has ended by itself, the error shows.
  await wait(8000);
  expect(goal.onDismiss).toHaveBeenCalledTimes(1);
  await wait(1500);
  expect(screen.getByText('No connection.')).toBeOnTheScreen();
});

test('a failed delete with no other Undo showing says why, and can be deleted again', async () => {
  jest.mocked(apiSend).mockRejectedValueOnce(new Error('The server is busy.'));
  await show();
  await deleteNow(a);
  await wait(6000);
  await wait(1500);
  expect(screen.getByText('The server is busy.')).toBeOnTheScreen();
  expect(shown().training).toEqual(['c', 'b', 'a']);
  await deleteNow(a);
  expect(shown().training).toEqual(['c', 'b']);
});

test('signing out and in again while the Undo shows sends nothing', async () => {
  const { rerender } = await show();
  await deleteNow(a);
  // The same account in a new session: the toast host drops the toast, the cache is cleared.
  nextSessionEpoch();
  mockStatus = { kind: 'signed-in', user: { id: 'u1' } };
  client.clear();
  await rerender(tree());
  await wait(30000);
  expect(deletes()).toEqual([]);
});

test('a workout resumed in the logger ends once its delete is sent', async () => {
  mockLive.live = { resumedWorkoutId: 'a' };
  await show();
  await deleteNow(a);
  expect(mockLive.discard).not.toHaveBeenCalled();
  await wait(20000);
  expect(mockLive.discard).toHaveBeenCalledTimes(1);
});

test('a workout saved during the Undo is kept, whether its save has landed or is still queued', async () => {
  await show();
  // Online: the resumed workout is finished and its save reaches the server during the Undo.
  rememberSavedWorkout(client, 'u1', 'b', finished('b'));
  await deleteNow(a);
  rememberSavedWorkout(client, 'u1', 'a', finished('a'));
  await wait(6000);
  expect(deletes()).toEqual([]);
  expect(shown().training).toEqual(['c', 'b', 'a']);
  await wait(1500);
  expect(screen.getByText(WORKOUT_KEPT_MESSAGE)).toBeOnTheScreen();

  // Offline: the save is still queued when the toast ends.
  await deleteNow(c);
  mockQueued = [{ pendingSave: { userId: 'u1', workoutId: 'c' } }];
  await wait(6000);
  expect(deletes()).toEqual([]);
  expect(shown().training).toEqual(['c', 'b', 'a']);

  // A save of this workout from before the delete doesn't keep it.
  mockQueued = [];
  await deleteNow(b);
  await wait(6000);
  expect(deletes()).toEqual(['/api/workouts/b']);
});

test('a workout still waiting to sync can’t be deleted; another account’s queue doesn’t block', async () => {
  mockQueued = [
    { pendingSave: { userId: 'u1', workoutId: 'a' } },
    { pendingSave: { userId: 'u9', workoutId: 'b' } },
  ];
  await show();
  await deleteNow(a);
  expect(screen.getByText('You can change this workout once it has synced.')).toBeOnTheScreen();
  expect(shown().training).toEqual(['c', 'b', 'a']);
  await deleteNow(b);
  expect(shown().training).toEqual(['c', 'a']);
});

test('a workout saved before the dashboard loaded still counts while a delete is pending', async () => {
  await show();
  rememberSavedWorkout(client, 'u1', 'new', finished('new'));
  const raw = client.getQueryData(dashboardKey);
  await deleteNow(a);
  // Home reads a filtered copy, which still matches the response the save was pinned to.
  expect(seen.dashboard).not.toBe(raw);
  expect(awaitingDashboard(justSavedWorkouts(), 'u1', seen.dashboard).map((e) => e.id)).toEqual([
    'new',
  ]);
});
