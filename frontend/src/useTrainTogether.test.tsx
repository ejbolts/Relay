// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { updatePartnerSet, type TrainSession, type TrainTogetherRead } from './trainTogether';
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

function Harness({ userId }: { userId: string | null }) {
  latest = useTrainTogether(userId, (message) => notices.push(message));
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
});
