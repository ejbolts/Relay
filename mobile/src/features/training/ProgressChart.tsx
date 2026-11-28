import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { niceTicks, parseLocalDate, shortDate } from '../../../../frontend/src/trainingSummary';
import { useTheme } from '../../ui/theme';
import {
  chartYearMarks,
  usePickedYear,
  YEAR_PILL_SPACE,
  YearLinesSvg,
  YearPills,
} from '../body/ChartYearMarks';

export interface ChartPoint {
  date: string;
  value: number;
  id: string;
  /** The set behind the value, such as "100 kg × 5 @ RPE 8". */
  detail: string;
}

const PAD = { top: 12, right: 12, bottom: 24, left: 40 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Where each point, gridline and date label sits in a chart of the given size. */
export function chartModel(points: ChartPoint[], width: number, height: number, yearLines = false) {
  if (!points.length || width <= 0) return null;
  const times = points.map((point) => parseLocalDate(point.date).getTime());
  const values = points.map((point) => point.value);
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const span = Math.max(tMax - tMin, 1);
  const plotWidth = Math.max(width - PAD.left - PAD.right, 10);
  const x = (time: number) =>
    points.length === 1 ? PAD.left + plotWidth / 2 : PAD.left + ((time - tMin) / span) * plotWidth;
  const years = chartYearMarks(yearLines, tMin, tMax, x);
  // The year pills sit above the plot, so it starts lower while they show.
  const top = years.length ? YEAR_PILL_SPACE : PAD.top;
  const plotHeight = height - top - PAD.bottom;
  const y = (value: number) => top + (1 - (value - yMin) / (yMax - yMin || 1)) * plotHeight;
  const coords = points.map((point, index) => ({
    x: x(times[index]),
    y: y(point.value),
  }));
  // A record is a session that beat every earlier one in range.
  const records = new Set<number>();
  let best = -Infinity;
  points.forEach((point, index) => {
    if (point.value > best) {
      best = point.value;
      records.add(index);
    }
  });
  const count = Math.min(4, Math.max(2, Math.floor(plotWidth / 80)));
  const dates =
    points.length === 1
      ? [{ x: coords[0].x, label: shortDate(points[0].date) }]
      : Array.from({ length: count }, (_, index) => {
          const time = tMin + (span * index) / (count - 1);
          const date = new Date(time);
          return {
            x: x(time),
            label: `${date.getDate()} ${MONTHS[date.getMonth()]}`,
          };
        });
  return {
    coords,
    records,
    gridlines: ticks.map((value) => ({ y: y(value), value })),
    dates,
    baseline: y(yMin),
    top,
    years,
  };
}

/** Index of the point nearest to `x`, for tapping or dragging along the chart. */
export function nearestPoint(coords: { x: number }[], x: number) {
  return coords.reduce(
    (best, point, index) => (Math.abs(point.x - x) < Math.abs(coords[best].x - x) ? index : best),
    0,
  );
}

/** A session-by-session line chart; touching it shows the session under the finger. */
export function ProgressChart({
  points,
  label,
  unit,
  height = 200,
  markRecords,
  formatValue,
  yearLines = false,
}: {
  points: ChartPoint[];
  label: string;
  unit: string;
  height?: number;
  markRecords: boolean;
  formatValue: (value: number) => string;
  /** A dotted line at each 1 January and a pill per year, as on the web's landscape chart. */
  yearLines?: boolean;
}) {
  const { colors, type } = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [pickedYear, setPickedYear] = usePickedYear(yearLines);
  const model = chartModel(points, width, height, yearLines);
  const pickedMark = model?.years.find((item) => item.year === pickedYear) ?? null;
  const active = selected !== null && selected < points.length ? selected : null;
  const select = (x: number) => {
    if (model) setSelected(nearestPoint(model.coords, x));
  };
  const line = model?.coords
    .map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`)
    .join(' ');
  const area =
    model && model.coords.length > 1
      ? `${line} L ${model.coords.at(-1)!.x} ${model.baseline} L ${model.coords[0].x} ${model.baseline} Z`
      : null;
  const shown = active !== null ? points[active] : points.at(-1);
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.footnote, type.number, { color: colors.secondary }]} numberOfLines={1}>
        {shown
          ? `${shortDate(shown.date)} · ${formatValue(shown.value)} ${unit} · ${shown.detail}`
          : ' '}
      </Text>
      <View
        accessibilityRole="image"
        accessibilityLabel={label}
        style={{ height }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => true}
        onResponderGrant={(event) => select(event.nativeEvent.locationX)}
        onResponderMove={(event) => select(event.nativeEvent.locationX)}
      >
        {model && (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="progress-fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.accent} stopOpacity={0.28} />
                <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>
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
                {formatValue(grid.value)}
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
            <YearLinesSvg
              years={model.years}
              picked={pickedMark}
              top={model.top}
              baseline={model.baseline}
            />
            {area && <Path d={area} fill="url(#progress-fill)" />}
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
            {model.coords.map((point, index) =>
              (markRecords && model.records.has(index)) || index === model.coords.length - 1 ? (
                <Circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r={markRecords && model.records.has(index) ? 3.5 : 4}
                  fill={markRecords && model.records.has(index) ? colors.gold : colors.accent}
                  stroke={colors.surface}
                  strokeWidth={1.5}
                />
              ) : null,
            )}
            {active !== null && (
              <>
                <Line
                  x1={model.coords[active].x}
                  x2={model.coords[active].x}
                  y1={model.top}
                  y2={model.baseline}
                  stroke={colors.lineStrong}
                  strokeWidth={1}
                />
                <Circle
                  cx={model.coords[active].x}
                  cy={model.coords[active].y}
                  r={5.5}
                  fill={colors.accent}
                  stroke={colors.surface}
                  strokeWidth={2}
                />
              </>
            )}
          </Svg>
        )}
        {model && model.years.length > 0 && (
          <YearPills
            years={model.years}
            pickedYear={pickedYear}
            onPick={setPickedYear}
            points={points}
            format={formatValue}
            unit={unit}
            width={width}
            summaryTop={Math.max(model.baseline - 40, model.top)}
          />
        )}
      </View>
    </View>
  );
}
