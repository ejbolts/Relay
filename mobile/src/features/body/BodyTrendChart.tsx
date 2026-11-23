import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { RANGE_LABELS } from '../../../../frontend/src/appShared';
import { bodyGoalTarget, maintenanceRange } from '../../../../frontend/src/bodyMeasurementHistory';
import {
  clipBodyWeightGoalPath,
  filterMeasurementsByRange,
  trailingWeekAverageKg,
  type BodyTrendRange,
} from '../../../../frontend/src/bodyTrend';
import { dateRangeForDates, TIME_RANGE_OPTIONS } from '../../../../frontend/src/dateRanges';
import { niceTicks, parseLocalDate, shortDate } from '../../../../frontend/src/trainingSummary';
import type { BodyMeasurement, BodyWeightGoal } from '../../../../frontend/src/types';
import { formatWeight, weightFromKg, type WeightUnit } from '../../../../frontend/src/weightUnits';
import { GestureDetector, usePinchGesture } from 'react-native-gesture-handler';
import { useWeightUnit } from '../../data/queries';
import { Card, CardHeader } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { Chip, Segmented } from '../training/parts';
import { LandscapeButton, LandscapeChartView } from './LandscapeChart';
import { useRangePinch } from './rangePinch';

interface Point {
  date: string;
  value: number;
  detail?: string;
}

interface Goal {
  startDate: string;
  startValue: number;
  endDate: string;
  endValue: number;
  minValue?: number;
  maxValue?: number;
}

const PAD = { top: 12, right: 12, bottom: 24, left: 40 };
const HEIGHT = 200;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Where the line, dots, goal and gridlines sit in a chart `width` wide. */
function chartModel(
  points: Point[],
  dots: Point[],
  goal: Goal | null,
  width: number,
  height = HEIGHT,
) {
  if (!points.length || width <= 0) return null;
  const time = (date: string) => parseLocalDate(date).getTime();
  const times = [...points, ...dots].map((point) => time(point.date));
  if (goal) times.push(time(goal.startDate), time(goal.endDate));
  const values = [...points, ...dots].map((point) => point.value);
  if (goal) values.push(goal.startValue, goal.endValue);
  if (goal?.minValue != null && goal.maxValue != null) values.push(goal.minValue, goal.maxValue);
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const tMin = Math.min(...times);
  const span = Math.max(Math.max(...times) - tMin, 1);
  const plotWidth = Math.max(width - PAD.left - PAD.right, 10);
  const plotHeight = height - PAD.top - PAD.bottom;
  const x = (date: string) =>
    times.length === 1
      ? PAD.left + plotWidth / 2
      : PAD.left + ((time(date) - tMin) / span) * plotWidth;
  const y = (value: number) => PAD.top + (1 - (value - yMin) / (yMax - yMin || 1)) * plotHeight;
  const count = Math.min(4, Math.max(2, Math.floor(plotWidth / 80)));
  return {
    x,
    y,
    coords: points.map((point) => ({ x: x(point.date), y: y(point.value) })),
    dots: dots.map((point) => ({ x: x(point.date), y: y(point.value) })),
    gridlines: ticks.map((value) => ({ y: y(value), value })),
    dates: Array.from({ length: count }, (_, index) => {
      const date = new Date(tMin + (span * index) / (count - 1));
      return {
        x: PAD.left + (plotWidth * index) / (count - 1),
        label: `${date.getDate()} ${MONTHS[date.getMonth()]}`,
      };
    }),
  };
}

/**
 * Body's Trend card, as on the web: a 7-day average line over the daily weigh-ins with the
 * active goal's path (and maintenance band), or body fat readings, over a chosen range.
 * Touching the chart shows the day under the finger.
 */
export function BodyTrendChart({
  measurements,
  goals,
}: {
  measurements: BodyMeasurement[];
  goals: BodyWeightGoal[];
}) {
  const { colors, type } = useTheme();
  const unit = useWeightUnit();
  const [range, setRange] = useState<BodyTrendRange>('3m');
  const [series, setSeries] = useState<'weight' | 'fat'>('weight');
  const [selected, setSelected] = useState<number | null>(null);
  const hasBodyFat = measurements.some((item) => item.body_fat_pct !== null);
  const showFat = series === 'fat' && hasBodyFat;
  const activeGoal = goals.find((goal) => goal.active) ?? null;
  const [landscape, setLandscape] = useState(false);
  const dates = useMemo(() => measurements.map((item) => item.measurement_date), [measurements]);
  const pinch = useRangePinch(dates, range, (next) => {
    setRange(next);
    setSelected(null);
  });
  const { pinchStart } = pinch;

  const { points, dots, goal } = useMemo(
    () => trendSeries(measurements, range, showFat, activeGoal, unit, pinchStart),
    [measurements, range, showFat, activeGoal, unit, pinchStart],
  );
  const title = showFat ? 'Body fat trend' : 'Bodyweight trend';
  const active = selected !== null && selected < points.length ? selected : null;
  const shown = active !== null ? points[active] : points.at(-1);
  const format = (value: number) =>
    showFat ? `${value.toFixed(1)}%` : `${value.toFixed(1)} ${unit}`;

  return (
    <Card accessibilityLabel="Trend">
      <CardHeader
        title="Trend"
        action={<LandscapeButton title={title} onPress={() => setLandscape(true)} />}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {TIME_RANGE_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={RANGE_LABELS[option.value]}
            accessibilityLabel={option.label}
            selected={range === option.value}
            onPress={() => {
              setRange(option.value);
              setSelected(null);
            }}
          />
        ))}
      </ScrollView>
      {hasBodyFat && (
        <Segmented
          accessibilityLabel="Body measure"
          values={['Weight', 'Body fat']}
          selectedIndex={showFat ? 1 : 0}
          onChange={(index) => {
            setSeries(index === 1 ? 'fat' : 'weight');
            setSelected(null);
          }}
        />
      )}
      <Text style={[type.footnote, type.number, { color: colors.secondary }]} numberOfLines={1}>
        {shown
          ? `${shortDate(shown.date)} · ${format(shown.value)}${showFat ? '' : ' avg'}${shown.detail ? ` · ${shown.detail}` : ''}`
          : ' '}
      </Text>
      <TrendPlot
        points={points}
        dots={dots}
        goal={goal}
        showFat={showFat}
        height={HEIGHT}
        active={active}
        onSelect={setSelected}
        pinch={pinch}
      />
      <LandscapeChartView title={title} visible={landscape} onClose={() => setLandscape(false)}>
        {(size) => (
          <TrendPlot
            points={points}
            dots={dots}
            goal={goal}
            showFat={showFat}
            height={size.height}
            active={active}
            onSelect={setSelected}
            pinch={pinch}
          />
        )}
      </LandscapeChartView>
      <View style={styles.legend} accessibilityLabel="Chart legend">
        {showFat ? (
          <Legend
            kind="line"
            color={colors.accent}
            label={`Body fat · ${points.length} ${points.length === 1 ? 'reading' : 'readings'}`}
          />
        ) : (
          <>
            <Legend kind="dot" color={colors.deemph} label="Daily weigh-in" />
            <Legend kind="line" color={colors.accent} label="7-day average" />
            {goal && (
              <Legend
                kind="dash"
                color={colors.good}
                label={activeGoal ? `Goal ${bodyGoalTarget(activeGoal, unit)}` : 'Goal'}
              />
            )}
          </>
        )}
      </View>
    </Card>
  );
}

/**
 * The chart itself, at a height (the card's, or the landscape view's), touched to show a day and
 * pinched to change the range.
 */
function TrendPlot({
  points,
  dots,
  goal,
  showFat,
  height,
  active,
  onSelect,
  pinch,
}: {
  points: Point[];
  dots: Point[];
  goal: Goal | null;
  showFat: boolean;
  height: number;
  active: number | null;
  onSelect: (index: number | null) => void;
  pinch: { onPinch: (scale: number) => void; onPinchEnd: () => void };
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const model = chartModel(points, dots, goal, width, height);
  const select = (x: number) => {
    if (!model) return;
    onSelect(
      model.coords.reduce(
        (best, point, index) =>
          Math.abs(point.x - x) < Math.abs(model.coords[best].x - x) ? index : best,
        0,
      ),
    );
  };
  const line = model?.coords
    .map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`)
    .join(' ');
  const gesture = usePinchGesture({
    runOnJS: true,
    onUpdate: (event) => pinch.onPinch(event.scale),
    onFinalize: () => pinch.onPinchEnd(),
  });
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityRole="image"
        accessibilityLabel={
          showFat ? 'Body fat percentage' : 'Bodyweight, 7-day average over daily weigh-ins'
        }
        style={{ height }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => true}
        // A scroll that started on the chart doesn't leave a day selected.
        onResponderTerminate={() => onSelect(null)}
        onResponderGrant={(event) => select(event.nativeEvent.locationX)}
        onResponderMove={(event) => select(event.nativeEvent.locationX)}
      >
        {model && (
          <Svg width={width} height={height}>
            {model.gridlines.map((grid) => (
              <Line
                key={grid.value}
                x1={PAD.left}
                x2={width - PAD.right}
                y1={grid.y}
                y2={grid.y}
                stroke={colors.grid}
                strokeWidth={1}
              />
            ))}
            {model.gridlines.map((grid) => (
              <SvgText
                key={`label-${grid.value}`}
                x={PAD.left - 6}
                y={grid.y + 4}
                fontSize={10}
                fill={colors.muted}
                textAnchor="end"
              >
                {Number(grid.value.toFixed(1))}
              </SvgText>
            ))}
            {model.dates.map((date, index) => (
              <SvgText
                key={`date-${index}`}
                x={date.x}
                y={height - 6}
                fontSize={10}
                fill={colors.muted}
                textAnchor={
                  index === 0 ? 'start' : index === model.dates.length - 1 ? 'end' : 'middle'
                }
              >
                {date.label}
              </SvgText>
            ))}
            {goal?.minValue != null && goal.maxValue != null && (
              <Rect
                x={model.x(goal.startDate)}
                width={Math.max(model.x(goal.endDate) - model.x(goal.startDate), 1)}
                y={model.y(goal.maxValue)}
                height={Math.max(model.y(goal.minValue) - model.y(goal.maxValue), 1)}
                fill={colors.good}
                opacity={0.12}
              />
            )}
            {goal && (
              <Line
                x1={model.x(goal.startDate)}
                y1={model.y(goal.startValue)}
                x2={model.x(goal.endDate)}
                y2={model.y(goal.endValue)}
                stroke={colors.good}
                strokeWidth={1.6}
                strokeDasharray="5 4"
              />
            )}
            {model.dots.map((dot, index) => (
              <Circle key={`dot-${index}`} cx={dot.x} cy={dot.y} r={2.4} fill={colors.deemph} />
            ))}
            {line && (
              <Path
                d={line}
                fill="none"
                stroke={colors.accent}
                strokeWidth={2.2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {(active !== null ? [active] : [model.coords.length - 1]).map((index) => (
              <Circle
                key={`active-${index}`}
                cx={model.coords[index].x}
                cy={model.coords[index].y}
                r={4}
                fill={colors.accent}
                stroke={colors.surface}
                strokeWidth={1.5}
              />
            ))}
          </Svg>
        )}
      </View>
    </GestureDetector>
  );
}

/** The chart's series for a range, in the account's unit, oldest first. */
function trendSeries(
  measurements: BodyMeasurement[],
  range: BodyTrendRange,
  showFat: boolean,
  activeGoal: BodyWeightGoal | null,
  unit: WeightUnit,
  /** While pinching, the chart shows this date onwards instead of the range. */
  pinchStart?: string,
): { points: Point[]; dots: Point[]; goal: Goal | null } {
  const ordered = (
    pinchStart
      ? measurements.filter((item) => item.measurement_date >= pinchStart)
      : filterMeasurementsByRange(measurements, range)
  )
    .slice()
    .reverse();
  if (showFat) {
    return {
      points: ordered
        .filter((item) => item.body_fat_pct !== null)
        .map((item) => ({ date: item.measurement_date, value: item.body_fat_pct! })),
      dots: [],
      goal: null,
    };
  }
  const start =
    pinchStart ??
    dateRangeForDates(
      measurements.map((item) => item.measurement_date),
      range,
    ).start_date;
  // Clip only the start: a future target date extends the chart so the goal line reaches it.
  const clipped = activeGoal ? clipBodyWeightGoalPath(activeGoal, start) : null;
  const band = activeGoal ? maintenanceRange(activeGoal) : null;
  return {
    points: ordered.map((item) => ({
      date: item.measurement_date,
      value: weightFromKg(trailingWeekAverageKg(measurements, item.measurement_date), unit),
      detail: `weighed ${formatWeight(item.weight_kg, unit)}`,
    })),
    dots: ordered.map((item) => ({
      date: item.measurement_date,
      value: weightFromKg(item.weight_kg, unit),
    })),
    goal: clipped
      ? {
          startDate: clipped.start_date,
          startValue: weightFromKg(clipped.start_weight_kg, unit),
          endDate: clipped.target_date,
          endValue: weightFromKg(clipped.target_weight_kg, unit),
          ...(band
            ? { minValue: weightFromKg(band[0], unit), maxValue: weightFromKg(band[1], unit) }
            : {}),
        }
      : null,
  };
}

function Legend({
  kind,
  color,
  label,
}: {
  kind: 'dot' | 'line' | 'dash';
  color: string;
  label: string;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.legendItem}>
      {kind === 'dot' ? (
        <View style={[styles.legendDot, { backgroundColor: color }]} />
      ) : (
        <View
          style={[
            styles.legendLine,
            kind === 'dash'
              ? { borderColor: color, borderTopWidth: 2, borderStyle: 'dashed' }
              : { backgroundColor: color, height: 2.5 },
          ]}
        />
      )}
      <Text style={[type.caption, { color: colors.secondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 6 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendLine: { width: 16, borderRadius: 1 },
});
