import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { calendarDayLook, weekStripLabels } from '../../../../frontend/src/calendarDayLook';
import { calendarWeekdays } from '../../../../frontend/src/calendarRange';
import {
  addDays,
  parseLocalDate,
  weekStartDayFrom,
  weekStartFor,
} from '../../../../frontend/src/trainingSummary';
import type { HeatmapDay } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { useDashboard } from '../../data/queries';
import { Card, CardHeader, ErrorState, errorMessage, Loading } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { mixColor } from './color';
import { DayRing } from './DayRing';
import { useTypeColors } from './homeData';
import { prettyDate } from '../../../../frontend/src/appShared';

/**
 * This week's seven days as large tiles, each naming the workout types trained that day, as on
 * the web. Every day opens: a logged one its workouts, the others their plan or a new workout
 * (`onPressDay`); the live workout's day reopens the logger.
 */
export function ThisWeekCard({
  liveDate,
  onPressDay,
  onOpenLive,
}: {
  liveDate: string | null;
  onPressDay: (date: string, entry: HeatmapDay | undefined) => void;
  onOpenLive: () => void;
}) {
  const { colors, type } = useTheme();
  const dashboard = useDashboard();
  const { types, categoryColors } = useTypeColors();
  const today = localDate();
  const data = dashboard.data;
  const weekStartDay = weekStartDayFrom(data?.weekly_sets?.week_start ?? data?.zone2?.week_start);
  const entries = useMemo(
    () => new Map((data?.heatmap ?? []).map((entry) => [entry.workout_date, entry])),
    [data?.heatmap],
  );
  const weekStart = weekStartFor(today, weekStartDay);
  const letters = calendarWeekdays(weekStartDay);

  return (
    <Card>
      <CardHeader title="This week" />
      {dashboard.isPending ? (
        <Loading label="Loading this week" />
      ) : !data ? (
        <ErrorState
          message={errorMessage(dashboard.error)}
          onRetry={() => void dashboard.refetch()}
        />
      ) : (
        <View style={styles.strip} accessibilityLabel="This week">
          {Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).map((key, index) => {
            const entry = entries.get(key);
            const live = key === liveDate;
            const { dayTypes, ring } = calendarDayLook({
              date: key,
              today,
              entry,
              types,
              categoryColors,
            });
            const future = key > today;
            const label = live
              ? `Resume workout in progress for ${prettyDate(key)}`
              : entry
                ? `View ${entry.workout_count} ${entry.workout_count === 1 ? 'workout' : 'workouts'} for ${prettyDate(key)}`
                : `${prettyDate(key)}, no workouts`;
            return (
              <View key={key} style={styles.slot}>
                {key === today && (
                  <View
                    pointerEvents="none"
                    style={[styles.todayOutline, { borderColor: colors.text }]}
                  />
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: key === today }}
                  onPress={() => (live ? onOpenLive() : onPressDay(key, entry))}
                  style={({ pressed }) => [
                    styles.day,
                    future
                      ? { borderWidth: 1, borderColor: colors.lineStrong }
                      : { backgroundColor: live ? colors.accentSoft : colors.surface2 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  {!live && <DayRing colors={ring} radius={12} />}
                  <Text style={[styles.weekday, { color: colors.muted }]}>{letters[index]}</Text>
                  <Text
                    style={[
                      styles.date,
                      type.number,
                      { color: future ? colors.muted : colors.text },
                      future && { fontWeight: '500' },
                    ]}
                  >
                    {parseLocalDate(key).getDate()}
                  </Text>
                  <View style={styles.types}>
                    {live ? (
                      <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
                    ) : (
                      weekStripLabels(dayTypes, categoryColors).map((item) => (
                        <Text
                          key={item.id}
                          numberOfLines={1}
                          style={[
                            styles.typeName,
                            {
                              color: item.color
                                ? mixColor(item.color, colors.text, 0.65)
                                : colors.muted,
                            },
                          ]}
                        >
                          {item.text}
                        </Text>
                      ))
                    )}
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 6 },
  slot: { flex: 1, minWidth: 0 },
  todayOutline: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 15,
    borderWidth: 2,
  },
  day: {
    borderRadius: 12,
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 7,
    paddingHorizontal: 2,
  },
  weekday: { fontSize: 10, fontWeight: '600', lineHeight: 14 },
  date: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  types: { height: 24, alignSelf: 'stretch', alignItems: 'center', marginTop: 2 },
  typeName: { fontSize: 9, fontWeight: '600', lineHeight: 12, maxWidth: '100%' },
  liveDot: { width: 6, height: 6, borderRadius: 3, marginTop: 3 },
});
