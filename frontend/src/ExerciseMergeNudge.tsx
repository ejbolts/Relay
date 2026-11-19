import { useMemo, useState } from 'react';
import { STRONG_MATCH, mergeSuggestions } from './exerciseMergeSuggestions';
import type { Exercise } from './types';
import './exerciseMerge.css';

const DISMISSED_KEY = 'gym-logger-dismissed-merge-suggestions';

/** Suggestions marked "Not the same" on this device: custom exercise ID to standard exercise ID. */
function loadDismissed(): Record<string, string> {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved)
      ? Object.fromEntries(
          Object.entries(saved).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {};
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
  const [suggestion] = useMemo(
    () => mergeSuggestions(exercise, exercises, { limit: 1, minimum: STRONG_MATCH }),
    [exercise, exercises],
  );
  if (!suggestion || dismissed[exercise.id] === suggestion.exercise.id) return null;
  const target = suggestion.exercise;

  return (
    <section className="exercise-merge-nudge" aria-label="Possible duplicate">
      <div className="exercise-merge-nudge-copy">
        <strong>Looks like {target.name}</strong>
        <small>
          {['Official', target.muscle_group, target.equipment].filter(Boolean).join(' · ')}
        </small>
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
