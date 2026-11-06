import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { restTimerProgress } from './restTimer';
import { formatSeconds } from './utils';

/**
 * The live time under the workout title, marked while the workout is paused. A live workout gets a
 * pause or resume button beside its time.
 */
export function WorkoutHeaderMeta({
  durationLabel,
  paused = false,
  onTogglePause,
}: {
  durationLabel: string;
  paused?: boolean;
  onTogglePause?: () => void;
}) {
  const label = `${paused ? 'Resume' : 'Pause'} workout`;
  return (
    <span className={`workout-header-meta${paused ? ' is-paused' : ''}`}>
      <span className="workout-header-duration">{durationLabel}</span>
      {paused && (
        <>
          <span className="workout-header-separator" aria-hidden="true">
            •
          </span>
          <span className="workout-header-paused">Paused</span>
        </>
      )}
      {onTogglePause && (
        <button
          type="button"
          className="workout-header-pause"
          aria-label={label}
          title={label}
          onClick={onTogglePause}
        >
          <Icon name={paused ? 'play' : 'pause'} />
        </button>
      )}
    </span>
  );
}

/** How much each skip button takes off or adds to the rest. */
export const REST_ADJUST_SECONDS = 30;

/** A circular arrow around "30", drawn with the same strokes as the app's icons. */
function SkipIcon({ direction }: { direction: 'back' | 'forward' }) {
  return (
    <svg className="rest-skip-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={direction === 'back' ? 'M5.07 8A8 8 0 1 0 12 4' : 'M18.93 8A8 8 0 1 1 12 4'} />
      <path d={direction === 'back' ? 'M14.4 1.6 12 4l2.4 2.4' : 'M9.6 1.6 12 4 9.6 6.4'} />
      <text x="12" y="15.2" textAnchor="middle">
        {REST_ADJUST_SECONDS}
      </text>
    </svg>
  );
}

/**
 * The rest timer at the bottom of the logger: a slim pill with pause or play, the countdown, end,
 * -30/+30 and hide. A hidden rest tucks into a notch on the bottom edge. Pausing freezes the rest
 * and the live workout time together. Taking off all the rest left ends it.
 */
export function WorkoutTimerDock({
  restSeconds,
  restTotal,
  restHidden,
  paused,
  onTogglePause,
  onAdjust,
  onHide,
  onShow,
  onEnd,
  joined = false,
}: {
  restSeconds: number;
  restTotal: number;
  restHidden: boolean;
  paused: boolean;
  onTogglePause: () => void;
  /** Adds (positive) or takes off (negative) seconds. */
  onAdjust: (seconds: number) => void;
  onHide: () => void;
  onShow: () => void;
  onEnd: () => void;
  /** The weekly sets shelf sits on top, so the pill squares its top corners to join it. */
  joined?: boolean;
}) {
  const notchRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Keep keyboard focus on the control that replaces the one just used, once it has rendered.
  const focusNext = useRef<typeof notchRef | null>(null);
  useEffect(() => {
    focusNext.current?.current?.focus({ preventScroll: true });
    focusNext.current = null;
  });
  const time = formatSeconds(restSeconds);
  const verb = paused ? 'Resume' : 'Pause';
  const progress = `scaleX(${restTimerProgress(restSeconds, restTotal)})`;
  const state = paused ? ' is-paused' : '';
  // The fill glides through each second, but snaps quickly to a jump such as -30 or +30.
  const [shownSeconds, setShownSeconds] = useState(restSeconds);
  const [jumped, setJumped] = useState(false);
  if (restSeconds !== shownSeconds) {
    setShownSeconds(restSeconds);
    setJumped(Math.abs(restSeconds - shownSeconds) > 1);
  }

  if (restSeconds <= 0) return null;
  if (!restHidden) {
    return (
      <div
        className={`workout-timer-dock rest-pill${state}${joined ? ' has-weekly-shelf' : ''}`}
        role="group"
        aria-label="Rest timer"
      >
        <span
          className={`rest-pill-fill${jumped ? ' is-jump' : ''}`}
          aria-hidden="true"
          style={{ transform: progress }}
        />
        <button
          ref={toggleRef}
          type="button"
          className="rest-pill-toggle"
          aria-label={`${verb} workout and rest timer`}
          title={`${verb} workout and rest timer`}
          onClick={onTogglePause}
        >
          <Icon name={paused ? 'play' : 'pause'} />
        </button>
        <strong
          className="rest-pill-time"
          role="timer"
          aria-label={`Rest timer ${time}${paused ? ', paused' : ''}`}
        >
          {time}
        </strong>
        <button
          type="button"
          className="rest-pill-end"
          aria-label="End rest timer"
          title="End rest timer"
          onClick={onEnd}
        >
          <Icon name="close" />
        </button>
        <button
          type="button"
          className="rest-pill-adjust"
          aria-label={`Take ${REST_ADJUST_SECONDS} seconds off the rest`}
          title={`Take ${REST_ADJUST_SECONDS} seconds off the rest`}
          onClick={() => onAdjust(-REST_ADJUST_SECONDS)}
        >
          <SkipIcon direction="back" />
        </button>
        <button
          type="button"
          aria-label={`Add ${REST_ADJUST_SECONDS} seconds to the rest`}
          title={`Add ${REST_ADJUST_SECONDS} seconds to the rest`}
          onClick={() => onAdjust(REST_ADJUST_SECONDS)}
        >
          <SkipIcon direction="forward" />
        </button>
        <button
          type="button"
          className="rest-pill-hide"
          aria-label="Hide rest timer"
          title="Hide rest timer"
          onClick={() => {
            focusNext.current = notchRef;
            onHide();
          }}
        >
          <Icon name="chevron-down" />
        </button>
      </div>
    );
  }

  const label = `Show ${paused ? 'paused ' : ''}rest timer, ${time} left`;
  return (
    <button
      ref={notchRef}
      type="button"
      className={`workout-timer-dock rest-notch${state}`}
      aria-label={label}
      title={label}
      onClick={() => {
        focusNext.current = toggleRef;
        onShow();
      }}
    >
      <Icon name={paused ? 'pause' : 'timer'} />
      <strong role="timer" aria-label={`Rest timer ${time}`}>
        {time}
      </strong>
    </button>
  );
}
