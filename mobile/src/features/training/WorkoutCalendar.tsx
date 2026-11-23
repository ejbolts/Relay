import { memo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  I18nManager,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { prettyDate } from '../../../../frontend/src/appShared';
import type { WorkoutType, WorkoutTypeColors } from '../../../../frontend/src/types';
import { workoutTypeColor } from '../../../../frontend/src/dayColors';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import {
  ringSegments,
  type CalendarDay,
  type CalendarMonthView,
  settledPage,
  type MonthKey,
} from './calendarModel';
import { haptics } from '../../ui/haptics';

const BOX = 38;
const RADIUS = 11;
const STROKE = 2;

/** The outline of a rounded square, starting at its top-left corner and running clockwise. */
function outline(size: number, radius: number, inset: number) {
  const a = inset;
  const b = size - inset;
  const r = radius - inset;
  // The top-left corner's midpoint, where the web's conic ring starts (-45°).
  const corner = a + r - r * Math.SQRT1_2;
  return [
    `M ${corner} ${corner}`,
    `A ${r} ${r} 0 0 1 ${a + r} ${a}`,
    `L ${b - r} ${a}`,
    `A ${r} ${r} 0 0 1 ${b} ${a + r}`,
    `L ${b} ${b - r}`,
    `A ${r} ${r} 0 0 1 ${b - r} ${b}`,
    `L ${a + r} ${b}`,
    `A ${r} ${r} 0 0 1 ${a} ${b - r}`,
    `L ${a} ${a + r}`,
    `A ${r} ${r} 0 0 1 ${corner} ${corner}`,
  ].join(' ');
}

const PATH = outline(BOX, RADIUS, STROKE / 2);
const SIDE = BOX - STROKE - 2 * (RADIUS - STROKE / 2);
const PERIMETER = 4 * SIDE + 2 * Math.PI * (RADIUS - STROKE / 2);

/** A day's border: one colour, or equal arcs around it when the day mixes workout types. */
export function DayRing({
  colors,
  size = BOX,
  opacity = 1,
}: {
  colors: string[];
  size?: number;
  opacity?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${BOX} ${BOX}`}
      style={[StyleSheet.absoluteFill, { opacity }]}
    >
      {ringSegments(colors, PERIMETER).map((segment, index) => (
        <Path
          key={index}
          d={PATH}
          fill="none"
          stroke={segment.color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={colors.length > 1 ? [segment.length, PERIMETER] : undefined}
          strokeDashoffset={colors.length > 1 ? -segment.offset : undefined}
        />
      ))}
    </Svg>
  );
}

const DayCell = memo(function DayCell({
  day,
  selected,
  readOnly,
  onPress,
}: {
  day: CalendarDay;
  selected: boolean;
  readOnly: boolean;
  onPress: (day: CalendarDay) => void;
}) {
  const { colors } = useTheme();
  const trained = !!day.entry;
  const count = day.entry?.workout_count ?? 0;
  const ring = day.filteredOut ? [colors.deemph] : day.ring;
  const disabled = readOnly && !trained;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      accessibilityLabel={
        trained
          ? `View ${count} ${count === 1 ? 'workout' : 'workouts'} for ${prettyDate(day.date)}`
          : `${readOnly ? 'No workouts for ' : ''}${prettyDate(day.date)}${day.scheduledNote ? `, ${day.scheduledNote}` : ''}`
      }
      onPress={() => {
        haptics.selection();
        onPress(day);
      }}
      style={styles.cell}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.box,
            day.today && { backgroundColor: colors.surface3 },
            selected && { backgroundColor: colors.accentSoft },
            pressed && !disabled && { opacity: 0.6 },
          ]}
        >
          {ring.length > 0 ? (
            <DayRing colors={ring} />
          ) : day.scheduled.length > 0 ? (
            // A planned day's outline, faint once it has passed unlogged (missed), as on the web.
            <DayRing colors={day.scheduled} opacity={day.future || day.today ? 1 : 0.32} />
          ) : null}
          {day.today && !ring.length && !day.scheduled.length && (
            <View style={[styles.todayRing, { borderColor: colors.accent }]} />
          )}
          <Text
            style={[
              styles.number,
              {
                color: day.future ? colors.muted : trained ? colors.text : colors.secondary,
                fontWeight: trained || day.today ? '700' : '400',
                opacity: day.future ? 0.6 : 1,
              },
            ]}
          >
            {day.day}
          </Text>
          <View style={styles.dots}>
            {day.dots.slice(0, 3).map((color, index) => (
              <View key={index} style={[styles.dot, { backgroundColor: color ?? colors.deemph }]} />
            ))}
          </View>
        </View>
      )}
    </Pressable>
  );
});

/**
 * The calendar as the web's: a month to a page, swiped sideways between months (the arrows do the
 * same, for screen readers and one-handed use). Until the card has been measured, and in tests,
 * it shows the current month alone.
 */
export function WorkoutCalendar({
  months,
  month,
  viewFor,
  onMonthChange,
  selectedDate,
  onSelectDay,
  readOnly = false,
  loadingOlder = false,
  olderError = null,
  onRetryOlder,
}: {
  /** The pages, oldest first. */
  months: readonly MonthKey[];
  month: MonthKey;
  viewFor: (month: MonthKey) => CalendarMonthView;
  onMonthChange: (month: MonthKey) => void;
  selectedDate: string | null;
  onSelectDay: (day: CalendarDay) => void;
  /** Disables days without logged workouts (for shared profile calendars). */
  readOnly?: boolean;
  loadingOlder?: boolean;
  olderError?: string | null;
  onRetryOlder?: () => void;
}) {
  const { colors, type } = useTheme();
  const [width, setWidth] = useState(0);
  const pager = useRef<FlatList<MonthKey>>(null);
  const index = Math.max(0, months.indexOf(month));
  const title = viewFor(month).title;
  // Lands on a month, from the arrows or a swipe: screen readers hear it, focus stays put.
  const settle = (next: MonthKey) => {
    if (next === month) return;
    haptics.selection();
    onMonthChange(next);
    AccessibilityInfo.announceForAccessibility(viewFor(next).title);
  };
  const go = (delta: number) => {
    const next = months[index + delta];
    if (!next) return;
    settle(next);
    pager.current?.scrollToIndex({ index: index + delta, animated: true });
  };
  const page = (key: MonthKey) => (
    <MonthPage
      view={viewFor(key)}
      selectedDate={selectedDate}
      readOnly={readOnly}
      onSelectDay={onSelectDay}
    />
  );
  return (
    <View style={{ gap: 4 }}>
      {/* The month and its controls laid out together, before the days for screen readers. */}
      <View style={styles.monthRow}>
        <Text
          accessibilityRole="header"
          style={[type.headline, styles.monthTitle, { color: colors.text }]}
        >
          {title}
        </Text>
        {loadingOlder && (
          <ActivityIndicator accessibilityLabel="Loading earlier months" color={colors.muted} />
        )}
        {!!olderError && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading earlier months"
            onPress={onRetryOlder}
            style={styles.retry}
          >
            <Text style={[type.footnote, { color: colors.danger }]}>Retry</Text>
          </Pressable>
        )}
        <MonthButton
          label="Previous month"
          icon="chevronLeft"
          enabled={index > 0}
          onPress={() => go(-1)}
        />
        <MonthButton
          label="Next month"
          icon="chevronRight"
          enabled={index < months.length - 1}
          onPress={() => go(1)}
        />
      </View>
      <View
        testID="calendar-pager"
        onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
      >
        {width > 0 ? (
          <FlatList
            // A new width or oldest month moves every page: start again at the month on show.
            key={`${months[0]}:${width}`}
            ref={pager}
            testID="calendar-months"
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={months}
            keyExtractor={(key) => key}
            initialScrollIndex={index}
            getItemLayout={(_, item) => ({ length: width, offset: width * item, index: item })}
            initialNumToRender={1}
            windowSize={3}
            extraData={[selectedDate, viewFor]}
            onMomentumScrollEnd={(event) => {
              const shown =
                months[settledPage(event.nativeEvent, I18nManager.isRTL, months.length)];
              if (shown) settle(shown);
            }}
            renderItem={({ item }) => <View style={{ width }}>{page(item)}</View>}
          />
        ) : (
          page(month)
        )}
      </View>
    </View>
  );
}

const MonthPage = memo(function MonthPage({
  view,
  selectedDate,
  readOnly,
  onSelectDay,
}: {
  view: CalendarMonthView;
  selectedDate: string | null;
  readOnly: boolean;
  onSelectDay: (day: CalendarDay) => void;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: 8 }} accessibilityLabel={view.title}>
      <View style={styles.week} importantForAccessibility="no-hide-descendants">
        {view.weekdays.map((weekday, index) => (
          <Text key={index} style={[styles.weekday, type.caption, { color: colors.muted }]}>
            {weekday}
          </Text>
        ))}
      </View>
      {view.weeks.map((week, row) => (
        <View key={row} style={styles.week}>
          {week.map((day, index) =>
            day ? (
              <DayCell
                key={day.date}
                day={day}
                selected={day.date === selectedDate}
                readOnly={readOnly}
                onPress={onSelectDay}
              />
            ) : (
              <View key={`empty-${index}`} style={styles.cell} />
            ),
          )}
        </View>
      ))}
    </View>
  );
});

function MonthButton({
  label,
  icon,
  enabled,
  onPress,
}: {
  label: string;
  icon: 'chevronLeft' | 'chevronRight';
  enabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [styles.monthButton, { opacity: !enabled ? 0.3 : pressed ? 0.6 : 1 }]}
    >
      <Icon name={icon} size={17} color={colors.secondary} />
    </Pressable>
  );
}

/** The legend: tapping a type hides it from the calendar, the sessions and their totals. */
export function CalendarLegend({
  types,
  categoryColors,
  hidden,
  onToggle,
  minTargetHeight,
}: {
  types: WorkoutType[];
  categoryColors: WorkoutTypeColors;
  hidden: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Optional minimum touch-target height for chips (Training keeps its compact 32 pt layout). */
  minTargetHeight?: number;
}) {
  const { colors, type } = useTheme();
  if (!types.length) return null;
  return (
    <View style={styles.legend} accessibilityLabel="Workout types">
      {types.map((item) => {
        const shown = !hidden.has(item.id);
        return (
          <Pressable
            key={item.id}
            accessibilityRole="switch"
            accessibilityLabel={item.name}
            accessibilityState={{ checked: shown }}
            onPress={() => {
              haptics.selection();
              onToggle(item.id);
            }}
            style={({ pressed }) => [
              styles.legendItem,
              minTargetHeight ? { minHeight: minTargetHeight, minWidth: minTargetHeight } : null,
              pressed && { opacity: 0.6 },
            ]}
          >
            <View
              style={[
                styles.legendDot,
                {
                  backgroundColor: shown ? workoutTypeColor(item, categoryColors) : colors.deemph,
                },
              ]}
            />
            <Text
              style={[
                type.footnote,
                {
                  color: shown ? colors.text : colors.muted,
                  textDecorationLine: shown ? 'none' : 'line-through',
                },
              ]}
            >
              {item.name}
            </Text>
            <Icon name={shown ? 'check' : 'close'} size={12} color={colors.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: -8 },
  monthTitle: { flex: 1, paddingLeft: 4, paddingVertical: 10 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  monthButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontWeight: '600' },
  cell: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: RADIUS,
    borderWidth: STROKE,
  },
  number: { fontSize: 15, fontVariant: ['tabular-nums'] },
  dots: { flexDirection: 'row', gap: 2, height: 5, marginTop: 1 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 14,
    rowGap: 6,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
  },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
});
