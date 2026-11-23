import { useLocalSearchParams } from 'expo-router';
import { MachineWeightsScreen } from '../../../../features/exercises/MachineWeightsScreen';

export default function MachineWeightsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MachineWeightsScreen exerciseId={id} />;
}
