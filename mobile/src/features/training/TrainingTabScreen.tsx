import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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

/** The web's Training tab: Sessions, Exercises and Cardio under one header. */
export function TrainingTabScreen() {
  const client = useQueryClient();
  const history = useTrainingHistory();
  const [section, setSection] = useState(0);
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
