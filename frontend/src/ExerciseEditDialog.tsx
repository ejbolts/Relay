import { useId, useMemo, useState, type FormEvent } from 'react';
import { api } from './api';
import { equipmentChoices } from './exerciseEquipment';
import { PopupDialog } from './PopupDialog';
import type { Exercise } from './types';

const clean = (value: string) => value.trim().replace(/\s+/g, ' ');

/**
 * Edits a custom exercise's name and equipment; its workouts, records and photos follow.
 * Only the fields that changed are sent.
 */
export function ExerciseEditDialog({
  exercise,
  exercises,
  onSaved,
  onClose,
}: {
  exercise: Exercise;
  /** The catalogue, for suggesting equipment. */
  exercises: { equipment: string | null }[];
  onSaved: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(exercise.name);
  const [equipment, setEquipment] = useState(exercise.equipment ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = useId();
  const equipmentListId = useId();
  const choices = useMemo(() => equipmentChoices(exercises), [exercises]);
  const trimmedName = clean(name);
  const trimmedEquipment = clean(equipment);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !trimmedName) return;
    const changes: { name?: string; equipment?: string | null } = {};
    if (trimmedName !== exercise.name) changes.name = trimmedName;
    if (trimmedEquipment !== clean(exercise.equipment ?? '')) {
      changes.equipment = trimmedEquipment || null;
    }
    if (!Object.keys(changes).length) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.updateExercise(exercise.id, changes));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The exercise could not be saved.');
      setSaving(false);
    }
  }

  return (
    <PopupDialog
      title="Edit exercise"
      className="exercise-edit-dialog"
      busy={saving}
      onClose={onClose}
      actions={
        <>
          <button type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            className="popup-primary-action"
            disabled={saving || !trimmedName}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        <label>
          Name
          <input
            name="name"
            value={name}
            maxLength={160}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
        </label>
        <label>
          Equipment
          <input
            name="equipment"
            value={equipment}
            maxLength={100}
            autoComplete="off"
            list={equipmentListId}
            placeholder="None"
            onChange={(event) => {
              setEquipment(event.target.value);
              setError(null);
            }}
          />
          <datalist id={equipmentListId}>
            {choices.map((choice) => (
              <option key={choice} value={choice} />
            ))}
          </datalist>
        </label>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </PopupDialog>
  );
}
