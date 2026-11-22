import { useId, useState } from 'react';
import { PopupDialog } from './PopupDialog';
import type { WorkoutDraftMovement } from './workoutMovements';
import { supersetGroupName } from './workoutSupersets';
import './supersetPicker.css';

/** Groups a live exercise with others in the workout, or edits or removes its group. */
export function SupersetPicker({
  movementKey,
  movements,
  onClose,
  onSave,
  onRemove,
}: {
  movementKey: string;
  movements: WorkoutDraftMovement[];
  onClose: () => void;
  onSave: (partnerKeys: string[]) => void;
  onRemove: () => void;
}) {
  const movement = movements.find((item) => item.key === movementKey);
  const candidates = movements.filter((item) => item.key !== movementKey);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() =>
    movement?.supersetKey
      ? candidates
          .filter((item) => item.supersetKey === movement.supersetKey)
          .map((item) => item.key)
      : [],
  );
  const descriptionId = useId();

  if (!movement) return null;

  const selected = new Set(selectedKeys);
  const toggleSelection = (key: string) => {
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  return (
    <PopupDialog
      variant="sheet"
      title={movement.supersetKey ? 'Edit superset' : 'Group as superset'}
      className="superset-picker"
      describedBy={descriptionId}
      onClose={onClose}
      actions={
        <>
          {movement.supersetKey && (
            <button
              className="popup-tertiary-action is-danger remove-superset-button"
              type="button"
              onClick={onRemove}
            >
              Remove superset
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="popup-primary-action save-superset-button"
            type="button"
            disabled={selectedKeys.length === 0}
            onClick={() => onSave(selectedKeys)}
          >
            {movement.supersetKey ? 'Update' : 'Add'}{' '}
            {selectedKeys.length
              ? supersetGroupName(selectedKeys.length + 1).toLowerCase()
              : 'superset'}
          </button>
        </>
      }
    >
      <p id={descriptionId} className="superset-picker-description">
        Alternate {movement.exercise.name} with the exercises you choose.
      </p>

      <div className="superset-options" aria-label="Exercises in this workout">
        {candidates.length === 0 ? (
          <div className="superset-empty">
            <strong>No other exercises yet</strong>
            <span>Add another exercise to this workout, then come back to group it.</span>
          </div>
        ) : (
          candidates.map((candidate) => {
            const belongsToAnotherGroup = Boolean(
              candidate.supersetKey && candidate.supersetKey !== movement.supersetKey,
            );
            const isSelected = selected.has(candidate.key);
            return (
              <label
                className={`superset-option ${isSelected ? 'selected' : ''} ${
                  belongsToAnotherGroup ? 'unavailable' : ''
                }`}
                key={candidate.key}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={belongsToAnotherGroup}
                  onChange={() => toggleSelection(candidate.key)}
                />
                <span className="superset-option-copy">
                  <strong>{candidate.exercise.name}</strong>
                </span>
                {belongsToAnotherGroup && (
                  <small className="superset-option-status">Already grouped</small>
                )}
              </label>
            );
          })
        )}
      </div>
    </PopupDialog>
  );
}
