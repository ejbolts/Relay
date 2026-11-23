import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { calendarWeekdays } from '../../../../../frontend/src/calendarRange';
import { splitCalendarMonths } from '../../../../../frontend/src/splitCalendar';
import { splitPreviewDayLabel } from '../../../../../frontend/src/splitEditing';
import {
  addDays,
  isoLocalDate,
  parseLocalDate,
  shortDate,
} from '../../../../../frontend/src/trainingSummary';
import {
  followsWorkouts,
  splitPreview,
  splitPreviewLabel,
} from '../../../../../frontend/src/trainingSplit';
import type { RoutineDay, TrainingSplit, WorkoutType } from '../../../../../frontend/src/types';
import { localDate } from '../../../../../frontend/src/utils';
import { useTrainingPreferences } from '../../../data/queries';
import { haptics } from '../../../ui/haptics';
import { Icon } from '../../../ui/Icon';
import { useTheme } from '../../../ui/theme';
import { settingsIcons } from '../icons';

/** A split's cycle as a row of coloured horizontal dashes, matching the web's split cards. */
export function SplitPattern({
  days,
  dashWidth = 24,
}: {
  days: Pick<RoutineDay, 'workout_type' | 'extra_workout_types'>[];
  dashWidth?: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.pattern} accessibilityElementsHidden importantForAccessibility="no">
      {days.map((day, index) => (
        <View
          key={index}
          style={[
            styles.dash,
            {
              width: dashWidth,
              backgroundColor: day.workout_type?.color ?? colors.surface3,
              borderWidth: day.workout_type ? 0 : 1,
              borderColor: colors.lineStrong,
            },
          ]}
        >
          {/* A mixed day splits its dash between its types' colours. */}
          {!!day.workout_type &&
            !!day.extra_workout_types?.length &&
            [day.workout_type, ...day.extra_workout_types].map((type) => (
              <View key={type.id} style={{ flex: 1, backgroundColor: type.color }} />
            ))}
        </View>
      ))}
    </View>
  );
}

/** Weekday and date, such as "Mon 24 Nov", in the phone's language. */
export function dayLabel(date: string, weekday: 'short' | 'long' = 'short') {
  return parseLocalDate(date).toLocaleDateString(undefined, {
    weekday,
    day: 'numeric',
    month: weekday === 'long' ? 'long' : 'short',
  });
}

/** Steps a date a day at a time, as the web's date field picks it. */
export function DateStepper({
  label,
  date,
  onChange,
  disabled,
}: {
  label: string;
  date: string;
  onChange: (date: string) => void;
  disabled?: boolean;
}) {
  const { colors, type } = useTheme();
  const step = (days: number) => {
    haptics.selection();
    onChange(addDays(date, days));
  };
  const today = localDate();
  return (
    <View style={styles.stepperRow}>
      <Text style={[type.body, { color: colors.text, flex: 1 }]}>{label}</Text>
      <StepButton
        icon="chevronLeft"
        label={`${label} a day earlier`}
        disabled={disabled}
        onPress={() => step(-1)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${dayLabel(date, 'long')}${date === today ? ', today' : ''}. Set to today`}
        disabled={disabled || date === today}
        onPress={() => onChange(today)}
        style={styles.stepperValue}
      >
        <Text style={[type.body, type.number, { color: colors.text, fontWeight: '600' }]}>
          {date === today ? 'Today' : dayLabel(date)}
        </Text>
      </Pressable>
      <StepButton
        icon="chevronRight"
        label={`${label} a day later`}
        disabled={disabled}
        onPress={() => step(1)}
      />
    </View>
  );
}

export function StepButton({
  icon,
  label,
  onPress,
  disabled,
  fill,
}: {
  icon:
    | 'chevronLeft'
    | 'chevronRight'
    | 'minus'
    | 'plus'
    | 'close'
    | typeof settingsIcons.calendar
    | typeof settingsIcons.list;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** The circle's colour, when the default would match what is behind it. */
  fill?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepButton,
        { backgroundColor: fill ?? colors.surface2 },
        (pressed || disabled) && { opacity: disabled ? 0.35 : 0.6 },
      ]}
    >
      <Icon name={icon} size={14} color={colors.text} />
    </Pressable>
  );
}

/** The active split's next seven days, a week at a time, as the web's split card shows them. */
export function SplitPreview({ split, types }: { split: TrainingSplit; types: WorkoutType[] }) {
  const { colors, type } = useTheme();
  const [week, setWeek] = useState(0);
  const [calendar, setCalendar] = useState(false);
  const today = localDate();
  const firstDay = followsWorkouts(split)
    ? (split.next_date ?? split.start_date)
    : split.start_date;
  const start = addDays(firstDay > today ? firstDay : today, week * 7);
  const days = splitPreview(split, start);
  const colourFor = (id: string | null | undefined) =>
    types.find((item) => item.id === id)?.color ?? colors.deemph;
  const rangeLabel = `${shortDate(start)} – ${shortDate(addDays(start, 6))}`;
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.previewHeader}>
        <Text style={[type.cardTitle, { color: colors.text }]} numberOfLines={1}>
          {calendar ? 'Split calendar' : 'Next 7 days'}
        </Text>
        <View style={styles.previewControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={calendar ? 'Show next 7 days' : 'Show two-month calendar'}
            accessibilityState={{ selected: calendar }}
            hitSlop={6}
            onPress={() => {
              haptics.selection();
              setCalendar(!calendar);
            }}
            style={({ pressed }) => [
              styles.iconControl,
              calendar && { backgroundColor: colors.accentSoft },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Icon
              name={calendar ? settingsIcons.list : settingsIcons.calendar}
              size={15}
              color={calendar ? colors.accentText : colors.secondary}
            />
          </Pressable>
          {!calendar && (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous preview week"
                accessibilityState={{ disabled: week === 0 }}
                disabled={week === 0}
                hitSlop={6}
                onPress={() => {
                  haptics.selection();
                  setWeek((value) => Math.max(0, value - 1));
                }}
                style={({ pressed }) => [
                  styles.iconControl,
                  (pressed || week === 0) && { opacity: week === 0 ? 0.3 : 0.6 },
                ]}
              >
                <Icon name="chevronLeft" size={14} color={colors.secondary} />
              </Pressable>
              <Text
                style={[type.caption, type.number, { color: colors.muted, flexShrink: 1 }]}
                numberOfLines={1}
              >
                {rangeLabel}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next preview week"
                hitSlop={6}
                onPress={() => {
                  haptics.selection();
                  setWeek((value) => value + 1);
                }}
                style={({ pressed }) => [styles.iconControl, pressed && { opacity: 0.6 }]}
              >
                <Icon name="chevronRight" size={14} color={colors.secondary} />
              </Pressable>
            </>
          )}
        </View>
      </View>
      {calendar ? (
        <SplitCalendar split={split} types={types} today={today} />
      ) : (
        <View style={styles.previewDays}>
          {days.map(({ date, typeId, typeIds }) => {
            const name = splitPreviewDayLabel(types, typeId, typeIds);
            const isToday = date === today;
            return (
              <View
                key={date}
                accessible
                accessibilityLabel={`${dayLabel(date, 'long')}: ${name}`}
                style={[
                  styles.previewDay,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isToday ? colors.accent : colors.line,
                  },
                ]}
              >
                <Text style={[styles.previewWeekday, { color: colors.muted }]} numberOfLines={1}>
                  {parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'short' })}
                </Text>
                <Text
                  style={[
                    type.callout,
                    type.number,
                    { color: isToday ? colors.accentText : colors.text, fontWeight: '700' },
                  ]}
                >
                  {parseLocalDate(date).getDate()}
                </Text>
                <View
                  style={[
                    styles.previewBar,
                    {
                      backgroundColor: typeId ? colourFor(typeId) : colors.muted,
                      flexDirection: 'row',
                      overflow: 'hidden',
                    },
                  ]}
                >
                  {/* A mixed day splits the dash between its types' colours. */}
                  {typeIds.length > 1 &&
                    typeIds.map((id) => (
                      <View key={id} style={{ flex: 1, backgroundColor: colourFor(id) }} />
                    ))}
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.previewLabel, { color: typeId ? colors.secondary : colors.muted }]}
                >
                  {splitPreviewLabel(name)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function SplitCalendar({
  split,
  today,
  types,
}: {
  split: TrainingSplit;
  today: string;
  types: WorkoutType[];
}) {
  const { colors, type, radius } = useTheme();
  const weekStart = useTrainingPreferences().data?.week_start === 'sunday' ? 0 : 1;
  const months = splitCalendarMonths(split, today, weekStart);
  const scale = calendarWeekdays(weekStart);
  return (
    <View style={{ gap: 12 }}>
      {months.map((month) => {
        const planned = new Map(month.days.map((day) => [day.date, day]));
        const rows = Array.from({ length: 6 }, (_, index) =>
          month.cells.slice(index * 7, index * 7 + 7),
        );
        return (
          <View
            key={month.key}
            style={{
              padding: 8,
              gap: 2,
              backgroundColor: colors.surface2,
              borderRadius: radius.md,
            }}
          >
            <Text
              accessibilityRole="header"
              style={[type.headline, { color: colors.text, padding: 4 }]}
            >
              {month.title}
            </Text>
            <View
              style={styles.calendarRow}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {scale.map((day, index) => (
                <Text
                  key={index}
                  style={[type.caption, { color: colors.muted, textAlign: 'center', flex: 1 }]}
                >
                  {day}
                </Text>
              ))}
            </View>
            {rows
              .filter((row) => row.some(Boolean))
              .map((row, index) => (
                <View key={index} style={styles.calendarRow}>
                  {row.map((cell, column) => {
                    if (!cell) return <View key={column} style={{ flex: 1 }} />;
                    const date = isoLocalDate(cell);
                    const day = planned.get(date);
                    const id = day?.typeId;
                    const ids = day?.typeIds ?? [];
                    const label = splitPreviewDayLabel(types, id, ids);
                    const colourOf = (typeId: string) =>
                      types.find((item) => item.id === typeId)?.color ?? colors.deemph;
                    return (
                      <View
                        key={date}
                        accessible
                        accessibilityLabel={`${dayLabel(date, 'long')}${id === undefined ? '' : `, ${label}`}`}
                        style={[
                          styles.calendarDay,
                          date === today && {
                            backgroundColor: colors.accentSoft,
                            borderRadius: radius.sm,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            type.footnote,
                            type.number,
                            { color: date === today ? colors.accentText : colors.text },
                          ]}
                        >
                          {cell.getDate()}
                        </Text>
                        <View
                          style={[
                            styles.previewPip,
                            id
                              ? {
                                  backgroundColor: colourOf(id),
                                  flexDirection: 'row',
                                  overflow: 'hidden',
                                }
                              : id === null && { borderWidth: 1.5, borderColor: colors.muted },
                          ]}
                        >
                          {/* A mixed day splits the pip between its types' colours. */}
                          {ids.length > 1 &&
                            ids.map((typeId) => (
                              <View
                                key={typeId}
                                style={{ flex: 1, backgroundColor: colourOf(typeId) }}
                              />
                            ))}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  calendarRow: { flexDirection: 'row', gap: 2 },
  calendarDay: { flex: 1, minHeight: 33, alignItems: 'center', justifyContent: 'center', gap: 3 },
  pattern: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  dash: {
    height: 5,
    borderRadius: 3,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 16,
  },
  stepperValue: { minWidth: 96, alignItems: 'center', paddingVertical: 6 },
  stepButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  previewControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  iconControl: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewDays: { flexDirection: 'row', gap: 4 },
  previewDay: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 11,
    borderWidth: 1,
  },
  previewWeekday: { fontSize: 11, fontWeight: '500' },
  previewBar: { width: 18, height: 3.5, borderRadius: 2 },
  previewPip: { width: 10, height: 10, borderRadius: 5 },
  previewLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
});
