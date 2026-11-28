import type { QueryClient } from '@tanstack/react-query';
import {
  extraRepsAction,
  extraRepsNotice,
  tracksExtraReps,
} from '../../../../frontend/src/extraReps';
import type { Exercise } from '../../../../frontend/src/types';
import { queryKeys } from '../../data/queries';
import { errorMessage } from '../../ui/components';
import type { MenuOption } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { updateExercise } from './exerciseQueries';

/** Turns partial and assisted reps on or off for an exercise, and says so. */
export async function setExtraReps(client: QueryClient, exercise: Exercise, tracked: boolean) {
  try {
    await updateExercise(client, exercise.id, { extra_reps_enabled: tracked });
    showToast(extraRepsNotice(tracked, exercise.name));
  } catch (error) {
    showToast(errorMessage(error), undefined, { variant: 'error' });
  }
}

/** The catalogue's copy of an exercise: a workout keeps the exercise as it was when added. */
export function catalogueExercise(client: QueryClient, exercise: Exercise): Exercise {
  return (
    client.getQueryData<Exercise[]>(queryKeys.exercises)?.find((item) => item.id === exercise.id) ??
    exercise
  );
}

/**
 * The switch as an option in an exercise's menu while logging, for strength exercises. The menu
 * cannot show a tick, so the option says what choosing it does.
 */
export function extraRepsOption(client: QueryClient, exercise: Exercise): MenuOption[] {
  if (exercise.kind !== 'strength') return [];
  const current = catalogueExercise(client, exercise);
  const tracked = tracksExtraReps(current);
  return [
    {
      label: extraRepsAction(tracked),
      onPress: () => void setExtraReps(client, current, !tracked),
    },
  ];
}
