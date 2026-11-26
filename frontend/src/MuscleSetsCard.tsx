import { useId, useState, type CSSProperties, type FormEvent } from 'react';
import { Icon } from './Icon';
import {
  contributionDetail,
  MUSCLE_SET_GOAL_ERROR,
  MUSCLE_SET_GOAL_MAX,
  MUSCLE_SET_GOAL_MIN,
  muscleGoalSavedMessage,
  stepMuscleSetGoal,
  validMuscleSetGoal,
} from './muscleGoalEditing';
import { muscleSetGoal, type MuscleSetGoals } from './muscleSetGoals';
import {
  muscleSetsView,
  muscleWeekName,
  setChangeLabel,
  setChangeTone,
  setCredits as credits,
  signedSetChange,
} from './muscleSetRows';
import { PopupDialog } from './PopupDialog';
import { useToast } from './Toast';
import { shortDate } from './trainingSummary';
import type { WeeklyMuscleContribution } from './types';
import type { MuscleSetsWeek } from './liveMuscleSets';
import './muscleSets.css';

export function MuscleSetsCard({
  weeklySets,
  history = [],
  goal,
  goals,
  onOpenWorkout,
  onChangeGoal,
}: {
  weeklySets: MuscleSetsWeek | null | undefined;
  /** The weeks before `weeklySets`, newest first. Older cached dashboards have none. */
  history?: MuscleSetsWeek[];
  goal: number;
  goals?: MuscleSetGoals;
  onOpenWorkout?: (contribution: WeeklyMuscleContribution) => void | Promise<void>;
  /** Saves one muscle's weekly goal; `null` returns it to the default. Omit to hide editing. */
  onChangeGoal?: (muscle: string, goal: number | null) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [requestedWeeksAgo, setWeeksAgo] = useState(0);
  const titleId = useId();
  const listId = useId();
  const {
    weeks,
    weeksAgo,
    week,
    previous,
    current,
    name,
    allMuscles,
    trainedCount,
    rows: visibleMuscles,
    untrained,
    scale,
    canExpand,
  } = muscleSetsView({ weeklySets, history, weeksAgo: requestedWeeksAgo, goal, goals, expanded });
  const muscle = allMuscles.find((item) => item.muscle_group === selected);

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
            {muscleWeekName(weeksAgo + 1)}
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
          const { previous: last, change, target } = item;
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
                <span className="muscle-set-count">
                  {credits(item.raw_sets)}
                  <small className="muscle-row-target"> / {target}</small>
                </span>
                {change !== null && (
                  <small
                    className={`muscle-set-change is-${setChangeTone(change, current)}`}
                    aria-label={setChangeLabel(change, current)}
                  >
                    {signedSetChange(change)}
                  </small>
                )}
              </b>
            </li>
          );
        })}
      </ul>
      {!trainedCount && (
        <p className="pulse-empty-line">
          {current ? 'No working sets logged yet this week.' : 'No working sets logged that week.'}
        </p>
      )}
      {trainedCount > 0 && untrained > 0 && (
        <p className="pulse-footnote">
          {untrained} muscles not trained{current ? ' yet' : ''}
        </p>
      )}
      {canExpand && (
        <button
          type="button"
          className="pulse-button link small muscle-sets-expand"
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
          defaultGoal={goal}
          customGoal={goals?.[muscle.muscle_group] !== undefined}
          onClose={() => setSelected(null)}
          onOpenWorkout={onOpenWorkout}
          onChangeGoal={onChangeGoal && ((value) => onChangeGoal(muscle.muscle_group, value))}
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
  defaultGoal,
  customGoal,
  onClose,
  onOpenWorkout,
  onChangeGoal,
}: {
  muscle: MuscleSetsWeek['muscle_groups'][number];
  current: boolean;
  weekLabel: string;
  goal: number;
  defaultGoal: number;
  customGoal: boolean;
  onClose: () => void;
  onOpenWorkout?: (contribution: WeeklyMuscleContribution) => void | Promise<void>;
  onChangeGoal?: (goal: number | null) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const goalFormId = useId();
  const toast = useToast();
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

  function startEditing() {
    setDraft(String(goal));
    setGoalError(null);
    setEditing(true);
  }

  function step(by: number) {
    setDraft(stepMuscleSetGoal(draft, goal, by));
    setGoalError(null);
  }

  async function saveGoal(value: number | null) {
    if (!onChangeGoal || savingGoal) return;
    if (value !== null && !validMuscleSetGoal(value)) {
      setGoalError(MUSCLE_SET_GOAL_ERROR);
      return;
    }
    setSavingGoal(true);
    setGoalError(null);
    try {
      await onChangeGoal(value);
      setEditing(false);
      toast.show(muscleGoalSavedMessage(muscle.muscle_group, value));
    } catch (reason) {
      setGoalError(
        reason instanceof Error ? reason.message : 'Could not save the goal. Try again.',
      );
    } finally {
      setSavingGoal(false);
    }
  }

  function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveGoal(draft.trim() === '' ? Number.NaN : Number(draft));
  }

  return (
    <PopupDialog
      variant="sheet"
      title={muscle.muscle_group}
      kicker={weekLabel.toUpperCase()}
      className="muscle-contribution-sheet"
      onClose={onClose}
      actions={
        editing && (
          <>
            {customGoal && (
              <button
                type="button"
                className="popup-tertiary-action"
                disabled={savingGoal}
                onClick={() => void saveGoal(null)}
              >
                Use default ({defaultGoal})
              </button>
            )}
            <button
              type="button"
              disabled={savingGoal}
              onClick={() => {
                setEditing(false);
                setGoalError(null);
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form={goalFormId}
              className="popup-primary-action"
              disabled={savingGoal}
            >
              {savingGoal ? 'Saving…' : 'Save'}
            </button>
          </>
        )
      }
    >
      <div className="muscle-sheet-body">
        <div className="muscle-sheet-total">
          <strong>{credits(muscle.raw_sets)}</strong>
          <span>set credits {current ? 'this week' : 'that week'}</span>
          {onChangeGoal && !editing && (
            <button
              type="button"
              className="pulse-button link small muscle-goal-edit-button"
              aria-label={`Edit goal for ${muscle.muscle_group}`}
              onClick={startEditing}
            >
              <Icon name="edit" />
              Edit goal
            </button>
          )}
        </div>
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
        {editing ? (
          <form id={goalFormId} className="muscle-goal-form" noValidate onSubmit={submitGoal}>
            <div className="muscle-goal-field">
              <span>Weekly goal</span>
              <span className="muscle-goal-stepper">
                <button
                  type="button"
                  aria-label="One set fewer"
                  disabled={savingGoal || Number(draft) <= MUSCLE_SET_GOAL_MIN}
                  onClick={() => step(-1)}
                >
                  <Icon name="minus" />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="1000"
                  step="1"
                  aria-label={`${muscle.muscle_group} weekly set goal`}
                  aria-invalid={goalError ? true : undefined}
                  value={draft}
                  disabled={savingGoal}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setGoalError(null);
                  }}
                />
                <button
                  type="button"
                  aria-label="One set more"
                  disabled={savingGoal || Number(draft) >= MUSCLE_SET_GOAL_MAX}
                  onClick={() => step(1)}
                >
                  <Icon name="plus" />
                </button>
              </span>
              <span>sets</span>
            </div>
            {goalError && (
              <p className="inline-error" role="alert">
                {goalError}
              </p>
            )}
          </form>
        ) : (
          <p className="muscle-sheet-goal-label">
            <span>
              {credits(muscle.raw_sets)} of {goal} sets
            </span>
            <span>{percentage}% of goal</span>
          </p>
        )}
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
                    <small>{contributionDetail(contribution)}</small>
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
