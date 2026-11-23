import * as Haptics from 'expo-haptics';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { exerciseNameFromSearch } from '../../../../frontend/src/exerciseCreation';
import { rankExerciseSearchMatches } from '../../../../frontend/src/exerciseSearch';
import type {
  Exercise,
  ExerciseCreateInput,
  WorkoutCategory,
} from '../../../../frontend/src/types';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { CreateExerciseSheet } from './CreateExerciseSheet';

/**
 * Picks exercises to add, in the order tapped, searched with the web's exercise search (names,
 * other names, muscles and equipment, with typos). Recently trained exercises come first. In
 * swap mode one tap picks the replacement. An exercise that isn't there can be created.
 */
export function ExercisePicker({
  visible,
  mode = 'add',
  exercises,
  recentIds,
  addedIds,
  category,
  onAdd,
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
  category: WorkoutCategory;
  onAdd: (selected: Exercise[]) => void;
  onCreate: (input: ExerciseCreateInput) => Promise<Exercise>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Exercise[]>([]);
  const [creating, setCreating] = useState<{ name: string; category: WorkoutCategory | '' } | null>(
    null,
  );
  const swap = mode === 'swap';
  const { colors, type, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const available = useMemo(() => exercises.filter((exercise) => !exercise.hidden), [exercises]);
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
    setSelected([]);
    onClose();
  };
  const toggle = (exercise: Exercise) => {
    void Haptics.selectionAsync();
    if (swap) {
      onAdd([exercise]);
      close();
      return;
    }
    setSelected((current) =>
      current.some((item) => item.id === exercise.id)
        ? current.filter((item) => item.id !== exercise.id)
        : [...current, exercise],
    );
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
              onAdd(selected);
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
          style={[styles.search, { backgroundColor: colors.surface2, borderRadius: radius.md }]}
        >
          <Icon name="search" size={16} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Search exercises"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            returnKeyType="search"
            style={[type.body, { flex: 1, color: colors.text, paddingVertical: 10 }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create new exercise"
            hitSlop={8}
            onPress={() => setCreating({ name: query.trim(), category: '' })}
          >
            <Icon name="plus" size={18} color={colors.accentText} />
          </Pressable>
        </View>
        <FlatList
          data={shown}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          initialNumToRender={20}
          ListEmptyComponent={
            <Text style={[type.callout, styles.empty, { color: colors.muted }]}>
              {exercises.length ? 'No matching exercises' : 'Exercises are still loading'}
            </Text>
          }
          ListFooterComponent={
            query.trim() &&
            !available.some(
              (exercise) =>
                exercise.name.trim().toLocaleLowerCase() === query.trim().toLocaleLowerCase(),
            ) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Create ${exerciseNameFromSearch(query.trim())}`}
                onPress={() =>
                  setCreating({ name: exerciseNameFromSearch(query.trim()), category })
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
          renderItem={({ item }) => {
            const order = selected.findIndex((exercise) => exercise.id === item.id);
            const added = addedIds.has(item.id);
            return (
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
                  pressed && { backgroundColor: colors.surface2 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: added ? colors.muted : colors.text }]}>
                    {item.name}
                  </Text>
                  <Text style={[type.footnote, { color: colors.muted }]} numberOfLines={1}>
                    {[item.muscle_group, item.equipment].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {(order >= 0 || added) && (
                  <View
                    style={[
                      styles.tick,
                      {
                        backgroundColor: added ? colors.surface3 : colors.accent,
                      },
                    ]}
                  >
                    {order >= 0 ? (
                      <Text style={[type.caption, { color: colors.onAccent, fontWeight: '700' }]}>
                        {order + 1}
                      </Text>
                    ) : (
                      <Icon name="check" size={12} color={colors.secondary} />
                    )}
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      </View>
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
            onAdd([exercise]);
            close();
          } else if (!addedIds.has(exercise.id))
            setSelected((current) =>
              current.some((item) => item.id === exercise.id) ? current : [...current, exercise],
            );
        }}
        onClose={() => setCreating(null)}
      />
    </Modal>
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
    paddingHorizontal: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { textAlign: 'center', padding: 32 },
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
});
