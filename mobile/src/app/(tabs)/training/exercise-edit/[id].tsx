import { useLocalSearchParams } from 'expo-router';
import { ExerciseEditScreen } from '../../../../features/exercises/ExerciseEditScreen';

export default function ExerciseEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseEditScreen exerciseId={id} />;
}
