/** Account overrides. Muscles without an override follow the default goal. */
export type MuscleSetGoals = Record<string, number>;

export function muscleSetGoal(muscle: string, defaultGoal: number, goals?: MuscleSetGoals) {
  const goal = goals?.[muscle];
  return typeof goal === 'number' && Number.isInteger(goal) && goal >= 1 && goal <= 1000
    ? goal
    : defaultGoal;
}
