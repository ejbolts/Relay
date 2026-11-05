import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { RestTimeSelect } from './RestTimeSelect';
import { formatSeconds } from './utils';
import { previousSetRests } from './workoutRestHistory';
import type { ExerciseHistoryEntry } from './exerciseHistory';
import type { WorkoutSetInput } from './types';
import './setRestControl.css';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function SetRestControl({
  seconds,
  setIndex,
  sets,
  history,
  suggested,
  onChange,
}: {
  seconds: number;
  setIndex: number;
  sets: WorkoutSetInput[];
  history: ExerciseHistoryEntry[];
  suggested: boolean;
  onChange: (seconds: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previous = previousSetRests(sets, setIndex, history);
  const ghost = suggested && previous[0]?.seconds === seconds;
  return (
    <div className={`rest-between${ghost ? ' rest-is-suggested' : ''}`}>
      <i aria-hidden="true" />
      <div className="rest-between-controls">
        <label>
          <RestTimeSelect
            seconds={seconds}
            label={`Rest after set ${setIndex + 1}`}
            onChange={onChange}
          />
        </label>
        {previous.length > 0 && (
          <button
            ref={triggerRef}
            type="button"
            className="rest-history-button"
            aria-label={`Previous rests after set ${setIndex + 1}`}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Icon name="history" />
          </button>
        )}
        <span>rest</span>
      </div>
      <i aria-hidden="true" />
      {open && (
        <PopupDialog
          title={`Rest after set ${setIndex + 1}`}
          className="set-rest-history-dialog"
          onClose={() => {
            setOpen(false);
            requestAnimationFrame(() => triggerRef.current?.focus());
          }}
        >
          <ul className="set-rest-history-list">
            {previous.map((entry) => (
              <li key={entry.workoutId}>
                <time dateTime={entry.date}>
                  {dateFormat.format(new Date(`${entry.date}T12:00:00`))}
                </time>
                <strong>{entry.seconds ? formatSeconds(entry.seconds) : 'No rest'}</strong>
              </li>
            ))}
          </ul>
        </PopupDialog>
      )}
    </div>
  );
}
