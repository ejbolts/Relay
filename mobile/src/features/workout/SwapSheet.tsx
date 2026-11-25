import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatLastDone } from '../../../../frontend/src/exerciseLastDone';
import {
  missingSwapMuscles,
  rankSwapAlternatives,
  SAME_MUSCLES_MATCH,
  swapAlternativeGroups,
  swapCarrySummary,
  swapMuscleCreditList,
} from '../../../../frontend/src/exerciseSwap';
import type { Exercise } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { Button } from '../../ui/components';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { ExerciseIcon } from '../../ui/ExerciseIcon';

const ALL = 'All';

/**
 * Pick a replacement for an exercise mid-workout, ranked by how much of its muscle credit each
 * alternative earns, as the web's swap sheet does. Browse all opens the full exercise list.
 */
export function SwapSheet({
  exercise,
  plannedSetCount,
  loggedSetCount,
  exercises,
  excludedIds,
  recentIds,
  lastDone,
  onChoose,
  onBrowseAll,
  onClose,
}: {
  exercise: Exercise | null;
  plannedSetCount: number;
  loggedSetCount: number;
  exercises: Exercise[];
  excludedIds: string[];
  recentIds: string[];
  lastDone: ReadonlyMap<string, string>;
  onChoose: (replacement: Exercise) => void;
  onBrowseAll: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible={!!exercise}
      onClose={onClose}
      title={exercise ? `Swap ${exercise.name}` : 'Swap'}
    >
      {exercise && (
        <SwapChoices
          // A new exercise starts with every piece of equipment shown.
          key={exercise.id}
          exercise={exercise}
          carry={swapCarrySummary(plannedSetCount, loggedSetCount)}
          exercises={exercises}
          excludedIds={excludedIds}
          recentIds={recentIds}
          lastDone={lastDone}
          onChoose={onChoose}
          onBrowseAll={onBrowseAll}
        />
      )}
    </Sheet>
  );
}

function SwapChoices({
  exercise,
  carry,
  exercises,
  excludedIds,
  recentIds,
  lastDone,
  onChoose,
  onBrowseAll,
}: {
  exercise: Exercise;
  carry: string;
  exercises: Exercise[];
  excludedIds: string[];
  recentIds: string[];
  lastDone: ReadonlyMap<string, string>;
  onChoose: (replacement: Exercise) => void;
  onBrowseAll: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const [today] = useState(localDate);
  const [equipment, setEquipment] = useState(ALL);
  const alternatives = useMemo(
    () => rankSwapAlternatives(exercise, exercises, { excludedIds, recentExerciseIds: recentIds }),
    [exercise, exercises, excludedIds, recentIds],
  );
  const options = useMemo(
    () => [...new Set(alternatives.map((item) => item.equipment))].sort(),
    [alternatives],
  );
  const shown = alternatives.filter((item) => equipment === ALL || item.equipment === equipment);
  const groups = swapAlternativeGroups(shown, exercise.kind === 'cardio');

  return (
    <View style={{ gap: 14 }}>
      {!!carry && <Text style={[type.callout, { color: colors.secondary }]}>{carry}</Text>}
      {options.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          accessibilityRole="radiogroup"
          accessibilityLabel="Equipment"
        >
          {[ALL, ...options].map((option) => {
            const on = option === equipment;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setEquipment(option);
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? colors.accent : colors.surface2,
                    borderColor: on ? colors.accent : colors.lineStrong,
                    borderRadius: radius.pill,
                  },
                ]}
              >
                <Text
                  style={[
                    type.footnote,
                    { color: on ? colors.onAccent : colors.text, fontWeight: '600' },
                  ]}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {groups.map(
        (group) =>
          group.items.length > 0 && (
            <View key={group.label} style={{ gap: 6 }}>
              <Text accessibilityRole="header" style={[type.eyebrow, { color: colors.muted }]}>
                {group.label}
              </Text>
              {group.items.map(({ exercise: alternative, match, equipment: kit }) => {
                const done = lastDone.get(alternative.id);
                const trained = swapMuscleCreditList(alternative);
                const missing = missingSwapMuscles(exercise, alternative);
                return (
                  <Pressable
                    key={alternative.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${alternative.name}${match !== null ? `, ${match}% muscle match` : ''}`}
                    onPress={() => onChoose(alternative)}
                    style={({ pressed }) => [
                      styles.option,
                      {
                        backgroundColor: colors.surface2,
                        borderColor: colors.line,
                        borderRadius: radius.md,
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <ExerciseIcon exercise={alternative} size={40} />
                    <View style={styles.optionCopy}>
                      <View style={styles.titleRow}>
                        <Text style={[type.headline, { color: colors.text, flexShrink: 1 }]}>
                          {alternative.name}
                        </Text>
                        {match !== null && (
                          <Text
                            style={[
                              type.caption,
                              type.number,
                              styles.match,
                              {
                                color:
                                  match >= SAME_MUSCLES_MATCH ? colors.good : colors.accentText,
                                borderRadius: radius.pill,
                                backgroundColor: colors.surface,
                              },
                            ]}
                          >
                            {match}%
                          </Text>
                        )}
                      </View>
                      <Text style={[type.footnote, { color: colors.muted }]}>
                        {[kit, done ? `Last done ${formatLastDone(done, today)}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                      {(trained.length > 0 || missing.length > 0) && (
                        <Text style={[type.caption, { color: colors.secondary }]}>
                          {trained
                            .map(({ muscle, sets }) => (sets < 1 ? `${muscle} ½` : muscle))
                            .join(' · ')}
                          {missing.length > 0 && (
                            <Text
                              style={{ color: colors.muted, textDecorationLine: 'line-through' }}
                            >
                              {`${trained.length ? ' · ' : ''}${missing.join(' · ')}`}
                            </Text>
                          )}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ),
      )}
      {!shown.length && (
        <Text style={[type.callout, { color: colors.muted, textAlign: 'center' }]}>
          {alternatives.length ? 'No matches with this equipment' : 'No close alternatives'}
        </Text>
      )}
      <Button
        label="Browse all exercises"
        icon="search"
        variant="secondary"
        onPress={onBrowseAll}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8 },
  chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1 },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderWidth: 1 },
  optionCopy: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  match: { paddingHorizontal: 8, paddingVertical: 2, fontWeight: '700', overflow: 'hidden' },
});
