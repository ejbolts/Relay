import {
  readFinishedWorkouts,
  type FinishedWorkout,
} from '../../../../frontend/src/finishedWorkoutQueue';
import { moveDraftToFinishedQueue } from '../../../../frontend/src/finishedWorkoutSend';
import type { TrackedWorkout, WorkoutInput } from '../../../../frontend/src/types';
import { writeActiveWorkoutDraft, type DraftStorage } from '../../../../frontend/src/workoutDraft';
import { FinishedQueueSender, type SenderDependencies } from './finishedQueueSender';
import { checkFinish, finishInput, loggerToDraft, startLogger, updateSet } from './loggerState';
import { context, pushDay, startedAt, types } from './testFixtures';

class MemoryStorage implements DraftStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * A server that, like Relay's, saves a new workout once per client_session_id and answers a
 * repeat with the workout already saved. `mode` decides what the phone sees.
 */
class FakeServer {
  saved = new Map<string, TrackedWorkout>();
  requests = 0;
  mode: 'unreachable' | 'ok' | 'lost-response' | 'refuse' = 'ok';
  async save(payload: WorkoutInput): Promise<TrackedWorkout> {
    this.requests += 1;
    if (this.mode === 'unreachable')
      throw new Error('Could not reach Relay. Check your connection, then try again.');
    if (this.mode === 'refuse') throw new ApiError(422, 'Workout date is invalid.');
    const id = payload.client_session_id!;
    const workout =
      this.saved.get(id) ??
      ({ id: `workout-${this.saved.size + 1}`, client_session_id: id } as TrackedWorkout);
    this.saved.set(id, workout);
    if (this.mode === 'lost-response') {
      this.mode = 'ok';
      throw new Error('Could not reach Relay. Check your connection, then try again.');
    }
    return workout;
  }
}

function finishWorkout(storage: DraftStorage, sessionId: string, now: number) {
  let state = startLogger(
    {
      template: pushDay,
      startCategory: 'push',
      startType: null,
      recommendationCategory: null,
      types,
      date: '2026-11-22',
      now,
      clientSessionId: sessionId,
    },
    context(),
  );
  const [movement] = state.movements;
  state = updateSet(
    state,
    movement.key,
    movement.sets[0].key,
    { completed: true },
    { addedByHand: false, workoutBodyweight: null },
  ).state;
  writeActiveWorkoutDraft(loggerToDraft(state, now), storage);
  const check = checkFinish(state, types, false, now + 30 * 60_000);
  if (check.kind !== 'ready') throw new Error('not ready');
  moveDraftToFinishedQueue(finishInput(state, types, check), 'u1', now + 30 * 60_000, storage);
}

function sender(
  storage: DraftStorage,
  server: FakeServer,
  extra: Partial<SenderDependencies> = {},
) {
  const timers: (() => void)[] = [];
  const saved: string[] = [];
  const instance = new FinishedQueueSender({
    storage,
    userId: 'u1',
    send: (item: FinishedWorkout) => server.save(item.pendingSave.payload),
    online: () => true,
    describe: (error) => ({
      status: error instanceof ApiError ? error.status : undefined,
      outdated: error instanceof ApiError && error.status === 426,
      message: error instanceof Error ? error.message : '',
    }),
    onSaved: (workout) => saved.push(workout.id),
    onChange: () => undefined,
    setTimer: (run) => {
      timers.push(run);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => undefined,
    ...extra,
  });
  const runTimers = async () => {
    for (const run of timers.splice(0)) run();
    await flush();
  };
  return { instance, saved, timers, runTimers };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const sessionA = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
const sessionB = '6f1c1e3a-7f2b-4c8d-9a3e-2b5d7c9e1f40';

test('a workout finished offline is saved exactly once, however often the connection returns', async () => {
  const storage = new MemoryStorage();
  const server = new FakeServer();
  server.mode = 'unreachable';
  finishWorkout(storage, sessionA, startedAt);
  const { instance, saved, timers, runTimers } = sender(storage, server);

  instance.wake();
  await flush();
  expect(server.saved.size).toBe(0);
  expect(readFinishedWorkouts(storage)).toHaveLength(1);
  expect(timers).toHaveLength(1);

  // Back online, but the confirmation is lost on the way: the workout stays queued.
  server.mode = 'lost-response';
  await runTimers();
  expect(server.saved.size).toBe(1);
  expect(readFinishedWorkouts(storage)).toHaveLength(1);

  // The retry repeats the same session, which the server recognises.
  await runTimers();
  expect(readFinishedWorkouts(storage)).toHaveLength(0);
  expect(saved).toEqual(['workout-1']);

  // Reconnecting again sends nothing more.
  instance.wake();
  await flush();
  instance.wake();
  await flush();
  expect(server.saved.size).toBe(1);
  expect(server.requests).toBe(3);
  expect(instance.status()).toMatchObject({ waiting: 0, sending: false });
});

test('a refused workout waits for review without holding up the next one', async () => {
  const storage = new MemoryStorage();
  const server = new FakeServer();
  finishWorkout(storage, sessionA, startedAt);
  finishWorkout(storage, sessionB, startedAt + 3_600_000);
  server.mode = 'refuse';
  const { instance, saved } = sender(storage, server, {
    send: (item) =>
      item.clientSessionId === sessionA
        ? Promise.reject(new ApiError(422, 'Workout date is invalid.'))
        : ((server.mode = 'ok'), server.save(item.pendingSave.payload)),
  });
  instance.wake();
  await flush();
  expect(saved).toEqual(['workout-1']);
  expect(instance.status()).toMatchObject({
    waiting: 1,
    refusals: { [sessionA]: 'Workout date is invalid.' },
  });
  expect(readFinishedWorkouts(storage).map((item) => item.clientSessionId)).toEqual([sessionA]);
});

test("another account never sends this one's finished workouts", async () => {
  const storage = new MemoryStorage();
  const server = new FakeServer();
  finishWorkout(storage, sessionA, startedAt);
  const { instance: other } = sender(storage, server, { userId: 'u2' });
  other.wake();
  await flush();
  expect(server.requests).toBe(0);
  expect(readFinishedWorkouts(storage)).toHaveLength(0);
});

test('a save the phone could not drop from storage is reported as sent, not waiting', async () => {
  const storage = new MemoryStorage();
  finishWorkout(storage, sessionA, startedAt);
  // Storage is full from here on: the queue can't be rewritten without the saved workout.
  storage.setItem = () => {
    throw new Error('Storage is full.');
  };
  storage.removeItem = () => {
    throw new Error('Storage is full.');
  };
  const { instance, saved } = sender(storage, new FakeServer());

  instance.wake();
  await flush();
  expect(saved).toEqual(['workout-1']);
  expect(readFinishedWorkouts(storage)).toHaveLength(1);
  // Screens counting the queue leave it out, as the sender does.
  expect(instance.status()).toMatchObject({ waiting: 0, sent: [sessionA] });
});
