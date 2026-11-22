import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { SessionTemplate } from '../../../../frontend/src/trainingSummary';

/**
 * How a workout starts, matching the web's Start menu: the recommended session, an empty
 * workout, a cardio session, or a given template (a planned day, or repeating a past workout).
 */
export type StartChoice =
  | { kind: 'up-next' }
  | { kind: 'empty' }
  | { kind: 'cardio' }
  | { kind: 'template'; template: SessionTemplate; name: string };

/** What the rest of the app may know about the workout in progress. */
export interface LiveWorkout {
  name: string;
  startedAt: number;
}

export interface WorkoutApi {
  live: LiveWorkout | null;
  /**
   * Starts a workout and opens the logger. Ignored while one is already live: use `open`. From
   * another sheet (the Start menu), pass `replace` so the logger takes that sheet's place.
   */
  start: (choice: StartChoice, options?: { replace?: boolean }) => void;
  /** Shows the logger for the live workout. Dismissing the logger only minimises it. */
  open: () => void;
  /** The Start tab: the Start menu, or the logger while a workout is live. */
  openStartMenu: () => void;
  /** Ends the live workout without saving. */
  discard: () => void;
}

const WorkoutContext = createContext<WorkoutApi | null>(null);

export function useWorkout() {
  const workout = useContext(WorkoutContext);
  if (!workout) throw new Error('useWorkout needs a WorkoutProvider');
  return workout;
}

const NAMES: Record<StartChoice['kind'], string> = {
  'up-next': 'Up next',
  empty: 'Workout',
  cardio: 'Cardio',
  template: 'Workout',
};

/**
 * Holds the workout in progress for the whole app, so the logger sheet can be dismissed
 * (minimised) and reopened from the tab bar. This is the contract every screen starts workouts
 * through; the logger owns what happens inside it.
 */
export function WorkoutProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [live, setLive] = useState<LiveWorkout | null>(null);

  const open = useCallback(() => router.push('/workout'), [router]);
  const start = useCallback(
    (choice: StartChoice, options?: { replace?: boolean }) => {
      if (!live)
        setLive({
          name: choice.kind === 'template' ? choice.name : NAMES[choice.kind],
          startedAt: Date.now(),
        });
      if (options?.replace) router.replace('/workout');
      else router.push('/workout');
    },
    [live, router],
  );
  // Navigating from here, the root layout, reaches the root stack's sheets; a push made from
  // inside the native tab layout's press handler does not present them.
  const openStartMenu = useCallback(
    () => router.push(live ? '/workout' : '/start-workout'),
    [live, router],
  );
  const discard = useCallback(() => setLive(null), []);

  const value = useMemo(
    () => ({ live, start, open, openStartMenu, discard }),
    [live, start, open, openStartMenu, discard],
  );
  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>;
}
