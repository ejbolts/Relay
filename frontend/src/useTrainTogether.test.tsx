// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import {
  addPartnerSet,
  TRAIN_ERRORS,
  updatePartnerSet,
  type TrainSession,
  type TrainTogetherRead,
} from './trainTogether';
import { TRAIN_TOGETHER_CHANGED } from './trainTogetherInvite';
import { useTrainTogether, type TrainTogetherController } from './useTrainTogether';
import type { ActiveWorkoutDraft } from './workoutDraft';

function makeDraft(overrides: Partial<ActiveWorkoutDraft> = {}): ActiveWorkoutDraft {
  return {
    version: 1,
    clientSessionId: '11111111-1111-4111-8111-111111111111',
    startedAt: Date.now() - 60_000,
    updatedAt: Date.now() - 10_000,
    lastActiveAt: Date.now() - 10_000,
    name: 'Push day',
    workoutDate: '2026-11-28',
    category: 'push',
    notes: '',
    movements: [
      {
        key: 'mov-1',
        exerciseId: 'ex-bench',
        notes: '',
        machinePhotoIds: [],
        supersetKey: null,
        sets: [
          {
            key: 'set-1',
            reps: 8,
            weight_kg: 80,
            rpe: 8,
            rest_seconds: null,
            duration_seconds: null,
            distance_km: null,
            notes: null,
            completed: false,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeSession(revision = 1, draft: ActiveWorkoutDraft | null = makeDraft()): TrainSession {
  return {
    id: 'sess-1',
    started_at: '2026-11-28T08:00:00Z',
    expires_at: '2026-11-28T20:00:00Z',
    created_by: 'u-self',
    max_members: 4,
    members: [
      {
        user_id: 'u-self',
        username: 'alex',
        display_name: 'Alex',
        photo_url: null,
        is_self: true,
        joined_at: '2026-11-28T08:00:00Z',
        workout: null,
      },
      {
        user_id: 'u-sam',
        username: 'sam',
        display_name: 'Sam',
        photo_url: null,
        is_self: false,
        joined_at: '2026-11-28T08:01:00Z',
        workout: draft
          ? {
              revision,
              draft,
              exercises: [
                {
                  id: 'ex-bench',
                  name: 'Bench Press',
                  kind: 'strength',
                  category: 'push',
                  muscle_group: 'Chest',
                  equipment: 'Barbell',
                  same_as_exercise_id: 'my-bench',
                },
              ],
            }
          : null,
      },
    ],
  };
}

let container: HTMLDivElement;
let root: Root;
let latest: TrainTogetherController;
const notices: string[] = [];

function Harness({ userId, confirmed = true }: { userId: string | null; confirmed?: boolean }) {
  latest = useTrainTogether(userId, (message) => notices.push(message), { confirmed });
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  notices.length = 0;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useTrainTogether', () => {
  it('loads silently on first read, announces partner join via socket event, and suppresses own leave', async () => {
    const readSpy = vi
      .spyOn(api.trainTogether, 'read')
      .mockResolvedValueOnce({ session: null, ended: null })
      .mockResolvedValueOnce({ session: makeSession(), ended: null });
    const leaveSpy = vi.spyOn(api.trainTogether, 'leave').mockResolvedValueOnce({
      session: null,
      ended: {
        session_id: 'sess-1',
        reason: 'left',
        by_user_id: 'u-self',
        by_name: 'Alex',
      },
    });

    await act(async () => root.render(<Harness userId="u-self" />));
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(notices).toEqual([]);

    await act(async () => {
      window.dispatchEvent(new Event(TRAIN_TOGETHER_CHANGED));
    });
    expect(readSpy).toHaveBeenCalledTimes(2);
    expect(latest.partners).toHaveLength(1);
    expect(notices).toEqual(['Sam joined']);

    await act(async () => {
      await latest.leave();
    });
    expect(leaveSpy).toHaveBeenCalledOnce();
    expect(latest.session).toBeNull();
    // No toast for own leave action.
    expect(notices).toEqual(['Sam joined']);
  });

  it('drops responses arriving after sign-out or account switch', async () => {
    let resolveFirst!: (value: TrainTogetherRead) => void;
    vi.spyOn(api.trainTogether, 'read').mockImplementationOnce(
      () => new Promise<TrainTogetherRead>((resolve) => (resolveFirst = resolve)),
    );

    await act(async () => root.render(<Harness userId="u-first" />));
    // Sign out before the first request resolves.
    await act(async () => root.render(<Harness userId={null} />));
    await act(async () => {
      resolveFirst({ session: makeSession(), ended: null });
    });

    expect(latest.session).toBeNull();
    expect(latest.partners).toEqual([]);
    expect(notices).toEqual([]);
  });

  it('syncs partner edits and reports server conflicts through the notice callback', async () => {
    const initialDraft = makeDraft();
    const serverDraft = makeDraft({ updatedAt: Date.now() + 5000 });
    vi.spyOn(api.trainTogether, 'read').mockResolvedValue({
      session: makeSession(2, initialDraft),
      ended: null,
    });
    const putSpy = vi.spyOn(api.trainTogether, 'changePartnerWorkout').mockResolvedValueOnce({
      revision: 3,
      draft: serverDraft,
      conflict: true,
      exercises: [],
    });

    await act(async () => root.render(<Harness userId="u-self" />));
    expect(latest.partnerAcknowledgedDrafts['u-sam']).toEqual(initialDraft);

    await act(async () => {
      await latest.editPartnerWorkout('u-sam', (draft) =>
        updatePartnerSet(draft, 'mov-1', 'set-1', { reps: 10 }, Date.now()),
      );
    });

    expect(putSpy).toHaveBeenCalledOnce();
    expect(notices).toEqual(["Sam's workout changed. Your last edit wasn't applied."]);
    expect(latest.partnerSyncStates['u-sam']?.status).toBe('conflict');
  });

  it('orders session reads and ignores pre-join and pre-leave reads (finding 1)', async () => {
    let resolvePreJoin!: (value: TrainTogetherRead) => void;
    let resolvePreLeave!: (value: TrainTogetherRead) => void;
    const readSpy = vi
      .spyOn(api.trainTogether, 'read')
      .mockImplementationOnce(() => new Promise((resolve) => (resolvePreJoin = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolvePreLeave = resolve)));
    vi.spyOn(api.trainTogether, 'join').mockResolvedValueOnce({
      session: makeSession(1, makeDraft()),
      ended: null,
    });
    let resolveFirstPut!: (value: {
      revision: number;
      draft: ActiveWorkoutDraft | null;
      conflict: boolean;
      exercises: [];
    }) => void;
    const putSpy = vi
      .spyOn(api.trainTogether, 'changePartnerWorkout')
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirstPut = resolve)))
      .mockImplementationOnce(async (_id, change) => ({
        revision: 3,
        draft: change.draft,
        conflict: false,
        exercises: [],
      }));

    await act(async () => root.render(<Harness userId="u-self" />));
    expect(readSpy).toHaveBeenCalledTimes(1);

    // Join Sam while the initial GET is still in flight.
    await act(async () => {
      await latest.join('AbCdEfGhIjKlMnOpQrStUvWx');
    });
    expect(latest.partners).toHaveLength(1);

    // Start first partner edit (in flight), then queue a second edit.
    let firstEditPromise!: Promise<void>;
    await act(async () => {
      firstEditPromise = latest.editPartnerWorkout('u-sam', (draft) =>
        updatePartnerSet(draft, 'mov-1', 'set-1', { reps: 10 }, 1000),
      );
      void latest.editPartnerWorkout('u-sam', (draft) =>
        updatePartnerSet(draft, 'mov-1', 'set-1', { completed: true }, 2000),
      );
    });

    // Deliver the older pre-join GET (no session): must NOT dispose Sam's sync queue.
    await act(async () => {
      resolvePreJoin({ session: null, ended: null });
    });
    expect(latest.partners).toHaveLength(1);

    // Now finish the first PUT; the queued second edit must still be sent.
    await act(async () => {
      const sentDraft = putSpy.mock.calls[0][1].draft;
      resolveFirstPut({ revision: 2, draft: sentDraft, conflict: false, exercises: [] });
      await firstEditPromise;
    });
    expect(putSpy).toHaveBeenCalledTimes(2);
    expect(putSpy.mock.calls[1][1].draft.movements[0].sets[0].completed).toBe(true);

    // Reverse race on leave: start a GET, leave the session, then deliver the stale GET with Sam.
    notices.length = 0;
    await act(async () => {
      void latest.refresh();
    });
    vi.spyOn(api.trainTogether, 'leave').mockResolvedValueOnce({
      session: null,
      ended: { session_id: 'sess-1', reason: 'left', by_user_id: 'u-self', by_name: 'Alex' },
    });
    await act(async () => {
      await latest.leave();
    });
    expect(latest.session).toBeNull();

    await act(async () => {
      resolvePreLeave({ session: makeSession(4, makeDraft()), ended: null });
    });
    expect(latest.session).toBeNull();
    expect(latest.partners).toEqual([]);
    expect(notices).toEqual([]);
  });

  it('drops mismatched is_self reads and waits for account confirmation (finding 3)', async () => {
    const readSpy = vi.spyOn(api.trainTogether, 'read').mockResolvedValueOnce({
      session: makeSession(1, makeDraft()), // is_self is 'u-self'
      ended: null,
    });

    // Unconfirmed account: should not start reading yet.
    await act(async () => root.render(<Harness userId="u-other" confirmed={false} />));
    expect(readSpy).not.toHaveBeenCalled();

    // Confirmed as 'u-other', but server returned a session whose is_self is 'u-self': drop it.
    await act(async () => root.render(<Harness userId="u-other" confirmed={true} />));
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(latest.session).toBeNull();
    expect(latest.partners).toEqual([]);
    expect(latest.partnerSyncStates).toEqual({});
    expect(notices).toEqual([]);
  });

  it('stops synchronizers and ignores late results on unmount (finding 4)', async () => {
    let resolveJoin!: (value: TrainTogetherRead) => void;
    vi.spyOn(api.trainTogether, 'read').mockResolvedValueOnce({
      session: makeSession(1, makeDraft()),
      ended: null,
    });
    vi.spyOn(api.trainTogether, 'join').mockImplementationOnce(
      () => new Promise((resolve) => (resolveJoin = resolve)),
    );
    let resolvePut!: (value: {
      revision: number;
      draft: ActiveWorkoutDraft | null;
      conflict: boolean;
      exercises: [];
    }) => void;
    vi.spyOn(api.trainTogether, 'changePartnerWorkout').mockImplementationOnce(
      () => new Promise((resolve) => (resolvePut = resolve)),
    );

    await act(async () => root.render(<Harness userId="u-self" />));
    let joinPromise!: Promise<TrainTogetherRead | null>;
    await act(async () => {
      void latest.editPartnerWorkout('u-sam', (draft) =>
        updatePartnerSet(draft, 'mov-1', 'set-1', { reps: 12 }, 1000),
      );
      joinPromise = latest.join('AbCdEfGhIjKlMnOpQrStUvWx');
    });

    // Unmount (as AuthGate does on keyed account teardown).
    await act(async () => root.unmount());
    // Recreate root for afterEach cleanup.
    root = createRoot(container);

    // Late conflict and late join after unmount must not fire notices or return stale data.
    await act(async () => {
      resolvePut({ revision: 2, draft: makeDraft(), conflict: true, exercises: [] });
      resolveJoin({ session: makeSession(3, makeDraft()), ended: null });
    });
    expect(await joinPromise).toBeNull();
    expect(notices).toEqual([]);
  });

  it('drops held and in-flight invites when switching sessions (finding 9)', async () => {
    let resolveInvite!: (value: { token: string; expires_at: string; session_id: string }) => void;
    const soloSession: TrainSession = {
      ...makeSession(),
      id: 'sess-solo',
      members: [makeSession().members[0]],
    };
    vi.spyOn(api.trainTogether, 'read')
      .mockResolvedValueOnce({ session: null, ended: null })
      .mockResolvedValue({ session: soloSession, ended: null });
    vi.spyOn(api.trainTogether, 'invite')
      .mockResolvedValueOnce({
        token: 'SoloInviteToken1234567890',
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        session_id: 'sess-solo',
      })
      .mockImplementationOnce(() => new Promise((resolve) => (resolveInvite = resolve)));
    vi.spyOn(api.trainTogether, 'join').mockResolvedValue({
      session: { ...makeSession(), id: 'sess-sam' },
      ended: null,
    });

    await act(async () => root.render(<Harness userId="u-self" />));
    await act(async () => {
      await latest.createInvite();
    });
    expect(latest.invite?.session_id).toBe('sess-solo');

    // Join Sam's different session: solo invite must be cleared.
    await act(async () => {
      await latest.join('SamInviteToken1234567890');
    });
    expect(latest.session?.id).toBe('sess-sam');
    expect(latest.invite).toBeNull();

    // Start an invite POST, switch sessions while it is in flight, then resolve the old invite.
    vi.spyOn(api.trainTogether, 'join').mockResolvedValueOnce({
      session: { ...makeSession(), id: 'sess-third' },
      ended: null,
    });
    let inFlightInvite!: Promise<unknown>;
    await act(async () => {
      inFlightInvite = latest.createInvite();
      await latest.join('ThirdInviteToken12345678');
    });
    await act(async () => {
      resolveInvite({
        token: 'LateInviteToken1234567890',
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        session_id: 'sess-sam',
      });
      await inFlightInvite;
    });
    expect(latest.session?.id).toBe('sess-third');
    expect(latest.invite).toBeNull();
  });

  it('removes synchronizer on empty reads and adopts a lower-revision new workout (finding 10)', async () => {
    const firstDraft = makeDraft({ clientSessionId: '11111111-1111-4111-8111-111111111111' });
    const replacementDraft = makeDraft({
      clientSessionId: '22222222-2222-4222-8222-222222222222',
      name: 'Pull day',
    });
    vi.spyOn(api.trainTogether, 'read')
      .mockResolvedValueOnce({ session: makeSession(2, firstDraft), ended: null })
      .mockResolvedValueOnce({ session: makeSession(2, null), ended: null })
      .mockResolvedValueOnce({ session: makeSession(2, null), ended: null })
      .mockResolvedValueOnce({ session: makeSession(1, replacementDraft), ended: null });
    const putSpy = vi.spyOn(api.trainTogether, 'changePartnerWorkout').mockResolvedValueOnce({
      revision: 2,
      draft: replacementDraft,
      conflict: false,
      exercises: [],
    });

    await act(async () => root.render(<Harness userId="u-self" />));
    expect(latest.partnerSyncStates['u-sam']?.revision).toBe(2);

    // Two successive empty reads must stop/remove the synchronizer rather than inventing revisions.
    await act(async () => {
      await latest.refresh();
      await latest.refresh();
    });
    expect(latest.partnerSyncStates['u-sam']).toBeUndefined();

    // Partner opens a brand new workout starting at revision 1: must be editable!
    await act(async () => {
      await latest.refresh();
    });
    expect(latest.partnerSyncStates['u-sam']?.revision).toBe(1);
    expect(latest.partnerSyncStates['u-sam']?.draft?.name).toBe('Pull day');

    await act(async () => {
      await latest.editPartnerWorkout('u-sam', (draft) =>
        updatePartnerSet(draft, 'mov-1', 'set-1', { reps: 12 }, 3000),
      );
    });
    expect(putSpy).toHaveBeenCalledOnce();
    expect(putSpy.mock.calls[0][1].revision).toBe(1);
  });

  it('announces partner join in either arrival order after creating an invite (finding 17)', async () => {
    const soloSession: TrainSession = {
      ...makeSession(),
      members: [makeSession().members[0]],
    };
    const withSam = makeSession();

    // Order A: invite follow-up GET already contains Sam before the socket GET arrives.
    vi.spyOn(api.trainTogether, 'read')
      .mockResolvedValueOnce({ session: null, ended: null })
      .mockResolvedValueOnce({ session: withSam, ended: null })
      .mockResolvedValueOnce({ session: withSam, ended: null });
    vi.spyOn(api.trainTogether, 'invite').mockResolvedValueOnce({
      token: 'InviteOrderAToken12345678',
      expires_at: new Date(Date.now() + 300_000).toISOString(),
      session_id: 'sess-1',
    });

    await act(async () => root.render(<Harness userId="u-self" />));
    await act(async () => {
      await latest.createInvite();
    });
    expect(notices).toEqual(['Sam joined']);

    await act(async () => {
      window.dispatchEvent(new Event(TRAIN_TOGETHER_CHANGED));
    });
    expect(notices).toEqual(['Sam joined']);

    // Order B: invite follow-up GET returns solo session, then socket GET brings Sam.
    notices.length = 0;
    await act(async () => root.render(<Harness userId="u-self-b" />));
    const soloB: TrainSession = {
      ...soloSession,
      id: 'sess-b',
      members: [{ ...soloSession.members[0], user_id: 'u-self-b' }],
    };
    const withSamB: TrainSession = {
      ...withSam,
      id: 'sess-b',
      members: [{ ...withSam.members[0], user_id: 'u-self-b' }, withSam.members[1]],
    };
    vi.spyOn(api.trainTogether, 'read')
      .mockResolvedValueOnce({ session: soloB, ended: null })
      .mockResolvedValueOnce({ session: withSamB, ended: null });
    vi.spyOn(api.trainTogether, 'invite').mockResolvedValueOnce({
      token: 'InviteOrderBToken12345678',
      expires_at: new Date(Date.now() + 300_000).toISOString(),
      session_id: 'sess-b',
    });

    await act(async () => {
      await latest.createInvite();
    });
    expect(notices).toEqual([]);

    await act(async () => {
      window.dispatchEvent(new Event(TRAIN_TOGETHER_CHANGED));
    });
    expect(notices).toEqual(['Sam joined']);
  });

  it('retires partner editor, refreshes session and notifies on train_not_partner refusal (finding 12)', async () => {
    const readSpy = vi
      .spyOn(api.trainTogether, 'read')
      .mockResolvedValueOnce({ session: makeSession(1, makeDraft()), ended: null })
      .mockResolvedValueOnce({ session: null, ended: null });
    vi.spyOn(api.trainTogether, 'changePartnerWorkout').mockRejectedValueOnce(
      new ApiError('Sam is no longer in this session.', TRAIN_ERRORS.notPartner, 404),
    );

    await act(async () => root.render(<Harness userId="u-self" />));
    expect(latest.partnerSyncStates['u-sam']).toBeDefined();

    await act(async () => {
      await latest.editPartnerWorkout('u-sam', (draft) =>
        updatePartnerSet(draft, 'mov-1', 'set-1', { reps: 10 }, 1000),
      );
    });

    expect(latest.partnerSyncStates['u-sam']).toBeUndefined();
    expect(readSpy).toHaveBeenCalledTimes(2);
    expect(notices).toEqual(['Sam is no longer in this session.']);
  });

  it('keeps partner editor open and retains unsent edit on a 500 error so Retry can resend it', async () => {
    const initialDraft = makeDraft();
    vi.spyOn(api.trainTogether, 'read').mockResolvedValue({
      session: makeSession(1, initialDraft),
      ended: null,
    });
    const retired = vi.fn();
    const putSpy = vi
      .spyOn(api.trainTogether, 'changePartnerWorkout')
      .mockRejectedValueOnce(new ApiError('Server busy.', 'server_error', 500))
      .mockImplementationOnce(async (_partnerId, change) => ({
        revision: 2,
        draft: change.draft,
        conflict: false,
        exercises: [],
      }));

    function RetiredHarness() {
      latest = useTrainTogether('u-self', (msg) => notices.push(msg), {
        onPartnerRetired: retired,
      });
      return null;
    }

    await act(async () => root.render(<RetiredHarness />));
    await act(async () => {
      await latest.editPartnerWorkout('u-sam', (draft) =>
        addPartnerSet(draft, 'mov-1', 'set-2', 2000),
      );
    });

    expect(retired).not.toHaveBeenCalled();
    expect(latest.partnerSyncStates['u-sam']?.status).toBe('failed');
    expect(latest.partnerSyncStates['u-sam']?.draft?.movements[0].sets).toHaveLength(2);
    expect(latest.partnerAcknowledgedDrafts['u-sam']?.movements[0].sets).toHaveLength(1);

    await act(async () => {
      await latest.retryPartnerSync('u-sam');
    });
    expect(putSpy).toHaveBeenCalledTimes(2);
    expect(latest.partnerSyncStates['u-sam']?.status).toBe('synced');
    expect(latest.partnerAcknowledgedDrafts['u-sam']?.movements[0].sets).toHaveLength(2);
  });

  it('runs no timers and causes no extra renders when no session or invite is live', async () => {
    vi.useFakeTimers();
    try {
      const readSpy = vi
        .spyOn(api.trainTogether, 'read')
        .mockResolvedValue({ session: null, ended: null });
      let renders = 0;
      const seenControllers: TrainTogetherController[] = [];

      function CountingHarness() {
        renders += 1;
        latest = useTrainTogether('u-self', (msg) => notices.push(msg));
        seenControllers.push(latest);
        return null;
      }

      await act(async () => root.render(<CountingHarness />));
      expect(readSpy).toHaveBeenCalledTimes(1);
      const rendersAfterMount = renders;
      const controllerAfterMount = latest;

      // Advance 5 minutes: no polling timer or countdown timer should fire.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5 * 60_000);
      });
      expect(readSpy).toHaveBeenCalledTimes(1);
      expect(renders).toBe(rendersAfterMount);
      expect(latest).toBe(controllerAfterMount);

      // Window focus alone must NOT fetch (visibilitychange already covers returning to the tab).
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        await Promise.resolve();
      });
      expect(readSpy).toHaveBeenCalledTimes(1);
      expect(renders).toBe(rendersAfterMount);
      expect(latest).toBe(controllerAfterMount);

      // Visibility return returning an empty session refreshes once with no extra re-render.
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve();
      });
      expect(readSpy).toHaveBeenCalledTimes(2);
      expect(renders).toBe(rendersAfterMount);
      expect(latest).toBe(controllerAfterMount);
    } finally {
      vi.useRealTimers();
    }
  });
});
