import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bodyweightOn } from '../../../../frontend/src/relativeStrength';
import type { SetKind } from '../../../../frontend/src/setFieldValues';
import { warmupOnlyMovements, warmupSetLabel } from '../../../../frontend/src/workingSetCheck';
import {
  calculateScopedDraftPrs,
  initialPrCelebrations,
  newPrCelebrations,
  prToastLines,
  type DraftPrBadges,
  type PrCelebrations,
} from '../../../../frontend/src/workoutPr';
import { newId } from '../../data/deviceStorage';
import { Button } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { MenuButton } from '../../ui/MenuButton';
import { PromptHost, promptText, showMenu, type MenuOption } from '../../ui/prompts';
import { useTheme } from '../../ui/theme';
import { showToast, ToastHost } from '../../ui/Toast';
import { useBodyMeasurements } from '../training/trainingQueries';
import { FinishedSummary } from './FinishedSummary';
import { ExercisePicker } from './ExercisePicker';
import { loggerIcons } from './icons';
import { useTrainingBlocks } from './loggerQueries';
import {
  addExercises,
  completeExercise,
  deleteSet,
  groupSuperset,
  moveMovement,
  moveSet,
  removeMovement,
  restoreSet,
  selectedType,
  setCounts,
  setMovementNotes,
  olderHistoryFor,
  setSetKind,
  ungroupSuperset,
  workoutIdentity,
  type LoggerState,
} from './loggerState';
import { MovementCard, type MovementActions } from './MovementCard';
import { RestBar } from './RestBar';
import { restMenuItems } from './restChoices';
import { useElapsed } from './useElapsed';
import { useLogger, useWorkout, type LoggerApi } from './WorkoutProvider';

/**
 * The logger: a page sheet over the app. Dragging it down (or Minimise) only minimises the
 * workout, which carries on in the tab bar. After Finish it shows the workout's summary.
 */
export function WorkoutSheet() {
  const logger = useLogger();
  const router = useRouter();
  const { colors } = useTheme();
  const closeFinished = logger?.closeFinished;
  // Leaving the summary (Done or dragging the sheet away) clears it.
  useEffect(() => () => closeFinished?.(), [closeFinished]);

  let content = <NoWorkout onClose={() => router.back()} />;
  if (logger?.state) content = <LiveLogger logger={logger} state={logger.state} />;
  else if (logger?.finished)
    content = <FinishedView logger={logger} onDone={() => router.back()} />;
  return (
    <View style={[styles.page, { backgroundColor: colors.page }]}>
      {content}
      <ToastHost bottom={logger?.rest.timer || logger?.rest.done ? 104 : 24} />
      <PromptHost />
    </View>
  );
}

function FinishedView({ logger, onDone }: { logger: LoggerApi; onDone: () => void }) {
  const { queue, refused, review, discardRefused } = useWorkout();
  const finished = logger.finished!;
  const mine = refused.find((save) => save.key === finished.sessionId) ?? null;
  return (
    <FinishedSummary
      finished={finished}
      queue={queue}
      refused={mine}
      weightUnit={logger.weightUnit}
      onReview={() => review(finished.sessionId)}
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

function LiveLogger({ logger, state }: { logger: LoggerApi; state: LoggerState }) {
  const router = useRouter();
  const { discard } = useWorkout();
  const insets = useSafeAreaInsets();
  const { colors, type, space, radius } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { change, types, context, getState } = logger;
  const identity = workoutIdentity(state, types);
  const elapsed = useElapsed(state.startedAt, state.pause);
  const paused = state.pause.pausedAt !== null;
  const { ticked } = setCounts(state);
  const restShown = !!(logger.rest.timer || logger.rest.done);
  const top = Platform.OS === 'ios' ? 6 : insets.top + 8;

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

  const removeExercise = useCallback(
    (movementKey: string) => {
      const before = getState();
      const movement = before?.movements.find((item) => item.key === movementKey);
      if (!before || !movement) return;
      const remove = () => {
        change((current) => removeMovement(current, movementKey));
        showToast(`${movement.exercise.name} removed`, {
          label: 'Undo',
          run: () =>
            change((current) =>
              current.movements.some((item) => item.key === movementKey)
                ? current
                : { ...current, movements: before.movements },
            ),
        });
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
    [change, getState, removeExercise],
  );

  const actions = useMemo<MovementActions>(
    () => ({
      updateSet: logger.updateSet,
      addSet: logger.addSet,
      deleteSet: (movementKey, setKey) => {
        const movement = getState()?.movements.find((item) => item.key === movementKey);
        const index = movement?.sets.findIndex((item) => item.key === setKey) ?? -1;
        if (!movement || index < 0) return;
        if (movement.sets.length === 1) {
          showToast('An exercise needs at least one set. Remove the exercise instead.');
          return;
        }
        const removed = movement.sets[index];
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        change((latest) => deleteSet(latest, movementKey, setKey));
        showToast('Set deleted', {
          label: 'Undo',
          run: () => change((latest) => restoreSet(latest, movementKey, removed, index)),
        });
      },
      moveSet: (movementKey, from, to) =>
        change((latest) => moveSet(latest, movementKey, from, to)),
      setKind: (movementKey, setKey, kind: SetKind) =>
        change((latest) => setSetKind(latest, movementKey, setKey, kind)),
      completeExercise: (movementKey, isComplete) =>
        change((latest) => completeExercise(latest, movementKey, isComplete)),
      openActions,
      skipHighRepWarning: () => change((latest) => ({ ...latest, skipHighRepWarning: true })),
    }),
    [logger.updateSet, logger.addSet, change, getState, openActions],
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

  function openMenu() {
    const current = selectedType(state, types);
    showMenu(identity.name, [
      { label: 'Rename workout', onPress: rename },
      {
        label: 'Workout type',
        onPress: () =>
          showMenu(
            'Workout type',
            types
              .filter((item) => !item.archived)
              .map((item) => ({
                label: item.id === current.id ? `${item.name} ✓` : item.name,
                onPress: () => logger.chooseType(item),
              })),
          ),
      },
      {
        label: paused ? 'Resume workout' : 'Pause workout',
        onPress: logger.togglePause,
      },
      { label: 'Discard workout', destructive: true, onPress: confirmDiscard },
    ]);
  }

  function finish() {
    const { blocker, ticked: done, unticked } = logger.checkFinish();
    const run = () => {
      const result = logger.finish();
      if (!result.ok) Alert.alert("Can't finish yet", result.message);
    };
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

  const supersetNames = (groupKey: string | null) =>
    groupKey
      ? state.movements
          .filter((item) => item.supersetKey === groupKey)
          .map((item) => item.exercise.name)
      : null;

  return (
    <>
      <View style={[styles.header, { paddingTop: top, borderColor: colors.line }]}>
        {/* The page sheet drags down to minimise on iOS; the grabber says so. Android minimises
            with Back or the chevron instead. */}
        {Platform.OS === 'ios' && (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.grabber, { backgroundColor: colors.lineStrong }]}
          />
        )}
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Minimise workout"
            hitSlop={8}
            onPress={() => router.back()}
            style={[styles.iconButton, { backgroundColor: colors.surface2 }]}
          >
            <Icon name="chevronDown" size={18} color={colors.secondary} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <MenuButton
            accessibilityLabel="Rest timer"
            title="Start a rest"
            items={restMenuItems({ current: null, onPick: logger.startRest })}
            trigger={{ sf: 'timer', color: colors.secondary, size: 16 }}
            width={36}
            height={36}
            fill={colors.surface2}
            style={styles.iconButton}
          >
            <Icon name="timer" size={18} color={colors.secondary} />
          </MenuButton>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={paused ? 'Resume workout' : 'Pause workout'}
            hitSlop={6}
            onPress={() => {
              void Haptics.selectionAsync();
              logger.togglePause();
            }}
            style={[
              styles.iconButton,
              { backgroundColor: paused ? colors.accent : colors.surface2 },
            ]}
          >
            <Icon
              name={paused ? 'play' : 'pause'}
              size={16}
              color={paused ? colors.onAccent : colors.secondary}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Workout options"
            hitSlop={6}
            onPress={openMenu}
            style={[styles.iconButton, { backgroundColor: colors.surface2 }]}
          >
            <Icon name="more" size={18} color={colors.secondary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Finish workout"
            onPress={finish}
            style={({ pressed }) => [
              styles.finish,
              { backgroundColor: colors.accent, borderRadius: radius.pill },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[type.callout, { color: colors.onAccent, fontWeight: '700' }]}>
              Finish
            </Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Renames the workout"
          onPress={rename}
        >
          <Text
            accessibilityRole="header"
            style={[type.title, { color: colors.text }]}
            numberOfLines={2}
          >
            {identity.name}
          </Text>
        </Pressable>
        <Text style={[type.callout, type.number, { color: colors.secondary }]}>
          {paused ? `Paused · ${elapsed}` : elapsed} · {ticked} {ticked === 1 ? 'set' : 'sets'}
        </Text>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: space.lg,
          gap: space.md,
          paddingBottom: insets.bottom + (restShown ? 120 : 40),
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {state.movements.map((movement) => (
          <MovementCard
            key={movement.key}
            movement={movement}
            supersetNames={supersetNames(movement.supersetKey)}
            history={logger.history}
            olderLatest={
              olderHistoryFor(logger.context, state.workoutDate)?.get(movement.exercise.id)
                ?.latest ?? null
            }
            prBadges={prBadges.get(movement.key)}
            workoutDate={state.workoutDate}
            weightUnit={logger.weightUnit}
            skipHighRepWarning={state.skipHighRepWarning}
            actions={actions}
          />
        ))}
        <Button
          label="Add exercise"
          icon="plus"
          variant={state.movements.length ? 'secondary' : 'primary'}
          onPress={() => setPickerOpen(true)}
        />
        <WorkoutNotes
          notes={state.notes}
          onChange={(notes) => change((latest) => ({ ...latest, notes }))}
        />
      </ScrollView>
      <RestBar
        rest={logger.rest}
        state={state}
        weightUnit={logger.weightUnit}
        bottom={insets.bottom + 12}
        onAdjust={logger.adjustRest}
        onSkip={logger.skipRest}
        onDismissDone={logger.dismissRestDone}
      />
      <ExercisePicker
        visible={pickerOpen}
        exercises={logger.exercises}
        recentIds={recentIds}
        addedIds={addedIds}
        onAdd={(selected) => change((latest) => addExercises(latest, selected, context))}
        onClose={() => setPickerOpen(false)}
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
        null,
        state.workoutDate,
        older,
        blocks?.blocks ?? [],
        measurements ?? [],
        blocks?.fresh_starts ?? [],
      ),
    [state.movements, state.workoutDate, logger.history, older, blocks, measurements],
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
    );
  }, [state.movements, state.workoutDate, badges, celebrations, measurements, unit]);
  return badges;
}

function WorkoutNotes({ notes, onChange }: { notes: string; onChange: (notes: string) => void }) {
  const { colors, type, radius } = useTheme();
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
        styles.notes,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          borderColor: colors.line,
        },
      ]}
    >
      <Icon name={loggerIcons.note} size={16} color={colors.muted} />
      <TextInput
        value={text}
        onChangeText={(next) => {
          setText(next);
          latest.current = next;
          onChange(next);
        }}
        placeholder="Workout notes…"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Workout notes"
        multiline
        style={[type.body, { flex: 1, color: colors.text, minHeight: 44, paddingTop: 0 }]}
      />
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
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: 8 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finish: {
    height: 36,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notes: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
});
