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
  /** False until the exercise list itself has loaded; trends can start loading before it. */
  catalogueLoaded = true,
): ExerciseLibraryState {
  const { block, loading: blocksLoading } = useTrainingBlocks();
  // Trends are read for the current block, so the first read waits until the blocks have loaded.
  const [blocksKnown, setBlocksKnown] = useState(!blocksLoading);
  if (!blocksLoading && !blocksKnown) setBlocksKnown(true);
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
  // A changed catalogue reads the trends again. The catalogue first arriving is not a change, so
  // trends that started loading beside it are kept.
  const firstIds = useRef<string | null>(null);
  if (firstIds.current === null && catalogueLoaded) firstIds.current = ids;
  const catalogue = firstIds.current === null || ids === firstIds.current ? '' : ids;

  useEffect(() => {
    if (!enabled || !blocksKnown) return;
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
  }, [enabled, blocksKnown, dataRevision, catalogue, attempt, blockId, scope]);

  return { summaries, loading, error, retry: () => setAttempt((value) => value + 1) };
}
