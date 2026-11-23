import { useLocalSearchParams } from 'expo-router';
import { EditWorkoutScreen } from '../../features/workout/EditWorkoutScreen';

export default function EditWorkoutRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditWorkoutScreen workoutId={id} />;
}
