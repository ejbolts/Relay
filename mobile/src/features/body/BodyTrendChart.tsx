import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePinchGesture } from 'react-native-gesture-handler';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { RANGE_LABELS } from '../../../../frontend/src/appShared';
import { bodyGoalTarget, maintenanceRange } from '../../../../frontend/src/bodyMeasurementHistory';
import {
  clipBodyWeightGoalPath,
  filterMeasurementsByRange,
  trailingWeekAverageKg,
  type BodyTrendRange,
} from '../../../../frontend/src/bodyTrend';
import {
  chartDateTicks,
  chartLabelWidth,
  goalLabelPlacement,
} from '../../../../frontend/src/chartLayout';
import { dateRangeForDates, TIME_RANGE_OPTIONS } from '../../../../frontend/src/dateRanges';
import { niceTicks, parseLocalDate, shortDate } from '../../../../frontend/src/trainingSummary';
import type { BodyMeasurement, BodyWeightGoal } from '../../../../frontend/src/types';
import { formatWeight, weightFromKg, type WeightUnit } from '../../../../frontend/src/weightUnits';
import { useWeightUnit } from '../../data/queries';
import { Card, CardHeader } from '../../ui/components';
import { Segmented } from '../../ui/controls';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { LandscapeButton, LandscapeChartView } from './LandscapeChart';
import { useRangePinch } from './rangePinch';

export interface TrendPoint {
  date: string;
  value: number;
  detail?: string;
}

export interface TrendGoal {
  startDate: string;
  startValue: number;
  endDate: string;
  endValue: number;
  label: string;
  minValue?: number;
  maxValue?: number;
}

type Point = TrendPoint;
type Goal = TrendGoal;
const EMPTY_POINTS: Point[] = [];

const PAD = { top: 12, right: 12, bottom: 26, left: 40 };
const HEIGHT = 200;
const DAY_MS = 86_400_000;
const READOUT_WIDTH = 176;

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
  const tMax = Math.max(...times);
  const span = Math.max(tMax - tMin, 1);
  const plotWidth = Math.max(width - PAD.left - PAD.right, 10);
  const plotHeight = height - PAD.top - PAD.bottom;
  const xTime = (ms: number) =>
    times.length === 1 ? PAD.left + plotWidth / 2 : PAD.left + ((ms - tMin) / span) * plotWidth;
  const x = (date: string) => xTime(time(date));
  const y = (value: number) => PAD.top + (1 - (value - yMin) / (yMax - yMin || 1)) * plotHeight;
  // Shared with the web chart. A single short reading names its day; edge labels stay inside.
  const dateTicks = chartDateTicks(tMin, tMax, plotWidth, xTime);
  const dates = (
    points.length === 1 && span / DAY_MS <= 45
      ? [{ x: x(points[0].date), label: shortDate(points[0].date) }]
      : dateTicks
  ).map((tick) => ({
    ...tick,
    anchor: (tick.x - chartLabelWidth(tick.label) / 2 < 2
      ? 'start'
      : tick.x + chartLabelWidth(tick.label) / 2 > width - 2
        ? 'end'
        : 'middle') as 'start' | 'middle' | 'end',
  }));

  return {
    x,
    y,
    baseline: y(yMin),
    coords: points.map((point) => ({ x: x(point.date), y: y(point.value) })),
    dots: dots.map((point) => ({ x: x(point.date), y: y(point.value) })),
    gridlines: ticks.map((value, index) => ({ y: y(value), value, baseline: index === 0 })),
    dates,
  };
}

/**
 * Body's Trend card, as on the web: a 7-day average ink line over daily weigh-in dots with a
 * dotted muted goal path and inline goal label, or body fat readings, over a chosen range.
 * Touching the chart shows a floating readout for the day under the finger.
 */
export function BodyTrendChart({
  measurements,
  goals,
}: {
  measurements: BodyMeasurement[];
  goals: BodyWeightGoal[];
}) {
  const { colors } = useTheme();
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
  // Muted at 75 % keeps the daily dots about 3:1 on the card in light and dark.
  const dotColor = colors.muted;

  return (
    <Card accessibilityLabel="Trend">
      <CardHeader title="Trend" />
      <View style={styles.controls}>
        <View style={styles.rangeRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.rangeScroll}
            contentContainerStyle={styles.rangeTabs}
          >
            {TIME_RANGE_OPTIONS.map((option) => (
              <RangeTab
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
          {!hasBodyFat && <LandscapeButton title={title} onPress={() => setLandscape(true)} />}
        </View>
        {hasBodyFat && (
          <View style={styles.seriesRow}>
            <Segmented
              accessibilityLabel="Body measure"
              values={['Weight', 'Body fat']}
              selectedIndex={showFat ? 1 : 0}
              onChange={(index) => {
                setSeries(index === 1 ? 'fat' : 'weight');
                setSelected(null);
              }}
              style={styles.seriesSegmented}
            />
            <LandscapeButton title={title} onPress={() => setLandscape(true)} />
          </View>
        )}
      </View>
      <TrendPlot
        points={points}
        dots={dots}
        goal={goal}
        showFat={showFat}
        unit={unit}
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
            unit={unit}
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
            color={colors.text}
            label={`Body fat · ${points.length} ${points.length === 1 ? 'reading' : 'readings'}`}
          />
        ) : (
          <>
            <Legend kind="dot" color={dotColor} label="Daily weigh-in" />
            <Legend kind="line" color={colors.text} label="7-day average" />
            {goal && <Legend kind="dotted" color={colors.secondary} label="Goal" />}
          </>
        )}
      </View>
    </Card>
  );
}

/** Borderless range tab matching web's `.range-chips button`. */
function RangeTab({
  label,
  accessibilityLabel,
  selected,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, type } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [styles.rangeTab, pressed && !selected && { opacity: 0.65 }]}
    >
      <View style={[styles.rangeFace, selected && { backgroundColor: colors.surface3 }]}>
        <Text
          style={[
            type.footnote,
            {
              color: selected ? colors.text : colors.muted,
              fontWeight: '600',
            },
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function PinchWrapper({
  pinch,
  children,
}: {
  pinch: { onPinch: (scale: number) => void; onPinchEnd: () => void };
  children: ReactNode;
}) {
  const gesture = usePinchGesture({
    runOnJS: true,
    onUpdate: (event) => pinch.onPinch(event.scale),
    onFinalize: () => pinch.onPinchEnd(),
  });
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}

/**
 * The chart itself, at a height (the card's, or the landscape view's), touched to show a day
 * tooltip and optionally pinched to change the range.
 */
export function TrendPlot({
  points,
  dots = EMPTY_POINTS,
  goal,
  showFat = false,
  unit,
  height,
  active,
  onSelect,
  pinch,
  seriesLabel,
  accessibilityLabel,
  lineColor,
  formatValue,
  avoidLineOverlap = false,
}: {
  points: Point[];
  dots?: Point[];
  goal: Goal | null;
  showFat?: boolean;
  unit: WeightUnit;
  height: number;
  active: number | null;
  onSelect: (index: number | null) => void;
  pinch?: { onPinch: (scale: number) => void; onPinchEnd: () => void };
  /** Overrides the default tooltip/series label (e.g. "Body weight" on a shared profile). */
  seriesLabel?: string;
  /** Overrides the default screen-reader chart label. */
  accessibilityLabel?: string;
  /** Overrides the trend line colour (defaults to `colors.text`). */
  lineColor?: string;
  /** Optional point value formatter (defaults to fixed 1-decimal display for Body). */
  formatValue?: (value: number) => string;
  /** Opt in to flipping the goal label to the opposite side when the plotted line overlaps it. */
  avoidLineOverlap?: boolean;
}) {
  const { colors, type, radius } = useTheme();
  const [width, setWidth] = useState(0);
  const [tipSize, setTipSize] = useState({ width: READOUT_WIDTH, height: 84 });
  const model = chartModel(points, dots, goal, width, height);
  // Muted at 75 % keeps the daily dots about 3:1 on the card in light and dark.
  const dotColor = colors.muted;
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

  const activePoint = active !== null ? points[active] : null;
  const activeCoord = active !== null && model ? model.coords[active] : null;
  const tip = readoutPosition(activeCoord, tipSize, width, height);
  const goalCoords =
    goal && model
      ? {
          x1: model.x(goal.startDate),
          y1: model.y(goal.startValue),
          x2: model.x(goal.endDate),
          y2: model.y(goal.endValue),
          label: goal.label,
        }
      : null;

  const label =
    accessibilityLabel ??
    (showFat ? 'Body fat percentage' : 'Bodyweight, 7-day average over daily weigh-ins');
  const shown = active ?? (points.length ? points.length - 1 : null);
  const formatPointValue = (value: number) =>
    formatValue
      ? formatValue(value)
      : showFat
        ? `${value.toFixed(1)}%`
        : `${value.toFixed(1)} ${unit}`;
  const reading = (index: number) => {
    const point = points[index];
    const value = formatPointValue(point.value);
    if (seriesLabel) return `${shortDate(point.date)}, ${value}`;
    return showFat
      ? `${shortDate(point.date)}, ${value}`
      : `${shortDate(point.date)}, ${value} 7-day average${point.detail ? `, ${point.detail}` : ''}`;
  };

  const chart = (
    <View style={{ height }}>
      {model && (
        <Svg width={width} height={height} pointerEvents="none">
          {model.gridlines.map((grid) => (
            <Line
              key={grid.value}
              x1={PAD.left}
              x2={width - PAD.right}
              y1={grid.y}
              y2={grid.y}
              stroke={grid.baseline ? colors.axis : colors.grid}
              strokeWidth={1}
            />
          ))}
          {model.gridlines.map((grid) => (
            <SvgText
              key={`label-${grid.value}`}
              x={PAD.left - 7}
              y={grid.y + 3.5}
              fontSize={10.5}
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
              y={height - 7}
              fontSize={10.5}
              fill={colors.muted}
              textAnchor={date.anchor}
            >
              {date.label}
            </SvgText>
          ))}
          {goal && goalCoords && (
            <>
              {goal.minValue != null && goal.maxValue != null ? (
                <>
                  <Rect
                    x={goalCoords.x1}
                    width={Math.max(goalCoords.x2 - goalCoords.x1, 1)}
                    y={model.y(goal.maxValue)}
                    height={Math.max(model.y(goal.minValue) - model.y(goal.maxValue), 1)}
                    fill={colors.accent}
                    opacity={0.12}
                  />
                  <Line
                    x1={goalCoords.x1}
                    y1={model.y(goal.minValue)}
                    x2={goalCoords.x2}
                    y2={model.y(goal.minValue)}
                    stroke={colors.secondary}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeDasharray="0.1 5.5"
                  />
                  <Line
                    x1={goalCoords.x1}
                    y1={model.y(goal.maxValue)}
                    x2={goalCoords.x2}
                    y2={model.y(goal.maxValue)}
                    stroke={colors.secondary}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeDasharray="0.1 5.5"
                  />
                </>
              ) : (
                <Line
                  x1={goalCoords.x1}
                  y1={goalCoords.y1}
                  x2={goalCoords.x2}
                  y2={goalCoords.y2}
                  stroke={colors.secondary}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray="0.1 5.5"
                />
              )}
              {(() => {
                const placed = goalLabelPlacement(
                  goalCoords,
                  {
                    width,
                    height,
                    plotRight: width - PAD.right,
                    plotBottom: height - PAD.bottom,
                  },
                  goal.maxValue != null ? model.y(goal.maxValue) : null,
                  avoidLineOverlap ? model.coords : undefined,
                );
                return (
                  <SvgText
                    accessibilityLabel={goal.label}
                    x={placed.x}
                    y={placed.y}
                    fontSize={10.5}
                    fontWeight="600"
                    fill={colors.secondary}
                    textAnchor={placed.anchor}
                  >
                    {goal.label}
                  </SvgText>
                );
              })()}
            </>
          )}
          {model.dots.map((dot, index) => (
            <Circle
              key={`dot-${index}`}
              cx={dot.x}
              cy={dot.y}
              r={2.4}
              fill={dotColor}
              opacity={0.75}
            />
          ))}
          {line && (
            <Path
              d={line}
              fill="none"
              stroke={lineColor ?? colors.text}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {activeCoord ? (
            <>
              <Line
                x1={activeCoord.x}
                x2={activeCoord.x}
                y1={PAD.top}
                y2={model.baseline}
                stroke={colors.secondary}
                strokeWidth={1}
                opacity={0.55}
              />
              <Circle
                cx={activeCoord.x}
                cy={activeCoord.y}
                r={5}
                fill={lineColor ?? colors.text}
                stroke={colors.surface}
                strokeWidth={2}
              />
            </>
          ) : (
            <Circle
              cx={model.coords[model.coords.length - 1].x}
              cy={model.coords[model.coords.length - 1].y}
              r={4}
              fill={lineColor ?? colors.text}
              stroke={colors.surface}
              strokeWidth={2}
            />
          )}
        </Svg>
      )}
      {/*
          The touch layer has no children, so a touch's locationX is always in plot coordinates,
          even under the readout (whose text lets touches through). For screen readers it is the
          chart: its value is the latest or chosen reading, and swiping up or down moves a day.
        */}
      <View
        style={StyleSheet.absoluteFill}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={shown !== null ? { text: reading(shown) } : undefined}
        accessibilityActions={[
          { name: 'increment', label: 'Next reading' },
          { name: 'decrement', label: 'Previous reading' },
        ]}
        onAccessibilityAction={(event) => {
          if (shown === null) return;
          const next =
            event.nativeEvent.actionName === 'increment'
              ? Math.min(shown + 1, points.length - 1)
              : Math.max(shown - 1, 0);
          if (next !== active) onSelect(next);
        }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => true}
        // A scroll that started on the chart doesn't leave a day selected.
        onResponderTerminate={() => onSelect(null)}
        onResponderGrant={(event) => select(event.nativeEvent.locationX)}
        onResponderMove={(event) => select(event.nativeEvent.locationX)}
      />
      {activePoint && activeCoord && (
        <View
          pointerEvents="box-none"
          onLayout={(event) => {
            const { width: w, height: h } = event.nativeEvent.layout;
            if (w !== tipSize.width || h !== tipSize.height) setTipSize({ width: w, height: h });
          }}
          style={[
            styles.tooltip,
            {
              left: tip.left,
              top: tip.top,
              backgroundColor: colors.surface,
              borderColor: colors.lineStrong,
              borderRadius: radius.sm,
              shadowColor: colors.shadow,
            },
          ]}
        >
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.tooltipBody}
          >
            <Text style={[type.caption, { color: colors.secondary }]}>
              {shortDate(activePoint.date)}
            </Text>
            <Text style={[type.callout, type.number, { color: colors.text, fontWeight: '700' }]}>
              {formatPointValue(activePoint.value)}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]}>
              {seriesLabel ?? (showFat ? 'Body fat' : '7-day average')}
            </Text>
            {!showFat && !!activePoint.detail && (
              <Text style={[type.caption, { color: colors.muted }]}>{activePoint.detail}</Text>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close ${shortDate(activePoint.date)} details`}
            onPress={() => onSelect(null)}
            style={styles.tooltipClose}
          >
            <Icon name="close" size={12} color={colors.muted} />
          </Pressable>
        </View>
      )}
    </View>
  );
  return pinch ? <PinchWrapper pinch={pinch}>{chart}</PinchWrapper> : chart;
}

/**
 * Where the day readout sits: centred on the point, inside the plot, above the point when its
 * measured height fits there, otherwise below it, otherwise on whichever side has more room.
 */
function readoutPosition(
  point: { x: number; y: number } | null,
  size: { width: number; height: number },
  width: number,
  height: number,
) {
  if (!point) return { left: 0, top: 0 };
  const left = Math.max(Math.min(point.x - size.width / 2, width - size.width - 4), 4);
  const above = point.y - size.height - 12;
  const below = point.y + 12;
  const top =
    above >= 0
      ? above
      : below + size.height <= height
        ? below
        : point.y > height / 2
          ? Math.max(above, 0)
          : Math.max(Math.min(below, height - size.height), 0);
  return { left, top };
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
    goal:
      clipped && activeGoal
        ? {
            startDate: clipped.start_date,
            startValue: weightFromKg(clipped.start_weight_kg, unit),
            endDate: clipped.target_date,
            endValue: weightFromKg(clipped.target_weight_kg, unit),
            label: `Goal ${bodyGoalTarget(activeGoal, unit)}`,
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
  kind: 'dot' | 'line' | 'dotted';
  color: string;
  label: string;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.legendItem}>
      {kind === 'dot' ? (
        <View style={[styles.legendDot, { backgroundColor: color, opacity: 0.75 }]} />
      ) : kind === 'dotted' ? (
        <Svg width={16} height={4}>
          <Line
            x1={1.5}
            x2={14.5}
            y1={2}
            y2={2}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="0.1 4.2"
          />
        </Svg>
      ) : (
        <View style={[styles.legendLine, { backgroundColor: color }]} />
      )}
      <Text style={[type.caption, { color: colors.secondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { gap: 8 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rangeScroll: { flexGrow: 0, flexShrink: 1 },
  rangeTabs: { alignItems: 'center' },
  // A 44 pt target around the web's compact 32 pt tab face.
  rangeTab: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  rangeFace: {
    minWidth: 36,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  seriesSegmented: { width: 190 },
  tooltip: {
    position: 'absolute',
    width: READOUT_WIDTH,
    flexDirection: 'row',
    paddingLeft: 10,
    paddingVertical: 7,
    borderWidth: 1,
    elevation: 4,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  tooltipBody: { flex: 1, gap: 2 },
  // A 44 pt target in the readout's top corner, inside its bounds so touches reach it.
  tooltipClose: {
    width: 44,
    height: 44,
    marginTop: -7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendLine: { width: 14, height: 2, borderRadius: 1 },
});
