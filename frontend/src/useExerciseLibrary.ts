import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useTrainingBlocks } from './trainingBlocksContext';
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
  const { block } = useTrainingBlocks();
  const blockId = block?.id;
  const scope = `${blockId ?? 'all'}:${block?.start_date ?? ''}:${block?.end_date ?? ''}`;
  const loadedScope = useRef(scope);
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
    if (loadedScope.current !== scope) {
      setSummaries(null);
      loadedScope.current = scope;
    }
    setError(false);
    void api
      .exerciseLibrary(blockId)
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
  }, [enabled, dataRevision, ids, attempt, blockId, scope]);

  return { summaries, loading, error, retry: () => setAttempt((value) => value + 1) };
}
