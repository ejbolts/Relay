import { readFinishedWorkouts } from '../../../../frontend/src/finishedWorkoutQueue';
import { moveDraftToFinishedQueue } from '../../../../frontend/src/finishedWorkoutSend';
import type { TrackedWorkout, WorkoutInput } from '../../../../frontend/src/types';
import { writeActiveWorkoutDraft, type DraftStorage } from '../../../../frontend/src/workoutDraft';
import { ApiError } from '../../data/api';
import { forgetSessionTokenIf } from '../../data/session';
import { nextSessionEpoch } from '../../session/sessionEpoch';
import { FinishedQueueSender } from './finishedQueueSender';
import { checkFinish, finishInput, loggerToDraft, startLogger, updateSet } from './loggerState';
import { SessionEnded, sessionBound, type SessionBound } from './sessionBound';
import { context, pushDay, types } from './testFixtures';

// The phone's saved sign-in: null while signed out, including while a sign-out finishes.
let mockSavedToken: string | null = null;
jest.mock('../../data/session', () => ({
  sessionToken: jest.fn(async () => mockSavedToken),
  forgetSessionTokenIf: jest.fn(async (_origin: string, token: string) => {
    if (mockSavedToken === token) mockSavedToken = null;
  }),
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  serverOrigin: () => 'https://relay.test',
}));

const FINISHED_SESSION = '0b6f8a52-5c1e-4f4e-9a57-2d0c1b7a9e31';

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

/** A finished workout of account u1, waiting in the phone's queue. */
function queueFinishedWorkout(storage: DraftStorage) {
  const now = new Date(2026, 10, 22, 9, 0).getTime();
  let state = startLogger(
    {
      template: pushDay,
      startCategory: 'push',
      startType: null,
      recommendationCategory: null,
      types,
      date: '2026-11-22',
      now,
      clientSessionId: FINISHED_SESSION,
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

/** What reached the server: each save with the token it was sent with. */
let requests: { token: string; payload: WorkoutInput }[];
let answer: (token: string) => Promise<TrackedWorkout>;
const saved = (id: string) => ({ id }) as TrackedWorkout;

/** The provider's queue for account u1, sending through the session it was created in. */
function queueFor(storage: DraftStorage, session: SessionBound) {
  const sender = new FinishedQueueSender({
    storage,
    userId: 'u1',
    send: (item) =>
      session.send((token) => {
        requests.push({ token, payload: item.pendingSave.payload });
        return answer(token);
      }),
    online: () => true,
    // As WorkoutProvider describes a failure.
    describe: (error) => ({
      status: error instanceof ApiError ? error.status : undefined,
      outdated: error instanceof ApiError && error.status === 426,
      message: error instanceof Error ? error.message : '',
    }),
    onSaved: () => undefined,
    onChange: () => undefined,
    setTimer: () => 0 as unknown as ReturnType<typeof setTimeout>,
    clearTimer: () => undefined,
  });
  return sender;
}

let storage: MemoryStorage;
beforeEach(() => {
  jest.clearAllMocks();
  storage = new MemoryStorage();
  requests = [];
  answer = async () => saved('workout-1');
  // Signed in as account u1.
  nextSessionEpoch();
  mockSavedToken = 'token-a';
});

const waiting = () => readFinishedWorkouts(storage).length;

describe('the finished-workout queue sends under its own session', () => {
  test('a finish queued under one account is never sent with no sign-in or as the next account', async () => {
    const queue = queueFor(storage, sessionBound());
    queueFinishedWorkout(storage);
    // Signing out deletes the token before the session ends.
    mockSavedToken = null;
    await queue.drain();
    expect(requests).toEqual([]);
    // Another account signs in, before this account's screens have gone.
    nextSessionEpoch();
    mockSavedToken = 'token-b';
    await queue.drain();
    expect(requests).toEqual([]);
    expect(waiting()).toBe(1);
    expect(queue.status().refusals).toEqual({});
  });

  test('signing out mid-send leaves the workout queued, not refused', async () => {
    const queue = queueFor(storage, sessionBound());
    queueFinishedWorkout(storage);
    answer = async () => {
      // The sign-out reaches the server first, which refuses the ended session.
      mockSavedToken = null;
      throw new ApiError(401, 'Sign in to continue.');
    };
    await queue.drain();
    expect(requests.map((request) => request.token)).toEqual(['token-a']);
    expect(waiting()).toBe(1);
    expect(queue.status().refusals).toEqual({});
    expect(forgetSessionTokenIf).toHaveBeenCalledWith('https://relay.test', 'token-a');
  });

  test('signing back in as the same account sends it once', async () => {
    const before = queueFor(storage, sessionBound());
    queueFinishedWorkout(storage);
    mockSavedToken = null;
    await before.drain();
    before.stop();
    // Signed in again: a new session, and the provider makes a new queue for it.
    nextSessionEpoch();
    mockSavedToken = 'token-a2';
    const after = queueFor(storage, sessionBound());
    await after.drain();
    await after.drain();
    expect(requests.map((request) => request.token)).toEqual(['token-a2']);
    expect(requests[0].payload.client_session_id).toBe(FINISHED_SESSION);
    expect(waiting()).toBe(0);
  });

  test('a refusal of the session still saved here forgets it, and the workout waits', async () => {
    const queue = queueFor(storage, sessionBound());
    queueFinishedWorkout(storage);
    answer = async () => {
      throw new ApiError(401, 'Sign in to continue.');
    };
    await queue.drain();
    expect(mockSavedToken).toBeNull();
    expect(waiting()).toBe(1);
    expect(queue.status().refusals).toEqual({});
  });

  test('other refusals stay refusals for review', async () => {
    const queue = queueFor(storage, sessionBound());
    queueFinishedWorkout(storage);
    answer = async () => {
      throw new ApiError(422, 'Workout date is invalid.');
    };
    await queue.drain();
    expect(Object.values(queue.status().refusals)).toEqual(['Workout date is invalid.']);
    expect(mockSavedToken).toBe('token-a');
  });
});

test("the server's refusal of this session tells the app, so it can show the sign-in form", async () => {
  const onEnded = jest.fn();
  const session = sessionBound({ onEnded });
  await expect(
    session.send(async () => {
      throw new ApiError(401, 'Sign in to continue.');
    }),
  ).rejects.toBeInstanceOf(SessionEnded);
  expect(onEnded).toHaveBeenCalledTimes(1);
  // A read's refusal tells it too; apiGet has already forgotten the sign-in itself.
  jest.mocked(forgetSessionTokenIf).mockClear();
  mockSavedToken = 'token-a';
  const reader = sessionBound({ onEnded });
  await expect(
    reader.read(async () => {
      throw new ApiError(401, 'Sign in to continue.');
    }),
  ).rejects.toBeInstanceOf(SessionEnded);
  expect(onEnded).toHaveBeenCalledTimes(2);
  expect(forgetSessionTokenIf).not.toHaveBeenCalled();
  // Other failures don't end the session.
  await expect(
    reader.send(async () => {
      throw new ApiError(422, 'Workout date is invalid.');
    }),
  ).rejects.toMatchObject({ status: 422 });
  expect(onEnded).toHaveBeenCalledTimes(2);
});

describe('reads for the session', () => {
  test('a reply that arrives after another sign-in is dropped', async () => {
    const session = sessionBound();
    await expect(
      session.read(async () => {
        nextSessionEpoch();
        return 'the next account';
      }),
    ).rejects.toBeInstanceOf(SessionEnded);
  });

  test('no read goes out without this session’s sign-in', async () => {
    const session = sessionBound();
    mockSavedToken = null;
    const read = jest.fn(async () => 'draft');
    await expect(session.read(read)).rejects.toBeInstanceOf(SessionEnded);
    expect(read).not.toHaveBeenCalled();
    mockSavedToken = 'token-a';
    await expect(session.read(read)).resolves.toBe('draft');
  });

  test('a session keeps its first token: a different saved token is another sign-in', async () => {
    const session = sessionBound();
    await session.send(async (token) => token);
    mockSavedToken = 'token-other';
    const write = jest.fn(async () => 'sent');
    await expect(session.send(write)).rejects.toBeInstanceOf(SessionEnded);
    expect(write).not.toHaveBeenCalled();
  });
});
