import { useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { TrainingPreferencesContext } from './trainingPreferencesContext';
import type { TrainingPreferences } from './types';

export function TrainingPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<TrainingPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void api.getTrainingPreferences().then(
      (saved) => {
        if (active) setPreferences(saved);
      },
      (reason) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : 'Could not load training preferences.',
          );
      },
    );
    return () => {
      active = false;
    };
  }, []);
  return (
    <TrainingPreferencesContext.Provider value={{ preferences, error, applySaved: setPreferences }}>
      {children}
    </TrainingPreferencesContext.Provider>
  );
}
