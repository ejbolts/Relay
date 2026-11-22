import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { TrainingSplit } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { builtinTypeColors, DEFAULT_WORKOUT_TYPES } from '../../../../frontend/src/workoutTypes';
import { apiSend } from '../../data/api';
import { useWorkoutTypes } from '../../data/queries';

/** The account's workout types and the colour each built-in one is drawn in. */
export function useTypeColors() {
  const query = useWorkoutTypes();
  const types = query.data ?? DEFAULT_WORKOUT_TYPES;
  const categoryColors = useMemo(() => builtinTypeColors(types), [types]);
  return { types, categoryColors };
}

/**
 * Moves the split to a step, as the web's Skip and its Undo do, then reloads Home so Up next
 * shows the new day before the call resolves.
 */
export function useMoveSplit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ step, restSaved }: { step: number; restSaved: boolean }) =>
      apiSend<TrainingSplit>(`/api/training-split/position?on_date=${localDate()}`, 'PUT', {
        step,
        rest_saved: restSaved,
      }),
    onSuccess: () =>
      Promise.all(
        [['dashboard'], ['training-split']].map((queryKey) =>
          client.invalidateQueries({ queryKey }),
        ),
      ),
  });
}
