import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { exerciseEquipmentOptions } from '../../../../frontend/src/exerciseEquipment';
import {
  EXERCISE_LIBRARY_SORTS,
  exerciseLibraryMuscles,
  filterExerciseLibrary,
} from '../../../../frontend/src/exerciseLibraryFilter';
import { formatLastDone } from '../../../../frontend/src/exerciseLastDone';
import type { Exercise, ExerciseLibrarySummary } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { formatWeightNumber, weightFromKg } from '../../../../frontend/src/weightUnits';
import { useExercises, useWeightUnit } from '../../data/queries';
import { Button, Card } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { trainingIcons } from './icons';
import { Chip, Divider, MoreButton, Note, Segmented } from './parts';
import { useExerciseLibrary } from './trainingQueries';

const PAGE = 20;

/** Exercises: the strength exercise library, searchable and filtered as on the web. */
export function ExercisesSection() {
  const { colors, radius, type } = useTheme();
  const router = useRouter();
  const unit = useWeightUnit();
  const exercises = useExercises();
  const library = useExerciseLibrary();
  const strength = useMemo(
    () => (exercises.data ?? []).filter((exercise) => exercise.kind === 'strength'),
    [exercises.data],
  );
  const summaries = useMemo(
    () => new Map((library.data ?? []).map((item) => [item.exercise_id, item])),
    [library.data],
  );
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('All');
  const [equipment, setEquipment] = useState('');
  const [customOnly, setCustomOnly] = useState(false);
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const [sort, setSort] = useState(0);
  const [shown, setShown] = useState(PAGE);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const muscles = useMemo(() => exerciseLibraryMuscles(strength), [strength]);
  const hiddenCount = strength.filter((exercise) => exercise.hidden).length;
  const list = useMemo(
    () =>
      filterExerciseLibrary(strength, summaries, {
        query,
        muscle,
        equipment,
        customOnly,
        hiddenOnly,
        sort,
      }),
    [strength, summaries, query, muscle, equipment, customOnly, hiddenOnly, sort],
  );
  const changed = (update: () => void) => {
    update();
    setShown(PAGE);
  };

  if (exercises.isPending) return <Note>Loading exercises…</Note>;
  if (exercises.isError)
    return (
      <Note
        action={
          <Button label="Try again" variant="secondary" onPress={() => void exercises.refetch()} />
        }
      >
        Could not load exercises.
      </Note>
    );

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.toolbar}>
        <View
          style={[styles.search, { backgroundColor: colors.surface2, borderRadius: radius.md }]}
        >
          <Icon name="search" size={16} color={colors.muted} />
          <TextInput
            accessibilityLabel="Search exercises"
            placeholder="Search exercises"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={(text) => changed(() => setQuery(text))}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={[type.body, styles.input, { color: colors.text }]}
          />
          {!!query && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
              onPress={() => changed(() => setQuery(''))}
            >
              <Icon name="close" size={14} color={colors.muted} />
            </Pressable>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            equipment ? 'Exercise list options, equipment filtered' : 'Exercise list options'
          }
          onPress={() => setOptionsOpen(true)}
          style={({ pressed }) => [
            styles.optionsButton,
            {
              backgroundColor: equipment ? colors.accentSoft : colors.surface2,
              borderRadius: radius.md,
            },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Icon
            name={trainingIcons.options}
            size={18}
            color={equipment ? colors.accentText : colors.text}
          />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        accessibilityLabel="Muscle group"
      >
        <Chip
          label="Custom"
          accessibilityLabel="Custom exercises"
          selected={customOnly}
          onPress={() => changed(() => setCustomOnly(!customOnly))}
        />
        {hiddenCount > 0 && (
          <Chip
            label="Hidden"
            accessibilityLabel={`Hidden exercises, ${hiddenCount}`}
            selected={hiddenOnly}
            onPress={() => changed(() => setHiddenOnly(!hiddenOnly))}
          />
        )}
        {['All', ...muscles].map((name) => (
          <Chip
            key={name}
            label={name}
            selected={muscle === name}
            onPress={() => changed(() => setMuscle(muscle === name ? 'All' : name))}
          />
        ))}
      </ScrollView>
      {library.isError && (
        <Note
          action={<Button label="Retry" variant="link" onPress={() => void library.refetch()} />}
        >
          Could not load exercise trends.
        </Note>
      )}
      {list.length === 0 ? (
        <Note>
          {strength.length
            ? 'No exercises match your search and filters.'
            : 'No strength exercises yet.'}
        </Note>
      ) : (
        <Card style={styles.list}>
          {list.slice(0, shown).map((exercise, index) => (
            <View key={exercise.id}>
              {index > 0 && <Divider inset={52} />}
              <ExerciseRow
                exercise={exercise}
                summary={summaries.get(exercise.id)}
                trendsLoading={library.isPending}
                unit={unit}
                onPress={() =>
                  router.push({
                    pathname: '/training/exercise/[id]',
                    params: { id: exercise.id },
                  })
                }
              />
            </View>
          ))}
        </Card>
      )}
      {list.length > shown && (
        <MoreButton
          label={`Show more (${list.length - shown})`}
          onPress={() => setShown(shown + PAGE)}
        />
      )}
      <Sheet visible={optionsOpen} onClose={() => setOptionsOpen(false)} title="Exercise list">
        <View style={{ gap: 8 }}>
          <Text style={[type.footnote, { color: colors.muted, fontWeight: '600' }]}>Sort by</Text>
          <Segmented
            accessibilityLabel="Sort exercises"
            values={EXERCISE_LIBRARY_SORTS}
            selectedIndex={sort}
            onChange={(index) => changed(() => setSort(index))}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={[type.footnote, { color: colors.muted, fontWeight: '600' }]}>Equipment</Text>
          <View
            style={[
              styles.equipment,
              { backgroundColor: colors.surface2, borderRadius: radius.lg },
            ]}
          >
            {['', ...exerciseEquipmentOptions(strength)].map((option, index) => {
              const selected = equipment === option;
              return (
                <View key={option || 'all'}>
                  {index > 0 && <Divider inset={16} />}
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityLabel={option || 'All equipment'}
                    accessibilityState={{ checked: selected }}
                    onPress={() => changed(() => setEquipment(option))}
                    style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                      {option || 'All equipment'}
                    </Text>
                    {selected && <Icon name="check" size={16} color={colors.accentText} />}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      </Sheet>
    </View>
  );
}

function ExerciseRow({
  exercise,
  summary,
  trendsLoading,
  unit,
  onPress,
}: {
  exercise: Exercise;
  summary: ExerciseLibrarySummary | undefined;
  trendsLoading: boolean;
  unit: 'kg' | 'lb';
  onPress: () => void;
}) {
  const { colors, type } = useTheme();
  const change = summary?.change_kg ?? null;
  const initials = exercise.name
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join('');
  const meta = [
    exercise.muscle_group,
    exercise.equipment,
    summary ? formatLastDone(summary.last_date, localDate()) : trendsLoading ? null : 'Not trained',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}, ${meta}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.initials, { backgroundColor: colors.surface2 }]}>
        <Text style={[type.footnote, { color: colors.secondary, fontWeight: '700' }]}>
          {initials}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
          {exercise.name}
        </Text>
        <Text style={[type.caption, { color: colors.secondary }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Sparkline summary={summary} />
      <View style={styles.value}>
        <Text style={[type.callout, type.number, { color: colors.text, fontWeight: '700' }]}>
          {summary?.latest_estimated_1rm == null
            ? '—'
            : `${summary.normalised ? '≈ ' : ''}${formatWeightNumber(summary.latest_estimated_1rm, unit, 1)}`}
          {summary?.latest_estimated_1rm != null && (
            <Text style={[type.caption, { color: colors.muted }]}> {unit}</Text>
          )}
        </Text>
        {change != null && (
          <Text
            style={[
              type.caption,
              type.number,
              {
                color: change > 0 ? colors.good : change < 0 ? colors.danger : colors.muted,
              },
            ]}
          >
            {change > 0 ? '+' : change < 0 ? '−' : ''}
            {Number(weightFromKg(Math.abs(change), unit).toFixed(1))} {unit}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

/** The estimated 1RM's recent trend, as the web's library rows draw it. */
function Sparkline({ summary }: { summary: ExerciseLibrarySummary | undefined }) {
  const { colors } = useTheme();
  const values = summary?.trend.map((point) => point.estimated_1rm) ?? [];
  if (values.length < 2) return <View style={styles.spark} />;
  const minimum = Math.min(...values);
  const span = Math.max(...values) - minimum || 1;
  const points = values
    .map(
      (value, i) => `${2 + (i / (values.length - 1)) * 56},${24 - ((value - minimum) / span) * 20}`,
    )
    .join(' ');
  const change = summary?.change_kg ?? 0;
  return (
    <Svg width={44} height={22} viewBox="0 0 60 28" style={styles.spark}>
      <Polyline
        points={points}
        fill="none"
        stroke={change > 0 ? colors.good : change < 0 ? colors.danger : colors.muted}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', gap: 8 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    minHeight: 42,
  },
  input: { flex: 1, paddingVertical: 8 },
  optionsButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { gap: 8, paddingRight: 8 },
  list: { paddingVertical: 4, gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 8,
  },
  initials: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spark: { width: 44, height: 22 },
  value: { alignItems: 'flex-end', minWidth: 64 },
  equipment: { overflow: 'hidden' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    paddingHorizontal: 16,
  },
});
