import { useLocalSearchParams } from 'expo-router';
import { CardioEditScreen } from '../../../features/cardio/CardioLogScreen';

export default function CardioEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CardioEditScreen sessionId={id} />;
}
