import type { ReactNode } from 'react';
import { RestTimeSelect } from './RestTimeSelect';
import { previousSetRests } from './workoutRestHistory';
import type { ExerciseHistoryEntry } from './exerciseHistory';
import type { WorkoutSetInput } from './types';
import './setRestControl.css';

export function SetRestControl({
  seconds,
  setIndex,
  sets,
  history,
  suggested,
  onChange,
  leading,
}: {
  seconds: number;
  setIndex: number;
  sets: WorkoutSetInput[];
  history: ExerciseHistoryEntry[];
  suggested: boolean;
  onChange: (seconds: number) => void;
  /** An action placed over the start of the divider, such as adding a set here. */
  leading?: ReactNode;
}) {
  const previous = previousSetRests(sets, setIndex, history);
  const ghost = suggested && previous[0]?.seconds === seconds;
  return (
    <div className={`rest-between${ghost ? ' rest-is-suggested' : ''}`}>
      {leading}
      <i aria-hidden="true" />
      <div className="rest-between-controls">
        <label>
          <RestTimeSelect
            seconds={seconds}
            label={`Rest after set ${setIndex + 1}`}
            onChange={onChange}
          />
        </label>
        <span>rest</span>
      </div>
      <i aria-hidden="true" />
    </div>
  );
}
