import { startLogger, updateSet, type LoggerState } from '../workout/loggerState';
import { context, pushDay, types } from '../workout/testFixtures';
import { creditKey } from './liveMuscleSources';

jest.mock('../workout/WorkoutProvider', () => ({
  useLogger: () => null,
  useOptionalWorkout: () => null,
}));

const start = (): LoggerState =>
  startLogger(
    {
      template: pushDay,
      startCategory: 'push',
      startType: null,
      recommendationCategory: null,
      types,
      date: '2026-11-22',
      now: 1_000,
      clientSessionId: '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
    },
    context(),
  );

const edit = (state: LoggerState, update: Parameters<typeof updateSet>[3]) => {
  const [movement] = state.movements;
  return updateSet(state, movement.key, movement.sets[0].key, update, {
    addedByHand: false,
    workoutBodyweight: null,
  }).state;
};

test('changes only with what the live muscle sets count', () => {
  const started = start();
  const key = creditKey(started);

  // Typing a weight or reps, or time passing, counts nothing new.
  expect(creditKey(edit(started, { weight_kg: 62.5, reps: 9 }))).toBe(key);
  expect(creditKey({ ...started, lastActiveAt: started.lastActiveAt + 60_000 })).toBe(key);

  // Ticking a working set, or moving the workout to another day, does.
  const ticked = edit(started, { completed: true });
  expect(creditKey(ticked)).not.toBe(key);
  expect(creditKey(edit(ticked, { weight_kg: 70 }))).toBe(creditKey(ticked));
  expect(creditKey({ ...ticked, workoutDate: '2026-11-21' })).not.toBe(creditKey(ticked));
  expect(creditKey(null)).toBe('');
});

test('lists an unnamed workout under the name the logger shows', () => {
  const unnamed = { ...start(), name: '' };
  expect(JSON.parse(creditKey(unnamed, 'Push workout')).name).toBe('Push workout');
  expect(JSON.parse(creditKey({ ...unnamed, name: 'Heavy push' }, 'Push workout')).name).toBe(
    'Heavy push',
  );
});
