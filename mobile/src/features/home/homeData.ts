import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { defaultHomeLayout, type HomeLayout } from '../../../../frontend/src/homeLayout';
import { withMuscleSetGoal } from '../../../../frontend/src/muscleGoalEditing';
import type { TrainingPreferences, TrainingSplit } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { builtinTypeColors, DEFAULT_WORKOUT_TYPES } from '../../../../frontend/src/workoutTypes';
import { apiGet, apiSend } from '../../data/api';
import { readJson, writeJson } from '../../data/deviceStorage';
import { queryKeys, useWorkoutTypes } from '../../data/queries';
import { useUser } from '../../session/SessionProvider';

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

export const homeKeys = { layout: ['home-layout'] as const };

/** This phone's copy of the account's layout, so Home doesn't rearrange once the server answers. */
const LAYOUT_COPY = 'relay.mobile.home-layout.v1';
type LayoutCopy = { userId: string; layout: HomeLayout };

/**
 * The account's saved Home layout, the one the web reads and saves. Until the server answers (or
 * while it can't be reached), Home shows this phone's last copy, or else the default layout.
 * `confirmed` waits for the server's answer, so the editor never saves an older layout over a
 * newer one.
 */
export function useHomeLayout() {
  const userId = useUser().id;
  const [copy] = useState(() => {
    const saved = readJson<LayoutCopy>(LAYOUT_COPY);
    return saved?.userId === userId ? saved.layout : null;
  });
  const query = useQuery({
    queryKey: homeKeys.layout,
    queryFn: async ({ signal }) => {
      const saved = await apiGet<HomeLayout>('/api/home-layout', signal);
      writeJson(LAYOUT_COPY, { userId, layout: saved } satisfies LayoutCopy);
      return saved;
    },
    placeholderData: copy ?? undefined,
  });
  const [fallback] = useState(defaultHomeLayout);
  return {
    ...query,
    layout: query.data ?? copy ?? fallback,
    confirmed: !!query.data && !query.isPlaceholderData,
  };
}

/** Saves a layout from the editor, in the web's format. */
export function useSaveHomeLayout() {
  const client = useQueryClient();
  const userId = useUser().id;
  return useMutation({
    mutationFn: (layout: HomeLayout) => apiSend<HomeLayout>('/api/home-layout', 'PUT', layout),
    onSuccess: (saved) => {
      client.setQueryData(homeKeys.layout, saved);
      writeJson(LAYOUT_COPY, { userId, layout: saved } satisfies LayoutCopy);
    },
  });
}

/**
 * Saves one muscle's weekly goal (`null` returns it to the default), keeping every other training
 * preference as the server last sent it. Saves run one at a time, each from the goals the one
 * before saved, so quick edits to two muscles both stick. Sets per muscle updates at once.
 */
export function useSaveMuscleGoal() {
  const client = useQueryClient();
  return useMutation({
    scope: { id: 'muscle-goals' },
    mutationFn: async ({ muscle, goal }: { muscle: string; goal: number | null }) => {
      const preferences =
        client.getQueryData<TrainingPreferences>(queryKeys.trainingPreferences) ??
        (await apiGet<TrainingPreferences>('/api/training-preferences'));
      return apiSend<TrainingPreferences>('/api/training-preferences', 'PUT', {
        ...preferences,
        weekly_muscle_set_goals: withMuscleSetGoal(
          preferences.weekly_muscle_set_goals,
          muscle,
          goal,
        ),
      });
    },
    onSuccess: (saved) => client.setQueryData(queryKeys.trainingPreferences, saved),
  });
}
