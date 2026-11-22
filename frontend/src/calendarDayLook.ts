import { workoutTypeColor } from './dayColors';
import type { HeatmapDay, WorkoutType, WorkoutTypeColors } from './types';
import { calendarDayTypes } from './workoutTypes';

// Plain functions with no React or browser APIs: the web's calendar and week strip and the native
// app (mobile/) both colour days from here. Keep this file and its imports free of packages and
// DOM access; the mobile checks build them too.

/**
 * How a calendar day is drawn: its workout types, the colours of its outline (only the types
 * still switched on in the legend) and, for a day with nothing logged, the split's planned or
 * missed workout as a faint outline.
 */
export function calendarDayLook({
  date,
  today,
  entry,
  inProgress = false,
  types,
  categoryColors,
  hiddenCategories,
  splitDays,
}: {
  date: string;
  today: string;
  entry: HeatmapDay | undefined;
  inProgress?: boolean;
  types: WorkoutType[];
  categoryColors?: WorkoutTypeColors;
  hiddenCategories?: ReadonlySet<string>;
  /** The workout type a split plans on a date: days ahead, and past days it was missed. */
  splitDays?: ReadonlyMap<string, string>;
}) {
  const dayTypes = entry ? calendarDayTypes(entry, types) : [];
  const ring = dayTypes
    .filter((type) => !hiddenCategories?.has(type.id))
    .map((type) => workoutTypeColor(type, categoryColors));
  const filteredOut = dayTypes.length > 0 && ring.length === 0;
  const scheduledId = entry || inProgress ? undefined : splitDays?.get(date);
  const scheduled = scheduledId ? types.find((type) => type.id === scheduledId) : undefined;
  const scheduledColor =
    scheduled && !hiddenCategories?.has(scheduled.id)
      ? workoutTypeColor(scheduled, categoryColors)
      : null;
  return {
    dayTypes,
    ring,
    filteredOut,
    scheduled,
    scheduledColor,
    scheduledNote: scheduled ? `${scheduled.name} ${date < today ? 'missed' : 'planned'}` : null,
  };
}

/**
 * The names a week strip tile shows: two fit, so with three or more types the second line counts
 * the rest instead ("+2"). "Upper body" and friends lose the repeated word to fit the tile. A
 * type switched off in the legend keeps its name but loses its colour (null).
 */
export function weekStripLabels(
  dayTypes: WorkoutType[],
  categoryColors?: WorkoutTypeColors,
  hiddenCategories?: ReadonlySet<string>,
) {
  return dayTypes.slice(0, 2).map((type, index) => {
    const counted = index === 1 && dayTypes.length > 2;
    return {
      id: type.id,
      text: counted ? `+${dayTypes.length - 1}` : type.name.replace(/ body$/i, ''),
      color:
        counted || hiddenCategories?.has(type.id) ? null : workoutTypeColor(type, categoryColors),
    };
  });
}
