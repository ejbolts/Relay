import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  canAddSplitDay,
  canAddSplitDayType,
  legacySplitRoutine,
  MAX_PLANNED_EXERCISES,
  moveSplitDay,
  newRoutineMovement,
  routineFromTemplate,
  routineSaveError,
  splitDayContribution,
  splitDayCount,
  splitDayExtraChoices,
  splitDayExtraTypes,
  splitDayName,
  splitDaySummary,
  splitDayTypes,
  splitFailure,
  splitTypeNameError,
  swapPlannedExercise,
  withSplitDayExtraType,
  withSplitDayType,
} from '../../../../../frontend/src/splitEditing';
import {
  describeVolumeRow,
  exerciseMuscles,
  splitVolumeRows,
  TARGET_MARKS,
  volumeRowValue,
  type VolumeRow,
} from '../../../../../frontend/src/splitTargets';
import type {
  Exercise,
  Routine,
  RoutineDay,
  RoutineMovement,
  TrainingSplit,
  WorkoutType,
} from '../../../../../frontend/src/types';
import { localDate } from '../../../../../frontend/src/utils';
import { NEW_WORKOUT_TYPE_COLOR } from '../../../../../frontend/src/workoutTypes';
import {
  useExercises,
  useTrainingPreferences,
  useWeightUnit,
  useWorkoutHistory,
  useWorkoutTypes,
} from '../../../data/queries';
import {
  Button,
  Card,
  cardSurface,
  errorMessage,
  ErrorState,
  Loading,
} from '../../../ui/components';
import {
  OFFLINE_MESSAGE,
  placeholderWaitingForNetwork,
  waitingForNetwork,
} from '../../../data/offline';
import { Switch } from '../../../ui/controls';
import { Icon, type IconPair } from '../../../ui/Icon';
import { promptText, showMenu } from '../../../ui/prompts';
import { showToast } from '../../../ui/Toast';
import { useTheme, type Palette } from '../../../ui/theme';
import { ExercisePicker } from '../../workout/ExercisePicker';
import { settingsIcons } from '../icons';
import {
  refreshSplits,
  saveRoutine,
  useCardioGoal,
  useRoutines,
  useTrainingSplit,
  useWorkoutTypeActions,
} from '../settingsData';
import { PlannedExercise } from './PlannedExercise';
import { SplitGuide } from './SplitGuide';
import {
  splitEditorCoach,
  splitEditorFirstStage,
  splitEditorGuide,
  splitEditorIndex,
  splitEditorNextStage,
  splitEditorPreviousStage,
  splitGuideFlow,
  splitSavedOutcome,
  type SplitEditorStage,
} from '../../../../../frontend/src/setupGuideCoach';
import { formatWeight } from '../../../../../frontend/src/weightUnits';
import { CoachSpacer, CoachTarget, GuideCoach } from '../../guides/GuideCoach';
import {
  exitSetupGuide,
  finishSetupGuide,
  setupGuideTicket,
  updateSetupGuide,
  useExitGuideOnLeave,
  useSetupGuide,
} from '../../guides/setupGuides';
import { DateStepper, StepButton } from './SplitParts';

/**
 * Creates or edits a split, as the web's split editor: its name, the days of its cycle with their
 * workout types and planned exercises, and, for the active split, when it starts and whether it
 * is on. Opened with `id` (a saved split) or `template` (a new one).
 */
export function SplitEditorScreen() {
  const params = useLocalSearchParams<{ id?: string; template?: string }>();
  const routines = useRoutines();
  const split = useTrainingSplit();
  const types = useWorkoutTypes();
  if (
    waitingForNetwork(routines) ||
    waitingForNetwork(split) ||
    placeholderWaitingForNetwork(types)
  )
    return (
      <ErrorState
        message={OFFLINE_MESSAGE}
        onRetry={() => {
          void routines.refetch();
          void split.refetch();
          void types.refetch();
        }}
      />
    );
  if (routines.isPending || split.isPending || types.isPlaceholderData)
    return <Loading label="Loading split" />;
  const error = routines.error ?? split.error ?? types.error;
  if (error)
    return (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => {
          void routines.refetch();
          void split.refetch();
          void types.refetch();
        }}
      />
    );
  const allTypes = types.data ?? [];
  const current = split.data ?? null;
  const routine = params.id
    ? params.id === 'current-split'
      ? legacySplitRoutine(current, allTypes)
      : (routines.data?.find((item) => item.id === params.id) ?? null)
    : routineFromTemplate(params.template ?? 'custom', allTypes);
  if (!routine)
    return (
      <ErrorState
        message="This split is no longer saved."
        onRetry={() => void routines.refetch()}
      />
    );
  const schedule =
    routine.id && (routine.id === 'current-split' || routine.id === current?.routine_id)
      ? (current ?? undefined)
      : undefined;
  return (
    <Editor
      key={routine.id || params.template}
      routine={JSON.parse(JSON.stringify(routine)) as Routine}
      schedule={schedule}
      types={allTypes}
      activeId={current?.enabled ? (current.routine_id ?? 'current-split') : null}
    />
  );
}

type Picking = { day: number; replace?: number };

function Editor({
  routine,
  schedule,
  types,
  activeId,
}: {
  routine: Routine;
  schedule?: TrainingSplit;
  types: WorkoutType[];
  /** The active split, which the splits guide adds rep ranges to. */
  activeId: string | null;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const { colors, type, radius, space } = useTheme();
  const insets = useSafeAreaInsets();
  const [nameFocused, setNameFocused] = useState(false);
  const exercises = useExercises();
  const history = useWorkoutHistory();
  const preferences = useTrainingPreferences().data;
  const cardioGoal = useCardioGoal().data ?? null;
  const typeActions = useWorkoutTypeActions();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [value, setValue] = useState(routine);
  const [startDate, setStartDate] = useState(schedule?.start_date ?? localDate());
  const [enabled, setEnabled] = useState(schedule?.enabled ?? false);
  const [openDay, setOpenDay] = useState<number | null>(() => {
    const first = routine.days.findIndex((item) => item.workout_type_id);
    return first < 0 ? 0 : first;
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState<Picking | null>(null);
  // The splits guide coaches the editor while it runs, as the web's.
  const running = useSetupGuide('split');
  // The editor is part of the splits guide's feature, with the splits page under it.
  useExitGuideOnLeave('split');
  const [guide] = useState(() =>
    running ? splitEditorGuide(splitGuideFlow(activeId), routine) : undefined,
  );
  const [guideStage, setGuideStage] = useState<SplitEditorStage>(() =>
    splitEditorFirstStage(guide),
  );
  const unit = useWeightUnit();

  const library = useMemo(() => exercises.data ?? [], [exercises.data]);
  // The library's copies carry the latest muscle credits.
  const creditDays = useMemo(() => {
    const latest = new Map(library.map((item) => [item.id, item]));
    return value.days.map((item) => ({
      ...item,
      movements: item.movements.map((m) => ({
        ...m,
        exercise: latest.get(m.exercise_id) ?? m.exercise,
      })),
    }));
  }, [library, value.days]);
  const recentIds = useMemo(() => {
    const ids: string[] = [];
    for (const workout of history.data ?? [])
      for (const movement of workout.movements)
        if (!ids.includes(movement.exercise.id)) ids.push(movement.exercise.id);
    return ids;
  }, [history.data]);
  const volume = splitVolumeRows(
    creditDays,
    preferences?.weekly_muscle_set_goal ?? 10,
    preferences?.weekly_muscle_set_goals,
    cardioGoal,
  );
  const canSave = !saving && !typeActions.create.isPending && !exercises.error;

  const setDay = (index: number, next: RoutineDay) =>
    setValue((current) => ({
      ...current,
      days: current.days.map((item, i) => (i === index ? next : item)),
    }));
  function addDay(next: RoutineDay) {
    setValue((current) => ({ ...current, days: [...current.days, next] }));
    setOpenDay(value.days.length);
  }
  function move(index: number, direction: -1 | 1) {
    setValue((current) => ({ ...current, days: moveSplitDay(current.days, index, direction) }));
    setOpenDay(index + direction);
  }
  function fail(message: string) {
    setValidation(message);
    scroll.current?.scrollTo({ y: 0, animated: true });
  }

  async function save() {
    if (!canSave) return;
    const invalid = routineSaveError(value, types);
    if (invalid) {
      fail(invalid);
      return;
    }
    setValidation(null);
    setSaving(true);
    // Only the guide running when the save starts can be moved on or finished by it.
    const ticket = setupGuideTicket('split');
    try {
      const saved = await saveRoutine(
        value,
        schedule
          ? { start_date: startDate, enabled, progression: schedule.progression ?? 'workouts' }
          : undefined,
      );
      void refreshSplits(client);
      if (ticket) {
        // Saving the active split finishes the guide; a new one still needs starting.
        const outcome = splitSavedOutcome(saved.id, activeId, value.id === 'current-split');
        if (outcome.finish) finishSetupGuide(ticket);
        else updateSetupGuide(ticket, { useRoutineId: outcome.useRoutineId });
      }
      showToast('Split saved.');
      router.back();
    } catch (reason) {
      setSaving(false);
      fail(splitFailure(reason));
    }
  }

  /** Back to the previous step, or out of an unchanged editor on its first step, as the web's. */
  function coachBack(): (() => void) | undefined {
    const previous = splitEditorPreviousStage(guide, guideStage);
    if (previous) return () => setGuideStage(previous);
    return JSON.stringify(value) === JSON.stringify(routine) ? () => router.back() : undefined;
  }

  function newType() {
    promptText({
      title: 'New workout type',
      value: '',
      placeholder: 'e.g. Full body A',
      submitLabel: 'Add type',
      onSubmit: (name) => {
        if (!name.trim()) return;
        const taken = splitTypeNameError(name, types);
        if (taken) {
          fail(taken);
          return;
        }
        setValidation(null);
        typeActions.create.mutate(
          { name: name.trim().slice(0, 40), color: NEW_WORKOUT_TYPE_COLOR },
          {
            onSuccess: (created) => {
              if (canAddSplitDay(value.days))
                addDay({ workout_type_id: created.id, workout_type: created, movements: [] });
            },
            onError: (reason) => fail(splitFailure(reason)),
          },
        );
      },
    });
  }

  function addPicked(picked: Exercise[]) {
    if (!picking) return;
    const day = value.days[picking.day];
    if (picking.replace !== undefined) {
      const replacement = picked[0];
      const index = picking.replace;
      if (replacement)
        setDay(picking.day, {
          ...day,
          movements: day.movements.map((m, i) =>
            i === index ? swapPlannedExercise(m, replacement) : m,
          ),
        });
      return;
    }
    const room = MAX_PLANNED_EXERCISES - day.movements.length;
    setDay(picking.day, {
      ...day,
      movements: [...day.movements, ...picked.slice(0, room).map(newRoutineMovement)],
    });
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: routine.id ? 'Edit split' : 'New split',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
              <SplitGuide editor />
              {saving ? (
                <ActivityIndicator color={colors.accentText} />
              ) : (
                <CoachTarget id="split.save" header radius={8}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Save split"
                    accessibilityState={{ disabled: !canSave }}
                    disabled={!canSave}
                    hitSlop={8}
                    onPress={() => void save()}
                  >
                    <Text
                      style={[
                        type.body,
                        { color: colors.accentText, fontWeight: '600', opacity: canSave ? 1 : 0.4 },
                      ]}
                    >
                      Save
                    </Text>
                  </Pressable>
                </CoachTarget>
              )}
            </View>
          ),
        }}
      />
      <ScrollView
        ref={scroll}
        style={{ flex: 1, backgroundColor: colors.page }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.page,
          { padding: space.gutter, paddingBottom: Math.max(56, insets.bottom + 36) },
        ]}
      >
        <TextInput
          accessibilityLabel="Split name"
          value={value.name}
          onChangeText={(name) => setValue((current) => ({ ...current, name }))}
          onFocus={() => setNameFocused(true)}
          onBlur={() => setNameFocused(false)}
          maxLength={40}
          editable={!saving}
          placeholder="Split name"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          style={[
            type.title,
            styles.name,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: nameFocused ? colors.accent : colors.lineStrong,
              borderRadius: radius.lg,
            },
          ]}
        />
        {schedule && (
          <View style={[cardSurface(colors), { overflow: 'hidden' }]}>
            <DateStepper
              label="Starts"
              date={startDate}
              onChange={setStartDate}
              disabled={saving}
            />
            <View style={[styles.separator, { backgroundColor: colors.line }]} />
            <View style={styles.switchRow}>
              <Text style={[type.body, { color: colors.text, flex: 1 }]}>Active</Text>
              <Switch
                accessibilityLabel="Active"
                value={enabled}
                disabled={saving}
                onChange={setEnabled}
              />
            </View>
          </View>
        )}
        {exercises.error && (
          <ErrorState
            message={errorMessage(exercises.error)}
            onRetry={() => void exercises.refetch()}
          />
        )}
        {!!validation && (
          <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
            {validation}
          </Text>
        )}
        <VolumeCard volume={volume} selected={selected} onSelect={setSelected} />
        <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
          Cycle · {splitDayCount(value.days)}
        </Text>
        <CoachTarget id="split.days" radius={20} style={styles.page}>
          {value.days.map((item, index) => (
            <DayCard
              key={index}
              index={index}
              day={item}
              creditDay={creditDays[index]}
              count={value.days.length}
              open={openDay === index}
              selected={selected}
              types={types}
              disabled={saving}
              onToggle={() => setOpenDay(openDay === index ? null : index)}
              onChange={(next) => setDay(index, next)}
              onMove={(direction) => move(index, direction)}
              onRemove={() => {
                setValue((current) => ({
                  ...current,
                  days: current.days.filter((_, i) => i !== index),
                }));
                setOpenDay(null);
              }}
              onAddExercises={() => setPicking({ day: index })}
              onReplace={(movement) => setPicking({ day: index, replace: movement })}
              canAddExercises={library.length > 0}
              coachReps={!!running && guideStage === 'reps'}
            />
          ))}
        </CoachTarget>
        <View style={styles.addDays}>
          <Button
            label="Add workout day"
            icon="plus"
            variant="secondary"
            disabled={saving || !canAddSplitDay(value.days)}
            onPress={() => {
              const first = types.find((item) => !item.archived);
              if (first) addDay({ workout_type_id: first.id, workout_type: first, movements: [] });
            }}
            style={{ flex: 1 }}
          />
          <Button
            label="Add rest day"
            icon="plus"
            variant="secondary"
            disabled={saving || !canAddSplitDay(value.days)}
            onPress={() => addDay({ workout_type_id: null, workout_type: null, movements: [] })}
            style={{ flex: 1 }}
          />
        </View>
        <Button
          label={typeActions.create.isPending ? 'Adding…' : 'New workout type'}
          icon={settingsIcons.types}
          variant="link"
          align="center"
          disabled={saving || typeActions.create.isPending}
          onPress={newType}
        />
        <CoachSpacer />
      </ScrollView>
      {running && guide && (
        <GuideCoach
          step={splitEditorCoach(guideStage, guide, value, running.facts.lift, (kg) =>
            formatWeight(kg, unit, 1),
          )}
          index={splitEditorIndex(guide, guideStage)}
          total={guide.total}
          scroll={scroll}
          onNext={() => setGuideStage(splitEditorNextStage(guideStage))}
          onBack={coachBack()}
          onExit={() => exitSetupGuide('split')}
        />
      )}
      <ExercisePicker
        visible={!!picking}
        exercises={library}
        recentIds={recentIds}
        addedIds={
          new Set(picking ? value.days[picking.day]?.movements.map((m) => m.exercise_id) : [])
        }
        onAdd={addPicked}
        onClose={() => setPicking(null)}
      />
    </KeyboardAvoidingView>
  );
}

function statusColour(colors: Palette, status: VolumeRow['status']) {
  return status === 'met'
    ? colors.good
    : status === 'close'
      ? colors.gold
      : status === 'under'
        ? colors.danger
        : colors.muted;
}

/** Planned weekly sets per muscle and cardio minutes against the account's goals. */
function VolumeCard({
  volume,
  selected,
  onSelect,
}: {
  volume: ReturnType<typeof splitVolumeRows>;
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const { colors, type } = useTheme();
  const rows = [...volume.rows, ...(volume.cardio ? [volume.cardio] : [])];
  return (
    <Card>
      <View style={styles.volumeHeader}>
        <Text accessibilityRole="header" style={[type.headline, { color: colors.text, flex: 1 }]}>
          Weekly volume
        </Text>
        {volume.goals > 0 && (
          <Text style={[type.footnote, { color: colors.secondary }]}>
            {volume.met === volume.goals ? `${TARGET_MARKS.met} ` : ''}
            {volume.met} of {volume.goals} on target
          </Text>
        )}
      </View>
      {rows.length === 0 ? (
        <Text style={[type.callout, { color: colors.muted }]}>No exercises yet</Text>
      ) : (
        rows.map((row) => {
          const scale = (row.goal ?? row.value) * 1.6 || 1;
          const on = selected === row.key;
          const tint = statusColour(colors, row.status);
          return (
            <Pressable
              key={row.key}
              accessibilityRole="button"
              accessibilityLabel={describeVolumeRow(row)}
              accessibilityState={{ selected: on }}
              onPress={() => onSelect(on ? null : row.key)}
              style={[styles.volumeRow, on && { backgroundColor: colors.accentSoft }]}
            >
              <Text style={[styles.mark, { color: tint }]}>
                {row.status ? TARGET_MARKS[row.status] : '·'}
              </Text>
              <Text style={[type.footnote, { color: colors.text, width: 96 }]} numberOfLines={1}>
                {row.name}
              </Text>
              <View style={[styles.track, { backgroundColor: colors.surface3 }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${Math.min(100, (row.value / scale) * 100)}%`,
                      backgroundColor: tint,
                    },
                  ]}
                />
                {row.goal != null && (
                  <View
                    style={[
                      styles.goal,
                      { left: `${(row.goal / scale) * 100}%`, backgroundColor: colors.text },
                    ]}
                  />
                )}
              </View>
              <Text
                style={[
                  type.footnote,
                  type.number,
                  styles.volumeValue,
                  { color: colors.secondary },
                ]}
              >
                {volumeRowValue(row)}
                {row.unit === 'min' ? `${row.goal != null ? ` / ${row.goal}` : ''} min` : ''}
              </Text>
            </Pressable>
          );
        })
      )}
    </Card>
  );
}

function DayCard({
  index,
  day,
  creditDay,
  count,
  open,
  selected,
  types,
  disabled,
  canAddExercises,
  onToggle,
  onChange,
  onMove,
  onRemove,
  onAddExercises,
  onReplace,
  coachReps = false,
}: {
  index: number;
  day: RoutineDay;
  creditDay: RoutineDay;
  count: number;
  open: boolean;
  selected: string | null;
  types: WorkoutType[];
  disabled: boolean;
  canAddExercises: boolean;
  onToggle: () => void;
  onChange: (day: RoutineDay) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onAddExercises: () => void;
  onReplace: (movement: number) => void;
  /** The splits guide's rep range step points at this day's first Reps, when the day is open. */
  coachReps?: boolean;
}) {
  const { colors, type, radius } = useTheme();
  const firstReps = day.movements.findIndex((item) => item.exercise.kind !== 'cardio');
  const contribution = splitDayContribution(creditDay, selected);
  const label = `Day ${index + 1}`;
  const name = splitDayName(day, types);
  const colour = day.workout_type?.color ?? colors.deemph;
  // A mixed day's bar stacks a band of each type's colour.
  const dayColours = splitDayTypes(day, types).map((item) => item.color);
  const extras = splitDayExtraTypes(day, types);
  const chooseType = () =>
    showMenu(`${label} workout type`, [
      {
        label: day.workout_type_id === null ? 'Rest ✓' : 'Rest',
        onPress: () => onChange(withSplitDayType(day, null)),
      },
      ...types
        .filter((item) => !item.archived || item.id === day.workout_type_id)
        .map((item) => ({
          label: `${item.name}${item.archived ? ' (removed)' : ''}${item.id === day.workout_type_id ? ' ✓' : ''}`,
          onPress: () => onChange(withSplitDayType(day, item)),
        })),
    ]);
  const extraIds = day.extra_workout_type_ids ?? [];
  const chooseExtra = (at: number) =>
    showMenu(`${label} workout type ${at + 2}`, [
      ...splitDayExtraChoices(day, at, types).map((item) => ({
        label: `${item.name}${item.archived ? ' (removed)' : ''}${item.id === extraIds[at] ? ' ✓' : ''}`,
        onPress: () => onChange(withSplitDayExtraType(day, at, item)),
      })),
      {
        label: 'Remove from this day',
        destructive: true,
        onPress: () => onChange(withSplitDayExtraType(day, at, null)),
      },
    ]);
  const addExtra = () =>
    showMenu(
      `Add a workout type to ${label.toLowerCase()}`,
      splitDayExtraChoices(day, extraIds.length, types).map((item) => ({
        label: item.name,
        onPress: () => onChange(withSplitDayExtraType(day, extraIds.length, item)),
      })),
    );
  const movement = (i: number, next: RoutineMovement | null) =>
    onChange({
      ...day,
      movements: day.movements.flatMap((item, at) => (at !== i ? [item] : next ? [next] : [])),
    });
  return (
    <View
      style={[cardSurface(colors), styles.day, { opacity: selected && !contribution ? 0.5 : 1 }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label} · ${name}, ${splitDaySummary(day)}`}
        onPress={onToggle}
        style={styles.dayHeader}
      >
        <View style={[styles.dayBar, { backgroundColor: colour }]}>
          {dayColours.length > 1 &&
            dayColours.map((item, at) => (
              <View key={at} style={{ flex: 1, backgroundColor: item }} />
            ))}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.callout, { color: colors.text, fontWeight: '700' }]}>
            {label} · {name}
          </Text>
          <Text style={[type.footnote, { color: colors.muted }]}>{splitDaySummary(day)}</Text>
        </View>
        {contribution && (
          <Text
            style={[type.footnote, type.number, { color: colors.accentText, fontWeight: '700' }]}
          >
            {contribution}
          </Text>
        )}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} color={colors.muted} />
      </Pressable>
      {open && (
        <View style={styles.dayBody}>
          <View style={styles.dayTools}>
            <View style={styles.dayTypes}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${label} workout type: ${splitDayName({ ...day, extra_workout_type_ids: [] })}`}
                disabled={disabled}
                onPress={chooseType}
                style={[
                  styles.typeButton,
                  { backgroundColor: colors.surface2, borderRadius: radius.md },
                ]}
              >
                <View style={[styles.typeDot, { backgroundColor: colour }]} />
                <Text
                  style={[type.callout, { color: colors.text, fontWeight: '600', flexShrink: 1 }]}
                  numberOfLines={1}
                >
                  {splitDayName({ ...day, extra_workout_type_ids: [] })}
                </Text>
                <Icon name="chevronDown" size={12} color={colors.muted} />
              </Pressable>
              {extras.map((extra, at) => (
                <Pressable
                  key={extraIds[at] ?? at}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} workout type ${at + 2}: ${extra?.name ?? 'Removed type'}`}
                  disabled={disabled}
                  onPress={() => chooseExtra(at)}
                  style={[
                    styles.typeButton,
                    { backgroundColor: colors.surface2, borderRadius: radius.md },
                  ]}
                >
                  <View
                    style={[styles.typeDot, { backgroundColor: extra?.color ?? colors.deemph }]}
                  />
                  <Text
                    style={[type.callout, { color: colors.text, fontWeight: '600', flexShrink: 1 }]}
                    numberOfLines={1}
                  >
                    {extra?.name ?? 'Removed type'}
                  </Text>
                  <Icon name="chevronDown" size={12} color={colors.muted} />
                </Pressable>
              ))}
              {canAddSplitDayType(day, types) && (
                <StepButton
                  icon="plus"
                  label={`Add a workout type to day ${index + 1}`}
                  disabled={disabled}
                  onPress={addExtra}
                />
              )}
            </View>
            <View style={{ flex: 1 }} />
            <MoveButton
              icon={settingsIcons.up}
              label={`Move day ${index + 1} earlier`}
              disabled={disabled || index === 0}
              onPress={() => onMove(-1)}
            />
            <MoveButton
              icon={settingsIcons.down}
              label={`Move day ${index + 1} later`}
              disabled={disabled || index === count - 1}
              onPress={() => onMove(1)}
            />
            <StepButton
              icon="close"
              label={`Remove day ${index + 1}`}
              disabled={disabled || count === 1}
              onPress={onRemove}
            />
          </View>
          {day.movements.map((item, i) => (
            <PlannedExercise
              key={`${i}-${item.exercise_id}`}
              movement={item}
              muscles={exerciseMuscles(creditDay.movements[i]?.exercise ?? item.exercise)}
              target={`day ${index + 1}`}
              disabled={disabled}
              onChange={(next) => movement(i, next)}
              onReplace={() => onReplace(i)}
              coachReps={coachReps && i === firstReps}
            />
          ))}
          {!!day.workout_type_id && (
            <Button
              label="Add exercise"
              icon="plus"
              variant="link"
              disabled={
                disabled || !canAddExercises || day.movements.length >= MAX_PLANNED_EXERCISES
              }
              onPress={onAddExercises}
              style={{ alignSelf: 'flex-start' }}
            />
          )}
        </View>
      )}
    </View>
  );
}

function MoveButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconPair;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={[
        styles.stepButton,
        { backgroundColor: colors.surface2 },
        disabled && { opacity: 0.35 },
      ]}
    >
      <Icon name={icon} size={14} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16 },
  name: { paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1 },
  separator: { height: 1, marginLeft: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: 16 },
  volumeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 30,
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  mark: { width: 14, textAlign: 'center', fontWeight: '800', fontSize: 13 },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  goal: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1 },
  volumeValue: { minWidth: 48, textAlign: 'right' },
  day: { overflow: 'hidden' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  dayBar: { width: 5, alignSelf: 'stretch', borderRadius: 3, overflow: 'hidden' },
  dayBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  dayTools: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexShrink: 1,
  },
  typeDot: { width: 10, height: 10, borderRadius: 5 },
  stepButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDays: { flexDirection: 'row', gap: 10 },
});
