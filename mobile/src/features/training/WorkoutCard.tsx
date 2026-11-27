import * as Linking from 'expo-linking';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { recordTypeLabel, setResult } from '../../../../frontend/src/historySetFormat';
import {
  isAllTimeRecord,
  recordBadgeLabel,
  recordScopeLabel,
} from '../../../../frontend/src/recordScope';
import { relativeStrength } from '../../../../frontend/src/relativeStrength';
import { SET_KINDS, setKindOf, setNumberLabels } from '../../../../frontend/src/setFieldValues';
import {
  formatListVolume,
  setLabel,
  shortDate,
  strengthSets,
  topWorkingSet,
  workoutDisplayName,
  workoutVolumeKg,
} from '../../../../frontend/src/trainingSummary';
import type {
  PersonalRecord,
  TrackedMovement,
  TrackedSet,
  TrackedWorkout,
} from '../../../../frontend/src/types';
import { formatMinutesDuration } from '../../../../frontend/src/utils';
import { formatWeight, type WeightUnit } from '../../../../frontend/src/weightUnits';
import { useWeightUnit } from '../../data/queries';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { trainingIcons } from './icons';
import { MachinePhotoStrip, type MachineFilter } from './MachinePhotos';
import { Badge } from './parts';
import { haptics } from '../../ui/haptics';

/** "Sat 21 Nov · 1h 2min · 8 sets", with the year when it isn't this year's. */
export function workoutMeta(workout: TrackedWorkout, showYear: boolean) {
  const sets = strengthSets(workout).length;
  return [
    showYear
      ? `${shortDate(workout.workout_date)} ${workout.workout_date.slice(0, 4)}`
      : shortDate(workout.workout_date),
    workout.duration_minutes ? formatMinutesDuration(workout.duration_minutes) : null,
    sets ? `${sets} ${sets === 1 ? 'set' : 'sets'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Volume for a lifting session, distance for cardio, otherwise its length. */
export function workoutMetric(workout: TrackedWorkout, unit: WeightUnit) {
  const volume = workoutVolumeKg(workout);
  if (volume > 0) return formatListVolume(volume, unit);
  const distance = workout.movements
    .flatMap((movement) => movement.sets)
    .filter((item) => item.completed)
    .reduce((total, item) => total + (item.distance_km ?? 0), 0);
  if (distance > 0) return `${Number(distance.toFixed(1))} km`;
  return formatMinutesDuration(workout.duration_minutes);
}

/** A session in the list: a summary row that opens to its exercises and sets. */
export function WorkoutCard({
  workout,
  color,
  records,
  open,
  onToggle,
  showYear,
  children,
}: {
  workout: TrackedWorkout;
  color: string;
  records: number;
  open: boolean;
  onToggle: () => void;
  showYear: boolean;
  /** The details shown while open. */
  children?: ReactNode;
}) {
  const { colors, type } = useTheme();
  const name = workoutDisplayName(workout);
  const unit = useWeightUnit();
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${workoutMeta(workout, showYear)}`}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          haptics.selection();
          onToggle();
        }}
        style={({ pressed }) => [styles.summary, pressed && { opacity: 0.7 }]}
      >
        <View style={[styles.bar, { backgroundColor: color }]} />
        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text style={[type.headline, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
              {name}
            </Text>
            {workout.is_sample && <Badge label="Sample" />}
          </View>
          <Text style={[type.footnote, { color: colors.secondary }]} numberOfLines={1}>
            {workoutMeta(workout, showYear)}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={[type.callout, type.number, { color: colors.text, fontWeight: '700' }]}>
            {workoutMetric(workout, unit)}
          </Text>
          {records > 0 && (
            <Text style={[type.caption, { color: colors.gold, fontWeight: '700' }]}>
              {records} {records === 1 ? 'PR' : 'PRs'}
            </Text>
          )}
        </View>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} color={colors.muted} />
      </Pressable>
      {open && children}
    </View>
  );
}

/** A saved workout's exercises and sets, laid out as the web's session card shows them. */
export function WorkoutDetails({
  workout,
  personalRecords,
  bodyweight,
  unit,
  highlightExerciseId,
  onOpenExercise,
  onFilterMachine,
  machineFilterId,
}: {
  workout: TrackedWorkout;
  personalRecords: PersonalRecord[];
  /** The bodyweight on the day, for sets that didn't record their own. */
  bodyweight: number | null;
  unit: WeightUnit;
  highlightExerciseId?: string | null;
  onOpenExercise?: (exerciseId: string) => void;
  /** Lists only workouts that pinned a machine. Omitted for shared, read-only history. */
  onFilterMachine?: (filter: MachineFilter) => void;
  /** The machine the list is already filtered by. */
  machineFilterId?: string | null;
}) {
  const { colors, type } = useTheme();
  // Exercises planned but never done are listed by name only, not as empty tables.
  const skipped = workout.movements.filter(
    (movement) => !movement.notes && !movement.sets.some((item) => item.completed),
  );
  const done = [...workout.movements]
    .sort((a, b) => a.order_index - b.order_index)
    .filter((movement) => !skipped.includes(movement));
  const completed = done.flatMap((movement) => movement.sets.filter((item) => item.completed));
  // One exercise with a bodyweight ratio or a record gives every exercise that column.
  const ratioColumn = completed.some(
    (item) => relativeStrength(item.weight_kg, item.bodyweight_kg ?? bodyweight) !== null,
  );
  const recordColumn = completed.some((item) =>
    personalRecords.some((record) => record.set_id === item.id),
  );
  return (
    <View style={styles.details}>
      {done.map((movement) => (
        <MovementBlock
          key={movement.id}
          movement={movement}
          personalRecords={personalRecords}
          bodyweight={bodyweight}
          unit={unit}
          ratioColumn={ratioColumn}
          recordColumn={recordColumn}
          highlighted={movement.exercise.id === highlightExerciseId}
          onOpenExercise={onOpenExercise}
          onFilterMachine={onFilterMachine}
          machineFilterId={machineFilterId}
        />
      ))}
      {skipped.length > 0 && (
        <Text style={[type.footnote, { color: colors.muted }]}>
          Skipped: {skipped.map((movement) => movement.exercise.name).join(', ')}
        </Text>
      )}
      {!!workout.notes && (
        <Text style={[type.callout, { color: colors.secondary }]}>{workout.notes}</Text>
      )}
    </View>
  );
}

function MovementBlock({
  movement,
  personalRecords,
  bodyweight,
  unit,
  ratioColumn,
  recordColumn,
  highlighted,
  onOpenExercise,
  onFilterMachine,
  machineFilterId,
}: {
  movement: TrackedMovement;
  personalRecords: PersonalRecord[];
  bodyweight: number | null;
  unit: WeightUnit;
  ratioColumn: boolean;
  recordColumn: boolean;
  highlighted: boolean;
  onOpenExercise?: (exerciseId: string) => void;
  onFilterMachine?: (filter: MachineFilter) => void;
  machineFilterId?: string | null;
}) {
  const { colors, radius, type } = useTheme();
  const best = topWorkingSet(movement.sets);
  const openable = !!onOpenExercise && movement.exercise.kind === 'strength';
  const settings = (movement.machine_settings ?? []).filter((item) => item.value);
  return (
    <View
      style={[
        styles.movement,
        highlighted && {
          borderColor: colors.accent,
          borderWidth: 1.5,
          borderRadius: radius.md,
          padding: 10,
          margin: -10,
        },
      ]}
    >
      <View style={styles.movementHeader}>
        <Pressable
          accessibilityRole={openable ? 'link' : 'text'}
          accessibilityLabel={movement.exercise.name}
          disabled={!openable}
          onPress={() => onOpenExercise?.(movement.exercise.id)}
          style={({ pressed }) => [styles.exerciseName, pressed && { opacity: 0.6 }]}
        >
          <Text
            style={[
              type.callout,
              {
                color: openable ? colors.accentText : colors.text,
                fontWeight: '600',
              },
            ]}
            numberOfLines={2}
          >
            {movement.exercise.name}
          </Text>
          {openable && <Icon name="chevronRight" size={12} color={colors.accentText} />}
        </Pressable>
        {best && (
          <Text style={[type.footnote, type.number, { color: colors.secondary }]}>
            Top {setLabel(best, unit)}
          </Text>
        )}
      </View>
      <MachinePhotoStrip
        photos={movement.machine_photos ?? []}
        exerciseName={movement.exercise.name}
        onFilterMachine={onFilterMachine}
        machineFilterId={machineFilterId}
      />
      {settings.length > 0 && (
        <Text style={[type.footnote, { color: colors.muted }]}>
          {settings.map((item) => `${item.name} ${item.value}`).join(' · ')}
        </Text>
      )}
      <SetTable
        sets={movement.sets.filter((item) => item.completed)}
        personalRecords={personalRecords}
        bodyweight={bodyweight}
        unit={unit}
        ratioColumn={ratioColumn}
        recordColumn={recordColumn}
        machineCaptions={
          movement.machine_photos.length > 1
            ? new Map(movement.machine_photos.map((photo) => [photo.id, photo.caption]))
            : null
        }
      />
      {movement.sets
        .filter((item) => item.notes && !item.completed)
        .map((item) => (
          <Text key={item.id} style={[type.footnote, { color: colors.secondary }]}>
            Set {item.order_index + 1}: {item.notes}
          </Text>
        ))}
      {!!movement.notes && <MovementNotes notes={movement.notes} />}
    </View>
  );
}

/** A cardio set has no weight or reps to put in their columns, so its result spans both. */
function spansResult(item: TrackedSet) {
  return (
    item.weight_kg === null &&
    (Boolean(item.duration_seconds) ||
      item.distance_km !== null ||
      item.incline_percent !== null ||
      item.speed_kph !== null)
  );
}

/** One row per set under Set, Weight, Reps and RPE, as the web's history table. */
export function SetTable({
  sets,
  personalRecords,
  bodyweight,
  unit,
  ratioColumn,
  recordColumn,
  machineCaptions,
}: {
  sets: TrackedSet[];
  personalRecords: PersonalRecord[];
  bodyweight: number | null;
  unit: WeightUnit;
  ratioColumn: boolean;
  recordColumn: boolean;
  machineCaptions: Map<string, string> | null;
}) {
  const { colors, type } = useTheme();
  if (!sets.length) return null;
  const numbers = setNumberLabels(sets);
  const ratios = sets.map((item) =>
    relativeStrength(item.weight_kg, item.bodyweight_kg ?? bodyweight),
  );
  const records = sets.map((item) => personalRecords.filter((record) => record.set_id === item.id));
  const resultOnly = sets.every(spansResult);
  // A cardio exercise has no lifts to line up with, so it never borrows a lifting column.
  const showRatio = ratios.some((ratio) => ratio !== null) || (ratioColumn && !resultOnly);
  const showRecords = records.some((list) => list.length > 0) || (recordColumn && !resultOnly);
  const head = [type.caption, { color: colors.muted, fontWeight: '600' as const }];
  const cell = [type.footnote, type.number, { color: colors.text }];
  return (
    <View>
      <View style={styles.row}>
        <Text style={[head, styles.setCol]}>Set</Text>
        {resultOnly ? (
          <Text style={[head, styles.resultCol]}>Result</Text>
        ) : (
          <>
            <Text style={[head, styles.weightCol]}>Weight</Text>
            <Text style={[head, styles.repsCol]}>Reps</Text>
          </>
        )}
        <Text style={[head, styles.rpeCol]}>RPE</Text>
        {showRatio && <Text style={[head, styles.ratioCol]}>× BW</Text>}
        {showRecords && <View style={styles.recordCol} />}
      </View>
      {sets.map((item, index) => {
        const kind = setKindOf(item);
        const kindLabel = SET_KINDS.find((option) => option.kind === kind)?.label ?? '';
        const machine = machineCaptions
          ? (machineCaptions.get(item.machine_photo_id ?? '') ?? 'Machine not assigned')
          : null;
        const setRecords = records[index];
        return (
          <View key={item.id} style={styles.setRow}>
            <View style={styles.row}>
              <View style={styles.setCol}>
                <View
                  accessibilityLabel={kind === 'normal' ? `Set ${numbers[index]}` : kindLabel}
                  style={[
                    styles.setNumber,
                    {
                      backgroundColor:
                        kind === 'normal'
                          ? colors.surface2
                          : kind === 'warmup'
                            ? colors.goldSoft
                            : colors.accentSoft,
                    },
                  ]}
                >
                  <Text style={[type.caption, { color: colors.text, fontWeight: '700' }]}>
                    {numbers[index]}
                  </Text>
                </View>
              </View>
              {spansResult(item) ? (
                <Text style={[cell, styles.resultCol]}>{setResult(item, unit)}</Text>
              ) : (
                <>
                  <Text style={[cell, styles.weightCol]}>
                    {item.weight_kg === null
                      ? '–'
                      : item.weight_kg === 0 && item.reps !== null
                        ? 'BW'
                        : formatWeight(item.weight_kg, unit)}
                  </Text>
                  <Text style={[cell, styles.repsCol]}>{item.reps ?? '–'}</Text>
                </>
              )}
              <Text style={[cell, styles.rpeCol]}>{item.rpe ?? '–'}</Text>
              {showRatio && (
                <Text style={[cell, styles.ratioCol]}>
                  {ratios[index] !== null ? `${ratios[index]!.toFixed(2)}×` : ''}
                </Text>
              )}
              {showRecords && (
                <View style={styles.recordCol}>
                  {setRecords.length > 0 && (
                    <View
                      accessibilityLabel={setRecords
                        .map((record) => `${recordScopeLabel(record)} ${recordTypeLabel(record)}`)
                        .join(', ')}
                    >
                      <Badge
                        tone="gold"
                        halo={setRecords.some(isAllTimeRecord)}
                        label={
                          setRecords.some(isAllTimeRecord) ? 'PR' : recordBadgeLabel(setRecords)
                        }
                      />
                    </View>
                  )}
                </View>
              )}
            </View>
            {(machine || item.notes) && (
              <Text style={[type.caption, { color: colors.secondary, marginLeft: 36 }]}>
                {[machine, item.notes].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** A movement's notes, with saved video timestamps as links. */
function MovementNotes({ notes }: { notes: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      {notes.split('\n').map((line, index) => {
        const video = line.match(/^Video - (.+?) @ ([0-9:]+): (https:\/\/\S+)$/);
        return video ? (
          <Pressable
            key={`${line}-${index}`}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(video[3])}
            style={({ pressed }) => [styles.video, pressed && { opacity: 0.6 }]}
          >
            <Icon name={trainingIcons.video} size={16} color={colors.accentText} />
            <Text style={[type.footnote, { color: colors.accentText, flexShrink: 1 }]}>
              {video[1]} · Watch from {video[2]}
            </Text>
          </Pressable>
        ) : (
          <Text key={`${line}-${index}`} style={[type.footnote, { color: colors.secondary }]}>
            {line}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    minHeight: 64,
  },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  copy: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metric: { alignItems: 'flex-end', gap: 2 },
  details: { gap: 18, paddingBottom: 16, paddingTop: 4 },
  movement: { gap: 8 },
  movementHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exerciseName: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 26 },
  setRow: { gap: 2 },
  setCol: { width: 36 },
  setNumber: {
    width: 24,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightCol: { flex: 1.4 },
  repsCol: { flex: 0.8 },
  resultCol: { flex: 2.2 },
  rpeCol: { flex: 0.7 },
  ratioCol: { flex: 0.9 },
  recordCol: { width: 56, alignItems: 'flex-end' },
  video: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
});
