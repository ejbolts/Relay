import { createContext } from 'react';
import type { Exercise } from './types';

export const ExerciseCreditsContext = createContext<{
  exercises: Exercise[];
  updatePartialSets: (id: string, enabled: boolean, weekStart: string) => Promise<Exercise>;
  /** Turns partial and assisted reps on or off for an exercise (see extraReps.ts). */
  updateExtraReps?: (id: string, enabled: boolean) => Promise<Exercise>;
} | null>(null);
