import { builtinTypeColors, DEFAULT_WORKOUT_TYPES } from '../../../../frontend/src/workoutTypes';
import { calendarBounds, calendarMonthView, ringSegments, shiftMonth } from './calendarModel';
import { chartModel, nearestPoint } from './ProgressChart';
import { dashboard } from './trainingFixtures';

const view = (hidden: string[] = [], weekStartDay = 1) =>
  calendarMonthView({
    month: '2026-11',
    entries: dashboard.heatmap,
    types: DEFAULT_WORKOUT_TYPES,
    categoryColors: builtinTypeColors(DEFAULT_WORKOUT_TYPES),
    hidden: new Set(hidden),
    weekStartDay,
    today: '2026-11-22',
  });
const day = (month: ReturnType<typeof view>, date: string) =>
  month.weeks.flat().find((item) => item?.date === date)!;

test('pages months across year ends', () => {
  expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  expect(shiftMonth('2026-12', 1)).toBe('2027-01');
});

test('reaches from the oldest workout to this month', () => {
  expect(calendarBounds('2026-11-22', ['2026-03-02', null, '2026-11-10'])).toEqual({
    first: '2026-03',
    last: '2026-11',
  });
  expect(calendarBounds('2026-11-22', [undefined])).toEqual({ first: '2026-11', last: '2026-11' });
});

test('rings each day in its workout types’ colours, with arcs for a mixed day', () => {
  const month = view();
  expect(month.title).toMatch(/November 2026/);
  expect(month.weeks).toHaveLength(6);
  expect(month.weekdays).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  // 1 November 2026 is a Sunday, so a Monday-first week leaves six empty days before it.
  expect(month.weeks[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
  expect(day(month, '2026-11-21').ring).toEqual(['#8b5cf6', '#22c55e']);
  expect(day(month, '2026-11-19').ring).toEqual(['#f59e0b']);
  expect(day(month, '2026-11-22')).toMatchObject({ today: true, ring: [], entry: undefined });
  expect(day(month, '2026-11-23').future).toBe(true);
  expect(month.legend.map((type) => type.name)).toEqual([
    'Upper body',
    'Lower body',
    'Pull',
    'Cardio',
  ]);
});

test('greys out the types switched off in the legend', () => {
  const month = view(['cardio', 'lower']);
  expect(day(month, '2026-11-21')).toMatchObject({ ring: ['#8b5cf6'], dots: ['#8b5cf6', null] });
  expect(day(month, '2026-11-19')).toMatchObject({ ring: [], filteredOut: true });
});

test('starts the week on the preferred day', () => {
  expect(view([], 0).weekdays[0]).toBe('S');
  expect(view([], 0).weeks[0][0]?.date).toBe('2026-11-01');
});

test('splits a mixed day’s outline into equal arcs with gaps', () => {
  expect(ringSegments(['red'], 100)).toEqual([{ color: 'red', length: 100, offset: 0 }]);
  const arcs = ringSegments(['red', 'blue'], 360);
  expect(arcs.map((arc) => [arc.length, arc.offset])).toEqual([
    [170, 5],
    [170, 185],
  ]);
});

test('lays out the progress chart and finds the session under a finger', () => {
  const points = [
    { date: '2026-11-01', value: 100, id: 'a', detail: '' },
    { date: '2026-11-08', value: 95, id: 'b', detail: '' },
    { date: '2026-11-15', value: 110, id: 'c', detail: '' },
  ];
  const model = chartModel(points, 300, 200)!;
  expect(model.coords[0].x).toBeLessThan(model.coords[2].x);
  // Higher values sit higher up.
  expect(model.coords[2].y).toBeLessThan(model.coords[0].y);
  expect([...model.records]).toEqual([0, 2]);
  expect(nearestPoint(model.coords, model.coords[1].x + 5)).toBe(1);
  expect(chartModel([], 300, 200)).toBeNull();
});
