import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  exerciseMuscleChoices,
  newExerciseDraft,
  prepareExerciseInput,
  type ExerciseCreationDraft,
} from '../../../../frontend/src/exerciseCreation';
import { similarExercises } from '../../../../frontend/src/exerciseSearch';
import { CATEGORY_LABELS } from '../../../../frontend/src/trainingSummary';
import type {
  Exercise,
  ExerciseCreateInput,
  WorkoutCategory,
} from '../../../../frontend/src/types';
import { Icon } from '../../ui/Icon';
import { PromptHost, showMenu } from '../../ui/prompts';
import { useTheme } from '../../ui/theme';

/**
 * A custom exercise, with the web's rules (frontend/src/exerciseCreation.ts): a name, a
 * category, strength or cardio, and target muscles with direct or partial credit (or a muscle
 * group for cardio). Exercises that look like the name are offered as they are typed, so the
 * library doesn't fill with duplicates.
 */
export function CreateExerciseSheet({
  visible,
  exercises,
  initialName,
  initialCategory,
  onCreate,
  onUseExisting,
  onClose,
}: {
  visible: boolean;
  exercises: Exercise[];
  initialName: string;
  initialCategory: WorkoutCategory | '';
  onCreate: (input: ExerciseCreateInput) => Promise<Exercise>;
  /** Picks an existing exercise suggested while the name is typed, or the one just created. */
  onUseExisting: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      {visible && (
        <CreateForm
          exercises={exercises}
          initialName={initialName}
          initialCategory={initialCategory}
          onCreate={onCreate}
          onUseExisting={onUseExisting}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function CreateForm({
  exercises,
  initialName,
  initialCategory,
  onCreate,
  onUseExisting,
  onClose,
}: {
  exercises: Exercise[];
  initialName: string;
  initialCategory: WorkoutCategory | '';
  onCreate: (input: ExerciseCreateInput) => Promise<Exercise>;
  onUseExisting: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ExerciseCreationDraft>(() =>
    newExerciseDraft(initialName, initialCategory),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = useMemo(() => similarExercises(exercises, draft.name), [exercises, draft.name]);
  const duplicate = matches.some(
    (exercise) =>
      exercise.name.trim().toLocaleLowerCase() === draft.name.trim().toLocaleLowerCase(),
  );
  const muscles = useMemo(() => exerciseMuscleChoices(exercises), [exercises]);
  const strength = draft.kind !== 'cardio' && draft.category !== 'cardio';
  const change = (values: Partial<ExerciseCreationDraft>) =>
    setDraft((current) => ({ ...current, ...values }));
  const changeCredit = (index: number, values: Partial<{ muscle_name: string; sets: 0.5 | 1 }>) =>
    setDraft((current) => ({
      ...current,
      muscle_set_credits: current.muscle_set_credits.map((item, i) =>
        i === index ? { ...item, ...values } : item,
      ),
    }));

  async function save() {
    if (saving || duplicate) return;
    setError(null);
    try {
      const input = prepareExerciseInput(draft, exercises);
      setSaving(true);
      const exercise = await onCreate(input);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onUseExisting(exercise);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the exercise.');
    } finally {
      setSaving(false);
    }
  }

  const box = [styles.field, { backgroundColor: colors.surface2, borderRadius: radius.md }];
  const field = [...box, type.body, { color: colors.text }];
  const label = [type.footnote, { color: colors.secondary, fontWeight: '600' as const }];
  const chip = (on: boolean) => [
    styles.chip,
    { backgroundColor: on ? colors.accent : colors.surface2, borderRadius: radius.pill },
  ];
  const chipText = (on: boolean) => [
    type.footnote,
    { color: on ? colors.onAccent : colors.text, fontWeight: '600' as const },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.page }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.bar, { paddingTop: Platform.OS === 'ios' ? 12 : insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          hitSlop={8}
          style={styles.barButton}
        >
          <Text style={[type.body, { color: colors.accentText }]}>Cancel</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
          New exercise
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save exercise"
          accessibilityState={{ disabled: saving || duplicate }}
          disabled={saving || duplicate}
          onPress={() => void save()}
          hitSlop={8}
          style={[styles.barButton, { alignItems: 'flex-end' }]}
        >
          <Text
            style={[
              type.body,
              { color: saving || duplicate ? colors.muted : colors.accentText, fontWeight: '700' },
            ]}
          >
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.group}>
          <Text style={label}>Name</Text>
          <TextInput
            value={draft.name}
            onChangeText={(name) => change({ name })}
            placeholder="Exercise name"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Exercise name"
            autoFocus
            maxLength={160}
            style={field}
          />
          {matches.length > 0 && (
            <View style={{ gap: 6 }}>
              {duplicate && (
                <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
                  Already in your library
                </Text>
              )}
              <View style={styles.wrap}>
                {matches.map((exercise) => (
                  <Pressable
                    key={exercise.id}
                    accessibilityRole="button"
                    onPress={() => onUseExisting(exercise)}
                    style={chip(false)}
                  >
                    <Text style={chipText(false)}>Use {exercise.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.group}>
          <Text style={label}>Category</Text>
          <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Category">
            {(Object.entries(CATEGORY_LABELS) as [WorkoutCategory, string][]).map(
              ([value, name]) => (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: draft.category === value }}
                  onPress={() =>
                    change({ category: value, kind: value === 'cardio' ? 'cardio' : 'strength' })
                  }
                  style={chip(draft.category === value)}
                >
                  <Text style={chipText(draft.category === value)}>{name}</Text>
                </Pressable>
              ),
            )}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={label}>Type</Text>
          <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Type">
            {(['strength', 'cardio'] as const).map((kind) => (
              <Pressable
                key={kind}
                accessibilityRole="radio"
                accessibilityState={{ selected: draft.kind === kind }}
                onPress={() => change({ kind })}
                style={chip(draft.kind === kind)}
              >
                <Text style={chipText(draft.kind === kind)}>
                  {kind === 'strength' ? 'Strength' : 'Cardio'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {strength ? (
          <View style={styles.group}>
            <Text style={label}>Target muscles</Text>
            {draft.muscle_set_credits.map((credit, index) => (
              <View key={index} style={styles.muscleRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Target muscle ${index + 1}: ${credit.muscle_name || 'Choose muscle'}`}
                  onPress={() =>
                    showMenu(
                      'Target muscle',
                      muscles
                        .filter(
                          (muscle) =>
                            !draft.muscle_set_credits.some(
                              (item, i) => i !== index && item.muscle_name === muscle,
                            ),
                        )
                        .map((muscle) => ({
                          label: muscle,
                          onPress: () => changeCredit(index, { muscle_name: muscle }),
                        })),
                    )
                  }
                  style={[...box, styles.select]}
                >
                  <Text
                    style={[type.body, { color: credit.muscle_name ? colors.text : colors.muted }]}
                    numberOfLines={1}
                  >
                    {credit.muscle_name || 'Choose muscle'}
                  </Text>
                  <Icon name="chevronDown" size={14} color={colors.muted} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Credit per working set ${index + 1}: ${credit.sets === 1 ? 'direct' : 'partial'}`}
                  onPress={() => changeCredit(index, { sets: credit.sets === 1 ? 0.5 : 1 })}
                  style={[chip(credit.sets === 1), styles.credit]}
                >
                  <Text style={chipText(credit.sets === 1)}>
                    {credit.sets === 1 ? 'Direct · 1' : 'Partial · ½'}
                  </Text>
                </Pressable>
                {draft.muscle_set_credits.length > 1 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove target muscle ${index + 1}`}
                    hitSlop={8}
                    onPress={() =>
                      setDraft((current) => ({
                        ...current,
                        muscle_set_credits: current.muscle_set_credits.filter(
                          (_, i) => i !== index,
                        ),
                      }))
                    }
                  >
                    <Icon name="close" size={16} color={colors.muted} />
                  </Pressable>
                )}
              </View>
            ))}
            {draft.muscle_set_credits.length < 6 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add muscle"
                onPress={() =>
                  setDraft((current) => ({
                    ...current,
                    muscle_set_credits: [
                      ...current.muscle_set_credits,
                      { muscle_name: '', sets: 0.5 },
                    ],
                  }))
                }
                style={styles.addMuscle}
              >
                <Icon name="plus" size={14} color={colors.accentText} />
                <Text style={[type.callout, { color: colors.accentText, fontWeight: '600' }]}>
                  Add muscle
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.group}>
            <Text style={label}>Muscle group</Text>
            <TextInput
              value={draft.muscle_group}
              onChangeText={(muscle_group) => change({ muscle_group })}
              placeholder="Cardio"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Muscle group"
              maxLength={100}
              style={field}
            />
          </View>
        )}

        <View style={styles.group}>
          <Text style={label}>Equipment</Text>
          <TextInput
            value={draft.equipment}
            onChangeText={(equipment) => change({ equipment })}
            placeholder="Optional"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Equipment"
            maxLength={100}
            style={field}
          />
        </View>
        {!!error && (
          <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
            {error}
          </Text>
        )}
      </ScrollView>
      <PromptHost />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  barButton: { minWidth: 72 },
  form: { padding: 16, gap: 20 },
  group: { gap: 8 },
  field: { paddingHorizontal: 12, paddingVertical: 10, minHeight: 44 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8 },
  muscleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  credit: { minWidth: 108, alignItems: 'center' },
  select: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addMuscle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
});
