import type { CardioMetricsInput, CardioSession, CardioSessionInput, Exercise } from './types';

export type CardioMetricKey = keyof CardioMetricsInput;

interface MetricField {
  key: CardioMetricKey;
  label: string;
  min: number;
  max: number;
  step: number;
  placeholder?: string;
  cyclingOnly?: boolean;
}

const metricFields: MetricField[] = [
  { key: 'calories_kcal', label: 'Calories (kcal)', min: 0, max: 100_000, step: 1 },
  { key: 'average_heart_rate_bpm', label: 'Average HR (bpm)', min: 20, max: 250, step: 1 },
  { key: 'distance_km', label: 'Distance (km)', min: 0, max: 10_000, step: 0.01 },
  { key: 'average_speed_kph', label: 'Average speed (km/h)', min: 0, max: 100, step: 0.1 },
  { key: 'incline_percent', label: 'Incline (%)', min: 0, max: 100, step: 0.1 },
  {
    key: 'average_power_watts',
    label: 'Average power (watts)',
    min: 1,
    max: 3_000,
    step: 1,
    cyclingOnly: true,
  },
  {
    key: 'elevation_gain_m',
    label: 'Elevation gain (m)',
    min: 0,
    max: 30_000,
    step: 0.1,
    placeholder: 'Auto from incline',
  },
  { key: 'average_mets', label: 'Average MET', min: 0.1, max: 50, step: 0.1, placeholder: 'Auto' },
];

export const CARDIO_DURATION = { min: 1, max: 1440 };

export function cardioMetricFields(activity: string) {
  const name = activity.toLocaleLowerCase();
  return metricFields.filter(
    (field) => !field.cyclingOnly || name.includes('cycl') || name.includes('bike'),
  );
}

export function hasCardioMetrics(metrics: Partial<CardioMetricsInput>): boolean {
  return metricFields.some(({ key }) => metrics[key] != null);
}

export function cardioMetricDraft(
  metrics: Partial<CardioMetricsInput>,
): Record<CardioMetricKey, string> {
  return Object.fromEntries(
    metricFields.map(({ key }) => [key, metrics[key]?.toString() ?? '']),
  ) as Record<CardioMetricKey, string>;
}

export function parseCardioMetrics(draft: Record<CardioMetricKey, string>): CardioMetricsInput {
  return Object.fromEntries(
    metricFields.map(({ key }) => [key, draft[key].trim() === '' ? null : Number(draft[key])]),
  ) as unknown as CardioMetricsInput;
}

export function cardioMetricErrors(draft: Record<CardioMetricKey, string>, activity: string) {
  const errors: Partial<Record<CardioMetricKey, string>> = {};
  const metrics = parseCardioMetrics(draft);
  for (const { key, min, max, step } of cardioMetricFields(activity)) {
    const value = metrics[key];
    if (value == null) continue;
    if (
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (step === 1 && !Number.isInteger(value))
    ) {
      const low = min.toLocaleString();
      const high = max.toLocaleString();
      errors[key] =
        step === 1
          ? `Enter a whole number from ${low} to ${high}.`
          : `Enter a number from ${low} to ${high}.`;
    }
  }
  return errors;
}

export function cardioMetricAutoPlaceholder(estimate: number | null | undefined): string {
  return estimate == null ? 'Optional' : `Auto · ${estimate.toLocaleString()}`;
}

export function emptyCardioSession(exercises: Exercise[], today: string): CardioSessionInput {
  const activity =
    exercises.find(
      (exercise) => exercise.name.toLocaleLowerCase() === 'incline treadmill walking',
    ) ?? exercises[0];
  return {
    session_date: today,
    exercise_id: activity?.id ?? null,
    activity_type: activity?.name ?? '',
    duration_minutes: 30,
    ...parseCardioMetrics(cardioMetricDraft({})),
    intensity: null,
    zone: null,
    qualifies_zone2: false,
    notes: null,
  };
}

/** The cardio exercise a saved session was logged as, matched by name, or null when none is. */
export function cardioExerciseFor(activityType: string, exercises: Exercise[]): string | null {
  return exercises.find((exercise) => exercise.name === activityType)?.id ?? null;
}

/** A saved session's own fields, as the edit form starts from them. */
export function cardioSessionEditInput(
  session: CardioSession,
  exercises: Exercise[],
): CardioSessionInput {
  return {
    session_date: session.session_date,
    exercise_id: cardioExerciseFor(session.activity_type, exercises),
    activity_type: session.activity_type,
    duration_minutes: session.duration_minutes,
    calories_kcal: session.calories_kcal ?? null,
    average_heart_rate_bpm: session.average_heart_rate_bpm ?? null,
    distance_km: session.distance_km ?? null,
    average_speed_kph: session.average_speed_kph ?? null,
    incline_percent: session.incline_percent ?? null,
    average_power_watts: session.average_power_watts ?? null,
    average_mets: session.average_mets ?? null,
    elevation_gain_m: session.elevation_gain_m ?? null,
    intensity: session.intensity,
    zone: session.zone,
    qualifies_zone2: session.qualifies_zone2,
    notes: session.notes,
  };
}

/** What Add and Save send: intensity and zone come from heart-rate zones on the server. */
export function cardioSessionPayload<T extends CardioSessionInput>(draft: T): T {
  return { ...draft, intensity: null, zone: null, qualifies_zone2: false };
}
