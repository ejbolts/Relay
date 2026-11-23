import { activeElapsedSeconds, type WorkoutPause } from '../../../../frontend/src/workoutPause';
import { useNow } from '../../ui/useNow';

/**
 * "12:34" or "1:02:34" of training since `startedAt`, leaving out paused time as the web does,
 * ticking each second while mounted (and standing still while paused). A resumed workout adds
 * the minutes it was saved with (`previousMinutes`).
 */
export function useElapsed(startedAt: number, pause?: WorkoutPause, previousMinutes = 0) {
  const now = useNow();
  return formatElapsed(
    previousMinutes * 60_000 +
      (pause ? activeElapsedSeconds(startedAt, pause, now) * 1000 : now - startedAt),
  );
}

export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}
