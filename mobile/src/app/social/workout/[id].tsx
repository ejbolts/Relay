import { useLocalSearchParams } from 'expo-router';
import { SharedWorkoutScreen } from '../../../features/social/SharedWorkoutScreen';

/** A shared workout: `member` logged it on `date`; `comments=1` scrolls to its comments. */
export default function SharedWorkout() {
  const { id, member, date, comments } = useLocalSearchParams<{
    id: string;
    member: string;
    date: string;
    comments?: string;
  }>();
  return (
    <SharedWorkoutScreen
      key={id}
      workoutId={id}
      memberId={member}
      date={date}
      showComments={comments === '1'}
    />
  );
}
