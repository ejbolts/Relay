import { createContext } from 'react';
import type { Exercise } from './types';

export const ExerciseCreditsContext = createContext<{
  exercises: Exercise[];
  updatePartialSets: (id: string, enabled: boolean, weekStart: string) => Promise<Exercise>;
} | null>(null);
