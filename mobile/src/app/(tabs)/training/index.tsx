import { useLocalSearchParams } from 'expo-router';
import { TrainingTabScreen } from '../../../features/training/TrainingTabScreen';

/** Training, opened at a section by `trainingRoute` (as Home's cardio cards do). */
export default function TrainingTab() {
  const { section, request } = useLocalSearchParams<{ section?: string; request?: string }>();
  return <TrainingTabScreen requestedSection={section} requestId={request} />;
}
