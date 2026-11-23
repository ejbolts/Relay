import { useLocalSearchParams } from 'expo-router';
import { SessionDetailScreen } from '../../../../features/training/SessionDetailScreen';

export default function SessionRoute() {
  const { id, exercise } = useLocalSearchParams<{
    id: string;
    exercise?: string;
  }>();
  return <SessionDetailScreen workoutId={id} exerciseId={exercise} />;
}
