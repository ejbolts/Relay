import { useRouter } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cardioGoalStatus, trackedCardioGoals } from '../../../../frontend/src/cardioZones';
import {
  bodyweightTrendCaption,
  homeBodyweightStats,
  homeCardioGoals,
} from '../../../../frontend/src/homeStats';
import { localDate } from '../../../../frontend/src/utils';
import { weightFromKg, weightUnitName } from '../../../../frontend/src/weightUnits';
import { useDashboard, useWeightUnit } from '../../data/queries';
import { useTheme } from '../../ui/theme';
import { trainingRoute } from '../training/routes';
import { useBodyMeasurements } from '../body/bodyQueries';
import { Meter, Sparkline } from './Sparks';
import { useWeekStartDay } from './StatCards';

/**
 * The web's two half-width Home cards side by side: cardio zone goals (its default progress
 * style, tracking every goal) and the bodyweight trend.
 */
export function HalfCards() {
  return (
    <View style={styles.row}>
      <CardioGoalCard />
      <BodyweightTrendCard />
    </View>
  );
}

function HalfCard({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, borderRadius: radius.card, borderColor: colors.line },
        pressed && { opacity: 0.7 },
      ]}
    >
      {children}
    </Pressable>
  );
}

export function CardioGoalCard() {
  const { colors, type } = useTheme();
  const router = useRouter();
  const today = localDate();
  const dashboard = useDashboard();
  const { goals, daysLeft } = homeCardioGoals(dashboard.data, today);
  // Home's default setting tracks every goal.
  const tracked = trackedCardioGoals(goals, { zone: null });
  const single = tracked.length === 1 ? tracked[0] : null;
  const title = single ? `Zone ${single.zone} cardio` : 'Cardio zone goals';
  const status = dashboard.data ? cardioGoalStatus(tracked, daysLeft) : ' ';
  return (
    <HalfCard
      label={`${title}. ${status}`}
      onPress={() => router.navigate(trainingRoute('cardio'))}
    >
      <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
        {title}
      </Text>
      {single ? (
        <>
          <Text style={[styles.value, type.number, { color: colors.text }]}>
            {single.completed_minutes}
            <Text style={[type.caption, { color: colors.muted }]}>
              {' '}
              / {single.goal_minutes} min
            </Text>
          </Text>
          <Meter
            value={single.completed_minutes}
            max={single.goal_minutes}
            label={`Zone ${single.zone} minutes this week`}
          />
        </>
      ) : (
        tracked.map((goal) => (
          <View key={goal.zone} style={{ gap: 4 }}>
            <Text style={[type.caption, type.number, { color: colors.secondary }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Zone {goal.zone}</Text>{' '}
              {goal.completed_minutes} / {goal.goal_minutes} min
            </Text>
            <Meter
              value={goal.completed_minutes}
              max={goal.goal_minutes}
              label={`Zone ${goal.zone} minutes this week`}
            />
          </View>
        ))
      )}
      <Text style={[type.caption, styles.foot, { color: colors.secondary }]}>{status}</Text>
    </HalfCard>
  );
}

export function BodyweightTrendCard() {
  const { colors, type } = useTheme();
  const router = useRouter();
  const unit = useWeightUnit();
  const today = localDate();
  const weekStartDay = useWeekStartDay();
  const measurements = useBodyMeasurements().data;
  const stats = useMemo(
    () => homeBodyweightStats(measurements ?? [], today, weekStartDay),
    [measurements, today, weekStartDay],
  );
  const caption = measurements
    ? bodyweightTrendCaption(stats.monthChange, measurements.length, unit)
    : ' ';
  const value = stats.latest ? weightFromKg(stats.latest.weight_kg, unit).toFixed(1) : '–';
  return (
    <HalfCard
      label={`Bodyweight: ${value} ${unit}. ${caption}`}
      onPress={() => router.navigate('/body')}
    >
      <Text style={[type.caption, { color: colors.muted }]}>Bodyweight</Text>
      <Text style={[styles.value, type.number, { color: colors.text }]}>
        {value}
        <Text style={[type.caption, { color: colors.muted }]}> {unit}</Text>
      </Text>
      <Sparkline
        values={stats.recentWeights.map((weight) => weightFromKg(weight, unit))}
        label={`Bodyweight in ${weightUnitName(unit)}, last 30 check-ins`}
        height={70}
        yAxis
      />
      <Text
        style={[
          type.caption,
          styles.foot,
          // A loss reads in green, as on the web.
          stats.monthChange !== null && stats.monthChange < 0
            ? { color: colors.good, fontWeight: '600' }
            : { color: colors.secondary },
        ]}
      >
        {caption}
      </Text>
    </HalfCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  card: { flex: 1, minWidth: 0, padding: 14, gap: 6, borderWidth: StyleSheet.hairlineWidth },
  value: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  // The status sits at the foot of the card when the trend beside it is taller.
  foot: { marginTop: 'auto' },
});
