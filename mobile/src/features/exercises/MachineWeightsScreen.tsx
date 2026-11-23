import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  pairFactor,
  progressViewPoints,
  recentSessionCounts,
  recommendedReferenceId,
  suggestFactors,
  withReference,
} from '../../../../frontend/src/machineWeights';
import {
  BLANK_PAIR,
  baseWeight,
  inLikelyRange,
  liveMapping,
  machineWeightsLayout,
  pairForFactor,
  pairTexts,
  pairWithMachineWeight,
  parsedMapping,
  sessionCount,
  suggestionLabel,
  toggledNormalise,
  withSuggestions,
  type PairText,
} from '../../../../frontend/src/machineWeightsForm';
import type {
  ExerciseProgress,
  MachineWeight,
  WeightMapping,
} from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { weightFromKg, type WeightUnit } from '../../../../frontend/src/weightUnits';
import { useAuthorisedImage } from '../../data/authorisedImage';
import { useWeightUnit } from '../../data/queries';
import { Button, Card, ErrorState, errorMessage, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { HeaderTextButton } from '../blocks/parts';
import { ProgressChart, type ChartPoint } from '../training/ProgressChart';
import { useScopedExerciseProgress, useWeightMapping, saveWeightMapping } from './exerciseQueries';
import { FactorSlider } from './FactorSlider';

const HELP = [
  'All machines shows every session in the reference machine’s weights. Each pair shows what your weight on a machine equals on the reference. Drag the slider, or change either weight, and watch the preview.',
  'Suggested matches compare the est. 1RM from each session’s weight and reps with the reference machine’s trend around that date. A machine with too few sessions near the reference’s gets an estimate instead, with a wider likely range.',
  'Sessions without a machine count as the reference. Logged sets and History keep the weights you entered.',
].join('\n\n');

/**
 * Choose a reference machine and how each other machine's weights compare with it, so the
 * exercise's All machines progress reads in one machine's weights. Suggestions come from the
 * exercise's whole history, whichever training block progress shows.
 */
export function MachineWeightsScreen({ exerciseId }: { exerciseId: string }) {
  const progress = useScopedExerciseProgress(exerciseId, null, true);
  const mapping = useWeightMapping(exerciseId);
  const unit = useWeightUnit();
  const failed = progress.error ?? mapping.error;
  return (
    <>
      <Stack.Screen options={{ title: 'Machine weights' }} />
      {progress.data && mapping.data ? (
        <MachineWeightsEditor
          exerciseId={exerciseId}
          progress={progress.data}
          mapping={mapping.data}
          unit={unit}
        />
      ) : failed ? (
        <ErrorState
          message={errorMessage(failed)}
          onRetry={() => void Promise.all([progress.refetch(), mapping.refetch()])}
        />
      ) : (
        <Loading label="Loading machine weights" />
      )}
    </>
  );
}

function MachineWeightsEditor({
  exerciseId,
  progress,
  mapping,
  unit,
}: {
  exerciseId: string;
  progress: ExerciseProgress;
  mapping: WeightMapping;
  unit: WeightUnit;
}) {
  const { colors, type, radius, space } = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const [draft, setDraft] = useState(mapping);
  const [texts, setTexts] = useState(() => {
    const initial = pairTexts(mapping, unit);
    return mapping.enabled ? withSuggestions(initial, mapping, progress, unit) : initial;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { reference, tree, ordered } = machineWeightsLayout(draft);
  const recent = useMemo(() => recentSessionCounts(progress, localDate()), [progress]);
  const recommendedId = recommendedReferenceId(draft, recent);
  const suggestions = useMemo(
    () => suggestFactors(progress, draft.reference_machine_id),
    [progress, draft.reference_machine_id],
  );
  const live = useMemo(() => liveMapping(draft, texts, unit), [draft, texts, unit]);
  const showPreview = tree && progress.points.length > 1;
  const preview: ChartPoint[] = showPreview
    ? progressViewPoints(progress, live, 'all').map((point) => ({
        date: point.workout_date,
        value: weightFromKg(point.estimated_1rm, unit),
        id: point.workout_id,
        detail: '',
      }))
    : [];

  function setPair(machineId: string, text: PairText) {
    setTexts((current) => ({ ...current, [machineId]: text }));
    setErrors((current) => {
      const next = { ...current };
      delete next[machineId];
      return next;
    });
  }

  function chooseReference(machineId: string) {
    const parsed = parsedMapping(draft, texts, unit);
    setErrors(parsed.errors);
    if (!parsed.mapping) return;
    const next = withReference(parsed.mapping, machineId);
    setDraft(next);
    setTexts(withSuggestions(pairTexts(next, unit), next, progress, unit));
  }

  function toggle() {
    const next = toggledNormalise(draft, recommendedId);
    setDraft(next);
    if (next.enabled) setTexts((current) => withSuggestions(current, next, progress, unit));
  }

  async function save() {
    const parsed = parsedMapping(draft, texts, unit);
    setErrors(parsed.errors);
    if (!parsed.mapping || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveWeightMapping(client, exerciseId, parsed.mapping);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Machine weights saved');
      router.back();
    } catch (reason) {
      setSaveError(errorMessage(reason));
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderTextButton
              label="Save"
              accessibilityLabel="Save machine weights"
              busy={saving}
              onPress={() => void save()}
            />
          ),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.page }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 }}
      >
        <Text style={[type.footnote, { color: colors.secondary }]}>{progress.exercise.name}</Text>
        <View style={[styles.toggle, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
          <Text style={[type.body, { color: colors.text, fontWeight: '600', flex: 1 }]}>
            Normalise weights
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="About normalising weights"
            hitSlop={8}
            onPress={() => Alert.alert('Normalise weights', HELP)}
            style={[styles.help, { borderColor: colors.lineStrong }]}
          >
            <Text style={[type.caption, { color: colors.secondary, fontWeight: '700' }]}>?</Text>
          </Pressable>
          <Switch
            accessibilityLabel="Normalise weights"
            value={draft.enabled}
            onValueChange={toggle}
            trackColor={{ true: colors.accent, false: colors.surface3 }}
          />
        </View>
        {showPreview && reference && (
          <Card accessibilityLabel="Preview">
            <Text style={[type.footnote, { color: colors.secondary, fontWeight: '600' }]}>
              Preview · All machines ≈
            </Text>
            <ProgressChart
              points={preview}
              label={`${progress.exercise.name} est. 1RM in ${reference.caption} weights`}
              unit={unit}
              height={140}
              markRecords={false}
              formatValue={(value) => Number(value.toFixed(1)).toLocaleString('en-GB')}
            />
          </Card>
        )}
        {ordered.map((machine) => {
          const isReference = tree && machine.id === draft.reference_machine_id;
          const text = texts[machine.id] ?? BLANK_PAIR;
          const liveMachine = live.machines.find((item) => item.id === machine.id)!;
          const factor = pairFactor(liveMachine);
          const suggestion = suggestions.get(machine.id);
          const base = baseWeight(progress, machine.id, unit);
          return (
            <Card key={machine.id} accessibilityLabel={machine.caption}>
              <View style={styles.machine}>
                <MachineThumb machine={machine} />
                <View style={{ flex: 1, gap: 2 }}>
                  {isReference && (
                    <Text style={[type.caption, { color: colors.gold, fontWeight: '700' }]}>
                      ★ Reference
                    </Text>
                  )}
                  <Text style={[type.headline, { color: colors.text }]} numberOfLines={1}>
                    {machine.caption}
                  </Text>
                  <Text style={[type.caption, { color: colors.secondary }]}>
                    {machine.workout_count} {machine.workout_count === 1 ? 'workout' : 'workouts'} ·{' '}
                    {recent.get(machine.id) ?? 0} in 3 months
                  </Text>
                  {tree && !isReference && machine.id === recommendedId && (
                    <Text style={[type.caption, { color: colors.accentText, fontWeight: '600' }]}>
                      Recommended reference
                    </Text>
                  )}
                </View>
                {tree && !isReference && (
                  <Button
                    label="Make reference"
                    variant="link"
                    accessibilityLabel={`Make ${machine.caption} the reference`}
                    onPress={() => chooseReference(machine.id)}
                  />
                )}
              </View>
              {tree && reference && !isReference && (
                <View style={{ gap: 10 }}>
                  <View style={styles.equation}>
                    <WeightBox
                      caption="This machine"
                      value={text.machine}
                      unit={unit}
                      label={`Weight on ${machine.caption}`}
                      invalid={!!errors[machine.id]}
                      onChange={(value) => setPair(machine.id, pairWithMachineWeight(text, value))}
                    />
                    <Text style={[type.title, { color: colors.muted }]}>=</Text>
                    <WeightBox
                      caption={`★ ${reference.caption}`}
                      value={text.reference}
                      unit={unit}
                      label={`Matching weight on ${reference.caption} for ${machine.caption}`}
                      invalid={!!errors[machine.id]}
                      onChange={(value) => setPair(machine.id, { ...text, reference: value })}
                    />
                  </View>
                  <View style={styles.slider}>
                    <FactorSlider
                      value={factor}
                      label={`Conversion for ${machine.caption}`}
                      onChange={(next) => setPair(machine.id, pairForFactor(text, next, base))}
                    />
                    <Text
                      style={[type.callout, type.number, { color: colors.text, fontWeight: '700' }]}
                    >
                      ×{factor.toFixed(2)}
                    </Text>
                  </View>
                  {suggestion && (
                    <View style={styles.suggestion}>
                      <Text style={[type.footnote, { color: colors.secondary, flex: 1 }]}>
                        {suggestionLabel(suggestion)} ×{suggestion.factor.toFixed(2)} ·{' '}
                        {sessionCount(suggestion.sessions)} ·{' '}
                        <Text
                          style={{
                            color: inLikelyRange(factor, suggestion) ? colors.good : colors.gold,
                            fontWeight: '600',
                          }}
                        >
                          {inLikelyRange(factor, suggestion) ? 'In range' : 'Outside range'}
                        </Text>
                      </Text>
                      {Math.abs(factor - suggestion.factor) >= 0.005 && (
                        <Button
                          label="Use"
                          variant="link"
                          accessibilityLabel={`Use ${suggestionLabel(suggestion).toLowerCase()} ×${suggestion.factor.toFixed(2)} for ${machine.caption}`}
                          onPress={() =>
                            setPair(machine.id, pairForFactor(text, suggestion.factor, base))
                          }
                        />
                      )}
                    </View>
                  )}
                  {!!errors[machine.id] && (
                    <Text
                      accessibilityRole="alert"
                      style={[type.footnote, { color: colors.danger }]}
                    >
                      {errors[machine.id]}
                    </Text>
                  )}
                </View>
              )}
            </Card>
          );
        })}
        {!!saveError && (
          <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
            {saveError}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function MachineThumb({ machine }: { machine: MachineWeight }) {
  const { colors } = useTheme();
  const uri = useAuthorisedImage(machine.thumbnail_url);
  return (
    <View style={[styles.thumb, { backgroundColor: colors.surface2 }]}>
      {uri ? (
        <Image source={{ uri }} style={styles.thumbImage} accessibilityIgnoresInvertColors />
      ) : (
        <Icon name="dumbbell" size={18} color={colors.muted} />
      )}
    </View>
  );
}

function WeightBox({
  caption,
  value,
  unit,
  label,
  invalid,
  onChange,
}: {
  caption: string;
  value: string;
  unit: WeightUnit;
  label: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const { colors, type, radius } = useTheme();
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <View
        style={[
          styles.box,
          {
            backgroundColor: colors.surface2,
            borderRadius: radius.md,
            borderColor: invalid ? colors.danger : 'transparent',
          },
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          selectTextOnFocus
          style={[type.headline, type.number, { color: colors.text, flex: 1, paddingVertical: 8 }]}
        />
        <Text style={[type.footnote, { color: colors.muted }]}>{unit}</Text>
      </View>
      <Text style={[type.caption, { color: colors.secondary }]} numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  help: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  machine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: { width: 48, height: 48 },
  equation: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  slider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
