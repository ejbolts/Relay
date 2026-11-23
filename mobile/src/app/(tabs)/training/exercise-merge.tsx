import { useLocalSearchParams } from 'expo-router';
import { ExerciseMergeScreen } from '../../../features/exercises/ExerciseMergeScreen';

export default function ExerciseMergeRoute() {
  const { source, target } = useLocalSearchParams<{ source?: string; target?: string }>();
  return <ExerciseMergeScreen sourceId={source} targetId={target} />;
}
