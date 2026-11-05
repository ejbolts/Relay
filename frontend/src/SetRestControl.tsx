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
}: {
  seconds: number;
  setIndex: number;
  sets: WorkoutSetInput[];
  history: ExerciseHistoryEntry[];
  suggested: boolean;
  onChange: (seconds: number) => void;
}) {
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
        <span>rest</span>
      </div>
      <i aria-hidden="true" />
    </div>
  );
}
