import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { TrainingBlockDialog } from './TrainingBlockDialog';
import {
  blockSuggestion,
  blockSuggestionLabel,
  goalDirectionChangedOn,
} from './trainingBlockSuggestion';
import { blockOn, blockProgress } from './trainingBlocks';
import { useTrainingBlocks } from './trainingBlocksContext';
import type { BodyWeightGoal, PersonalRecord, TrackedWorkout } from './types';

const NO_GOALS: BodyWeightGoal[] = [];

/**
 * The weekly review's training block row: where the running block is up to, and an offer to start
 * one when there is a reason to today. It renders nothing when neither applies.
 */
export function WeeklyReviewBlock({
  workouts,
  records,
  today,
  weekStartDay = 1,
}: {
  workouts: TrackedWorkout[];
  records: PersonalRecord[];
  today: string;
  /** The first day of the account's week, in Date#getDay numbering. */
  weekStartDay?: number;
}) {
  const { config, loading, error } = useTrainingBlocks();
  const [goals, setGoals] = useState(NO_GOALS);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let current = true;
    api
      .listBodyWeightGoals()
      .then((loaded) => {
        if (current) setGoals(loaded);
      })
      // Without the goals the other reasons still apply.
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);

  const ready = !loading && !error;
  const block = ready ? blockOn(config.blocks, today) : null;
  const suggestion = useMemo(
    () =>
      ready
        ? blockSuggestion({
            workouts,
            records,
            blocks: config.blocks,
            today,
            goalChangedOn: goalDirectionChangedOn(goals),
            weekStartDay,
          })
        : null,
    [ready, workouts, records, config.blocks, today, goals, weekStartDay],
  );
  if (!block && !suggestion) return null;

  const progress = block ? blockProgress(block, today) : null;
  return (
    <div className="weekly-review-block">
      <h3>
        Training block
        {progress && (
          <span className="num">
            {progress.weeks === null || progress.week > progress.weeks
              ? `Week ${progress.week}`
              : `Week ${progress.week} of ${progress.weeks}`}
          </span>
        )}
      </h3>
      {block && <p className="weekly-review-block-name">{block.name}</p>}
      {suggestion && (
        <>
          <p className="pulse-empty-line">{blockSuggestionLabel(suggestion)}</p>
          <button
            type="button"
            className="pulse-button link small"
            aria-haspopup="dialog"
            onClick={() => setStarting(true)}
          >
            {block ? 'Start a new block' : 'Start a block'}
          </button>
        </>
      )}
      {starting && (
        // The row itself shows the new block once it starts, so no separate confirmation is shown.
        <TrainingBlockDialog start="new" onClose={() => setStarting(false)} onNotice={() => {}} />
      )}
    </div>
  );
}
