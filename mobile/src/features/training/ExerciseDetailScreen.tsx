import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { prettyDate, RANGE_LABELS } from '../../../../frontend/src/appShared';
import { TIME_RANGE_OPTIONS, type TimeRange } from '../../../../frontend/src/dateRanges';
import { formatLastDone } from '../../../../frontend/src/exerciseLastDone';
import {
  personalBestProgressPoint,
  PROGRESS_METRICS,
  progressPointsForChart,
  type ProgressMetric,
} from '../../../../frontend/src/progressChart';
import { recordBadgeLabel } from '../../../../frontend/src/recordScope';
import { recordsForBlock } from '../../../../frontend/src/trainingBlocks';
import {
  dayMonth,
  groupByYear,
  isCountedRecord,
  shortDate,
} from '../../../../frontend/src/trainingSummary';
import type { ProgressPoint } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { formatWeight, weightFromKg } from '../../../../frontend/src/weightUnits';
import { useExercises, usePersonalRecords, useWeightUnit } from '../../data/queries';
import { Button, Card, CardHeader, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { trainingIcons } from './icons';
import { Badge, Divider, MoreButton, Note, Segmented, Stat } from './parts';
import { ProgressChart, type ChartPoint } from './ProgressChart';
import { useExerciseProgress } from './trainingQueries';

const SESSION_PAGE = 8;

/** An exercise's progress, as the web's exercise detail: chart, personal bests and sessions. */
export function ExerciseDetailScreen({ exerciseId }: { exerciseId: string }) {
  const { colors, space, type } = useTheme();
  const router = useRouter();
  const unit = useWeightUnit();
  const exercise = useExercises().data?.find((item) => item.id === exerciseId);
  const progress = useExerciseProgress(exerciseId);
  const allRecords = usePersonalRecords().data;
  const [metric, setMetric] = useState<ProgressMetric>('estimated_1rm');
  const [range, setRange] = useState<TimeRange>('3m');
  const [shownSessions, setShownSessions] = useState(SESSION_PAGE);
  const today = localDate();
  const points = useMemo(() => progress.data?.points ?? [], [progress.data]);
  const name = exercise?.name ?? progress.data?.exercise.name ?? 'Exercise';
  // The whole history's records, as the web shows them without a training block chosen.
  const records = useMemo(
    () =>
      recordsForBlock(allRecords ?? [], null).filter(
        (record) => record.exercise_id === exerciseId && isCountedRecord(record),
      ),
    [allRecords, exerciseId],
  );
  const recordWorkouts = useMemo(
    () => new Set(records.map((record) => record.workout_id)),
    [records],
  );

  const metricInfo = PROGRESS_METRICS.find((item) => item.value === metric)!;
  const inRange = progressPointsForChart(points, metric, range);
  const latest = inRange.at(-1) ?? null;
  const first = inRange[0] ?? null;
  const change = latest && first && latest !== first ? latest[metric] - first[metric] : null;
  const changePercent =
    change !== null && first && first[metric] > 0 ? (change / first[metric]) * 100 : null;
  const heaviest = personalBestProgressPoint(points, 'best_weight_kg');
  const bestEstimate = personalBestProgressPoint(points, 'estimated_1rm');
  const bestVolume = personalBestProgressPoint(points, 'volume_kg');
  const relativeBest = points.reduce<ProgressPoint | null>(
    (best, point) =>
      (point.relative_strength ?? 0) > (best?.relative_strength ?? 0) ? point : best,
    null,
  );
  const formatMetric = (value: number) =>
    metric === 'volume_kg'
      ? Math.round(value).toLocaleString('en-GB')
      : Number(value.toFixed(1)).toLocaleString('en-GB');
  const formatMetricKg = (value: number) => formatMetric(weightFromKg(value, unit));
  const chartPoints: ChartPoint[] = inRange.map((point) => ({
    date: point.workout_date,
    value: weightFromKg(point[metric], unit),
    id: point.workout_id,
    detail: `${formatWeight(point.best_weight_kg, unit)} × ${point.best_reps}${point.best_rpe === null ? '' : ` @ RPE ${point.best_rpe}`}`,
  }));
  const sessions = points.slice().reverse();
  const sessionCountByYear = new Map(
    groupByYear(sessions, (point) => point.workout_date).map((group) => [
      group.year,
      group.items.length,
    ]),
  );
  const meta = [
    exercise?.muscle_group,
    exercise?.equipment,
    progress.data ? `${points.length} ${points.length === 1 ? 'session' : 'sessions'}` : null,
    sessions[0] ? `Last done ${formatLastDone(sessions[0].workout_date, today)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.page }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          padding: space.lg,
          gap: space.lg,
          paddingBottom: space.xxl * 2,
        }}
        refreshControl={
          <RefreshControl
            refreshing={progress.isRefetching}
            onRefresh={() => void progress.refetch()}
          />
        }
      >
        {!!meta && <Text style={[type.footnote, { color: colors.secondary }]}>{meta}</Text>}
        {progress.isPending ? (
          <Loading label="Loading exercise progress" />
        ) : progress.isError ? (
          <Note
            action={
              <Button label="Retry" variant="secondary" onPress={() => void progress.refetch()} />
            }
          >
            Could not load exercise progress.
          </Note>
        ) : !points.length ? (
          <Note>Complete this exercise in a workout to start its progress graph.</Note>
        ) : (
          <>
            <Segmented
              accessibilityLabel="Progress metric"
              values={PROGRESS_METRICS.map((item) => item.label)}
              selectedIndex={PROGRESS_METRICS.findIndex((item) => item.value === metric)}
              onChange={(index) => setMetric(PROGRESS_METRICS[index].value)}
            />
            <Card accessibilityLabel={`${name} ${metricInfo.series}`}>
              <View style={{ gap: 2 }}>
                <Text style={[type.largeTitle, type.number, { color: colors.text }]}>
                  {latest ? formatMetricKg(latest[metric]) : '–'}
                  <Text style={[type.headline, { color: colors.muted }]}> {unit}</Text>
                </Text>
                <Text style={[type.footnote, { color: colors.secondary }]}>
                  {latest
                    ? `${metricInfo.series} · latest session ${shortDate(latest.workout_date)}`
                    : 'No sessions in this range'}
                </Text>
                {change !== null && first && (
                  <View style={styles.delta}>
                    <Icon
                      name={change >= 0 ? trainingIcons.up : trainingIcons.down}
                      size={12}
                      color={change > 0 ? colors.good : change < 0 ? colors.danger : colors.muted}
                    />
                    <Text
                      style={[
                        type.footnote,
                        type.number,
                        {
                          color:
                            change > 0 ? colors.good : change < 0 ? colors.danger : colors.muted,
                          fontWeight: '600',
                        },
                      ]}
                    >
                      {change >= 0 ? '+' : '−'}
                      {formatMetricKg(Math.abs(change))} {unit}
                      {changePercent !== null &&
                        ` (${change >= 0 ? '+' : '−'}${Math.abs(changePercent).toFixed(1)}%)`}{' '}
                      since {dayMonth(first.workout_date)}
                    </Text>
                  </View>
                )}
              </View>
              <Segmented
                accessibilityLabel="Exercise progress graph range"
                values={TIME_RANGE_OPTIONS.map((option) => RANGE_LABELS[option.value])}
                selectedIndex={TIME_RANGE_OPTIONS.findIndex((option) => option.value === range)}
                onChange={(index) => setRange(TIME_RANGE_OPTIONS[index].value)}
              />
              <ProgressChart
                points={chartPoints}
                label={`${name} ${metricInfo.series}`}
                unit={unit}
                markRecords={metric !== 'volume_kg'}
                formatValue={formatMetric}
              />
            </Card>
            <Card accessibilityLabel="Personal bests">
              <CardHeader title="Personal bests" />
              <View style={styles.stats}>
                <Stat
                  label="Heaviest set"
                  value={
                    heaviest
                      ? `${formatWeight(heaviest.best_weight_kg, unit)} × ${heaviest.best_reps}`
                      : '–'
                  }
                  detail={heaviest ? shortDate(heaviest.workout_date) : 'No sets yet'}
                />
                <Stat
                  label="Best est. 1RM"
                  value={formatWeight(progress.data.personal_best_estimated_1rm, unit, 1)}
                  detail={bestEstimate ? shortDate(bestEstimate.workout_date) : 'Epley'}
                />
                <Stat
                  label="Best session volume"
                  value={bestVolume ? formatWeight(bestVolume.volume_kg, unit, 0) : '–'}
                  detail={bestVolume ? shortDate(bestVolume.workout_date) : 'Working sets'}
                />
                <Stat
                  label="Relative strength"
                  value={
                    relativeBest?.relative_strength != null
                      ? `${relativeBest.relative_strength.toFixed(2)}× BW`
                      : '–'
                  }
                  detail={
                    relativeBest?.bodyweight_kg != null
                      ? `at ${formatWeight(relativeBest.bodyweight_kg, unit)} BW · ${shortDate(relativeBest.workout_date)}`
                      : 'No bodyweight recorded'
                  }
                />
              </View>
            </Card>
            <Card accessibilityLabel="Exercise session history">
              <CardHeader
                title="Sessions"
                action={
                  <Text style={[type.footnote, { color: colors.muted }]}>
                    Best set · {metricInfo.label}
                  </Text>
                }
              />
              {groupByYear(sessions.slice(0, shownSessions), (point) => point.workout_date).map(
                (group) => (
                  <View key={group.year} style={{ gap: 4 }}>
                    <View style={styles.year}>
                      <Text
                        style={[
                          type.callout,
                          type.number,
                          { color: colors.text, fontWeight: '700' },
                        ]}
                      >
                        {group.year}
                      </Text>
                      <Text style={[type.caption, { color: colors.muted }]}>
                        {sessionCountByYear.get(group.year)}{' '}
                        {sessionCountByYear.get(group.year) === 1 ? 'session' : 'sessions'}
                      </Text>
                    </View>
                    {group.items.map((point, index) => (
                      <View key={point.workout_id}>
                        {index > 0 && <Divider />}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`View ${name} in workout from ${prettyDate(point.workout_date)}`}
                          onPress={() =>
                            router.push({
                              pathname: '/training/session/[id]',
                              params: {
                                id: point.workout_id,
                                exercise: exerciseId,
                              },
                            })
                          }
                          style={({ pressed }) => [styles.session, pressed && { opacity: 0.6 }]}
                        >
                          <View style={styles.sessionCopy}>
                            <View style={styles.sessionDate}>
                              <Text style={[type.callout, { color: colors.text }]}>
                                {shortDate(point.workout_date)}
                              </Text>
                              {recordWorkouts.has(point.workout_id) && (
                                <Badge
                                  tone="gold"
                                  label={recordBadgeLabel(
                                    records.filter(
                                      (record) => record.workout_id === point.workout_id,
                                    ),
                                  )}
                                />
                              )}
                            </View>
                            <Text
                              style={[type.footnote, type.number, { color: colors.secondary }]}
                              numberOfLines={1}
                            >
                              {formatWeight(point.best_weight_kg, unit)} × {point.best_reps}
                              {point.best_rpe !== null ? ` @${point.best_rpe}` : ''}
                            </Text>
                          </View>
                          <Text
                            style={[
                              type.callout,
                              type.number,
                              { color: colors.text, fontWeight: '700' },
                            ]}
                          >
                            {formatMetricKg(point[metric])}
                          </Text>
                          <Icon name="chevronRight" size={12} color={colors.muted} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ),
              )}
              {sessions.length > shownSessions && (
                <MoreButton
                  label="Show more sessions"
                  onPress={() => setShownSessions(shownSessions + SESSION_PAGE)}
                />
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  delta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, columnGap: 12 },
  year: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  session: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
  },
  sessionCopy: { flex: 1, gap: 2 },
  sessionDate: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
