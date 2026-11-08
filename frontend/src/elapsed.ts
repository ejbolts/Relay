import { useEffect, useState } from 'react';
import { readActiveWorkoutDraft } from './workoutDraft';
import { activeElapsedSeconds, draftPause } from './workoutPause';

export function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

interface LiveWorkoutClock {
  elapsed: number;
  paused: boolean;
}

/** The live workout's training time, leaving out time paused in its saved draft. */
function readLiveWorkoutClock(startedAt: number | null): LiveWorkoutClock {
  if (startedAt === null) return { elapsed: 0, paused: false };
  const draft = readActiveWorkoutDraft();
  const pause = draftPause(draft?.startedAt === startedAt ? draft : null);
  return { elapsed: activeElapsedSeconds(startedAt, pause), paused: pause.pausedAt !== null };
}

/** Training time for the live workout, frozen while it is paused. */
export function useLiveWorkoutClock(startedAt: number | null): LiveWorkoutClock {
  const [clock, setClock] = useState(() => readLiveWorkoutClock(startedAt));
  useEffect(() => {
    if (startedAt === null) return;
    const update = () =>
      setClock((current) => {
        const next = readLiveWorkoutClock(startedAt);
        return next.elapsed === current.elapsed && next.paused === current.paused ? current : next;
      });
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return clock;
}

export function useElapsedSeconds(startedAt: number | null): number {
  return useLiveWorkoutClock(startedAt).elapsed;
}
