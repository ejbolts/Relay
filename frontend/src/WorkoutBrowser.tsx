import { flushSync } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { Icon } from './Icon';
import { motionReduced } from './motion';
import type { TrackedWorkout } from './types';

export interface WorkoutNavigation {
  previous: () => void;
  next: () => void;
  canPrevious: boolean;
  canNext: boolean;
  loading: boolean;
}

function chronologicalWorkouts(workouts: TrackedWorkout[]): TrackedWorkout[] {
  return [...new Map(workouts.map((workout) => [workout.id, workout])).values()].sort(
    (a, b) =>
      a.workout_date.localeCompare(b.workout_date) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  );
}

/** Keep the original logger mounted, including its unsaved edits and running timers. */
export function WorkoutBrowser({
  workouts,
  initialWorkout,
  resumedWorkoutId,
  hasOlder,
  resumeRequest = 0,
  children,
}: {
  workouts: TrackedWorkout[];
  initialWorkout: TrackedWorkout | null;
  resumedWorkoutId: string | null;
  hasOlder: boolean;
  /** Return to the mounted live logger when its resume bar is used. */
  resumeRequest?: number;
  children: (navigation: WorkoutNavigation, viewedWorkout: TrackedWorkout | null) => ReactNode;
}) {
  const originId = initialWorkout?.id ?? null;
  const [selectedId, setSelectedId] = useState(originId);
  useEffect(() => setSelectedId(originId), [originId, resumeRequest]);
  const [olderWorkouts, setOlderWorkouts] = useState<TrackedWorkout[]>([]);
  const [allLoaded, setAllLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const ordered = useMemo(
    () =>
      chronologicalWorkouts([
        ...olderWorkouts,
        ...workouts,
        ...(initialWorkout ? [initialWorkout] : []),
      ]).filter((workout) => initialWorkout || workout.id !== resumedWorkoutId),
    [olderWorkouts, workouts, initialWorkout, resumedWorkoutId],
  );
  // An in-progress session is the last destination, even when logging an earlier date.
  const ids: Array<string | null> = [...ordered.map((workout) => workout.id)];
  if (!initialWorkout) ids.push(null);
  const position = ids.indexOf(selectedId);
  const viewedWorkout =
    selectedId === originId ? null : (ordered.find((workout) => workout.id === selectedId) ?? null);
  const activePanel = () =>
    root.current?.querySelector<HTMLElement>('[data-workout-session]:not([hidden])');
  const content = () =>
    Array.from(
      activePanel()?.querySelectorAll<HTMLElement>(
        '.overlay-header-copy, .workout-summary-fields, .movement-stack, .browse-history-content',
      ) ?? [],
    );

  async function move(direction: -1 | 1) {
    if (locked.current) return;
    let target = ids[position + direction];
    const needsOlder = direction === -1 && position === 0 && hasOlder && !allLoaded;
    if (target === undefined && !needsOlder) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      if (needsOlder) {
        // Only fetch the complete log when navigation reaches the loaded history boundary.
        const fullHistory = await api.listWorkouts('0001-01-01');
        if (!mounted.current) return;
        setOlderWorkouts(fullHistory);
        setAllLoaded(true);
        const complete = chronologicalWorkouts([...fullHistory, ...ordered]).filter(
          (workout) => initialWorkout || workout.id !== resumedWorkoutId,
        );
        const completeIds: Array<string | null> = complete.map((workout) => workout.id);
        if (!initialWorkout) completeIds.push(null);
        target = completeIds[completeIds.indexOf(selectedId) - 1];
        if (target === undefined) return;
      }
      const animate = !motionReduced() && typeof HTMLElement.prototype.animate === 'function';
      if (animate) {
        await Promise.all(
          content().map((element) =>
            element
              .animate(
                [
                  { opacity: 1, transform: 'translateX(0)' },
                  { opacity: 0, transform: `translateX(${-direction * 12}px)` },
                ],
                { duration: 100, easing: 'ease-in' },
              )
              .finished.catch(() => undefined),
          ),
        );
      }
      if (!mounted.current) return;
      flushSync(() => setSelectedId(target!));
      const sheetScroll = root.current?.closest<HTMLElement>('.live-workout-sheet-scroll');
      if (sheetScroll) sheetScroll.scrollTo?.({ top: 0, behavior: 'instant' });
      else window.scrollTo({ top: 0, behavior: 'instant' });
      if (animate) {
        await Promise.all(
          content().map((element) =>
            element
              .animate(
                [
                  { opacity: 0, transform: `translateX(${direction * 14}px)` },
                  { opacity: 1, transform: 'translateX(0)' },
                ],
                { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' },
              )
              .finished.catch(() => undefined),
          ),
        );
      }
    } catch (reason) {
      if (mounted.current)
        setError(reason instanceof Error ? reason.message : 'Could not load previous workouts.');
    } finally {
      locked.current = false;
      if (mounted.current) {
        flushSync(() => setBusy(false));
        const panel = activePanel();
        const button =
          panel?.querySelector<HTMLButtonElement>(
            `.workout-navigation-${direction < 0 ? 'previous' : 'next'}:not(:disabled)`,
          ) ?? panel?.querySelector<HTMLButtonElement>('.workout-navigation-arrow:not(:disabled)');
        button?.focus({ preventScroll: true });
      }
    }
  }

  const navigation: WorkoutNavigation = {
    previous: () => void move(-1),
    next: () => void move(1),
    canPrevious: position > 0 || (hasOlder && !allLoaded),
    canNext: position >= 0 && position < ids.length - 1,
    loading: busy,
  };
  return (
    <div className="workout-browser" ref={root} aria-busy={busy}>
      {error && (
        <p className="inline-error workout-navigation-error" role="alert">
          {error} Try the previous arrow again.
        </p>
      )}
      <div data-workout-session="original" hidden={selectedId !== originId}>
        {children(navigation, null)}
      </div>
      {viewedWorkout && (
        <div data-workout-session={viewedWorkout.id} key={viewedWorkout.id}>
          {children(navigation, viewedWorkout)}
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {busy
          ? 'Switching workouts…'
          : viewedWorkout
            ? `${viewedWorkout.name}, ${viewedWorkout.workout_date}, view only`
            : initialWorkout
              ? initialWorkout.name
              : 'Live workout'}
      </span>
    </div>
  );
}

export function WorkoutNavigationArrows({ navigation }: { navigation: WorkoutNavigation }) {
  return (
    <>
      <button
        type="button"
        className="workout-navigation-arrow workout-navigation-previous"
        aria-label={
          navigation.canPrevious ? 'Previous workout' : 'Oldest workout — no previous workout'
        }
        disabled={!navigation.canPrevious || navigation.loading}
        onClick={navigation.previous}
      >
        <Icon name="chevron-left" />
      </button>
      <button
        type="button"
        className="workout-navigation-arrow workout-navigation-next"
        aria-label={navigation.canNext ? 'Next workout' : 'Latest workout — no next workout'}
        disabled={!navigation.canNext || navigation.loading}
        onClick={navigation.next}
      >
        <Icon name="chevron-right" />
      </button>
    </>
  );
}
