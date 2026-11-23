import { useRef, useState } from 'react';
import { api } from './api';
import { PopupDialog } from './PopupDialog';
import { canMergeExercises } from './exerciseMergeCompatibility';
import {
  matchedNameParts,
  mergeSources,
  mergeTargetDetail,
  mergeTargets,
} from './exerciseMergeTargets';
import type { Exercise } from './types';
import './exerciseMerge.css';

export function ExerciseMergeDialog({
  exercises,
  initialSourceId = '',
  initialTargetId = '',
  onMerged,
  onChanged,
  onClose,
}: {
  exercises: Exercise[];
  initialSourceId?: string;
  /** A destination to start with, such as the suggestion the merge was opened from. */
  initialTargetId?: string;
  onMerged: (sourceId: string, target: Exercise) => void;
  /** A custom exercise was changed to match its destination, before any merge. */
  onChanged?: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [targetId, setTargetId] = useState(initialTargetId);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Custom exercises changed here, until the caller's list catches up.
  const [changed, setChanged] = useState<Record<string, Exercise>>({});
  const busy = useRef(false);
  const all = exercises.map((item) => changed[item.id] ?? item);
  const source = all.find((item) => item.id === sourceId);
  const { candidates, suggested, listed } = mergeTargets(all, source, query);
  const chosen = candidates.find((entry) => entry.item.id === targetId);
  const target = chosen?.ready ? chosen.item : undefined;
  const needed = chosen && !chosen.ready ? chosen.changes : null;

  async function run(action: () => Promise<void>, failure: string) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : failure);
      busy.current = false;
      setSaving(false);
    }
  }

  function merge() {
    if (!source || !target || !canMergeExercises(source, target)) return;
    void run(async () => {
      const result = await api.mergeExercise(source.id, target.id);
      onMerged(source.id, result);
    }, 'Could not merge the exercises.');
  }

  function applyChanges() {
    if (!source || !needed) return;
    void run(async () => {
      const result = await api.updateExercise(source.id, needed.update);
      setChanged((current) => ({ ...current, [result.id]: result }));
      onChanged?.(result);
      busy.current = false;
      setSaving(false);
    }, `Could not change ${source.name}.`);
  }

  return (
    <PopupDialog
      title="Merge exercises"
      className="exercise-merge-dialog"
      busy={saving}
      onClose={() => {
        if (!busy.current) onClose();
      }}
      actions={
        <>
          <button type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="exercise-merge-form"
            className="popup-primary-action is-danger"
            disabled={saving || !source || !target}
          >
            {saving && target ? 'Merging…' : 'Merge exercises'}
          </button>
        </>
      }
    >
      <form
        id="exercise-merge-form"
        onSubmit={(event) => {
          event.preventDefault();
          merge();
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
              {mergeSources(all).map((item) => (
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
                  placeholder="Search exercises"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="exercise-merge-targets" role="group" aria-label="Merge destination">
                {suggested.length > 0 && (
                  <>
                    <h3 className="exercise-merge-group">Suggested</h3>
                    {suggested.map(({ exercise, ready, matchedWords }) => (
                      <MergeTarget
                        key={exercise.id}
                        exercise={exercise}
                        ready={ready}
                        matchedWords={matchedWords}
                        selected={targetId === exercise.id}
                        onSelect={() => {
                          setTargetId(exercise.id);
                          setError('');
                        }}
                      />
                    ))}
                    {listed.length > 0 && <h3 className="exercise-merge-group">All exercises</h3>}
                  </>
                )}
                {listed.map(({ item, ready }) => (
                  <MergeTarget
                    key={item.id}
                    exercise={item}
                    ready={ready}
                    selected={targetId === item.id}
                    onSelect={() => {
                      setTargetId(item.id);
                      setError('');
                    }}
                  />
                ))}
                {!candidates.length && (
                  <p role="status">
                    {query.trim()
                      ? 'No exercises match your search.'
                      : 'No other exercises of this kind.'}
                  </p>
                )}
              </div>
            </>
          )}
          {source && chosen && needed && (
            <section className="exercise-merge-changes" aria-label="Changes needed to merge">
              <h3>
                {source.name} must match {chosen.item.name}
              </h3>
              <dl>
                {needed.equipment && (
                  <div>
                    <dt>Equipment</dt>
                    <dd>
                      <s>{needed.equipment.from}</s>
                      <span>{needed.equipment.to}</span>
                    </dd>
                  </div>
                )}
                {needed.muscles && (
                  <div>
                    <dt>Muscles</dt>
                    <dd>
                      <s>{needed.muscles.from.join(', ')}</s>
                      <span>{needed.muscles.to.join(', ')}</span>
                    </dd>
                  </div>
                )}
              </dl>
              <p>Its past sets will count towards the new muscles.</p>
              <button type="button" className="pulse-button primary" onClick={applyChanges}>
                {saving ? 'Changing…' : `Change ${source.name}`}
              </button>
            </section>
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
        </fieldset>
      </form>
    </PopupDialog>
  );
}

function MergeTarget({
  exercise,
  ready,
  matchedWords,
  selected,
  onSelect,
}: {
  exercise: Exercise;
  ready: boolean;
  /** Words of the name to highlight, for a suggested exercise. */
  matchedWords?: string[];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label className={selected ? 'selected' : ''}>
      <input type="radio" name="merge-target" checked={selected} onChange={onSelect} />
      <span>
        <strong>
          {matchedNameParts(exercise.name, matchedWords).map((part, index) =>
            part.matched ? (
              <b className="exercise-search-match" key={index}>
                {part.text}
              </b>
            ) : (
              part.text
            ),
          )}
        </strong>
        <small>{mergeTargetDetail(exercise)}</small>
        {!ready && <em className="exercise-merge-tag">Needs changes</em>}
      </span>
    </label>
  );
}
