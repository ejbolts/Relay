import { bodyGoalTarget, maintenanceRange } from './bodyMeasurementHistory';
import { clipBodyWeightGoalPath } from './bodyTrend';
import type { SharedGoals } from './types';
import { weightFromKg, type WeightUnit } from './weightUnits';

// Pure chart helpers matching SharedProfiles.tsx's BodyWeightCard (shared with mobile/; switch
// SharedProfiles.tsx to import from here once #350 lands).

export interface SharedBodyWeightGoalPath {
  startDate: string;
  startValue: number;
  endDate: string;
  endValue: number;
  label: string;
  minValue?: number;
  maxValue?: number;
}

/** The goal line within the charted dates, labelled like the Body screen's. */
export function sharedBodyWeightGoalPath(
  goals: SharedGoals | null,
  startDate: string,
  endDate: string,
  weightUnit: WeightUnit,
): SharedBodyWeightGoalPath | null {
  const goal = goals?.body_weight;
  const clipped = goal ? clipBodyWeightGoalPath(goal, startDate, endDate) : null;
  if (!goal || !clipped) return null;
  return {
    startDate: clipped.start_date,
    startValue: weightFromKg(clipped.start_weight_kg, weightUnit),
    endDate: clipped.target_date,
    endValue: weightFromKg(clipped.target_weight_kg, weightUnit),
    ...(maintenanceRange(goal)
      ? {
          minValue: weightFromKg(goal.maintenance_min_kg!, weightUnit),
          maxValue: weightFromKg(goal.maintenance_max_kg!, weightUnit),
        }
      : {}),
    label: `Goal ${bodyGoalTarget(goal, weightUnit)}`,
  };
}

/** Converts recent shared weigh-ins (in kg) into the viewer's weight unit for charting. */
export function sharedBodyWeightChartPoints(
  recent: readonly { date: string; value: number }[],
  weightUnit: WeightUnit,
): Array<{ date: string; value: number }> {
  return recent.map((point) => ({
    ...point,
    value: weightFromKg(point.value, weightUnit),
  }));
}

/** Formats a charted profile body-weight value like web's TrendChart (e.g. "78 kg", "76.5 kg"). */
export function formatSharedBodyWeightChartValue(value: number, weightUnit: WeightUnit): string {
  return `${Number(value.toFixed(1)).toLocaleString('en-GB')} ${weightUnit}`;
}
