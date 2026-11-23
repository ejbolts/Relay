import * as Haptics from 'expo-haptics';
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
import { Icon } from '../../../ui/Icon';
import { useTheme } from '../../../ui/theme';
import { settingsIcons } from '../icons';

/** A split's cycle as a row of coloured pips, rest days hollow. */
export function SplitPattern({
  days,
  size = 10,
}: {
  days: Pick<RoutineDay, 'workout_type'>[];
  size?: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.pattern} accessibilityElementsHidden importantForAccessibility="no">
      {days.map((day, index) => (
        <View
          key={index}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: day.workout_type?.color ?? 'transparent',
            borderWidth: day.workout_type ? 0 : 1.5,
            borderColor: colors.deemph,
          }}
        />
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
    void Haptics.selectionAsync();
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
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.previewHeader}>
        <Text style={[type.footnote, { color: colors.muted, flex: 1, fontWeight: '600' }]}>
          {calendar
            ? 'SPLIT CALENDAR'
            : week === 0
              ? 'NEXT 7 DAYS'
              : `${shortDate(start)} – ${shortDate(addDays(start, 6))}`}
        </Text>
        <StepButton
          icon={calendar ? settingsIcons.list : settingsIcons.calendar}
          label={calendar ? 'Show next 7 days' : 'Show two-month calendar'}
          onPress={() => setCalendar(!calendar)}
        />
        {!calendar && (
          <>
            <StepButton
              icon="chevronLeft"
              label="Previous preview week"
              disabled={week === 0}
              onPress={() => setWeek((value) => Math.max(0, value - 1))}
            />
            <StepButton
              icon="chevronRight"
              label="Next preview week"
              onPress={() => setWeek((value) => value + 1)}
            />
          </>
        )}
      </View>
      {calendar ? (
        <SplitCalendar split={split} types={types} today={today} />
      ) : (
        <View style={styles.previewDays}>
          {days.map(({ date, typeId }) => {
            const name = splitPreviewDayLabel(types, typeId);
            return (
              <View
                key={date}
                accessible
                accessibilityLabel={`${dayLabel(date, 'long')}: ${name}`}
                style={[styles.previewDay, { backgroundColor: colors.surface2 }]}
              >
                <Text style={[type.caption, { color: colors.muted }]}>
                  {parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'narrow' })}
                </Text>
                <Text
                  style={[
                    type.callout,
                    type.number,
                    { color: date === today ? colors.accentText : colors.text, fontWeight: '700' },
                  ]}
                >
                  {parseLocalDate(date).getDate()}
                </Text>
                <View
                  style={[
                    styles.previewPip,
                    typeId
                      ? { backgroundColor: colourFor(typeId) }
                      : { borderWidth: 1.5, borderColor: colors.deemph },
                  ]}
                />
                <Text
                  numberOfLines={2}
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
        const dayType = new Map(month.days.map((day) => [day.date, day.typeId]));
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
                    const id = dayType.get(date);
                    const label = splitPreviewDayLabel(types, id);
                    const colour = types.find((item) => item.id === id)?.color ?? colors.deemph;
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
                              ? { backgroundColor: colour }
                              : id === null && { borderWidth: 1.5, borderColor: colors.muted },
                          ]}
                        />
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
  pattern: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
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
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewDays: { flexDirection: 'row', gap: 4 },
  previewDay: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 10,
  },
  previewPip: { width: 10, height: 10, borderRadius: 5 },
  previewLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
});
