import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  averagePerWeek,
  consistencyWeeks,
  firstTrainingDay,
} from '../../../../../frontend/src/consistencyWeeks';
import { splitCalendarDays } from '../../../../../frontend/src/trainingSplit';
import { weekStartDayOf } from '../../../../../frontend/src/trainingSummary';
import type { SharedConsistency } from '../../../../../frontend/src/types';
import { localDate } from '../../../../../frontend/src/utils';
import { builtinTypeColors } from '../../../../../frontend/src/workoutTypes';
import { useTrainingPreferences } from '../../../data/queries';
import { Button, Card } from '../../../ui/components';
import { useTheme } from '../../../ui/theme';
import {
  calendarBounds,
  entriesByMonth,
  monthOf,
  monthsBetween,
  monthViews,
} from '../../training/calendarModel';
import { CalendarLegend, WorkoutCalendar } from '../../training/WorkoutCalendar';

/**
 * The web's Consistency card on a profile: 12-week streak, training days and weekly average,
 * above the member's read-only calendar with their split outlines and toggleable legend.
 */
export function ProfileConsistencyCard({
  consistency,
  isYou,
  selectedDate,
  onOpenDay,
}: {
  consistency: SharedConsistency;
  isYou: boolean;
  /** The day the history below is filtered to. */
  selectedDate: string | null;
  /** A trained day: the profile filters its history to it. */
  onOpenDay: (date: string) => void;
}) {
  const { colors, type } = useTheme();
  const router = useRouter();
  const preferences = useTrainingPreferences().data;
  const weekStartDay = weekStartDayOf(preferences?.week_start);
  const {
    current_streak: streak,
    heatmap,
    training_days: trainingDays,
    training_split: trainingSplit,
    workout_types: types,
  } = consistency;
  const today = localDate();
  const firstWorkout = firstTrainingDay(heatmap);
  const weeks = consistencyWeeks(firstWorkout, today);
  const bounds = calendarBounds(today, [firstWorkout]);
  const [month, setMonth] = useState(() => monthOf(today));
  const shownMonth =
    month < bounds.first ? bounds.first : month > bounds.last ? bounds.last : month;
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const categoryColors = builtinTypeColors(types);
  const splitDays = splitCalendarDays(trainingSplit, today, 42);
  const months = monthsBetween(bounds.first, bounds.last);
  const byMonth = entriesByMonth(heatmap);
  const viewFor = monthViews({
    byMonth,
    types,
    categoryColors,
    hidden,
    weekStartDay,
    today,
    splitDays,
  });
  const view = viewFor(shownMonth);

  return (
    <Card accessibilityLabel="Consistency">
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[type.cardTitle, { color: colors.text, flex: 1 }]}>
          Consistency
        </Text>
        <View style={styles.headerRight}>
          <Text style={[type.caption, { color: colors.muted }]}>Last 12 weeks</Text>
          {isYou && (
            <Button
              label="My splits"
              variant="link"
              size="small"
              onPress={() => router.push('/split')}
            />
          )}
        </View>
      </View>
      <View style={styles.stats}>
        <StatTile label="Streak" value={`${streak} ${streak === 1 ? 'day' : 'days'}`} />
        <StatTile label="Training days" value={String(trainingDays)} />
        <StatTile label="Avg / week" value={averagePerWeek(trainingDays, weeks)} />
      </View>
      <WorkoutCalendar
        months={months}
        month={shownMonth}
        viewFor={viewFor}
        onMonthChange={setMonth}
        selectedDate={selectedDate}
        readOnly
        onSelectDay={(day) => {
          if (day.entry) onOpenDay(day.date);
        }}
      />
      <CalendarLegend
        types={view.legend}
        categoryColors={categoryColors}
        hidden={hidden}
        minTargetHeight={44}
        onToggle={(id) =>
          setHidden((current) => {
            const next = new Set(current);
            if (!next.delete(id)) next.add(id);
            return next;
          })
        }
      />
    </Card>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.statTile} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.statValue, type.number, { color: colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stats: { flexDirection: 'row', gap: 10 },
  statTile: { flex: 1, gap: 4 },
  statValue: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
});
