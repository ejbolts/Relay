import { Alert } from 'react-native';
import { calendarCreatePrompt } from '../../../../frontend/src/plannedDay';
import { useWorkout } from '../workout/WorkoutProvider';

/**
 * Starts a workout dated on an empty day from a calendar, asking first as the web does, and
 * replacing a live workout only after a second, destructive confirmation.
 */
export function useCreateWorkoutOn() {
  const workout = useWorkout();
  return (date: string) => {
    const live = !!workout.live;
    const prompt = calendarCreatePrompt(date, live);
    Alert.alert(prompt.title, prompt.message, [
      { text: prompt.cancel, style: 'cancel' },
      {
        text: prompt.confirm,
        style: prompt.destructive ? 'destructive' : 'default',
        onPress: () => {
          if (live) workout.discard();
          workout.start({ kind: 'empty' }, { date });
        },
      },
    ]);
  };
}
