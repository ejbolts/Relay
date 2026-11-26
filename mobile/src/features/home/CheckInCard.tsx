import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  saveBodyFatCheckInWith,
  saveBodyweightCheckInWith,
} from '../../../../frontend/src/bodyCheckInUndo';
import type { BodyCheckInSettings } from '../../../../frontend/src/homeLayout';
import {
  BODY_FAT_RANGE_ERROR,
  bodyCheckInView,
  checkInChange,
  checkInSavedMessage,
  homeBodyweightStats,
  homeCheckInMode,
  nudgedBodyFat,
  nudgedBodyweightKg,
  quickCheckInEntry,
  validBodyFat,
} from '../../../../frontend/src/homeStats';
import type { BodyMeasurement } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { weightFromKg, type WeightUnit } from '../../../../frontend/src/weightUnits';
import { useWeightUnit } from '../../data/queries';
import { Button, Card, CardHeader, errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { haptics } from '../../ui/haptics';
import { bodyCheckInApi, refreshBodyMeasurements, useBodyMeasurements } from '../body/bodyQueries';
import { BodyFatStepper, WeightStepper } from '../body/NumberStepper';
import { bodyIcons } from '../body/bodyIcons';
import { HomeHoldExempt } from './homeHold';
import { useWeekStartDay } from './StatCards';

/**
 * Home's Body weight check-in in its saved mode, as on the web: weight only, body fat only, or
 * both (the default) with ±0.1 steppers and one Log (or Update) button. Saving shows an Undo
 * toast that puts back the day's previous check-in (frontend/src/bodyCheckInUndo.ts).
 */
export function CheckInCard({ settings }: { settings: BodyCheckInSettings }) {
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
  return (
    <CheckInForm
      key={`${today}:${weight}:${fat}`}
      stats={stats}
      today={today}
      mode={homeCheckInMode(settings.mode)}
    />
  );
}

function CheckInForm({
  stats,
  today,
  mode,
}: {
  stats: ReturnType<typeof homeBodyweightStats>;
  today: string;
  mode: BodyCheckInSettings['mode'];
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
  const view = bodyCheckInView({
    mode,
    todayBodyweight: todayEntry?.weight_kg ?? null,
    todayBodyFat: todayEntry?.body_fat_pct ?? null,
  });
  const { hasToday } = view;

  async function save() {
    if (busy.current) return;
    let weightKg = 0;
    if (view.fatOnly) {
      if (!validBodyFat(fat ?? NaN)) {
        setError(BODY_FAT_RANGE_ERROR);
        return;
      }
    } else {
      const entry = quickCheckInEntry({
        weightKg: weight,
        bodyFat: fat ?? NaN,
        requireBodyFat: view.singleButton,
        unit,
      });
      if (entry.error !== null) {
        setError(entry.error);
        return;
      }
      weightKg = entry.weightKg;
    }
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const undo = view.fatOnly
        ? await saveBodyFatCheckInWith(bodyCheckInApi, todayEntry, today, fat!)
        : view.singleButton
          ? await saveBodyweightCheckInWith(bodyCheckInApi, todayEntry, today, weightKg, fat!)
          : await saveBodyweightCheckInWith(bodyCheckInApi, todayEntry, today, weightKg);
      haptics.success();
      await refreshBodyMeasurements(client);
      showToast(
        checkInSavedMessage(view.fatOnly ? 'fat' : view.singleButton ? 'combined' : 'weight'),
        {
          label: 'Undo',
          run: () =>
            void undo().then(
              () => refreshBodyMeasurements(client),
              (reason) => showToast(errorMessage(reason), undefined, { variant: 'error' }),
            ),
        },
      );
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
              saving ? `Saving ${view.saveKind}` : `${hasToday ? 'Update' : 'Log'} ${view.saveKind}`
            }
            size="small"
            loading={saving}
            onPress={() => void save()}
          />
        }
      />
      {view.showWeight && (
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
          <HomeHoldExempt>
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
          </HomeHoldExempt>
        </View>
      )}
      {view.showFat && (
        <View style={{ gap: 8 }}>
          <View style={styles.heading}>
            <Text style={[type.footnote, { color: colors.secondary, fontWeight: '600' }]}>
              Body fat
            </Text>
            <Status prior={stats.priorBodyFat} today={todayEntry?.body_fat_pct ?? null} unit="%" />
          </View>
          <HomeHoldExempt>
            <BodyFatStepper
              value={fat}
              disabled={saving}
              onChange={(value) => {
                setFat(value);
                setError(null);
              }}
              onStep={(delta) => {
                setFat(
                  Number(
                    nudgedBodyFat(fat === null ? '' : String(fat), stats.latestBodyFat, delta),
                  ),
                );
                setError(null);
              }}
            />
          </HomeHoldExempt>
        </View>
      )}
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
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
