import { useMemo, useState } from 'react';
import {
  DISMISSED_MERGE_SUGGESTIONS_KEY as DISMISSED_KEY,
  mergeNudgeTarget,
  mergeTargetDetail,
  parseDismissedMergeSuggestions,
} from './exerciseMergeTargets';
import type { Exercise } from './types';
import './exerciseMerge.css';

/** Suggestions marked "Not the same" on this device: custom exercise ID to standard exercise ID. */
function loadDismissed(): Record<string, string> {
  try {
    return parseDismissedMergeSuggestions(
      JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? '{}'),
    );
  } catch {
    return {};
  }
}

function saveDismissed(dismissed: Record<string, string>) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
  } catch {
    // Without storage the suggestion stays hidden until the page is reloaded.
  }
}

/**
 * Points out the standard exercise a custom exercise most likely duplicates, such as Lateral
 * Raise for "Lateral raises", with a shortcut into the merge.
 */
export function ExerciseMergeNudge({
  exercise,
  exercises,
  onMerge,
}: {
  exercise: Exercise;
  exercises: Exercise[];
  onMerge: (targetId: string, trigger: HTMLButtonElement) => void;
}) {
  const [dismissed, setDismissed] = useState(loadDismissed);
  const target = useMemo(
    () => mergeNudgeTarget(exercise, exercises, dismissed),
    [exercise, exercises, dismissed],
  );
  if (!target) return null;

  return (
    <section className="exercise-merge-nudge" aria-label="Possible duplicate">
      <div className="exercise-merge-nudge-copy">
        <strong>Looks like {target.name}</strong>
        <small>{mergeTargetDetail(target)}</small>
      </div>
      <div className="exercise-merge-nudge-actions">
        <button
          type="button"
          className="pulse-button secondary"
          onClick={() => {
            const next = { ...loadDismissed(), [exercise.id]: target.id };
            saveDismissed(next);
            setDismissed(next);
          }}
        >
          Not the same
        </button>
        <button
          type="button"
          className="pulse-button primary"
          onClick={(event) => onMerge(target.id, event.currentTarget)}
        >
          Merge
        </button>
      </div>
    </section>
  );
}
