export const DEFAULT_CHART_WIDTH = 340;
export const DEFAULT_CHART_HEIGHT = 190;

/** Convert a screen position to the SVG's x axis, including rotation and scaling. */
export function chartPointerX(
  clientX: number,
  clientY: number,
  transform: Pick<DOMMatrix, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>,
): number | null {
  const { a, b, c, d, e, f } = transform;
  const determinant = a * d - b * c;
  if (!determinant) return null;
  return (d * (clientX - e) - c * (clientY - f)) / determinant;
}

export function paddedChartRange(
  values: Array<number | null>,
): { min: number; max: number } | null {
  const present = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (!present.length) return null;
  const rawMin = Math.min(...present);
  const rawMax = Math.max(...present);
  const spread = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.02, 1);
  return { min: rawMin - spread * 0.15, max: rawMax + spread * 0.15 };
}

export function responsiveChartWidth(
  renderedWidth: number,
  renderedHeight: number,
  minimumWidth = DEFAULT_CHART_WIDTH,
  viewBoxHeight = DEFAULT_CHART_HEIGHT,
): number {
  if (renderedWidth <= 0 || renderedHeight <= 0) return minimumWidth;
  return Math.max(minimumWidth, Math.round((renderedWidth / renderedHeight) * viewBoxHeight));
}

export function evenlySpacedChartIndexes(pointCount: number, tickCount: number): number[] {
  if (pointCount <= 0 || tickCount <= 0) return [];
  if (pointCount === 1 || tickCount === 1) return [0];

  const visibleTickCount = Math.min(pointCount, tickCount);
  return [
    ...new Set(
      Array.from({ length: visibleTickCount }, (_, index) =>
        Math.round((index / (visibleTickCount - 1)) * (pointCount - 1)),
      ),
    ),
  ];
}

/**
 * Baseline for a goal line's end label. A falling line keeps its label under the end, unless that
 * would sit on the date labels; then it goes above the line where the label starts, clear of it.
 */
export function goalLabelY(
  line: { x1: number; y1: number; x2: number; y2: number; label: string },
  plotBottom: number,
): number {
  if (line.y2 <= line.y1) return line.y2 - 6;
  const below = line.y2 + 14;
  if (below <= plotBottom - 2) return below;
  // 10.5px semibold text averages about 6px a character.
  const reach = Math.min(1, (line.label.length * 6 + 4) / Math.max(line.x2 - line.x1, 1));
  return line.y2 - (line.y2 - line.y1) * reach - 5;
}

const TICK_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const DAY_MS = 86_400_000;

/**
 * A time chart's x-axis labels. Over 45 days it labels months (with the year past 400 days),
 * thinned to about one per 56px; shorter spans get 2 to 4 evenly spaced day labels. `x` maps a
 * time (ms) to the chart's x, so each renderer passes its own width and insets.
 */
export function chartDateTicks(
  tMin: number,
  tMax: number,
  plotWidth: number,
  x: (time: number) => number,
): Array<{ x: number; label: string }> {
  const span = Math.max(tMax - tMin, 1);
  const spanDays = span / DAY_MS;
  const ticks: Array<{ x: number; label: string }> = [];
  if (spanDays > 45) {
    const start = new Date(tMin);
    for (
      let month = new Date(start.getFullYear(), start.getMonth() + 1, 1, 12);
      month.getTime() <= tMax;
      month = new Date(month.getFullYear(), month.getMonth() + 1, 1, 12)
    ) {
      ticks.push({
        x: x(month.getTime()),
        label:
          spanDays > 400
            ? `${TICK_MONTHS[month.getMonth()]} ’${String(month.getFullYear()).slice(2)}`
            : TICK_MONTHS[month.getMonth()],
      });
    }
    const every = Math.ceil(ticks.length / Math.max(Math.floor(plotWidth / 56), 1));
    return ticks.filter((_, index) => index % every === 0);
  }
  const count = Math.min(4, Math.max(2, Math.floor(plotWidth / 80)));
  for (let index = 0; index < count; index += 1) {
    const time = tMin + (span * index) / Math.max(count - 1, 1);
    const date = new Date(time);
    ticks.push({ x: x(time), label: `${date.getDate()} ${TICK_MONTHS[date.getMonth()]}` });
  }
  return ticks;
}

/** About how wide a label is in 10.5px semibold text (about 6px a character). */
export function chartLabelWidth(label: string): number {
  return label.length * 6 + 4;
}

function goalLabelAbove(line: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
}): number {
  if (line.y2 <= line.y1) return line.y2 - 6;
  const reach = Math.min(1, chartLabelWidth(line.label) / Math.max(line.x2 - line.x1, 1));
  return line.y2 - (line.y2 - line.y1) * reach - 5;
}

function goalLabelBelow(line: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
}): number {
  if (line.y2 >= line.y1) return line.y2 + 14;
  const reach = Math.min(1, chartLabelWidth(line.label) / Math.max(line.x2 - line.x1, 1));
  return line.y2 + (line.y1 - line.y2) * reach + 13;
}

/** Whether a plotted polyline passes through the horizontal/vertical box of a chart label. */
function seriesOverlapsBox(
  series: readonly { x: number; y: number }[],
  xLeft: number,
  xRight: number,
  yTop: number,
  yBottom: number,
): boolean {
  for (let index = 0; index < series.length; index += 1) {
    const a = series[index];
    if (a.x >= xLeft && a.x <= xRight && a.y >= yTop && a.y <= yBottom) return true;
    if (index === 0) continue;
    const prev = series[index - 1];
    const minX = Math.min(prev.x, a.x);
    const maxX = Math.max(prev.x, a.x);
    if (maxX < xLeft || minX > xRight) continue;
    const dx = a.x - prev.x;
    if (dx === 0) {
      if (Math.max(prev.y, a.y) >= yTop && Math.min(prev.y, a.y) <= yBottom) return true;
      continue;
    }
    const t0 = Math.max(0, Math.min(1, (xLeft - prev.x) / dx));
    const t1 = Math.max(0, Math.min(1, (xRight - prev.x) / dx));
    const lo = Math.min(t0, t1);
    const hi = Math.max(t0, t1);
    const ya = prev.y + (a.y - prev.y) * lo;
    const yb = prev.y + (a.y - prev.y) * hi;
    if (Math.max(ya, yb) >= yTop && Math.min(ya, yb) <= yBottom) return true;
  }
  return false;
}

/**
 * Where a goal line's end label goes so the whole label stays inside a chart `width` × `height`.
 * It starts from the web's rule (`goalLabelY`, or above a maintenance band's top edge, ending at
 * the line's end), then moves below or above when the text would cross the top or bottom, and
 * starts the label at the end instead when it would run off the left edge. When `series` is given
 * and the default side overlaps the plotted line, it flips to the opposite side if that is clear.
 */
export function goalLabelPlacement(
  line: { x1: number; y1: number; x2: number; y2: number; label: string },
  chart: { width: number; height: number; plotRight: number; plotBottom: number },
  bandTop?: number | null,
  series?: readonly { x: number; y: number }[],
): { x: number; y: number; anchor: 'start' | 'end' } {
  const ascent = 9; // cap height of 10.5px text, above its baseline
  const descent = 3;
  const labelWidth = chartLabelWidth(line.label);
  let y = bandTop != null ? bandTop - 6 : goalLabelY(line, chart.plotBottom);
  if (y - ascent < 0) {
    const below = (bandTop ?? Math.min(line.y1, line.y2)) + 14;
    y = below + descent <= chart.plotBottom ? below : ascent + 1;
  }
  y = Math.min(y, chart.plotBottom - descent);
  const end = Math.min(line.x2, chart.plotRight) - 4;
  let x: number;
  let anchor: 'start' | 'end';
  if (end - labelWidth >= 0) {
    x = end;
    anchor = 'end';
  } else {
    const start = Math.max(Math.min(line.x2, chart.plotRight) + 4, 0);
    x = Math.min(start, chart.width - labelWidth);
    anchor = 'start';
  }
  if (bandTop == null && series && series.length > 0) {
    const xLeft = anchor === 'end' ? x - labelWidth : x;
    const xRight = anchor === 'end' ? x : x + labelWidth;
    const margin = 2;
    if (seriesOverlapsBox(series, xLeft, xRight, y - ascent - margin, y + descent + margin)) {
      const opposite = y > line.y2 ? goalLabelAbove(line) : goalLabelBelow(line);
      if (
        opposite - ascent >= 0 &&
        opposite + descent <= chart.plotBottom &&
        !seriesOverlapsBox(
          series,
          xLeft,
          xRight,
          opposite - ascent - margin,
          opposite + descent + margin,
        )
      ) {
        y = opposite;
      }
    }
  }
  return { x, y, anchor };
}
