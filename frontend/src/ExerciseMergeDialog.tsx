import { useRef, useState } from 'react';
import { api } from './api';
import { PopupDialog } from './PopupDialog';
import { exerciseSearchAllowsTypos, exerciseSearchScore } from './exerciseSearch';
import { canMergeExercises, mergeChanges, mergeDistance } from './exerciseMergeCompatibility';
import type { Exercise } from './types';
import './exerciseMerge.css';

export function ExerciseMergeDialog({
  exercises,
  initialSourceId = '',
  onMerged,
  onChanged,
  onClose,
}: {
  exercises: Exercise[];
  initialSourceId?: string;
  onMerged: (sourceId: string, target: Exercise) => void;
  /** A custom exercise was changed to match its destination, before any merge. */
  onChanged?: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [targetId, setTargetId] = useState('');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Custom exercises changed here, until the caller's list catches up.
  const [changed, setChanged] = useState<Record<string, Exercise>>({});
  const busy = useRef(false);
  const all = exercises.map((item) => changed[item.id] ?? item);
  const source = all.find((item) => item.id === sourceId);
  const typos = exerciseSearchAllowsTypos(all, query);
  const candidates = source
    ? all
        .map((item) => ({ item, changes: mergeChanges(source, item) }))
        .filter(
          (entry): entry is typeof entry & { changes: NonNullable<typeof entry.changes> } =>
            entry.changes !== null && exerciseSearchScore(entry.item, query, typos) !== null,
        )
        .map((entry) => ({
          ...entry,
          ready: canMergeExercises(source, entry.item),
          distance: mergeDistance(source, entry.item),
          // Before a search, a duplicate usually shares its name: "DB Bench" and
          // "Dumbbell Bench Press".
          score: exerciseSearchScore(entry.item, query.trim() || source.name, typos),
        }))
        .sort(
          (a, b) =>
            Number(b.ready) - Number(a.ready) ||
            Number(b.score !== null) - Number(a.score !== null) ||
            (a.score ?? 0) - (b.score ?? 0) ||
            a.distance - b.distance ||
            a.item.name.localeCompare(b.item.name),
        )
    : [];
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
      onClose={() => {
        if (!busy.current) onClose();
      }}
    >
      <form
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
              {all
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
                  placeholder="Search exercises"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="exercise-merge-targets" role="group" aria-label="Merge destination">
                {candidates.map(({ item, ready }) => (
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
                      {!ready && <em className="exercise-merge-tag">Needs changes</em>}
                    </span>
                  </label>
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
          <div className="exercise-merge-actions">
            <button type="button" className="pulse-button secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="pulse-button primary" disabled={!source || !target}>
              {saving && target ? 'Merging…' : 'Merge exercises'}
            </button>
          </div>
        </fieldset>
      </form>
    </PopupDialog>
  );
}
