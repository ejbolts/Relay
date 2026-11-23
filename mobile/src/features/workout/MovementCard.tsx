import { Fragment, memo, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View, type TextInput } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import {
  historyOnMachine,
  lastWorkingSessionSets,
  machineAliases,
  movementHistory,
  recentExerciseHistory,
} from '../../../../frontend/src/exerciseHistory';
import { matchingLastSessionSet } from '../../../../frontend/src/lastSessionSet';
import { timeSince } from '../../../../frontend/src/machineHistory';
import { bodyweightContext } from '../../../../frontend/src/relativeStrength';
import { progressionHint, progressionTarget } from '../../../../frontend/src/repProgression';
import { unusualSetEntryWarning } from '../../../../frontend/src/setEntryConfirmation';
import {
  RPE_OPTIONS,
  SET_KINDS,
  setKindOf,
  setNumberLabels,
  type SetKind,
} from '../../../../frontend/src/setFieldValues';
import type {
  ExerciseHistoryBaseline,
  TrackedSet,
  TrackedWorkout,
} from '../../../../frontend/src/types';
import { formatSeconds, localDate } from '../../../../frontend/src/utils';
import {
  weightInputKg,
  weightInputValue,
  type WeightUnit,
} from '../../../../frontend/src/weightUnits';
import type {
  WorkoutDraftMovement,
  WorkoutDraftSet,
} from '../../../../frontend/src/workoutMovements';
import {
  previousSetRests,
  restRowShown,
  restToAdd,
} from '../../../../frontend/src/workoutRestHistory';
import { hasRecordedPerformance } from '../../../../frontend/src/workoutSets';
import { supersetGroupName } from '../../../../frontend/src/workoutSupersets';
import { useAuthorisedImage } from '../../data/authorisedImage';
import { useTrainingPreferences } from '../../data/queries';
import { cardSurface } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { Icon, type IconPair } from '../../ui/Icon';
import { MenuButton, type MenuItem } from '../../ui/MenuButton';
import { promptText } from '../../ui/prompts';
import { useTheme } from '../../ui/theme';
import { showToast } from '../../ui/Toast';
import { ExerciseIcon } from '../social/ExerciseIcon';
import { restTimesPreference } from '../settings/devicePreferences';
import { CardioSetImport } from './CardioSetImport';
import { lastUsedMachines, useMachinePhotos } from './loggerQueries';
import { formatPlain, NumberField, parseDecimal, parseWhole } from './NumberField';
import { restMenuItems } from './restChoices';
import { SetInsertRow, SetRestRow } from './SetRestRow';

export interface MovementActions {
  updateSet: (movementKey: string, setKey: string, update: Partial<WorkoutDraftSet>) => void;
  addSet: (movementKey: string) => void;
  /** Adds a set at `position`, the "+" between sets. Without it the card offers no "+". */
  insertSet?: (movementKey: string, position: number) => void;
  deleteSet: (movementKey: string, setKey: string) => void;
  moveSet: (movementKey: string, from: number, to: number) => void;
  setKind: (movementKey: string, setKey: string, kind: SetKind) => void;
  completeExercise: (movementKey: string, isComplete: boolean) => void;
  openActions: (movementKey: string) => void;
  skipHighRepWarning: () => void;
  /** Opens the exercise's machines. */
  openMachines: (movementKey: string) => void;
  /** Pins the machines the exercise's last session used, for a movement that has none yet. */
  restoreMachines: (movementKey: string, machinePhotoIds: string[]) => void;
}

const NO_BADGES: ReadonlyMap<string, string[]> = new Map();
const MACHINE_EQUIPMENT = /machine|cable|smith/i;
/** The web's vertical ⋮ beside each exercise. */
const MORE_VERTICAL: IconPair = { sf: 'ellipsis', md: 'more-vert' };

/** One exercise of the live workout: its target, sets and actions. */
export const MovementCard = memo(function MovementCard({
  number: order,
  movement,
  lastDone = null,
  bodyweight = null,
  supersetNames,
  history,
  olderLatest = null,
  excludedWorkoutId,
  prBadges = NO_BADGES,
  workoutDate,
  weightUnit,
  skipHighRepWarning,
  actions,
}: {
  /** Its place in the workout, on the picture's badge. */
  number: number;
  movement: WorkoutDraftMovement;
  /** The day the exercise was last done, for "Last done yesterday". */
  lastDone?: string | null;
  /** The bodyweight the workout is logged at, for the heaviest set's "1.03× BW". */
  bodyweight?: number | null;
  /** The names in this exercise's superset, in order, when it is in one. */
  supersetNames: string[] | null;
  history: TrackedWorkout[];
  /** The exercise's latest session before the loaded history, if any. */
  olderLatest?: ExerciseHistoryBaseline['latest'];
  /** A saved workout being resumed, which is not its own last session. */
  excludedWorkoutId?: string;
  /** Record labels by set key, for sets that beat a record. */
  prBadges?: ReadonlyMap<string, string[]>;
  workoutDate: string;
  weightUnit: WeightUnit;
  skipHighRepWarning: boolean;
  actions: MovementActions;
}) {
  const { colors, type, radius, space } = useTheme();
  const cardio = movement.exercise.kind === 'cardio';
  const exerciseId = movement.exercise.id;
  // Machines show for machine, cable and Smith exercises, and whenever one is pinned.
  const machineRow =
    !cardio &&
    (movement.machinePhotoIds.length > 0 ||
      MACHINE_EQUIPMENT.test(movement.exercise.equipment ?? ''));
  const machines = useMachinePhotos(exerciseId, machineRow).data;
  const aliases = useMemo(() => machineAliases(machines ?? []), [machines]);
  const machineNames = useMemo(
    () => new Map((machines ?? []).map((photo) => [photo.id, photo.caption || 'Machine'])),
    [machines],
  );
  const pinnedMachine = movement.machinePhotoIds.at(-1);
  // A movement new to this workout starts on the machines its last session used, as on the web.
  const { restoreMachines } = actions;
  useEffect(() => {
    if (cardio || movement.machinePhotosInitialized) return;
    let active = true;
    lastUsedMachines(exerciseId)
      .then((photos) => {
        if (active)
          restoreMachines(
            movement.key,
            photos.map((photo) => photo.id),
          );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [cardio, exerciseId, movement.key, movement.machinePhotosInitialized, restoreMachines]);
  // Hints come from the last session with working sets, as on the web, reaching back into
  // older history when the loaded workouts don't include the exercise. With a machine pinned,
  // its own sessions supply them, and the rests too.
  const exerciseHistory = useMemo(
    () =>
      recentExerciseHistory(
        history.filter((workout) => workout.workout_date <= workoutDate),
        movement.exercise.id,
        excludedWorkoutId,
        Number.POSITIVE_INFINITY,
        olderLatest,
      ),
    [history, movement.exercise.id, workoutDate, excludedWorkoutId, olderLatest],
  );
  const pinnedHistory = useMemo(
    () => movementHistory(exerciseHistory, pinnedMachine, aliases),
    [exerciseHistory, pinnedMachine, aliases],
  );
  const lastSession = useMemo(() => lastWorkingSessionSets(pinnedHistory), [pinnedHistory]);
  // Settings > Show rest times draws each set's rest between the sets, as on the web.
  const showRestTimes = restTimesPreference.use();
  const defaultRest = useTrainingPreferences().data?.default_rest_seconds ?? null;
  const { insertSet } = actions;
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
  // The bodyweight ratio is said once per exercise, on its heaviest logged set, as on the web.
  const ratioSetKey = cardio
    ? null
    : (movement.sets.reduce<WorkoutDraftSet | null>(
        (best, item) =>
          item.completed && (best === null || (item.weight_kg ?? 0) > (best.weight_kg ?? 0))
            ? item
            : best,
        null,
      )?.key ?? null);
  const pinnedPhoto = machines?.find((photo) => photo.id === pinnedMachine) ?? null;

  return (
    <View
      accessibilityLabel={name}
      style={[
        cardSurface(colors),
        styles.card,
        { padding: space.lg },
        movement.isComplete && { borderColor: `${colors.good}8C` },
      ]}
    >
      {supersetNames && (
        <View style={styles.badgeRow}>
          <Icon name={{ sf: 'link', md: 'link' }} size={12} color={colors.accentText} />
          <Text style={[type.caption, { color: colors.accentText, fontWeight: '700' }]}>
            {supersetGroupName(supersetNames.length)}
          </Text>
        </View>
      )}
      <View style={styles.header}>
        <View>
          <ExerciseIcon exercise={movement.exercise} size={44} />
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.order, { backgroundColor: colors.accent, borderColor: colors.surface }]}
          >
            <Text style={[styles.orderText, { color: colors.onAccent }]}>{order}</Text>
          </View>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={[styles.name, { color: colors.accentText }]}>
            {name}
          </Text>
          {!cardio && !!lastDone && (
            <Text style={[type.footnote, { color: colors.secondary }]}>
              Last done {timeSince(lastDone, localDate())}
            </Text>
          )}
          {!!movement.swappedFrom && (
            <Text style={[type.footnote, { color: colors.muted }]}>
              Swapped from {movement.swappedFrom}
            </Text>
          )}
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
          onPress={() => {
            haptics.selection();
            actions.completeExercise(movement.key, !movement.isComplete);
          }}
          style={({ pressed }) => [
            styles.squareButton,
            movement.isComplete
              ? { backgroundColor: colors.good, borderColor: colors.good }
              : { backgroundColor: colors.surface, borderColor: colors.lineStrong },
            pressed && styles.pressed,
          ]}
        >
          <Icon
            name="check"
            size={18}
            color={movement.isComplete ? colors.onAccent : colors.secondary}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${name}`}
          onPress={() => {
            haptics.press();
            actions.openActions(movement.key);
          }}
          style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}
        >
          <Icon name={MORE_VERTICAL} size={20} color={colors.accentText} />
        </Pressable>
      </View>

      {machineRow && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            pinnedMachine
              ? `Machine: ${machineNames.get(pinnedMachine) ?? 'pinned'}`
              : `Choose a machine for ${name}`
          }
          onPress={() => actions.openMachines(movement.key)}
          style={({ pressed }) => [
            styles.machine,
            { backgroundColor: colors.surface2, borderRadius: radius.lg },
            pressed && styles.pressed,
          ]}
        >
          <MachineThumb url={pinnedPhoto?.thumbnail_url ?? null} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={[type.callout, { color: colors.text, fontWeight: '600' }]}
              numberOfLines={1}
            >
              {pinnedMachine
                ? `${machineNames.get(pinnedMachine) ?? 'Machine'}${movement.machinePhotoIds.length > 1 ? ` +${movement.machinePhotoIds.length - 1}` : ''}`
                : 'Choose machine'}
            </Text>
            {!!movement.machineSettings?.length && (
              <Text style={[type.footnote, { color: colors.muted }]} numberOfLines={1}>
                {movement.machineSettings
                  .map((setting) => `${setting.name} ${setting.value}`)
                  .join(' · ')}
              </Text>
            )}
          </View>
          <Icon name="chevronDown" size={18} color={colors.secondary} />
        </Pressable>
      )}

      <View style={[styles.columns, { borderColor: colors.line }]}>
        <Text style={[styles.head, styles.setColumn, { color: colors.muted }]}>Set</Text>
        <Text style={[styles.head, styles.valueColumn, { color: colors.muted }]}>
          {cardio ? 'Min' : `Weight (${weightUnit})`}
        </Text>
        <Text style={[styles.head, styles.valueColumn, { color: colors.muted }]}>
          {cardio ? 'Km' : 'Reps'}
        </Text>
        <Text style={[styles.head, styles.rpeColumn, { color: colors.muted }]}>RPE</Text>
        <View style={styles.checkColumn} />
      </View>

      {insertSet && movement.sets.length > 0 && (
        <SetInsertRow beforeSet={1} onInsert={() => insertSet(movement.key, 0)} />
      )}
      {movement.sets.map((item, index) => {
        const number = index + 1;
        const restShown = restRowShown(item, cardio, showRestTimes);
        // Between two sets; after the last set, Add set does the same job.
        const onInsert =
          insertSet && index < movement.sets.length - 1
            ? () => insertSet(movement.key, index + 1)
            : undefined;
        const restHistory = item.machine_photo_id
          ? historyOnMachine(exerciseHistory, item.machine_photo_id, aliases)
          : pinnedHistory;
        const update = (values: Partial<WorkoutDraftSet>) =>
          actions.updateSet(movement.key, item.key, values);
        const removeRest = () => {
          const before = item.rest_seconds;
          update({ rest_seconds: null });
          showToast('Rest removed', {
            label: 'Undo',
            run: () => update({ rest_seconds: before }),
          });
        };
        return (
          <Fragment key={item.key}>
            <SetRow
              movement={movement}
              item={item}
              index={index}
              label={labels[index]}
              previous={matchingLastSessionSet(movement.sets, index, lastSession)}
              records={prBadges.get(item.key) ?? null}
              ratio={
                item.key === ratioSetKey && (item.bodyweight_kg ?? bodyweight) != null
                  ? bodyweightContext(item.weight_kg, item.bodyweight_kg ?? bodyweight, weightUnit)
                  : null
              }
              machines={movement.machinePhotoIds.length > 1 ? movement.machinePhotoIds : null}
              machineNames={machineNames}
              weightUnit={weightUnit}
              skipHighRepWarning={skipHighRepWarning}
              actions={actions}
            />
            {restShown ? (
              <SetRestRow
                setNumber={number}
                seconds={item.rest_seconds!}
                ghost={
                  !item.completed &&
                  !item.restConfirmed &&
                  previousSetRests(movement.sets, index, restHistory)[0]?.seconds ===
                    item.rest_seconds
                }
                onChange={(seconds) => update({ rest_seconds: seconds })}
                onRemove={removeRest}
                onInsert={onInsert}
              />
            ) : (
              index < movement.sets.length - 1 && (
                <SetInsertRow
                  beforeSet={number + 1}
                  onInsert={onInsert}
                  onAddRest={
                    !cardio && showRestTimes
                      ? (seconds) => update({ rest_seconds: seconds, restRevealed: true })
                      : undefined
                  }
                  suggestedRest={restToAdd(movement.sets, index, restHistory, defaultRest)}
                />
              )
            )}
          </Fragment>
        );
      })}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add set to ${name}`}
        onPress={() => {
          haptics.tap();
          actions.addSet(movement.key);
        }}
        style={({ pressed }) => [
          styles.addSet,
          { backgroundColor: colors.accentSoft, borderRadius: radius.md },
          pressed && styles.pressed,
        ]}
      >
        <Icon name="plus" size={16} color={colors.accentText} />
        <Text style={[type.button, { color: colors.accentText }]}>Add set</Text>
      </Pressable>
    </View>
  );
});

/** The pinned machine's photo at the start of the machine strip, as on the web. */
function MachineThumb({ url }: { url: string | null }) {
  const { colors, radius } = useTheme();
  const image = useAuthorisedImage(url);
  return (
    <View style={[styles.thumb, { backgroundColor: colors.surface3, borderRadius: radius.sm }]}>
      {image ? (
        <Image source={{ uri: image }} style={styles.thumbImage} />
      ) : (
        <Icon name={{ sf: 'wrench.adjustable', md: 'build' }} size={16} color={colors.secondary} />
      )}
    </View>
  );
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
  records,
  ratio,
  machines,
  machineNames,
  weightUnit,
  skipHighRepWarning,
  actions,
}: {
  movement: WorkoutDraftMovement;
  item: WorkoutDraftSet;
  index: number;
  label: string;
  previous: TrackedSet | undefined;
  /** The records this set beat, once it is logged. */
  records: string[] | null;
  /** "1.03× BW · at 82.5 kg BW", on the exercise's heaviest logged set. */
  ratio: string | null;
  /** With several machines pinned, the ones each set chooses between. */
  machines: string[] | null;
  machineNames: ReadonlyMap<string, string>;
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
      haptics.warning();
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

  // An unlogged set without an RPE offers last time's as a guide, as the web shows it faintly.
  const lastRpe = item.rpe === null && !item.completed && !cardio ? (previous?.rpe ?? null) : null;
  const editNote = () =>
    promptText({
      title: `Note for set ${number}`,
      value: item.notes ?? '',
      placeholder: 'Add a note',
      submitLabel: 'Save',
      multiline: true,
      onSubmit: (notes) => update({ notes: notes.trim() ? notes : null }),
    });

  const rpeItems: MenuItem[] = [
    { label: 'No RPE', checked: item.rpe === null, onPress: () => update({ rpe: null }) },
    ...RPE_OPTIONS.map((rpe) => ({
      label: String(rpe),
      checked: item.rpe === rpe,
      onPress: () => update({ rpe }),
    })),
  ];
  // Last time's RPE shows faintly in an unlogged set's RPE, as on the web.
  const rpeText = item.rpe !== null ? String(item.rpe) : lastRpe !== null ? String(lastRpe) : '–';
  const rpeInk = item.rpe !== null ? colors.text : colors.muted;
  // Last time's numbers stand in faintly for an empty field, as the web's ghost values.
  const ghost = !item.completed ? previous : undefined;

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
    {
      label:
        item.rpe !== null
          ? `RPE ${item.rpe}`
          : lastRpe !== null
            ? `RPE · ${lastRpe} last time`
            : 'RPE',
      items: rpeItems,
    },
    { label: item.notes ? 'Edit note' : 'Add note', onPress: editNote },
    ...(machines
      ? [
          {
            label: item.machine_photo_id
              ? `Machine: ${machineNames.get(item.machine_photo_id) ?? 'pinned'}`
              : 'Machine',
            items: machines.map((id) => ({
              label: machineNames.get(id) ?? 'Machine',
              checked: item.machine_photo_id === id,
              onPress: () => update({ machine_photo_id: id }),
            })),
          },
        ]
      : []),
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
          {cardio ? (
            <>
              <View style={styles.valueColumn}>
                <NumberField
                  ref={firstField}
                  label={`Duration minutes for set ${number}`}
                  placeholder={minutesFormat(ghost?.duration_seconds ?? null)}
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
                  placeholder={formatPlain(ghost?.distance_km ?? null)}
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
                  placeholder={weightFormat(ghost?.weight_kg ?? null)}
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
                  placeholder={formatPlain(ghost?.reps ?? null)}
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
          <MenuButton
            accessibilityLabel={
              item.rpe !== null ? `RPE ${item.rpe} for set ${number}` : `RPE for set ${number}`
            }
            title={`RPE · set ${number}`}
            items={rpeItems}
            trigger={{ text: rpeText, color: rpeInk }}
            width={44}
            height={38}
            fill={rowColor}
            cornerRadius={radius.sm}
            style={[styles.rpeColumn, styles.rpe]}
          >
            <Text style={[type.callout, type.number, { color: rpeInk, fontWeight: '600' }]}>
              {rpeText}
            </Text>
          </MenuButton>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              item.completed ? `Mark set ${number} incomplete` : `Complete set ${number}`
            }
            accessibilityState={{ checked: item.completed }}
            hitSlop={4}
            onPress={() => {
              haptics.selection();
              complete();
            }}
            style={({ pressed }) => [
              styles.checkColumn,
              styles.check,
              item.completed
                ? { backgroundColor: colors.good, borderColor: colors.good }
                : { backgroundColor: colors.surface, borderColor: colors.lineStrong },
              pressed && styles.pressed,
            ]}
          >
            <Icon
              name="check"
              size={18}
              color={item.completed ? colors.onAccent : colors.secondary}
            />
          </Pressable>
        </View>
        <SetDetails
          item={item}
          number={number}
          records={records}
          ratio={ratio}
          machine={
            machines
              ? item.machine_photo_id
                ? (machineNames.get(item.machine_photo_id) ?? 'Machine')
                : item.completed
                  ? null
                  : undefined
              : undefined
          }
          onEditNote={editNote}
        />
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
        {cardio && (
          <View style={{ paddingLeft: 40 }}>
            <CardioSetImport
              number={number}
              done={item.completed}
              // A scanned screenshot is the finished set, so it is logged, as on the web.
              onScanned={(values) => update({ ...values, completed: true })}
            />
          </View>
        )}
      </View>
    </ReanimatedSwipeable>
  );
}

/** What a set carries besides its numbers: the records it beat, its RPE and its note. */
function SetDetails({
  item,
  number,
  records,
  ratio,
  machine,
  onEditNote,
}: {
  item: WorkoutDraftSet;
  number: number;
  records: string[] | null;
  ratio: string | null;
  /** The set's machine when several are pinned; null for a logged set that needs one. */
  machine?: string | null;
  onEditNote: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const note = item.notes?.trim();
  if (!records && !ratio && !note && machine === undefined) return null;
  return (
    <View style={styles.details}>
      {!!ratio && (
        <Text style={[type.footnote, type.number, { color: colors.secondary }]}>{ratio}</Text>
      )}
      {records && (
        <View
          accessible
          accessibilityLabel={`Set ${number}: ${records.join(', ')}`}
          style={[styles.record, { backgroundColor: colors.goldSoft, borderRadius: radius.sm }]}
        >
          <Icon name="trophy" size={12} color={colors.gold} />
          <Text style={[type.caption, { color: colors.text, fontWeight: '700', flexShrink: 1 }]}>
            {records.join(' · ')}
          </Text>
        </View>
      )}
      {machine !== undefined && (
        <Text
          style={[
            type.footnote,
            { color: machine ? colors.secondary : colors.danger, fontWeight: '600' },
          ]}
        >
          {machine ?? 'Choose a machine from the set menu'}
        </Text>
      )}
      {!!note && (
        <View style={styles.detailLine}>
          {!!note && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit note for set ${number}: ${note}`}
              onPress={onEditNote}
              hitSlop={6}
              style={{ flexShrink: 1 }}
            >
              <Text style={[type.footnote, { color: colors.muted }]} numberOfLines={2}>
                {note}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
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
  card: { gap: 6 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 6,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  order: {
    position: 'absolute',
    right: -5,
    bottom: -5,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderText: { fontSize: 11, fontWeight: '800' },
  // The web's exercise name: accent, 17 pt, bold, a link to its history.
  name: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.3 },
  squareButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreButton: {
    width: 32,
    height: 44,
    marginRight: -6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  columns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  head: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  setColumn: { width: 34, textAlign: 'center' },
  setBadge: { height: 36, alignItems: 'center', justifyContent: 'center' },
  valueColumn: { flex: 1, textAlign: 'center' },
  rpeColumn: { width: 44, textAlign: 'center' },
  rpe: { height: 38, alignItems: 'center', justifyContent: 'center' },
  checkColumn: { width: 44 },
  check: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteAction: {
    width: 72,
    marginLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSet: {
    marginTop: 6,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  details: { paddingLeft: 44, paddingRight: 4, paddingBottom: 4, gap: 4 },
  machine: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: 8,
    marginBottom: 4,
  },
  thumb: {
    width: 36,
    height: 36,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: { width: 36, height: 36 },
  record: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  detailLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  extrasToggle: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  extras: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 6 },
  extraField: { width: '46%', gap: 2 },
});
