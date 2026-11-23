import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { isoLocalDate, parseLocalDate } from '../../../../frontend/src/trainingSummary';
import type { HeatmapDay } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { queryKeys } from '../../data/queries';
import { Screen } from '../../ui/components';
import { bodyKeys } from '../body/bodyQueries';
import { useWorkout } from '../workout/WorkoutProvider';
import { CheckInCard } from './CheckInCard';
import { ConsistencyCard } from './ConsistencyCard';
import { DaySheet } from './DaySheet';
import { HalfCards } from './HalfCards';
import { MuscleSetsCard } from './MuscleSetsCard';
import { ProfileCard } from './ProfileCard';
import { RecordsCard } from './RecordsCard';
import { StatCards } from './StatCards';
import { ThisWeekCard } from './ThisWeekCard';
import { UpNextCard } from './UpNextCard';

// Everything Home shows, refreshed together by pull to refresh.
const HOME_QUERIES = [
  ['dashboard'],
  ['workouts'],
  queryKeys.workoutTypes,
  queryKeys.savedExercises,
  queryKeys.trainingPreferences,
  queryKeys.personalRecords,
  bodyKeys.measurements,
];

/**
 * Home, in the web's default order: Up next, Profile, the Workouts, Cardio sessions and Body
 * weight stats, This week, Consistency (the training calendar), Sets per muscle, Cardio zone
 * goals beside the Bodyweight trend, the Body weight check-in and Recent records. Each card loads
 * and fails on its own.
 */
export function HomeScreen() {
  const client = useQueryClient();
  const workout = useWorkout();
  const [refreshing, setRefreshing] = useState(false);
  const [day, setDay] = useState<HeatmapDay | null>(null);
  const today = localDate();
  const liveDate = workout.live ? isoLocalDate(new Date(workout.live.startedAt)) : null;

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all(
        HOME_QUERIES.map((queryKey) => client.refetchQueries({ queryKey, type: 'active' })),
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <Screen
        title="Home"
        eyebrow={parseLocalDate(today).toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      >
        <UpNextCard />
        <ProfileCard />
        <StatCards />
        <ThisWeekCard liveDate={liveDate} onOpenDay={setDay} onOpenLive={workout.open} />
        <ConsistencyCard liveDate={liveDate} onOpenDay={setDay} onOpenLive={workout.open} />
        <MuscleSetsCard />
        <HalfCards />
        <CheckInCard />
        <RecordsCard />
      </Screen>
      <DaySheet day={day} onClose={() => setDay(null)} />
    </>
  );
}
