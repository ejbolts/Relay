import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { prettyDate, RANGE_LABELS } from '../../../../frontend/src/appShared';
import { TIME_RANGE_OPTIONS, type TimeRange } from '../../../../frontend/src/dateRanges';
import { formatLastDone } from '../../../../frontend/src/exerciseLastDone';
import {
  exerciseProgressView,
  exerciseRecordWorkoutIds,
  rangeOutgrowsBlock,
} from '../../../../frontend/src/exerciseProgressScope';
import type { MachineView } from '../../../../frontend/src/machineWeights';
import {
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
import { localDate } from '../../../../frontend/src/utils';
import { formatWeight, weightFromKg } from '../../../../frontend/src/weightUnits';
import { useExercises, usePersonalRecords, useWeightUnit } from '../../data/queries';
import { Button, Card, CardHeader, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { useBlockScope } from '../blocks/blockQueries';
import { BlockScopeChip } from '../blocks/BlockScopeChip';
import { ExerciseOptionsMenu } from '../exercises/ExerciseOptionsMenu';
import { useScopedExerciseProgress, useWeightMapping } from '../exercises/exerciseQueries';
import { MachineFilter } from '../exercises/MachineFilter';
import { MergeNudge } from '../exercises/MergeNudge';
import { exerciseRoutes } from '../exercises/routes';
import { trainingIcons } from './icons';
import { Badge, Divider, MoreButton, Note, Segmented, Stat } from './parts';
import { ProgressChart, type ChartPoint } from './ProgressChart';

const SESSION_PAGE = 8;

/**
 * An exercise's progress, as the web's exercise detail: chart, personal bests and sessions, for
 * the chosen training block and machine. A custom exercise can be edited and merged, and any
 * exercise hidden, from the header's menu.
 */
export function ExerciseDetailScreen({ exerciseId }: { exerciseId: string }) {
  const { colors, space, type } = useTheme();
  const router = useRouter();
  const unit = useWeightUnit();
  const exercises = useExercises().data;
  const exercise = exercises?.find((item) => item.id === exerciseId);
  const blocks = useBlockScope();
  const block = blocks.block;
  const progress = useScopedExerciseProgress(exerciseId, block, blocks.known);
  const mapping = useWeightMapping(exerciseId).data ?? null;
  const allRecords = usePersonalRecords().data;
  const [metric, setMetric] = useState<ProgressMetric>('estimated_1rm');
  const [range, setRange] = useState<TimeRange>('3m');
  const [machine, setMachine] = useState<MachineView>('all');
  const [shownSessions, setShownSessions] = useState(SESSION_PAGE);
  // Only a pull shows the spinner; refreshes after a change happen quietly.
  const [refreshing, setRefreshing] = useState(false);
  const today = localDate();
  const name = exercise?.name ?? progress.data?.exercise.name ?? 'Exercise';
  // The chosen block's records; without a block, the whole history's.
  const records = useMemo(
    () =>
      recordsForBlock(allRecords ?? [], block).filter(
        (record) => record.exercise_id === exerciseId && isCountedRecord(record),
      ),
    [allRecords, block, exerciseId],
  );
  const recordWorkouts = useMemo(
    () => exerciseRecordWorkoutIds(allRecords ?? [], block, exerciseId),
    [allRecords, block, exerciseId],
  );
  const view = useMemo(
    () => exerciseProgressView(progress.data ?? null, mapping, machine, recordWorkouts),
    [progress.data, mapping, machine, recordWorkouts],
  );
  const { points, approx, referenceMachine } = view;

  const metricInfo = PROGRESS_METRICS.find((item) => item.value === metric)!;
  const inRange = progressPointsForChart(points, metric, range);
  const latest = inRange.at(-1) ?? null;
  const first = inRange[0] ?? null;
  const change = latest && first && latest !== first ? latest[metric] - first[metric] : null;
  const changePercent =
    change !== null && first && first[metric] > 0 ? (change / first[metric]) * 100 : null;
  const { heaviest, bestEstimate, bestVolume, relativeBest } = view;
  const formatMetric = (value: number) =>
    metric === 'volume_kg'
      ? Math.round(value).toLocaleString('en-GB')
      : Number(value.toFixed(1)).toLocaleString('en-GB');
  const formatMetricKg = (value: number) => formatMetric(weightFromKg(value, unit));
  const chartPoints: ChartPoint[] = inRange.map((point) => ({
    date: point.workout_date,
    value: weightFromKg(point[metric], unit),
    id: point.workout_id,
    detail: `${formatWeight(point.raw_best_weight_kg, unit)} × ${point.best_reps}${point.best_rpe === null ? '' : ` @ RPE ${point.best_rpe}`}`,
  }));
  const sessions = points.slice().reverse();
  const sessionCountByYear = new Map(
    groupByYear(sessions, (point) => point.workout_date).map((group) => [
      group.year,
      group.items.length,
    ]),
  );
  // Every machine's sessions, whichever machine the chart shows.
  const allSessions = progress.data?.points ?? [];
  const lastDone = allSessions.at(-1)?.workout_date;
  const meta = [
    exercise?.muscle_group,
    exercise?.equipment,
    progress.data
      ? `${allSessions.length} ${allSessions.length === 1 ? 'session' : 'sessions'}`
      : null,
    lastDone ? `Last done ${formatLastDone(lastDone, today)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const chooseRange = (next: TimeRange) => {
    // Progress scoped to a block can't show more than the block, so a longer range shows all time.
    if (block && rangeOutgrowsBlock(next, block, today)) blocks.select('all');
    setRange(next);
  };
  const scopeChip = block ? (
    <BlockScopeChip block={block} config={blocks.config} onClear={() => blocks.select('all')} />
  ) : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: name,
          headerRight: exercise ? () => <ExerciseOptionsMenu exercise={exercise} /> : undefined,
        }}
      />
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
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void progress.refetch().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        {!!meta && <Text style={[type.footnote, { color: colors.secondary }]}>{meta}</Text>}
        {exercise?.is_custom && exercises && (
          <MergeNudge
            key={exercise.id}
            exercise={exercise}
            exercises={exercises}
            onMerge={(target) => router.push(exerciseRoutes.merge(exercise.id, target))}
          />
        )}
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
          <Note
            action={
              block ? (
                <Button
                  label="Show all time"
                  variant="secondary"
                  onPress={() => blocks.select('all')}
                />
              ) : undefined
            }
          >
            {block
              ? `No sessions in ${block.name}.`
              : 'Complete this exercise in a workout to start its progress graph.'}
          </Note>
        ) : (
          <>
            <Segmented
              accessibilityLabel="Progress metric"
              values={PROGRESS_METRICS.map((item) => item.label)}
              selectedIndex={PROGRESS_METRICS.findIndex((item) => item.value === metric)}
              onChange={(index) => setMetric(PROGRESS_METRICS[index].value)}
            />
            <MachineFilter
              machines={view.machineOptions}
              mapping={mapping}
              view={view.view}
              onChange={setMachine}
              onNormalise={() => router.push(exerciseRoutes.machineWeights(exerciseId))}
            />
            <Card accessibilityLabel={`${name} ${metricInfo.series}`}>
              <View style={{ gap: 2 }}>
                <Text style={[type.largeTitle, type.number, { color: colors.text }]}>
                  {latest ? `${approx}${formatMetricKg(latest[metric])}` : '–'}
                  <Text style={[type.headline, { color: colors.muted }]}> {unit}</Text>
                </Text>
                <Text style={[type.footnote, { color: colors.secondary }]}>
                  {latest
                    ? `${metricInfo.series}${referenceMachine ? ` in ${referenceMachine.caption} weights` : ''} · latest session ${shortDate(latest.workout_date)}`
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
                {scopeChip && <View style={{ marginTop: 8 }}>{scopeChip}</View>}
              </View>
              <Segmented
                accessibilityLabel="Exercise progress graph range"
                values={TIME_RANGE_OPTIONS.map((option) => RANGE_LABELS[option.value])}
                selectedIndex={TIME_RANGE_OPTIONS.findIndex((option) => option.value === range)}
                onChange={(index) => chooseRange(TIME_RANGE_OPTIONS[index].value)}
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
                      ? `${approx}${formatWeight(heaviest.best_weight_kg, unit)} × ${heaviest.best_reps}`
                      : '–'
                  }
                  detail={heaviest ? shortDate(heaviest.workout_date) : 'No sets yet'}
                />
                <Stat
                  label="Best est. 1RM"
                  value={`${approx}${formatWeight(view.bestEstimatedOneRepMax, unit, 1)}`}
                  detail={bestEstimate ? shortDate(bestEstimate.workout_date) : 'Epley'}
                />
                <Stat
                  label="Best session volume"
                  value={
                    bestVolume ? `${approx}${formatWeight(bestVolume.volume_kg, unit, 0)}` : '–'
                  }
                  detail={bestVolume ? shortDate(bestVolume.workout_date) : 'Working sets'}
                />
                <Stat
                  label="Relative strength"
                  value={
                    relativeBest?.relative_strength != null
                      ? `${approx}${relativeBest.relative_strength.toFixed(2)}× BW`
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
                              {view.recordIds.has(point.workout_id) && (
                                <Badge
                                  tone="gold"
                                  label={
                                    view.defaultView
                                      ? recordBadgeLabel(
                                          records.filter(
                                            (record) => record.workout_id === point.workout_id,
                                          ),
                                        )
                                      : 'PR'
                                  }
                                />
                              )}
                            </View>
                            <Text
                              style={[type.footnote, type.number, { color: colors.secondary }]}
                              numberOfLines={1}
                            >
                              {formatWeight(point.raw_best_weight_kg, unit)} × {point.best_reps}
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
                            {approx}
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
