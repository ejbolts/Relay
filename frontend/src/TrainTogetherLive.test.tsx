// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { LiveWorkoutHeader } from './LiveWorkoutHeader';
import { TRAIN_ERRORS, type PartnerSyncState, type TrainMember, type TrainSession } from './trainTogether';
import { TrainTogetherDeck, TrainTogetherEntryButton } from './TrainTogetherDeck';
import { TrainTogetherPaceStrip } from './TrainTogetherPaceStrip';
import { TrainTogetherPartnerView } from './TrainTogetherPartnerView';
import { partnerPalettes } from './trainTogetherTheme';
import type { ActiveWorkoutDraft } from './workoutDraft';

function makePartnerDraft(done = true): ActiveWorkoutDraft {
  return {
    version: 1,
    startedAt: Date.now() - 15 * 60_000,
    updatedAt: Date.now() - 5_000,
    lastActiveAt: Date.now() - 5_000,
    name: 'Push day',
    workoutDate: '2026-11-28',
    category: 'push',
    notes: '',
    movements: [
      {
        key: 'm1',
        exerciseId: 'sam-bench',
        notes: '',
        machinePhotoIds: [],
        supersetKey: null,
        sets: [
          {
            key: 's1',
            reps: 8,
            weight_kg: 80,
            rpe: 7.5,
            rest_seconds: null,
            duration_seconds: null,
            distance_km: null,
            notes: null,
            completed: done,
          },
        ],
      },
      {
        key: 'm2',
        exerciseId: 'sam-run',
        notes: '',
        machinePhotoIds: [],
        supersetKey: null,
        sets: [
          {
            key: 's2',
            reps: null,
            weight_kg: null,
            rpe: null,
            rest_seconds: null,
            duration_seconds: 1200,
            distance_km: 3.5,
            notes: null,
            completed: true,
          },
        ],
      },
    ],
  };
}

function makePartner(id: string, name: string, withWorkout = true): TrainMember {
  return {
    user_id: id,
    username: name.toLowerCase(),
    display_name: name,
    photo_url: null,
    is_self: false,
    joined_at: '2026-11-28T08:01:00Z',
    workout: withWorkout
      ? {
          revision: 4,
          draft: makePartnerDraft(true),
          exercises: [
            {
              id: 'sam-bench',
              name: 'Bench Press',
              kind: 'strength',
              category: 'push',
              muscle_group: 'Chest',
              equipment: 'Barbell',
              same_as_exercise_id: 'my-bench',
            },
            {
              id: 'sam-run',
              name: 'Running',
              kind: 'cardio',
              category: 'cardio',
              muscle_group: 'Cardio',
              equipment: null,
              same_as_exercise_id: null,
            },
          ],
        }
      : null,
  };
}

function makeSession(partners: TrainMember[]): TrainSession {
  return {
    id: 'sess-1',
    started_at: '2026-11-28T08:00:00Z',
    expires_at: '2026-11-28T20:00:00Z',
    created_by: 'u-alex',
    max_members: 4,
    members: [
      {
        user_id: 'u-alex',
        username: 'alex',
        display_name: 'Alex',
        photo_url: null,
        is_self: true,
        joined_at: '2026-11-28T08:00:00Z',
        workout: null,
      },
      ...partners,
    ],
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  }
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

describe('TrainTogetherEntryButton and Live Deck', () => {
  it('switches entry pill between Train together and Waiting · M:SS', async () => {
    const onClick = vi.fn();
    await act(async () =>
      root.render(<TrainTogetherEntryButton waitingSeconds={0} onClick={onClick} />),
    );
    expect(container.textContent).toBe('Train together');
    await act(async () => container.querySelector('button')!.click());
    expect(onClick).toHaveBeenCalledOnce();

    await act(async () =>
      root.render(<TrainTogetherEntryButton waitingSeconds={272} onClick={onClick} />),
    );
    expect(container.textContent).toContain('Waiting · 4:32');
  });

  it('renders 1-partner Live Deck, hides Log when partner has no workout, and scales to 3 partners', async () => {
    const sam = makePartner('u-sam', 'Sam', true);
    const onLog = vi.fn();
    const onSession = vi.fn();
    await act(async () =>
      root.render(
        <TrainTogetherDeck
          session={makeSession([sam])}
          partners={[sam]}
          palettes={partnerPalettes('blue', 1, false)}
          weightUnit="kg"
          recentlyJoinedIds={new Set(['u-sam'])}
          onLogForPartner={onLog}
          onOpenSession={onSession}
        />,
      ),
    );
    expect(container.textContent).toContain('Sam');
    expect(container.textContent).toContain('2 sets');
    expect(container.textContent).toContain('Log for Sam');
    const logBtn = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Log for Sam'),
    )!;
    await act(async () => logBtn.click());
    expect(onLog).toHaveBeenCalledWith('u-sam');

    // No workout open: hides Log button and shows muted text.
    const idleSam = makePartner('u-sam', 'Sam', false);
    await act(async () =>
      root.render(
        <TrainTogetherDeck
          session={makeSession([idleSam])}
          partners={[idleSam]}
          palettes={partnerPalettes('blue', 1, false)}
          weightUnit="kg"
          recentlyJoinedIds={new Set()}
          onLogForPartner={onLog}
          onOpenSession={onSession}
        />,
      ),
    );
    expect(container.textContent).toContain('No workout open');
    expect(container.textContent).not.toContain('Log for Sam');

    // 3 partners compact rows.
    const trio = [
      makePartner('u-sam', 'Sam', true),
      makePartner('u-priya', 'Priya', true),
      makePartner('u-dev', 'Dev', true),
    ];
    await act(async () =>
      root.render(
        <TrainTogetherDeck
          session={makeSession(trio)}
          partners={trio}
          palettes={partnerPalettes('blue', 3, false)}
          weightUnit="kg"
          recentlyJoinedIds={new Set()}
          onLogForPartner={onLog}
          onOpenSession={onSession}
        />,
      ),
    );
    expect(container.textContent).toContain('Training together · 4/4');
    expect(container.querySelectorAll('.tt-deck-mini-row')).toHaveLength(3);
  });
});

describe('TrainTogetherPaceStrip', () => {
  it('shows partner latest completed set on matching exercise in viewer weight unit', async () => {
    const sam = makePartner('u-sam', 'Sam', true);
    await act(async () =>
      root.render(
        <TrainTogetherPaceStrip
          partners={[sam]}
          palettes={partnerPalettes('blue', 1, false)}
          myExerciseId="my-bench"
          weightUnit="kg"
        />,
      ),
    );
    expect(container.textContent).toContain('Sam · 80 kg × 8');
    expect(container.textContent).toContain('Set 1');

    // Pounds conversion (finding 23).
    await act(async () =>
      root.render(
        <TrainTogetherPaceStrip
          partners={[sam]}
          palettes={partnerPalettes('blue', 1, false)}
          myExerciseId="my-bench"
          weightUnit="lb"
        />,
      ),
    );
    expect(container.textContent).toContain('Sam · 176.37 lb × 8');
    expect(container.textContent).toContain('Set 1');

    // Unmatched exercise renders nothing.
    await act(async () =>
      root.render(
        <TrainTogetherPaceStrip
          partners={[sam]}
          palettes={partnerPalettes('blue', 1, false)}
          myExerciseId="unrelated-ex"
          weightUnit="kg"
        />,
      ),
    );
    expect(container.textContent).toBe('');
  });
});

describe('TrainTogetherPartnerView', () => {
  it('edits sets, keeps unacknowledged ticks pending, shows offline retry bar, and adds exercises', async () => {
    const sam = makePartner('u-sam', 'Sam', true);
    const localDraft = makePartnerDraft(true);
    const ackDraft = makePartnerDraft(false); // Set 1 ticked locally, NOT acknowledged yet!
    const syncState: PartnerSyncState = {
      revision: 4,
      draft: localDraft,
      status: 'failed',
      notApplied: false,
      error: new TypeError('Failed to fetch'),
      exercises: null,
    };
    const onEdit = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const onBack = vi.fn();
    vi.spyOn(api.trainTogether, 'partnerExercises').mockResolvedValue([
      {
        id: 'sam-ohp',
        name: 'Overhead Press',
        kind: 'strength',
        category: 'push',
        muscle_group: 'Shoulders',
        equipment: 'Barbell',
        same_as_exercise_id: null,
      },
    ]);

    await act(async () =>
      root.render(
        <TrainTogetherPartnerView
          partner={sam}
          palette={partnerPalettes('blue', 1, false)[0]}
          syncState={syncState}
          acknowledgedDraft={ackDraft}
          viewerAddedMovementKeys={new Set(['m1'])}
          weightUnit="kg"
          onEdit={onEdit}
          onRetry={onRetry}
          onRegisterExercises={vi.fn()}
          onBackToMine={onBack}
        />,
      ),
    );

    expect(container.textContent).toContain('Logging for Sam');
    expect(container.textContent).toContain('Sam’s Push day');
    // Offline failure bar + Retry button.
    expect(container.textContent).toContain('Offline · Unsent change');
    const retryBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Retry',
    )!;
    await act(async () => retryBtn.click());
    expect(onRetry).toHaveBeenCalledOnce();

    // Unacknowledged completed set looks pending, not done.
    const tick = container.querySelector<HTMLButtonElement>('.tt-partner-tick')!;
    expect(tick.classList.contains('is-pending')).toBe(true);
    expect(tick.classList.contains('is-done')).toBe(false);
    expect(tick.getAttribute('aria-pressed')).toBe('mixed');

    // Cardio movement is read-only.
    expect(container.textContent).toContain('Running');
    expect(container.textContent).toContain('20 min · 3.5 km');

    // Add set calls onEdit and its updater appends a valid uncompleted set preserving existing fields (finding 23).
    const addSetBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === '+ Add set',
    )!;
    await act(async () => addSetBtn.click());
    expect(onEdit).toHaveBeenCalledOnce();
    const afterAddSet = (onEdit.mock.calls[0][0] as (d: ActiveWorkoutDraft) => ActiveWorkoutDraft)(
      localDraft,
    );
    expect(afterAddSet.movements[0].sets).toHaveLength(2);
    expect(afterAddSet.movements[0].sets[0]).toEqual(localDraft.movements[0].sets[0]);
    expect(afterAddSet.movements[0].sets[1]).toMatchObject({
      weight_kg: 80,
      reps: 8,
      completed: false,
      notes: null,
    });
    expect(afterAddSet.movements[0].sets[1].key).toBeTruthy();
    expect(afterAddSet.movements[1]).toEqual(localDraft.movements[1]);

    // Add exercise opens partner picker and adds chosen exercise with valid structure (finding 23).
    const addExBtn = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('+ Add exercise for Sam'),
    )!;
    await act(async () => addExBtn.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    const ohpBtn = [
      ...document.querySelectorAll<HTMLButtonElement>('.tt-partner-picker-item'),
    ].find((b) => b.textContent?.includes('Overhead Press'))!;
    await act(async () => ohpBtn.click());
    expect(onEdit).toHaveBeenCalledTimes(2);
    const addedMeta = onEdit.mock.calls[1][1] as { movementKey: string; exercise: { id: string } };
    const afterAddEx = (onEdit.mock.calls[1][0] as (d: ActiveWorkoutDraft) => ActiveWorkoutDraft)(
      afterAddSet,
    );
    expect(afterAddEx.movements).toHaveLength(3);
    expect(afterAddEx.movements[2]).toMatchObject({
      key: addedMeta.movementKey,
      exerciseId: 'sam-ohp',
      machinePhotoIds: [],
    });
    expect(afterAddEx.movements[2].sets).toHaveLength(1);
    expect(afterAddEx.movements[2].sets[0]).toMatchObject({ completed: false, notes: null });

    // Back to mine always works even offline.
    const backBtn = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Back to mine'),
    )!;
    await act(async () => backBtn.click());
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('allocates new set key and timestamp once outside the updater for replay safety (finding 2)', async () => {
    const sam = makePartner('u-sam', 'Sam', true);
    const baseDraft = makePartnerDraft(false);
    const onEdit = vi.fn().mockResolvedValue(undefined);
    await act(async () =>
      root.render(
        <TrainTogetherPartnerView
          partner={sam}
          palette={partnerPalettes('blue', 1, false)[0]}
          syncState={{
            revision: 4,
            draft: baseDraft,
            status: 'synced',
            notApplied: false,
            error: null,
            exercises: null,
          }}
          acknowledgedDraft={baseDraft}
          weightUnit="kg"
          onEdit={onEdit}
          onRetry={vi.fn().mockResolvedValue(undefined)}
          onRegisterExercises={vi.fn()}
          onBackToMine={vi.fn()}
        />,
      ),
    );

    const addSetBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === '+ Add set',
    )!;
    await act(async () => addSetBtn.click());
    expect(onEdit).toHaveBeenCalledOnce();
    const updater = onEdit.mock.calls[0][0] as (draft: ActiveWorkoutDraft) => ActiveWorkoutDraft;

    const firstRun = updater(baseDraft);
    const secondRun = updater({ ...baseDraft, updatedAt: baseDraft.updatedAt + 1 });
    expect(firstRun.movements[0].sets).toHaveLength(2);
    expect(secondRun.movements[0].sets).toHaveLength(2);
    expect(firstRun.movements[0].sets[1].key).toBe(secondRun.movements[0].sets[1].key);
  });

  it('uses acknowledged draft for saved counts and marks numeric edits on done rows as pending (finding 11)', async () => {
    const sam = makePartner('u-sam', 'Sam', true);
    // Case A: local ticked set 1, server has NOT acknowledged it yet.
    const localTicked = makePartnerDraft(true);
    const ackUnticked = makePartnerDraft(false);
    await act(async () =>
      root.render(
        <TrainTogetherPartnerView
          partner={sam}
          palette={partnerPalettes('blue', 1, false)[0]}
          syncState={{
            revision: 4,
            draft: localTicked,
            status: 'syncing',
            notApplied: false,
            error: null,
            exercises: null,
          }}
          acknowledgedDraft={ackUnticked}
          weightUnit="kg"
          onEdit={vi.fn().mockResolvedValue(undefined)}
          onRetry={vi.fn().mockResolvedValue(undefined)}
          onRegisterExercises={vi.fn()}
          onBackToMine={vi.fn()}
        />,
      ),
    );
    // Bench Press has 0 acknowledged done sets (cardio movement still has 1 acknowledged done set).
    expect(container.textContent).toContain('0 done');
    expect(container.querySelector('.tt-partner-meta')?.textContent).toContain('1 set');

    // Case B: set 1 is already acknowledged done at 80 kg, locally edited to 85 kg (not yet acked).
    const ackDone = makePartnerDraft(true);
    const localWeightEdited = makePartnerDraft(true);
    localWeightEdited.movements[0].sets[0].weight_kg = 85;
    await act(async () =>
      root.render(
        <TrainTogetherPartnerView
          partner={sam}
          palette={partnerPalettes('blue', 1, false)[0]}
          syncState={{
            revision: 4,
            draft: localWeightEdited,
            status: 'syncing',
            notApplied: false,
            error: null,
            exercises: null,
          }}
          acknowledgedDraft={ackDone}
          weightUnit="kg"
          onEdit={vi.fn().mockResolvedValue(undefined)}
          onRetry={vi.fn().mockResolvedValue(undefined)}
          onRegisterExercises={vi.fn()}
          onBackToMine={vi.fn()}
        />,
      ),
    );
    const row = container.querySelector<HTMLElement>('.tt-partner-set-row[data-set-key="s1"]')!;
    expect(row.classList.contains('is-pending')).toBe(true);
    expect(row.classList.contains('is-done')).toBe(false);
  });

  it('shows server refusal message instead of offline bar when edit is rejected (finding 12)', async () => {
    const sam = makePartner('u-sam', 'Sam', true);
    const baseDraft = makePartnerDraft(false);
    await act(async () =>
      root.render(
        <TrainTogetherPartnerView
          partner={sam}
          palette={partnerPalettes('blue', 1, false)[0]}
          syncState={{
            revision: 4,
            draft: baseDraft,
            status: 'failed',
            notApplied: false,
            error: new ApiError('Reps must be between 0 and 10,000.', TRAIN_ERRORS.changeNotAllowed, 422),
            exercises: null,
          }}
          acknowledgedDraft={baseDraft}
          weightUnit="kg"
          onEdit={vi.fn().mockResolvedValue(undefined)}
          onRetry={vi.fn().mockResolvedValue(undefined)}
          onRegisterExercises={vi.fn()}
          onBackToMine={vi.fn()}
        />,
      ),
    );
    expect(container.textContent).toContain('Reps must be between 0 and 10,000.');
    expect(container.textContent).not.toContain('Offline · Unsent change');
  });

  it('rejects invalid weight/reps locally without sending, while accepting kg, lb and empty clears (finding 13)', async () => {
    const sam = makePartner('u-sam', 'Sam', true);
    const baseDraft = makePartnerDraft(false);
    const onEdit = vi.fn().mockResolvedValue(undefined);
    const setInputValue = (input: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    await act(async () =>
      root.render(
        <TrainTogetherPartnerView
          partner={sam}
          palette={partnerPalettes('blue', 1, false)[0]}
          syncState={{
            revision: 4,
            draft: baseDraft,
            status: 'synced',
            notApplied: false,
            error: null,
            exercises: null,
          }}
          acknowledgedDraft={baseDraft}
          weightUnit="kg"
          onEdit={onEdit}
          onRetry={vi.fn().mockResolvedValue(undefined)}
          onRegisterExercises={vi.fn()}
          onBackToMine={vi.fn()}
        />,
      ),
    );

    const weightInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Bench Press set 1 weight in kilograms"]',
    )!;
    const repsInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Bench Press set 1 reps"]',
    )!;

    // Invalid reps: 1e309 and 2.5 must NOT call onEdit and must stay local & marked invalid.
    await act(async () => setInputValue(repsInput, '1e309'));
    expect(onEdit).not.toHaveBeenCalled();
    expect(repsInput.getAttribute('aria-invalid')).toBe('true');
    expect(repsInput.value).toBe('1e309');

    await act(async () => setInputValue(repsInput, '2.5'));
    expect(onEdit).not.toHaveBeenCalled();
    expect(repsInput.getAttribute('aria-invalid')).toBe('true');

    // Out-of-range weight: 1e309 and 15000 kg must NOT call onEdit.
    await act(async () => setInputValue(weightInput, '1e309'));
    expect(onEdit).not.toHaveBeenCalled();
    expect(weightInput.getAttribute('aria-invalid')).toBe('true');

    await act(async () => setInputValue(weightInput, '15000'));
    expect(onEdit).not.toHaveBeenCalled();
    expect(weightInput.getAttribute('aria-invalid')).toBe('true');

    // Valid kg weight & valid reps send exact values; empty clears to null.
    await act(async () => setInputValue(repsInput, '10'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    const repsUpdated = (onEdit.mock.calls[0][0] as (d: ActiveWorkoutDraft) => ActiveWorkoutDraft)(
      baseDraft,
    );
    expect(repsUpdated.movements[0].sets[0].reps).toBe(10);
    expect(repsInput.getAttribute('aria-invalid')).toBeNull();

    await act(async () => setInputValue(repsInput, ''));
    expect(onEdit).toHaveBeenCalledTimes(2);
    const repsCleared = (onEdit.mock.calls[1][0] as (d: ActiveWorkoutDraft) => ActiveWorkoutDraft)(
      baseDraft,
    );
    expect(repsCleared.movements[0].sets[0].reps).toBeNull();

    // Pounds mode: converts typed lb to kg and rejects lb > 10,000 kg.
    onEdit.mockClear();
    await act(async () =>
      root.render(
        <TrainTogetherPartnerView
          partner={sam}
          palette={partnerPalettes('blue', 1, false)[0]}
          syncState={{
            revision: 4,
            draft: baseDraft,
            status: 'synced',
            notApplied: false,
            error: null,
            exercises: null,
          }}
          acknowledgedDraft={baseDraft}
          weightUnit="lb"
          onEdit={onEdit}
          onRetry={vi.fn().mockResolvedValue(undefined)}
          onRegisterExercises={vi.fn()}
          onBackToMine={vi.fn()}
        />,
      ),
    );
    const lbInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Bench Press set 1 weight in pounds"]',
    )!;
    await act(async () => setInputValue(lbInput, '25000'));
    expect(onEdit).not.toHaveBeenCalled();
    expect(lbInput.getAttribute('aria-invalid')).toBe('true');

    await act(async () => setInputValue(lbInput, '225'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    const lbUpdated = (onEdit.mock.calls[0][0] as (d: ActiveWorkoutDraft) => ActiveWorkoutDraft)(
      baseDraft,
    );
    expect(lbUpdated.movements[0].sets[0].weight_kg).toBeCloseTo(225 / 2.2046226218, 4);
  });

  it('matches owner clock rules for paused, adjusted and resumed partner drafts (finding 19)', async () => {
    vi.useFakeTimers();
    try {
      const now = 1_800_000_000_000;
      vi.setSystemTime(now);
      const sam = makePartner('u-sam', 'Sam', true);

      // Paused workout: started 10 min ago, paused 4 min ago (6 min active, frozen while paused).
      const pausedDraft: ActiveWorkoutDraft = {
        ...makePartnerDraft(true),
        startedAt: now - 10 * 60_000,
        pausedMs: 0,
        pausedAt: now - 4 * 60_000,
      };
      await act(async () =>
        root.render(
          <TrainTogetherPartnerView
            partner={sam}
            palette={partnerPalettes('blue', 1, false)[0]}
            syncState={{
              revision: 4,
              draft: pausedDraft,
              status: 'synced',
              notApplied: false,
              error: null,
              exercises: null,
            }}
            acknowledgedDraft={pausedDraft}
            weightUnit="kg"
            onEdit={vi.fn().mockResolvedValue(undefined)}
            onRetry={vi.fn().mockResolvedValue(undefined)}
            onRegisterExercises={vi.fn()}
            onBackToMine={vi.fn()}
          />,
        ),
      );
      expect(container.querySelector('.tt-partner-meta')?.textContent).toContain('06:00');
      // Advance 2 minutes while still paused: displayed clock must stay at 06:00.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });
      expect(container.querySelector('.tt-partner-meta')?.textContent).toContain('06:00');

      // Resumed workout: 30 min already logged + 5 min since resume + 60s manual adjustment = 36:00.
      const resumedDraft: ActiveWorkoutDraft = {
        ...makePartnerDraft(true),
        startedAt: Date.now() - 5 * 60_000,
        previousDurationMinutes: 30,
        pausedMs: 0,
        pausedAt: null,
        adjustedMs: 60_000,
      };
      await act(async () =>
        root.render(
          <TrainTogetherPartnerView
            partner={sam}
            palette={partnerPalettes('blue', 1, false)[0]}
            syncState={{
              revision: 5,
              draft: resumedDraft,
              status: 'synced',
              notApplied: false,
              error: null,
              exercises: null,
            }}
            acknowledgedDraft={resumedDraft}
            weightUnit="kg"
            onEdit={vi.fn().mockResolvedValue(undefined)}
            onRetry={vi.fn().mockResolvedValue(undefined)}
            onRegisterExercises={vi.fn()}
            onBackToMine={vi.fn()}
          />,
        ),
      );
      expect(container.querySelector('.tt-partner-meta')?.textContent).toContain('36:00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('honours reduced motion when scrolling to an existing exercise from the picker (finding 22)', async () => {
    const sam = makePartner('u-sam', 'Sam', true);
    const baseDraft = makePartnerDraft(false);
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    document.documentElement.dataset.reduceMotion = 'true';
    vi.spyOn(api.trainTogether, 'partnerExercises').mockResolvedValue([
      {
        id: 'sam-bench',
        name: 'Bench Press',
        kind: 'strength',
        category: 'push',
        muscle_group: 'Chest',
        equipment: 'Barbell',
        same_as_exercise_id: 'my-bench',
      },
    ]);
    try {
      await act(async () =>
        root.render(
          <TrainTogetherPartnerView
            partner={sam}
            palette={partnerPalettes('blue', 1, false)[0]}
            syncState={{
              revision: 4,
              draft: baseDraft,
              status: 'synced',
              notApplied: false,
              error: null,
              exercises: null,
            }}
            acknowledgedDraft={baseDraft}
            weightUnit="kg"
            onEdit={vi.fn().mockResolvedValue(undefined)}
            onRetry={vi.fn().mockResolvedValue(undefined)}
            onRegisterExercises={vi.fn()}
            onBackToMine={vi.fn()}
          />,
        ),
      );
      const addExBtn = [...container.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('+ Add exercise'),
      )!;
      await act(async () => addExBtn.click());
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      const existingBtn = [
        ...document.querySelectorAll<HTMLButtonElement>('.tt-partner-picker-item'),
      ].find((b) => b.textContent?.includes('Bench Press'))!;
      await act(async () => existingBtn.click());
      await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
    } finally {
      delete document.documentElement.dataset.reduceMotion;
    }
  });
});

describe('LiveWorkoutHeader train together menu items', () => {
  it('shows Train together before a session and Leave session during a session', async () => {
    const onTrain = vi.fn();
    const onLeave = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const baseProps = {
      name: 'Push day',
      durationLabel: 'Live 05:00',
      loggedSets: 2,
      paused: false,
      menuButtonRef: ref,
      onMinimise: vi.fn(),
      onRename: vi.fn(),
      onAddNote: vi.fn(),
      onTogglePause: vi.fn(),
      onDiscard: vi.fn(),
      onFinish: vi.fn(),
    };

    await act(async () =>
      root.render(<LiveWorkoutHeader {...baseProps} onTrainTogether={onTrain} />),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="Workout options"]')!.click(),
    );
    const trainItem = container.querySelector<HTMLButtonElement>('[aria-label="Train together"]')!;
    expect(trainItem).not.toBeNull();
    await act(async () => trainItem.click());
    expect(onTrain).toHaveBeenCalledOnce();

    await act(async () =>
      root.render(
        <LiveWorkoutHeader {...baseProps} trainTogetherActive onLeaveTrainTogether={onLeave} />,
      ),
    );
    expect(container.querySelector('header.has-train-deck')).not.toBeNull();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="Workout options"]')!.click(),
    );
    const leaveItem = container.querySelector<HTMLButtonElement>('[aria-label="Leave session"]')!;
    expect(leaveItem).not.toBeNull();
    await act(async () => leaveItem.click());
    expect(onLeave).toHaveBeenCalledOnce();
  });
});
