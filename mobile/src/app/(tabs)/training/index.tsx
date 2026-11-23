import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { TrainingTabScreen } from '../../../features/training/TrainingTabScreen';

/** Training, opened at a section with `?section=cardio` (as Home's cardio cards do). */
export default function TrainingTab() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const router = useRouter();
  const shown = useCallback(() => router.setParams({ section: undefined }), [router]);
  return <TrainingTabScreen requestedSection={section} onRequestShown={shown} />;
}
