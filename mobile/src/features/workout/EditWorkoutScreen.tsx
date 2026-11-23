import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { usePreventRemove, useRouter } from 'expo-router';
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
import { machineAliases } from '../../../../frontend/src/exerciseHistory';
import type { SetKind } from '../../../../frontend/src/setFieldValues';
import type { Exercise, TrackedWorkout, WorkoutInput } from '../../../../frontend/src/types';
import {
  formatMinutesDuration,
  timesCanRecordDuration,
  workoutDurationMinutes,
  workoutTimeInputValue,
} from '../../../../frontend/src/utils';
import {
  isWorkoutConflictError,
  WORKOUT_CONFLICT_UNSAVED,
  type WorkoutConflictChoice,
} from '../../../../frontend/src/workoutConflict';
import { apiGet, apiSend } from '../../data/api';
import { newId } from '../../data/deviceStorage';
import { refreshTraining } from '../../data/queries';
import { Button, ErrorState, errorMessage, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { PromptHost, promptText, showMenu, type MenuOption } from '../../ui/prompts';
import { useTheme } from '../../ui/theme';
import { showToast, ToastHost } from '../../ui/Toast';
import { DateField, TimeField } from '../body/DateField';
import { useSavedWorkout } from '../training/trainingQueries';
import { ExercisePicker } from './ExercisePicker';
import {
  addExercises,
  addSet,
  checkEdit,
  chooseMachines,
  chooseWorkoutType,
  completeExercise,
  deleteSet,
  editInput,
  mergeMachines,
  moveMovement,
  moveSet,
  removeMovement,
  resumeLogger,
  selectedType,
  setMachineSettings,
  setMovementNotes,
  setSetKind,
  swapExercise,
  updateSet,
  workoutIdentity,
  type EditTimes,
  type LoggerState,
} from './loggerState';
import { MachineSheet } from './MachineSheet';
import { MovementCard, type MovementActions } from './MovementCard';
import { SwapSheet } from './SwapSheet';
import { useLogger, type LoggerApi } from './WorkoutProvider';

/**
 * Edits a saved workout, as the web's editor does: its name, type, duration and notes, and its
 * exercises and sets. Save sends the whole workout with the revision it loaded; if another
 * device saved it meanwhile, it asks whether to keep this version or load the other.
 */
export function EditWorkoutScreen({ workoutId }: { workoutId: string }) {
  const query = useSavedWorkout(workoutId);
  const logger = useLogger();
  const { colors } = useTheme();
  const workout = query.data;
  return (
    <View style={[styles.page, { backgroundColor: colors.page }]}>
      {query.isPending || !logger ? (
        <Loading label="Loading workout" />
      ) : !workout ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        // A newer revision loaded after "Load latest" starts the edit again from it.
        <Editor key={`${workout.id}:${workout.revision ?? 0}`} workout={workout} logger={logger} />
      )}
      <ToastHost bottom={24} />
      <PromptHost />
    </View>
  );
}

/** The workout's editable rows, keyed like a live workout so the logger's rules apply. */
function editState(workout: TrackedWorkout): LoggerState {
  return {
    ...resumeLogger(workout, { now: Date.now(), clientSessionId: newId() }, newId),
    resumingWorkoutId: null,
    previousDurationMinutes: 0,
  };
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Times to start from when a workout without them gets some: it ended when it was saved, if that
 * was on its day, and started its duration earlier.
 */
function suggestedTimes(workout: TrackedWorkout, durationMinutes: number) {
  const saved = new Date(workout.created_at);
  const sameDay =
    `${saved.getFullYear()}-${pad(saved.getMonth() + 1)}-${pad(saved.getDate())}` ===
    workout.workout_date;
  const end = sameDay ? saved.getHours() * 60 + saved.getMinutes() : 18 * 60;
  const start = (((end - Math.max(durationMinutes, 1)) % 1440) + 1440) % 1440;
  const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  return { startTime: hhmm(start), endTime: hhmm(end) };
}

/** Saves the edit, asking what to do whenever another device saved the workout meanwhile. */
async function saveEdit(
  workout: TrackedWorkout,
  payload: WorkoutInput,
  ask: () => Promise<WorkoutConflictChoice>,
): Promise<TrackedWorkout | 'load-latest'> {
  const path = `/api/workouts/${encodeURIComponent(workout.id)}`;
  let attempt = payload;
  for (;;) {
    try {
      return await apiSend<TrackedWorkout>(path, 'PUT', attempt);
    } catch (reason) {
      if (!isWorkoutConflictError(reason)) throw reason;
    }
    const choice = await ask();
    if (choice === 'load-latest') return choice;
    if (choice === 'cancel') throw new Error(WORKOUT_CONFLICT_UNSAVED);
    // Keep mine: save over the version that is on the server now. A change landing between this
    // read and the save is still caught, and asks again.
    const latest = await apiGet<TrackedWorkout>(path);
    attempt = { ...payload, base_revision: latest.revision };
  }
}

/** The web's "Changed on another device" choice, as native alerts. */
function askConflict(name: string): Promise<WorkoutConflictChoice> {
  return new Promise((resolve) => {
    const first = () =>
      Alert.alert(
        'Changed on another device',
        `“${name}” was saved on another device after you opened it here. Keeping your version replaces those changes.`,
        [
          {
            text: 'Load latest',
            onPress: () =>
              Alert.alert(
                'Discard your changes?',
                `Discard the changes you made here and load the latest “${name}”?`,
                [
                  { text: 'Back', style: 'cancel', onPress: first },
                  {
                    text: 'Discard my changes',
                    style: 'destructive',
                    onPress: () => resolve('load-latest'),
                  },
                ],
                { cancelable: false },
              ),
          },
          { text: 'Keep my version', onPress: () => resolve('keep-mine') },
        ],
        { cancelable: true, onDismiss: () => resolve('cancel') },
      );
    first();
  });
}

function Editor({ workout, logger }: { workout: TrackedWorkout; logger: LoggerApi }) {
  const router = useRouter();
  const client = useQueryClient();
  const insets = useSafeAreaInsets();
  const { colors, type, space, radius } = useTheme();
  const { types, context, exercises, history, weightUnit } = logger;
  const [state, setState] = useState(() => editState(workout));
  const stateRef = useRef(state);
  const [times, setTimes] = useState<EditTimes>(() => ({
    durationMinutes: workout.duration_minutes ?? 0,
    startTime: workoutTimeInputValue(workout.start_time),
    endTime: workoutTimeInputValue(workout.end_time),
    baseRevision: workout.revision,
  }));
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<{ swapping: string | null } | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [machinesFor, setMachinesFor] = useState<string | null>(null);
  const identity = workoutIdentity(state, types);
  // Changed when anything differs from what was loaded (row keys aside).
  const [dirty, setDirty] = useState(false);

  const change = useCallback((update: (current: LoggerState) => LoggerState) => {
    const next = update(stateRef.current);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
    setDirty(true);
  }, []);

  // Back, or a swipe back, asks before throwing changes away, as the web's editor does.
  const [leaving, setLeaving] = useState(false);
  usePreventRemove(dirty && !leaving, ({ repeat }) =>
    Alert.alert('Discard changes?', 'Your changes to this workout will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard changes',
        style: 'destructive',
        onPress: () => {
          setLeaving(true);
          repeat();
        },
      },
    ]),
  );
  // Saved, or replaced by the other device's version: leave once nothing holds the screen.
  useEffect(() => {
    if (leaving) router.back();
  }, [leaving, router]);
  const leave = useCallback(() => setLeaving(true), []);

  const recentIds = useMemo(() => {
    const seen = new Set<string>();
    for (const item of history)
      for (const movement of item.movements) seen.add(movement.exercise.id);
    return [...seen];
  }, [history]);
  const addedIds = useMemo(
    () => new Set(state.movements.map((movement) => movement.exercise.id)),
    [state.movements],
  );
  const swapMovement = state.movements.find((item) => item.key === swapping) ?? null;
  const machineMovement = state.movements.find((item) => item.key === machinesFor) ?? null;

  const openActions = useCallback(
    (movementKey: string) => {
      const current = stateRef.current;
      const index = current.movements.findIndex((item) => item.key === movementKey);
      const movement = current.movements[index];
      if (!movement) return;
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
          : [{ label: 'Machines', onPress: () => setMachinesFor(movementKey) }]),
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
      options.push({
        label: 'Remove exercise',
        destructive: true,
        onPress: () => change((latest) => removeMovement(latest, movementKey)),
      });
      showMenu(movement.exercise.name, options);
    },
    [change],
  );

  const actions = useMemo<MovementActions>(
    () => ({
      updateSet: (movementKey, setKey, values) =>
        change(
          (latest) =>
            updateSet(latest, movementKey, setKey, values, {
              addedByHand: true,
              workoutBodyweight: null,
              editing: true,
            }).state,
        ),
      addSet: (movementKey) => change((latest) => addSet(latest, movementKey, context).state),
      insertSet: (movementKey, position) =>
        change((latest) => addSet(latest, movementKey, context, position).state),
      deleteSet: (movementKey, setKey) => {
        const movement = stateRef.current.movements.find((item) => item.key === movementKey);
        if (movement?.sets.length === 1) {
          showToast('An exercise needs at least one set. Remove the exercise instead.');
          return;
        }
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        change((latest) => deleteSet(latest, movementKey, setKey));
      },
      moveSet: (movementKey, from, to) =>
        change((latest) => moveSet(latest, movementKey, from, to)),
      setKind: (movementKey, setKey, kind: SetKind) =>
        change((latest) => setSetKind(latest, movementKey, setKey, kind)),
      completeExercise: (movementKey, isComplete) =>
        change((latest) => completeExercise(latest, movementKey, isComplete)),
      openActions,
      skipHighRepWarning: () => change((latest) => ({ ...latest, skipHighRepWarning: true })),
      openMachines: setMachinesFor,
      // Saved movements already have their machines.
      restoreMachines: () => undefined,
    }),
    [change, context, openActions],
  );

  function editDuration() {
    promptText({
      title: 'Duration in minutes',
      value: String(times.durationMinutes || ''),
      placeholder: '60',
      submitLabel: 'Save',
      onSubmit: (text) => {
        const minutes = Number(text.trim());
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
          showToast('Enter a whole number of minutes, up to 24 hours.');
          return;
        }
        setTimes((current) => ({ ...current, durationMinutes: minutes }));
        setDirty(true);
      },
    });
  }

  // Recorded start and end times set the duration, as on the web.
  function editTimes(startTime: string, endTime: string) {
    setTimes((current) => ({
      ...current,
      startTime,
      endTime,
      durationMinutes: workoutDurationMinutes(startTime, endTime) ?? current.durationMinutes,
    }));
    setDirty(true);
  }

  async function save() {
    if (saving) return;
    const current = stateRef.current;
    const check = checkEdit(current, types, times);
    if (check.kind !== 'ready') {
      Alert.alert(
        "Can't save yet",
        check.kind === 'blocked'
          ? check.message
          : `Choose a machine for every set of ${check.exercise}.`,
      );
      return;
    }
    setSaving(true);
    try {
      const result = await saveEdit(workout, editInput(current, types, times, check), () =>
        askConflict(workout.name),
      );
      void refreshTraining(client);
      if (result === 'load-latest') {
        // The other device's version replaces these changes.
        leave();
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Workout saved');
      leave();
    } catch (reason) {
      Alert.alert(
        'Not saved',
        reason instanceof Error ? reason.message : 'Could not save the workout.',
      );
    } finally {
      setSaving(false);
    }
  }

  const supersetNames = (groupKey: string | null) =>
    groupKey
      ? state.movements
          .filter((item) => item.supersetKey === groupKey)
          .map((item) => item.exercise.name)
      : null;
  const timeRange = times.startTime && times.endTime ? `${times.startTime}–${times.endTime}` : null;
  const top = Platform.OS === 'ios' ? insets.top + 6 : insets.top + 8;

  return (
    <>
      <View style={[styles.bar, { paddingTop: top, borderColor: colors.line }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.barButton}
        >
          <Text style={[type.body, { color: colors.accentText }]}>Cancel</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
          Edit workout
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save workout"
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={() => void save()}
          hitSlop={8}
          style={[styles.barButton, { alignItems: 'flex-end' }]}
        >
          <Text
            style={[
              type.body,
              { color: saving ? colors.muted : colors.accentText, fontWeight: '700' },
            ]}
          >
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: space.lg,
          gap: space.md,
          paddingBottom: insets.bottom + 40,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <View
          style={[styles.details, { backgroundColor: colors.surface, borderRadius: radius.card }]}
        >
          <DetailRow
            label="Name"
            value={identity.name}
            onPress={() =>
              promptText({
                title: 'Rename workout',
                value: state.name.trim() || identity.name,
                placeholder: identity.name,
                submitLabel: 'Save',
                onSubmit: (name) => change((latest) => ({ ...latest, name: name.trim() })),
              })
            }
          />
          <DetailRow
            label="Type"
            value={selectedType(state, types).name}
            onPress={() => {
              const current = selectedType(state, types);
              showMenu(
                'Workout type',
                types
                  .filter((item) => !item.archived || item.id === current.id)
                  .map((item) => ({
                    label: item.id === current.id ? `${item.name} ✓` : item.name,
                    onPress: () => change((latest) => chooseWorkoutType(latest, item, types)),
                  })),
              );
            }}
          />
          <View style={styles.timing}>
            <DateField
              label="Date"
              value={state.workoutDate}
              onChange={(workoutDate) => change((latest) => ({ ...latest, workoutDate }))}
            />
            {timeRange ? (
              <>
                <TimeField
                  label="Start time"
                  value={times.startTime}
                  onChange={(start) => editTimes(start, times.endTime)}
                />
                <TimeField
                  label="End time"
                  value={times.endTime}
                  onChange={(end) => editTimes(times.startTime, end)}
                />
              </>
            ) : null}
          </View>
          <DetailRow
            label="Duration"
            value={formatMinutesDuration(times.durationMinutes)}
            // Recorded start and end times set the duration, as on the web.
            onPress={timeRange ? undefined : editDuration}
          />
          {/* Times can't record a 24-hour workout, which keeps its duration instead. */}
          {(timeRange || timesCanRecordDuration(times.durationMinutes)) && (
            <Button
              label={timeRange ? 'Clear start and end times' : 'Add start and end times'}
              variant="link"
              onPress={() => {
                if (timeRange) editTimes('', '');
                else {
                  const suggested = suggestedTimes(workout, times.durationMinutes);
                  editTimes(suggested.startTime, suggested.endTime);
                }
              }}
              style={{ alignSelf: 'flex-start' }}
            />
          )}
          <TextInput
            value={state.notes}
            onChangeText={(notes) => change((latest) => ({ ...latest, notes }))}
            placeholder="Workout notes…"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Workout notes"
            multiline
            style={[type.body, styles.notes, { color: colors.text, borderColor: colors.line }]}
          />
        </View>
        {state.movements.map((movement) => (
          <MovementCard
            key={movement.key}
            movement={movement}
            supersetNames={supersetNames(movement.supersetKey)}
            history={history}
            excludedWorkoutId={workout.id}
            workoutDate={state.workoutDate}
            weightUnit={weightUnit}
            skipHighRepWarning={state.skipHighRepWarning}
            actions={actions}
          />
        ))}
        <Button
          label="Add exercise"
          icon="plus"
          variant="secondary"
          onPress={() => setPicker({ swapping: null })}
        />
      </ScrollView>
      <SwapSheet
        exercise={swapMovement?.exercise ?? null}
        plannedSetCount={swapMovement?.sets.filter((item) => !item.completed).length ?? 0}
        loggedSetCount={swapMovement?.sets.filter((item) => item.completed).length ?? 0}
        exercises={exercises}
        excludedIds={state.movements.map((item) => item.exercise.id)}
        recentIds={recentIds}
        lastDone={new Map()}
        onChoose={(replacement: Exercise) => {
          const key = swapping;
          if (key) change((latest) => swapExercise(latest, key, replacement, context));
          setSwapping(null);
        }}
        onBrowseAll={() => {
          setPicker({ swapping });
          setSwapping(null);
        }}
        onClose={() => setSwapping(null)}
      />
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
          if (key)
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
      <ExercisePicker
        visible={!!picker}
        mode={picker?.swapping ? 'swap' : 'add'}
        exercises={exercises}
        recentIds={recentIds}
        addedIds={addedIds}
        category={identity.category}
        chooseMachines
        onAdd={(selected, machineChoices) => {
          const target = picker?.swapping;
          if (target) {
            if (selected[0]) change((latest) => swapExercise(latest, target, selected[0], context));
          } else change((latest) => addExercises(latest, selected, context, machineChoices));
        }}
        onCreateSuperset={(selected, machineChoices) =>
          change((latest) => addExercises(latest, selected, context, machineChoices, newId()))
        }
        onCreate={logger.createExercise}
        onClose={() => setPicker(null)}
      />
    </>
  );
}

function DetailRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const { colors, type } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: colors.line },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[type.callout, { color: colors.secondary }]}>{label}</Text>
      <Text style={[type.callout, { color: colors.text, flex: 1, textAlign: 'right' }]}>
        {value}
      </Text>
      {onPress && <Icon name="chevronRight" size={14} color={colors.muted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barButton: { minWidth: 72 },
  details: { paddingHorizontal: 14, paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  timing: { gap: 8, paddingVertical: 10 },
  notes: { minHeight: 64, paddingVertical: 12, textAlignVertical: 'top' },
});
