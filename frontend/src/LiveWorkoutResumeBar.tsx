import { useEffect, useRef } from 'react';
import { useLiveWorkoutClock, formatElapsed } from './elapsed';
import { useRestCountdown } from './restTimer';
import { Icon } from './Icon';
import { formatSeconds } from './utils';
import './liveWorkout.css';

export interface LiveWorkoutSummary {
  name: string;
  loggedSets: number;
  previousDurationMinutes: number;
  durationOverrideMinutes: number | null;
  paused: boolean;
}

export function LiveWorkoutResumeBar({
  startedAt,
  summary,
  restEndsAt,
  aboveTabBar,
  onResume,
}: {
  startedAt: number;
  summary: LiveWorkoutSummary;
  restEndsAt: number | null;
  aboveTabBar: boolean;
  onResume: () => void;
}) {
  const { elapsed } = useLiveWorkoutClock(startedAt);
  const restLeft = useRestCountdown(restEndsAt);
  const duration =
    summary.durationOverrideMinutes !== null
      ? summary.durationOverrideMinutes * 60
      : summary.previousDurationMinutes * 60 + elapsed;
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // When the logger is hidden, its focused control must be replaced by a visible one.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.closest('[hidden]'))
      button.current?.focus({ preventScroll: true });
  }, []);
  return (
    <button
      ref={button}
      type="button"
      className={`live-workout-resume${aboveTabBar ? ' above-tab-bar' : ''}${summary.paused ? ' is-paused' : ''}`}
      aria-label="Resume active workout"
      onClick={onResume}
    >
      <span className="live-workout-resume-icon">
        <Icon name={summary.paused ? 'pause' : 'timer'} />
      </span>
      <span className="live-workout-resume-copy">
        <strong>{summary.name}</strong>
        <span>
          {summary.paused ? 'Paused' : 'Live'}{' '}
          <span className="live-workout-resume-duration">{formatElapsed(duration)}</span>
          <span aria-hidden="true"> · </span>
          {summary.loggedSets} {summary.loggedSets === 1 ? 'set' : 'sets'} logged
          {restLeft > 0 && (
            <span className="live-workout-resume-rest"> · Rest {formatSeconds(restLeft)}</span>
          )}
        </span>
      </span>
      <Icon name="chevron-down" />
    </button>
  );
}
