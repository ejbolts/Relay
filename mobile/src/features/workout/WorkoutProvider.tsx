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
import { AppState } from 'react-native';
import {
  readFinishedWorkouts,
  type FinishedWorkout,
} from '../../../../frontend/src/finishedWorkoutQueue';
import { moveDraftToFinishedQueue } from '../../../../frontend/src/finishedWorkoutSend';
import { buildFinishSummary, type FinishSummary } from '../../../../frontend/src/finishSummary';
import { readStoredRestTimer, writeStoredRestTimer } from '../../../../frontend/src/liveRestTimer';
import { typeSessionTemplate } from '../../../../frontend/src/routines';
import { sessionTemplateFor, type SessionTemplate } from '../../../../frontend/src/trainingSummary';
import type {
  Exercise,
  PersonalRecord,
  TrackedWorkout,
  User,
  WorkoutCategory,
  WorkoutInput,
  WorkoutType,
} from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import type { WeightUnit } from '../../../../frontend/src/weightUnits';
import {
  clearActiveWorkoutDraft,
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
  finishInput,
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
import { forgetOfflineQueries, saveOfflineQueries, seedOfflineQueries } from './offlineQueries';
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
      template: SessionTemplate;
      name: string;
      /** A planned day's category and type, when it has them. */
      category?: WorkoutCategory | null;
      type?: WorkoutType | null;
    };

/** What the rest of the app may know about the workout in progress. */
export interface LiveWorkout {
  name: string;
  startedAt: number;
  pause: WorkoutPause;
  loggedSets: number;
}

export interface WorkoutApi {
  live: LiveWorkout | null;
  /**
   * Starts a workout and opens the logger. Ignored while one is already live: use `open`. From
   * another sheet (the Start menu), pass `replace` so the logger takes that sheet's place.
   */
  start: (choice: StartChoice, options?: { replace?: boolean }) => void;
  /** Shows the logger for the live workout. Dismissing the logger only minimises it. */
  open: () => void;
  /** The Start tab: the Start menu, or the logger while a workout is live. */
  openStartMenu: () => void;
  /** Ends the live workout without saving. */
  discard: () => void;
  /** Finished workouts stored on this phone until the server confirms them. */
  queue: QueueStatus;
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
  /** Queues the workout for saving (offline too) and shows its summary. */
  finish: () => FinishResult;
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
    }),
    [router],
  );
  const published = user && engine ? engine : null;
  return (
    <WorkoutContext.Provider value={published?.workout ?? idle}>
      <LoggerApiContext.Provider value={published?.logger ?? null}>
        {user && <WorkoutEngine key={user.id} user={user} publish={setEngine} />}
        {children}
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
  const history = useMemo(() => historyQuery.data ?? [], [historyQuery.data]);
  const types = typesQuery.data ?? DEFAULT_WORKOUT_TYPES;
  // Only a first load in progress holds up Finish; offline, the saved or built-in types apply.
  const typesLoading = typesQuery.isPlaceholderData && typesQuery.fetchStatus === 'fetching';
  const weightUnit: WeightUnit = preferences.data?.preferred_weight_unit ?? 'kg';
  const defaultRest = preferences.data?.default_rest_seconds ?? null;
  const fetchedExercises = exercisesQuery.data;

  const context = useMemo<LoggerContext>(
    () => ({ workouts: history, weightUnit, defaultRest, newKey: newId }),
    [history, weightUnit, defaultRest],
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

  // A draft naming an exercise the phone had not cached waits for the exercise list.
  const [waiting, setWaiting] = useState(initial.kind === 'waiting' ? initial.draft : null);
  if (waiting && fetchedExercises) {
    setWaiting(null);
    const restored = loggerFromDraft(waiting, allExercises);
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
        const used = next.movements.map((movement) => movement.exercise);
        if (!sameIds(used, draftExercisesRef.current)) {
          draftExercisesRef.current = used;
          writeJson(DRAFT_EXERCISES_KEY, used);
          setDraftExercises(used);
        }
      } else {
        clearActiveWorkoutDraft(deviceStorage);
        writeJson(DRAFT_OWNER_KEY, null);
      }
      setLogger(next);
    },
    [user.id],
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

  // Finished workouts send until the server confirms them, retrying when the connection or the
  // app comes back.
  const senderRef = useRef<FinishedQueueSender | null>(null);
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
      }),
      onSaved: (workout, item, remaining) => {
        if (remaining === 0) void refreshTraining(client);
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
      onChange: setQueue,
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
    (choice: StartChoice, options?: { replace?: boolean }) => {
      if (!loggerRef.current) {
        const date = localDate();
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

  const finish = useCallback((): FinishResult => {
    const current = loggerRef.current;
    if (!current) return { ok: false, message: 'No workout in progress.' };
    const now = Date.now();
    const check = checkFinish(current, types, typesLoading, now);
    if (check.kind !== 'ready')
      return {
        ok: false,
        message:
          check.kind === 'blocked'
            ? check.message
            : `Choose a machine for every set of ${check.exercise}.`,
      };
    const payload = finishInput(current, types, check);
    const failed = queueFinishedWorkout(current, payload, user.id, now);
    if (failed) return { ok: false, message: failed };
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    return { ok: true };
  }, [types, typesLoading, user.id, allExercises, history, commitRest]);

  const closeFinished = useCallback(() => setFinished(null), []);
  const getState = useCallback(() => loggerRef.current, []);

  const identityName = logger ? workoutIdentity(logger, types).name : null;
  const loggedSets = logger ? setCounts(logger).ticked : 0;
  const live = useMemo<LiveWorkout | null>(
    () =>
      logger && identityName
        ? {
            name: identityName,
            startedAt: logger.startedAt,
            pause: logger.pause,
            loggedSets,
          }
        : null,
    [logger, identityName, loggedSets],
  );

  const workoutApi = useMemo<WorkoutApi>(
    () => ({ live, start, open, openStartMenu, discard, queue }),
    [live, start, open, openStartMenu, discard, queue],
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
