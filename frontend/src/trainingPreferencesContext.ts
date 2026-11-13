import { createContext, useContext } from 'react';
import type { TrainingPreferences } from './types';

export const TrainingPreferencesContext = createContext<{
  preferences: TrainingPreferences | null;
  error: string | null;
  applySaved: (preferences: TrainingPreferences) => void;
}>({ preferences: null, error: null, applySaved: () => undefined });

export function useTrainingPreferences() {
  return useContext(TrainingPreferencesContext);
}

export function useWeekStartDay(): number {
  const weekStart = useTrainingPreferences().preferences?.week_start;
  return weekStart === 'sunday' ? 0 : weekStart === 'saturday' ? 6 : 1;
}

export function useWeightUnit() {
  return useTrainingPreferences().preferences?.preferred_weight_unit ?? 'kg';
}
