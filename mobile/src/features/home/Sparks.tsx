import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { niceTicks } from '../../../../frontend/src/trainingSummary';
import { useTheme } from '../../ui/theme';

/** Small weekly bars, as the web's stat cards draw under their number. */
export function SparkBars({ values, label }: { values: number[]; label: string }) {
  const { colors } = useTheme();
  const max = Math.max(...values, 1);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={sparkBars}>
      {values.map((value, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height: `${Math.max(8, (value / max) * 100)}%`,
            borderRadius: 2,
            backgroundColor: index === values.length - 1 ? colors.accent : colors.deemph,
          }}
        />
      ))}
    </View>
  );
}

const sparkBars = {
  height: 26,
  flexDirection: 'row' as const,
  alignItems: 'flex-end' as const,
  gap: 3,
};

/** A small line of recent values ending in a dot; with `yAxis`, three labelled gridlines. */
export function Sparkline({
  values,
  label,
  height = 34,
  yAxis = false,
}: {
  values: number[];
  label: string;
  height?: number;
  yAxis?: boolean;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const box = (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ height }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    />
  );
  if (values.length < 2 || width === 0) return box;
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  // Keep tiny changes legible without duplicate rounded labels, including a flat series.
  const bounds = yAxis
    ? niceTicks(dataMin, Math.max(dataMax, dataMin + 0.2), 2)
    : [dataMin, dataMax];
  const min = bounds[0];
  const max = bounds.at(-1)!;
  const ticks = yAxis ? [min, (min + max) / 2, max] : [];
  const tickLabel = (value: number) => Number(value.toFixed(2)).toLocaleString('en-GB');
  const left = yAxis ? Math.max(...ticks.map((tick) => tickLabel(tick).length)) * 6 + 8 : 4;
  const top = yAxis ? 8 : 5;
  const x = (index: number) => left + (index / (values.length - 1)) * (width - left - 5);
  const y = (value: number) => top + (1 - (value - min) / (max - min || 1)) * (height - top * 2);
  const path = values
    .map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`)
    .join('');
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ height }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Svg width={width} height={height}>
        {ticks.map((tick) => (
          <Line
            key={`grid-${tick}`}
            x1={left}
            x2={width - 5}
            y1={y(tick)}
            y2={y(tick)}
            stroke={colors.grid}
            strokeWidth={1}
          />
        ))}
        {ticks.map((tick) => (
          <SvgText
            key={`label-${tick}`}
            x={left - 7}
            y={y(tick) + 3.5}
            fontSize={10}
            fill={colors.muted}
            textAnchor="end"
          >
            {tickLabel(tick)}
          </SvgText>
        ))}
        <Path
          d={path}
          fill="none"
          stroke={colors.accent}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={x(values.length - 1)} cy={y(values.at(-1)!)} r={3.5} fill={colors.accent} />
      </Svg>
    </View>
  );
}

/** A thin progress bar. */
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const { colors } = useTheme();
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value }}
      style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: 'hidden' }}
    >
      <View
        style={{
          width: `${percent}%`,
          height: 6,
          borderRadius: 3,
          backgroundColor: percent >= 100 ? colors.good : colors.accent,
        }}
      />
    </View>
  );
}
