import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  formatSharedBodyWeightChartValue,
  sharedBodyWeightChartPoints,
  sharedBodyWeightGoalPath,
} from '../../../../../frontend/src/sharedBodyWeightChart';
import {
  BODY_WEIGHT_CHART_DAYS,
  sharedBodyWeight,
  signedWeightChange,
} from '../../../../../frontend/src/sharedProfileDisplay';
import { dayMonth } from '../../../../../frontend/src/trainingSummary';
import type { SharedBodyMeasurement, SharedGoals } from '../../../../../frontend/src/types';
import { formatWeight } from '../../../../../frontend/src/weightUnits';
import { useWeightUnit } from '../../../data/queries';
import { Card, CardHeader } from '../../../ui/components';
import { useTheme } from '../../../ui/theme';
import { TrendPlot } from '../../body/BodyTrendChart';

/**
 * Shared profile body-weight card: latest reading, 90-day change, body fat when logged, and the
 * 90-day trend chart with any shared body-weight goal line or maintenance band.
 */
export function ProfileBodyWeightCard({
  measurements,
  goals,
}: {
  measurements: SharedBodyMeasurement[];
  goals: SharedGoals | null;
}) {
  const { colors, radius, type } = useTheme();
  const unit = useWeightUnit();
  const [selected, setSelected] = useState<number | null>(null);
  const summary = useMemo(() => sharedBodyWeight(measurements), [measurements]);
  const points = useMemo(
    () => (summary ? sharedBodyWeightChartPoints(summary.recent, unit) : []),
    [summary, unit],
  );
  const goalPath = useMemo(
    () =>
      summary && summary.recent.length > 1
        ? sharedBodyWeightGoalPath(
            goals,
            summary.recent[0].date,
            summary.recent[summary.recent.length - 1].date,
            unit,
          )
        : null,
    [goals, summary, unit],
  );
  const active = selected !== null && selected < points.length ? selected : null;

  return (
    <Card accessibilityLabel="Body weight">
      <CardHeader
        title="Body weight"
        detail={summary ? dayMonth(summary.latest.measurement_date) : undefined}
      />
      {!summary ? (
        <Text style={[type.callout, { color: colors.secondary }]}>No weigh-ins yet.</Text>
      ) : (
        <>
          <View style={styles.stats}>
            {[
              { label: 'Latest', value: formatWeight(summary.latest.weight_kg, unit, 1) },
              ...(summary.change !== null
                ? [
                    {
                      label: `${BODY_WEIGHT_CHART_DAYS} days`,
                      value: signedWeightChange(summary.change, unit),
                    },
                  ]
                : []),
              ...(summary.latestFat !== null
                ? [{ label: 'Body fat', value: `${summary.latestFat}%` }]
                : []),
            ].map((stat) => (
              <View
                key={stat.label}
                style={[
                  styles.statTile,
                  { backgroundColor: colors.surface2, borderRadius: radius.md },
                ]}
              >
                <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
                  {stat.label}
                </Text>
                <Text
                  style={[styles.statValue, type.number, { color: colors.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {stat.value}
                </Text>
              </View>
            ))}
          </View>
          {points.length > 1 && (
            <TrendPlot
              points={points}
              goal={goalPath}
              unit={unit}
              height={170}
              active={active}
              onSelect={setSelected}
              lineColor={colors.accent}
              formatValue={(value) => formatSharedBodyWeightChartValue(value, unit)}
              seriesLabel="Body weight"
              accessibilityLabel={`Body weight over the last ${BODY_WEIGHT_CHART_DAYS} days`}
              avoidLineOverlap
            />
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 10 },
  statTile: { flex: 1, gap: 4, padding: 12 },
  statValue: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
});
