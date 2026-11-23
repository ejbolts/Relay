import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  goalMuscles,
  MUSCLE_SET_GOAL_ERROR,
  muscleGoalSavedMessage,
  validMuscleSetGoal,
} from '../../../../frontend/src/muscleGoalEditing';
import { useExercises, useTrainingPreferences } from '../../data/queries';
import { ErrorState, errorMessage, Loading } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { showToast, ToastHost } from '../../ui/Toast';
import { haptics } from '../../ui/haptics';
import { useSaveMuscleGoal } from './homeData';

/**
 * Each muscle's weekly set goal, as the web's muscle targets list edits them: every muscle an
 * exercise credits, with its own goal or the default. A goal saves when its field is left;
 * clearing it, or Default, returns the muscle to the default goal.
 */
export function MuscleGoalsScreen() {
  const { colors } = useTheme();
  const preferences = useTrainingPreferences();
  const exercises = useExercises();
  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      {preferences.isPending || exercises.isPending ? (
        <Loading label="Loading muscle goals" />
      ) : !preferences.data ? (
        <ErrorState
          message={errorMessage(preferences.error)}
          onRetry={() => void preferences.refetch()}
        />
      ) : (
        <GoalList
          defaultGoal={preferences.data.weekly_muscle_set_goal}
          goals={preferences.data.weekly_muscle_set_goals ?? {}}
          exercises={exercises.data ?? []}
        />
      )}
      <ToastHost bottom={24} />
    </View>
  );
}

function GoalList({
  defaultGoal,
  goals,
  exercises,
}: {
  defaultGoal: number;
  goals: Record<string, number>;
  exercises: NonNullable<ReturnType<typeof useExercises>['data']>;
}) {
  const { colors, type, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const save = useSaveMuscleGoal();
  // Only fields being typed in; the others show the saved goal.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const muscles = useMemo(() => goalMuscles(exercises, goals), [exercises, goals]);
  const custom = Object.keys(goals).length;

  const clearDraft = (muscle: string) => setDrafts((current) => without(current, muscle));
  const setError = (muscle: string, error: string | null) =>
    setErrors((current) => (error ? { ...current, [muscle]: error } : without(current, muscle)));

  async function commit(muscle: string, goal: number | null) {
    if (goal !== null && !validMuscleSetGoal(goal)) {
      setError(muscle, MUSCLE_SET_GOAL_ERROR);
      return;
    }
    setError(muscle, null);
    if ((goals[muscle] ?? null) === goal) {
      clearDraft(muscle);
      return;
    }
    try {
      await save.mutateAsync({ muscle, goal });
      clearDraft(muscle);
      haptics.selection();
      showToast(muscleGoalSavedMessage(muscle, goal));
    } catch (reason) {
      setError(muscle, errorMessage(reason));
    }
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 48 }}
    >
      <View style={styles.summary}>
        <Text style={[type.footnote, { color: colors.secondary, flex: 1 }]}>
          Default {defaultGoal} sets a week
        </Text>
        <Text style={[type.footnote, { color: colors.muted }]}>
          {custom ? `${custom} custom` : 'All use default'}
        </Text>
      </View>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.card }}>
        {muscles.map((muscle, index) => {
          const value =
            drafts[muscle] ?? (goals[muscle] === undefined ? '' : String(goals[muscle]));
          const error = errors[muscle];
          return (
            <View
              key={muscle}
              style={[
                styles.row,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.line,
                },
              ]}
            >
              <View style={styles.line}>
                <Text style={[type.body, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                  {muscle}
                </Text>
                <TextInput
                  accessibilityLabel={`${muscle} weekly set goal`}
                  value={value}
                  placeholder={String(defaultGoal)}
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  maxLength={4}
                  selectTextOnFocus
                  onChangeText={(text) => {
                    setDrafts((current) => ({ ...current, [muscle]: text.replace(/[^0-9]/g, '') }));
                    setError(muscle, null);
                  }}
                  onEndEditing={() => {
                    const text = drafts[muscle];
                    if (text !== undefined) void commit(muscle, text === '' ? null : Number(text));
                  }}
                  style={[
                    styles.input,
                    type.body,
                    type.number,
                    {
                      color: colors.text,
                      backgroundColor: colors.surface2,
                      borderRadius: radius.md,
                      borderColor: error ? colors.danger : 'transparent',
                    },
                  ]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Use default goal for ${muscle}`}
                  accessibilityState={{ disabled: goals[muscle] === undefined }}
                  disabled={goals[muscle] === undefined}
                  hitSlop={6}
                  onPress={() => {
                    clearDraft(muscle);
                    void commit(muscle, null);
                  }}
                  style={({ pressed }) => [
                    styles.reset,
                    (pressed || goals[muscle] === undefined) && {
                      opacity: goals[muscle] === undefined ? 0.35 : 0.6,
                    },
                  ]}
                >
                  <Text style={[type.footnote, { color: colors.accentText, fontWeight: '600' }]}>
                    Default
                  </Text>
                </Pressable>
              </View>
              {error && (
                <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
                  {error}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function without(record: Record<string, string>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  row: { paddingHorizontal: 16, paddingVertical: 10, gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    width: 64,
    height: 38,
    textAlign: 'center',
    textAlignVertical: 'center',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 0,
  },
  reset: { minWidth: 56, alignItems: 'flex-end' },
});
