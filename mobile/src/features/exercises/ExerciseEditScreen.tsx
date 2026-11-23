import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { exerciseMuscleChoices } from '../../../../frontend/src/exerciseCreation';
import {
  canEditExerciseMuscles,
  exerciseEditChanges,
  exerciseEditCredits,
} from '../../../../frontend/src/exerciseEdit';
import { equipmentChoices } from '../../../../frontend/src/exerciseEquipment';
import type { Exercise, MuscleSetCreditInput } from '../../../../frontend/src/types';
import { useExercises } from '../../data/queries';
import { errorMessage, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { showMenu } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { FieldLabel, HeaderTextButton } from '../blocks/parts';
import { updateExercise } from './exerciseQueries';

/**
 * Edits a custom exercise's name, equipment and target muscles; its workouts, records and
 * photos follow. Only what changed is sent.
 */
export function ExerciseEditScreen({ exerciseId }: { exerciseId: string }) {
  const exercises = useExercises();
  const exercise = exercises.data?.find((item) => item.id === exerciseId);
  if (!exercise) return exercises.isPending ? <Loading label="Loading exercise" /> : null;
  return <EditForm key={exercise.id} exercise={exercise} exercises={exercises.data ?? []} />;
}

function EditForm({ exercise, exercises }: { exercise: Exercise; exercises: Exercise[] }) {
  const { colors, type, radius, space } = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const [name, setName] = useState(exercise.name);
  const [equipment, setEquipment] = useState(exercise.equipment ?? '');
  const editsMuscles = canEditExerciseMuscles(exercise);
  const [credits, setCredits] = useState<MuscleSetCreditInput[]>(() =>
    exerciseEditCredits(exercise),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const muscles = useMemo(() => exerciseMuscleChoices(exercises), [exercises]);
  const suggestions = useMemo(() => {
    const typed = equipment.trim().toLowerCase();
    return equipmentChoices(exercises)
      .filter((choice) => choice.toLowerCase() !== typed && choice.toLowerCase().includes(typed))
      .slice(0, 8);
  }, [exercises, equipment]);
  let changes: ReturnType<typeof exerciseEditChanges> = null;
  let invalid: string | null = null;
  try {
    changes = exerciseEditChanges(exercise, {
      name,
      equipment,
      ...(editsMuscles ? { muscle_set_credits: credits } : {}),
    });
  } catch (reason) {
    invalid = errorMessage(reason);
  }
  const changeCredit = (index: number, values: Partial<MuscleSetCreditInput>) =>
    setCredits((current) =>
      current.map((item, at) => (at === index ? { ...item, ...values } : item)),
    );

  async function save() {
    if (saving) return;
    if (invalid || !changes) {
      setError(invalid ?? 'Enter a name.');
      return;
    }
    if (!Object.keys(changes).length) {
      router.back();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateExercise(client, exercise.id, changes);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Exercise updated');
      router.back();
    } catch (reason) {
      setError(errorMessage(reason));
      setSaving(false);
    }
  }

  const field = [
    styles.field,
    type.body,
    { backgroundColor: colors.surface2, borderRadius: radius.md, color: colors.text },
  ];
  const pill = (on: boolean) => [
    styles.pill,
    { backgroundColor: on ? colors.accent : colors.surface2, borderRadius: radius.pill },
  ];
  const pillText = (on: boolean) => [
    type.footnote,
    { color: on ? colors.onAccent : colors.text, fontWeight: '600' as const },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: 'Edit exercise',
          headerRight: () => (
            <HeaderTextButton
              label="Save"
              accessibilityLabel="Save exercise"
              busy={saving}
              disabled={!name.trim()}
              onPress={() => void save()}
            />
          ),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.page }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxl * 2 }}
      >
        <View style={styles.group}>
          <FieldLabel>Name</FieldLabel>
          <TextInput
            accessibilityLabel="Name"
            value={name}
            maxLength={160}
            autoCorrect={false}
            editable={!saving}
            onChangeText={(value) => {
              setName(value);
              setError(null);
            }}
            style={field}
          />
        </View>
        <View style={styles.group}>
          <FieldLabel>Equipment</FieldLabel>
          <TextInput
            accessibilityLabel="Equipment"
            value={equipment}
            maxLength={100}
            autoCorrect={false}
            placeholder="None"
            placeholderTextColor={colors.muted}
            editable={!saving}
            onChangeText={(value) => {
              setEquipment(value);
              setError(null);
            }}
            style={field}
          />
          {suggestions.length > 0 && (
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.wrap}
            >
              {suggestions.map((choice) => (
                <Pressable
                  key={choice}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${choice}`}
                  onPress={() => setEquipment(choice)}
                  style={pill(false)}
                >
                  <Text style={pillText(false)}>{choice}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
        {editsMuscles && (
          <View style={styles.group}>
            <FieldLabel>Target muscles</FieldLabel>
            {credits.map((credit, index) => (
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
                            !credits.some(
                              (item, at) => at !== index && item.muscle_name === muscle,
                            ),
                        )
                        .map((muscle) => ({
                          label: muscle,
                          onPress: () => changeCredit(index, { muscle_name: muscle }),
                        })),
                    )
                  }
                  style={[
                    styles.select,
                    { backgroundColor: colors.surface2, borderRadius: radius.md },
                  ]}
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
                  style={[pill(credit.sets === 1), styles.credit]}
                >
                  <Text style={pillText(credit.sets === 1)}>
                    {credit.sets === 1 ? 'Direct · 1' : 'Partial · ½'}
                  </Text>
                </Pressable>
                {credits.length > 1 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove target muscle ${index + 1}`}
                    hitSlop={8}
                    onPress={() => setCredits((current) => current.filter((_, at) => at !== index))}
                  >
                    <Icon name="close" size={16} color={colors.muted} />
                  </Pressable>
                )}
              </View>
            ))}
            {credits.length < 6 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add muscle"
                onPress={() =>
                  setCredits((current) => [...current, { muscle_name: '', sets: 0.5 }])
                }
                style={styles.addMuscle}
              >
                <Icon name="plus" size={14} color={colors.accentText} />
                <Text style={[type.callout, { color: colors.accentText, fontWeight: '600' }]}>
                  Add muscle
                </Text>
              </Pressable>
            )}
            {!!changes?.muscle_set_credits && (
              <Text style={[type.footnote, { color: colors.secondary }]}>
                Its past sets will count towards the new muscles.
              </Text>
            )}
          </View>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
            {error}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  field: { paddingHorizontal: 12, paddingVertical: 10, minHeight: 44 },
  wrap: { flexDirection: 'row', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8 },
  muscleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  credit: { minWidth: 108, alignItems: 'center' },
  select: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    minHeight: 44,
  },
  addMuscle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
});
