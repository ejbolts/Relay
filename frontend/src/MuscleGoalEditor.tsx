import { goalMuscles } from './muscleGoalEditing';
import type { MuscleSetGoals } from './muscleSetGoals';
import type { Exercise } from './types';
import './muscleGoals.css';

export function MuscleGoalEditor({
  exercises,
  defaultGoal,
  goals = {},
  onChange,
  onCommit,
}: {
  exercises: Exercise[];
  defaultGoal: number;
  goals?: MuscleSetGoals;
  onChange: (goals: MuscleSetGoals) => void;
  /** Leaving a target's field, for saving what was typed. */
  onCommit?: () => void;
}) {
  const muscles = goalMuscles(exercises, goals);
  const custom = Object.keys(goals).length;
  const reset = (muscle: string) => {
    const next = { ...goals };
    delete next[muscle];
    onChange(next);
  };

  return (
    <details className="muscle-goal-editor">
      <summary>
        Muscle targets <span>{custom ? `${custom} custom` : 'All use default'}</span>
      </summary>
      <div className="muscle-goal-list">
        {muscles.map((muscle) => (
          <div className="muscle-goal-row" key={muscle}>
            <label>
              <span>{muscle}</span>
              <input
                type="number"
                inputMode="numeric"
                enterKeyHint="next"
                min="1"
                max="1000"
                step="1"
                aria-label={`${muscle} weekly set goal`}
                aria-invalid={
                  goals[muscle] === undefined ||
                  (Number.isInteger(goals[muscle]) && goals[muscle] >= 1 && goals[muscle] <= 1000)
                    ? undefined
                    : true
                }
                value={goals[muscle] ?? ''}
                placeholder={String(defaultGoal)}
                onBlur={onCommit}
                onChange={(event) =>
                  event.target.value === ''
                    ? reset(muscle)
                    : onChange({ ...goals, [muscle]: Number(event.target.value) })
                }
              />
            </label>
            <button
              type="button"
              disabled={goals[muscle] === undefined}
              aria-label={`Use default goal for ${muscle}`}
              onClick={() => reset(muscle)}
            >
              Default
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}
