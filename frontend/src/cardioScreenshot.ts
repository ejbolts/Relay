import type { CardioScreenshotScan, WorkoutSetInput } from './types';

export function cardioSetUpdateFromScan(scan: CardioScreenshotScan): Partial<WorkoutSetInput> {
  return {
    ...(scan.duration_minutes === null ? {} : { duration_seconds: scan.duration_minutes * 60 }),
    ...(scan.distance_km === null ? {} : { distance_km: scan.distance_km }),
    ...(scan.average_speed_kph === null ? {} : { speed_kph: scan.average_speed_kph }),
    ...(scan.calories_kcal === null ? {} : { calories_kcal: scan.calories_kcal }),
    ...(scan.average_heart_rate_bpm === null
      ? {}
      : { average_heart_rate_bpm: scan.average_heart_rate_bpm }),
  };
}
