import { useRouter } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { ActivityCardSettings } from '../../../../frontend/src/homeLayout';
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

/** The weekday the account's weeks start on, as the dashboard reports it. */
export function useWeekStartDay() {
  const data = useDashboard().data;
  return weekStartDayFrom(data?.weekly_sets?.week_start ?? data?.zone2?.week_start);
}

/** The last 12 weeks' workout and cardio counts, oldest first, as the stat cards chart them. */
export function useActivityWeeks() {
  const today = localDate();
  const history = useWorkoutHistory().data;
  const weekStartDay = useWeekStartDay();
  const weeks = useMemo(
    () => weeklyTrainingTotals(history ?? [], today, weekStartDay, 12),
    [history, today, weekStartDay],
  );
  return { weeks, haveWorkouts: (history?.length ?? 0) > 0 };
}

function useActivity(settings: { workoutWeeks: number; cardioWeeks: number }) {
  const dashboard = useDashboard();
  const { weeks, haveWorkouts } = useActivityWeeks();
  return homeActivityStats({ weeks, haveWorkouts, data: dashboard.data, ...settings });
}

/** Workouts this week, with the weekly bars and average over the card's saved weeks. */
export function WorkoutsStat({ settings }: { settings: ActivityCardSettings }) {
  const router = useRouter();
  const { weeks } = settings;
  const activity = useActivity({ workoutWeeks: weeks, cardioWeeks: weeks });
  return (
    <Stat
      label="Workouts"
      value={activity.workoutsThisWeek ?? '–'}
      caption={activityAverageLabel(activity.averageWorkouts, weeks)}
      onPress={() => router.navigate(trainingRoute('sessions'))}
    >
      <SparkBars
        values={activity.workoutHistory}
        label={`Workouts per week, last ${weeks} weeks`}
      />
    </Stat>
  );
}

/** Cardio sessions this week, with the weekly bars and average over the card's saved weeks. */
export function CardioSessionsStat({ settings }: { settings: ActivityCardSettings }) {
  const router = useRouter();
  const { weeks } = settings;
  const activity = useActivity({ workoutWeeks: weeks, cardioWeeks: weeks });
  return (
    <Stat
      label="Cardio sessions"
      value={activity.cardioSessionsThisWeek ?? '–'}
      caption={activityAverageLabel(activity.averageCardioSessions, weeks)}
      onPress={() => router.navigate(trainingRoute('cardio'))}
    >
      <SparkBars
        values={activity.cardioHistory}
        label={`Cardio sessions per week, last ${weeks} weeks`}
      />
    </Stat>
  );
}

/** The latest body weight, with its weekly averages. */
export function BodyweightStat() {
  const router = useRouter();
  const unit = useWeightUnit();
  const today = localDate();
  const measurements = useBodyMeasurements();
  const weekStartDay = useWeekStartDay();
  const checkIns = measurements.data;
  const body = useMemo(
    () => homeBodyweightStats(checkIns ?? [], today, weekStartDay),
    [checkIns, today, weekStartDay],
  );
  return (
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
  stat: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    gap: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  value: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
});
