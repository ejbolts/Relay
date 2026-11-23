import {
  sessionTemplateFromWorkout,
  workoutDisplayName,
} from '../../../../frontend/src/trainingSummary';
import type { TrackedWorkout } from '../../../../frontend/src/types';
import type { WeightUnit } from '../../../../frontend/src/weightUnits';
import { Button } from '../../ui/components';
import { useWorkout } from '../workout/WorkoutProvider';
import { trainingIcons } from './icons';

/**
 * Starts a new workout pre-filled from a saved one: its exercises in order, with their top sets.
 * While a workout is live, the button reopens it instead, as every start does.
 */
export function RepeatWorkoutButton({
  workout,
  unit,
}: {
  workout: TrackedWorkout;
  unit: WeightUnit;
}) {
  const live = useWorkout();
  const name = workoutDisplayName(workout);
  return (
    <Button
      label={live.live ? 'Open current workout' : 'Repeat workout'}
      accessibilityLabel={live.live ? 'Open current workout' : `Repeat ${name}`}
      icon={live.live ? 'timer' : trainingIcons.repeat}
      variant="secondary"
      onPress={() =>
        live.live
          ? live.open()
          : live.start({
              kind: 'template',
              template: sessionTemplateFromWorkout(workout, unit),
              name,
            })
      }
    />
  );
}
