import { describe, expect, it } from 'vitest';
import {
  timelineCentreYear,
  timelineMarks,
  timelineX,
  timelineZoom,
  zoomAbout,
  type TimelineSpan,
} from './blockTimelineGeometry';

const span: TimelineSpan = {
  first: 2025,
  last: 2026,
  start: '2025-01-01',
  end: '2027-01-01',
  total: 730,
};

describe('block timeline geometry', () => {
  it('opens a year across and keeps zoom between all history and two weeks', () => {
    expect(timelineZoom(null, 365, span.total)).toBe(1);
    expect(timelineZoom(0.01, 365, span.total)).toBe(0.5);
    expect(timelineZoom(1000, 364, span.total)).toBe(26);
  });

  it('keeps the date under the fingers in place while zooming', () => {
    const zoomed = zoomAbout(100, 50, 1, 2, 365, span.total);
    expect(zoomed.zoom).toBe(2);
    expect((zoomed.scrollLeft + 50) / zoomed.zoom).toBe(150);
  });

  it('places days and finds the centre year', () => {
    expect(timelineX(span, 2, '2025-01-11')).toBe(20);
    expect(timelineX(span, 2, '2030-01-01')).toBe(1460);
    expect(timelineCentreYear(span, 1, 400, 100)).toBe(2026);
  });

  it('adds month labels and then week lines as zoom grows', () => {
    const year = timelineMarks(span, 0.1);
    expect(year.labels.map((label) => label.text)).toEqual(['2025', '2026']);
    const months = timelineMarks(span, 1.2);
    expect(months.labels.some((label) => label.text === 'Mar')).toBe(true);
    expect(months.lines.some((line) => line.kind === 'week')).toBe(false);
    expect(timelineMarks(span, 2).lines.some((line) => line.kind === 'week')).toBe(true);
  });
});
