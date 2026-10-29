import { trackedCardioGoals } from './cardioZones';
import { Meter } from './PulseCharts';
import type { CardioGoalCardSettings } from './homeLayout';
import type { CardioGoalWeek } from './types';
import './cardioZones.css';

function status(goals: CardioGoalWeek[], daysLeft: number | null) {
  if (!goals.length) return 'Set a weekly goal in Cardio';
  if (goals.every((goal) => goal.complete))
    return goals.length === 1 ? 'Weekly goal reached' : 'All goals reached';
  if (goals.length > 1)
    return `${goals.filter((goal) => goal.complete).length} of ${goals.length} goals reached`;
  const days = daysLeft === null ? '' : ` · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
  return `${goals[0].remaining_minutes} min to go${days}`;
}

function Ring({ goal, size }: { goal: CardioGoalWeek; size: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = goal.goal_minutes ? Math.min(1, goal.completed_minutes / goal.goal_minutes) : 0;
  return (
    <svg
      className={`cardio-goal-ring${goal.complete ? ' complete' : ''}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="meter"
      aria-label={`Zone ${goal.zone} minutes this week`}
      aria-valuemin={0}
      aria-valuemax={goal.goal_minutes}
      aria-valuenow={goal.completed_minutes}
    >
      <circle cx={size / 2} cy={size / 2} r={radius} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeDasharray={`${circumference * ratio} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export function CardioGoalCard({
  goals,
  settings,
  daysLeft,
  onOpen,
}: {
  goals: CardioGoalWeek[];
  settings: CardioGoalCardSettings;
  daysLeft: number | null;
  onOpen: () => void;
}) {
  const tracked = trackedCardioGoals(goals, settings);
  const single = tracked.length === 1 ? tracked[0] : null;
  const title = single ? `Zone ${single.zone} cardio` : 'Cardio zone goals';
  return (
    <button
      type="button"
      className={`pulse-card pulse-mini cardio-goal-card is-${settings.style}`}
      onClick={onOpen}
    >
      <span>{title}</span>
      {settings.style === 'list' ? (
        tracked.map((goal) => (
          <span className={`home-cardio-goal${goal.complete ? ' complete' : ''}`} key={goal.zone}>
            <b>Zone {goal.zone}</b>{' '}
            <small>
              {goal.completed_minutes} / {goal.goal_minutes} min
            </small>
          </span>
        ))
      ) : settings.style === 'ring' ? (
        single ? (
          <span className="cardio-goal-ring-single">
            <span className="cardio-goal-ring-value">
              <Ring goal={single} size={64} />
              <strong>{single.completed_minutes}</strong>
            </span>
            <small>of {single.goal_minutes} min</small>
          </span>
        ) : (
          <span className="cardio-goal-rings">
            {tracked.map((goal) => (
              <span key={goal.zone}>
                <Ring goal={goal} size={40} />
                <b>Z{goal.zone}</b>
                <small>
                  {goal.completed_minutes}/{goal.goal_minutes}
                </small>
              </span>
            ))}
          </span>
        )
      ) : single ? (
        <>
          <strong>
            {single.completed_minutes}
            <small> / {single.goal_minutes} min</small>
          </strong>
          <Meter
            value={single.completed_minutes}
            max={single.goal_minutes}
            label={`Zone ${single.zone} minutes this week`}
          />
        </>
      ) : (
        tracked.map((goal) => (
          <span className="cardio-goal-bar" key={goal.zone}>
            <span className={`home-cardio-goal${goal.complete ? ' complete' : ''}`}>
              <b>Zone {goal.zone}</b>{' '}
              <small>
                {goal.completed_minutes} / {goal.goal_minutes} min
              </small>
            </span>
            <Meter
              value={goal.completed_minutes}
              max={goal.goal_minutes}
              label={`Zone ${goal.zone} minutes this week`}
            />
          </span>
        ))
      )}
      <p>{status(tracked, daysLeft)}</p>
    </button>
  );
}
