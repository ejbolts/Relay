import { useRouter } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  activityAverageLabel,
  bodyweightStatCaption,
  homeActivityStats,
  homeBodyweightStats,
} from '../../../../frontend/src/homeStats';
import { weeklyTrainingTotals, weekStartDayFrom } from '../../../../frontend/src/trainingSummary';
import { localDate } from '../../../../frontend/src/utils';
import { weightFromKg } from '../../../../frontend/src/weightUnits';
import { useDashboard, useWeightUnit, useWorkoutHistory } from '../../data/queries';
import { useTheme } from '../../ui/theme';
import { trainingRoute } from '../training/routes';
import { useBodyMeasurements } from '../body/bodyQueries';
import { SparkBars, Sparkline } from './Sparks';

/** Weeks each activity card averages: the web's default Home layout (8). */
const ACTIVITY_WEEKS = 8;

/** The weekday the account's weeks start on, as the dashboard reports it. */
export function useWeekStartDay() {
  const data = useDashboard().data;
  return weekStartDayFrom(data?.weekly_sets?.week_start ?? data?.zone2?.week_start);
}

/**
 * Home's three stat cards in the web's default order: Workouts and Cardio sessions this week
 * with their weekly bars, and the latest body weight with its weekly averages.
 */
export function StatCards() {
  const router = useRouter();
  const unit = useWeightUnit();
  const today = localDate();
  const dashboard = useDashboard();
  const workouts = useWorkoutHistory();
  const measurements = useBodyMeasurements();
  const weekStartDay = useWeekStartDay();
  const history = workouts.data;
  const weeks = useMemo(
    () => weeklyTrainingTotals(history ?? [], today, weekStartDay, 12),
    [history, today, weekStartDay],
  );
  const activity = homeActivityStats({
    weeks,
    haveWorkouts: (history?.length ?? 0) > 0,
    data: dashboard.data,
    workoutWeeks: ACTIVITY_WEEKS,
    cardioWeeks: ACTIVITY_WEEKS,
  });
  const checkIns = measurements.data;
  const body = useMemo(
    () => homeBodyweightStats(checkIns ?? [], today, weekStartDay),
    [checkIns, today, weekStartDay],
  );
  return (
    <View style={styles.row}>
      <Stat
        label="Workouts"
        value={activity.workoutsThisWeek ?? '–'}
        caption={activityAverageLabel(activity.averageWorkouts, ACTIVITY_WEEKS)}
        onPress={() => router.navigate(trainingRoute('sessions'))}
      >
        <SparkBars
          values={activity.workoutHistory}
          label={`Workouts per week, last ${ACTIVITY_WEEKS} weeks`}
        />
      </Stat>
      <Stat
        label="Cardio sessions"
        value={activity.cardioSessionsThisWeek ?? '–'}
        caption={activityAverageLabel(activity.averageCardioSessions, ACTIVITY_WEEKS)}
        onPress={() => router.navigate(trainingRoute('cardio'))}
      >
        <SparkBars
          values={activity.cardioHistory}
          label={`Cardio sessions per week, last ${ACTIVITY_WEEKS} weeks`}
        />
      </Stat>
      <Stat
        label="Body weight"
        value={body.latest ? weightFromKg(body.latest.weight_kg, unit).toFixed(1) : '–'}
        unit={body.latest ? unit : undefined}
        caption={checkIns ? bodyweightStatCaption(body.monthChange, checkIns.length, unit) : ' '}
        onPress={() => router.navigate('/body')}
      >
        <Sparkline
          values={body.weeklyWeights}
          label="Average body weight per week, last 12 weeks"
          height={26}
        />
      </Stat>
    </View>
  );
}

function Stat({
  label,
  value,
  unit,
  caption,
  onPress,
  children,
}: {
  label: string;
  value: number | string;
  unit?: string;
  caption: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const { colors, type, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}, ${caption}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stat,
        { backgroundColor: colors.surface, borderRadius: radius.lg, borderColor: colors.line },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.value, type.number, { color: colors.text }]} numberOfLines={1}>
        {value}
        {!!unit && <Text style={[type.caption, { color: colors.muted }]}> {unit}</Text>}
      </Text>
      <Text style={[type.caption, { color: colors.secondary }]} numberOfLines={1}>
        {caption}
      </Text>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    gap: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  value: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
});
