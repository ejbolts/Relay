import { useEffect, useState } from 'react';
import { api } from './api';
import type { Exercise, ExerciseLibrarySummary } from './types';

export interface ExerciseLibraryState {
  summaries: ExerciseLibrarySummary[] | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
}

/** Owned by the signed-in app so trends survive navigation, but never an account change. */
export function useExerciseLibrary(
  exercises: Exercise[],
  dataRevision: string | null,
  enabled = true,
): ExerciseLibraryState {
  const [summaries, setSummaries] = useState<ExerciseLibrarySummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ids = exercises
    .filter((exercise) => exercise.kind === 'strength')
    .map((exercise) => exercise.id)
    .join(',');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    void api
      .exerciseLibrary()
      .then((result) => {
        if (!cancelled) setSummaries(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, dataRevision, ids, attempt]);

  return { summaries, loading, error, retry: () => setAttempt((value) => value + 1) };
}
