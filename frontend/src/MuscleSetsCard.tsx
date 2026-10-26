import { useId, useState, type CSSProperties } from 'react';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { shortDate } from './trainingSummary';
import type { WeeklyMuscleContribution, WeeklyMuscleSets, WeeklySets } from './types';
import './muscleSets.css';

const credits = (value: number) => Number(value.toFixed(3)).toLocaleString();

export function MuscleSetsCard({
  weeklySets,
  goal,
  onOpenWorkout,
}: {
  weeklySets: WeeklySets | null | undefined;
  goal: number;
  onOpenWorkout?: (contribution: WeeklyMuscleContribution) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const titleId = useId();
  const listId = useId();
  const allMuscles = [...(weeklySets?.muscle_groups ?? [])].sort(
    (left, right) =>
      right.raw_sets - left.raw_sets || left.muscle_group.localeCompare(right.muscle_group),
  );
  const muscles = allMuscles.filter((muscle) => muscle.raw_sets > 0);
  const visibleMuscles = expanded ? allMuscles : muscles.slice(0, 8);
  const untrained = (weeklySets?.muscle_groups ?? []).filter(
    (muscle) => muscle.raw_sets <= 0,
  ).length;
  const maximum = Math.max(...muscles.map((muscle) => muscle.raw_sets), goal * 1.15);
  const muscle = allMuscles.find((item) => item.muscle_group === selected);

  return (
    <section className="pulse-card muscle-sets-card" aria-labelledby={titleId}>
      <header className="pulse-card-header">
        <h2 id={titleId}>Sets per muscle</h2>
        <span>This week · working sets</span>
      </header>
      <p className="muscle-set-goal-key">
        <span aria-hidden="true" /> Weekly goal: {goal} sets per muscle
      </p>
      <ul
        id={listId}
        hidden={visibleMuscles.length === 0}
        className="muscle-bars"
        aria-label={`Working sets per muscle; weekly goal: ${goal} sets`}
        style={{ '--muscle-goal-ratio': goal / maximum } as CSSProperties}
      >
        {visibleMuscles.map((item, index) => (
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
            <span className="muscle-bar-track">
              <i
                style={
                  {
                    width: `${(item.raw_sets / maximum) * 100}%`,
                    '--d': `${index * 45}ms`,
                  } as CSSProperties
                }
              />
            </span>
            <b className="num">{credits(item.raw_sets)}</b>
          </li>
        ))}
      </ul>
      {!muscles.length && <p className="pulse-empty-line">No working sets logged yet this week.</p>}
      {muscles.length > 0 && untrained > 0 && (
        <p className="pulse-footnote">{untrained} muscles not trained yet</p>
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
          goal={goal}
          onClose={() => setSelected(null)}
          onOpenWorkout={onOpenWorkout}
        />
      )}
    </section>
  );
}

function MuscleContributionSheet({
  muscle,
  goal,
  onClose,
  onOpenWorkout,
}: {
  muscle: WeeklyMuscleSets;
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
      kicker="THIS WEEK"
      className="muscle-contribution-sheet"
      closeLabel="Done"
      swipeToDismiss
      onClose={onClose}
    >
      <div className="muscle-sheet-body">
        <p className="muscle-sheet-total">
          <strong>{credits(muscle.raw_sets)}</strong>
          <span>set credits this week</span>
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
              : 'No working sets for this muscle this week.'}
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
        <p className="muscle-sheet-note">
          Only completed working sets count. Assistance contributes partial credit. Tap an exercise
          to view its workout.
        </p>
      </div>
    </PopupDialog>
  );
}
