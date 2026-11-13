import { useEffect, useMemo, useRef, useState } from 'react';
import { EDGE_SWIPE_START_PX } from './edgeSwipe';
import { chartPointerX } from './chartLayout';
import { Icon } from './Icon';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { niceTicks, parseLocalDate, shortDate } from './trainingSummary';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function useElementSize<T extends HTMLElement>(fallback: number, fallbackHeight = 0) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: fallback, height: fallbackHeight });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      // Layout width, not the visual box: the landscape viewer rotates the chart with a transform.
      const width = Math.round(element.clientWidth);
      const height = Math.round(element.clientHeight);
      if (width > 0 && height > 0) {
        setSize((current) =>
          current.width === width && current.height === height ? current : { width, height },
        );
      }
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}

export interface TrendPoint {
  date: string;
  value: number;
  /** Secondary tooltip line, e.g. “125 kg × 7 · RPE 8”. */
  detail?: string;
  id?: string;
}

export interface TrendChartProps {
  points: TrendPoint[];
  label: string;
  seriesLabel: string;
  unit: string;
  height?: number;
  /** Fit the available height in the expanded viewer and follow viewport changes. */
  fillHeight?: boolean;
  /** Mark each new running maximum as a record. */
  markRecords?: boolean;
  /** Lower-is-better series mark running minimums instead. */
  recordDirection?: 'up' | 'down';
  goal?: number | null;
  goalLabel?: string;
  /** A sloped target line, e.g. a dated bodyweight goal. */
  goalPath?: GoalPath | null;
  area?: boolean;
  /** Extra context drawn as small de-emphasised dots (e.g. daily weigh-ins behind an average). */
  backgroundPoints?: TrendPoint[];
  formatValue?: (value: number) => string;
  onSelect?: (point: TrendPoint) => void;
}

export interface GoalPath {
  startDate: string;
  startValue: number;
  endDate: string;
  endValue: number;
  label: string;
  minValue?: number;
  maxValue?: number;
}

const defaultFormat = (value: number) => Number(value.toFixed(1)).toLocaleString('en-GB');

export function TrendChart({
  points,
  label,
  seriesLabel,
  unit,
  height: compactHeight = 190,
  fillHeight = false,
  markRecords = false,
  recordDirection = 'up',
  goal = null,
  goalLabel,
  goalPath = null,
  area = true,
  backgroundPoints = [],
  formatValue = defaultFormat,
  onSelect,
}: TrendChartProps) {
  const { ref, width, height: measuredHeight } = useElementSize<HTMLDivElement>(340, compactHeight);
  const height = fillHeight ? measuredHeight : compactHeight;
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pad = { left: 40, right: 12, top: 12, bottom: 26 };

  const model = useMemo(() => {
    if (!points.length) return null;
    const times = points.map((point) => parseLocalDate(point.date).getTime());
    const allValues = [
      ...points.map((point) => point.value),
      ...backgroundPoints.map((point) => point.value),
      ...(goal === null ? [] : [goal]),
      ...(goalPath ? [goalPath.startValue, goalPath.endValue] : []),
      ...(goalPath?.minValue != null && goalPath?.maxValue != null
        ? [goalPath.minValue, goalPath.maxValue]
        : []),
    ];
    const ticks = niceTicks(Math.min(...allValues), Math.max(...allValues), 4);
    const yMin = ticks[0];
    const yMax = ticks[ticks.length - 1];
    const backgroundTimes = backgroundPoints.map((point) => parseLocalDate(point.date).getTime());
    const goalTimes = goalPath
      ? [parseLocalDate(goalPath.startDate).getTime(), parseLocalDate(goalPath.endDate).getTime()]
      : [];
    const tMin = Math.min(...times, ...backgroundTimes, ...goalTimes);
    const tMax = Math.max(...times, ...backgroundTimes, ...goalTimes);
    const span = Math.max(tMax - tMin, 1);
    const plotWidth = Math.max(width - pad.left - pad.right, 10);
    const plotHeight = height - pad.top - pad.bottom;
    const x = (time: number) =>
      points.length === 1 && !backgroundPoints.length && !goalPath
        ? pad.left + plotWidth / 2
        : pad.left + ((time - tMin) / span) * plotWidth;
    const y = (value: number) => pad.top + (1 - (value - yMin) / (yMax - yMin || 1)) * plotHeight;
    const coords = points.map((point, index) => ({ x: x(times[index]), y: y(point.value) }));
    const goalLine = goalPath
      ? {
          x1: x(goalTimes[0]),
          y1: y(goalPath.startValue),
          x2: x(goalTimes[1]),
          y2: y(goalPath.endValue),
          label: goalPath.label,
        }
      : null;
    const records = new Set<number>();
    if (markRecords) {
      let best = recordDirection === 'up' ? -Infinity : Infinity;
      points.forEach((point, index) => {
        if (recordDirection === 'up' ? point.value > best : point.value < best) {
          best = point.value;
          records.add(index);
        }
      });
    }
    const dayMs = 86_400_000;
    const spanDays = span / dayMs;
    const xTicks: Array<{ x: number; label: string }> = [];
    if (spanDays > 45) {
      const start = new Date(tMin);
      for (
        let month = new Date(start.getFullYear(), start.getMonth() + 1, 1, 12);
        month.getTime() <= tMax;
        month = new Date(month.getFullYear(), month.getMonth() + 1, 1, 12)
      ) {
        xTicks.push({
          x: x(month.getTime()),
          label:
            spanDays > 400
              ? `${MONTHS[month.getMonth()]} ’${String(month.getFullYear()).slice(2)}`
              : MONTHS[month.getMonth()],
        });
      }
      const every = Math.ceil(xTicks.length / Math.max(Math.floor(plotWidth / 56), 1));
      return {
        ticks,
        y,
        coords,
        records,
        background: backgroundPoints.map((point, index) => ({
          x: x(backgroundTimes[index]),
          y: y(point.value),
        })),
        xTicks: xTicks.filter((_, index) => index % every === 0),
        baseline: y(yMin),
        goalLine,
      };
    }
    const count = Math.min(4, Math.max(2, Math.floor(plotWidth / 80)));
    for (let index = 0; index < count; index += 1) {
      const time = tMin + (span * index) / Math.max(count - 1, 1);
      const date = new Date(time);
      xTicks.push({ x: x(time), label: `${date.getDate()} ${MONTHS[date.getMonth()]}` });
    }
    return {
      ticks,
      y,
      coords,
      records,
      background: backgroundPoints.map((point, index) => ({
        x: x(backgroundTimes[index]),
        y: y(point.value),
      })),
      xTicks: points.length === 1 ? [{ x: coords[0].x, label: shortDate(points[0].date) }] : xTicks,
      baseline: y(yMin),
      goalLine,
    };
    // pad is a constant literal; width/height drive the layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, backgroundPoints, goal, goalPath, width, height, markRecords, recordDirection]);

  useEffect(() => {
    setActive(null);
  }, [points]);

  if (!model) {
    return (
      <div className="pulse-chart pulse-chart-empty" ref={ref}>
        No values in this range yet.
      </div>
    );
  }

  const { coords, records, ticks, y, xTicks, baseline, background, goalLine } = model;
  const line = coords
    .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join('');
  const areaPath =
    coords.length > 1
      ? `${line}L${coords.at(-1)!.x.toFixed(1)},${baseline}L${coords[0].x.toFixed(1)},${baseline}Z`
      : '';
  // Changing data (range, metric, exercise) re-runs the draw-in animation; hover does not.
  const drawKey = `${points.length}:${points[0]?.date}:${points.at(-1)?.date}:${points.at(-1)?.value}`;
  const activePoint = active === null ? null : points[active];
  const activeCoord = active === null ? null : coords[active];

  function selectAt(event: ReactPointerEvent<SVGSVGElement>) {
    const transform = event.currentTarget.getScreenCTM();
    if (!transform) return;
    const chartX = chartPointerX(event.clientX, event.clientY, transform);
    if (chartX === null) return;
    let nearest = 0;
    coords.forEach((point, index) => {
      if (Math.abs(point.x - chartX) < Math.abs(coords[nearest].x - chartX)) nearest = index;
    });
    setActive(nearest);
  }

  function onKeyDown(event: ReactKeyboardEvent<SVGSVGElement>) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setActive((current) => {
        const start = current ?? points.length - 1;
        return Math.min(
          points.length - 1,
          Math.max(0, start + (event.key === 'ArrowLeft' ? -1 : 1)),
        );
      });
    } else if (event.key === 'Enter' && activePoint && onSelect) {
      onSelect(activePoint);
    } else if (event.key === 'Escape') {
      setActive(null);
    }
  }

  const tooltipLeft = activeCoord
    ? Math.min(Math.max(activeCoord.x - 70, 4), Math.max(width - 144, 4))
    : 0;

  return (
    <div className="pulse-chart" ref={ref}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label}. Drag across the chart or use the arrow keys to read each value.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          // Leave touches in the left edge zone to the swipe-back gesture (touch input is
          // implicitly captured by the element it lands on, so release that too).
          if (
            event.clientX <= EDGE_SWIPE_START_PX &&
            !event.currentTarget.closest('.landscape-chart-expanded')
          ) {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            return;
          }
          event.currentTarget.setPointerCapture(event.pointerId);
          selectAt(event);
        }}
        onPointerMove={(event) => {
          if (
            event.pointerType === 'mouse' ||
            event.currentTarget.hasPointerCapture(event.pointerId)
          ) {
            selectAt(event);
          }
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setActive(null);
        }}
      >
        {ticks.map((tick, index) => (
          <g key={tick}>
            <line
              className={index === 0 ? 'pulse-chart-baseline' : 'pulse-chart-grid'}
              x1={pad.left}
              x2={width - pad.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="pulse-chart-tick" x={pad.left - 7} y={y(tick) + 3.5} textAnchor="end">
              {tick.toLocaleString('en-GB')}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text
            className="pulse-chart-tick"
            key={`${tick.label}-${tick.x}`}
            x={tick.x}
            y={height - 7}
            textAnchor="middle"
          >
            {tick.label}
          </text>
        ))}
        {goal !== null && (
          <g className="pulse-chart-goal">
            <line x1={pad.left} x2={width - pad.right} y1={y(goal)} y2={y(goal)} />
            <text x={pad.left + 6} y={y(goal) - 6}>
              {goalLabel ?? `Goal ${formatValue(goal)} ${unit}`}
            </text>
          </g>
        )}
        {goalLine && (
          <g className="pulse-chart-goal pulse-chart-goal-path">
            {goalPath?.minValue != null && goalPath?.maxValue != null ? (
              <>
                <rect
                  className="pulse-chart-goal-band"
                  x={goalLine.x1}
                  y={y(goalPath.maxValue)}
                  width={Math.max(1, goalLine.x2 - goalLine.x1)}
                  height={y(goalPath.minValue) - y(goalPath.maxValue)}
                />
                <line
                  x1={goalLine.x1}
                  y1={y(goalPath.minValue)}
                  x2={goalLine.x2}
                  y2={y(goalPath.minValue)}
                />
                <line
                  x1={goalLine.x1}
                  y1={y(goalPath.maxValue)}
                  x2={goalLine.x2}
                  y2={y(goalPath.maxValue)}
                />
              </>
            ) : (
              <line x1={goalLine.x1} y1={goalLine.y1} x2={goalLine.x2} y2={goalLine.y2} />
            )}
            <text
              x={Math.min(goalLine.x2, width - pad.right) - 4}
              y={
                goalPath?.maxValue != null
                  ? y(goalPath.maxValue) - 6
                  : goalLine.y2 + (goalLine.y2 > goalLine.y1 ? 14 : -6)
              }
              textAnchor="end"
            >
              {goalLine.label}
            </text>
          </g>
        )}
        {background.map((point, index) => (
          <circle className="pulse-chart-bg-dot" key={index} cx={point.x} cy={point.y} r="2.4" />
        ))}
        {area && areaPath && (
          <path className="pulse-chart-area" d={areaPath} key={`area-${drawKey}`} />
        )}
        <path className="pulse-chart-line" d={line} pathLength={1} key={`line-${drawKey}`} />
        {coords.map((point, index) =>
          records.has(index) || (index === coords.length - 1 && !markRecords) ? (
            <circle className="pulse-chart-marker" key={index} cx={point.x} cy={point.y} r="4" />
          ) : null,
        )}
        {activeCoord && (
          <g className="pulse-chart-cursor" aria-hidden="true">
            <line x1={activeCoord.x} x2={activeCoord.x} y1={pad.top} y2={baseline} />
            <circle cx={activeCoord.x} cy={activeCoord.y} r="5" />
          </g>
        )}
      </svg>
      {activePoint && activeCoord && (
        <div
          className="pulse-chart-tooltip"
          style={{ left: tooltipLeft, top: Math.max(activeCoord.y - 66, 0) }}
        >
          <button
            type="button"
            className="pulse-chart-tooltip-close"
            aria-label={`Close ${shortDate(activePoint.date)} details`}
            onClick={() => {
              setActive(null);
              // Keep keyboard focus on the chart rather than losing it with the popup.
              svgRef.current?.focus({ preventScroll: true });
            }}
          >
            <Icon name="close" />
          </button>
          <span aria-hidden="true">{shortDate(activePoint.date)}</span>
          <strong aria-hidden="true">
            {formatValue(activePoint.value)} {unit}
          </strong>
          <small aria-hidden="true">
            {seriesLabel}
            {records.has(active!) ? ' · record' : ''}
            {activePoint.detail ? ` · ${activePoint.detail}` : ''}
          </small>
          {onSelect && (
            <button
              type="button"
              className="pulse-chart-tooltip-open"
              onClick={() => onSelect(activePoint)}
            >
              Open workout
            </button>
          )}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {activePoint
          ? `${shortDate(activePoint.date)}: ${seriesLabel} ${formatValue(activePoint.value)} ${unit}${activePoint.detail ? `, ${activePoint.detail}` : ''}`
          : ''}
      </p>
    </div>
  );
}

/** Weekly mini columns: history de-emphasised, the current period in the accent. */
export function SparkBars({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="pulse-sparkbars" role="img" aria-label={label}>
      {values.map((value, index) => (
        <i
          key={index}
          style={
            {
              height: `${Math.max(8, (value / max) * 100)}%`,
              '--d': `${index * 28}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

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
  const { ref, width } = useElementSize<HTMLDivElement>(140, height);
  if (values.length < 2) return <div className="pulse-sparkline" ref={ref} />;
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
    <div className="pulse-sparkline" ref={ref} style={yAxis ? { height } : undefined}>
      <svg width={width} height={height} role="img" aria-label={label}>
        {ticks.map((tick) => (
          <g className="pulse-sparkline-axis" key={tick}>
            <line x1={left} x2={width - 5} y1={y(tick)} y2={y(tick)} />
            <text x={left - 7} y={y(tick)} textAnchor="end" dominantBaseline="middle">
              {tickLabel(tick)}
            </text>
          </g>
        ))}
        <path d={path} pathLength={1} />
        <circle cx={x(values.length - 1)} cy={y(values.at(-1)!)} r="3.5" />
      </svg>
    </div>
  );
}

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className="pulse-meter"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <i style={{ width: `${percent}%` }} />
    </div>
  );
}
