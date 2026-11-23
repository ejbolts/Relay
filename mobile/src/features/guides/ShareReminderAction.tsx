import { useState } from 'react';
import { Button } from '../../ui/components';
import { ShareWorkoutSheet } from '../social/ShareWorkoutSheet';
import { useSavedWorkout } from '../training/trainingQueries';
import { guideIcons } from './icons';
import { useWorkoutShareReminder } from './shareReminder';

/**
 * The web's share reminder, for a workout just saved: with Share workout reminder on, a Share
 * button that opens the workout's share card. The web offers it in the "Workout saved" toast; the
 * app shows the finished workout's summary instead, so it belongs there. Renders nothing while the
 * reminder is off or the workout hasn't reached the server.
 */
export function ShareReminderAction({
  workoutId,
  records = 0,
}: {
  workoutId: string | null;
  records?: number;
}) {
  const [enabled] = useWorkoutShareReminder();
  if (!enabled || !workoutId) return null;
  return <ShareButton workoutId={workoutId} records={records} />;
}

function ShareButton({ workoutId, records }: { workoutId: string; records: number }) {
  const workout = useSavedWorkout(workoutId).data;
  const [sharing, setSharing] = useState(false);
  return (
    <>
      <Button
        label="Share"
        variant="secondary"
        icon={guideIcons.share}
        disabled={!workout}
        onPress={() => setSharing(true)}
      />
      {sharing && workout && (
        <ShareWorkoutSheet workout={workout} records={records} onClose={() => setSharing(false)} />
      )}
    </>
  );
}
