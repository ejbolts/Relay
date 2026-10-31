import type { Exercise, WorkoutCategory, WorkoutType } from './types';

type CategorizedExercise = Pick<Exercise, 'category'> & Partial<Pick<Exercise, 'kind'>>;

function strengthWorkoutName(name: string): string {
  const suffix = / workout$/i.test(name) ? ' workout' : '';
  const undecorated = name
    .replace(/ workout$/i, '')
    .replace(/^(Cardio \+ )+/, '')
    .replace(/( \+ Cardio)+$/, '');
  const names = undecorated.split(' + Cardio + ');
  return (names.every((part) => part === names[0]) ? names[0] : undecorated) + suffix;
}

/** Keep each contiguous cardio/strength segment in the exercise order. */
export function mixedWorkoutName(name: string, exercises: CategorizedExercise[]): string {
  if (!exercises.length) return name;
  const segments: boolean[] = [];
  for (const exercise of exercises) {
    const cardio = exercise.kind ? exercise.kind === 'cardio' : exercise.category === 'cardio';
    if (segments.at(-1) !== cardio) segments.push(cardio);
  }
  if (!segments.includes(true) || !segments.includes(false)) return strengthWorkoutName(name);

  // Recognise previously generated names so reopening or reordering does not stack labels.
  const workoutSuffix = / workout$/i.test(name) ? ' workout' : '';
  const strengthName = strengthWorkoutName(name).replace(/ workout$/i, '');
  const base =
    strengthName === 'Cardio'
      ? workoutNameForCategory(inferWorkoutCategory(exercises) ?? 'other').replace(/ workout$/i, '')
      : strengthName;
  const strengthCount = segments.filter((cardio) => !cardio).length;
  const available = Math.max(
    1,
    Math.floor(
      (200 -
        workoutSuffix.length -
        segments.filter(Boolean).length * 6 -
        (segments.length - 1) * 3) /
        strengthCount,
    ),
  );
  const label = base.length > available ? `${base.slice(0, available - 1).trimEnd()}…` : base;
  return (segments.map((cardio) => (cardio ? 'Cardio' : label)).join(' + ') + workoutSuffix).slice(
    0,
    200,
  );
}

const automaticWorkoutNames: Record<WorkoutCategory, string> = {
  upper: 'Upper body workout',
  lower: 'Lower body workout',
  push: 'Push workout',
  pull: 'Pull workout',
  full_body: 'Full body workout',
  cardio: 'Cardio workout',
  other: 'Other workout',
};

export function workoutNameForCategory(category: WorkoutCategory): string {
  return automaticWorkoutNames[category];
}

export function finalizeWorkoutIdentity(
  exercises: CategorizedExercise[],
  currentCategory: WorkoutCategory,
  currentName: string,
  inferFromExercises: boolean,
  workoutType?: Pick<WorkoutType, 'name'> | null,
): { category: WorkoutCategory; name: string } {
  if (workoutType) {
    const trimmedName = currentName.trim();
    return {
      category: currentCategory,
      name: mixedWorkoutName(
        !trimmedName || trimmedName === workoutNameForCategory(currentCategory)
          ? `${workoutType.name} workout`
          : trimmedName,
        exercises,
      ),
    };
  }
  const category = inferFromExercises
    ? (inferWorkoutCategory(exercises) ?? currentCategory)
    : currentCategory;
  const trimmedName = currentName.trim();
  const hasAutomaticName =
    trimmedName === '' ||
    strengthWorkoutName(trimmedName) === workoutNameForCategory(currentCategory);
  return {
    category,
    name: mixedWorkoutName(
      hasAutomaticName ? workoutNameForCategory(category) : trimmedName,
      exercises,
    ),
  };
}

function focusedUpperCategory(counts: Record<WorkoutCategory, number>): WorkoutCategory {
  const push = counts.push;
  const pull = counts.pull;
  const neutralUpper = counts.upper;

  if (push >= 2 * (pull + neutralUpper)) return 'push';
  if (pull >= 2 * (push + neutralUpper)) return 'pull';
  return 'upper';
}

export function inferWorkoutCategory(exercises: CategorizedExercise[]): WorkoutCategory | null {
  if (!exercises.length) return null;

  const counts: Record<WorkoutCategory, number> = {
    upper: 0,
    lower: 0,
    push: 0,
    pull: 0,
    full_body: 0,
    cardio: 0,
    other: 0,
  };
  exercises.forEach((exercise) => {
    counts[exercise.category] += 1;
  });

  if (counts.full_body > 0) return 'full_body';

  const upperBody = counts.push + counts.pull + counts.upper;
  const lowerBody = counts.lower;
  const strengthTotal = upperBody + lowerBody;
  if (strengthTotal === 0) return counts.cardio > 0 ? 'cardio' : 'other';

  const families = [
    { category: 'upper' as const, count: upperBody },
    { category: 'lower' as const, count: lowerBody },
  ].sort((left, right) => right.count - left.count);
  const dominant = families[0];
  const remaining = strengthTotal - dominant.count;

  if (remaining > 0 && dominant.count < 2 * remaining) return 'full_body';
  return dominant.category === 'upper' ? focusedUpperCategory(counts) : dominant.category;
}
