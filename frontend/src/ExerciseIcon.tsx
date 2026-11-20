import { exerciseIconFor } from './exerciseIcons';
import type { Exercise } from './types';

/** An exercise's icon, with an optional number badge and a warm-up-only warning. */
export function ExerciseIcon({
  exercise,
  number,
  warning = false,
}: {
  exercise: Exercise;
  number?: number;
  /** Flags a finished exercise that only has warm-up sets. */
  warning?: boolean;
}) {
  return (
    <span className="exercise-icon" aria-hidden="true">
      <img src={exerciseIconFor(exercise)} alt="" />
      {number !== undefined && <b>{number}</b>}
      {warning && <span className="exercise-icon-warning">!</span>}
    </span>
  );
}
