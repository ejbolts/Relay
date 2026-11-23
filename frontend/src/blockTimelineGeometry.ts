import { firstBlockYear, lastBlockYear } from './trainingBlockSegments';
import { MONTHS } from './trainingBlocks';
import { addDays, daysBetween, parseLocalDate } from './trainingSummary';
import type { TrainingBlocks } from './types';

// The continuous training timeline's geometry, shared by the web's ScrollTimeline and the app's:
// where each day sits at a zoom (pixels per day), its gridlines and labels, and zooming about
// a point so the date under the fingers stays put.

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export interface TimelineSpan {
  first: number;
  last: number;
  /** 1 January of the first year. */
  start: string;
  /** 1 January after the last year. */
  end: string;
  /** Days from start to end. */
  total: number;
}

/** The whole years the timeline covers: every block, the history before them, and today. */
export function timelineSpan(config: TrainingBlocks, today: string): TimelineSpan {
  const first = firstBlockYear(config, today);
  const last = lastBlockYear(config, today);
  const start = `${first}-01-01`;
  const end = `${last + 1}-01-01`;
  return { first, last, start, end, total: daysBetween(start, end) };
}

/** Zoom in pixels per day: from the whole history in view to about two weeks across. */
export function timelineZoomLimits(width: number, total: number) {
  return { min: width / Math.max(total, 1), max: width / 14, initial: width / 365 };
}

/** The zoom shown: the chosen one, or a year across, kept within the limits. */
export function timelineZoom(chosen: number | null, width: number, total: number): number {
  const limits = timelineZoomLimits(width, total);
  return clamp(chosen ?? limits.initial, limits.min, limits.max);
}

/** A day's distance from the timeline's start, in pixels. */
export function timelineX(span: TimelineSpan, zoom: number, day: string): number {
  return clamp(daysBetween(span.start, day), 0, span.total) * zoom;
}

/**
 * Zooming to `target` about `focal` pixels from the view's left edge: the scroll position that
 * keeps the date under that point in place, and the zoom actually used.
 */
export function zoomAbout(
  scrollLeft: number,
  focal: number,
  zoom: number,
  target: number,
  width: number,
  total: number,
): { zoom: number; scrollLeft: number } {
  const limits = timelineZoomLimits(width, total);
  const next = clamp(target, limits.min, limits.max);
  return { zoom: next, scrollLeft: ((scrollLeft + focal) / zoom) * next - focal };
}

/** The year at the middle of the view, or null outside the timeline's years. */
export function timelineCentreYear(
  span: TimelineSpan,
  zoom: number,
  scrollLeft: number,
  viewWidth: number,
): number | null {
  const centre = addDays(span.start, Math.floor((scrollLeft + viewWidth / 2) / zoom));
  const year = Number(centre.slice(0, 4));
  return year >= span.first && year <= span.last ? year : null;
}

export interface TimelineLine {
  key: string;
  left: number;
  kind: 'year' | 'month' | 'week';
}

export interface TimelineLabel {
  key: string;
  left: number;
  text: string;
  year: boolean;
}

/** Gridlines and labels: years always, months when there is room, weeks once readable. */
export function timelineMarks(
  span: TimelineSpan,
  zoom: number,
): { lines: TimelineLine[]; labels: TimelineLabel[] } {
  const x = (day: string) => timelineX(span, zoom, day);
  const monthWidth = zoom * 30.4;
  const lines: TimelineLine[] = [];
  const labels: TimelineLabel[] = [];
  for (let year = span.first; year <= span.last; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const day = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      if (month === 0) {
        if (year > span.first) lines.push({ key: day, left: x(day), kind: 'year' });
        labels.push({ key: day, left: x(day), text: String(year), year: true });
      } else if (monthWidth >= 6) {
        lines.push({ key: day, left: x(day), kind: 'month' });
        // Initials leave no room after a year label, so February gives way to the year.
        if (monthWidth >= 16 && (monthWidth >= 34 || month > 1))
          labels.push({
            key: day,
            left: x(day),
            text: monthWidth >= 34 ? MONTHS[month] : MONTHS[month].charAt(0),
            year: false,
          });
      }
    }
  }
  if (zoom * 7 >= 12) {
    const offset = (8 - parseLocalDate(span.start).getDay()) % 7;
    for (let day = addDays(span.start, offset); day < span.end; day = addDays(day, 7)) {
      if (day.slice(8) !== '01') lines.push({ key: `w${day}`, left: x(day), kind: 'week' });
    }
  }
  return { lines, labels };
}
