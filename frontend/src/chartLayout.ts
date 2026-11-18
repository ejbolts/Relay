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
