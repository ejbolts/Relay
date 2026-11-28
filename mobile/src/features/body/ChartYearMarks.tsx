import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Line, Rect } from 'react-native-svg';
import {
  chartYearChange,
  chartYearLabel,
  chartYears,
  chartYearSummary,
} from '../../../../frontend/src/chartYears';
import { haptics } from '../../ui/haptics';
import { useTheme } from '../../ui/theme';

/**
 * Year lines on the app's long charts, as on the web (frontend/src/chartYears.ts): a dotted line
 * at each 1 January, and a pill per year above the plot that shows where that year started and
 * ended.
 */

/** Room above the plot for the year pills, as on the web. */
export const YEAR_PILL_SPACE = 40;
const SUMMARY_WIDTH = 260;

/** One calendar year's slice of a chart, in the chart's own coordinates. */
export interface YearMark {
  year: number;
  x0: number;
  x1: number;
}

/** The chart's years when the lines are on and it crosses a 1 January, else none. */
export function chartYearMarks(
  on: boolean,
  tMin: number,
  tMax: number,
  x: (time: number) => number,
): YearMark[] {
  if (!on) return [];
  return chartYears(tMin, tMax).map((item) => ({
    year: item.year,
    x0: x(item.start),
    x1: x(item.end),
  }));
}

/**
 * The year a chart has picked. Turning the lines off forgets it, so they come back with no year
 * picked, as on the web.
 */
export function usePickedYear(on: boolean) {
  const [picked, setPicked] = useState<{ year: number | null; on: boolean }>({
    year: null,
    on,
  });
  const year = picked.on === on ? picked.year : null;
  return [year, (next: number | null) => setPicked({ year: next, on })] as const;
}

/** The dotted lines and the picked year's shading, drawn inside the chart's Svg under the data. */
export function YearLinesSvg({
  years,
  picked,
  top,
  baseline,
}: {
  years: YearMark[];
  picked: YearMark | null;
  top: number;
  baseline: number;
}) {
  const { colors } = useTheme();
  return (
    <>
      {picked && (
        <Rect
          x={picked.x0}
          y={top}
          width={Math.max(picked.x1 - picked.x0, 1)}
          height={Math.max(baseline - top, 0)}
          fill={colors.accent}
          opacity={0.12}
        />
      )}
      {years.slice(1).map((item) => (
        <Line
          key={item.year}
          x1={item.x0}
          x2={item.x0}
          y1={top - 4}
          y2={baseline}
          stroke={colors.secondary}
          strokeOpacity={0.45}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray="0.1 5"
        />
      ))}
    </>
  );
}

/**
 * A pill per year above the plot, and the picked year's start, end and change near the bottom.
 * Tapping a pill picks its year; tapping it again clears it.
 */
export function YearPills({
  years,
  pickedYear,
  onPick,
  points,
  format,
  unit,
  width,
  summaryTop,
}: {
  years: YearMark[];
  pickedYear: number | null;
  onPick: (year: number | null) => void;
  points: readonly { date: string; value: number }[];
  format: (value: number) => string;
  unit: string;
  width: number;
  summaryTop: number;
}) {
  const { colors, type, radius } = useTheme();
  const picked = years.find((item) => item.year === pickedYear) ?? null;
  const change = picked ? chartYearChange(points, picked.year) : null;
  const summary = change ? chartYearSummary(change, format, unit) : null;
  const summaryLeft = picked
    ? Math.min(
        Math.max((picked.x0 + picked.x1) / 2 - SUMMARY_WIDTH / 2, 0),
        Math.max(width - SUMMARY_WIDTH, 0),
      )
    : 0;
  return (
    <>
      {years.map((item) => {
        const text = chartYearLabel(item.year, item.x1 - item.x0);
        if (!text) return null;
        const selected = item.year === pickedYear;
        return (
          <View
            key={item.year}
            pointerEvents="box-none"
            style={[styles.pillSlot, { left: item.x0, width: item.x1 - item.x0 }]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={String(item.year)}
              accessibilityState={{ selected }}
              accessibilityValue={selected && summary ? { text: summary } : undefined}
              hitSlop={{ top: 10, bottom: 10 }}
              onPress={() => {
                haptics.selection();
                onPick(selected ? null : item.year);
              }}
              style={({ pressed }) => [
                styles.pill,
                {
                  backgroundColor: selected ? colors.accent : colors.surface2,
                  borderColor: selected ? colors.accent : colors.lineStrong,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  type.caption,
                  type.number,
                  { color: selected ? colors.onAccent : colors.secondary, fontWeight: '600' },
                ]}
              >
                {text}
              </Text>
            </Pressable>
          </View>
        );
      })}
      {summary && (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.summarySlot, { left: summaryLeft, top: summaryTop }]}
        >
          <Text
            style={[
              type.footnote,
              type.number,
              styles.summary,
              {
                color: colors.text,
                backgroundColor: colors.surface2,
                borderColor: colors.lineStrong,
                borderRadius: radius.sm,
              },
            ]}
            numberOfLines={1}
          >
            {summary}
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  pillSlot: { position: 'absolute', top: 6, alignItems: 'center' },
  pill: {
    height: 24,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summarySlot: { position: 'absolute', width: SUMMARY_WIDTH, alignItems: 'center' },
  summary: {
    overflow: 'hidden',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontWeight: '600',
  },
});
