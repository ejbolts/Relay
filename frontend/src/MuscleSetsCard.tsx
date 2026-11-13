import { useId, useState, type CSSProperties } from 'react';
import { Icon } from './Icon';
import { muscleSetGoal, type MuscleSetGoals } from './muscleSetGoals';
import { PopupDialog } from './PopupDialog';
import { shortDate } from './trainingSummary';
import type { WeeklyMuscleContribution } from './types';
import type { MuscleSetsWeek } from './liveMuscleSets';
import './muscleSets.css';

const credits = (value: number) => Number(value.toFixed(3)).toLocaleString();

const weekName = (weeksAgo: number) =>
  weeksAgo === 0 ? 'This week' : weeksAgo === 1 ? 'Last week' : `${weeksAgo} weeks ago`;

/** "+2", "−1.5" or "±0" for the change on the week before. */
function signedChange(change: number) {
  if (change > 0) return `+${credits(change)}`;
  if (change < 0) return `−${credits(-change)}`;
  return '±0';
}

export function MuscleSetsCard({
  weeklySets,
  history = [],
  goal,
  goals,
  onOpenWorkout,
}: {
  weeklySets: MuscleSetsWeek | null | undefined;
  /** The weeks before `weeklySets`, newest first. Older cached dashboards have none. */
  history?: MuscleSetsWeek[];
  goal: number;
  goals?: MuscleSetGoals;
  onOpenWorkout?: (contribution: WeeklyMuscleContribution) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [requestedWeeksAgo, setWeeksAgo] = useState(0);
  const titleId = useId();
  const listId = useId();
  const weeks = weeklySets ? [weeklySets, ...history] : [];
  const weeksAgo = Math.min(requestedWeeksAgo, Math.max(0, weeks.length - 1));
  const week = weeks[weeksAgo];
  const previous = weeks[weeksAgo + 1];
  const previousSets = new Map(
    (previous?.muscle_groups ?? []).map((item) => [item.muscle_group, item.raw_sets]),
  );
  const before = (name: string) => (previous ? (previousSets.get(name) ?? 0) : null);
  const groups = new Map((week?.muscle_groups ?? []).map((item) => [item.muscle_group, item]));
  // A muscle trained only the week before still gets a row, so the drop is visible.
  for (const item of previous?.muscle_groups ?? []) {
    if (item.raw_sets > 0 && !groups.has(item.muscle_group)) {
      groups.set(item.muscle_group, {
        muscle_group: item.muscle_group,
        raw_sets: 0,
        contributions: [],
      });
    }
  }
  const allMuscles = [...groups.values()].sort(
    (left, right) =>
      right.raw_sets - left.raw_sets ||
      (before(right.muscle_group) ?? 0) - (before(left.muscle_group) ?? 0) ||
      left.muscle_group.localeCompare(right.muscle_group),
  );
  const muscles = allMuscles.filter(
    (item) => item.raw_sets > 0 || (before(item.muscle_group) ?? 0) > 0,
  );
  const visibleMuscles = expanded ? allMuscles : muscles.slice(0, 8);
  const untrained = allMuscles.filter((item) => item.raw_sets <= 0).length;
  // A shared set scale keeps volumes comparable; each muscle's target gets its own tick.
  // Include all weeks so neither bars nor target ticks jump while stepping through history.
  const scale = Math.max(
    goal * 1.15,
    ...allMuscles.map((item) => muscleSetGoal(item.muscle_group, goal, goals) * 1.15),
    ...weeks.flatMap((item) => item.muscle_groups.map((group) => group.raw_sets)),
  );
  const muscle = allMuscles.find((item) => item.muscle_group === selected);
  const name = weekName(weeksAgo);
  const current = weeksAgo === 0;

  return (
    <section className="pulse-card muscle-sets-card" aria-labelledby={titleId}>
      <header className="pulse-card-header muscle-sets-header">
        <h2 id={titleId}>Sets per muscle</h2>
        <div className="muscle-week-nav" role="group" aria-label="Week">
          <button
            type="button"
            aria-label="Previous week"
            disabled={weeksAgo >= weeks.length - 1}
            onClick={() => setWeeksAgo(weeksAgo + 1)}
          >
            <Icon name="chevron-left" />
          </button>
          <span aria-live="polite">{name}</span>
          <button
            type="button"
            aria-label="Next week"
            disabled={current}
            onClick={() => setWeeksAgo(weeksAgo - 1)}
          >
            <Icon name="chevron-right" />
          </button>
        </div>
      </header>
      <p className="muscle-set-goal-key">
        {week && (
          <span className="muscle-key-item">
            <i className="muscle-key-swatch" aria-hidden="true" />
            {current ? 'Current week' : name}
          </span>
        )}
        {previous && (
          <span className="muscle-key-item">
            <i className="muscle-key-swatch is-previous" aria-hidden="true" />
            {weekName(weeksAgo + 1)}
          </span>
        )}
        <span className="muscle-key-item">
          <i className="muscle-key-goal" aria-hidden="true" />
          {Object.keys(goals ?? {}).length ? 'Weekly target' : `Goal ${goal}`}
        </span>
      </p>
      <ul
        id={listId}
        hidden={visibleMuscles.length === 0}
        className="muscle-bars"
        aria-label={`Working sets per muscle, ${name.toLowerCase()}; individual weekly targets`}
      >
        {visibleMuscles.map((item, index) => {
          const last = before(item.muscle_group);
          const change = last === null ? null : item.raw_sets - last;
          const target = muscleSetGoal(item.muscle_group, goal, goals);
          return (
            <li key={item.muscle_group}>
              <button
                type="button"
                className="muscle-name-button"
                aria-label={`Exercises contributing to ${item.muscle_group}`}
                aria-haspopup="dialog"
                onClick={() => setSelected(item.muscle_group)}
              >
                {item.muscle_group}
              </button>
              <span
                className="muscle-bar-track"
                role="progressbar"
                aria-label={`${item.muscle_group} weekly target`}
                aria-valuemin={0}
                aria-valuemax={target}
                aria-valuenow={Math.min(item.raw_sets, target)}
                aria-valuetext={`${credits(item.raw_sets)} of ${target} sets`}
                style={{ '--muscle-goal-ratio': target / scale } as CSSProperties}
              >
                {last !== null && last > 0 && (
                  <i
                    className="muscle-bar-previous"
                    style={{ width: `${(last / scale) * 100}%` }}
                  />
                )}
                <i
                  style={
                    {
                      width: `${(item.raw_sets / scale) * 100}%`,
                      '--d': `${index * 45}ms`,
                    } as CSSProperties
                  }
                />
              </span>
              <b className="num">
                {credits(item.raw_sets)}
                <small className="muscle-row-target">/ {target}</small>
                {change !== null && (
                  <small
                    className={`muscle-set-change ${change > 0 ? 'is-up' : change < 0 ? 'is-down' : 'is-same'}`}
                    aria-label={
                      change === 0
                        ? 'same as the week before'
                        : `${change > 0 ? 'up' : 'down'} ${credits(Math.abs(change))} on the week before`
                    }
                  >
                    {signedChange(change)}
                  </small>
                )}
              </b>
            </li>
          );
        })}
      </ul>
      {!muscles.length && (
        <p className="pulse-empty-line">
          {current ? 'No working sets logged yet this week.' : 'No working sets logged that week.'}
        </p>
      )}
      {muscles.length > 0 && untrained > 0 && (
        <p className="pulse-footnote">
          {untrained} muscles not trained{current ? ' yet' : ''}
        </p>
      )}
      {(expanded || allMuscles.length > visibleMuscles.length) && (
        <button
          type="button"
          className="show-more-button muscle-sets-expand"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show less' : 'Show more'}
          <Icon name="chevron-down" />
        </button>
      )}
      {muscle && (
        <MuscleContributionSheet
          key={muscle.muscle_group}
          muscle={muscle}
          current={current}
          weekLabel={name}
          goal={muscleSetGoal(muscle.muscle_group, goal, goals)}
          onClose={() => setSelected(null)}
          onOpenWorkout={onOpenWorkout}
        />
      )}
    </section>
  );
}

function MuscleContributionSheet({
  muscle,
  current,
  weekLabel,
  goal,
  onClose,
  onOpenWorkout,
}: {
  muscle: MuscleSetsWeek['muscle_groups'][number];
  current: boolean;
  weekLabel: string;
  goal: number;
  onClose: () => void;
  onOpenWorkout?: (contribution: WeeklyMuscleContribution) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contributions = muscle.contributions ?? [];
  const percentage = Math.round((muscle.raw_sets / goal) * 100);

  async function open(contribution: WeeklyMuscleContribution) {
    if (busy || !onOpenWorkout) return;
    setBusy(true);
    setError(null);
    try {
      await onOpenWorkout(contribution);
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not open that workout. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <PopupDialog
      title={muscle.muscle_group}
      kicker={weekLabel.toUpperCase()}
      className="muscle-contribution-sheet"
      closeLabel="Done"
      swipeToDismiss
      onClose={onClose}
    >
      <div className="muscle-sheet-body">
        <p className="muscle-sheet-total">
          <strong>{credits(muscle.raw_sets)}</strong>
          <span>set credits {current ? 'this week' : 'that week'}</span>
        </p>
        <div
          className="muscle-sheet-goal"
          role="progressbar"
          aria-label={`${muscle.muscle_group} weekly goal`}
          aria-valuemin={0}
          aria-valuemax={goal}
          aria-valuenow={Math.min(muscle.raw_sets, goal)}
          aria-valuetext={`${credits(muscle.raw_sets)} of ${goal} sets`}
        >
          <span style={{ width: `${Math.min(percentage, 100)}%` }} />
        </div>
        <p className="muscle-sheet-goal-label">
          <span>
            {credits(muscle.raw_sets)} of {goal} sets
          </span>
          <span>{percentage}% of goal</span>
        </p>
        {contributions.length ? (
          <ul className="muscle-contribution-list">
            {contributions.map((contribution) => (
              <li key={`${contribution.workout_id}:${contribution.movement_id}`}>
                <button
                  type="button"
                  disabled={busy || !onOpenWorkout}
                  onClick={() => void open(contribution)}
                  aria-label={`View ${contribution.exercise_name} in ${contribution.workout_name}, ${shortDate(contribution.workout_date)}`}
                >
                  <span className="muscle-contribution-copy">
                    <strong>
                      {contribution.exercise_name}
                      <Icon name="chevron-right" />
                    </strong>
                    <span>
                      {contribution.workout_name} · {shortDate(contribution.workout_date)}
                    </span>
                    <small>
                      {contribution.working_sets} working{' '}
                      {contribution.working_sets === 1 ? 'set' : 'sets'} ×{' '}
                      {credits(contribution.credit_per_set)} ·{' '}
                      {contribution.credit_per_set >= 1 ? 'Direct' : 'Assistance'}
                    </small>
                  </span>
                  <span className="muscle-contribution-value">
                    <b>{credits(contribution.set_credits)}</b>
                    <small>{contribution.set_credits === 1 ? 'set' : 'sets'}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muscle-sheet-note">
            {muscle.raw_sets > 0
              ? 'Refresh Home to load the contributing exercises.'
              : `No working sets for this muscle ${current ? 'this week' : 'that week'}.`}
          </p>
        )}
        {busy && (
          <p className="muscle-sheet-note" role="status">
            Opening workout…
          </p>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </PopupDialog>
  );
}
