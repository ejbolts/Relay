import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { CollapsibleSection } from './CollapsibleSection';
import { Icon } from './Icon';
import type { WorkoutType } from './types';
import { WorkoutTypeExercisesEditor } from './WorkoutTypeExercisesEditor';
import { useWorkoutTypes } from './workoutTypesContext';
import './WorkoutTypesSettings.css';

export type WorkoutTypesSettingsProps = {
  types: WorkoutType[];
  collapsible?: boolean;
  onTypesChange: (types: WorkoutType[]) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

export function WorkoutTypesSettings({
  types,
  collapsible = false,
  onTypesChange,
  loading = false,
  error = null,
  onRetry,
}: WorkoutTypesSettingsProps) {
  const fieldId = useId();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#a855f7');
  const [colorDrafts, setColorDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { savedExercises, applySavedExercises } = useWorkoutTypes();
  const editing = types.find((type) => type.id === editingId) ?? null;
  const busy = useRef(false);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const latestTypes = useRef(types);
  latestTypes.current = types;
  const disabled = loading || !!error || pending !== null;
  const activeTypes = types.filter((type) => !type.archived);
  const removedTypes = types.filter((type) => type.archived);

  async function save(action: string, task: () => Promise<void>) {
    if (busy.current || loading || error) return;
    busy.current = true;
    setPending(action);
    setSaveError(null);
    setNotice(null);
    try {
      await task();
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Could not save. Please try again.');
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  async function addType() {
    if (busy.current || loading || error) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 40) {
      setSaveError('Enter a workout type name of 1–40 characters.');
      return;
    }
    const duplicate = types.find((type) => type.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      setSaveError(
        duplicate.archived
          ? 'That workout type already exists in Removed types. Restore it below.'
          : 'That workout type already exists. Choose a different name.',
      );
      return;
    }
    await save('add', async () => {
      const created = await api.createWorkoutType({ name: trimmed, color });
      onTypesChange([...latestTypes.current, created]);
      setName('');
      setNotice(`${created.name} added.`);
    });
  }

  function replaceType(updated: WorkoutType) {
    onTypesChange(latestTypes.current.map((type) => (type.id === updated.id ? updated : type)));
  }

  function saveColor(type: WorkoutType) {
    const draft = colorDrafts[type.id];
    if (!draft || draft.toLowerCase() === type.color.toLowerCase()) return;
    void save(`color:${type.id}`, async () => {
      const updated = await api.updateWorkoutType(type.id, { color: draft });
      replaceType(updated);
      setColorDrafts((current) => {
        const next = { ...current };
        delete next[type.id];
        return next;
      });
      setNotice(`${updated.name} colour saved.`);
    });
  }

  function removeType(type: WorkoutType) {
    void save(`remove:${type.id}`, async () => {
      await api.deleteWorkoutType(type.id);
      replaceType({ ...type, archived: true });
      setNotice(`${type.name} removed. Saved workouts are unchanged.`);
    });
  }

  function restoreType(type: WorkoutType) {
    void save(`restore:${type.id}`, async () => {
      const updated = await api.updateWorkoutType(type.id, { archived: false });
      replaceType(updated);
      setNotice(`${updated.name} restored.`);
    });
  }

  const content = (
    <>
      <p>Add your own workout names and choose the colours shown in your calendar and history.</p>
      <p className="workout-types-help">
        Removing a type hides it from new workouts. Your saved workouts stay intact, and you can
        restore removed types below.
      </p>
      {loading && <p role="status">Loading workout types…</p>}
      {error && (
        <div className="workout-types-load-error">
          <p className="inline-error" role="alert">
            {error}
          </p>
          {onRetry && (
            <button type="button" onClick={onRetry} disabled={loading}>
              Try again
            </button>
          )}
        </div>
      )}
      {!loading && !error && activeTypes.length === 0 && (
        <p className="workout-types-help">
          No active workout types. Add one or restore a removed type.
        </p>
      )}
      <ul className="workout-types-list" aria-label="Active workout types">
        {activeTypes.map((type) => {
          const draft = colorDrafts[type.id] ?? type.color;
          const changed = draft.toLowerCase() !== type.color.toLowerCase();
          return (
            <li className="workout-types-row" key={type.id}>
              <label className="workout-types-color">
                <input
                  type="color"
                  aria-label={`${type.name} workout colour`}
                  value={draft}
                  disabled={disabled}
                  onChange={(event) => {
                    setColorDrafts((current) => ({ ...current, [type.id]: event.target.value }));
                    setSaveError(null);
                    setNotice(null);
                  }}
                />
                <span>
                  {type.name}
                  {type.is_custom && <small>Custom</small>}
                </span>
              </label>
              <div className="workout-types-row-actions">
                <button
                  type="button"
                  className="workout-types-exercises"
                  aria-label={`${type.name} exercises`}
                  disabled={disabled}
                  onClick={() => setEditingId(type.id)}
                >
                  Exercises
                  {!!savedExercises[type.id]?.length && (
                    <span className="workout-types-count">{savedExercises[type.id].length}</span>
                  )}
                </button>
                {changed && (
                  <button
                    type="button"
                    className="workout-types-save-color"
                    aria-label={`Save ${type.name} colour`}
                    disabled={disabled}
                    onClick={() => saveColor(type)}
                  >
                    {pending === `color:${type.id}` ? 'Saving…' : 'Save colour'}
                  </button>
                )}
                <button
                  type="button"
                  className="workout-types-remove"
                  aria-label={`Remove ${type.name} workout type`}
                  disabled={disabled}
                  onClick={() => removeType(type)}
                >
                  {pending === `remove:${type.id}` ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <form
        className="workout-types-add"
        onSubmit={(event) => {
          event.preventDefault();
          void addType();
        }}
      >
        <label className="workout-types-name-field" htmlFor={`${fieldId}-name`}>
          New workout type
          <input
            id={`${fieldId}-name`}
            type="text"
            value={name}
            maxLength={40}
            placeholder="For example, Arms or Legs"
            disabled={disabled}
            onChange={(event) => {
              setName(event.target.value);
              setSaveError(null);
              setNotice(null);
            }}
          />
        </label>
        <label className="workout-types-new-color" htmlFor={`${fieldId}-color`}>
          Colour
          <input
            id={`${fieldId}-color`}
            type="color"
            value={color}
            disabled={disabled}
            onChange={(event) => setColor(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="workout-types-add-button"
          disabled={disabled || !name.trim()}
        >
          {pending === 'add' ? 'Adding…' : 'Add type'}
        </button>
      </form>
      {saveError && (
        <p className="inline-error" role="alert">
          {saveError}
        </p>
      )}
      {notice && (
        <p className="training-preference-status" role="status">
          {notice}
        </p>
      )}
      {removedTypes.length > 0 && (
        <details className="workout-types-removed">
          <summary>
            Removed types <span>{removedTypes.length}</span>
          </summary>
          <ul className="workout-types-list" aria-label="Removed workout types">
            {removedTypes.map((type) => (
              <li className="workout-types-row" key={type.id}>
                <span className="workout-types-removed-name">
                  <i style={{ backgroundColor: type.color }} aria-hidden="true" />
                  {type.name}
                </span>
                <button
                  type="button"
                  aria-label={`Restore ${type.name} workout type`}
                  disabled={disabled}
                  onClick={() => restoreType(type)}
                >
                  {pending === `restore:${type.id}` ? 'Restoring…' : 'Restore'}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
  const overlays = (
    <>
      {editing && (
        <WorkoutTypeExercisesEditor
          type={editing}
          movements={savedExercises[editing.id] ?? []}
          onClose={() => setEditingId(null)}
          onSaved={(movements) => {
            applySavedExercises(editing.id, movements);
            setEditingId(null);
            setToast(`${editing.name} exercises saved`);
          }}
        />
      )}
      {toast &&
        createPortal(
          <div className="undo-toast top-toast" role="status" aria-atomic="true">
            <span>{toast}</span>
            <button
              type="button"
              className="undo-toast-close"
              aria-label="Dismiss workout type notification"
              onClick={() => setToast(null)}
            >
              <Icon name="close" />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
  if (collapsible) {
    return (
      <CollapsibleSection
        className="settings-panel panel workout-types-settings"
        title="Workout types"
        headingId="workout-types-title"
      >
        {content}
        {overlays}
      </CollapsibleSection>
    );
  }
  return (
    <section
      className="settings-panel panel workout-types-settings"
      aria-labelledby="workout-types-title"
    >
      <header>
        <div>
          <p className="section-kicker">TRAINING</p>
          <h2 id="workout-types-title">Workout types</h2>
        </div>
      </header>
      {content}
      {overlays}
    </section>
  );
}
