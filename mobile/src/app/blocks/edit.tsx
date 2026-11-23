import { useLocalSearchParams } from 'expo-router';
import { BlockFormScreen } from '../../features/blocks/BlockFormScreen';

export default function BlockFormRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <BlockFormScreen blockId={id} />;
}
