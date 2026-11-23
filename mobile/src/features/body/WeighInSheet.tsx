import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { prettyDate } from '../../../../frontend/src/appShared';
import {
  checkInEditPayload,
  weighInDraft,
  weighInPayload,
  type WeighInDraft,
} from '../../../../frontend/src/bodyCheckInForm';
import type { BodyCheckInPayload } from '../../../../frontend/src/bodyCheckInUndo';
import { nudgedBodyFat, nudgedBodyweightKg } from '../../../../frontend/src/homeStats';
import type { BodyMeasurement } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { useWeightUnit } from '../../data/queries';
import { Button } from '../../ui/components';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { bodyCheckInApi, refreshBodyMeasurements } from './bodyQueries';
import { DateField } from './DateField';
import { BodyFatStepper, WeightStepper } from './NumberStepper';

/** Saves a check-in for its day (the server keeps one per day) and refreshes every screen. */
export function useSaveCheckIn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: BodyCheckInPayload) => bodyCheckInApi.saveBodyMeasurement(payload),
    onSettled: () => refreshBodyMeasurements(client),
  });
}

/**
 * Logs a weigh-in, as the web's Log weigh-in dialog: it opens on today, and a day that already
 * has a check-in fills in its weight, body fat and note to update. With `editing` it changes one
 * check-in's weight and body fat instead, as a history row's Edit does.
 */
export function WeighInSheet({
  visible,
  measurements,
  editing,
  onClose,
}: {
  visible: boolean;
  measurements: BodyMeasurement[];
  editing: BodyMeasurement | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit check-in' : 'Log weigh-in'}
      kicker={editing ? prettyDate(editing.measurement_date).toUpperCase() : undefined}
    >
      {/* Mounted only while open, so it starts from today (or the edited check-in) each time. */}
      {visible && (
        <WeighInForm
          key={editing?.id ?? 'new'}
          measurements={measurements}
          editing={editing}
          onDone={onClose}
        />
      )}
    </Sheet>
  );
}

function WeighInForm({
  measurements,
  editing,
  onDone,
}: {
  measurements: BodyMeasurement[];
  editing: BodyMeasurement | null;
  onDone: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const unit = useWeightUnit();
  const save = useSaveCheckIn();
  const entryOn = (day: string) => measurements.find((item) => item.measurement_date === day);
  const [date, setDate] = useState(() => editing?.measurement_date ?? localDate());
  const [draft, setDraft] = useState<WeighInDraft>(() =>
    editing
      ? {
          weight: editing.weight_kg,
          bodyFat: editing.body_fat_pct == null ? '' : String(editing.body_fat_pct),
          notes: '',
        }
      : weighInDraft(entryOn(localDate())),
  );
  const [error, setError] = useState<string | null>(null);
  const existing = editing ?? entryOn(date);
  const latestKg = measurements[0]?.weight_kg ?? null;
  const latestFat = measurements.find((item) => item.body_fat_pct !== null)?.body_fat_pct ?? null;
  const change = (next: Partial<WeighInDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setError(null);
  };

  function chooseDate(next: string) {
    const entry = entryOn(next);
    // A typed weight carries over between empty days; a saved day's values never do.
    if (entry || entryOn(date)) setDraft(weighInDraft(entry));
    setDate(next);
    setError(null);
  }

  function submit() {
    const checked = editing
      ? checkInEditPayload(editing, draft.weight, draft.bodyFat, unit)
      : weighInPayload(date, draft, unit);
    if (checked.error !== null) {
      setError(checked.error);
      return;
    }
    save.mutate(checked.payload, {
      onSuccess: () => {
        onDone();
        showToast(existing ? 'Check-in updated' : 'Check-in saved');
      },
      onError: (reason) =>
        setError(reason instanceof Error ? reason.message : 'Could not save this measurement.'),
    });
  }

  return (
    <View style={{ gap: 16 }}>
      {!editing && <DateField label="Date" value={date} max={localDate()} onChange={chooseDate} />}
      <View style={{ gap: 6 }}>
        <Text style={[type.footnote, { color: colors.secondary }]}>Weight ({unit})</Text>
        <WeightStepper
          weightKg={draft.weight}
          unit={unit}
          disabled={save.isPending}
          onChange={(weight) => change({ weight })}
          onStep={(delta) =>
            change({ weight: nudgedBodyweightKg(draft.weight, latestKg ?? 88, delta, unit) })
          }
        />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[type.footnote, { color: colors.secondary }]}>Body fat %</Text>
        <BodyFatStepper
          value={draft.bodyFat === '' ? null : Number(draft.bodyFat)}
          disabled={save.isPending}
          onChange={(value) => change({ bodyFat: value === null ? '' : String(value) })}
          onStep={(delta) => change({ bodyFat: nudgedBodyFat(draft.bodyFat, latestFat, delta) })}
        />
      </View>
      {!editing && (
        <TextInput
          value={draft.notes}
          onChangeText={(notes) => change({ notes })}
          placeholder="Conditions or anything worth remembering…"
          placeholderTextColor={colors.muted}
          multiline
          accessibilityLabel="Notes"
          style={[
            type.body,
            styles.notes,
            { color: colors.text, backgroundColor: colors.surface2, borderRadius: radius.md },
          ]}
        />
      )}
      {error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {error}
        </Text>
      )}
      <Button
        label={
          save.isPending
            ? 'Saving…'
            : editing
              ? 'Save changes'
              : existing
                ? 'Update check-in'
                : 'Save check-in'
        }
        disabled={save.isPending}
        onPress={submit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  notes: { minHeight: 72, paddingHorizontal: 14, paddingVertical: 12, textAlignVertical: 'top' },
});
