import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { FinishedWorkout } from '../../../../frontend/src/finishedWorkoutQueue';
import { localDate } from '../../../../frontend/src/utils';
import {
  awaitingDashboard,
  forgetJustSavedWorkouts,
  rememberSavedWorkout,
  useJustSavedWorkouts,
} from './justSavedWorkouts';

const finished = { name: 'Push Day' } as FinishedWorkout;

afterEach(() => forgetJustSavedWorkouts());

test('keeps a just-saved workout for its own account only, across an account switch', async () => {
  const client = new QueryClient();
  const dashboard = { weekly_sets: null };
  client.setQueryData(['dashboard', localDate()], dashboard);
  const { result } = await renderHook(() => useJustSavedWorkouts());

  await act(async () => rememberSavedWorkout(client, 'alex', 'w1', finished));
  expect(awaitingDashboard(result.current, 'alex', dashboard).map((item) => item.id)).toEqual([
    'w1',
  ]);
  // Sam signs in on this phone, with the same cached dashboard: Alex's save never counts.
  expect(awaitingDashboard(result.current, 'sam', dashboard)).toEqual([]);

  // Sam's first save drops Alex's entry, so switching back doesn't bring it back either.
  await act(async () => rememberSavedWorkout(client, 'sam', 'w2', finished));
  expect(awaitingDashboard(result.current, 'sam', dashboard).map((item) => item.id)).toEqual([
    'w2',
  ]);
  expect(awaitingDashboard(result.current, 'alex', dashboard)).toEqual([]);

  // A refreshed dashboard counts the save itself.
  expect(awaitingDashboard(result.current, 'sam', { weekly_sets: null })).toEqual([]);
});
