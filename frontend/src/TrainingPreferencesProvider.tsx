import { useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { TrainingPreferencesContext } from './trainingPreferencesContext';
import type { TrainingPreferences } from './types';

export function TrainingPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<TrainingPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let answered = false;
    // This device's copy shows first, so units and targets do not change once a screen is up.
    void api.saved
      .trainingPreferences()
      .then((copy) => {
        if (active && !answered && copy) setPreferences((current) => current ?? copy);
      })
      .catch(() => undefined);
    void api.getTrainingPreferences().then(
      (saved) => {
        answered = true;
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
