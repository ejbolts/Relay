import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { DashboardData, HeatmapDay, TrackedWorkout } from '../../../../frontend/src/types';
import { apiSend } from '../../data/api';
import { initialHistoryStart } from '../../../../frontend/src/historyWindow';
import { localDate } from '../../../../frontend/src/utils';
import { queryKeys, refreshTraining } from '../../data/queries';
import { pendingActions } from '../../ui/pendingActions';
import { showToast, type ToastAction } from '../../ui/Toast';
import { useTrainingHistory } from './trainingQueries';
import { useWithoutPendingDeletions, useWorkoutDeletion } from './workoutDeletion';

let mockAccount = 'u1#1';
jest.mock('../../ui/Toast', () => ({
  showToast: jest.fn(),
  toastAccount: () => mockAccount,
  isToastAccountCurrent: (account: string) => account === mockAccount,
  onToastAccountChange: () => () => undefined,
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
jest.mock('../../session/SessionProvider', () => ({
  useOptionalSession: () => ({ status: { kind: 'signed-in', user: { id: 'u1' } } }),
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
const w1 = workout('w1', '2026-11-20');
const w2 = workout('w2', '2026-11-21');

let client: QueryClient;
const dashboardKey = queryKeys.dashboard(localDate());
const recentKey = queryKeys.workouts(initialHistoryStart());

function setup() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(dashboardKey, {
    heatmap: [day('2026-11-20', ['w1']), day('2026-11-21', ['w2'])],
    recent_workouts: [w2, w1],
  } as unknown as DashboardData);
  client.setQueryData(recentKey, { revision: '1', workouts: [w2, w1] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useWorkoutDeletion(), { wrapper });
}

const shownIds = () => ({
  calendar: client
    .getQueryData<DashboardData>(dashboardKey)!
    .heatmap.map((entry) => entry.workout_date),
  recent: client.getQueryData<DashboardData>(dashboardKey)!.recent_workouts.map((item) => item.id),
  history: client
    .getQueryData<{ workouts: TrackedWorkout[] }>(recentKey)!
    .workouts.map((item) => item.id),
});
const lastToast = () => {
  const [message, action, options] = jest.mocked(showToast).mock.calls.at(-1)!;
  return { message, action: action as ToastAction, options };
};
const deletes = () =>
  jest
    .mocked(apiSend)
    .mock.calls.filter(([, method]) => method === 'DELETE')
    .map(([path]) => path);

beforeEach(() => {
  jest.clearAllMocks();
  pendingActions.clear();
  mockAccount = 'u1#1';
  mockQueued = [];
  mockLive.live = null;
  jest.mocked(apiSend).mockResolvedValue(undefined);
});
afterEach(() => client.clear());

test('a deleted workout leaves at once, and the delete is sent only when its Undo toast ends', async () => {
  const { result } = await setup();
  await act(async () => expect(result.current.request(w1)).toBe(true));
  expect(shownIds()).toEqual({ calendar: ['2026-11-21'], recent: ['w2'], history: ['w2'] });
  const toast = lastToast();
  expect(toast.message).toBe('Workout deleted');
  expect(toast.action.label).toBe('Undo');
  expect(toast.options).toEqual({ account: 'u1#1', duration: 'important' });
  expect(deletes()).toEqual([]);
  // Asking again while the Undo shows starts nothing.
  await act(async () => expect(result.current.request(w1)).toBe(false));

  await act(async () => toast.action.onDismiss!());
  expect(deletes()).toEqual(['/api/workouts/w1']);
  expect(shownIds().history).toEqual(['w2']);
  expect(refreshTraining).toHaveBeenCalledWith(client);
});

test('Undo brings the workout back and sends nothing', async () => {
  const { result } = await setup();
  await act(async () => void result.current.request(w1));
  await act(async () => lastToast().action.run());
  expect(shownIds()).toEqual({
    calendar: ['2026-11-20', '2026-11-21'],
    recent: ['w2', 'w1'],
    history: ['w2', 'w1'],
  });
  expect(deletes()).toEqual([]);
  // It can be deleted again.
  await act(async () => expect(result.current.request(w1)).toBe(true));
});

test('a failed delete restores the workout and says why', async () => {
  jest.mocked(apiSend).mockRejectedValueOnce(new Error('The server is busy.'));
  const { result } = await setup();
  await act(async () => void result.current.request(w1));
  await act(async () => lastToast().action.onDismiss!());
  expect(shownIds().history).toEqual(['w2', 'w1']);
  expect(lastToast()).toMatchObject({
    message: 'The server is busy.',
    options: { account: 'u1#1', variant: 'error' },
  });
  await act(async () => expect(result.current.request(w1)).toBe(true));
});

test('a delete answering after an account switch changes nothing for the next account', async () => {
  let answer!: () => void;
  jest
    .mocked(apiSend)
    .mockImplementationOnce(() => new Promise((done) => (answer = () => done(undefined))));
  mockLive.live = { resumedWorkoutId: 'w1' };
  const { result } = await setup();
  await act(async () => void result.current.request(w1));
  await act(async () => lastToast().action.onDismiss!());
  mockAccount = 'u2#2';
  await act(async () => answer());
  expect(mockLive.discard).not.toHaveBeenCalled();
  expect(refreshTraining).not.toHaveBeenCalled();
});

test('a workout resumed in the logger ends with it once the delete is sent', async () => {
  mockLive.live = { resumedWorkoutId: 'w1' };
  const { result } = await setup();
  await act(async () => void result.current.request(w1));
  expect(mockLive.discard).not.toHaveBeenCalled();
  await act(async () => lastToast().action.onDismiss!());
  expect(mockLive.discard).toHaveBeenCalledTimes(1);
});

test('a workout still waiting to sync can’t be deleted yet, as on the web', async () => {
  mockQueued = [
    { pendingSave: { userId: 'u1', workoutId: 'w1' } },
    { pendingSave: { userId: 'u9', workoutId: 'w2' } },
  ];
  const { result } = await setup();
  await act(async () => expect(result.current.request(w1)).toBe(false));
  expect(lastToast()).toMatchObject({
    message: 'You can change this workout once it has synced.',
    options: { variant: 'warning' },
  });
  expect(shownIds().history).toEqual(['w2', 'w1']);
  // Another account's queue doesn't block this one, and an unconfirmed workout is blocked.
  await act(async () => expect(result.current.request(w2)).toBe(true));
  await act(async () =>
    expect(result.current.request(workout('pending:x', '2026-11-22'))).toBe(false),
  );
});

test('Training keeps a deleted workout hidden while its Undo shows, even after a refresh', async () => {
  await setup();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const token = pendingActions.add('workout', 'w1', 'u1#1')!;
  const { result } = await renderHook(() => useWithoutPendingDeletions(useTrainingHistory()), {
    wrapper,
  });
  // The cache still holds it, as a refresh would bring it back.
  expect(result.current.workouts.map((item) => item.id)).toEqual(['w2']);
  expect(result.current.heatmap.map((entry) => entry.workout_date)).toEqual(['2026-11-21']);
  await act(async () => pendingActions.remove(token));
  expect(result.current.workouts.map((item) => item.id)).toEqual(['w2', 'w1']);
});
