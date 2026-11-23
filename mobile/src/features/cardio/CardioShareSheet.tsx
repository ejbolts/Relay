import { useState } from 'react';
import type { CardioSession } from '../../../../frontend/src/types';
import { cardioWorkoutForSharing } from '../../../../frontend/src/workoutCardDrawing';
import { ShareWorkoutSheet } from '../social/ShareWorkoutSheet';

/**
 * A cardio session's share card, as the web's Share card in Cardio history: the workout card drawn
 * for the session, without Export CSV.
 */
export function CardioShareSheet({
  session,
  onClose,
}: {
  session: CardioSession;
  onClose: () => void;
}) {
  const [workout] = useState(() => cardioWorkoutForSharing(session));
  return <ShareWorkoutSheet workout={workout} records={0} csv={false} onClose={onClose} />;
}
