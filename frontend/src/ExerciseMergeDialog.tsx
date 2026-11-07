import { useRef, useState } from 'react';
import { api } from './api';
import { PopupDialog } from './PopupDialog';
import { exerciseSearchScore } from './exerciseSearch';
import { canMergeExercises } from './exerciseMergeCompatibility';
import type { Exercise } from './types';
import './exerciseMerge.css';

export function ExerciseMergeDialog({
  exercises,
  initialSourceId = '',
  onMerged,
  onClose,
}: {
  exercises: Exercise[];
  initialSourceId?: string;
  onMerged: (sourceId: string, target: Exercise) => void;
  onClose: () => void;
}) {
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [targetId, setTargetId] = useState('');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const source = exercises.find((item) => item.id === sourceId);
  const target = exercises.find(
    (item) => item.id === targetId && source && canMergeExercises(source, item),
  );
  const targets = exercises
    .filter(
      (item) =>
        source && canMergeExercises(source, item) && exerciseSearchScore(item, query) !== null,
    )
    .sort(
      (a, b) =>
        (exerciseSearchScore(a, query) ?? 0) - (exerciseSearchScore(b, query) ?? 0) ||
        a.name.localeCompare(b.name),
    );

  async function merge() {
    if (!source || !target || !canMergeExercises(source, target) || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await api.mergeExercise(source.id, target.id);
      onMerged(source.id, result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not merge the exercises.');
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <PopupDialog
      title="Merge exercises"
      className="exercise-merge-dialog"
      onClose={() => {
        if (!busy.current) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void merge();
        }}
      >
        <fieldset disabled={saving}>
          <label className="exercise-merge-field">
            Custom exercise to merge
            <select
              autoFocus
              value={sourceId}
              onChange={(event) => {
                setSourceId(event.target.value);
                setTargetId('');
                setQuery('');
                setError('');
              }}
              required
            >
              <option value="">Choose a custom exercise</option>
              {exercises
                .filter((item) => item.is_custom)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
          {source && (
            <>
              <label className="exercise-merge-field">
                Merge into
                <input
                  type="search"
                  aria-label="Search merge destination"
                  placeholder="Search matching exercises"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="exercise-merge-targets" role="group" aria-label="Merge destination">
                {targets.map((item) => (
                  <label key={item.id} className={targetId === item.id ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="merge-target"
                      checked={targetId === item.id}
                      onChange={() => {
                        setTargetId(item.id);
                        setError('');
                      }}
                    />
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {[item.is_custom ? 'Custom' : 'Official', item.muscle_group, item.equipment]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </span>
                  </label>
                ))}
                {!targets.length && (
                  <p role="status">No exercises match these muscle groups and equipment.</p>
                )}
              </div>
            </>
          )}
          {source && target && (
            <section className="exercise-merge-review" aria-label="Merge review">
              <div>
                <span>Remove</span>
                <strong>{source.name}</strong>
              </div>
              <div>
                <span>Keep</span>
                <strong>{target.name}</strong>
              </div>
              <ul>
                <li>Combine workout history, records, machine photos and saved splits.</li>
                <li>
                  Keep {target.name}’s muscle credits, defaults and machine-weight conversions.
                </li>
              </ul>
              <p>This merge cannot be undone.</p>
            </section>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          <div className="exercise-merge-actions">
            <button type="button" className="pulse-button secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="pulse-button primary" disabled={!source || !target}>
              {saving ? 'Merging…' : 'Merge exercises'}
            </button>
          </div>
        </fieldset>
      </form>
    </PopupDialog>
  );
}
