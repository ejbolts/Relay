import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { saveBodyweightCheckInWith } from '../../../../frontend/src/bodyCheckInUndo';
import {
  checkInChange,
  checkInSavedMessage,
  homeBodyweightStats,
  nudgedBodyFat,
  nudgedBodyweightKg,
  quickCheckInEntry,
} from '../../../../frontend/src/homeStats';
import type { BodyMeasurement } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { weightFromKg, type WeightUnit } from '../../../../frontend/src/weightUnits';
import { useWeightUnit } from '../../data/queries';
import { Button, Card, CardHeader, errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { bodyCheckInApi, refreshBodyMeasurements, useBodyMeasurements } from '../body/bodyQueries';
import { BodyFatStepper, WeightStepper } from '../body/NumberStepper';
import { bodyIcons } from '../body/bodyIcons';
import { useWeekStartDay } from './StatCards';

/**
 * Home's Body weight check-in in the web's default style: today's weight and body fat with ±0.1
 * steppers and one Log (or Update) button. Saving shows an Undo toast that puts back the day's
 * previous check-in, or removes a new one (frontend/src/bodyCheckInUndo.ts).
 */
export function CheckInCard() {
  const today = localDate();
  const weekStartDay = useWeekStartDay();
  const measurements = useBodyMeasurements().data;
  const stats = useMemo(
    () => homeBodyweightStats(measurements ?? [], today, weekStartDay),
    [measurements, today, weekStartDay],
  );
  const weight = stats.today?.weight_kg ?? stats.latest?.weight_kg ?? null;
  const fat = stats.today?.body_fat_pct ?? stats.latestBodyFat ?? null;
  // Starts again from the saved values whenever they change, as the web's card does.
  return <CheckInForm key={`${today}:${weight}:${fat}`} stats={stats} today={today} />;
}

function CheckInForm({
  stats,
  today,
}: {
  stats: ReturnType<typeof homeBodyweightStats>;
  today: string;
}) {
  const { colors, type } = useTheme();
  const client = useQueryClient();
  const unit = useWeightUnit();
  const todayEntry: BodyMeasurement | null = stats.today;
  const latestKg = stats.latest?.weight_kg ?? null;
  const [weight, setWeight] = useState<number | null>(todayEntry?.weight_kg ?? latestKg);
  const [fat, setFat] = useState<number | null>(
    todayEntry?.body_fat_pct ?? stats.latestBodyFat ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const hasToday = todayEntry !== null && todayEntry.body_fat_pct !== null;

  async function save() {
    if (busy.current) return;
    const entry = quickCheckInEntry({
      weightKg: weight,
      bodyFat: fat ?? NaN,
      requireBodyFat: true,
      unit,
    });
    if (entry.error !== null) {
      setError(entry.error);
      return;
    }
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const undo = await saveBodyweightCheckInWith(
        bodyCheckInApi,
        todayEntry,
        today,
        entry.weightKg,
        fat!,
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshBodyMeasurements(client);
      showToast(checkInSavedMessage('combined'), {
        label: 'Undo',
        run: () =>
          void undo().then(
            () => refreshBodyMeasurements(client),
            (reason) => showToast(errorMessage(reason)),
          ),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save today’s weight.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <Card accessibilityLabel="Body weight check-in">
      <CardHeader
        title="Check-in"
        action={
          <Button
            label={hasToday ? 'Update' : 'Log'}
            accessibilityLabel={
              saving ? 'Saving check-in' : `${hasToday ? 'Update' : 'Log'} check-in`
            }
            icon="check"
            disabled={saving}
            onPress={() => void save()}
            style={styles.save}
          />
        }
      />
      <View style={{ gap: 8 }}>
        <View style={styles.heading}>
          <Text style={[type.footnote, { color: colors.secondary, fontWeight: '600' }]}>
            Weight
          </Text>
          <Status
            prior={
              stats.priorBodyweight === null ? null : weightFromKg(stats.priorBodyweight, unit)
            }
            today={todayEntry === null ? null : weightFromKg(todayEntry.weight_kg, unit)}
            unit={unit}
          />
        </View>
        <WeightStepper
          weightKg={weight}
          unit={unit}
          disabled={saving}
          onChange={(kg) => {
            setWeight(kg);
            setError(null);
          }}
          onStep={(delta) => {
            setWeight(nudgedBodyweightKg(weight, latestKg, delta, unit));
            setError(null);
          }}
        />
      </View>
      <View style={{ gap: 8 }}>
        <View style={styles.heading}>
          <Text style={[type.footnote, { color: colors.secondary, fontWeight: '600' }]}>
            Body fat
          </Text>
          <Status prior={stats.priorBodyFat} today={todayEntry?.body_fat_pct ?? null} unit="%" />
        </View>
        <BodyFatStepper
          value={fat}
          disabled={saving}
          onChange={(value) => {
            setFat(value);
            setError(null);
          }}
          onStep={(delta) => {
            setFat(
              Number(nudgedBodyFat(fat === null ? '' : String(fat), stats.latestBodyFat, delta)),
            );
            setError(null);
          }}
        />
      </View>
      {error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {error}
        </Text>
      )}
    </Card>
  );
}

/** "Last 84.2 kg" before today's check-in; after it, today's value and its change. */
function Status({
  prior,
  today,
  unit,
}: {
  prior: number | null;
  today: number | null;
  unit: WeightUnit | '%';
}) {
  const { colors, type } = useTheme();
  const format = (value: number) => `${value.toFixed(1)}${unit === '%' ? '%' : ` ${unit}`}`;
  const change = checkInChange(prior, today);
  const label = [
    ...(prior === null ? [] : [`Prior: ${format(prior)}`]),
    today === null ? 'Not logged today' : `Saved today: ${format(today)}`,
  ].join('; ');
  return (
    <View accessible accessibilityLabel={label} style={styles.status}>
      {today === null ? (
        <Text style={[type.caption, { color: colors.muted }]}>
          {prior === null ? 'Not logged today' : `Last ${format(prior)}`}
        </Text>
      ) : (
        <>
          {change !== null &&
            (change === 0 ? (
              <Text style={[type.caption, type.number, { color: colors.muted }]}>±0.0</Text>
            ) : (
              <View style={styles.status}>
                <Icon
                  name={change < 0 ? bodyIcons.down : bodyIcons.up}
                  size={10}
                  color={colors.muted}
                />
                <Text style={[type.caption, type.number, { color: colors.muted }]}>
                  {Math.abs(change).toFixed(1)}
                </Text>
              </View>
            ))}
          <Icon name="check" size={11} color={colors.good} />
          <Text style={[type.caption, type.number, { color: colors.good, fontWeight: '600' }]}>
            {format(today)}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  save: { minHeight: 34, paddingHorizontal: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
