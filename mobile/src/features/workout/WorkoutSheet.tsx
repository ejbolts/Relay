import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { machineAliases } from '../../../../frontend/src/exerciseHistory';
import { exerciseLastDoneDates } from '../../../../frontend/src/exerciseLastDone';
import { liveMuscleSets, type MuscleSetsWeek } from '../../../../frontend/src/liveMuscleSets';
import { bodyweightOn } from '../../../../frontend/src/relativeStrength';
import { setKindOf, type SetKind } from '../../../../frontend/src/setFieldValues';
import type { ExerciseMachineChoices } from '../../../../frontend/src/exerciseMachineChoices';
import type { Exercise } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import {
  shelfAfterExerciseComplete,
  shelfAfterSetUpdate,
} from '../../../../frontend/src/weeklySetsUpdate';
import { completeRemainingSets } from '../../../../frontend/src/workoutSets';
import { setUpdateEffects } from '../../../../frontend/src/workoutSetUpdate';
import { warmupOnlyMovements, warmupSetLabel } from '../../../../frontend/src/workingSetCheck';
import {
  calculateScopedDraftPrs,
  initialPrCelebrations,
  newPrCelebrations,
  prToastLines,
  type DraftPrBadges,
  type PrCelebrations,
} from '../../../../frontend/src/workoutPr';
import { activeElapsedSeconds } from '../../../../frontend/src/workoutPause';
import { isSupersetUpNext, nextInSupersetRound } from '../../../../frontend/src/workoutSupersets';
import {
  machineTipEligible,
  readdsRemovedSet,
  replacesRemovedExercise,
  savedWorkoutCount,
  type TipRemoval,
} from '../../../../frontend/src/tipTriggers';
import { newId } from '../../data/deviceStorage';
import { useDashboard, useTrainingPreferences } from '../../data/queries';
import { Button } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { TextField } from '../../ui/controls';
import { haptics } from '../../ui/haptics';
import { MenuButton } from '../../ui/MenuButton';
import { PromptHost, promptText, showMenu, type MenuOption } from '../../ui/prompts';
import { useTheme } from '../../ui/theme';
import { showToast, ToastHost } from '../../ui/Toast';
import { LoggerTipsProvider, useLoggerTips } from '../guides/LoggerTips';
import { restTimerPreference, useReduceMotion } from '../settings/devicePreferences';
import { useBodyMeasurements } from '../training/trainingQueries';
import { FinishedSummary } from './FinishedSummary';
import { ExercisePicker } from './ExercisePicker';
import { useTrainingBlocks } from './loggerQueries';
import {
  addExercises,
  chooseMachines,
  completeExercise,
  correctWorkoutTime,
  deleteSet,
  loggerToDraft,
  groupSuperset,
  moveMovement,
  moveSet,
  removeMovement,
  restoreSet,
  selectedType,
  setCounts,
  setMovementNotes,
  olderHistoryFor,
  mergeMachines,
  setMachineSettings,
  setSetKind,
  ungroupSuperset,
  workoutIdentity,
  type LoggerState,
} from './loggerState';
import { MovementCard, type MovementActions } from './MovementCard';
import { RestBar } from './RestBar';
import { MachineSheet } from './MachineSheet';
import { SwapSheet } from './SwapSheet';
import { swapOntoMachine } from './swapMachineSetup';
import { SyncConflictButton, SyncConflictSheet } from './SyncConflictSheet';
import { WeeklySetsShelf, type WeeklySetsUpdate } from './WeeklySetsShelf';
import { restMenuItems } from './restChoices';
import { useElapsed } from './useElapsed';
import { WorkoutTimeSheet } from './WorkoutTimeSheet';
import { useLogger, useWorkout, type LoggerApi } from './WorkoutProvider';

/**
 * The logger: a page sheet over the app. Dragging it down (or Minimise) only minimises the
 * workout, which carries on in the tab bar. After Finish it shows the workout's summary.
 */
export function WorkoutSheet() {
  const logger = useLogger();
  const router = useRouter();
  const { colors } = useTheme();
  const { hostSyncConflict } = useWorkout();
  // The page sheet covers the app's own sync choice, so it shows here while the logger is open.
  useEffect(() => hostSyncConflict(), [hostSyncConflict]);
  const closeFinished = logger?.closeFinished;
  // Leaving the summary (Done or dragging the sheet away) clears it.
  useEffect(() => () => closeFinished?.(), [closeFinished]);

  // The height of the live logger's bottom dock (the rest pill or notch and the weekly sets
  // shelf), so toasts sit above it as on the web, never on top of the shelf.
  const [dockHeight, setDockHeight] = useState(0);
  let content = <NoWorkout onClose={() => router.back()} />;
  if (logger?.state)
    content = (
      <LoggerTipsProvider>
        <LiveLogger logger={logger} state={logger.state} onDockHeight={setDockHeight} />
      </LoggerTipsProvider>
    );
  else if (logger?.finished)
    content = <FinishedView logger={logger} onDone={() => router.back()} />;
  return (
    <View style={[styles.page, { backgroundColor: colors.page }]}>
      {content}
      <SyncConflictButton bottom={logger?.rest.timer || logger?.rest.done ? 112 : 32} />
      <SyncConflictSheet />
      <ToastHost
        bottom={
          logger?.state && dockHeight > 0
            ? DOCK_BOTTOM + dockHeight + TOAST_GAP
            : logger?.rest.timer || logger?.rest.done
              ? 104
              : 24
        }
      />
      <PromptHost />
    </View>
  );
}

/** The dock's gap above the safe area, and a toast's gap above the dock. */
const DOCK_BOTTOM = 12;
const TOAST_GAP = 8;

/** The logger's bottom dock, reporting its height while it shows and none once it goes. */
function Dock({
  onHeight,
  style,
  children,
}: {
  onHeight: (height: number) => void;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  useEffect(() => () => onHeight(0), [onHeight]);
  return (
    <View
      testID="logger-dock"
      pointerEvents="box-none"
      style={style}
      onLayout={(event) => onHeight(Math.ceil(event.nativeEvent.layout.height))}
    >
      {children}
    </View>
  );
}

function FinishedView({ logger, onDone }: { logger: LoggerApi; onDone: () => void }) {
  const { queue, refused, review, discardRefused, keepMine } = useWorkout();
  const finished = logger.finished!;
  const mine = refused.find((save) => save.key === finished.sessionId) ?? null;
  return (
    <FinishedSummary
      finished={finished}
      queue={queue}
      refused={mine}
      weightUnit={logger.weightUnit}
      onReview={() => review(finished.sessionId)}
      onKeepMine={() => keepMine(finished.sessionId)}
      onDiscard={() => {
        discardRefused(finished.sessionId);
        onDone();
      }}
      onDone={onDone}
    />
  );
}

function NoWorkout({ onClose }: { onClose: () => void }) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.center}>
      <Text style={[type.headline, { color: colors.secondary }]}>No workout in progress</Text>
      <Button label="Close" variant="secondary" onPress={onClose} />
    </View>
  );
}

function LiveLogger({
  logger,
  state,
  onDockHeight,
}: {
  logger: LoggerApi;
  state: LoggerState;
  onDockHeight: (height: number) => void;
}) {
  // Settings › Rest timer off hides the header's rest button, as on the web.
  const restTimerOn = restTimerPreference.use();
  const router = useRouter();
  const { discard, syncConflict, syncConflictOpen: conflictSheetOpen } = useWorkout();
  const syncConflictOpen = !!syncConflict && conflictSheetOpen;
  const insets = useSafeAreaInsets();
  const { colors, type, space, radius } = useTheme();
  // The exercise picker adds exercises, or picks a replacement for the exercise being swapped.
  const [picker, setPicker] = useState<{ swapping: string | null } | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [machinesFor, setMachinesFor] = useState<string | null>(null);
  const { change, types, context, getState, updateSet: applySetUpdate } = logger;
  // The web's tip pop-ups beside logger controls, fed by the same events.
  const loggerTips = useLoggerTips();
  const savedWorkouts = savedWorkoutCount(logger.history);
  /** The latest set or exercise removed, which adding its like again soon after may redo. */
  const recentRemoval = useRef<TipRemoval | null>(null);
  const identity = workoutIdentity(state, types);
  const elapsed = useElapsed(state.startedAt, state.pause, state.previousDurationMinutes);
  // The clock correction opens on the clock as it reads then (this session's training time),
  // for the workout it was opened for: another workout replacing it (from the web, say) closes
  // it, and its save never reaches the replacement.
  const [timeEditor, setTimeEditor] = useState({ open: false, seconds: 0, key: 0, sessionId: '' });
  const openTimeEditor = () => {
    const latest = getState() ?? state;
    setTimeEditor((current) => ({
      open: true,
      seconds: activeElapsedSeconds(latest.startedAt, latest.pause, Date.now()),
      key: current.key + 1,
      sessionId: latest.clientSessionId,
    }));
  };
  const closeTimeEditor = () => setTimeEditor((current) => ({ ...current, open: false }));
  if (timeEditor.open && timeEditor.sessionId !== state.clientSessionId)
    setTimeEditor({ ...timeEditor, open: false });
  const paused = state.pause.pausedAt !== null;
  const { ticked } = setCounts(state);
  const restShown = !!(logger.rest.timer || logger.rest.done);
  const restRunning = !!logger.rest.timer;
  // Hide tucks the running rest into a notch; the next rest shows in full again.
  const [restHiddenFor, setRestHiddenFor] = useState<string | null>(null);
  const restHidden = !!logger.rest.timer && restHiddenFor === logger.rest.timer.id;
  const top = Platform.OS === 'ios' ? 0 : insets.top;

  const recentIds = useMemo(() => {
    const seen = new Set<string>();
    for (const workout of logger.history)
      for (const movement of workout.movements) seen.add(movement.exercise.id);
    return [...seen];
  }, [logger.history]);
  const addedIds = useMemo(
    () => new Set(state.movements.map((movement) => movement.exercise.id)),
    [state.movements],
  );
  const prBadges = useLivePrBadges(logger, state);
  const measurements = useBodyMeasurements().data;
  const bodyweight = bodyweightOn(measurements ?? [], state.workoutDate);
  const bodyweightRef = useRef(bodyweight);
  useLayoutEffect(() => {
    bodyweightRef.current = bodyweight;
  }, [bodyweight]);
  const lastDone = useMemo(
    () =>
      exerciseLastDoneDates(
        logger.history,
        olderHistoryFor(logger.context, state.workoutDate),
        state.resumingWorkoutId,
      ),
    [logger.history, logger.context, state.workoutDate, state.resumingWorkoutId],
  );
  const swapMovement = state.movements.find((item) => item.key === swapping) ?? null;
  const machineMovement = state.movements.find((item) => item.key === machinesFor) ?? null;

  // This week's working sets per muscle, counting the live workout, for the shelf a logged
  // working set opens (the web's useLiveMuscleSets).
  const dashboard = useDashboard().data;
  const preferences = useTrainingPreferences().data;
  const weeklySets = dashboard?.weekly_sets;
  const { exercises, history } = logger;
  const week = useMemo(
    () =>
      weeklySets
        ? liveMuscleSets(
            weeklySets,
            loggerToDraft(state, state.lastActiveAt),
            exercises,
            history,
            localDate(),
          )
        : undefined,
    [weeklySets, state, exercises, history],
  );
  const weekRef = useRef<MuscleSetsWeek | undefined>(week);
  useLayoutEffect(() => {
    weekRef.current = week;
  }, [week]);
  const [shelf, setShelf] = useState<WeeklySetsUpdate | null>(null);
  // The shelf joins the rest pill into one card while both show in full.
  const shelfJoined = !!shelf && restShown && !restHidden;
  const shelfId = useRef(0);
  const closeShelf = useCallback(() => setShelf(null), []);

  const swap = useCallback(
    (
      movementKey: string,
      replacement: Exercise,
      machineChoices?: ExerciseMachineChoices,
      machineUse?: Readonly<Record<string, number>>,
    ) => {
      const before = getState();
      if (!before) return;
      loggerTips.learn('swap');
      void swapOntoMachine(
        change,
        movementKey,
        replacement,
        context,
        machineChoices,
        undefined,
        machineUse,
      );
      showToast(
        `Swapped to ${replacement.name}`,
        {
          label: 'Undo',
          run: () => change((current) => ({ ...current, movements: before.movements })),
        },
        { duration: 'quick' },
      );
    },
    [change, context, getState, loggerTips],
  );

  const removeExercise = useCallback(
    (movementKey: string) => {
      const before = getState();
      const movement = before?.movements.find((item) => item.key === movementKey);
      if (!before || !movement) return;
      const remove = () => {
        recentRemoval.current = { kind: 'exercise', key: movementKey, at: Date.now() };
        change((current) => removeMovement(current, movementKey));
        showToast(
          `${movement.exercise.name} removed`,
          {
            label: 'Undo',
            run: () => {
              recentRemoval.current = null;
              change((current) =>
                current.movements.some((item) => item.key === movementKey)
                  ? current
                  : { ...current, movements: before.movements },
              );
            },
          },
          // A whole exercise and its sets are hard to redo.
          { duration: 'important' },
        );
      };
      if (!movement.sets.some((item) => item.completed)) {
        remove();
        return;
      }
      Alert.alert(`Remove ${movement.exercise.name}?`, 'Its logged sets will be removed too.', [
        { text: 'Keep', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: remove },
      ]);
    },
    [change, getState],
  );

  // Removing an exercise and choosing another soon after is what Swap exercise does in one go.
  const exercisesAdded = (count: number) => {
    const removal = recentRemoval.current;
    recentRemoval.current = null;
    if (replacesRemovedExercise(removal, count, savedWorkouts, Date.now()))
      loggerTips.event('replace-exercise', 'swap');
  };
  // Adding a set soon after deleting one from the same exercise is counted as on the web. The
  // app doesn't show the reorder tip it asks for there (its text is about the web's handle).
  const { addSet: addLoggerSet } = logger;
  const addSet = useCallback(
    (movementKey: string, position?: number) => {
      const removal = recentRemoval.current;
      recentRemoval.current = null;
      if (readdsRemovedSet(removal, movementKey, Date.now())) loggerTips.event('re-add-set');
      addLoggerSet(movementKey, position);
    },
    [addLoggerSet, loggerTips],
  );
  const openMachines = useCallback(
    (movementKey: string) => {
      loggerTips.learn('machine');
      setMachinesFor(movementKey);
    },
    [loggerTips],
  );

  const openActions = useCallback(
    (movementKey: string) => {
      const current = getState();
      if (!current) return;
      const index = current.movements.findIndex((item) => item.key === movementKey);
      const movement = current.movements[index];
      if (!movement) return;
      const others = current.movements.filter((item) => item.key !== movementKey);
      const partners = movement.supersetKey
        ? others.filter((item) => item.supersetKey === movement.supersetKey).map((item) => item.key)
        : [];
      const options: MenuOption[] = [
        {
          label: movement.notes.trim() ? 'Edit note' : 'Add note',
          onPress: () =>
            promptText({
              title: `Note for ${movement.exercise.name}`,
              value: movement.notes,
              placeholder: 'Add a note',
              submitLabel: 'Save',
              multiline: true,
              onSubmit: (notes) => change((latest) => setMovementNotes(latest, movementKey, notes)),
            }),
        },
        { label: 'Swap exercise', onPress: () => setSwapping(movementKey) },
        ...(movement.exercise.kind === 'cardio'
          ? []
          : [{ label: 'Machines', onPress: () => openMachines(movementKey) }]),
      ];
      if (index > 0)
        options.push({
          label: 'Move up',
          onPress: () => change((latest) => moveMovement(latest, index, -1)),
        });
      if (index < current.movements.length - 1)
        options.push({
          label: 'Move down',
          onPress: () => change((latest) => moveMovement(latest, index, 1)),
        });
      const candidates = others.filter((item) => !partners.includes(item.key));
      if (candidates.length)
        options.push({
          label: movement.supersetKey ? 'Add to superset' : 'Superset with…',
          onPress: () =>
            showMenu(
              'Superset with',
              candidates.map((item) => ({
                label: item.exercise.name,
                onPress: () =>
                  change((latest) =>
                    groupSuperset(latest, movementKey, [...partners, item.key], newId()),
                  ),
              })),
            ),
        });
      if (movement.supersetKey)
        options.push({
          label: 'Remove from superset',
          onPress: () => change((latest) => ungroupSuperset(latest, movementKey)),
        });
      options.push({
        label: 'Remove exercise',
        destructive: true,
        onPress: () => removeExercise(movementKey),
      });
      showMenu(movement.exercise.name, options);
    },
    [change, getState, removeExercise, openMachines],
  );

  // Folding a card from its bottom edge brings its header back into view, as on the web.
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);
  const cardTops = useRef(new Map<string, number>());
  const reducedMotion = useReduceMotion();
  const viewportHeight = useRef(0);
  const cardHeights = useRef(new Map<string, number>());
  const revealMovement = useCallback(
    (movementKey: string) => {
      requestAnimationFrame(() => {
        const top = cardTops.current.get(movementKey);
        if (top === undefined) return;
        const target = Math.max(0, top - space.gutter);
        if (target < scrollY.current)
          scrollRef.current?.scrollTo({ y: target, animated: !reducedMotion });
      });
    },
    [space.gutter, reducedMotion],
  );
  /**
   * Scrolls the next card in a superset round into view only as far as needed, as the web's
   * `scrollIntoView({ block: 'nearest' })` after logging a set. Two frames let a card that has
   * just opened report its new height first.
   */
  const revealNearest = useCallback(
    (movementKey: string) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const top = cardTops.current.get(movementKey);
          const height = cardHeights.current.get(movementKey);
          if (top === undefined || height === undefined) return;
          const viewTop = scrollY.current;
          const viewBottom = viewTop + viewportHeight.current;
          let target: number | null = null;
          if (top - space.gutter < viewTop) target = top - space.gutter;
          else if (top + height + space.gutter > viewBottom)
            target = Math.min(
              top - space.gutter,
              top + height + space.gutter - viewportHeight.current,
            );
          if (target !== null)
            scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: !reducedMotion });
        }),
      );
    },
    [space.gutter, reducedMotion],
  );

  const actions = useMemo<MovementActions>(
    () => ({
      revealMovement,
      updateSet: (movementKey, setKey, update) => {
        const current = getState();
        const movement = current?.movements.find((item) => item.key === movementKey);
        const before = movement?.sets.find((item) => item.key === setKey);
        if (before && update.completed === true && !before.completed) {
          loggerTips.setLogged();
          if (
            movement?.exercise.kind !== 'cardio' &&
            setKindOf({ ...before, ...update }) === 'warmup'
          )
            loggerTips.event('warmup-logged', 'setType');
        }
        const next = current
          ? shelfAfterSetUpdate(
              movement,
              setKey,
              update,
              setUpdateEffects(movement, setKey, update, false),
              weekRef.current,
              current.workoutDate,
              localDate(),
            )
          : null;
        applySetUpdate(movementKey, setKey, update, bodyweightRef.current);
        // Logging a set here brings the next exercise in its superset round into view.
        if (before && update.completed === true && !before.completed) {
          const next = nextInSupersetRound(getState()?.movements ?? [], movementKey);
          if (next) revealNearest(next.key);
        }
        if (next === 'hide') setShelf(null);
        else if (next) setShelf({ id: ++shelfId.current, gains: next });
      },
      addSet,
      insertSet: addSet,
      deleteSet: (movementKey, setKey, via) => {
        const movement = getState()?.movements.find((item) => item.key === movementKey);
        const index = movement?.sets.findIndex((item) => item.key === setKey) ?? -1;
        if (!movement || index < 0) return;
        // A swipe is the quick way; deleting from the menu a few times suggests it.
        if (via === 'swipe') loggerTips.learn('swipe');
        else if (movement.sets.length > 1) loggerTips.event('menu-delete', 'swipe', 3);
        if (movement.sets.length === 1) {
          showToast('An exercise needs at least one set. Remove the exercise instead.', undefined, {
            variant: 'warning',
          });
          return;
        }
        const removed = movement.sets[index];
        recentRemoval.current = { kind: 'set', key: movementKey, at: Date.now() };
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        change((latest) => deleteSet(latest, movementKey, setKey));
        showToast(
          'Set deleted',
          {
            label: 'Undo',
            run: () => {
              recentRemoval.current = null;
              change((latest) => restoreSet(latest, movementKey, removed, index));
            },
          },
          { duration: 'quick' },
        );
      },
      moveSet: (movementKey, setKey, move) => {
        loggerTips.learn('reorder');
        change((latest) => moveSet(latest, movementKey, setKey, move));
      },
      setKind: (movementKey, setKey, kind: SetKind) => {
        const set = getState()
          ?.movements.find((item) => item.key === movementKey)
          ?.sets.find((item) => item.key === setKey);
        if (set && setKindOf(set) === 'warmup' && kind !== 'warmup') loggerTips.learn('setType');
        change((latest) => setSetKind(latest, movementKey, setKey, kind));
      },
      completeExercise: (movementKey, isComplete) => {
        const current = getState();
        const movement = current?.movements.find((item) => item.key === movementKey);
        const gains =
          current && movement && isComplete
            ? shelfAfterExerciseComplete(
                movement,
                completeRemainingSets(movement.exercise.kind, movement.sets),
                weekRef.current,
                current.workoutDate,
                localDate(),
              )
            : null;
        change((latest) => completeExercise(latest, movementKey, isComplete));
        if (gains) setShelf({ id: ++shelfId.current, gains });
      },
      openActions,
      skipHighRepWarning: () => change((latest) => ({ ...latest, skipHighRepWarning: true })),
      openMachines,
      restoreMachines: (movementKey, machinePhotoIds) =>
        change((latest) =>
          latest.movements.find((item) => item.key === movementKey)?.machinePhotosInitialized
            ? latest
            : chooseMachines(
                latest,
                movementKey,
                machinePhotoIds,
                { chosen: false, aliases: new Map() },
                context,
              ),
        ),
    }),
    [
      applySetUpdate,
      addSet,
      change,
      getState,
      openActions,
      openMachines,
      context,
      revealMovement,
      revealNearest,
      loggerTips,
    ],
  );

  function rename() {
    promptText({
      title: 'Rename workout',
      value: state.name.trim() || identity.name,
      placeholder: identity.name,
      submitLabel: 'Save',
      onSubmit: (name) => change((latest) => ({ ...latest, name: name.trim() })),
    });
  }

  function confirmDiscard() {
    Alert.alert(
      'Discard this workout?',
      'Your active workout, sets, and notes will be permanently removed. This cannot be undone.',
      [
        { text: 'Keep workout', style: 'cancel' },
        {
          text: 'Discard workout',
          style: 'destructive',
          onPress: () => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            router.back();
            discard();
          },
        },
      ],
    );
  }

  function chooseType() {
    const current = selectedType(state, types);
    showMenu(
      'Workout type',
      types
        .filter((item) => !item.archived)
        .map((item) => ({
          label: item.id === current.id ? `${item.name} ✓` : item.name,
          onPress: () => logger.chooseType(item),
        })),
    );
  }

  function openMenu() {
    showMenu(identity.name, [
      { label: 'Rename workout', onPress: rename },
      { label: 'Adjust workout time', onPress: openTimeEditor },
      { label: 'Workout type', onPress: chooseType },
      {
        label: paused ? 'Resume workout' : 'Pause workout',
        onPress: logger.togglePause,
      },
      { label: 'Discard workout', destructive: true, onPress: confirmDiscard },
    ]);
  }

  function finish() {
    const { blocker, ticked: done, unticked } = logger.checkFinish();
    const run = () =>
      void logger.finish().then((result) => {
        if (!result.ok) Alert.alert("Can't finish yet", result.message);
      });
    if (blocker) {
      Alert.alert("Can't finish yet", blocker, [{ text: 'Keep working out' }]);
      return;
    }
    // Exercises logged with only warm-ups are named first; this doubles as the confirmation.
    const warmupOnly = warmupOnlyMovements(state.movements);
    if (warmupOnly.length) {
      Alert.alert(
        'No working sets',
        warmupOnly
          .map(
            (movement) =>
              `${movement.exercise.name}: ${movement.sets
                .filter((item) => item.completed)
                .map((item, index) => `W ${warmupSetLabel(item, logger.weightUnit, index + 1)}`)
                .join(', ')}`,
          )
          .join('\n'),
        [
          { text: 'Keep working out', style: 'cancel' },
          { text: 'Finish anyway', onPress: run },
        ],
      );
      return;
    }
    if (unticked > 0) {
      Alert.alert('Finish workout?', `${done} of ${done + unticked} sets ticked`, [
        { text: 'Keep working out', style: 'cancel' },
        { text: 'Finish workout', onPress: run },
      ]);
      return;
    }
    run();
  }

  // Tips wait while anything is over the logger, and nudges sit above the bottom docks.
  // As the web's tips wait for its weekly sets shelf, these wait for the shelf, every sheet and
  // the sync choice.
  const tipsReady =
    !picker && !swapping && !machinesFor && !timeEditor.open && !shelf && !syncConflictOpen;
  const tipsBottom = insets.bottom + (restShown || shelf ? 150 : 28);
  const { configure: configureTips } = loggerTips;
  useEffect(() => {
    configureTips({
      ready: tipsReady,
      resting: restRunning,
      workoutCount: savedWorkouts,
      bottom: tipsBottom,
    });
  }, [configureTips, tipsReady, restRunning, savedWorkouts, tipsBottom]);

  const supersetNames = (groupKey: string | null) =>
    groupKey
      ? state.movements
          .filter((item) => item.supersetKey === groupKey)
          .map((item) => item.exercise.name)
      : null;

  return (
    <>
      <View
        style={[
          styles.header,
          { paddingTop: top, borderColor: colors.line, backgroundColor: colors.surface },
        ]}
      >
        {/* The grabber minimises, as on the web; on iOS the page sheet also drags down. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Minimise workout"
          onPress={() => router.back()}
          style={styles.grab}
        >
          <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
        </Pressable>
        <View style={styles.headerRow}>
          <View style={styles.titleBlock}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={identity.name}
              accessibilityHint="Renames the workout"
              onPress={rename}
            >
              <Text
                accessibilityRole="header"
                style={[styles.title, { color: colors.text }]}
                numberOfLines={1}
              >
                {identity.name}
              </Text>
            </Pressable>
            <View style={styles.meta}>
              {/* Tapping the clock corrects it, as on the web, for a timer started late or left running. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Correct workout time, ${paused ? elapsed : `Live ${elapsed}`}`}
                hitSlop={{ left: 6, right: 6 }}
                onPress={() => {
                  haptics.tap();
                  openTimeEditor();
                }}
                style={({ pressed }) => [styles.clock, pressed && styles.pressed]}
              >
                <View
                  style={[styles.liveDot, { backgroundColor: paused ? colors.muted : colors.good }]}
                />
                <Text
                  style={[
                    styles.metaText,
                    styles.clockText,
                    type.number,
                    { color: paused ? colors.muted : colors.good },
                  ]}
                >
                  {paused ? elapsed : `Live ${elapsed}`}
                </Text>
              </Pressable>
              {paused && (
                <Text style={[styles.metaText, styles.metaLine, { color: colors.muted }]}>
                  · Paused
                </Text>
              )}
              <Text
                style={[styles.metaText, styles.metaLine, type.number, { color: colors.muted }]}
              >
                · {ticked} {ticked === 1 ? 'set' : 'sets'}
              </Text>
            </View>
          </View>
          {restTimerOn && (
            <MenuButton
              accessibilityLabel="Rest timer"
              title="Start a rest"
              items={restMenuItems({ current: null, onPick: logger.startRest })}
              trigger={{ sf: 'timer', color: colors.accentText, size: 18 }}
              width={44}
              height={44}
              fill={restRunning ? colors.accentSoft : colors.surface2}
              cornerRadius={radius.md}
              style={[
                styles.square,
                {
                  backgroundColor: restRunning ? colors.accentSoft : colors.surface2,
                  borderColor: restRunning ? `${colors.accent}8C` : colors.lineStrong,
                },
              ]}
            >
              <Icon name="timer" size={20} color={colors.accentText} />
            </MenuButton>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Workout options"
            onPress={() => {
              haptics.press();
              openMenu();
            }}
            style={({ pressed }) => [
              styles.square,
              { backgroundColor: colors.surface2, borderColor: colors.lineStrong },
              pressed && styles.pressed,
            ]}
          >
            <Icon name="more" size={20} color={colors.accentText} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Finish workout"
            hitSlop={4}
            onPress={() => {
              haptics.tap();
              finish();
            }}
            style={({ pressed }) => [
              styles.finish,
              {
                backgroundColor: colors.surface2,
                borderColor: `${colors.good}8C`,
                borderRadius: radius.sm,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[type.button, { color: colors.good }]}>Finish</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        onLayout={(event) => {
          viewportHeight.current = event.nativeEvent.layout.height;
        }}
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={64}
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: space.gutter,
          gap: space.stack,
          paddingBottom: insets.bottom + (restShown || shelf ? 140 : 40),
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <WorkoutDetails
          typeName={selectedType(state, types).name}
          onChooseType={chooseType}
          notes={state.notes}
          onChangeNotes={(notes) => change((latest) => ({ ...latest, notes }))}
        />
        {state.movements.map((movement, index) => (
          <View
            key={movement.key}
            onLayout={(event) => {
              cardTops.current.set(movement.key, event.nativeEvent.layout.y);
              cardHeights.current.set(movement.key, event.nativeEvent.layout.height);
            }}
          >
            <MovementCard
              number={index + 1}
              movement={movement}
              supersetNames={supersetNames(movement.supersetKey)}
              history={logger.history}
              olderLatest={
                olderHistoryFor(logger.context, state.workoutDate)?.get(movement.exercise.id)
                  ?.latest ?? null
              }
              lastDone={lastDone.get(movement.exercise.id) ?? null}
              bodyweight={bodyweight}
              prBadges={prBadges.get(movement.key)}
              excludedWorkoutId={state.resumingWorkoutId ?? undefined}
              workoutDate={state.workoutDate}
              weightUnit={logger.weightUnit}
              skipHighRepWarning={state.skipHighRepWarning}
              machineTip={machineTipEligible(movement.exercise, logger.history)}
              supersetUpNext={isSupersetUpNext(state.movements, movement.key)}
              actions={actions}
            />
          </View>
        ))}
        <Button
          label="Add exercise"
          icon="plus"
          variant="tonal"
          block
          onPress={() => setPicker({ swapping: null })}
        />
      </ScrollView>
      {(restShown || shelf) && (
        <Dock
          onHeight={onDockHeight}
          style={[styles.dock, { bottom: insets.bottom + DOCK_BOTTOM, gap: shelfJoined ? 0 : 8 }]}
        >
          {/* The shelf stays mounted while the rest is hidden, above the notch as on the web, so
              hiding or showing the rest never restarts its countdown or drops a hold. */}
          {shelf && (
            <WeeklySetsShelf
              update={shelf}
              goal={preferences?.weekly_muscle_set_goal ?? 10}
              goals={preferences?.weekly_muscle_set_goals}
              joined={shelfJoined}
              onDismiss={closeShelf}
            />
          )}
          <RestBar
            rest={logger.rest}
            state={state}
            weightUnit={logger.weightUnit}
            hidden={restHidden}
            joined={shelfJoined}
            onTogglePause={logger.togglePause}
            onAdjust={logger.adjustRest}
            onSkip={logger.skipRest}
            onHide={() => setRestHiddenFor(logger.rest.timer?.id ?? null)}
            onShow={() => setRestHiddenFor(null)}
            onDismissDone={logger.dismissRestDone}
          />
        </Dock>
      )}
      <MachineSheet
        target={
          machineMovement
            ? {
                movementKey: machineMovement.key,
                exercise: machineMovement.exercise,
                machinePhotoIds: machineMovement.machinePhotoIds,
                machineSettings: machineMovement.machineSettings,
              }
            : null
        }
        onChoose={(machinePhotoIds, photos) => {
          const key = machinesFor;
          if (!key) return;
          change((latest) =>
            chooseMachines(
              latest,
              key,
              machinePhotoIds,
              { chosen: true, aliases: machineAliases(photos) },
              context,
            ),
          );
        }}
        onSettings={(settings) => {
          const key = machinesFor;
          if (key) change((latest) => setMachineSettings(latest, key, settings));
        }}
        onMerged={(mergedId, awayIds) =>
          change((latest) => mergeMachines(latest, mergedId, awayIds))
        }
        onClose={() => setMachinesFor(null)}
      />
      <WorkoutTimeSheet
        key={timeEditor.key}
        visible={timeEditor.open}
        elapsedSeconds={timeEditor.seconds}
        onClose={closeTimeEditor}
        onSave={(seconds) => {
          const { sessionId } = timeEditor;
          change((latest) =>
            latest.clientSessionId === sessionId
              ? correctWorkoutTime(latest, seconds, Date.now())
              : latest,
          );
          closeTimeEditor();
        }}
      />
      <SwapSheet
        exercise={swapMovement?.exercise ?? null}
        plannedSetCount={swapMovement?.sets.filter((item) => !item.completed).length ?? 0}
        loggedSetCount={swapMovement?.sets.filter((item) => item.completed).length ?? 0}
        exercises={logger.exercises}
        excludedIds={state.movements.map((item) => item.exercise.id)}
        recentIds={recentIds}
        lastDone={lastDone}
        onChoose={(replacement) => {
          if (swapping) swap(swapping, replacement);
          setSwapping(null);
        }}
        onBrowseAll={() => {
          setPicker({ swapping });
          setSwapping(null);
        }}
        onClose={() => setSwapping(null)}
      />
      <ExercisePicker
        visible={!!picker}
        mode={picker?.swapping ? 'swap' : 'add'}
        exercises={logger.exercises}
        recentIds={recentIds}
        addedIds={addedIds}
        category={identity.category}
        chooseMachines
        lastDone={lastDone}
        onAdd={(selected, machineChoices, machineUse) => {
          const target = picker?.swapping;
          if (target) {
            if (selected[0]) swap(target, selected[0], machineChoices, machineUse);
          } else {
            exercisesAdded(selected.length);
            change((latest) => addExercises(latest, selected, context, machineChoices));
          }
        }}
        onCreateSuperset={(selected, machineChoices) => {
          exercisesAdded(selected.length);
          change((latest) => addExercises(latest, selected, context, machineChoices, newId()));
        }}
        onCreate={logger.createExercise}
        onClose={() => setPicker(null)}
      />
    </>
  );
}

/**
 * The records each logged set beats, as the web works them out: against the loaded history and
 * older history, all-time and within the current training block or fresh start. A record set
 * just logged is celebrated once, with a buzz and a popup.
 */
function useLivePrBadges(logger: LoggerApi, state: LoggerState): DraftPrBadges {
  const blocks = useTrainingBlocks().data;
  const measurements = useBodyMeasurements().data;
  const older = olderHistoryFor(logger.context, state.workoutDate);
  const badges = useMemo(
    () =>
      calculateScopedDraftPrs(
        state.movements,
        logger.history,
        state.resumingWorkoutId,
        state.workoutDate,
        older,
        blocks?.blocks ?? [],
        measurements ?? [],
        blocks?.fresh_starts ?? [],
      ),
    [
      state.movements,
      state.workoutDate,
      state.resumingWorkoutId,
      logger.history,
      older,
      blocks,
      measurements,
    ],
  );
  // Records already showing when the logger opens are never celebrated again.
  const celebrations = useRef<PrCelebrations | null>(null);
  const unit = logger.weightUnit;
  useEffect(() => {
    if (!celebrations.current) {
      celebrations.current = initialPrCelebrations(state.movements, badges);
      return;
    }
    const { entries, next } = newPrCelebrations(
      state.movements,
      badges,
      celebrations.current,
      (recorded) => bodyweightOn(measurements ?? [], state.workoutDate, recorded),
    );
    celebrations.current = next;
    if (!entries.length) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast(
      prToastLines(entries, unit)
        .map((line) => `🏆 ${line.title}\n${line.detail}`)
        .join('\n'),
      undefined,
      { variant: 'celebrate' },
    );
  }, [state.movements, state.workoutDate, badges, celebrations, measurements, unit]);
  return badges;
}

/**
 * The web's "Workout details" disclosure at the top of the live workout: its type and notes,
 * folded away until wanted (open while there are notes).
 */
function WorkoutDetails({
  typeName,
  onChooseType,
  notes,
  onChangeNotes,
}: {
  typeName: string;
  onChooseType: () => void;
  notes: string;
  onChangeNotes: (notes: string) => void;
}) {
  const { colors, type, radius } = useTheme();
  const [open, setOpen] = useState(() => !!notes.trim());
  const [text, setText] = useState(notes);
  const latest = useRef(notes);
  useEffect(() => {
    if (notes === latest.current) return;
    latest.current = notes;
    setText(notes);
  }, [notes]);
  return (
    <View
      style={[
        styles.details,
        { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.lg },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Workout details"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          haptics.selection();
          setOpen((value) => !value);
        }}
        style={styles.detailsSummary}
      >
        <Text style={[type.footnote, { flex: 1, color: colors.secondary }]}>Workout details</Text>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} color={colors.secondary} />
      </Pressable>
      {open && (
        <View style={styles.detailsBody}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Workout type: ${typeName}`}
            onPress={onChooseType}
            style={({ pressed }) => [
              styles.typeRow,
              {
                backgroundColor: colors.surface2,
                borderColor: colors.lineStrong,
                borderRadius: radius.md,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[type.footnote, { color: colors.secondary, fontWeight: '600' }]}>
              Workout type
            </Text>
            <Text
              style={[type.callout, { flex: 1, color: colors.text, textAlign: 'right' }]}
              numberOfLines={1}
            >
              {typeName}
            </Text>
            <Icon name="chevronDown" size={16} color={colors.muted} />
          </Pressable>
          <TextField
            value={text}
            onChangeText={(next) => {
              setText(next);
              latest.current = next;
              onChangeNotes(next);
            }}
            placeholder="Workout notes…"
            accessibilityLabel="Workout notes"
            multiline
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  // The clock's 44 pt row reaches the header's bottom edge, so it needs no padding below.
  header: {
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // A 44 pt tall touch area around the grabber.
  grab: {
    alignSelf: 'center',
    width: 120,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabber: { width: 36, height: 5, borderRadius: 3 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleBlock: { flex: 1, minWidth: 0 },
  // The web's live title: 17 pt, extra bold, one line.
  title: { fontSize: 17, lineHeight: 22, fontWeight: '800', letterSpacing: -0.4 },
  // A 44 pt row under the title: the clock's touch area fills its height without reaching the
  // title (which renames), and the text keeps its place just under the title.
  meta: { flexDirection: 'row', alignItems: 'stretch', gap: 5, minHeight: 44 },
  metaLine: { paddingTop: 3 },
  metaText: { fontSize: 13, fontWeight: '600' },
  liveDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  clock: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, paddingTop: 3 },
  clockText: { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  square: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finish: {
    height: 36,
    paddingHorizontal: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  dock: { position: 'absolute', left: 12, right: 12 },
  details: { borderWidth: 1, overflow: 'hidden' },
  detailsSummary: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  detailsBody: { gap: 10, paddingHorizontal: 14, paddingBottom: 14 },
  typeRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
});
