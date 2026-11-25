import { workoutTypeColor } from './dayColors';
import type { HeatmapDay, WorkoutType, WorkoutTypeColors } from './types';
import { calendarDayTypes } from './workoutTypes';

// Plain functions with no React or browser APIs: the web's calendar and week strip and the native
// app (mobile/) both colour days from here. Keep this file and its imports free of packages and
// DOM access; the mobile checks build them too.

/**
 * How a calendar day is drawn: its workout types, the colours of its outline (only the types
 * still switched on in the legend) and, for a day with nothing logged, the split's planned or
 * missed workout as a faint outline, split into arcs on a mixed day.
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
  /** The workout types a split plans on a date: days ahead, and past days it was missed. */
  splitDays?: ReadonlyMap<string, readonly string[]>;
}) {
  const dayTypes = entry ? calendarDayTypes(entry, types) : [];
  const ring = dayTypes
    .filter((type) => !hiddenCategories?.has(type.id))
    .map((type) => workoutTypeColor(type, categoryColors));
  const filteredOut = dayTypes.length > 0 && ring.length === 0;
  const scheduledIds = entry || inProgress ? [] : (splitDays?.get(date) ?? []);
  const scheduled = scheduledIds.flatMap((id) => types.filter((type) => type.id === id));
  const scheduledRing = scheduled
    .filter((type) => !hiddenCategories?.has(type.id))
    .map((type) => workoutTypeColor(type, categoryColors));
  return {
    dayTypes,
    ring,
    filteredOut,
    /** The split's workout types for the day, several on a mixed day. */
    scheduled,
    scheduledRing,
    scheduledNote: scheduled.length
      ? `${scheduled.map((type) => type.name).join(' + ')} ${date < today ? 'missed' : 'planned'}`
      : null,
  };
}

/**
 * The colours of today's outline and its ripple, so today always shows the workout type it is
 * for: the type being logged while a workout is live, the types logged today, or, before
 * anything is started, the types the split plans for today. Empty means the plain accent outline.
 */
export function todayOutlineColors(
  look: Pick<ReturnType<typeof calendarDayLook>, 'ring' | 'scheduledRing'>,
  liveColor: string | null = null,
): string[] {
  if (liveColor) return [liveColor];
  return look.ring.length ? look.ring : look.scheduledRing;
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
