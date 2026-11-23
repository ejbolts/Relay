import { onlineManager, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, AppState } from 'react-native';
import { ACTIVE_WORKOUT_SYNC_KEY } from '../../../../frontend/src/activeWorkoutEvents';
import {
  ActiveWorkoutSynchronizer,
  draftSignature,
  type SharedWorkoutSnapshot,
  type WorkoutSyncConflict,
  type WorkoutSyncStatus,
} from '../../../../frontend/src/activeWorkoutSynchronizer';
import {
  inactiveWorkoutFinishAt,
  inactiveWorkoutTimes,
  setInactiveWorkoutLimitMinutes,
} from '../../../../frontend/src/activeWorkoutTimeout';
import {
  addFinishedWorkout,
  finishedWorkoutKey,
  readFinishedWorkouts,
  removeFinishedWorkout,
  type FinishedWorkout,
} from '../../../../frontend/src/finishedWorkoutQueue';
import {
  moveDraftToFinishedQueue,
  rebasedFinishedWorkout,
  reviewedFinishedWorkout,
} from '../../../../frontend/src/finishedWorkoutSend';
import { buildFinishSummary, type FinishSummary } from '../../../../frontend/src/finishSummary';
import { readStoredRestTimer, writeStoredRestTimer } from '../../../../frontend/src/liveRestTimer';
import { nextSetAfterRest } from '../../../../frontend/src/restComplete';
import { typeSessionTemplate } from '../../../../frontend/src/routines';
import { sessionTemplateFor, type SessionTemplate } from '../../../../frontend/src/trainingSummary';
import type {
  Exercise,
  ExerciseCreateInput,
  PersonalRecord,
  TrackedWorkout,
  User,
  WorkoutCategory,
  WorkoutInput,
  WorkoutType,
} from '../../../../frontend/src/types';
import { localDate, mergeUniqueById } from '../../../../frontend/src/utils';
import type { WeightUnit } from '../../../../frontend/src/weightUnits';
import { loggedSetCount } from '../../../../frontend/src/workoutAutoSave';
import {
  clearActiveWorkoutDraft,
  isActiveWorkoutDraft,
  isExpiredEmptyWorkoutDraft,
  readActiveWorkoutDraft,
  writeActiveWorkoutDraft,
  type ActiveWorkoutDraft,
} from '../../../../frontend/src/workoutDraft';
import type { WorkoutDraftSet } from '../../../../frontend/src/workoutMovements';
import type { WorkoutPause } from '../../../../frontend/src/workoutPause';
import { templateDraftMovements } from '../../../../frontend/src/workoutStartMovements';
import { DEFAULT_WORKOUT_TYPES } from '../../../../frontend/src/workoutTypes';
import { ApiError, apiGet, apiSend } from '../../data/api';
import { deviceStorage, newId, readJson, writeJson } from '../../data/deviceStorage';
import {
  queryKeys,
  refreshTraining,
  useDashboard,
  useExercises,
  useSavedExercises,
  useTrainingPreferences,
  useUpNext,
  useWorkoutHistory,
  useWorkoutTypes,
} from '../../data/queries';
import { useOptionalSession } from '../../session/SessionProvider';
import { showToast, ToastHost } from '../../ui/Toast';
import { FinishedQueueSender, type QueueStatus } from './finishedQueueSender';
import {
  addSet as addSetRule,
  checkFinish,
  chooseWorkoutType,
  continueWorkout,
  finishInput,
  resumeLogger,
  inactiveEndAt,
  isInactive,
  loggerFromDraft,
  loggerToDraft,
  setCounts,
  startLogger,
  togglePause as togglePauseRule,
  updateSet as updateSetRule,
  withActivity,
  workoutIdentity,
  type LoggerContext,
  type LoggerState,
} from './loggerState';
import { useHistoryBaselines, useWorkoutAutoSave } from './loggerQueries';
import { forgetOfflineQueries, saveOfflineQueries, seedOfflineQueries } from './offlineQueries';
import { askForRestAlerts, syncRestAlert } from './restAlerts';
import { SyncConflictButton, SyncConflictSheet } from './SyncConflictSheet';
import {
  adjustRest as adjustRestRule,
  NO_REST,
  pauseRest,
  restFromStored,
  restToStored,
  resumeRest,
  settleRest,
  startRest as startRestRule,
  type RestState,
} from './restTimer';

/**
 * How a workout starts, matching the web's Start menu: the recommended session, an empty
 * workout, a cardio session, or a given template (a planned day, or repeating a past workout).
 */
export type StartChoice =
  | { kind: 'up-next' }
  | { kind: 'empty' }
  | { kind: 'cardio' }
  | {
      kind: 'template';
      /** Null starts a planned day that has no exercises to suggest yet, keeping its type. */
      template: SessionTemplate | null;
      name: string;
      /** A planned day's category and type, when it has them. */
      category?: WorkoutCategory | null;
      type?: WorkoutType | null;
    };

/** A finished workout the server refused to save, waiting to be reviewed or discarded. */
export interface RefusedSave {
  key: string;
  name: string;
  durationMinutes: number | null;
  /** Why the server refused it. */
  message: string;
  /** Changes to a saved workout that was resumed, rather than a new workout. */
  resumed: boolean;
  /** Refused because that saved workout changed on another device; this version can still win. */
  conflict: boolean;
}

/** What the rest of the app may know about the workout in progress. */
export interface LiveWorkout {
  name: string;
  /** The saved workout being resumed, or null for a new workout. */
  resumedWorkoutId: string | null;
  /** A resumed workout's saved minutes, which its clock adds to. */
  previousDurationMinutes: number;
  startedAt: number;
  /** The day it is logged on: today, or the earlier day it was started for. */
  workoutDate: string;
  pause: WorkoutPause;
  loggedSets: number;
}

export interface WorkoutApi {
  live: LiveWorkout | null;
  /**
   * Starts a workout and opens the logger. Ignored while one is already live: use `open`. From
   * another sheet (the Start menu), pass `replace` so the logger takes that sheet's place. `date`
   * logs it on an earlier day, as the web does from an empty calendar day; it starts today without.
   */
  start: (choice: StartChoice, options?: { replace?: boolean; date?: string }) => void;
  /** Shows the logger for the live workout. Dismissing the logger only minimises it. */
  open: () => void;
  /** The Start tab: the Start menu, or the logger while a workout is live. */
  openStartMenu: () => void;
  /** Ends the live workout without saving. */
  discard: () => void;
  /** Finished workouts stored on this phone until the server confirms them. */
  queue: QueueStatus;
  /** Finished workouts the server refused, oldest first. */
  refused: RefusedSave[];
  /** Reopens a refused workout in the logger to change and finish again. */
  review: (key: string) => void;
  /** Drops a refused workout that has not synced. */
  discardRefused: (key: string) => void;
  /** Sends a refused resumed workout again over the version another device saved since. */
  keepMine: (key: string) => void;
  /** Reopens a saved workout to log more, as the web's Resume does. */
  resume: (workout: TrackedWorkout) => void;
  /** The workout in progress was changed on two devices at once; a choice is needed. */
  syncConflict: WorkoutSyncConflict | null;
  /** Whether that choice is showing; closing it leaves a button to bring it back. */
  syncConflictOpen: boolean;
  showSyncConflict: (open: boolean) => void;
  /** Keeps this device's version (true) or the other device's. */
  resolveSync: (useLocal: boolean) => void;
  /**
   * Shows the sync choice inside the calling sheet while it is mounted (a page sheet covers the
   * app's own). Returns the release.
   */
  hostSyncConflict: () => () => void;
  /** Whether a sheet is showing the sync choice instead of the app. */
  syncConflictHosted: boolean;
}

/** The workout just finished, shown in the logger sheet until it is closed. */
export interface FinishedView {
  sessionId: string;
  summary: FinishSummary;
  payload: WorkoutInput;
  /** The saved workout's id once the server confirmed it. */
  savedId: string | null;
  records: PersonalRecord[] | null;
}

export type FinishResult = { ok: true } | { ok: false; message: string };

/** The logger sheet's view of the engine. */
export interface LoggerApi {
  state: LoggerState | null;
  rest: RestState;
  finished: FinishedView | null;
  types: WorkoutType[];
  exercises: Exercise[];
  history: TrackedWorkout[];
  weightUnit: WeightUnit;
  context: LoggerContext;
  /** The live workout now, for event handlers. */
  getState: () => LoggerState | null;
  /** Adds a custom exercise to the account, as the web's exercise picker does. */
  createExercise: (input: ExerciseCreateInput) => Promise<Exercise>;
  /** Changes the live workout; it is stored before the next frame. */
  change: (update: (state: LoggerState) => LoggerState) => void;
  updateSet: (movementKey: string, setKey: string, update: Partial<WorkoutDraftSet>) => void;
  addSet: (movementKey: string) => void;
  chooseType: (type: WorkoutType) => void;
  togglePause: () => void;
  startRest: (seconds: number) => void;
  adjustRest: (deltaSeconds: number) => void;
  skipRest: () => void;
  dismissRestDone: () => void;
  /** The finish check, and how many sets are ticked or entered but unticked. */
  checkFinish: () => {
    blocker: string | null;
    ticked: number;
    unticked: number;
  };
  /**
   * Agrees the workout with the server's shared copy, then queues it for saving (offline too) and
   * shows its summary. `endAt` ends a workout left running at its last activity.
   */
  finish: (endAt?: number) => Promise<FinishResult>;
  closeFinished: () => void;
}

const WorkoutContext = createContext<WorkoutApi | null>(null);
const LoggerApiContext = createContext<LoggerApi | null>(null);

export function useWorkout() {
  const workout = useContext(WorkoutContext);
  if (!workout) throw new Error('useWorkout needs a WorkoutProvider');
  return workout;
}

/** The engine behind the logger sheet; null while signed out. */
export function useLogger() {
  return useContext(LoggerApiContext);
}

const EMPTY_QUEUE: QueueStatus = {
  waiting: 0,
  sending: false,
  refusals: {},
  conflicts: [],
  outdated: false,
};
/** Which account the active draft belongs to, so another account never opens it. */
const DRAFT_OWNER_KEY = 'relay.mobile.active-workout-owner.v1';
/** The exercises the active draft uses, so it restores offline after the app was closed. */
const DRAFT_EXERCISES_KEY = 'relay.mobile.active-workout-exercises.v1';

/**
 * Holds the workout in progress for the whole app, so the logger sheet can be dismissed
 * (minimised) and reopened from the tab bar. This is the contract every screen starts workouts
 * through. While signed in, the engine keeps the live workout in the web's draft format on the
 * phone after every change and sends finished workouts until the server confirms them.
 */
export function WorkoutProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const status = useOptionalSession()?.status ?? { kind: 'signed-out' as const };
  const [engine, setEngine] = useState<{
    workout: WorkoutApi;
    logger: LoggerApi;
  } | null>(null);
  const signedIn = status.kind === 'signed-in';
  const user = signedIn ? status.user : null;
  const signedOut = status.kind === 'signed-out';

  useEffect(() => {
    if (signedOut) forgetOfflineQueries();
  }, [signedOut]);

  const idle = useMemo<WorkoutApi>(
    () => ({
      live: null,
      start: () => undefined,
      open: () => router.push('/workout'),
      openStartMenu: () => router.push('/start-workout'),
      discard: () => undefined,
      queue: EMPTY_QUEUE,
      refused: [],
      review: () => undefined,
      discardRefused: () => undefined,
      keepMine: () => undefined,
      resume: () => undefined,
      syncConflict: null,
      syncConflictOpen: false,
      showSyncConflict: () => undefined,
      resolveSync: () => undefined,
      hostSyncConflict: () => () => undefined,
      syncConflictHosted: false,
    }),
    [router],
  );
  const published = user && engine ? engine : null;
  return (
    <WorkoutContext.Provider value={published?.workout ?? idle}>
      <LoggerApiContext.Provider value={published?.logger ?? null}>
        {user && <WorkoutEngine key={user.id} user={user} publish={setEngine} />}
        {children}
        {published && !published.workout.syncConflictHosted && (
          <>
            <SyncConflictSheet />
            <SyncConflictButton />
          </>
        )}
        <ToastHost bottom={96} />
      </LoggerApiContext.Provider>
    </WorkoutContext.Provider>
  );
}

type Restore =
  | { kind: 'none' }
  /** A stored draft that must not open: another account's, already finished, or abandoned. */
  | { kind: 'stale' }
  | { kind: 'restored'; state: LoggerState; rest: RestState }
  | { kind: 'waiting'; draft: ActiveWorkoutDraft };

/** The live workout stored on the phone, if it can open for `userId`. */
function restoreDraft(userId: string, exercises: Exercise[]): Restore {
  const draft = readActiveWorkoutDraft(deviceStorage);
  if (!draft) return { kind: 'none' };
  const owner = readJson<string>(DRAFT_OWNER_KEY);
  // Finished and queued just before the app closed: the queue sends it.
  const queued = readFinishedWorkouts(deviceStorage).some(
    (item) => item.clientSessionId === draft.clientSessionId,
  );
  if ((owner && owner !== userId) || queued || isExpiredEmptyWorkoutDraft(draft))
    return { kind: 'stale' };
  const state = loggerFromDraft(draft, exercises);
  if (!state) return { kind: 'waiting', draft };
  return {
    kind: 'restored',
    state,
    rest: restFromStored(readStoredRestTimer(deviceStorage), state.clientSessionId, Date.now()),
  };
}

/**
 * Stores the finished workout in the queue, from exactly this version of its draft, before any
 * request. Returns why it could not, or null.
 */
function queueFinishedWorkout(
  state: LoggerState,
  payload: WorkoutInput,
  userId: string,
  now: number,
): string | null {
  writeActiveWorkoutDraft(loggerToDraft(state, now), deviceStorage);
  try {
    moveDraftToFinishedQueue(payload, userId, now, deviceStorage);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Could not finish the workout.';
  }
}

/** The server's shared copy, checked before anything acts on it. */
function snapshotOf(value: unknown): SharedWorkoutSnapshot {
  const snapshot = value as Partial<SharedWorkoutSnapshot> | null;
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    !Number.isInteger(snapshot.revision) ||
    snapshot.revision! < 0 ||
    (snapshot.draft !== null && typeof snapshot.draft !== 'object')
  )
    throw new Error('Relay sent an unexpected workout.');
  return { revision: snapshot.revision!, draft: snapshot.draft ?? null };
}

function sameIds(left: Exercise[], right: Exercise[]) {
  return left.length === right.length && left.every((item, index) => item.id === right[index].id);
}

// Memoised: its parent re-renders whenever the engine publishes, which must not loop back.
const WorkoutEngine = memo(function WorkoutEngine({
  user,
  publish,
}: {
  user: User;
  publish: (engine: { workout: WorkoutApi; logger: LoggerApi } | null) => void;
}) {
  const client = useQueryClient();
  const router = useRouter();
  // Offline copies fill the cache before the queries below first read it.
  useState(() => seedOfflineQueries(client, user.id));
  useEffect(() => saveOfflineQueries(client, user.id), [client, user.id]);

  const dashboard = useDashboard();
  const historyQuery = useWorkoutHistory();
  const typesQuery = useWorkoutTypes();
  const saved = useSavedExercises();
  const exercisesQuery = useExercises();
  const preferences = useTrainingPreferences();
  const upNext = useUpNext();
  const historyBaselines = useHistoryBaselines();
  const autoSaveMinutes = useWorkoutAutoSave().data?.after_minutes;
  const history = useMemo(() => historyQuery.data ?? [], [historyQuery.data]);
  const types = typesQuery.data ?? DEFAULT_WORKOUT_TYPES;
  // Only a first load in progress holds up Finish; offline, the saved or built-in types apply.
  const typesLoading = typesQuery.isPlaceholderData && typesQuery.fetchStatus === 'fetching';
  const weightUnit: WeightUnit = preferences.data?.preferred_weight_unit ?? 'kg';
  const defaultRest = preferences.data?.default_rest_seconds ?? null;
  const fetchedExercises = exercisesQuery.data;

  const context = useMemo<LoggerContext>(
    () => ({ workouts: history, historyBaselines, weightUnit, defaultRest, newKey: newId }),
    [history, historyBaselines, weightUnit, defaultRest],
  );

  // The workout a closed app left behind, restored before the first frame.
  const [initial] = useState(() =>
    restoreDraft(user.id, [
      ...(readJson<Exercise[]>(DRAFT_EXERCISES_KEY) ?? []),
      ...(client.getQueryData<Exercise[]>(queryKeys.exercises) ?? []),
    ]),
  );
  const [logger, setLogger] = useState<LoggerState | null>(
    initial.kind === 'restored' ? initial.state : null,
  );
  const [rest, setRest] = useState<RestState>(initial.kind === 'restored' ? initial.rest : NO_REST);
  const loggerRef = useRef(logger);
  const restRef = useRef(rest);
  const [finished, setFinished] = useState<FinishedView | null>(null);
  const [queue, setQueue] = useState<QueueStatus>(EMPTY_QUEUE);
  // Sets added with Add set this session: ticking one never folds its exercise away.
  const addedSetKeys = useRef(new Set<string>());
  const [draftExercises, setDraftExercises] = useState<Exercise[]>(
    () => readJson<Exercise[]>(DRAFT_EXERCISES_KEY) ?? [],
  );
  const draftExercisesRef = useRef(draftExercises);
  const storageWarned = useRef(false);

  const allExercises = useMemo(() => {
    const byId = new Map<string, Exercise>();
    for (const exercise of [...draftExercises, ...(fetchedExercises ?? [])])
      byId.set(exercise.id, exercise);
    return [...byId.values()];
  }, [draftExercises, fetchedExercises]);

  // A draft naming an exercise the phone had not cached (restored, or from another device)
  // waits for the exercise list to load from the server after it arrived.
  const [waiting, setWaiting] = useState<{ draft: ActiveWorkoutDraft; since: number } | null>(
    initial.kind === 'waiting' ? { draft: initial.draft, since: 1 } : null,
  );
  if (waiting && fetchedExercises && exercisesQuery.dataUpdatedAt >= waiting.since) {
    setWaiting(null);
    const restored = loggerFromDraft(waiting.draft, allExercises);
    if (restored) {
      setLogger(restored);
      setRest(restFromStored(readStoredRestTimer(deviceStorage), restored.clientSessionId));
    }
  }
  // Handlers read the latest workout from these refs; a render-time restore lands here too.
  useLayoutEffect(() => {
    loggerRef.current = logger;
    restRef.current = rest;
  }, [logger, rest]);
  useEffect(() => {
    if (initial.kind !== 'stale') return;
    // Another account's, already finished, or abandoned with nothing logged.
    clearActiveWorkoutDraft(deviceStorage);
    writeStoredRestTimer(null, deviceStorage);
    writeJson(DRAFT_OWNER_KEY, null);
  }, [initial]);

  const commitRest = useCallback((next: RestState) => {
    restRef.current = next;
    const sessionId = loggerRef.current?.clientSessionId;
    writeStoredRestTimer(sessionId ? restToStored(next, sessionId) : null, deviceStorage);
    setRest(next);
  }, []);

  // Every stored change reaches the other devices shortly after, as the web's sync does.
  const syncRef = useRef<ActiveWorkoutSynchronizer | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scheduleSync = useCallback(() => {
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void syncRef.current?.sync(), 400);
  }, []);

  const rememberExercises = useCallback((next: LoggerState) => {
    const used = next.movements.map((movement) => movement.exercise);
    if (sameIds(used, draftExercisesRef.current)) return;
    draftExercisesRef.current = used;
    writeJson(DRAFT_EXERCISES_KEY, used);
    setDraftExercises(used);
  }, []);

  /** Stores the live workout synchronously, then shows it. */
  const commit = useCallback(
    (next: LoggerState | null) => {
      loggerRef.current = next;
      if (next) {
        const stored = writeActiveWorkoutDraft(loggerToDraft(next, Date.now()), deviceStorage);
        if (!stored && !storageWarned.current) {
          storageWarned.current = true;
          showToast('Could not store this workout on the phone. Keep the app open.');
        }
        writeJson(DRAFT_OWNER_KEY, user.id);
        rememberExercises(next);
      } else {
        clearActiveWorkoutDraft(deviceStorage);
        writeJson(DRAFT_OWNER_KEY, null);
      }
      setLogger(next);
      scheduleSync();
    },
    [user.id, rememberExercises, scheduleSync],
  );

  // A rest that runs out becomes the "rest complete" prompt, with a buzz while the app is open.
  useEffect(() => {
    const timer = rest.timer;
    if (!timer || timer.pausedLeft !== null) return;
    const settle = () => {
      const next = settleRest(restRef.current, Date.now());
      if (next === restRef.current) return;
      commitRest(next);
      if (AppState.currentState === 'active')
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };
    const wait = setTimeout(settle, Math.max(0, timer.endsAt - Date.now()));
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') settle();
    });
    return () => {
      clearTimeout(wait);
      app?.remove();
    };
  }, [rest.timer, commitRest]);

  // The phone alerts when a rest ends in the background; the alert follows every change to it.
  useEffect(() => {
    const current = loggerRef.current;
    const next =
      current && (rest.timer || rest.done)
        ? nextSetAfterRest(current.movements, rest.timer?.movementKey ?? null, weightUnit)
        : null;
    void syncRestAlert(
      rest,
      next ? [next.exercise, next.set, next.target].filter(Boolean).join(' · ') : null,
    );
  }, [rest, weightUnit]);
  useEffect(() => () => void syncRestAlert(NO_REST, null), []);

  // Finished workouts send until the server confirms them, retrying when the connection or the
  // app comes back.
  const senderRef = useRef<FinishedQueueSender | null>(null);
  const refusalsSeen = useRef<Record<string, string>>({});
  const finishedSessionRef = useRef<string | null>(null);
  const reviewRef = useRef<(key: string) => void>(() => undefined);
  useEffect(() => {
    const sender = new FinishedQueueSender({
      storage: deviceStorage,
      userId: user.id,
      send: (item: FinishedWorkout) =>
        item.pendingSave.workoutId
          ? apiSend<TrackedWorkout>(
              `/api/workouts/${encodeURIComponent(item.pendingSave.workoutId)}`,
              'PUT',
              item.pendingSave.payload,
            )
          : apiSend<TrackedWorkout>('/api/workouts', 'POST', item.pendingSave.payload),
      online: () => onlineManager.isOnline(),
      describe: (error) => ({
        status: error instanceof ApiError ? error.status : undefined,
        outdated: error instanceof ApiError && error.status === 426,
        message: error instanceof Error ? error.message : 'Relay could not save this workout.',
        conflict:
          error instanceof ApiError && error.status === 409 && error.code === 'workout_conflict',
      }),
      onSaved: (workout, item, remaining) => {
        if (remaining === 0) void refreshTraining(client);
        // The queue no longer owns this session's shared copy.
        void syncRef.current?.sync();
        setFinished((current) =>
          current && current.sessionId === item.clientSessionId
            ? { ...current, savedId: workout.id }
            : current,
        );
        // Finished a while ago (offline): say it reached the server.
        if (Date.now() - item.pendingSave.finishedAt > 10_000) showToast('Workout saved');
        apiGet<PersonalRecord[]>(
          `/api/personal-records?workout_id=${encodeURIComponent(workout.id)}&include_blocks=true&include_fresh_start=true`,
        )
          .then((records) =>
            setFinished((current) =>
              current?.savedId === workout.id ? { ...current, records } : current,
            ),
          )
          .catch(() => undefined);
      },
      onChange: (next) => {
        // A newly refused workout says so, unless its summary is already showing why.
        for (const key of Object.keys(next.refusals)) {
          if (key in refusalsSeen.current || key === finishedSessionRef.current) continue;
          const item = readFinishedWorkouts(deviceStorage).find(
            (entry) => finishedWorkoutKey(entry) === key,
          );
          showToast(`${item?.pendingSave.payload.name ?? 'A workout'} wasn't saved`, {
            label: 'Review',
            run: () => reviewRef.current(key),
          });
        }
        refusalsSeen.current = next.refusals;
        setQueue(next);
      },
    });
    senderRef.current = sender;
    // The app feeds onlineManager from NetInfo (src/data/queryClient.ts).
    const net = onlineManager.subscribe((online) => {
      if (online) sender.wake();
    });
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') sender.wake();
    });
    sender.wake();
    return () => {
      sender.stop();
      senderRef.current = null;
      net();
      app?.remove();
    };
  }, [client, user.id]);

  const change = useCallback(
    (update: (state: LoggerState) => LoggerState) => {
      const current = loggerRef.current;
      if (!current) return;
      const next = update(current);
      if (next !== current) commit(withActivity(next, Date.now()));
    },
    [commit],
  );

  const startRest = useCallback(
    (seconds: number, movementKey: string | null = null) => {
      void askForRestAlerts();
      commitRest(startRestRule(seconds, movementKey, Date.now(), newId()));
      // A rest started while paused waits for the workout to resume.
      if (loggerRef.current?.pause.pausedAt != null)
        commitRest(pauseRest(restRef.current, Date.now()));
    },
    [commitRest],
  );

  const updateSet = useCallback(
    (movementKey: string, setKey: string, update: Partial<WorkoutDraftSet>) => {
      const current = loggerRef.current;
      if (!current) return;
      const result = updateSetRule(current, movementKey, setKey, update, {
        addedByHand: addedSetKeys.current.has(setKey),
        workoutBodyweight: null,
      });
      const wasPaused = current.pause.pausedAt !== null;
      commit(withActivity(result.state, Date.now()));
      if (result.loggingSet) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (wasPaused) commitRest(resumeRest(restRef.current, Date.now()));
        if (restRef.current.done) commitRest({ ...restRef.current, done: null });
      }
      if (result.restSeconds !== null) {
        const movement = current.movements.find((item) => item.key === movementKey);
        const groupStart = movement?.supersetKey
          ? current.movements.find((item) => item.supersetKey === movement.supersetKey)?.key
          : undefined;
        startRest(result.restSeconds, groupStart ?? movementKey);
      }
    },
    [commit, commitRest, startRest],
  );

  const addSet = useCallback(
    (movementKey: string) => {
      const current = loggerRef.current;
      if (!current) return;
      const { state, setKey } = addSetRule(current, movementKey, context);
      if (setKey) addedSetKeys.current.add(setKey);
      commit(withActivity(state, Date.now()));
    },
    [commit, context],
  );

  const chooseType = useCallback(
    (type: WorkoutType) =>
      change((state) => {
        const next = chooseWorkoutType(state, type, types);
        // An empty workout takes on the exercises saved to its new type; logged work never.
        const savedForType = saved.data?.[type.id];
        if (state.movements.length || !savedForType?.length) return next;
        return {
          ...next,
          movements: templateDraftMovements(
            typeSessionTemplate(type, savedForType, type.name, state.workoutDate, weightUnit)
              .exercises,
            { ...context, date: state.workoutDate },
          ),
        };
      }),
    [change, types, saved.data, weightUnit, context],
  );

  const togglePause = useCallback(() => {
    const current = loggerRef.current;
    if (!current) return;
    const now = Date.now();
    const pausing = current.pause.pausedAt === null;
    commit(togglePauseRule(current, now));
    commitRest(pausing ? pauseRest(restRef.current, now) : resumeRest(restRef.current, now));
  }, [commit, commitRest]);

  const discard = useCallback(() => {
    commit(null);
    commitRest(NO_REST);
    addedSetKeys.current.clear();
  }, [commit, commitRest]);

  const open = useCallback(() => router.push('/workout'), [router]);

  const start = useCallback(
    (choice: StartChoice, options?: { replace?: boolean; date?: string }) => {
      if (!loggerRef.current) {
        const date = options?.date ?? localDate();
        let template: SessionTemplate | null = null;
        let startCategory: WorkoutCategory | null = null;
        let startType: WorkoutType | null = null;
        if (choice.kind === 'up-next') {
          template = upNext.template;
          startCategory = upNext.recommendation?.category ?? null;
          startType = upNext.type ?? null;
        } else if (choice.kind === 'cardio') {
          // Cardio starts from the saved cardio exercises, or else the most recent cardio workout.
          const cardio = types.find((type) => type.id === 'cardio');
          const savedCardio = saved.data?.cardio;
          template =
            cardio && savedCardio?.length
              ? typeSessionTemplate(cardio, savedCardio, 'Cardio workout', date, weightUnit)
              : sessionTemplateFor(history, 'cardio', date, weightUnit);
          startCategory = 'cardio';
        } else if (choice.kind === 'template') {
          template = choice.template;
          startCategory = choice.category ?? null;
          startType = choice.type ?? null;
        }
        addedSetKeys.current.clear();
        setFinished(null);
        commit(
          startLogger(
            {
              template,
              startCategory,
              startType,
              recommendationCategory: dashboard.data?.recommendation?.category ?? null,
              types,
              date,
              now: Date.now(),
              clientSessionId: newId(),
            },
            context,
          ),
        );
        commitRest(NO_REST);
      }
      if (options?.replace) router.replace('/workout');
      else router.push('/workout');
    },
    [
      router,
      upNext,
      types,
      saved.data,
      weightUnit,
      history,
      dashboard.data,
      context,
      commit,
      commitRest,
    ],
  );

  // Navigating from here, the root layout, reaches the root stack's sheets; a push made from
  // inside the native tab layout's press handler does not present them.
  const openStartMenu = useCallback(
    () => router.push(loggerRef.current ? '/workout' : '/start-workout'),
    [router],
  );

  const runCheck = useCallback(() => {
    const current = loggerRef.current;
    if (!current) return { blocker: 'No workout in progress.', ticked: 0, unticked: 0 };
    const check = checkFinish(current, types, typesLoading, Date.now());
    return {
      blocker:
        check.kind === 'blocked'
          ? check.message
          : check.kind === 'machines'
            ? `Choose a machine for every set of ${check.exercise}.`
            : null,
      ...setCounts(current),
    };
  }, [types, typesLoading]);

  const finishing = useRef(false);
  const finish = useCallback(
    async (endAt?: number): Promise<FinishResult> => {
      const blocked = (check: ReturnType<typeof checkFinish>) =>
        check.kind === 'ready'
          ? null
          : check.kind === 'blocked'
            ? check.message
            : `Choose a machine for every set of ${check.exercise}.`;
      const before = loggerRef.current;
      if (!before) return { ok: false, message: 'No workout in progress.' };
      const precheck = blocked(checkFinish(before, types, typesLoading, Date.now(), endAt));
      if (precheck) return { ok: false, message: precheck };
      if (finishing.current) return { ok: false, message: 'This workout is already finishing.' };
      // The shared copy is brought up to date first, so the save consumes exactly the revision
      // this phone last agreed with the server. Offline, it saves against the last known one.
      let shared: Partial<WorkoutInput> = {};
      finishing.current = true;
      try {
        clearTimeout(syncTimer.current);
        shared = (await syncRef.current?.finishFields()) ?? {};
      } catch (reason) {
        return {
          ok: false,
          message: reason instanceof Error ? reason.message : 'Could not sync this workout.',
        };
      } finally {
        finishing.current = false;
      }
      const current = loggerRef.current;
      if (!current || current.clientSessionId !== before.clientSessionId)
        return {
          ok: false,
          message:
            'Workout updated from another device. Review the latest sets, then finish again.',
        };
      const now = Date.now();
      const check = checkFinish(current, types, typesLoading, now, endAt);
      if (check.kind !== 'ready') return { ok: false, message: blocked(check)! };
      const payload = { ...shared, ...finishInput(current, types, check) };
      const failed = queueFinishedWorkout(current, payload, user.id, now);
      if (failed) return { ok: false, message: failed };
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      finishedSessionRef.current = current.clientSessionId;
      setFinished({
        sessionId: current.clientSessionId,
        summary: buildFinishSummary(payload, allExercises, history, now),
        payload,
        savedId: null,
        records: null,
      });
      commitRest(NO_REST);
      writeJson(DRAFT_OWNER_KEY, null);
      loggerRef.current = null;
      setLogger(null);
      addedSetKeys.current.clear();
      senderRef.current?.wake();
      setQueue(senderRef.current?.status() ?? EMPTY_QUEUE);
      void syncRef.current?.sync();
      return { ok: true };
    },
    [types, typesLoading, user.id, allExercises, history, commitRest],
  );

  const createExercise = useCallback(
    async (input: ExerciseCreateInput) => {
      const exercise = await apiSend<Exercise>('/api/exercises', 'POST', input);
      client.setQueryData<Exercise[]>(queryKeys.exercises, (current) =>
        mergeUniqueById(current ?? [], [exercise]),
      );
      return exercise;
    },
    [client],
  );

  const closeFinished = useCallback(() => {
    finishedSessionRef.current = null;
    setFinished(null);
  }, []);

  // The account's auto-save time replaces the three-hour cutoff, as on the web; a change moves
  // the cutoff of the workout in progress too.
  const appliedAutoSave = useRef<number | null>(null);
  useEffect(() => {
    if (autoSaveMinutes === undefined || autoSaveMinutes === appliedAutoSave.current) return;
    appliedAutoSave.current = autoSaveMinutes;
    setInactiveWorkoutLimitMinutes(autoSaveMinutes);
    const current = loggerRef.current;
    if (current && !isInactive(current, Date.now()))
      commit({
        ...current,
        inactiveFinishAt: inactiveWorkoutFinishAt(current.startedAt, current.lastActiveAt),
      });
  }, [autoSaveMinutes, commit]);

  // A workout left running past its cutoff with sets logged is never saved unasked: it asks
  // whether to save it (ending at its last activity), resume it or discard it.
  const promptOpen = useRef(false);
  const askAgain = useRef(() => undefined as void);
  const checkInactive = useCallback(() => {
    const current = loggerRef.current;
    if (!current || promptOpen.current || !isInactive(current, Date.now())) return;
    promptOpen.current = true;
    const close = () => {
      promptOpen.current = false;
    };
    const resume = () => {
      const latest = loggerRef.current;
      if (latest) commit(continueWorkout(latest, Date.now()));
    };
    const endedAt = inactiveEndAt(current);
    const times = inactiveWorkoutTimes(current.startedAt, endedAt);
    const sets = loggedSetCount(current.movements);
    Alert.alert(
      'Unfinished workout',
      `${workoutIdentity(current, types).name}\nStarted ${times.started} · ended ${times.ended} · ${sets} ${sets === 1 ? 'set' : 'sets'} logged`,
      [
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Discard this workout?',
              'Your active workout, sets, and notes will be permanently removed. This cannot be undone.',
              [
                {
                  text: 'Keep workout',
                  style: 'cancel',
                  onPress: () => {
                    close();
                    askAgain.current();
                  },
                },
                {
                  text: 'Discard workout',
                  style: 'destructive',
                  onPress: () => {
                    close();
                    discard();
                  },
                },
              ],
              { cancelable: false },
            ),
        },
        {
          text: 'Resume',
          onPress: () => {
            close();
            resume();
            router.push('/workout');
          },
        },
        {
          text: 'Save workout',
          onPress: () => {
            close();
            void finish(endedAt).then((result) => {
              if (result.ok) {
                router.push('/workout');
                return;
              }
              // Whatever blocked the save is explained on the workout.
              resume();
              router.push('/workout');
              Alert.alert("Can't finish yet", result.message);
            });
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          close();
          resume();
        },
      },
    );
  }, [commit, discard, finish, router, types]);
  useLayoutEffect(() => {
    askAgain.current = checkInactive;
  }, [checkInactive]);
  useEffect(() => {
    if (!logger) return;
    checkInactive();
    const timer = setInterval(checkInactive, 30_000);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkInactive();
    });
    return () => {
      clearInterval(timer);
      app?.remove();
    };
  }, [logger, checkInactive]);

  // Another device's version of the workout in progress: stored, then shown. A workout that
  // ended there closes here; one naming an exercise this phone hasn't loaded waits for it.
  const showRemote = useCallback(
    (draft: ActiveWorkoutDraft | null) => {
      const previous = loggerRef.current;
      if (!draft) {
        loggerRef.current = null;
        setLogger(null);
        if (previous) {
          commitRest(NO_REST);
          addedSetKeys.current.clear();
          showToast('Workout ended on another device');
        }
        return;
      }
      const state = loggerFromDraft(draft, allExercises);
      if (!state) {
        setWaiting({ draft, since: Date.now() });
        void client.invalidateQueries({ queryKey: queryKeys.exercises });
        return;
      }
      loggerRef.current = state;
      setLogger(state);
      rememberExercises(state);
      if (previous?.clientSessionId !== state.clientSessionId) {
        addedSetKeys.current.clear();
        commitRest(NO_REST);
      }
    },
    [allExercises, client, commitRest, rememberExercises],
  );
  const applyRemote = useCallback(
    (draft: ActiveWorkoutDraft | null): boolean => {
      if (draftSignature(draft) === draftSignature(readActiveWorkoutDraft(deviceStorage)))
        return true;
      if (draft && !isActiveWorkoutDraft(draft))
        throw new Error('This workout needs a newer version of Relay.');
      if (draft) {
        if (!writeActiveWorkoutDraft(draft, deviceStorage)) return false;
        writeJson(DRAFT_OWNER_KEY, user.id);
      } else {
        clearActiveWorkoutDraft(deviceStorage);
        if (readActiveWorkoutDraft(deviceStorage) !== null) return false;
        writeJson(DRAFT_OWNER_KEY, null);
      }
      showRemote(draft);
      return true;
    },
    [showRemote, user.id],
  );
  const applyRef = useRef(applyRemote);
  // With auto-save on, each synced draft carries the workout the server would save at its
  // cutoff, worked out here as Save in the inactive-workout prompt would (as on the web).
  const autoSaveFor = useCallback(
    (draft: ActiveWorkoutDraft | null): WorkoutInput | undefined => {
      const state = loggerRef.current;
      if (appliedAutoSave.current === null || !draft || !state) return undefined;
      if (draftSignature(loggerToDraft(state, 0)) !== draftSignature(draft)) return undefined;
      const check = checkFinish(state, types, false, Date.now(), inactiveEndAt(state));
      return check.kind === 'ready' ? finishInput(state, types, check) : undefined;
    },
    [types],
  );
  const autoSaveRef = useRef(autoSaveFor);
  useLayoutEffect(() => {
    applyRef.current = applyRemote;
    autoSaveRef.current = autoSaveFor;
  }, [applyRemote, autoSaveFor]);

  const [syncState, setSyncState] = useState<{
    status: WorkoutSyncStatus;
    conflict: WorkoutSyncConflict | null;
  }>({ status: 'syncing', conflict: null });
  useEffect(() => {
    const saved = readJson<{ userId?: string; base?: SharedWorkoutSnapshot }>(
      ACTIVE_WORKOUT_SYNC_KEY,
    );
    const base =
      saved?.userId === user.id &&
      Number.isInteger(saved.base?.revision) &&
      saved.base!.revision >= 0 &&
      (saved.base!.draft === null || isActiveWorkoutDraft(saved.base!.draft))
        ? saved.base!
        : null;
    const sync = new ActiveWorkoutSynchronizer(
      {
        read: async () => snapshotOf(await apiGet<unknown>('/api/active-workout')),
        put: async (change) => {
          const autoSave = autoSaveRef.current(change.draft);
          const result = await apiSend<unknown>('/api/active-workout', 'PUT', {
            ...change,
            ...(autoSave && { autoSave }),
          });
          return {
            ...snapshotOf(result),
            conflict: Boolean((result as { conflict?: boolean }).conflict),
          };
        },
        local: () => readActiveWorkoutDraft(deviceStorage),
        apply: (draft) => applyRef.current(draft),
        saveBase: (next) => writeJson(ACTIVE_WORKOUT_SYNC_KEY, { userId: user.id, base: next }),
        queued: (sessionId) =>
          Boolean(
            sessionId &&
            readFinishedWorkouts(deviceStorage).some(
              (item) => item.pendingSave.userId === user.id && item.clientSessionId === sessionId,
            ),
          ),
        changed: (status, conflict) => setSyncState({ status, conflict }),
        // Only an answer from Relay itself is a refusal; no answer, or a proxy's, is offline.
        connectionFailure: (reason) =>
          !(reason instanceof ApiError) || [502, 503, 504].includes(reason.status),
        newId,
      },
      base,
    );
    syncRef.current = sync;
    void sync.sync();
    // Without the web's live connection, the phone checks the shared copy every 15 s while open.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void sync.sync();
    }, 15_000);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync.sync();
    });
    const net = onlineManager.subscribe((online) => {
      if (online) void sync.sync();
    });
    return () => {
      sync.stop();
      syncRef.current = null;
      clearInterval(timer);
      clearTimeout(syncTimer.current);
      app?.remove();
      net();
    };
  }, [user.id]);
  const resolveSync = useCallback((useLocal: boolean) => {
    void syncRef.current?.resolve(useLocal);
  }, []);
  // A conflict shows until it is closed; a later one shows again.
  const [conflictHidden, setConflictHidden] = useState(false);
  if (!syncState.conflict && conflictHidden) setConflictHidden(false);
  const showSyncConflict = useCallback((open: boolean) => setConflictHidden(!open), []);
  const [conflictHosts, setConflictHosts] = useState(0);
  const hostSyncConflict = useCallback(() => {
    setConflictHosts((count) => count + 1);
    return () => setConflictHosts((count) => count - 1);
  }, []);

  // Refused saves wait for review: reopened in the logger to change and finish again, or dropped.
  const refused = useMemo<RefusedSave[]>(() => {
    const keys = Object.keys(queue.refusals);
    if (!keys.length) return [];
    return readFinishedWorkouts(deviceStorage).flatMap((item) => {
      const key = finishedWorkoutKey(item);
      return key in queue.refusals
        ? [
            {
              key,
              name: item.pendingSave.payload.name,
              durationMinutes: item.pendingSave.payload.duration_minutes,
              message: queue.refusals[key],
              resumed: item.pendingSave.workoutId !== null,
              conflict: queue.conflicts.includes(key),
            },
          ]
        : [];
    });
  }, [queue.refusals, queue.conflicts]);

  const review = useCallback(
    (key: string) => {
      if (loggerRef.current) {
        showToast('Finish your current workout to review this one.');
        return;
      }
      const item = readFinishedWorkouts(deviceStorage).find(
        (entry) => finishedWorkoutKey(entry) === key,
      );
      if (!item || !(key in (senderRef.current?.status().refusals ?? {}))) return;
      const draft = reviewedFinishedWorkout(item, Date.now());
      const state = loggerFromDraft(draft, allExercises);
      if (!state) {
        showToast('This workout can only be reviewed on the web for now.');
        return;
      }
      // Stored as the live workout before it leaves the queue, so it is never lost in between.
      if (!writeActiveWorkoutDraft(draft, deviceStorage)) {
        showToast('Could not open the workout for review. Free some storage and try again.');
        return;
      }
      removeFinishedWorkout(key, deviceStorage);
      senderRef.current?.forget(key);
      closeFinished();
      addedSetKeys.current.clear();
      commit(state);
      commitRest(NO_REST);
      router.push('/workout');
    },
    [allExercises, closeFinished, commit, commitRest, router],
  );
  useLayoutEffect(() => {
    reviewRef.current = review;
  }, [review]);

  const discardRefused = useCallback((key: string) => {
    removeFinishedWorkout(key, deviceStorage);
    senderRef.current?.forget(key);
  }, []);

  const keepMine = useCallback((key: string) => {
    const item = readFinishedWorkouts(deviceStorage).find(
      (entry) => finishedWorkoutKey(entry) === key,
    );
    const workoutId = item?.pendingSave.workoutId;
    if (!item || !workoutId) return;
    apiGet<TrackedWorkout>(`/api/workouts/${encodeURIComponent(workoutId)}`)
      .then((latest) => {
        if (!addFinishedWorkout(rebasedFinishedWorkout(item, latest.revision), deviceStorage))
          throw new Error('Could not store the workout on the phone. Free some storage.');
        senderRef.current?.forget(key);
        senderRef.current?.wake();
      })
      .catch((reason) =>
        showToast(
          reason instanceof ApiError && reason.status === 404
            ? 'This workout was deleted on another device.'
            : reason instanceof Error
              ? reason.message
              : 'Could not check the latest version. Try again.',
        ),
      );
  }, []);

  const resume = useCallback(
    (workout: TrackedWorkout) => {
      const current = loggerRef.current;
      if (current) {
        if (current.resumingWorkoutId !== workout.id)
          showToast('Finish your current workout to resume this one.');
        router.push('/workout');
        return;
      }
      addedSetKeys.current.clear();
      closeFinished();
      commit(resumeLogger(workout, { now: Date.now(), clientSessionId: newId() }, newId));
      commitRest(NO_REST);
      router.push('/workout');
    },
    [closeFinished, commit, commitRest, router],
  );
  const getState = useCallback(() => loggerRef.current, []);

  const identityName = logger ? workoutIdentity(logger, types).name : null;
  const loggedSets = logger ? setCounts(logger).ticked : 0;
  const live = useMemo<LiveWorkout | null>(
    () =>
      logger && identityName
        ? {
            name: identityName,
            resumedWorkoutId: logger.resumingWorkoutId,
            previousDurationMinutes: logger.previousDurationMinutes,
            startedAt: logger.startedAt,
            workoutDate: logger.workoutDate,
            pause: logger.pause,
            loggedSets,
          }
        : null,
    [logger, identityName, loggedSets],
  );

  const workoutApi = useMemo<WorkoutApi>(
    () => ({
      live,
      start,
      open,
      openStartMenu,
      discard,
      queue,
      refused,
      review,
      discardRefused,
      keepMine,
      resume,
      syncConflict: syncState.conflict,
      syncConflictOpen: !!syncState.conflict && !conflictHidden,
      showSyncConflict,
      resolveSync,
      hostSyncConflict,
      syncConflictHosted: conflictHosts > 0,
    }),
    [
      live,
      start,
      open,
      openStartMenu,
      discard,
      queue,
      refused,
      review,
      discardRefused,
      keepMine,
      resume,
      syncState.conflict,
      conflictHidden,
      showSyncConflict,
      resolveSync,
      hostSyncConflict,
      conflictHosts,
    ],
  );
  const loggerApi = useMemo<LoggerApi>(
    () => ({
      state: logger,
      getState,
      rest,
      finished,
      types,
      exercises: allExercises,
      history,
      weightUnit,
      context,
      createExercise,
      change,
      updateSet,
      addSet,
      chooseType,
      togglePause,
      startRest: (seconds) => startRest(seconds),
      adjustRest: (delta) => commitRest(adjustRestRule(restRef.current, delta, Date.now())),
      skipRest: () => commitRest(NO_REST),
      dismissRestDone: () => commitRest({ ...restRef.current, done: null }),
      checkFinish: runCheck,
      finish,
      closeFinished,
    }),
    [
      logger,
      getState,
      rest,
      finished,
      types,
      allExercises,
      history,
      weightUnit,
      context,
      createExercise,
      change,
      updateSet,
      addSet,
      chooseType,
      togglePause,
      startRest,
      commitRest,
      runCheck,
      finish,
      closeFinished,
    ],
  );

  useLayoutEffect(() => {
    publish({ workout: workoutApi, logger: loggerApi });
  }, [publish, workoutApi, loggerApi]);
  useEffect(() => () => publish(null), [publish]);
  return null;
});
