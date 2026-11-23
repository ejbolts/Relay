import type { CardioScreenshotScan, CardioSessionInput, Exercise, WorkoutSetInput } from './types';

export function cardioSessionUpdateFromScan(scan: CardioScreenshotScan, exercises: Exercise[]) {
  const scannedExercise = exercises.find(
    (exercise) => exercise.name.toLocaleLowerCase() === scan.activity_type?.toLocaleLowerCase(),
  );
  const update: Partial<CardioSessionInput> = {
    ...(scan.session_date == null ? {} : { session_date: scan.session_date }),
    ...(scannedExercise
      ? { exercise_id: scannedExercise.id, activity_type: scannedExercise.name }
      : {}),
    ...(scan.duration_minutes == null ? {} : { duration_minutes: scan.duration_minutes }),
    calories_kcal: scan.calories_kcal,
    average_heart_rate_bpm: scan.average_heart_rate_bpm,
    distance_km: scan.distance_km,
    average_speed_kph: scan.average_speed_kph,
    incline_percent: null,
    average_power_watts: null,
    average_mets: null,
    elevation_gain_m: scan.elevation_gain_m ?? null,
  };
  const activityWarning =
    scan.activity_type && !scannedExercise
      ? `${scan.activity_type} is not in the activity list, so the current activity was kept.`
      : null;
  return { update, warning: [activityWarning, scan.warning].filter(Boolean).join(' ') };
}

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
