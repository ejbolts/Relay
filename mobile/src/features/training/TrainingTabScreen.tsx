import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { refreshTraining } from '../../data/queries';
import { Screen } from '../../ui/components';
import { CardioSection } from './CardioSection';
import { ExercisesSection } from './ExercisesSection';
import { Segmented } from './parts';
import { SessionsSection } from './SessionsSection';
import { useTrainingHistory } from './trainingQueries';

/** Training's sections, named as the web's segmented control names them. */
export const TRAINING_SECTIONS = ['Sessions', 'Exercises', 'Cardio'] as const;

/** The section names other screens open Training at, such as Home's cardio cards. */
export type TrainingSection = 'sessions' | 'exercises' | 'cardio';
const SECTION_PARAMS: readonly TrainingSection[] = ['sessions', 'exercises', 'cardio'];

/**
 * The web's Training tab: Sessions, Exercises and Cardio under one header. `requestedSection`
 * switches to a section when another screen opens Training at it; `onRequestShown` lets the
 * route clear the request, so opening the same section again switches back to it.
 */
export function TrainingTabScreen({
  requestedSection,
  onRequestShown,
}: {
  requestedSection?: string;
  onRequestShown?: () => void;
} = {}) {
  const client = useQueryClient();
  const history = useTrainingHistory();
  const requested = SECTION_PARAMS.indexOf(requestedSection as TrainingSection);
  const [section, setSection] = useState(Math.max(requested, 0));
  const [applied, setApplied] = useState(requestedSection);
  if (requestedSection !== applied) {
    setApplied(requestedSection);
    if (requested >= 0) setSection(requested);
  }
  useEffect(() => {
    if (requestedSection) onRequestShown?.();
  }, [requestedSection, onRequestShown]);
  const [refreshing, setRefreshing] = useState(false);
  const total = Math.max(history.summary?.total_workouts ?? 0, history.workouts.length);
  return (
    <Screen
      title="Training"
      eyebrow={
        history.loading ? undefined : `${total} ${total === 1 ? 'workout' : 'workouts'} logged`
      }
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void refreshTraining(client).finally(() => setRefreshing(false));
      }}
    >
      <Segmented
        accessibilityLabel="Training sections"
        values={TRAINING_SECTIONS}
        selectedIndex={section}
        onChange={setSection}
      />
      <View>
        {section === 0 && <SessionsSection history={history} />}
        {section === 1 && <ExercisesSection />}
        {section === 2 && <CardioSection />}
      </View>
    </Screen>
  );
}
