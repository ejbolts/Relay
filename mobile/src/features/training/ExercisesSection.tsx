import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { exerciseEquipmentOptions } from '../../../../frontend/src/exerciseEquipment';
import { mergeSources } from '../../../../frontend/src/exerciseMergeTargets';
import {
  EXERCISE_LIBRARY_SORTS,
  exerciseLibraryMuscles,
  filterExerciseLibrary,
} from '../../../../frontend/src/exerciseLibraryFilter';
import { formatLastDone } from '../../../../frontend/src/exerciseLastDone';
import { blockOn } from '../../../../frontend/src/trainingBlocks';
import type {
  Exercise,
  ExerciseCreateInput,
  ExerciseLibrarySummary,
} from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { formatWeightNumber, weightFromKg } from '../../../../frontend/src/weightUnits';
import { apiSend } from '../../data/api';
import { queryKeys, useExercises, useWeightUnit } from '../../data/queries';
import { Button, Card, IconButton } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { useBlockScope } from '../blocks/blockQueries';
import { FieldLabel, RadioRow } from '../blocks/parts';
import { blockRoutes } from '../blocks/routes';
import { useScopedExerciseLibrary } from '../exercises/exerciseQueries';
import { exerciseRoutes } from '../exercises/routes';
import { CreateExerciseSheet } from '../workout/CreateExerciseSheet';
import { ExerciseMuscleHelpButton, ExerciseMuscleHelpSheet } from './ExerciseMuscleHelp';
import { trainingIcons } from './icons';
import { Chip, Divider, MoreButton, Note, Segmented } from './parts';

const PAGE = 20;

/** Exercises: the strength exercise library, searchable and filtered as on the web. */
export function ExercisesSection() {
  const { colors, radius, scheme, type } = useTheme();
  const router = useRouter();
  const unit = useWeightUnit();
  const client = useQueryClient();
  const exercises = useExercises();
  const blocks = useBlockScope();
  // Trends are read for the chosen block, so the first read waits until the blocks are known.
  const library = useScopedExerciseLibrary(blocks.block, blocks.known);
  const currentBlock = blockOn(blocks.config.blocks, localDate());
  const blockChoice = blocks.block
    ? blocks.block.id === currentBlock?.id
      ? 'current'
      : blocks.block.id
    : 'all';
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
  const [creating, setCreating] = useState(false);
  const [helpExercise, setHelpExercise] = useState<Exercise | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  // The exercise just created, told apart from an existing one picked from the suggestions.
  const created = useRef<string | null>(null);
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
  const openExercise = (id: string) =>
    router.push({ pathname: '/training/exercise/[id]', params: { id } });
  const create = async (input: ExerciseCreateInput) => {
    const exercise = await apiSend<Exercise>('/api/exercises', 'POST', input);
    created.current = exercise.id;
    client.setQueryData<Exercise[]>(queryKeys.exercises, (list) =>
      list ? [...list.filter((item) => item.id !== exercise.id), exercise] : [exercise],
    );
    void client.invalidateQueries({ queryKey: queryKeys.exercises });
    return exercise;
  };
  /** Closes the options sheet on the way to another screen. */
  const leaveOptions = (go: () => void) => {
    setOptionsOpen(false);
    go();
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
        {/* The web's library toolbar: a raised search field, the options button and an accent +. */}
        <View
          style={[
            styles.search,
            {
              backgroundColor: colors.surface,
              borderColor: searchFocused ? colors.accent : colors.lineStrong,
            },
          ]}
        >
          <Icon name="search" size={17} color={colors.muted} />
          <TextInput
            accessibilityLabel="Search exercises"
            placeholder="Search exercises"
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            keyboardAppearance={scheme}
            value={query}
            onChangeText={(text) => changed(() => setQuery(text))}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
            autoCorrect={false}
            style={[type.body, styles.input, { color: colors.text }]}
          />
          {!!query && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={10}
              onPress={() => changed(() => setQuery(''))}
            >
              <Icon name="close" size={15} color={colors.muted} />
            </Pressable>
          )}
        </View>
        <View>
          <IconButton
            icon={trainingIcons.options}
            accessibilityLabel={
              equipment ? 'Exercise list options, equipment filtered' : 'Exercise list options'
            }
            onPress={() => setOptionsOpen(true)}
            style={[
              styles.toolButton,
              { backgroundColor: colors.surface2, borderColor: colors.lineStrong },
            ]}
          />
          {/* A filter is on, as the web's dot on the options button. */}
          {!!equipment && (
            <View
              pointerEvents="none"
              style={[styles.optionsDot, { backgroundColor: colors.accent }]}
            />
          )}
        </View>
        <IconButton
          icon="plus"
          accent
          accessibilityLabel="Add exercise"
          onPress={() => setCreating(true)}
          style={styles.toolButton}
        />
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
                onPress={() => openExercise(exercise.id)}
                onHelp={() => setHelpExercise(exercise)}
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
        {blocks.config.blocks.length > 0 && (
          <View style={{ gap: 8 }}>
            <FieldLabel>Training block</FieldLabel>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Training block"
              style={[
                styles.equipment,
                { backgroundColor: colors.surface2, borderRadius: radius.lg },
              ]}
            >
              <RadioRow
                label="All time"
                selected={blockChoice === 'all'}
                onPress={() => blocks.select('all')}
              />
              {[...blocks.config.blocks].reverse().map((item) => {
                const isCurrent = item.id === currentBlock?.id;
                return (
                  <View key={item.id}>
                    <Divider inset={16} />
                    <RadioRow
                      label={isCurrent ? `${item.name} (current)` : item.name}
                      selected={blockChoice === (isCurrent ? 'current' : item.id)}
                      onPress={() => blocks.select(isCurrent ? 'current' : item.id)}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        )}
        <View style={{ gap: 8 }}>
          <FieldLabel>Sort by</FieldLabel>
          <Segmented
            accessibilityLabel="Sort exercises"
            values={EXERCISE_LIBRARY_SORTS}
            selectedIndex={sort}
            onChange={(index) => changed(() => setSort(index))}
          />
        </View>
        <View style={{ gap: 8 }}>
          <FieldLabel>Equipment</FieldLabel>
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
        {blocks.error && (
          <Note action={<Button label="Retry" variant="link" onPress={blocks.retry} />}>
            Could not load training blocks.
          </Note>
        )}
        <View style={{ gap: 8 }}>
          <Button
            label={blocks.config.blocks.length ? 'Training blocks' : 'Start a block'}
            variant="secondary"
            disabled={blocks.loading || blocks.error}
            onPress={() =>
              leaveOptions(() =>
                router.push(
                  blocks.config.blocks.length ? blockRoutes.overview : blockRoutes.edit(),
                ),
              )
            }
          />
          {mergeSources(exercises.data ?? []).length > 0 && (
            <Button
              label="Merge exercises"
              variant="secondary"
              onPress={() => leaveOptions(() => router.push(exerciseRoutes.merge()))}
            />
          )}
        </View>
      </Sheet>
      <CreateExerciseSheet
        visible={creating}
        exercises={exercises.data ?? []}
        initialName=""
        initialCategory=""
        onCreate={create}
        onUseExisting={(exercise) => {
          setCreating(false);
          if (created.current !== exercise.id) {
            openExercise(exercise.id);
            return;
          }
          created.current = null;
          showToast(`${exercise.name} added`, {
            label: 'Open',
            run: () => openExercise(exercise.id),
          });
        }}
        onClose={() => setCreating(false)}
      />
      <ExerciseMuscleHelpSheet exercise={helpExercise} onClose={() => setHelpExercise(null)} />
    </View>
  );
}

function ExerciseRow({
  exercise,
  summary,
  trendsLoading,
  unit,
  onPress,
  onHelp,
}: {
  exercise: Exercise;
  summary: ExerciseLibrarySummary | undefined;
  trendsLoading: boolean;
  unit: 'kg' | 'lb';
  onPress: () => void;
  onHelp: () => void;
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
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${exercise.name}, ${meta}`}
        onPress={onPress}
        style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.6 }]}
      >
        <View style={[styles.initials, { backgroundColor: colors.surface2 }]}>
          <Text style={[type.footnote, { color: colors.secondary, fontWeight: '700' }]}>
            {initials}
          </Text>
        </View>
        {/* Long names and details wrap onto a second line, as on the web, instead of cutting off. */}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]} numberOfLines={2}>
            {exercise.name}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={2}>
            {meta}
          </Text>
        </View>
      </Pressable>
      <ExerciseMuscleHelpButton exercise={exercise} onPress={onHelp} />
      <Pressable
        accessible={false}
        onPress={onPress}
        style={({ pressed }) => [styles.rowStats, pressed && { opacity: 0.6 }]}
      >
        <Sparkline summary={summary} />
        <View style={styles.value}>
          {summary?.latest_estimated_1rm != null && (
            <Text
              accessibilityLabel="Estimated one-rep max"
              style={[type.caption, { color: colors.muted, fontSize: 11 }]}
            >
              e1RM
            </Text>
          )}
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
    </View>
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
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 13,
  },
  input: { flex: 1, paddingVertical: 10 },
  toolButton: { width: 46, height: 46, borderRadius: 13 },
  optionsDot: { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: 4 },
  chips: { gap: 8, paddingRight: 8 },
  list: { paddingVertical: 4, gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 60,
    paddingVertical: 8,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  initials: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spark: { width: 40, height: 22 },
  value: { alignItems: 'flex-end', minWidth: 60, gap: 1 },
  equipment: { overflow: 'hidden' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    paddingHorizontal: 16,
  },
});
