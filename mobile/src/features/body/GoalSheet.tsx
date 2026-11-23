import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { prettyDate } from '../../../../frontend/src/appShared';
import { bodyGoalPayload, bodyGoalProgressPercent } from '../../../../frontend/src/bodyGoalForm';
import {
  bodyGoalKind,
  bodyGoalTarget,
  type BodyGoalKind,
} from '../../../../frontend/src/bodyMeasurementHistory';
import { nudgedBodyweightKg } from '../../../../frontend/src/homeStats';
import type { BodyWeightGoal, BodyWeightGoalInput } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { formatWeight } from '../../../../frontend/src/weightUnits';
import { useWeightUnit } from '../../data/queries';
import { Button } from '../../ui/components';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { Segmented } from '../training/parts';
import { bodyGoalApi, bodyKeys } from './bodyQueries';
import { DateField } from './DateField';
import { WeightStepper } from './NumberStepper';

const KINDS: { kind: BodyGoalKind; label: string }[] = [
  { kind: 'loss', label: 'Lose' },
  { kind: 'gain', label: 'Gain' },
  { kind: 'maintain', label: 'Maintain' },
];

/** What the goal sheet opens for: a new goal (optionally on Maintain), or a goal to edit. */
export type GoalRequest = { goal: BodyWeightGoal | null; kind?: BodyGoalKind };

/**
 * Sets or edits the bodyweight goal, as the web's goal dialog: a new goal chooses Lose, Gain or
 * Maintain and replaces the active one; an edit changes its target and date, or removes it.
 */
export function GoalSheet({
  request,
  goals,
  latestKg,
  onClose,
  onRemove,
}: {
  request: GoalRequest | null;
  goals: BodyWeightGoal[];
  latestKg: number | null;
  onClose: () => void;
  onRemove: (goal: BodyWeightGoal) => void;
}) {
  const editing = request?.goal ?? null;
  return (
    <Sheet
      visible={!!request}
      onClose={onClose}
      title={editing ? 'Edit goal' : 'Add bodyweight goal'}
    >
      {request && (
        <GoalForm
          key={editing?.id ?? `new-${request.kind ?? ''}`}
          request={request}
          goals={goals}
          latestKg={latestKg}
          onDone={onClose}
          onRemove={onRemove}
        />
      )}
    </Sheet>
  );
}

function GoalForm({
  request,
  goals,
  latestKg,
  onDone,
  onRemove,
}: {
  request: GoalRequest;
  goals: BodyWeightGoal[];
  latestKg: number | null;
  onDone: () => void;
  onRemove: (goal: BodyWeightGoal) => void;
}) {
  const { colors, type, radius } = useTheme();
  const unit = useWeightUnit();
  const client = useQueryClient();
  const editing = request.goal;
  const active = goals.find((goal) => goal.active) ?? null;
  // A new goal starts from the active one's kind and range; an edit from the goal itself.
  const from = editing ?? active;
  const [kind, setKind] = useState<BodyGoalKind>(
    request.kind ?? (from ? bodyGoalKind(from) : 'loss'),
  );
  const [target, setTarget] = useState<number | null>(editing?.target_weight_kg ?? null);
  const [minimum, setMinimum] = useState<number | null>(
    request.kind ? null : (from?.maintenance_min_kg ?? null),
  );
  const [maximum, setMaximum] = useState<number | null>(
    request.kind ? null : (from?.maintenance_max_kg ?? null),
  );
  const [date, setDate] = useState(editing?.target_date ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (payload: BodyWeightGoalInput) =>
      editing ? bodyGoalApi.update(editing.id, payload) : bodyGoalApi.create(payload),
    onSettled: () => client.invalidateQueries({ queryKey: bodyKeys.goals }),
  });
  const step = (value: number | null, set: (kg: number) => void) => (delta: number) => {
    set(nudgedBodyweightKg(value, latestKg, delta, unit));
    setError(null);
  };

  function submit() {
    const checked = bodyGoalPayload({
      kind,
      target,
      minimum,
      maximum,
      targetDate: date,
      latestKg,
      editing,
      today: localDate(),
      unit,
    });
    if (checked.error !== null) {
      setError(checked.error);
      return;
    }
    save.mutate(checked.payload, {
      onSuccess: () => {
        onDone();
        showToast(editing ? 'Goal saved' : 'Goal set');
      },
      onError: (reason) =>
        setError(reason instanceof Error ? reason.message : 'Could not save this target.'),
    });
  }

  const weightField = (label: string, value: number | null, set: (kg: number | null) => void) => (
    <View style={{ gap: 6 }}>
      <Text style={[type.footnote, { color: colors.secondary }]}>
        {label} ({unit})
      </Text>
      <WeightStepper
        weightKg={value}
        unit={unit}
        step={0.5}
        label={`${label} in ${unit}`}
        disabled={save.isPending}
        onChange={(kg) => {
          set(kg);
          setError(null);
        }}
        onStep={step(value, set)}
      />
    </View>
  );

  return (
    <View style={{ gap: 16 }}>
      {active && latestKg !== null && (
        <View
          style={[styles.progress, { backgroundColor: colors.surface2, borderRadius: radius.lg }]}
        >
          <Text style={[type.title, type.number, { color: colors.text }]}>
            {formatWeight(latestKg, unit)}
          </Text>
          <Text style={[type.footnote, { color: colors.secondary }]}>
            {bodyGoalKind(active) === 'maintain'
              ? `Maintaining ${bodyGoalTarget(active, unit)} until ${prettyDate(active.target_date)}`
              : `→ ${formatWeight(active.target_weight_kg, unit)} by ${prettyDate(active.target_date)}`}
          </Text>
          {bodyGoalKind(active) !== 'maintain' && (
            <View style={[styles.track, { backgroundColor: colors.surface3 }]}>
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: colors.accent,
                    width: `${bodyGoalProgressPercent(active, latestKg)}%`,
                  },
                ]}
              />
            </View>
          )}
        </View>
      )}
      {/* An edit changes the target and date; a new direction is a new goal. */}
      {!editing && (
        <Segmented
          accessibilityLabel="Goal"
          values={KINDS.map((item) => item.label)}
          selectedIndex={KINDS.findIndex((item) => item.kind === kind)}
          onChange={(index) => {
            setKind(KINDS[index].kind);
            setError(null);
          }}
        />
      )}
      {kind === 'maintain' ? (
        <>
          {weightField('Minimum', minimum, setMinimum)}
          {weightField('Maximum', maximum, setMaximum)}
        </>
      ) : (
        weightField('Target', target, setTarget)
      )}
      <DateField
        label={kind === 'maintain' ? 'Until' : 'Target date'}
        value={date}
        min={editing ? undefined : localDate()}
        onChange={(next) => {
          setDate(next);
          setError(null);
        }}
      />
      {error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {error}
        </Text>
      )}
      <Button
        label={save.isPending ? 'Saving…' : editing ? 'Save goal' : 'Set goal'}
        disabled={save.isPending}
        onPress={submit}
      />
      {editing && (
        <Pressable
          accessibilityRole="button"
          disabled={save.isPending}
          hitSlop={8}
          onPress={() => {
            onDone();
            onRemove(editing);
          }}
          style={({ pressed }) => [styles.remove, pressed && { opacity: 0.6 }]}
        >
          <Text style={[type.callout, { color: colors.danger, fontWeight: '600' }]}>
            Remove goal
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { padding: 14, gap: 6 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  fill: { height: 6, borderRadius: 3 },
  remove: { alignSelf: 'center', paddingVertical: 6 },
});
