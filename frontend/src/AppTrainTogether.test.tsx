// @vitest-environment jsdom
import { act, Fragment, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { ApiError, api } from './api';
import { ToastProvider } from './Toast';
import { TRAIN_ERRORS, type TrainSession } from './trainTogether';
import { captureTrainInvite, openTrainInvite, pendingTrainInvite } from './trainTogetherInvite';
import type { DashboardData, Exercise, User } from './types';
import { UserContext, type UserSession } from './userContext';
import { readActiveWorkoutDraft, writeActiveWorkoutDraft } from './workoutDraft';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';
import {
  readDashboardCache,
  readWorkoutCache,
  writeDashboardCache,
  writeWorkoutCache,
} from './workoutCache';

vi.mock('./workoutCache', () => ({
  readDashboardCache: vi.fn().mockResolvedValue(null),
  writeDashboardCache: vi.fn().mockResolvedValue(undefined),
  readWorkoutCache: vi.fn().mockResolvedValue(null),
  writeWorkoutCache: vi.fn().mockResolvedValue(undefined),
  clearWorkoutCache: vi.fn().mockResolvedValue(undefined),
}));

const ACCOUNT_A: User = {
  id: 'u-alex',
  username: 'alex',
  display_name: 'Alex Sample',
  is_admin: false,
  can_upload_videos: true,
  created_at: '2026-10-29T10:00:00Z',
};

const ACCOUNT_B: User = {
  id: 'u-jordan',
  username: 'jordan',
  display_name: 'Jordan Sample',
  is_admin: false,
  can_upload_videos: true,
  created_at: '2026-10-29T10:00:00Z',
};

const BENCH: Exercise = {
  id: 'ex-bench',
  name: 'Bench Press',
  kind: 'strength',
  category: 'push',
  muscle_group: 'Chest',
  equipment: 'Barbell',
  is_custom: false,
  is_favorite: false,
  hidden: false,
} as Exercise;

function makePartnerSession(): TrainSession {
  const now = Date.now();
  return {
    id: 'sess-1',
    started_at: new Date(now - 60_000).toISOString(),
    expires_at: new Date(now + 3600_000).toISOString(),
    created_by: ACCOUNT_A.id,
    max_members: 4,
    members: [
      {
        user_id: ACCOUNT_A.id,
        username: ACCOUNT_A.username,
        display_name: ACCOUNT_A.display_name,
        photo_url: null,
        is_self: true,
        joined_at: new Date(now - 60_000).toISOString(),
        workout: null,
      },
      {
        user_id: 'u-sam',
        username: 'sam',
        display_name: 'Sam Rivera',
        photo_url: null,
        is_self: false,
        joined_at: new Date(now - 30_000).toISOString(),
        workout: {
          revision: 1,
          draft: {
            version: 1,
            startedAt: now - 300_000,
            updatedAt: now - 5_000,
            lastActiveAt: now - 5_000,
            name: 'Push day',
            workoutDate: '2026-11-28',
            category: 'push',
            notes: '',
            movements: [
              {
                key: 'sm1',
                exerciseId: 'sam-bench',
                notes: '',
                machinePhotoIds: [],
                supersetKey: null,
                sets: [
                  {
                    key: 'ss1',
                    reps: 8,
                    weight_kg: 80,
                    rpe: null,
                    rest_seconds: null,
                    duration_seconds: null,
                    distance_km: null,
                    notes: null,
                    completed: true,
                  },
                ],
              },
            ],
          },
          exercises: [
            {
              id: 'sam-bench',
              name: 'Bench Press',
              kind: 'strength',
              category: 'push',
              muscle_group: 'Chest',
              equipment: 'Barbell',
              same_as_exercise_id: BENCH.id,
            },
          ],
        },
      },
    ],
  };
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.mocked(readDashboardCache).mockResolvedValue(null);
  vi.mocked(readWorkoutCache).mockResolvedValue(null);
  vi.mocked(writeDashboardCache).mockResolvedValue(undefined);
  vi.mocked(writeWorkoutCache).mockResolvedValue(undefined);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem('gym-logger-reduce-motion', 'reduced');
  vi.spyOn(api, 'workoutRevision').mockResolvedValue({ revision: 'initial' });
  vi.spyOn(api, 'dashboard').mockResolvedValue({
    recommendation: null,
    heatmap: [],
  } as unknown as DashboardData);
  vi.spyOn(api, 'listExercises').mockResolvedValue([BENCH]);
  vi.spyOn(api, 'listWorkouts').mockResolvedValue([]);
  vi.spyOn(api, 'listBodyMeasurements').mockResolvedValue([]);
  vi.spyOn(api, 'listPersonalRecords').mockResolvedValue([]);
  vi.spyOn(api, 'getWorkoutTypes').mockResolvedValue(DEFAULT_WORKOUT_TYPES);
  vi.spyOn(api, 'getTrainingPreferences').mockResolvedValue({
    preferred_weight_unit: 'kg',
    week_start: 'monday',
    zone2_goal_minutes: 150,
    weekly_muscle_set_goal: 10,
  });
  vi.spyOn(api, 'activeWorkout').mockResolvedValue({ revision: 0, draft: null });
  vi.spyOn(api.trainTogether, 'read').mockResolvedValue({ session: null, ended: null });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeSessionContext(user: User, confirmed = true): UserSession {
  return {
    user,
    confirmed,
    updateUser: vi.fn(),
    signOut: vi.fn(),
    accountDeleted: vi.fn(),
  } as UserSession;
}

describe('App train-together review fixes', () => {
  it('dismisses actionable not-friends toast on keyed account teardown (finding 4)', async () => {
    vi.spyOn(api.trainTogether, 'join').mockRejectedValueOnce(
      new ApiError('Add Sam as a friend to train together.', TRAIN_ERRORS.notFriends, 403, {
        user_id: 'u-sam',
        name: 'Sam Rivera',
      }),
    );
    const addFriendSpy = vi
      .spyOn(api.sharing, 'addFriend')
      .mockResolvedValue({ status: 'outgoing' });

    window.history.replaceState(null, '', '/#dashboard');
    await act(async () =>
      root.render(
        <ToastProvider>
          <UserContext.Provider value={makeSessionContext(ACCOUNT_A)}>
            <Fragment key={ACCOUNT_A.id}>
              <App />
            </Fragment>
          </UserContext.Provider>
        </ToastProvider>,
      ),
    );

    await act(async () => openTrainInvite('NotFriendsToken123456789'));
    expect(document.body.textContent).toContain('Add Sam as a friend to train together.');
    expect(
      [...document.querySelectorAll('button')].some((b) => b.textContent === 'Add friend'),
    ).toBe(true);

    // Simulate AuthGate switching accounts while ToastProvider remains mounted.
    await act(async () =>
      root.render(
        <ToastProvider>
          <UserContext.Provider value={makeSessionContext(ACCOUNT_B)}>
            <Fragment key={ACCOUNT_B.id}>
              <App />
            </Fragment>
          </UserContext.Provider>
        </ToastProvider>,
      ),
    );

    expect(document.body.textContent).not.toContain('Add Sam as a friend to train together.');
    expect(addFriendSpy).not.toHaveBeenCalled();
  });

  it('holds back owner inactivity dialog while logging for a partner until Back to mine (finding 5)', async () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      // Active workout with a completed set whose inactivity cutoff arrives in 15 seconds.
      writeActiveWorkoutDraft({
        version: 1,
        clientSessionId: '11111111-1111-4111-8111-111111111111',
        startedAt: now - 3600_000,
        updatedAt: now - 60_000,
        lastActiveAt: now - 60_000,
        inactiveFinishAt: now + 15_000,
        name: 'My Push',
        workoutDate: '2026-11-28',
        category: 'push',
        notes: '',
        movements: [
          {
            key: 'own-m1',
            exerciseId: BENCH.id,
            notes: '',
            machinePhotoIds: [],
            supersetKey: null,
            sets: [
              {
                key: 'own-s1',
                reps: 8,
                weight_kg: 80,
                rpe: null,
                rest_seconds: null,
                duration_seconds: null,
                distance_km: null,
                notes: null,
                completed: true,
              },
            ],
          },
        ],
      });
      vi.mocked(api.trainTogether.read).mockResolvedValue({
        session: makePartnerSession(),
        ended: null,
      });

      window.history.replaceState(null, '', '/#log');
      await act(async () =>
        root.render(
          <ToastProvider>
            <UserContext.Provider value={makeSessionContext(ACCOUNT_A)}>
              <App />
            </UserContext.Provider>
          </ToastProvider>,
        ),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      // Enter partner mode.
      const logForBtn = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes('Log for'),
      );
      expect(logForBtn).toBeDefined();
      await act(async () => logForBtn!.click());
      expect(document.body.textContent).toContain('Logging for Sam Rivera');

      // Advance past the owner's inactivity deadline (check interval is 30s).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(35_000);
      });

      // Owner's Unfinished workout dialog must NOT appear over Sam's logger.
      expect(document.body.textContent).not.toContain('Unfinished workout');

      // Return to owner's workout: now the held dialog appears.
      const backBtn = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes('Back to mine'),
      );
      expect(backBtn).toBeDefined();
      await act(async () => backBtn!.click());
      expect(document.body.textContent).toContain('Unfinished workout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps pending invite while unconfirmed and submits once under StrictMode (finding 7)', async () => {
    const token = 'StrictModeInviteToken12345';
    window.history.replaceState(null, '', `/#train=${token}`);
    captureTrainInvite();
    expect(pendingTrainInvite()).toBe(token);

    const joinSpy = vi.spyOn(api.trainTogether, 'join').mockResolvedValue({
      session: makePartnerSession(),
      ended: null,
    });

    // Mount with remembered but unconfirmed account (expired cookie case): token must NOT be consumed.
    await act(async () =>
      root.render(
        <ToastProvider>
          <UserContext.Provider value={makeSessionContext(ACCOUNT_A, false)}>
            <App />
          </UserContext.Provider>
        </ToastProvider>,
      ),
    );
    expect(joinSpy).not.toHaveBeenCalled();
    expect(pendingTrainInvite()).toBe(token);

    // Tear down (as AuthGate does on 401), then sign in under StrictMode (double mount/effect).
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () =>
      root.render(
        <StrictMode>
          <ToastProvider>
            <UserContext.Provider value={makeSessionContext(ACCOUNT_A, true)}>
              <App />
            </UserContext.Provider>
          </ToastProvider>
        </StrictMode>,
      ),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    expect(joinSpy).toHaveBeenCalledTimes(1);
    expect(joinSpy).toHaveBeenCalledWith(token);
    expect(pendingTrainInvite()).toBeNull();
  });

  it('waits for exercise catalogue before copying partner exercises and reports retry on failure (finding 14)', async () => {
    let resolveExercises!: (value: Exercise[]) => void;
    vi.mocked(api.listExercises).mockImplementationOnce(
      () => new Promise<Exercise[]>((resolve) => (resolveExercises = resolve)),
    );
    vi.spyOn(api.trainTogether, 'join').mockResolvedValueOnce({
      session: makePartnerSession(),
      ended: null,
    });

    window.history.replaceState(null, '', '/#dashboard');
    await act(async () =>
      root.render(
        <ToastProvider>
          <UserContext.Provider value={makeSessionContext(ACCOUNT_A)}>
            <App />
          </UserContext.Provider>
        </ToastProvider>,
      ),
    );
    await act(async () => openTrainInvite('ColdStartCopyToken123456'));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    const startDialog = document.querySelector('dialog.train-together-start-sheet')!;
    expect(startDialog).not.toBeNull();
    // Copy button must be disabled/loading until exercises finish loading.
    const loadingBtn = [...startDialog.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('Loading your exercises'),
    );
    expect(loadingBtn).toBeDefined();
    expect(loadingBtn!.disabled).toBe(true);

    // Resolve exercises: now "Start with Sam Rivera’s exercises" becomes enabled.
    await act(async () => {
      resolveExercises([BENCH]);
      await Promise.resolve();
    });
    const copyBtn = [...startDialog.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('Start with Sam Rivera'),
    )!;
    expect(copyBtn.disabled).toBe(false);
    await act(async () => copyBtn.click());
    expect(document.body.textContent).toContain('Bench Press');
  });

  it('routes menu Leave session through shared handler that reports errors and guards double-press (finding 15)', async () => {
    const now = Date.now();
    writeActiveWorkoutDraft({
      version: 1,
      clientSessionId: '22222222-2222-4222-8222-222222222222',
      startedAt: now - 60_000,
      updatedAt: now - 5_000,
      lastActiveAt: now - 5_000,
      name: 'My Push',
      workoutDate: '2026-11-28',
      category: 'push',
      notes: '',
      movements: [],
    });
    vi.mocked(api.trainTogether.read).mockResolvedValue({
      session: makePartnerSession(),
      ended: null,
    });
    let rejectLeave!: (reason: unknown) => void;
    const leaveSpy = vi
      .spyOn(api.trainTogether, 'leave')
      .mockImplementationOnce(() => new Promise((_resolve, reject) => (rejectLeave = reject)));

    window.history.replaceState(null, '', '/#log');
    await act(async () =>
      root.render(
        <ToastProvider>
          <UserContext.Provider value={makeSessionContext(ACCOUNT_A)}>
            <App />
          </UserContext.Provider>
        </ToastProvider>,
      ),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    const openMenu = () =>
      document.querySelector<HTMLButtonElement>('[aria-label="Workout options"]')!.click();
    await act(async () => openMenu());
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="Leave session"]')!.click(),
    );
    // Second click while first is in flight is ignored.
    await act(async () => openMenu());
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="Leave session"]')!.click(),
    );
    expect(leaveSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectLeave(new Error('Offline — cannot leave right now'));
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain('Couldn’t leave the session. Try again.');
  });

  it('moves keyboard focus to partner banner on entry and restores partner Log button on return (finding 18)', async () => {
    const now = Date.now();
    writeActiveWorkoutDraft({
      version: 1,
      clientSessionId: '33333333-3333-4333-8333-333333333333',
      startedAt: now - 60_000,
      updatedAt: now - 5_000,
      lastActiveAt: now - 5_000,
      name: 'My Push',
      workoutDate: '2026-11-28',
      category: 'push',
      notes: '',
      movements: [],
    });
    vi.mocked(api.trainTogether.read).mockResolvedValue({
      session: makePartnerSession(),
      ended: null,
    });

    window.history.replaceState(null, '', '/#log');
    await act(async () =>
      root.render(
        <ToastProvider>
          <UserContext.Provider value={makeSessionContext(ACCOUNT_A)}>
            <App />
          </UserContext.Provider>
        </ToastProvider>,
      ),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    const logBtn = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('Log for'),
    )!;
    await act(async () => logBtn.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    // Focus must be inside the partner view banner / Back to mine (not document.body).
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.closest('.tt-partner-banner')).not.toBeNull();

    const backBtn = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('Back to mine'),
    )!;
    await act(async () => backBtn.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    // Focus must return to Sam's Log button.
    expect(document.activeElement?.getAttribute('data-tt-log-for')).toBe('u-sam');
  });

  it('resumes the live workout rather than keeping a browsed historical workout on join (finding 16)', async () => {
    const now = Date.now();
    writeActiveWorkoutDraft({
      version: 1,
      clientSessionId: '44444444-4444-4444-8444-444444444444',
      startedAt: now - 60_000,
      updatedAt: now - 5_000,
      lastActiveAt: now - 5_000,
      name: 'Live Today Push',
      workoutDate: '2026-11-28',
      category: 'push',
      notes: '',
      movements: [],
    });
    vi.mocked(api.listWorkouts).mockResolvedValue([
      {
        id: 'old-w1',
        name: 'Old Historical Pull',
        workout_date: '2026-11-20',
        category: 'pull',
        notes: null,
        duration_minutes: 45,
        start_time: null,
        end_time: null,
        is_sample: false,
        created_at: '2026-11-20T10:00:00Z',
        updated_at: '2026-11-20T10:00:00Z',
        movements: [],
      },
    ]);
    vi.spyOn(api.trainTogether, 'join').mockResolvedValueOnce({
      session: makePartnerSession(),
      ended: null,
    });

    window.history.replaceState(null, '', '/#log');
    await act(async () =>
      root.render(
        <ToastProvider>
          <UserContext.Provider value={makeSessionContext(ACCOUNT_A)}>
            <App />
          </UserContext.Provider>
        </ToastProvider>,
      ),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    // Browse back to the previous historical workout while on #log.
    const prevBtn = document.querySelector<HTMLButtonElement>('[aria-label="Previous workout"]');
    expect(prevBtn).not.toBeNull();
    await act(async () => prevBtn!.click());
    expect(document.body.textContent).toContain('Old Historical Pull');

    // Open a train invite link: must return from historical workout to live workout.
    await act(async () => openTrainInvite('ResumeLiveOnJoinToken1234'));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    const visibleSession = document.querySelector<HTMLElement>(
      '.workout-browser [data-workout-session]:not([hidden])',
    );
    expect(visibleSession?.textContent).toContain('Live Today Push');
    expect(visibleSession?.textContent).not.toContain('Old Historical Pull');
    expect(document.querySelector('.tt-deck-wrap')).not.toBeNull();
  });

  it('captures a train fragment navigation while signed out on the sign-in screen (finding 20)', async () => {
    const { AuthGate } = await import('./AuthGate');
    vi.spyOn(api.auth, 'me').mockRejectedValueOnce(
      new ApiError('Not authenticated', 'not_authenticated', 401),
    );
    vi.spyOn(api.auth, 'config').mockResolvedValueOnce({
      registration_enabled: false,
      invite_required: false,
    } as never);

    window.history.replaceState(null, '', '/');
    await act(async () =>
      root.render(
        <ToastProvider>
          <AuthGate>
            <App />
          </AuthGate>
        </ToastProvider>,
      ),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    // Same-document fragment navigation while signed out on AuthScreen.
    const token = 'SignedOutHashToken123456';
    await act(async () => {
      window.history.replaceState(null, '', `/#train=${token}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(window.location.hash).toBe('');
    expect(pendingTrainInvite()).toBe(token);
  });

  it('renders TrainedWithPill inside a real History card with visible and hidden partners (finding 23)', async () => {
    vi.mocked(api.listWorkouts).mockResolvedValue([
      {
        id: 'hist-w1',
        name: 'Partner Push',
        workout_date: '2026-11-28',
        category: 'push',
        notes: null,
        duration_minutes: 50,
        start_time: null,
        end_time: null,
        is_sample: false,
        created_at: '2026-11-28T10:00:00Z',
        updated_at: '2026-11-28T10:00:00Z',
        trained_with: [{ user_id: 'u-sam', display_name: 'Sam', username: 'sam', photo_url: null }],
        trained_with_count: 2,
        movements: [],
      },
    ]);

    window.history.replaceState(null, '', '/#history');
    await act(async () =>
      root.render(
        <ToastProvider>
          <UserContext.Provider value={makeSessionContext(ACCOUNT_A)}>
            <App />
          </UserContext.Provider>
        </ToastProvider>,
      ),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    const summary = document.querySelector('.history-card-summary');
    expect(summary).not.toBeNull();
    expect(summary?.querySelector('.tt-with-pill')?.textContent).toContain('with Sam & 1 other');
  });

  it('counts partner-mode interaction as activity on your own workout inactivity deadline (re-check 3)', async () => {
    vi.useFakeTimers();
    try {
      const start = 1_800_000_000_000;
      vi.setSystemTime(start);
      const initialFinishAt = start + 10 * 60_000;
      writeActiveWorkoutDraft({
        version: 1,
        clientSessionId: '33333333-3333-4333-8333-333333333333',
        startedAt: start - 3600_000,
        updatedAt: start - 60_000,
        lastActiveAt: start - 60_000,
        inactiveFinishAt: initialFinishAt,
        name: 'My Push',
        workoutDate: '2026-11-28',
        category: 'push',
        notes: '',
        movements: [
          {
            key: 'own-m1',
            exerciseId: BENCH.id,
            notes: '',
            machinePhotoIds: [],
            supersetKey: null,
            sets: [
              {
                key: 'own-s1',
                reps: 8,
                weight_kg: 80,
                rpe: null,
                rest_seconds: null,
                duration_seconds: null,
                distance_km: null,
                notes: null,
                completed: true,
              },
            ],
          },
        ],
      });
      vi.mocked(api.trainTogether.read).mockResolvedValue({
        session: makePartnerSession(),
        ended: null,
      });

      window.history.replaceState(null, '', '/#log');
      await act(async () =>
        root.render(
          <ToastProvider>
            <UserContext.Provider value={makeSessionContext(ACCOUNT_A)}>
              <App />
            </UserContext.Provider>
          </ToastProvider>,
        ),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      const logForBtn = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes('Log for'),
      )!;
      await act(async () => logForBtn.click());
      expect(document.body.textContent).toContain('Logging for Sam Rivera');

      // Advance past the 15s activity persistence throttle and interact inside Partner Mode.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      const partnerReps = document.querySelector<HTMLInputElement>(
        '.tt-partner-view input[aria-label*="reps"]',
      )!;
      expect(partnerReps).not.toBeNull();
      await act(async () => {
        partnerReps.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        partnerReps.dispatchEvent(new KeyboardEvent('keydown', { key: '9', bubbles: true }));
      });

      const saved = readActiveWorkoutDraft();
      expect(saved?.inactiveFinishAt).toBeGreaterThan(initialFinishAt);
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes partner mode and shows partnerAccessEndedNotice as an error toast on train_no_workout (case 2)', async () => {
    const now = Date.now();
    writeActiveWorkoutDraft({
      version: 1,
      clientSessionId: '44444444-4444-4444-8444-444444444444',
      startedAt: now - 60_000,
      updatedAt: now - 5_000,
      lastActiveAt: now - 5_000,
      name: 'My Push',
      workoutDate: '2026-11-28',
      category: 'push',
      notes: '',
      movements: [],
    });
    vi.mocked(api.trainTogether.read)
      .mockResolvedValueOnce({ session: makePartnerSession(), ended: null })
      .mockResolvedValue({ session: null, ended: null });
    vi.spyOn(api.trainTogether, 'changePartnerWorkout').mockRejectedValueOnce(
      new ApiError('Server raw wording that must not be used.', TRAIN_ERRORS.noWorkout, 404),
    );

    window.history.replaceState(null, '', '/#log');
    await act(async () =>
      root.render(
        <ToastProvider>
          <UserContext.Provider value={makeSessionContext(ACCOUNT_A)}>
            <App />
          </UserContext.Provider>
        </ToastProvider>,
      ),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    const logForBtn = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('Log for'),
    )!;
    await act(async () => logForBtn.click());
    expect(document.querySelector('.tt-partner-view')).not.toBeNull();

    const tickBtn = document.querySelector<HTMLButtonElement>(
      '.tt-partner-view button[aria-label*="set 1"]',
    )!;
    await act(async () => {
      tickBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // Returned to own logger, partner view closed, shared error toast shown.
    expect(document.querySelector('.tt-partner-view')).toBeNull();
    const errorToast = document.querySelector('[data-variant="error"][role="alert"]');
    expect(errorToast?.textContent).toContain('Sam Rivera’s workout is no longer open to you.');
  });
});
