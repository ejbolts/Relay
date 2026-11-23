import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { exerciseNameFromSearch } from '../../../../frontend/src/exerciseCreation';
import { exerciseEquipmentOptions } from '../../../../frontend/src/exerciseEquipment';
import {
  EXERCISE_BODY_PARTS,
  matchesExerciseFilters,
} from '../../../../frontend/src/exerciseFilters';
import { formatLastDone } from '../../../../frontend/src/exerciseLastDone';
import {
  lastUsedMachineId,
  machinesByExercise,
  resolveMachineChoices,
  toggledMachineChoice,
  type ExerciseMachineChoices,
} from '../../../../frontend/src/exerciseMachineChoices';
import { rankExerciseSearchMatches } from '../../../../frontend/src/exerciseSearch';
import type {
  Exercise,
  ExerciseCreateInput,
  MachinePhotoUsage,
  WorkoutCategory,
} from '../../../../frontend/src/types';
import { CATEGORY_LABELS } from '../../../../frontend/src/trainingSummary';
import { localDate } from '../../../../frontend/src/utils';
import { supersetGroupName } from '../../../../frontend/src/workoutSupersets';
import { Button } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { MenuButton, type MenuItem } from '../../ui/MenuButton';
import { useTheme } from '../../ui/theme';
import { ExerciseIcon } from '../../ui/ExerciseIcon';
import { CreateExerciseSheet } from './CreateExerciseSheet';
import { loggerKeys, useAllMachinePhotos } from './loggerQueries';
import { PickerMachineStrip } from './PickerMachineStrip';

const NO_MACHINES: MachinePhotoUsage[] = [];
const NO_DATES: ReadonlyMap<string, string> = new Map();

/**
 * Picks exercises to add, in the order tapped, searched with the web's exercise search (names,
 * other names, muscles and equipment, with typos). Recently trained exercises come first. In
 * swap mode one tap picks the replacement. An exercise that isn't there can be created. With
 * `chooseMachines`, a picked exercise with saved machines offers them, as the web's picker does,
 * starting on its last-used one; with `onCreateSuperset` the picks can be added as a superset.
 */
export function ExercisePicker({
  visible,
  mode = 'add',
  exercises,
  recentIds,
  addedIds,
  category,
  onAdd,
  onCreateSuperset,
  chooseMachines = false,
  lastDone = NO_DATES,
  onCreate,
  onClose,
}: {
  visible: boolean;
  mode?: 'add' | 'swap';
  exercises: Exercise[];
  recentIds: string[];
  /** Exercises already in the workout. */
  addedIds: Set<string>;
  /** The workout's type, which a new exercise created from a search starts in. */
  category?: WorkoutCategory;
  /** The picks in the order tapped, with the machine chosen for each that has saved machines. */
  onAdd: (selected: Exercise[], machineChoices: ExerciseMachineChoices) => void;
  /** Adds the picks as a superset (tri-set, giant set) instead. */
  onCreateSuperset?: (selected: Exercise[], machineChoices: ExerciseMachineChoices) => void;
  /** Offers each picked exercise's saved machines. */
  chooseMachines?: boolean;
  /** The day each exercise was last done, shown on its row as on the web. */
  lastDone?: ReadonlyMap<string, string>;
  /** Creates an exercise that isn't in the list. Without it (as in the split editor, like the
   * web's routine editor) the picker only chooses existing exercises. */
  onCreate?: (input: ExerciseCreateInput) => Promise<Exercise>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [bodyPart, setBodyPart] = useState<WorkoutCategory | 'all'>('all');
  const [equipment, setEquipment] = useState('');
  const [selected, setSelected] = useState<Exercise[]>([]);
  const [creating, setCreating] = useState<{ name: string; category: WorkoutCategory | '' } | null>(
    null,
  );
  const swap = mode === 'swap';
  const { colors, type, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  // Swapping offers the replacement's machines too, as the web's Switch exercise picker does.
  const machinesOn = chooseMachines;
  const allMachines = useAllMachinePhotos(visible && machinesOn).data;
  const savedMachines = useMemo(
    () =>
      machinesOn ? machinesByExercise(allMachines ?? []) : new Map<string, MachinePhotoUsage[]>(),
    [machinesOn, allMachines],
  );
  // Only choices made here; a picked exercise otherwise starts on its last-used machine.
  const [machineChoices, setMachineChoices] = useState<ExerciseMachineChoices>({});
  const [openMachinesId, setOpenMachinesId] = useState<string | null>(null);
  const resolvedChoices = resolveMachineChoices(
    selected.map((exercise) => exercise.id),
    savedMachines,
    machineChoices,
  );
  const equipmentOptions = useMemo(() => exerciseEquipmentOptions(exercises), [exercises]);
  const eligible = useMemo(() => exercises.filter((exercise) => !exercise.hidden), [exercises]);
  // The web's Body part and Equipment filters narrow the list before the search ranks it.
  const available = useMemo(
    () => eligible.filter((exercise) => matchesExerciseFilters(exercise, bodyPart, equipment)),
    [eligible, bodyPart, equipment],
  );
  const today = localDate();
  const shown = useMemo(() => {
    if (query.trim()) return rankExerciseSearchMatches(available, query, recentIds);
    const recency = new Map(recentIds.map((id, index) => [id, index]));
    return [...available].sort(
      (left, right) =>
        (recency.get(left.id) ?? Infinity) - (recency.get(right.id) ?? Infinity) ||
        left.name.localeCompare(right.name),
    );
  }, [available, query, recentIds]);

  const close = () => {
    setQuery('');
    setBodyPart('all');
    setEquipment('');
    setSelected([]);
    setMachineChoices({});
    setOpenMachinesId(null);
    onClose();
  };
  const toggle = (exercise: Exercise) => {
    haptics.selection();
    // One tap swaps, unless the replacement has saved machines: then it is picked with its
    // last-used machine and its machines open, and Swap exercise confirms the choice.
    if (swap && !savedMachines.get(exercise.id)?.length) {
      onAdd([exercise], {});
      close();
      return;
    }
    if (swap) {
      const wasPicked = selected[0]?.id === exercise.id;
      setSelected(wasPicked ? [] : [exercise]);
      setMachineChoices({});
      setOpenMachinesId(wasPicked ? null : exercise.id);
      return;
    }
    const wasSelected = selected.some((item) => item.id === exercise.id);
    setSelected((current) =>
      wasSelected ? current.filter((item) => item.id !== exercise.id) : [...current, exercise],
    );
    if (wasSelected) {
      setMachineChoices((current) => {
        const next = { ...current };
        delete next[exercise.id];
        return next;
      });
      if (openMachinesId === exercise.id) setOpenMachinesId(null);
    } else if (savedMachines.get(exercise.id)?.length) setOpenMachinesId(exercise.id);
  };
  /** Tapping the chosen machine again returns to the baseline exercise; it picks the exercise too. */
  const chooseMachine = (exercise: Exercise, machineId: string) => {
    const picked = selected.some((item) => item.id === exercise.id);
    const choice = picked
      ? toggledMachineChoice(resolvedChoices[exercise.id] ?? null, machineId)
      : machineId;
    // Swapping picks one replacement, so a machine of another exercise replaces the pick.
    setMachineChoices((current) =>
      swap ? { [exercise.id]: choice } : { ...current, [exercise.id]: choice },
    );
    if (!picked) setSelected((current) => (swap ? [exercise] : [...current, exercise]));
  };
  const machineAdded = (exercise: Exercise, photo: MachinePhotoUsage) => {
    client.setQueryData<MachinePhotoUsage[]>(loggerKeys.allMachines, (current) => [
      ...(current ?? []),
      photo,
    ]);
    void client.invalidateQueries({ queryKey: loggerKeys.machines(exercise.id) });
    setMachineChoices((current) =>
      swap ? { [exercise.id]: photo.id } : { ...current, [exercise.id]: photo.id },
    );
    if (!selected.some((item) => item.id === exercise.id))
      setSelected((current) => (swap ? [exercise] : [...current, exercise]));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={close}
    >
      <View
        style={[
          styles.page,
          {
            backgroundColor: colors.page,
            paddingTop: Platform.OS === 'ios' ? 12 : insets.top + 8,
          },
        ]}
      >
        <View style={styles.bar}>
          <Pressable
            accessibilityRole="button"
            onPress={close}
            hitSlop={8}
            style={styles.barButton}
          >
            <Text style={[type.body, { color: colors.accentText }]}>Cancel</Text>
          </Pressable>
          <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
            {swap ? 'Swap exercise' : 'Add exercises'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={selected.length ? `Add ${selected.length}` : 'Add'}
            accessibilityElementsHidden={swap}
            importantForAccessibility={swap ? 'no-hide-descendants' : 'auto'}
            accessibilityState={{ disabled: !selected.length }}
            disabled={!selected.length}
            hitSlop={8}
            onPress={() => {
              onAdd(selected, resolvedChoices);
              close();
            }}
            style={[styles.barButton, { alignItems: 'flex-end', opacity: swap ? 0 : 1 }]}
          >
            <Text
              style={[
                type.body,
                {
                  color: selected.length ? colors.accentText : colors.muted,
                  fontWeight: '700',
                },
              ]}
            >
              {selected.length ? `Add (${selected.length})` : 'Add'}
            </Text>
          </Pressable>
        </View>
        <View
          style={[
            styles.search,
            {
              backgroundColor: colors.surface2,
              borderColor: colors.lineStrong,
              borderRadius: radius.md,
            },
          ]}
        >
          <Icon name="search" size={16} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises"
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            accessibilityLabel="Search exercises"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            returnKeyType="search"
            style={[type.body, { flex: 1, color: colors.text, paddingVertical: 11 }]}
          />
        </View>
        <View style={styles.filters}>
          <FilterMenu
            label="Body part"
            value={bodyPart === 'all' ? null : CATEGORY_LABELS[bodyPart]}
            items={[
              {
                label: 'All body parts',
                checked: bodyPart === 'all',
                onPress: () => setBodyPart('all'),
              },
              ...EXERCISE_BODY_PARTS.map((part) => ({
                label: CATEGORY_LABELS[part],
                checked: bodyPart === part,
                onPress: () => setBodyPart(part),
              })),
            ]}
          />
          <FilterMenu
            label="Equipment"
            value={equipment || null}
            items={[
              { label: 'All equipment', checked: !equipment, onPress: () => setEquipment('') },
              ...equipmentOptions.map((option) => ({
                label: option,
                checked: equipment === option,
                onPress: () => setEquipment(option),
              })),
            ]}
          />
          {onCreate && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create new exercise"
              onPress={() => {
                haptics.tap();
                setCreating({ name: query.trim(), category: '' });
              }}
              style={({ pressed }) => [
                styles.createButton,
                { backgroundColor: colors.accent, borderRadius: radius.md },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Icon name="plus" size={20} color={colors.onAccent} />
            </Pressable>
          )}
        </View>
        <FlatList
          data={shown}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            paddingBottom:
              onCreateSuperset && !swap && selected.length >= 2 ? 24 : insets.bottom + 24,
          }}
          initialNumToRender={20}
          ListEmptyComponent={
            <Text style={[type.callout, styles.empty, { color: colors.muted }]}>
              {exercises.length ? 'No matching exercises' : 'Exercises are still loading'}
            </Text>
          }
          ListFooterComponent={
            onCreate &&
            query.trim() &&
            // An exact name anywhere in the catalogue, filtered out or not, already exists.
            !eligible.some(
              (exercise) =>
                exercise.name.trim().toLocaleLowerCase() === query.trim().toLocaleLowerCase(),
            ) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Create ${exerciseNameFromSearch(query.trim())}`}
                onPress={() =>
                  setCreating({
                    name: exerciseNameFromSearch(query.trim()),
                    category: category ?? '',
                  })
                }
                style={({ pressed }) => [styles.create, pressed && { opacity: 0.7 }]}
              >
                <Icon name="plus" size={16} color={colors.accentText} />
                <Text style={[type.body, { color: colors.accentText, fontWeight: '600' }]}>
                  Create “{exerciseNameFromSearch(query.trim())}”
                </Text>
              </Pressable>
            ) : undefined
          }
          extraData={[resolvedChoices, openMachinesId, savedMachines]}
          renderItem={({ item }) => {
            const order = selected.findIndex((exercise) => exercise.id === item.id);
            const added = addedIds.has(item.id);
            const machines = (!added && savedMachines.get(item.id)) || NO_MACHINES;
            const machinesOpen = machines.length > 0 && openMachinesId === item.id;
            const chosenId = order >= 0 ? (resolvedChoices[item.id] ?? null) : null;
            const chosen = machines.find((machine) => machine.id === chosenId);
            return (
              <View style={machinesOpen && { backgroundColor: colors.surface }}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={item.name}
                  accessibilityState={{
                    checked: order >= 0 || added,
                    disabled: added,
                  }}
                  disabled={added}
                  onPress={() => toggle(item)}
                  style={({ pressed }) => [
                    styles.row,
                    { borderColor: colors.line },
                    order >= 0 && { backgroundColor: colors.accentSoft },
                    pressed && { backgroundColor: colors.surface2 },
                  ]}
                >
                  <View style={added && { opacity: 0.55 }}>
                    <ExerciseIcon exercise={item} size={44} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={[
                        type.callout,
                        { color: added ? colors.muted : colors.text, fontWeight: '600' },
                      ]}
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                    <View style={styles.tags}>
                      <Text style={[type.footnote, { color: colors.muted }]} numberOfLines={1}>
                        {[item.muscle_group, item.equipment].filter(Boolean).join(' · ')}
                      </Text>
                      {lastDone.has(item.id) && (
                        <View
                          accessible
                          accessibilityLabel={`Last done ${formatLastDone(lastDone.get(item.id)!, today)}`}
                          style={styles.lastDone}
                        >
                          <Icon name="training" size={11} color={colors.muted} />
                          <Text style={[type.footnote, { color: colors.muted }]}>
                            {formatLastDone(lastDone.get(item.id)!, today)}
                          </Text>
                        </View>
                      )}
                    </View>
                    {order >= 0 && machines.length > 0 && (
                      <Text
                        style={[type.footnote, { color: colors.accentText, fontWeight: '600' }]}
                        numberOfLines={1}
                      >
                        {chosen?.caption || (chosen ? 'Machine' : 'Baseline exercise')}
                      </Text>
                    )}
                  </View>
                  {machines.length > 0 && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${machinesOpen ? 'Hide' : 'Show'} machines for ${item.name}`}
                      accessibilityState={{ expanded: machinesOpen }}
                      hitSlop={8}
                      onPress={() => setOpenMachinesId(machinesOpen ? null : item.id)}
                      style={[styles.machinesToggle, { backgroundColor: colors.surface2 }]}
                    >
                      <Icon
                        name={{ sf: 'wrench.adjustable', md: 'build' }}
                        size={13}
                        color={colors.secondary}
                      />
                      <Text style={[type.caption, type.number, { color: colors.secondary }]}>
                        {machines.length}
                      </Text>
                      <Icon
                        name={machinesOpen ? 'chevronUp' : 'chevronDown'}
                        size={12}
                        color={colors.secondary}
                      />
                    </Pressable>
                  )}
                  {(order >= 0 || added || !swap) && (
                    <View
                      style={[
                        styles.tick,
                        order >= 0 || added
                          ? {
                              backgroundColor: added ? colors.surface3 : colors.accent,
                              borderColor: 'transparent',
                            }
                          : { borderColor: colors.lineStrong },
                      ]}
                    >
                      {order >= 0 ? (
                        <Text style={[type.caption, { color: colors.onAccent, fontWeight: '700' }]}>
                          {order + 1}
                        </Text>
                      ) : added ? (
                        <Icon name="check" size={12} color={colors.secondary} />
                      ) : null}
                    </View>
                  )}
                </Pressable>
                {machinesOpen && (
                  <PickerMachineStrip
                    exercise={item}
                    machines={machines}
                    chosenId={chosenId}
                    lastUsedId={lastUsedMachineId(machines)}
                    onToggle={(machineId) => chooseMachine(item, machineId)}
                    onAdded={(photo) => machineAdded(item, photo)}
                  />
                )}
              </View>
            );
          }}
        />
        {onCreateSuperset && !swap && selected.length >= 2 && (
          <View
            style={[styles.footer, { borderColor: colors.line, paddingBottom: insets.bottom + 10 }]}
          >
            <Button
              label={`Add ${selected.length > 2 ? supersetGroupName(selected.length).toLowerCase() : 'superset'}`}
              icon={{ sf: 'link', md: 'link' }}
              variant="tonal"
              block
              onPress={() => {
                onCreateSuperset(selected, resolvedChoices);
                close();
              }}
            />
          </View>
        )}
        {swap && selected[0] && (
          <View
            style={[styles.footer, { borderColor: colors.line, paddingBottom: insets.bottom + 10 }]}
          >
            <Button
              label="Swap exercise"
              icon={{ sf: 'arrow.left.arrow.right', md: 'swap-horiz' }}
              block
              onPress={() => {
                onAdd([selected[0]], resolvedChoices);
                close();
              }}
            />
          </View>
        )}
      </View>
      {onCreate && (
        <CreateExerciseSheet
          visible={!!creating}
          exercises={exercises}
          initialName={creating?.name ?? ''}
          initialCategory={creating?.category ?? ''}
          onCreate={onCreate}
          onUseExisting={(exercise) => {
            setCreating(null);
            setQuery('');
            if (swap) {
              onAdd([exercise], {});
              close();
            } else if (!addedIds.has(exercise.id))
              setSelected((current) =>
                current.some((item) => item.id === exercise.id) ? current : [...current, exercise],
              );
          }}
          onClose={() => setCreating(null)}
        />
      )}
    </Modal>
  );
}

/** One of the web picker's filter selects, as a native menu: its label until a value is chosen. */
function FilterMenu({
  label,
  value,
  items,
}: {
  label: string;
  value: string | null;
  items: MenuItem[];
}) {
  const { colors, type, radius } = useTheme();
  const [width, setWidth] = useState(0);
  const ink = value ? colors.accentText : colors.text;
  const text = value ?? label;
  return (
    <View style={styles.filter} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {/* iOS sizes its native menu host from the layout; Android draws a plain button. */}
      {(Platform.OS !== 'ios' || width > 0) && (
        <MenuButton
          accessibilityLabel={value ? `${label}: ${value}` : label}
          title={label}
          items={items}
          trigger={{ text: `${text} ⌄`, color: ink }}
          width={width}
          height={44}
          fill={value ? colors.accentSoft : colors.surface2}
          cornerRadius={radius.md}
          style={[
            styles.filterButton,
            {
              backgroundColor: value ? colors.accentSoft : colors.surface2,
              borderColor: value ? `${colors.accent}8C` : colors.lineStrong,
              borderRadius: radius.md,
            },
          ]}
        >
          <View style={styles.filterContent}>
            <Text style={[type.callout, { flex: 1, color: ink }]} numberOfLines={1}>
              {text}
            </Text>
            <Icon name="chevronDown" size={16} color={colors.secondary} />
          </View>
        </MenuButton>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  barButton: { minWidth: 72 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  filter: { flex: 1, height: 44 },
  filterButton: { height: 44, borderWidth: 1, overflow: 'hidden' },
  filterContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  createButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 6 },
  lastDone: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { textAlign: 'center', padding: 32 },
  machinesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
});
