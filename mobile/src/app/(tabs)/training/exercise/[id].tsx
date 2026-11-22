import { useLocalSearchParams } from 'expo-router';
import { ExerciseDetailScreen } from '../../../../features/training/ExerciseDetailScreen';

export default function ExerciseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseDetailScreen exerciseId={id} />;
}
