import { isActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import {
  addExercises,
  addSet,
  checkFinish,
  chooseWorkoutType,
  completeExercise,
  deleteSet,
  finishInput,
  groupSuperset,
  loggerFromDraft,
  loggerToDraft,
  moveMovement,
  moveSet,
  restoreSet,
  setCounts,
  setSetKind,
  startLogger,
  togglePause,
  updateSet,
  workoutIdentity,
  type LoggerState,
} from './loggerState';
import {
  bench,
  context,
  exercises,
  press,
  pushDay,
  row,
  sessionId,
  startedAt,
  types,
} from './testFixtures';

function start(overrides: Partial<Parameters<typeof startLogger>[0]> = {}) {
  return startLogger(
    {
      template: null,
      startCategory: null,
      startType: null,
      recommendationCategory: 'pull',
      types,
      date: '2026-11-22',
      now: startedAt,
      clientSessionId: sessionId,
      ...overrides,
    },
    context(),
  );
}

const tick = (state: LoggerState, movement: number, set: number) =>
  updateSet(
    state,
    state.movements[movement].key,
    state.movements[movement].sets[set].key,
    { completed: true, rest_seconds: state.movements[movement].sets[set].rest_seconds },
    { addedByHand: false, workoutBodyweight: null },
  );

test('Up next starts from the planned day, filling the plan from last time', () => {
  const state = start({ template: pushDay, startCategory: 'push' });
  expect(state.category).toBe('push');
  expect(state.workoutTypeExplicit).toBe(true);
  const [movement] = state.movements;
  expect(movement.exercise).toBe(bench);
  expect(movement.repRange).toEqual({ min: 8, max: 10 });
  // The plan leaves the weight blank: last time's 80 kg, and last time's reps at that weight.
  expect(movement.sets.map((set) => [set.weight_kg, set.reps, set.rest_seconds])).toEqual([
    [80, 8, 120],
    [80, 7, 120],
  ]);
  expect(movement.sets.every((set) => set.fromPrevious && !set.completed)).toBe(true);
  expect(workoutIdentity(state, types).name).toBe('Push workout');
});

test('an empty workout starts as the recommended category with nothing in it', () => {
  const state = start();
  expect(state.movements).toEqual([]);
  expect(state.category).toBe('pull');
  expect(state.workoutTypeExplicit).toBe(false);
});

test('added exercises take their last session as suggestions, once each', () => {
  let state = addExercises(start(), [bench, row], context());
  state = addExercises(state, [bench], context());
  expect(state.movements.map((movement) => movement.exercise.id)).toEqual(['bench', 'row']);
  expect(state.movements[0].sets.map((set) => [set.weight_kg, set.reps])).toEqual([
    [80, 8],
    [80, 7],
  ]);
  // Never done: one blank warm-up at the default rest.
  expect(state.movements[1].sets).toHaveLength(1);
  expect(state.movements[1].sets[0]).toMatchObject({ duration_seconds: null, completed: false });
  expect(state.movements[1].sets[0].fromPrevious).toBeUndefined();
});

test('logging a set starts its rest and carries what was lifted to the next suggestion', () => {
  let state = start({ template: pushDay, startCategory: 'push' });
  const first = state.movements[0].sets[0].key;
  state = updateSet(
    state,
    state.movements[0].key,
    first,
    { weight_kg: 85 },
    { addedByHand: false, workoutBodyweight: null },
  ).state;
  const result = tick(state, 0, 0);
  expect(result.loggingSet).toBe(true);
  expect(result.restSeconds).toBe(120);
  const sets = result.state.movements[0].sets;
  expect(sets[0]).toMatchObject({ completed: true, weight_kg: 85, reps: 8, fromPrevious: false });
  expect(sets[1]).toMatchObject({ weight_kg: 85, reps: 8, completed: false, fromPrevious: true });
  expect(setCounts(result.state)).toEqual({ ticked: 1, unticked: 1 });
});

test('in a superset the rest waits until the round is done', () => {
  let state = addExercises(start(), [bench, press], context());
  state = groupSuperset(state, state.movements[0].key, [state.movements[1].key], 'group');
  state = {
    ...state,
    movements: state.movements.map((movement) => ({
      ...movement,
      sets: movement.sets.map((set) => ({ ...set, reps: 5, weight_kg: 40, rest_seconds: 60 })),
    })),
  };
  const first = tick(state, 0, 0);
  expect(first.nextInRound?.exercise).toBe(press);
  expect(first.restSeconds).toBeNull();
  const second = tick(first.state, 1, 0);
  expect(second.nextInRound).toBeNull();
  expect(second.restSeconds).toBe(60);
});

test('a set moves by its key, and a set that is gone moves nothing', () => {
  const state = addExercises(start(), [bench], context());
  const key = state.movements[0].key;
  const [first, second] = state.movements[0].sets;
  // A menu or drag opened before the set was deleted elsewhere: no undefined entry, no change.
  for (const move of [{ by: -1 as const }, { by: 1 as const }, { to: first.key }])
    expect(moveSet(state, key, 'deleted-set', move)).toBe(state);
  expect(moveSet(state, key, first.key, { to: 'deleted-set' })).toBe(state);
  expect(moveSet(state, key, second.key, { by: 1 })).toBe(state);
  const moved = moveSet(state, key, second.key, { to: first.key }).movements[0].sets;
  expect(moved.map((item) => item.key)).toEqual([second.key, first.key]);
  expect(moved.every(Boolean)).toBe(true);
});

test('sets can be added, retyped, deleted (never the last) and put back', () => {
  let state = addExercises(start(), [bench], context());
  const key = state.movements[0].key;
  const added = addSet(state, key, context());
  state = added.state;
  expect(state.movements[0].sets).toHaveLength(3);
  expect(state.movements[0].sets[2]).toMatchObject({ key: added.setKey, weight_kg: 80, reps: 7 });
  state = setSetKind(state, key, added.setKey!, 'drop');
  state = moveSet(state, key, added.setKey!, { by: -1 });
  expect(state.movements[0].sets[1].key).toBe(added.setKey);
  const firstKey = state.movements[0].sets[0].key;
  expect(moveSet(state, key, firstKey, { by: -1 }).movements[0].sets).toBe(state.movements[0].sets);
  state = moveSet(state, key, added.setKey!, { to: state.movements[0].sets[2].key });
  expect(state.movements[0].sets[2]).toMatchObject({ set_type: 'drop', warmup: false });
  const removed = state.movements[0].sets[0];
  state = deleteSet(state, key, removed.key);
  expect(state.movements[0].sets).toHaveLength(2);
  state = restoreSet(state, key, removed, 0);
  expect(state.movements[0].sets[0]).toBe(removed);
  let single = addExercises(start(), [row], context());
  single = deleteSet(single, single.movements[0].key, single.movements[0].sets[0].key);
  expect(single.movements[0].sets).toHaveLength(1);
});

test('exercises reorder, and finishing one logs its entered sets', () => {
  let state = addExercises(start(), [bench, press], context());
  state = moveMovement(state, 1, -1);
  expect(state.movements.map((movement) => movement.exercise.id)).toEqual(['press', 'bench']);
  expect(moveMovement(state, 0, -1)).toBe(state);
  state = completeExercise(state, state.movements[1].key, true);
  expect(state.movements[1].isComplete).toBe(true);
  expect(state.movements[1].sets.every((set) => set.completed)).toBe(true);
});

test('the stored draft is the web format and restores exactly', () => {
  let state = addExercises(start({ template: pushDay, startCategory: 'push' }), [row], context());
  state = tick(state, 0, 0).state;
  state = togglePause({ ...state, notes: 'Felt strong' }, startedAt + 60_000);
  const draft = loggerToDraft(state, startedAt + 61_000);
  expect(isActiveWorkoutDraft(JSON.parse(JSON.stringify(draft)))).toBe(true);
  expect(draft).toMatchObject({ clientSessionId: sessionId, pausedAt: startedAt + 60_000 });
  const restored = loggerFromDraft(JSON.parse(JSON.stringify(draft)), exercises);
  expect(restored?.movements.map((movement) => movement.sets)).toEqual(
    state.movements.map((movement) => movement.sets),
  );
  expect(loggerToDraft(restored!, startedAt + 61_000)).toEqual(draft);
  // An exercise the phone does not know keeps the draft waiting instead of dropping it.
  expect(loggerFromDraft(draft, [bench])).toBeNull();
});

test('finishing sends the web WorkoutInput, leaving paused time out', () => {
  let state = start({ template: pushDay, startCategory: 'push' });
  expect(checkFinish(state, types, false, startedAt)).toMatchObject({ kind: 'blocked' });
  state = tick(state, 0, 0).state;
  state = togglePause(state, startedAt + 20 * 60_000);
  state = togglePause(state, startedAt + 30 * 60_000);
  const check = checkFinish(state, types, false, startedAt + 45 * 60_000);
  expect(check).toMatchObject({ kind: 'ready', durationMinutes: 35 });
  if (check.kind !== 'ready') throw new Error('not ready');
  const input = finishInput(state, types, check);
  expect(input).toMatchObject({
    client_session_id: sessionId,
    name: 'Push workout',
    category: 'push',
    workout_date: '2026-11-22',
    duration_minutes: 35,
    // It ends when it was finished; the 10 paused minutes come off the start.
    start_time: '09:10',
    end_time: '09:45',
    notes: null,
  });
  expect(input.movements[0].sets.map((set) => [set.weight_kg, set.reps, set.completed])).toEqual([
    [80, 8, true],
    // The untouched suggestion after it now repeats what was lifted.
    [80, 8, false],
  ]);
});

test('choosing a type keeps a typed name and replaces an automatic one', () => {
  const state = start();
  const legs = types.find((type) => type.id === 'lower')!;
  expect(chooseWorkoutType(state, legs, types)).toMatchObject({
    category: 'lower',
    workoutTypeExplicit: true,
    name: '',
  });
  expect(chooseWorkoutType({ ...state, name: 'Morning' }, legs, types).name).toBe('Morning');
});
