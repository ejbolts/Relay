import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { MuscleSetsWeek } from '../../../../frontend/src/liveMuscleSets';
import {
  contributionDetail,
  MUSCLE_SET_GOAL_ERROR,
  MUSCLE_SET_GOAL_MAX,
  MUSCLE_SET_GOAL_MIN,
  muscleGoalSavedMessage,
  stepMuscleSetGoal,
  validMuscleSetGoal,
} from '../../../../frontend/src/muscleGoalEditing';
import { setCredits } from '../../../../frontend/src/muscleSetRows';
import type { MuscleSetGoals } from '../../../../frontend/src/muscleSetGoals';
import { isPendingWorkoutId } from '../../../../frontend/src/pendingWorkoutPreview';
import { shortDate } from '../../../../frontend/src/trainingSummary';
import { Button, errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { showToast } from '../../ui/Toast';
import { haptics } from '../../ui/haptics';
import { useSaveMuscleGoal } from './homeData';
import { HomeSheet, useCloseThen } from './HomeSheet';
import { Meter } from './Sparks';

type Muscle = MuscleSetsWeek['muscle_groups'][number];

/**
 * One muscle's week, as the web's contribution sheet shows it: its set credits against the goal,
 * which workouts and exercises supplied them (each opening its session), and Edit goal.
 */
export function MuscleContributionSheet({
  muscle,
  current,
  weekLabel,
  goal,
  defaultGoal,
  goals,
  liveWorkoutId = null,
  onOpenLive,
  onClose,
}: {
  muscle: Muscle | null;
  current: boolean;
  weekLabel: string;
  goal: number;
  defaultGoal: number;
  goals: MuscleSetGoals | undefined;
  /** The workout in progress's contribution id; its row opens the logger, as on the web. */
  liveWorkoutId?: string | null;
  onOpenLive?: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { closeThen, onDismiss } = useCloseThen(onClose);
  return (
    <HomeSheet
      visible={!!muscle}
      onClose={onClose}
      onDismiss={onDismiss}
      kicker={weekLabel.toUpperCase()}
      title={muscle?.muscle_group ?? ''}
      toasts
    >
      {muscle && (
        <MuscleWeek
          key={muscle.muscle_group}
          muscle={muscle}
          current={current}
          goal={goal}
          defaultGoal={defaultGoal}
          goals={goals}
          onOpenWorkout={(id) => {
            if (id === liveWorkoutId) closeThen(() => onOpenLive?.());
            else if (isPendingWorkoutId(id)) showToast('This workout is waiting to sync.');
            else
              closeThen(() => router.push({ pathname: '/training/session/[id]', params: { id } }));
          }}
        />
      )}
    </HomeSheet>
  );
}

function MuscleWeek({
  muscle,
  current,
  goal,
  defaultGoal,
  goals,
  onOpenWorkout,
}: {
  muscle: Muscle;
  current: boolean;
  goal: number;
  defaultGoal: number;
  goals: MuscleSetGoals | undefined;
  onOpenWorkout: (workoutId: string) => void;
}) {
  const { colors, type, radius } = useTheme();
  const save = useSaveMuscleGoal();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const contributions = muscle.contributions ?? [];
  const percentage = Math.round((muscle.raw_sets / goal) * 100);
  const custom = goals?.[muscle.muscle_group] !== undefined;

  async function saveGoal(value: number | null) {
    if (save.isPending) return;
    if (value !== null && !validMuscleSetGoal(value)) {
      setError(MUSCLE_SET_GOAL_ERROR);
      return;
    }
    setError(null);
    try {
      await save.mutateAsync({ muscle: muscle.muscle_group, goal: value });
      haptics.success();
      setEditing(false);
      showToast(muscleGoalSavedMessage(muscle.muscle_group, value));
    } catch (reason) {
      setError(errorMessage(reason) || 'Could not save the goal. Try again.');
    }
  }

  const step = (by: number) => {
    haptics.selection();
    setDraft(stepMuscleSetGoal(draft, goal, by));
    setError(null);
  };

  return (
    <>
      <View style={styles.total}>
        <Text style={[styles.big, type.number, { color: colors.text }]}>
          {setCredits(muscle.raw_sets)}
        </Text>
        <Text style={[type.footnote, { color: colors.secondary, flex: 1 }]}>
          set credits {current ? 'this week' : 'that week'}
        </Text>
        {!editing && (
          <Button
            label="Edit goal"
            accessibilityLabel={`Edit goal for ${muscle.muscle_group}`}
            icon="edit"
            variant="link"
            onPress={() => {
              setDraft(String(goal));
              setError(null);
              setEditing(true);
            }}
          />
        )}
      </View>
      <Meter
        value={Math.min(muscle.raw_sets, goal)}
        max={goal}
        label={`${muscle.muscle_group} weekly goal, ${setCredits(muscle.raw_sets)} of ${goal} sets`}
      />
      {editing ? (
        <View style={{ gap: 12 }}>
          <View style={styles.goalField}>
            <Text style={[type.callout, { color: colors.text, flex: 1 }]}>Weekly goal</Text>
            <StepButton
              icon="minus"
              label="One set fewer"
              disabled={save.isPending || Number(draft) <= MUSCLE_SET_GOAL_MIN}
              onPress={() => step(-1)}
            />
            <TextInput
              accessibilityLabel={`${muscle.muscle_group} weekly set goal`}
              value={draft}
              onChangeText={(text) => {
                setDraft(text.replace(/[^0-9]/g, ''));
                setError(null);
              }}
              editable={!save.isPending}
              keyboardType="number-pad"
              returnKeyType="done"
              maxLength={4}
              selectTextOnFocus
              onSubmitEditing={() => void saveGoal(draft === '' ? NaN : Number(draft))}
              style={[
                styles.input,
                type.headline,
                type.number,
                {
                  color: colors.text,
                  backgroundColor: colors.surface2,
                  borderRadius: radius.md,
                },
              ]}
            />
            <StepButton
              icon="plus"
              label="One set more"
              disabled={save.isPending || Number(draft) >= MUSCLE_SET_GOAL_MAX}
              onPress={() => step(1)}
            />
            <Text style={[type.footnote, { color: colors.secondary }]}>sets</Text>
          </View>
          {error && (
            <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
              {error}
            </Text>
          )}
          <View style={styles.actions}>
            {custom && (
              <Button
                label={`Use default (${defaultGoal})`}
                variant="link"
                disabled={save.isPending}
                onPress={() => void saveGoal(null)}
              />
            )}
            <View style={{ flex: 1 }} />
            <Button
              label="Cancel"
              variant="secondary"
              disabled={save.isPending}
              onPress={() => {
                setEditing(false);
                setError(null);
              }}
            />
            <Button
              label={save.isPending ? 'Saving…' : 'Save'}
              disabled={save.isPending}
              onPress={() => void saveGoal(draft === '' ? NaN : Number(draft))}
            />
          </View>
        </View>
      ) : (
        <View style={styles.goalLine}>
          <Text style={[type.footnote, type.number, { color: colors.secondary }]}>
            {setCredits(muscle.raw_sets)} of {goal} sets
          </Text>
          <Text style={[type.footnote, type.number, { color: colors.secondary }]}>
            {percentage}% of goal
          </Text>
        </View>
      )}
      {contributions.length ? (
        <View style={{ borderRadius: radius.lg, backgroundColor: colors.surface2 }}>
          {contributions.map((contribution, index) => (
            <Pressable
              key={`${contribution.workout_id}:${contribution.movement_id}`}
              accessibilityRole="button"
              accessibilityLabel={`View ${contribution.exercise_name} in ${contribution.workout_name}, ${shortDate(contribution.workout_date)}`}
              onPress={() => onOpenWorkout(contribution.workout_id)}
              style={({ pressed }) => [
                styles.contribution,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.line,
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>
                  {contribution.exercise_name}
                </Text>
                <Text style={[type.footnote, { color: colors.secondary }]}>
                  {contribution.workout_name} · {shortDate(contribution.workout_date)}
                </Text>
                <Text style={[type.caption, { color: colors.muted }]}>
                  {contributionDetail(contribution)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[type.headline, type.number, { color: colors.text }]}>
                  {setCredits(contribution.set_credits)}
                </Text>
                <Text style={[type.caption, { color: colors.muted }]}>
                  {contribution.set_credits === 1 ? 'set' : 'sets'}
                </Text>
              </View>
              <Icon name="chevronRight" size={12} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[type.footnote, { color: colors.muted }]}>
          {muscle.raw_sets > 0
            ? 'Refresh Home to load the contributing exercises.'
            : `No working sets for this muscle ${current ? 'this week' : 'that week'}.`}
        </Text>
      )}
    </>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'minus' | 'plus';
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
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        { backgroundColor: colors.surface2 },
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.6 },
      ]}
    >
      <Icon name={icon} size={16} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  total: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  big: { fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  goalLine: { flexDirection: 'row', justifyContent: 'space-between' },
  goalField: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    minWidth: 64,
    height: 40,
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingHorizontal: 8,
    paddingVertical: 0,
  },
  step: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contribution: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
});
