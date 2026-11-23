import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { refreshTraining } from '../../data/queries';
import { Screen } from '../../ui/components';
import { HomeHeaderActions } from '../home/HomeHeaderActions';
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
 * The web's Training tab: Sessions, Exercises and Cardio under one header. Another screen opens
 * it at a section with `requestedSection`; each request has its own `requestId`, so asking for
 * the same section again switches back to it after the person has moved on.
 */
export function TrainingTabScreen({
  requestedSection,
  requestId,
}: {
  requestedSection?: string;
  requestId?: string;
} = {}) {
  const client = useQueryClient();
  const history = useTrainingHistory();
  const requested = SECTION_PARAMS.indexOf(requestedSection as TrainingSection);
  const [section, setSection] = useState(Math.max(requested, 0));
  const [applied, setApplied] = useState(requestId);
  if (requestId !== applied) {
    setApplied(requestId);
    if (requested >= 0) setSection(requested);
  }
  const [refreshing, setRefreshing] = useState(false);
  const total = Math.max(history.summary?.total_workouts ?? 0, history.workouts.length);
  return (
    <Screen
      title="Training"
      eyebrow={
        history.loading ? undefined : `${total} ${total === 1 ? 'workout' : 'workouts'} logged`
      }
      // The bell, your profile and Settings, as on every main tab of the web.
      actions={<HomeHeaderActions />}
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
