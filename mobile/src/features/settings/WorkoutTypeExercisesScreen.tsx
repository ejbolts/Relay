import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  MAX_PLANNED_EXERCISES,
  newRoutineMovement,
  swapPlannedExercise,
} from '../../../../frontend/src/splitEditing';
import { exerciseMuscles } from '../../../../frontend/src/splitTargets';
import type {
  Exercise,
  RoutineMovement,
  WorkoutType,
  WorkoutTypeExercises,
} from '../../../../frontend/src/types';
import {
  workoutTypeExercisesError,
  workoutTypeExercisesPayload,
} from '../../../../frontend/src/workoutTypeExerciseSettings';
import { apiSend } from '../../data/api';
import { queryKeys, useExercises, useSavedExercises, useWorkoutTypes } from '../../data/queries';
import { Button, errorMessage, ErrorState, Loading } from '../../ui/components';
import {
  OFFLINE_MESSAGE,
  placeholderWaitingForNetwork,
  waitingForNetwork,
} from '../../data/offline';
import { showToast } from '../../ui/Toast';
import { ExercisePicker } from '../workout/ExercisePicker';
import { SectionError, SettingsPage } from './SettingsList';
import { PlannedExercise } from './split/PlannedExercise';

export function WorkoutTypeExercisesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const plans = useSavedExercises();
  const types = useWorkoutTypes();
  const exercises = useExercises();
  const failed = [plans, types, exercises].find((query) => query.isError && !query.data);
  if (failed) {
    return (
      <ErrorState message={errorMessage(failed.error)} onRetry={() => void failed.refetch()} />
    );
  }
  const offline =
    [plans, exercises].find(waitingForNetwork) ??
    (placeholderWaitingForNetwork(types) ? types : undefined);
  if (offline) {
    return <ErrorState message={OFFLINE_MESSAGE} onRetry={() => void offline.refetch()} />;
  }
  if (types.isPlaceholderData || plans.isPending || exercises.isPending) {
    return <Loading label="Loading workout type exercises" />;
  }
  const workoutType = types.data?.find((item) => item.id === id && !item.archived);
  if (!workoutType) return <SectionError message="This workout type is unavailable." />;
  return (
    <Editor
      key={id}
      workoutType={workoutType}
      initial={plans.data?.[id] ?? []}
      exercises={exercises.data ?? []}
    />
  );
}

function Editor({
  workoutType,
  initial,
  exercises,
}: {
  workoutType: WorkoutType;
  initial: RoutineMovement[];
  exercises: Exercise[];
}) {
  const client = useQueryClient();
  const router = useRouter();
  const [draft, setDraft] = useState<RoutineMovement[] | null>(null);
  const movements = draft ?? initial;
  const [picking, setPicking] = useState<'add' | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      apiSend<WorkoutTypeExercises>(
        `/api/workout-type-exercises/${encodeURIComponent(workoutType.id)}`,
        'PUT',
        workoutTypeExercisesPayload(movements),
      ),
    onSuccess: (saved) => {
      client.setQueryData<WorkoutTypeExercises[]>(queryKeys.savedExercises, (current = []) => [
        ...current.filter((plan) => plan.workout_type_id !== saved.workout_type_id),
        saved,
      ]);
      void client.invalidateQueries({ queryKey: queryKeys.savedExercises });
      showToast('Exercises saved');
      router.back();
    },
    onError: (reason) => setError(errorMessage(reason)),
  });

  function change(index: number, next: RoutineMovement | null) {
    setDraft((current) =>
      (current ?? initial).flatMap((item, at) => (at !== index ? [item] : next ? [next] : [])),
    );
  }

  function pick(selected: Exercise[]) {
    if (picking === 'add') {
      setDraft((current) => {
        const list = current ?? initial;
        return [
          ...list,
          ...selected.slice(0, MAX_PLANNED_EXERCISES - list.length).map(newRoutineMovement),
        ];
      });
    } else if (picking !== null && selected[0]) {
      change(picking, swapPlannedExercise(movements[picking], selected[0]));
    }
  }

  function submit() {
    const invalid = workoutTypeExercisesError(movements);
    setError(invalid);
    if (!invalid) save.mutate();
  }

  return (
    <>
      <Stack.Screen options={{ title: `${workoutType.name} exercises` }} />
      <SettingsPage>
        {movements.map((movement, index) => (
          <PlannedExercise
            key={`${index}-${movement.exercise_id}`}
            movement={movement}
            muscles={exerciseMuscles(
              exercises.find(({ id }) => id === movement.exercise_id) ?? movement.exercise,
            )}
            target={workoutType.name}
            disabled={save.isPending}
            onChange={(next) => change(index, next)}
            onReplace={() => setPicking(index)}
          />
        ))}
        <Button
          label="Add exercises"
          variant="secondary"
          icon="plus"
          disabled={
            save.isPending || !exercises.length || movements.length >= MAX_PLANNED_EXERCISES
          }
          onPress={() => setPicking('add')}
        />
        <SectionError message={error} />
        <Button
          label={save.isPending ? 'Saving…' : 'Save exercises'}
          disabled={save.isPending || !draft}
          onPress={submit}
        />
      </SettingsPage>
      <ExercisePicker
        visible={picking !== null}
        mode={typeof picking === 'number' ? 'swap' : 'add'}
        exercises={exercises}
        recentIds={[]}
        addedIds={new Set(movements.map((movement) => movement.exercise_id))}
        onAdd={pick}
        onClose={() => setPicking(null)}
      />
    </>
  );
}
