import { useRouter } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cardioGoalStatus, trackedCardioGoals } from '../../../../frontend/src/cardioZones';
import type { CardioGoalCardSettings } from '../../../../frontend/src/homeLayout';
import {
  bodyweightTrendCaption,
  homeBodyweightStats,
  homeCardioGoals,
} from '../../../../frontend/src/homeStats';
import { localDate } from '../../../../frontend/src/utils';
import { weightFromKg, weightUnitName } from '../../../../frontend/src/weightUnits';
import { useDashboard, useWeightUnit } from '../../data/queries';
import { cardSurface } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { trainingRoute } from '../training/routes';
import { useBodyMeasurements } from '../body/bodyQueries';
import { Meter, Ring, Sparkline } from './Sparks';
import { useWeekStartDay } from './StatCards';

// The web's two half-width Home cards: cardio zone goals and the bodyweight trend.

function HalfCard({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.card, cardSurface(colors), pressed && { opacity: 0.7 }]}
    >
      {children}
    </Pressable>
  );
}

/** This week's cardio zone goals in the card's saved design, tracking one zone or all of them. */
export function CardioGoalCard({ settings }: { settings: CardioGoalCardSettings }) {
  const { colors, type } = useTheme();
  const router = useRouter();
  const today = localDate();
  const dashboard = useDashboard();
  const { goals, daysLeft } = homeCardioGoals(dashboard.data, today);
  const tracked = trackedCardioGoals(goals, settings);
  const single = tracked.length === 1 ? tracked[0] : null;
  const title = single ? `Zone ${single.zone} cardio` : 'Cardio zone goals';
  const status = dashboard.data ? cardioGoalStatus(tracked, daysLeft) : ' ';
  const goalLine = (goal: (typeof tracked)[number]) => (
    <Text style={[type.caption, type.number, { color: colors.secondary }]}>
      <Text style={{ color: goal.complete ? colors.good : colors.text, fontWeight: '700' }}>
        Zone {goal.zone}
      </Text>{' '}
      {goal.completed_minutes} / {goal.goal_minutes} min
    </Text>
  );
  return (
    <HalfCard
      label={`${title}. ${status}`}
      onPress={() => router.navigate(trainingRoute('cardio'))}
    >
      <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
        {title}
      </Text>
      {settings.style === 'list' ? (
        tracked.map((goal) => <View key={goal.zone}>{goalLine(goal)}</View>)
      ) : settings.style === 'ring' ? (
        single ? (
          <View style={styles.ringSingle}>
            <Ring
              value={single.completed_minutes}
              max={single.goal_minutes}
              size={64}
              label={`Zone ${single.zone} minutes this week`}
            >
              <Text style={[type.headline, type.number, { color: colors.text }]}>
                {single.completed_minutes}
              </Text>
            </Ring>
            <Text style={[type.caption, { color: colors.muted }]}>
              of {single.goal_minutes} min
            </Text>
          </View>
        ) : (
          <View style={styles.rings}>
            {tracked.map((goal) => (
              <View key={goal.zone} style={styles.ringItem}>
                <Ring
                  value={goal.completed_minutes}
                  max={goal.goal_minutes}
                  size={44}
                  label={`Zone ${goal.zone} minutes this week`}
                >
                  <Text style={[type.caption, { color: colors.text, fontWeight: '700' }]}>
                    Z{goal.zone}
                  </Text>
                </Ring>
                <Text style={[type.caption, type.number, { color: colors.muted }]}>
                  {goal.completed_minutes}/{goal.goal_minutes}
                </Text>
              </View>
            ))}
          </View>
        )
      ) : single ? (
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
            {goalLine(goal)}
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
  card: { flex: 1, minWidth: 0, padding: 14, gap: 6 },
  value: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  ringSingle: { alignItems: 'center', gap: 4, paddingVertical: 4 },
  rings: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  ringItem: { alignItems: 'center', gap: 2 },
  // The status sits at the foot of the card when the trend beside it is taller.
  foot: { marginTop: 'auto' },
});
