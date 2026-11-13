import { useState } from 'react';
import { PopupDialog } from './PopupDialog';
import { type SetKindFields } from './setFieldValues';
import { formatWeight, type WeightUnit } from './weightUnits';
import { suggestedWorkingSetIndexes } from './workingSetCheck';
import './warmupOnlyFinishDialog.css';

type ReviewSet = SetKindFields & {
  key: string;
  completed: boolean;
  weight_kg: number | null;
  reps: number | null;
};
export type WarmupOnlyMovement = { key: string; name: string; sets: ReviewSet[] };
/** Set keys to make working sets, by movement key. */
export type WorkingSetChanges = Map<string, Set<string>>;

const selectionKey = (movementKey: string, setKey: string) => `${movementKey}\u0000${setKey}`;

function setLabel(item: ReviewSet, unit: WeightUnit, position: number) {
  const weight = item.weight_kg !== null ? formatWeight(item.weight_kg, unit) : null;
  if (weight && item.reps !== null) return `${weight} × ${item.reps}`;
  if (item.reps !== null) return `${item.reps} reps`;
  return weight ?? `Set ${position}`;
}

export function WarmupOnlyFinishDialog({
  movements,
  weightUnit,
  saving,
  onKeepWorkingOut,
  onFinishAnyway,
  onUpdateAndFinish,
}: {
  movements: WarmupOnlyMovement[];
  weightUnit: WeightUnit;
  saving: boolean;
  onKeepWorkingOut: () => void;
  onFinishAnyway: () => void;
  onUpdateAndFinish: (changes: WorkingSetChanges) => void;
}) {
  const [selected, setSelected] = useState(
    () =>
      new Set(
        movements.flatMap((movement) => {
          const logged = movement.sets.filter((item) => item.completed);
          return suggestedWorkingSetIndexes(logged).map((index) =>
            selectionKey(movement.key, logged[index].key),
          );
        }),
      ),
  );
  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const finish = () => {
    const changes: WorkingSetChanges = new Map();
    for (const movement of movements) {
      const keys = new Set(
        movement.sets
          .filter((item) => selected.has(selectionKey(movement.key, item.key)))
          .map((item) => item.key),
      );
      if (keys.size) changes.set(movement.key, keys);
    }
    onUpdateAndFinish(changes);
  };

  return (
    <PopupDialog
      title={
        movements.length === 1
          ? `No working sets in ${movements[0].name}`
          : `No working sets in ${movements.length} exercises`
      }
      kicker="BEFORE YOU FINISH"
      className="warmup-only-finish-dialog"
      onClose={onKeepWorkingOut}
    >
      <div className="warmup-only-movements">
        {movements.map((movement) => {
          let working = 0;
          return (
            <section key={movement.key} aria-label={movement.name}>
              {movements.length > 1 && <h3>{movement.name}</h3>}
              <div className="warmup-only-sets">
                {movement.sets
                  .filter((item) => item.completed)
                  .map((item, index) => {
                    const key = selectionKey(movement.key, item.key);
                    const isWorking = selected.has(key);
                    const label = setLabel(item, weightUnit, index + 1);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className="warmup-only-set"
                        aria-pressed={isWorking}
                        aria-label={`${label}: ${isWorking ? 'working set' : 'warm-up'}`}
                        onClick={() => toggle(key)}
                      >
                        <b
                          className="warmup-only-badge"
                          data-kind={isWorking ? 'normal' : 'warmup'}
                          aria-hidden="true"
                        >
                          {isWorking ? ++working : 'W'}
                        </b>
                        {label}
                      </button>
                    );
                  })}
              </div>
            </section>
          );
        })}
      </div>
      <div className="popup-dialog-actions warmup-only-actions">
        <button type="button" disabled={saving} onClick={onFinishAnyway}>
          Finish anyway
        </button>
        <button
          type="button"
          className="popup-primary-action"
          autoFocus
          disabled={saving || selected.size === 0}
          onClick={finish}
        >
          {`Make ${selected.size} ${selected.size === 1 ? 'set' : 'sets'} working & finish`}
        </button>
      </div>
    </PopupDialog>
  );
}
