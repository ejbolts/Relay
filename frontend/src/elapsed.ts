import { useEffect, useState } from 'react';
import { ACTIVE_WORKOUT_CHANGE_EVENT, readActiveWorkoutDraft } from './workoutDraft';
import { activeElapsedSeconds, draftPause } from './workoutPause';
import { workoutDurationSeconds } from './workoutResume';

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

/** Total training time, excluding pauses and including the logged cardio minimum. */
function readLiveWorkoutClock(startedAt: number | null): LiveWorkoutClock {
  if (startedAt === null) return { elapsed: 0, paused: false };
  const stored = readActiveWorkoutDraft();
  const draft = stored?.startedAt === startedAt ? stored : null;
  const pause = draftPause(draft);
  return {
    elapsed: workoutDurationSeconds(
      activeElapsedSeconds(startedAt, pause),
      draft?.cardioDurationSeconds ?? 0,
      draft?.previousDurationMinutes ?? 0,
      draft?.durationOverrideMinutes ?? null,
    ),
    paused: pause.pausedAt !== null,
  };
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
    window.addEventListener(ACTIVE_WORKOUT_CHANGE_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(ACTIVE_WORKOUT_CHANGE_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, [startedAt]);
  return clock;
}

export function useElapsedSeconds(startedAt: number | null): number {
  return useLiveWorkoutClock(startedAt).elapsed;
}
