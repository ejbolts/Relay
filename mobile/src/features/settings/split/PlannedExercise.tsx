import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  REP_RANGE_PRESETS,
  repRangeKey,
  repRangeLabel,
} from '../../../../../frontend/src/repProgression';
import {
  atPlannedMinimum,
  canPlanMore,
  planFewer,
  planMore,
  plannedMinutes,
} from '../../../../../frontend/src/splitEditing';
import type { RepRange, RoutineMovement } from '../../../../../frontend/src/types';
import { Icon } from '../../../ui/Icon';
import { showMenu } from '../../../ui/prompts';
import { useTheme } from '../../../ui/theme';
import { CoachTarget } from '../../guides/GuideCoach';
import { StepButton } from './SplitParts';

export function PlannedExercise({
  movement,
  muscles,
  target,
  disabled,
  coachReps = false,
  onChange,
  onReplace,
}: {
  movement: RoutineMovement;
  muscles: string;
  target: string;
  disabled: boolean;
  /** The splits guide's rep range step points at this exercise's Reps. */
  coachReps?: boolean;
  onChange: (movement: RoutineMovement | null) => void;
  onReplace: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const name = movement.exercise.name;
  const cardio = movement.exercise.kind === 'cardio';
  const atMinimum = atPlannedMinimum(movement);
  const ranges: RepRange[] = [
    ...REP_RANGE_PRESETS,
    // A range saved elsewhere that is not one of the usual choices.
    ...(movement.rep_range &&
    !REP_RANGE_PRESETS.some((range) => repRangeKey(range) === repRangeKey(movement.rep_range))
      ? [movement.rep_range]
      : []),
  ];
  const current = repRangeKey(movement.rep_range);
  const chooseReps = () =>
    showMenu(`Rep range for ${name}`, [
      {
        label: current ? 'Any' : 'Any ✓',
        onPress: () => onChange({ ...movement, rep_range: null }),
      },
      ...ranges.map((range) => ({
        label: `${repRangeLabel(range)}${repRangeKey(range) === current ? ' ✓' : ''}`,
        onPress: () => onChange({ ...movement, rep_range: range }),
      })),
    ]);
  return (
    <View style={[styles.planned, { backgroundColor: colors.surface2, borderRadius: radius.md }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name} on ${target}. Options`}
          disabled={disabled}
          onPress={() =>
            showMenu(name, [
              { label: 'Replace exercise', onPress: onReplace },
              { label: `Remove from ${target}`, destructive: true, onPress: () => onChange(null) },
            ])
          }
          style={{ gap: 2 }}
        >
          <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]} numberOfLines={2}>
            {name}
          </Text>
          {!!muscles && (
            <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
              {muscles}
            </Text>
          )}
        </Pressable>
        {!cardio && (
          <CoachTarget id={coachReps && 'split.reps'} radius={8} style={styles.repsTarget}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Rep range for ${name} on ${target}: ${movement.rep_range ? repRangeLabel(movement.rep_range) : 'Any'}`}
              disabled={disabled}
              hitSlop={6}
              onPress={chooseReps}
              style={styles.reps}
            >
              <Text style={[type.footnote, { color: colors.accentText, fontWeight: '600' }]}>
                Reps {movement.rep_range ? repRangeLabel(movement.rep_range) : 'Any'}
              </Text>
              <Icon name="chevronDown" size={10} color={colors.accentText} />
            </Pressable>
          </CoachTarget>
        )}
      </View>
      <View style={styles.stepper}>
        <StepButton
          icon={atMinimum ? 'close' : 'minus'}
          label={
            atMinimum
              ? `Remove ${name} from ${target}`
              : cardio
                ? `5 fewer minutes of ${name} on ${target}`
                : `One fewer set of ${name} on ${target}`
          }
          disabled={disabled}
          fill={colors.surface}
          onPress={() => onChange(planFewer(movement))}
        />
        <Text
          accessibilityLabel={
            cardio ? `${plannedMinutes(movement)} minutes` : `${movement.sets.length} sets`
          }
          style={[type.callout, type.number, styles.count, { color: colors.text }]}
        >
          {cardio ? `${plannedMinutes(movement)} min` : movement.sets.length}
        </Text>
        <StepButton
          icon="plus"
          label={
            cardio
              ? `5 more minutes of ${name} on ${target}`
              : `One more set of ${name} on ${target}`
          }
          disabled={disabled || !canPlanMore(movement)}
          fill={colors.surface}
          onPress={() => onChange(planMore(movement))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  planned: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  repsTarget: { alignSelf: 'flex-start' },
  reps: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { minWidth: 44, textAlign: 'center', fontWeight: '700' },
});
