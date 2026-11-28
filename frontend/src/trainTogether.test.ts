import { describe, expect, it, vi } from 'vitest';
import { RECENT_WORKOUT_ACTIVITY_MS } from './activeWorkoutTimeout';
import {
  addPartnerMovement,
  addPartnerSet,
  exercisesToCopy,
  inviteCountdownLabel,
  inviteSecondsLeft,
  loggingForLabel,
  memberShortName,
  nameList,
  partnerConflictNotice,
  partners,
  partnerSetOnSameLift,
  partnerSummary,
  partnerThemeIds,
  PartnerWorkoutSync,
  removePartnerMovement,
  removePartnerSet,
  trainedWithLabel,
  trainInviteLink,
  trainInviteTokenFromHash,
  trainInviteTokenFromScan,
  trainTogetherNotice,
  updatePartnerSet,
  type TrainExercise,
  type TrainMember,
  type TrainPartnerWorkout,
  type TrainPartnerWriteResult,
  type TrainSession,
  type TrainTogetherRead,
} from './trainTogether';
import { isActiveWorkoutDraft, type ActiveWorkoutDraft, type StoredDraftSet } from './workoutDraft';

const NOW = Date.parse('2026-11-28T09:00:00Z');
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';

function set(key: string, fields: Partial<StoredDraftSet> = {}): StoredDraftSet {
  return {
    key,
    reps: 8,
    weight_kg: 60,
    rpe: null,
    rest_seconds: null,
    duration_seconds: null,
    distance_km: null,
    notes: null,
    completed: true,
    ...fields,
  };
}

function draft(fields: Partial<ActiveWorkoutDraft> = {}): ActiveWorkoutDraft {
  return {
    version: 1,
    clientSessionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    startedAt: NOW - 30 * 60_000,
    updatedAt: NOW - 5 * 60_000,
    lastActiveAt: NOW - 5 * 60_000,
    name: 'Push day',
    workoutDate: '2026-11-28',
    category: 'push',
    notes: '',
    movements: [
      {
        key: 'm1',
        exerciseId: 'their-bench',
        notes: '',
        machinePhotoIds: [],
        supersetKey: null,
        sets: [set('s1'), set('s2', { weight_kg: 62.5 })],
      },
      {
        key: 'm2',
        exerciseId: 'their-fly',
        notes: '',
        machinePhotoIds: [],
        supersetKey: null,
        sets: [set('s3', { completed: false })],
      },
    ],
    ...fields,
  };
}

function exercise(id: string, name: string, sameAs: string | null): TrainExercise {
  return {
    id,
    name,
    kind: 'strength',
    category: 'push',
    muscle_group: 'Chest',
    equipment: null,
    same_as_exercise_id: sameAs,
  };
}

const exercises = [
  exercise('their-bench', 'Bench Press', 'my-bench'),
  exercise('their-fly', 'Cable Fly', null),
];

function workout(value = draft()): TrainPartnerWorkout {
  return { revision: 3, draft: value, exercises };
}

function member(id: string, name: string, joined: number, fields: Partial<TrainMember> = {}) {
  return {
    user_id: id,
    username: name.toLowerCase(),
    display_name: name,
    photo_url: null,
    is_self: id === 'me',
    joined_at: new Date(NOW + joined * 60_000).toISOString(),
    workout: null,
    ...fields,
  } satisfies TrainMember;
}

function session(id: string, members: TrainMember[]): TrainSession {
  return {
    id,
    started_at: new Date(NOW).toISOString(),
    expires_at: new Date(NOW + 12 * 3_600_000).toISOString(),
    created_by: members[0].user_id,
    max_members: 4,
    members,
  };
}

const read = (value: TrainSession | null, ended: TrainTogetherRead['ended'] = null) => ({
  session: value,
  ended,
});

describe('train-together links', () => {
  it('reads back the token from a link, its hash and a scan on any Relay address', () => {
    const link = trainInviteLink(TOKEN, 'https://gym.example.com');
    expect(link).toBe(`https://gym.example.com/#train=${TOKEN}`);
    expect(trainInviteTokenFromHash(new URL(link).hash)).toBe(TOKEN);
    expect(trainInviteTokenFromScan(`  http://127.0.0.1:8000/#train=${TOKEN} `)).toBe(TOKEN);
  });

  it('rejects anything that is not a train-together link', () => {
    for (const text of [
      'not a url',
      `javascript:alert(1)#train=${TOKEN}`,
      'https://gym.example.com/#train=short',
      `https://gym.example.com/#train=${TOKEN}&x=1`,
      `https://gym.example.com/#friend=${TOKEN}`,
      `https://gym.example.com/#train=${'a'.repeat(65)}`,
    ])
      expect(trainInviteTokenFromScan(text)).toBeNull();
  });
});

describe('partners and colours', () => {
  it('lists the members who are not the caller, in the server order', () => {
    const value = session('s', [
      member('me', 'Me', 0),
      member('a', 'Sam', 1),
      member('b', 'Priya', 2),
    ]);
    expect(partners(value).map((item) => item.user_id)).toEqual(['a', 'b']);
    expect(partners(null)).toEqual([]);
  });

  it('gives partners the fixed colour order without the caller’s own theme, wrapping', () => {
    expect(partnerThemeIds('blue', 3)).toEqual(['plum', 'amber', 'coral']);
    expect(partnerThemeIds('plum', 3)).toEqual(['amber', 'coral', 'emerald']);
    expect(partnerThemeIds('blue', 5)).toEqual(['plum', 'amber', 'coral', 'emerald', 'plum']);
    expect(partnerThemeIds('blue', 0)).toEqual([]);
  });

  it('shortens a name to its first word for tight controls', () => {
    expect(memberShortName({ display_name: 'Alex Morgan', username: 'alex' })).toBe('Alex');
    expect(memberShortName({ display_name: '  Priya  ', username: 'p' })).toBe('Priya');
    expect(memberShortName({ display_name: 'Maximilianusbartholomew Jr', username: 'm' })).toBe(
      'Maximilianusbart',
    );
    expect(memberShortName({ display_name: '   ', username: 'sam' })).toBe('sam');
    expect(memberShortName({ display_name: null, username: null })).toBe('Your partner');
  });

  it('joins names the same way everywhere', () => {
    expect(nameList(['Sam'])).toBe('Sam');
    expect(nameList(['Sam', 'Priya'])).toBe('Sam & Priya');
    expect(nameList(['Sam', 'Priya', 'Dev'])).toBe('Sam, Priya & Dev');
  });
});

describe('what the live strip shows', () => {
  it('summarises the movement the partner is on and the whole workout', () => {
    expect(partnerSummary(workout(), NOW)).toEqual({
      movementKey: 'm1',
      exerciseId: 'their-bench',
      exercise: exercises[0],
      name: 'Bench Press',
      setsDone: 2,
      lastSet: { weight_kg: 62.5, reps: 8, duration_seconds: null, distance_km: null },
      totalSetsDone: 2,
      minutesSinceActive: 5,
    });
  });

  it('uses the first movement before any set is done, and cardio fields for cardio', () => {
    const fresh = draft();
    fresh.movements = fresh.movements.map((movement) => ({
      ...movement,
      sets: movement.sets.map((item) => ({ ...item, completed: false })),
    }));
    const summary = partnerSummary(workout(fresh), NOW);
    expect(summary).toMatchObject({
      movementKey: 'm1',
      setsDone: 0,
      lastSet: null,
      totalSetsDone: 0,
    });
    const cardio = draft();
    cardio.movements[1].sets = [
      set('run', { reps: null, weight_kg: null, duration_seconds: 600, distance_km: 2 }),
    ];
    expect(partnerSummary(workout(cardio), NOW)).toMatchObject({
      movementKey: 'm2',
      name: 'Cable Fly',
      lastSet: { duration_seconds: 600, distance_km: 2, weight_kg: null, reps: null },
      totalSetsDone: 3,
    });
    expect(partnerSummary(workout(draft({ movements: [] })), NOW)).toMatchObject({
      movementKey: null,
      name: 'Exercise',
    });
  });

  it('finds the partner’s latest set on the caller’s own lift', () => {
    expect(partnerSetOnSameLift(workout(), 'my-bench')).toEqual({
      movementKey: 'm1',
      exercise: exercises[0],
      set: set('s2', { weight_kg: 62.5 }),
    });
    expect(partnerSetOnSameLift(workout(), 'my-squat')).toBeNull();
  });

  it('copies the caller’s matching exercises in the partner’s order, naming the rest', () => {
    const value = draft();
    value.movements.push({ ...value.movements[0], key: 'm3' });
    expect(exercisesToCopy(workout(value))).toEqual({
      exerciseIds: ['my-bench'],
      unmatched: ['Cable Fly'],
    });
  });
});

describe('editing a partner’s draft', () => {
  const later = NOW + 60_000;

  it('touches the activity times and never moves the finish time earlier', () => {
    const value = draft({ inactiveFinishAt: NOW + 2 * 3_600_000 });
    const edited = updatePartnerSet(value, 'm1', 's1', { reps: 10 }, later);
    expect(edited.updatedAt).toBe(later);
    expect(edited.lastActiveAt).toBe(later);
    expect(edited.inactiveFinishAt).toBe(NOW + 2 * 3_600_000);
    const late = draft({ inactiveFinishAt: NOW });
    expect(updatePartnerSet(late, 'm1', 's1', { reps: 10 }, later).inactiveFinishAt).toBe(
      later + RECENT_WORKOUT_ACTIVITY_MS,
    );
    // Without an owner's cutoff, the usual one from the start time applies.
    const unset = updatePartnerSet(draft(), 'm1', 's1', { reps: 10 }, later);
    expect(unset.inactiveFinishAt).toBeGreaterThanOrEqual(draft().startedAt + 3_600_000);
  });

  it('changes a set without mutating, keeping fields it does not know', () => {
    const value = draft();
    (value.movements[0].sets[0] as StoredDraftSet & { partial_reps: number }).partial_reps = 2;
    (value.movements[0] as (typeof value.movements)[0] & { future: string }).future = 'kept';
    const snapshot = structuredClone(value);
    const edited = updatePartnerSet(value, 'm1', 's1', { reps: 12, completed: true }, later);
    expect(value).toEqual(snapshot);
    expect(edited.movements[0].sets[0]).toMatchObject({ key: 's1', reps: 12, partial_reps: 2 });
    expect(edited.movements[0]).toMatchObject({ future: 'kept' });
    expect(edited.movements[1]).toBe(value.movements[1]);
  });

  it('adds a set with the previous weight and reps, not completed', () => {
    const edited = addPartnerSet(draft(), 'm1', 's9', later);
    expect(edited.movements[0].sets.at(-1)).toEqual(
      set('s9', { weight_kg: 62.5, completed: false }),
    );
    expect(addPartnerSet(edited, 'm1', 's9', later)).toBe(edited);
  });

  it('removes sets and movements, and adds a movement with one empty set', () => {
    const value = draft();
    expect(
      removePartnerSet(value, 'm1', 's1', later).movements[0].sets.map((item) => item.key),
    ).toEqual(['s2']);
    expect(removePartnerMovement(value, 'm2', later).movements.map((item) => item.key)).toEqual([
      'm1',
    ]);
    const added = addPartnerMovement(
      value,
      'their-row',
      { movementKey: 'm9', setKey: 's9' },
      later,
    );
    expect(added.movements.at(-1)).toEqual({
      key: 'm9',
      exerciseId: 'their-row',
      notes: '',
      machinePhotoIds: [],
      supersetKey: null,
      sets: [set('s9', { reps: null, weight_kg: null, completed: false })],
    });
    expect(added.updatedAt).toBe(later);
  });

  it('does not add an exercise the workout already has', () => {
    const value = draft();
    expect(addPartnerMovement(value, 'their-bench', { movementKey: 'm9', setKey: 's9' }, NOW)).toBe(
      value,
    );
  });

  it('only ever produces drafts the owner’s app can read back', () => {
    const empty = draft({ movements: [] });
    const noSets = draft();
    noSets.movements = [{ ...noSets.movements[0], sets: [] }];
    const keys = { movementKey: 'm9', setKey: 's9' };
    const produced = [
      updatePartnerSet(draft(), 'm1', 's1', { reps: 10 }, NOW),
      addPartnerSet(draft(), 'm1', 's9', NOW),
      addPartnerSet(noSets, 'm1', 's9', NOW),
      removePartnerSet(draft(), 'm1', 's1', NOW),
      removePartnerMovement(draft(), 'm2', NOW),
      addPartnerMovement(empty, 'their-row', keys, NOW),
      addPartnerMovement(noSets, 'their-row', keys, NOW),
      addPartnerMovement(draft(), 'their-row', keys, NOW),
    ];
    for (const value of produced) expect(isActiveWorkoutDraft(value)).toBe(true);
  });

  it('returns the same draft when there is nothing to change', () => {
    const value = draft();
    expect(updatePartnerSet(value, 'missing', 's1', { reps: 1 }, later)).toBe(value);
    expect(updatePartnerSet(value, 'm1', 'missing', { reps: 1 }, later)).toBe(value);
    expect(removePartnerSet(value, 'm1', 'missing', later)).toBe(value);
    expect(removePartnerMovement(value, 'missing', later)).toBe(value);
    expect(addPartnerMovement(value, 'x', { movementKey: 'm1', setKey: 'n' }, later)).toBe(value);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('PartnerWorkoutSync', () => {
  const answer = (revision: number, value: ActiveWorkoutDraft, conflict = false) =>
    ({ revision, draft: value, conflict, exercises }) satisfies TrainPartnerWriteResult;

  it('sends one request at a time and replays later edits on the server’s answer', async () => {
    const first = deferred<TrainPartnerWriteResult>();
    const second = deferred<TrainPartnerWriteResult>();
    const put = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const changed = vi.fn();
    const base = draft();
    const sync = new PartnerWorkoutSync({ put, changed }, { revision: 3, draft: base });

    const done = sync.edit((value) => updatePartnerSet(value, 'm1', 's1', { reps: 9 }, NOW));
    const sent = sync.current.draft!;
    void sync.edit((value) => addPartnerSet(value, 'm1', 's9', NOW));
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenLastCalledWith({ revision: 3, base, draft: sent });

    // The server merged someone else's change into the first edit.
    first.resolve(answer(4, { ...sent, notes: 'merged elsewhere' }));
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    const queued = put.mock.calls[1][0];
    expect(queued.revision).toBe(4);
    expect(queued.base).toEqual({ ...sent, notes: 'merged elsewhere' });
    expect(queued.draft.notes).toBe('merged elsewhere');
    expect(queued.draft.movements[0].sets.map((item: StoredDraftSet) => item.key)).toEqual([
      's1',
      's2',
      's9',
    ]);

    const merged = queued.draft;
    second.resolve(answer(5, merged));
    await done;
    await vi.waitFor(() => expect(sync.current.status).toBe('synced'));
    expect(sync.current).toMatchObject({ revision: 5, draft: merged, notApplied: false });
    expect(sync.unsent).toBe(false);
  });

  it('takes the server’s copy on a conflict and says the edit was not applied', async () => {
    const remote = draft({ notes: 'theirs' });
    const put = vi.fn().mockResolvedValue(answer(7, remote, true));
    const changed = vi.fn();
    const sync = new PartnerWorkoutSync({ put, changed }, { revision: 3, draft: draft() });
    await sync.edit((value) => removePartnerSet(value, 'm1', 's1', NOW));
    expect(sync.current).toMatchObject({
      status: 'conflict',
      notApplied: true,
      revision: 7,
      draft: remote,
    });
    expect(changed).toHaveBeenLastCalledWith(sync.current);
  });

  it('keeps a failed edit and sends it again on retry', async () => {
    const failure = new Error('offline');
    const put = vi.fn().mockRejectedValueOnce(failure);
    const sync = new PartnerWorkoutSync({ put, changed: vi.fn() }, { revision: 3, draft: draft() });
    await sync.edit((value) => removePartnerSet(value, 'm1', 's1', NOW));
    expect(sync.current).toMatchObject({ status: 'failed', error: failure });
    expect(sync.unsent).toBe(true);
    const edited = sync.current.draft!;
    put.mockResolvedValueOnce(answer(4, edited));
    await sync.retry();
    expect(put).toHaveBeenLastCalledWith({ revision: 3, base: draft(), draft: edited });
    expect(sync.current).toMatchObject({ status: 'synced', revision: 4, error: null });
  });

  it('adopts a newer server copy only when nothing is unsent', async () => {
    const put = vi.fn().mockRejectedValue(new Error('offline'));
    const sync = new PartnerWorkoutSync({ put, changed: vi.fn() }, { revision: 3, draft: draft() });
    const newer = draft({ notes: 'newer' });
    sync.refresh({ revision: 2, draft: newer });
    expect(sync.current.revision).toBe(3);
    sync.refresh({ revision: 4, draft: newer });
    expect(sync.current).toMatchObject({ revision: 4, draft: newer });

    await sync.edit((value) => removePartnerSet(value, 'm1', 's1', NOW));
    const kept = sync.current.draft;
    sync.refresh({ revision: 5, draft: draft({ notes: 'even newer' }) });
    expect(sync.current.draft).toBe(kept);
    // The partner started another workout: the unsent edit belonged to the one that ended.
    const other = draft({ clientSessionId: '0b9d1a3e-5a43-4c3f-9e2b-6f1d2c3b4a59' });
    sync.refresh({ revision: 6, draft: other });
    expect(sync.current).toMatchObject({ revision: 6, draft: other, status: 'synced' });
    expect(sync.unsent).toBe(false);
  });

  it('replays edits made after a refused request on the server’s copy, and sends them', async () => {
    const first = deferred<TrainPartnerWriteResult>();
    const put = vi.fn().mockReturnValueOnce(first.promise);
    const changed = vi.fn();
    const sync = new PartnerWorkoutSync({ put, changed }, { revision: 3, draft: draft() });
    void sync.edit((value) => updatePartnerSet(value, 'm1', 's1', { reps: 9 }, NOW));
    // Logged while the first request is still on its way.
    const done = sync.edit((value) => addPartnerSet(value, 'm1', 's9', NOW));
    const remote = draft();
    remote.movements[0].sets[0] = set('s1', { reps: 12 });
    put.mockImplementationOnce(async (change: { draft: ActiveWorkoutDraft }) =>
      answer(8, change.draft),
    );
    first.resolve(answer(7, remote, true));
    await done;
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    const replayed = put.mock.calls[1][0];
    expect(replayed.revision).toBe(7);
    expect(replayed.base).toBe(remote);
    // The refused reps stay as the server has them; the later set is still sent.
    expect(
      replayed.draft.movements[0].sets.map((item: StoredDraftSet) => [item.key, item.reps]),
    ).toEqual([
      ['s1', 12],
      ['s2', 8],
      ['s9', 8],
    ]);
    expect(
      changed.mock.calls.some(([state]) => state.status === 'conflict' && state.notApplied),
    ).toBe(true);
    await vi.waitFor(() => expect(sync.current.status).toBe('synced'));
    expect(sync.current).toMatchObject({ revision: 8, notApplied: true });
    expect(sync.unsent).toBe(false);
  });

  it('applies the newest copy read during a request once the queue settles', async () => {
    const first = deferred<TrainPartnerWriteResult>();
    const put = vi.fn().mockReturnValueOnce(first.promise);
    const sync = new PartnerWorkoutSync({ put, changed: vi.fn() }, { revision: 3, draft: draft() });
    const done = sync.edit((value) => updatePartnerSet(value, 'm1', 's1', { reps: 9 }, NOW));
    const sent = sync.current.draft!;
    const newer = { ...sent, notes: 'owner edited after' };
    sync.refresh({ revision: 5, draft: newer });
    sync.refresh({ revision: 4, draft: draft() }); // older than the one already kept
    expect(sync.current.draft).toBe(sent);
    first.resolve(answer(4, sent));
    await done;
    expect(sync.current).toMatchObject({ revision: 5, draft: newer, status: 'synced' });
    expect(put).toHaveBeenCalledTimes(1);
  });

  it.each(['answer', 'failure'])(
    'ignores the %s of a request for a workout the partner has since replaced',
    async (outcome) => {
      const first = deferred<TrainPartnerWriteResult>();
      const put = vi.fn().mockReturnValueOnce(first.promise);
      const sync = new PartnerWorkoutSync(
        { put, changed: vi.fn() },
        { revision: 3, draft: draft() },
      );
      const done = sync.edit((value) => removePartnerSet(value, 'm1', 's1', NOW));
      const other = draft({ clientSessionId: '0b9d1a3e-5a43-4c3f-9e2b-6f1d2c3b4a59' });
      sync.refresh({ revision: 4, draft: other });
      if (outcome === 'answer') first.resolve(answer(4, draft({ notes: 'old workout' })));
      else first.reject(new Error('offline'));
      await done;
      expect(sync.current).toMatchObject({
        revision: 4,
        draft: other,
        status: 'synced',
        error: null,
      });
      expect(put).toHaveBeenCalledTimes(1);
    },
  );

  it('does nothing after stop', async () => {
    const put = vi.fn();
    const changed = vi.fn();
    const sync = new PartnerWorkoutSync({ put, changed }, { revision: 3, draft: draft() });
    sync.stop();
    await sync.edit((value) => removePartnerSet(value, 'm1', 's1', NOW));
    expect(put).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('wording', () => {
  it('counts down a code in minutes and seconds, never below zero', () => {
    const expires = new Date(NOW + 272_400).toISOString();
    expect(inviteSecondsLeft(expires, NOW)).toBe(273);
    expect(inviteCountdownLabel(inviteSecondsLeft(expires, NOW))).toBe('4:33');
    expect(inviteCountdownLabel(7)).toBe('0:07');
    expect(inviteCountdownLabel(300)).toBe('5:00');
    expect(inviteSecondsLeft(NOW - 1_000, NOW)).toBe(0);
    expect(inviteSecondsLeft('not a date', NOW)).toBe(0);
    expect(inviteCountdownLabel(-3)).toBe('0:00');
  });

  it('labels who a saved workout was trained with', () => {
    const sam = { user_id: 'a', display_name: 'Sam', username: 'sam', photo_url: null };
    const priya = { user_id: 'b', display_name: '', username: 'priya', photo_url: null };
    const dev = { user_id: 'c', display_name: 'Dev', username: 'dev', photo_url: null };
    const me = { user_id: 'me', display_name: 'Me', username: 'me', photo_url: null };
    expect(trainedWithLabel([], 0, 'me')).toBeNull();
    expect(trainedWithLabel(undefined, undefined, 'me')).toBeNull();
    expect(trainedWithLabel([sam], 1, 'me')).toBe('with Sam');
    expect(trainedWithLabel([sam, priya], 2, 'me')).toBe('with Sam & priya');
    expect(trainedWithLabel([sam, priya, dev], 3, 'me')).toBe('with Sam, priya & Dev');
    expect(trainedWithLabel([priya, me], 2, 'me')).toBe('with You & priya');
    expect(trainedWithLabel([sam], 2, 'me')).toBe('with Sam & 1 other');
    expect(trainedWithLabel([sam], 3, 'me')).toBe('with Sam & 2 others');
    expect(trainedWithLabel([], 1, 'me')).toBe('with 1 other');
    expect(trainedWithLabel([], 2, 'me')).toBe('with 2 others');
  });

  it('shares the logging and conflict texts', () => {
    expect(loggingForLabel('Sam')).toBe('Logging for Sam');
    expect(partnerConflictNotice('Sam')).toBe(
      "Sam's workout changed. Your last edit wasn't applied.",
    );
  });
});

describe('trainTogetherNotice', () => {
  const me = member('me', 'Me', 0);
  const sam = member('a', 'Sam', 1);
  const priya = member('b', 'Priya', 2);

  it('announces nothing on the first read or when nothing changed', () => {
    const value = read(session('s1', [me, sam]));
    expect(trainTogetherNotice(null, value)).toBeNull();
    expect(trainTogetherNotice(value, value)).toBeNull();
    expect(trainTogetherNotice(read(null), read(null))).toBeNull();
  });

  it('says who you are training with when you join', () => {
    const joiner = member('me', 'Me', 5);
    expect(trainTogetherNotice(read(null), read(session('s1', [joiner, sam])))).toBe(
      'Training with Sam',
    );
    expect(trainTogetherNotice(read(null), read(session('s1', [joiner, sam, priya])))).toBe(
      'Training with Sam & Priya',
    );
    // Showing a code alone announces nothing yet.
    expect(trainTogetherNotice(read(null), read(session('s1', [me])))).toBeNull();
  });

  it('says who joined or left a session you are in', () => {
    const waiting = read(session('s1', [me]));
    expect(trainTogetherNotice(waiting, read(session('s1', [me, sam])))).toBe('Sam joined');
    // The inviter's first read after showing a code, already with the partner in it.
    expect(trainTogetherNotice(read(null), read(session('s1', [me, sam])))).toBe('Sam joined');
    const three = read(session('s1', [me, sam, priya]));
    expect(trainTogetherNotice(read(session('s1', [me, sam])), three)).toBe('Priya joined');
    expect(trainTogetherNotice(three, read(session('s1', [me, sam])))).toBe('Priya left');
  });

  it('uses the ended reason once, for the session that ended', () => {
    const before = read(session('s1', [me, sam]));
    const ended = (reason: string, by: string | null) =>
      read(null, { session_id: 's1', reason, by_user_id: by, by_name: by ? 'Sam' : null });
    expect(trainTogetherNotice(before, ended('finished', 'a'))).toBe('Sam finished their workout');
    expect(trainTogetherNotice(before, ended('left', 'a'))).toBe('Sam left');
    expect(trainTogetherNotice(before, ended('discarded', 'a'))).toBe('Sam left');
    expect(trainTogetherNotice(before, ended('expired', null))).toBe('Training together ended');
    expect(trainTogetherNotice(before, ended('unfriended', 'a'))).toBe('Training together ended');
    expect(trainTogetherNotice(before, ended('left', 'me'))).toBe('Training together ended');
    expect(trainTogetherNotice(before, ended('something new', null))).toBe(
      'Training together ended',
    );
    // The next read still carries `ended`, but there is no session left to announce.
    expect(trainTogetherNotice(ended('finished', 'a'), ended('finished', 'a'))).toBeNull();
  });
});
