import { Icon } from './Icon';
import {
  bodyGoalKind,
  bodyGoalName,
  weightChangeAmount,
  type BodyHistoryGoal,
  type BodyHistoryWeightChange as WeightChange,
} from './bodyMeasurementHistory';
import type { WeightUnit } from './weightUnits';
import './bodyMeasurementHistory.css';

function goalComparison(change: WeightChange): string {
  if (!change.goalDirection || change.status === 'neutral') return '';
  if (change.goalDirection === 'maintain') {
    return `; ${change.status === 'favorable' ? 'closer to' : 'further from'} maintenance weight`;
  }
  return `; ${change.status === 'favorable' ? 'in line with' : 'opposite to'} weight-${change.goalDirection} goal`;
}

export function BodyHistoryWeightChange({
  change,
  comparison,
  unit,
  decimals,
  fixed = false,
}: {
  change: WeightChange | null;
  comparison: string;
  unit: WeightUnit;
  /** Decimal places the row's weight is shown with. */
  decimals: number;
  /** Whether the row's weight keeps trailing zeros, such as 90.0 kg. */
  fixed?: boolean;
}) {
  if (!change) return null;
  const amount = weightChangeAmount(change, unit, decimals, fixed);
  const label = `Weight ${change.direction === 'up' ? 'increased' : 'decreased'} by ${amount} ${unit} since ${comparison}${goalComparison(change)}`;
  return (
    <span
      className={`body-history-weight-change ${change.status}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon name={change.direction} />
      <span className="body-history-weight-change-amount num" aria-hidden="true">
        {amount}
      </span>
    </span>
  );
}

/** A dotted rule under the oldest row of a new goal, naming the goal and when it started. */
export function BodyHistoryGoalDivider({
  goal,
  unit,
}: {
  goal: BodyHistoryGoal & { target_weight_kg: number };
  unit: WeightUnit;
}) {
  const kind = bodyGoalKind(goal);
  const name = bodyGoalName(goal, unit);
  const start = new Date(`${goal.start_date}T12:00:00`);
  const date = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    ...(start.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  }).format(start);
  return (
    <div
      className={`body-history-goal-divider ${kind}`}
      role="separator"
      aria-label={`New goal from ${date}: ${name}`}
    >
      <span className="body-history-goal-name" aria-hidden="true">
        <Icon name={kind === 'maintain' ? 'level' : kind === 'loss' ? 'down' : 'up'} />
        {name}
      </span>
      <span className="body-history-goal-dots" aria-hidden="true" />
      <span className="body-history-goal-date" aria-hidden="true">
        from {date}
      </span>
    </div>
  );
}
