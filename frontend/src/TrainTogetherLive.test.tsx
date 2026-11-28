// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { LiveWorkoutHeader } from './LiveWorkoutHeader';
import type { PartnerSyncState, TrainMember, TrainSession } from './trainTogether';
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
      error: new Error('Offline'),
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

    // Add set calls onEdit.
    const addSetBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === '+ Add set',
    )!;
    await act(async () => addSetBtn.click());
    expect(onEdit).toHaveBeenCalledOnce();

    // Add exercise opens partner picker and adds chosen exercise.
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

    // Back to mine always works even offline.
    const backBtn = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Back to mine'),
    )!;
    await act(async () => backBtn.click());
    expect(onBack).toHaveBeenCalledOnce();
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
