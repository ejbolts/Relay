import * as Haptics from 'expo-haptics';
import { memo, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, type TextInput } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { matchingLastSessionSet } from '../../../../frontend/src/lastSessionSet';
import { progressionHint, progressionTarget } from '../../../../frontend/src/repProgression';
import { unusualSetEntryWarning } from '../../../../frontend/src/setEntryConfirmation';
import {
  SET_KINDS,
  setKindOf,
  setNumberLabels,
  type SetKind,
} from '../../../../frontend/src/setFieldValues';
import { setLabel } from '../../../../frontend/src/trainingSummary';
import type { TrackedSet, TrackedWorkout } from '../../../../frontend/src/types';
import { formatSeconds } from '../../../../frontend/src/utils';
import {
  formatWeightNumber,
  weightInputKg,
  weightInputValue,
  type WeightUnit,
} from '../../../../frontend/src/weightUnits';
import type {
  WorkoutDraftMovement,
  WorkoutDraftSet,
} from '../../../../frontend/src/workoutMovements';
import { hasRecordedPerformance, latestExerciseSets } from '../../../../frontend/src/workoutSets';
import { supersetGroupName } from '../../../../frontend/src/workoutSupersets';
import { Icon } from '../../ui/Icon';
import { MenuButton, type MenuItem } from '../../ui/MenuButton';
import { useTheme } from '../../ui/theme';
import { formatPlain, NumberField, parseDecimal, parseWhole } from './NumberField';
import { restMenuItems } from './restChoices';

export interface MovementActions {
  updateSet: (movementKey: string, setKey: string, update: Partial<WorkoutDraftSet>) => void;
  addSet: (movementKey: string) => void;
  deleteSet: (movementKey: string, setKey: string) => void;
  moveSet: (movementKey: string, from: number, to: number) => void;
  setKind: (movementKey: string, setKey: string, kind: SetKind) => void;
  completeExercise: (movementKey: string, isComplete: boolean) => void;
  openActions: (movementKey: string) => void;
  skipHighRepWarning: () => void;
}

/** One exercise of the live workout: its target, sets and actions. */
export const MovementCard = memo(function MovementCard({
  movement,
  supersetNames,
  history,
  workoutDate,
  weightUnit,
  skipHighRepWarning,
  actions,
}: {
  movement: WorkoutDraftMovement;
  /** The names in this exercise's superset, in order, when it is in one. */
  supersetNames: string[] | null;
  history: TrackedWorkout[];
  workoutDate: string;
  weightUnit: WeightUnit;
  skipHighRepWarning: boolean;
  actions: MovementActions;
}) {
  const { colors, type, radius, space } = useTheme();
  const cardio = movement.exercise.kind === 'cardio';
  // Hints come from the last session with working sets, as on the web.
  const lastSession = useMemo(
    () => latestExerciseSets(history, movement.exercise.id, workoutDate),
    [history, movement.exercise.id, workoutDate],
  );
  const target =
    movement.repRange && !cardio
      ? progressionHint(
          movement.repRange,
          progressionTarget(movement.repRange, lastSession, weightUnit),
          weightUnit,
        )
      : null;
  const labels = setNumberLabels(movement.sets);
  const name = movement.exercise.name;

  return (
    <View
      accessibilityLabel={name}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: movement.isComplete ? colors.good : colors.line,
          borderRadius: radius.card,
          padding: space.lg,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          {supersetNames && (
            <View style={styles.badgeRow}>
              <Icon name={{ sf: 'link', md: 'link' }} size={12} color={colors.accentText} />
              <Text style={[type.caption, { color: colors.accentText, fontWeight: '700' }]}>
                {supersetGroupName(supersetNames.length)}
              </Text>
            </View>
          )}
          <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
            {name}
          </Text>
          {!!target && <Text style={[type.footnote, { color: colors.secondary }]}>{target}</Text>}
          {!!movement.notes.trim() && (
            <Text style={[type.footnote, { color: colors.muted }]} numberOfLines={3}>
              {movement.notes.trim()}
            </Text>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            movement.isComplete ? `Mark ${name} as not finished` : `Finish ${name}`
          }
          accessibilityState={{ selected: movement.isComplete }}
          hitSlop={6}
          onPress={() => {
            void Haptics.selectionAsync();
            actions.completeExercise(movement.key, !movement.isComplete);
          }}
          style={[
            styles.roundButton,
            {
              backgroundColor: movement.isComplete ? colors.good : colors.surface2,
            },
          ]}
        >
          <Icon
            name="check"
            size={16}
            color={movement.isComplete ? colors.onAccent : colors.muted}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${name}`}
          hitSlop={6}
          onPress={() => actions.openActions(movement.key)}
          style={[styles.roundButton, { backgroundColor: colors.surface2 }]}
        >
          <Icon name="more" size={18} color={colors.secondary} />
        </Pressable>
      </View>

      <View style={styles.columns}>
        <Text style={[type.caption, styles.setColumn, { color: colors.muted }]}>Set</Text>
        <Text style={[type.caption, styles.previousColumn, { color: colors.muted }]}>Previous</Text>
        <Text style={[type.caption, styles.valueColumn, { color: colors.muted }]}>
          {cardio ? 'Min' : weightUnit}
        </Text>
        <Text style={[type.caption, styles.valueColumn, { color: colors.muted }]}>
          {cardio ? 'Km' : 'Reps'}
        </Text>
        <View style={styles.checkColumn} />
      </View>

      {movement.sets.map((item, index) => (
        <SetRow
          key={item.key}
          movement={movement}
          item={item}
          index={index}
          label={labels[index]}
          previous={matchingLastSessionSet(movement.sets, index, lastSession)}
          weightUnit={weightUnit}
          skipHighRepWarning={skipHighRepWarning}
          actions={actions}
        />
      ))}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add set to ${name}`}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          actions.addSet(movement.key);
        }}
        style={({ pressed }) => [
          styles.addSet,
          { backgroundColor: colors.surface2, borderRadius: radius.md },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Icon name="plus" size={14} color={colors.accentText} />
        <Text style={[type.callout, { color: colors.accentText, fontWeight: '600' }]}>Add set</Text>
      </Pressable>
    </View>
  );
});

function previousLabel(previous: TrackedSet | undefined, cardio: boolean, unit: WeightUnit) {
  if (!previous) return '–';
  if (cardio) {
    const parts = [
      previous.duration_seconds != null ? formatSeconds(previous.duration_seconds) : null,
      previous.distance_km != null ? `${Number(previous.distance_km.toFixed(2))} km` : null,
    ].filter(Boolean);
    return parts.join(' · ') || '–';
  }
  if (!previous.weight_kg && previous.reps !== null) return setLabel(previous, unit);
  return `${formatWeightNumber(previous.weight_kg ?? 0, unit)} × ${previous.reps ?? '–'}`;
}

const minutesFormat = (seconds: number | null) =>
  seconds === null ? '' : String(Number((seconds / 60).toFixed(2)));
const minutesParse = (text: string) => {
  const minutes = parseDecimal(text);
  return minutes === null ? null : Math.round(minutes * 60);
};

function SetRow({
  movement,
  item,
  index,
  label,
  previous,
  weightUnit,
  skipHighRepWarning,
  actions,
}: {
  movement: WorkoutDraftMovement;
  item: WorkoutDraftSet;
  index: number;
  label: string;
  previous: TrackedSet | undefined;
  weightUnit: WeightUnit;
  skipHighRepWarning: boolean;
  actions: MovementActions;
}) {
  const { colors, type, radius } = useTheme();
  const swipeable = useRef<{ close: () => void } | null>(null);
  const firstField = useRef<ComponentRef<typeof TextInput>>(null);
  const secondField = useRef<ComponentRef<typeof TextInput>>(null);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const cardio = movement.exercise.kind === 'cardio';
  const number = index + 1;
  const update = (values: Partial<WorkoutDraftSet>) =>
    actions.updateSet(movement.key, item.key, values);
  const kindLabel = SET_KINDS.find((option) => option.kind === setKindOf(item))?.label;
  const suggested = item.fromPrevious === true && !item.completed;
  const weightFormat = useMemo(
    () => (kg: number | null) => weightInputValue(kg, weightUnit),
    [weightUnit],
  );
  const weightParse = (text: string) => weightInputKg(text, weightUnit, item.weight_kg);

  function complete() {
    if (item.completed) {
      update({ completed: false });
      return;
    }
    if (!hasRecordedPerformance(movement.exercise.kind, item)) {
      // Nothing to log yet: go to the field it needs instead of ticking it.
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      (cardio ? firstField : secondField).current?.focus();
      return;
    }
    const others = [...movement.sets.slice(0, index).reverse(), ...movement.sets.slice(index + 1)];
    const reference =
      others.find(
        (candidate) =>
          candidate.weight_kg !== null &&
          candidate.set_type === item.set_type &&
          candidate.warmup === item.warmup,
      )?.weight_kg ??
      others.find((candidate) => candidate.weight_kg !== null)?.weight_kg ??
      null;
    const warning = cardio
      ? null
      : unusualSetEntryWarning(
          {
            reps: item.reps,
            weightKg: item.weight_kg,
            referenceWeightKg: reference,
            skipHighRepWarning,
          },
          weightUnit,
        );
    const log = () => update({ completed: true, rest_seconds: item.rest_seconds });
    if (!warning) {
      log();
      return;
    }
    Alert.alert(warning.title, warning.message, [
      { text: 'Go back', style: 'cancel' },
      ...(warning.highReps
        ? [
            {
              text: "Log and don't ask again",
              onPress: () => {
                actions.skipHighRepWarning();
                log();
              },
            },
          ]
        : []),
      { text: 'Log set', onPress: log },
    ]);
  }

  // The set pill's menu, built each render so it always reflects the set as it is now.
  const setMenu: MenuItem[] = [
    ...(cardio
      ? []
      : SET_KINDS.map((option) => ({
          label: option.label,
          checked: option.kind === setKindOf(item),
          onPress: () => actions.setKind(movement.key, item.key, option.kind),
        }))),
    ...(cardio
      ? []
      : [
          {
            label: item.rest_seconds ? `Rest ${formatSeconds(item.rest_seconds)}` : 'Rest time',
            items: restMenuItems({
              current: item.rest_seconds,
              onPick: (seconds) => update({ rest_seconds: seconds }),
              onNone: () => update({ rest_seconds: null }),
            }),
          },
        ]),
    ...(index > 0
      ? [{ label: 'Move up', onPress: () => actions.moveSet(movement.key, index, index - 1) }]
      : []),
    ...(index < movement.sets.length - 1
      ? [{ label: 'Move down', onPress: () => actions.moveSet(movement.key, index, index + 1) }]
      : []),
    {
      label: 'Delete set',
      destructive: true,
      onPress: () => actions.deleteSet(movement.key, item.key),
    },
  ];

  // A logged set is tinted green; rows stay opaque so the swipe's Delete never shows through.
  const rowColor = item.completed ? `${colors.good}1F` : 'transparent';
  return (
    <ReanimatedSwipeable
      ref={(methods) => {
        swipeable.current = methods;
      }}
      friction={2}
      rightThreshold={48}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete set ${number}`}
          onPress={() => {
            swipeable.current?.close();
            actions.deleteSet(movement.key, item.key);
          }}
          style={[
            styles.deleteAction,
            { backgroundColor: colors.dangerFill, borderRadius: radius.md },
          ]}
        >
          <Icon name="trash" size={18} color={colors.onAccent} />
        </Pressable>
      )}
    >
      <View style={{ backgroundColor: colors.surface }}>
        <View style={[styles.row, { backgroundColor: rowColor, borderRadius: radius.md }]}>
          <MenuButton
            accessibilityLabel={`Set ${number} type: ${kindLabel ?? 'Working set'}`}
            title={`Set ${number}${kindLabel ? ` · ${kindLabel}` : ''}`}
            items={setMenu}
            trigger={{ text: label, color: /^\d+$/.test(label) ? colors.text : colors.accentText }}
            width={34}
            height={36}
            fill={rowColor}
            cornerRadius={radius.sm}
            style={[styles.setColumn, styles.setBadge, { borderRadius: radius.sm }]}
          >
            <Text
              style={[
                type.callout,
                type.number,
                {
                  fontWeight: '700',
                  color: /^\d+$/.test(label) ? colors.text : colors.accentText,
                },
              ]}
            >
              {label}
            </Text>
          </MenuButton>
          <Text
            numberOfLines={1}
            style={[type.footnote, type.number, styles.previousColumn, { color: colors.muted }]}
          >
            {previousLabel(previous, cardio, weightUnit)}
          </Text>
          {cardio ? (
            <>
              <View style={styles.valueColumn}>
                <NumberField
                  ref={firstField}
                  label={`Duration minutes for set ${number}`}
                  value={item.duration_seconds}
                  format={minutesFormat}
                  parse={minutesParse}
                  onChange={(duration_seconds) => update({ duration_seconds })}
                  suggested={suggested}
                  done={item.completed}
                />
              </View>
              <View style={styles.valueColumn}>
                <NumberField
                  ref={secondField}
                  label={`Distance kilometres for set ${number}`}
                  value={item.distance_km}
                  format={formatPlain}
                  parse={parseDecimal}
                  onChange={(distance_km) => update({ distance_km })}
                  suggested={suggested}
                  done={item.completed}
                />
              </View>
            </>
          ) : (
            <>
              <View style={styles.valueColumn}>
                <NumberField
                  ref={firstField}
                  label={`Weight ${weightUnit === 'lb' ? 'pounds' : 'kilograms'} for set ${number}`}
                  value={item.weight_kg}
                  format={weightFormat}
                  parse={weightParse}
                  onChange={(weight_kg) => update({ weight_kg })}
                  suggested={suggested}
                  done={item.completed}
                  onSubmitEditing={() => secondField.current?.focus()}
                />
              </View>
              <View style={styles.valueColumn}>
                <NumberField
                  ref={secondField}
                  label={`Repetitions for set ${number}`}
                  keyboardType="number-pad"
                  value={item.reps}
                  format={formatPlain}
                  parse={parseWhole}
                  onChange={(reps) => update({ reps })}
                  suggested={suggested}
                  done={item.completed}
                />
              </View>
            </>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              item.completed ? `Mark set ${number} incomplete` : `Complete set ${number}`
            }
            accessibilityState={{ checked: item.completed }}
            hitSlop={4}
            onPress={complete}
            style={[
              styles.checkColumn,
              styles.check,
              {
                borderRadius: radius.sm,
                backgroundColor: item.completed ? colors.good : colors.surface2,
              },
            ]}
          >
            <Icon name="check" size={18} color={item.completed ? colors.onAccent : colors.muted} />
          </Pressable>
        </View>
        {cardio && (
          <CardioExtras
            item={item}
            number={number}
            open={extrasOpen}
            treadmill={/treadmill/i.test(movement.exercise.equipment ?? movement.exercise.name)}
            onToggle={() => setExtrasOpen((value) => !value)}
            update={update}
          />
        )}
      </View>
    </ReanimatedSwipeable>
  );
}

/** Calories, heart rate, speed and incline for a cardio set, folded away until wanted. */
function CardioExtras({
  item,
  number,
  open,
  treadmill,
  onToggle,
  update,
}: {
  item: WorkoutDraftSet;
  number: number;
  open: boolean;
  treadmill: boolean;
  onToggle: () => void;
  update: (values: Partial<WorkoutDraftSet>) => void;
}) {
  const { colors, type } = useTheme();
  const filled = [
    item.calories_kcal,
    item.average_heart_rate_bpm,
    item.speed_kph,
    item.incline_percent,
  ].some((value) => value != null);
  const fields: {
    label: string;
    short: string;
    value: number | null;
    whole: boolean;
    set: (value: number | null) => Partial<WorkoutDraftSet>;
  }[] = [
    {
      label: 'Active calories',
      short: 'kcal',
      value: item.calories_kcal ?? null,
      whole: true,
      set: (calories_kcal) => ({ calories_kcal }),
    },
    {
      label: 'Average heart rate',
      short: 'bpm',
      value: item.average_heart_rate_bpm ?? null,
      whole: true,
      set: (average_heart_rate_bpm) => ({ average_heart_rate_bpm }),
    },
    {
      label: 'Average speed kilometres per hour',
      short: 'km/h',
      value: item.speed_kph ?? null,
      whole: false,
      set: (speed_kph) => ({ speed_kph }),
    },
    ...(treadmill || item.incline_percent != null
      ? [
          {
            label: 'Treadmill incline percentage',
            short: 'incline %',
            value: item.incline_percent ?? null,
            whole: false,
            set: (incline_percent: number | null) => ({ incline_percent }),
          },
        ]
      : []),
  ];
  return (
    <View style={{ paddingLeft: 40 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? `Hide details for set ${number}` : `Details for set ${number}`}
        onPress={onToggle}
        style={styles.extrasToggle}
      >
        <Text style={[type.footnote, { color: colors.accentText, fontWeight: '600' }]}>
          {open ? 'Hide details' : filled ? 'Details ·' : 'Details'}
        </Text>
        {!open && filled && (
          <Text style={[type.footnote, { color: colors.muted }]} numberOfLines={1}>
            {fields
              .filter((field) => field.value != null)
              .map((field) => `${field.value} ${field.short}`)
              .join(' · ')}
          </Text>
        )}
      </Pressable>
      {open && (
        <View style={styles.extras}>
          {fields.map((field) => (
            <View key={field.short} style={styles.extraField}>
              <Text style={[type.caption, { color: colors.muted }]}>{field.short}</Text>
              <NumberField
                label={`${field.label} for set ${number}`}
                keyboardType={field.whole ? 'number-pad' : 'decimal-pad'}
                value={field.value}
                format={formatPlain}
                parse={field.whole ? parseWhole : parseDecimal}
                onChange={(value) => update(field.set(value))}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, gap: 6 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  roundButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  setColumn: { width: 34, textAlign: 'center' },
  setBadge: { height: 36, alignItems: 'center', justifyContent: 'center' },
  previousColumn: { flex: 1.3, minWidth: 64 },
  valueColumn: { flex: 1, textAlign: 'center' },
  checkColumn: { width: 40 },
  check: { height: 40, alignItems: 'center', justifyContent: 'center' },
  deleteAction: {
    width: 72,
    marginLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSet: {
    marginTop: 6,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  extrasToggle: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  extras: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 6 },
  extraField: { width: '46%', gap: 2 },
});
