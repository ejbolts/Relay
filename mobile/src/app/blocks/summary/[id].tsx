import { useLocalSearchParams } from 'expo-router';
import { BlockSummaryScreen } from '../../../features/blocks/BlockSummaryScreen';

export default function BlockSummaryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BlockSummaryScreen blockId={id} />;
}
