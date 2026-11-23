import { calendarMonths } from './calendarRange';
import { followsWorkouts, splitPreview } from './trainingSplit';
import type { TrainingSplit } from './types';

export function splitCalendarMonths(split: TrainingSplit, today: string, weekStartDay = 1) {
  return calendarMonths(today, 2, 0, weekStartDay).map((month) => ({
    ...month,
    days: splitPreview(split, month.first, month.cells.filter(Boolean).length).filter(
      ({ typeId }) => !followsWorkouts(split) || typeId !== undefined,
    ),
  }));
}
