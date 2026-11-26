import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initialHistoryStart } from '../../../../frontend/src/historyWindow';
import type { DashboardData, HeatmapDay, TrackedWorkout } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { apiSend } from '../../data/api';
import { queryKeys, refreshTraining, useDashboard, useWorkoutHistory } from '../../data/queries';
import { pendingActions } from '../../ui/pendingActions';
import { ToastHost } from '../../ui/Toast';
import {
  resetWorkoutDeletions,
  useWithoutPendingDeletions,
  useWorkoutDeletion,
} from './workoutDeletion';

// The real toast host and pending store: endings come from timers, replacements and taps.
jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
let mockStatus: { kind: string; user?: { id: string } } = { kind: 'signed-in', user: { id: 'u1' } };
jest.mock('../../session/SessionProvider', () => ({
  useOptionalSession: () => ({ status: mockStatus }),
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiSend: jest.fn(),
  apiGet: jest.fn(() => new Promise(() => undefined)),
}));
jest.mock('../../data/queries', () => ({
  ...jest.requireActual<typeof import('../../data/queries')>('../../data/queries'),
  refreshTraining: jest.fn(async () => undefined),
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
const a = workout('a', '2026-11-19');
const b = workout('b', '2026-11-20');
const c = workout('c', '2026-11-21');
const dashboardKey = queryKeys.dashboard(localDate());
const recentKey = queryKeys.workouts(initialHistoryStart());
const serverDashboard = () =>
  ({
    heatmap: [day('2026-11-19', ['a']), day('2026-11-20', ['b']), day('2026-11-21', ['c'])],
    recent_workouts: [c, b, a],
  }) as unknown as DashboardData;

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
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(dashboardKey, serverDashboard());
  client.setQueryData(recentKey, { revision: '1', workouts: [c, b, a] });
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
const deleteNow = (item: TrackedWorkout) =>
  act(async () => {
    seen.request!(item);
    jest.advanceTimersByTime(1);
  });
const wait = async (ms: number) => {
  await act(async () => jest.advanceTimersByTime(ms));
  // A request answered meanwhile tells its readers on the next timer.
  await act(async () => jest.advanceTimersByTime(1));
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  pendingActions.clear();
  resetWorkoutDeletions();
  mockStatus = { kind: 'signed-in', user: { id: 'u1' } };
  mockQueued = [];
  mockLive.live = null;
  jest.mocked(apiSend).mockResolvedValue(undefined);
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
  expect(deletes()).toEqual([]);
  // A refresh while the Undo shows can't bring it back to Home or Training.
  await act(async () => {
    client.setQueryData(dashboardKey, serverDashboard());
    client.setQueryData(recentKey, { revision: '2', workouts: [c, b, a] });
    jest.advanceTimersByTime(1);
  });
  expect(shown().home).toEqual(['c', 'b']);
  expect(shown().training).toEqual(['c', 'b']);
  // Nothing is sent while the Undo still shows.
  await wait(2000);
  expect(deletes()).toEqual([]);
  await wait(20000);
  expect(deletes()).toEqual(['/api/workouts/a']);
  expect(shown().training).toEqual(['c', 'b']);
  expect(refreshTraining).toHaveBeenCalledWith(client);
});

test('a second delete sends the first; its Undo brings back only the second', async () => {
  await show();
  await deleteNow(a);
  await deleteNow(b);
  // Replacing A's toast ended it, so A was sent.
  expect(deletes()).toEqual(['/api/workouts/a']);
  expect(shown().training).toEqual(['c']);
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  await wait(1);
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
  jest
    .mocked(apiSend)
    .mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
    .mockResolvedValue(undefined);
  await show();
  await deleteNow(a);
  await deleteNow(b);
  expect(deletes()).toEqual(['/api/workouts/a']);
  await act(async () => fail(new Error('No connection.')));
  await wait(1);
  // A is back everywhere, and the server's copy is read again.
  expect(shown().training).toEqual(['c', 'a']);
  expect(refreshTraining).toHaveBeenCalledWith(client);
  // B's Undo still shows: the error waits instead of replacing it (which would send B).
  expect(screen.getByRole('button', { name: 'Undo' })).toBeOnTheScreen();
  expect(screen.queryByText('No connection.')).toBeNull();
  expect(deletes()).toEqual(['/api/workouts/a']);
  await wait(20000);
  expect(deletes()).toEqual(['/api/workouts/a', '/api/workouts/b']);
  expect(screen.getByText('No connection.')).toBeOnTheScreen();
});

test('a failed delete with no other Undo showing says why at once', async () => {
  jest.mocked(apiSend).mockRejectedValueOnce(new Error('The server is busy.'));
  await show();
  await deleteNow(a);
  await wait(20000);
  expect(screen.getByText('The server is busy.')).toBeOnTheScreen();
  expect(shown().training).toEqual(['c', 'b', 'a']);
  // It can be deleted again.
  await deleteNow(a);
  expect(shown().training).toEqual(['c', 'b']);
});

test('switching account while the Undo shows sends nothing', async () => {
  const { rerender } = await show();
  await deleteNow(a);
  // A new session: the toast host drops the toast, and the session clears the cache.
  mockStatus = { kind: 'signed-in', user: { id: 'u2' } };
  client.clear();
  await rerender(tree());
  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
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

test('a workout still waiting to sync can’t be deleted, and one saved during the Undo is kept', async () => {
  mockQueued = [
    { pendingSave: { userId: 'u1', workoutId: 'a' } },
    { pendingSave: { userId: 'u9', workoutId: 'b' } },
  ];
  await show();
  await deleteNow(a);
  expect(screen.getByText('You can change this workout once it has synced.')).toBeOnTheScreen();
  expect(shown().training).toEqual(['c', 'b', 'a']);
  // Another account's queue doesn't block this one.
  await deleteNow(b);
  expect(shown().training).toEqual(['c', 'a']);
  // The logger finishes B (resumed) while its Undo shows: that save is queued, so B is kept.
  mockQueued = [{ pendingSave: { userId: 'u1', workoutId: 'b' } }];
  await wait(6000);
  expect(deletes()).toEqual([]);
  expect(shown().training).toEqual(['c', 'b', 'a']);
  expect(screen.getByText('You can change this workout once it has synced.')).toBeOnTheScreen();
});

test('Training’s older months leave out a workout deleted while its Undo shows', async () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(['deleted-workouts'], ['a']);
  const history = {
    workouts: [b, a],
    heatmap: [day('2026-11-19', ['a']), day('2026-11-20', ['b'])],
  };
  let result: typeof history | undefined;
  function Older() {
    const shownHistory = useWithoutPendingDeletions(history);
    useEffect(() => {
      result = shownHistory;
    });
    return null;
  }
  await render(
    <QueryClientProvider client={client}>
      <Older />
    </QueryClientProvider>,
  );
  expect(result!.workouts.map((item) => item.id)).toEqual(['b']);
  expect(result!.heatmap.map((entry) => entry.workout_date)).toEqual(['2026-11-20']);
});
