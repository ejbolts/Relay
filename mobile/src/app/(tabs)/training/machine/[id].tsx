import { useLocalSearchParams } from 'expo-router';
import { MachineWorkoutsScreen } from '../../../../features/training/MachineWorkoutsScreen';

export default function MachineWorkoutsRoute() {
  const { id, caption, exercise } = useLocalSearchParams<{
    id: string;
    caption?: string;
    exercise?: string;
  }>();
  return <MachineWorkoutsScreen photoId={id} caption={caption} exerciseName={exercise} />;
}
