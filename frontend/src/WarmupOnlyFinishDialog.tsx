import { PopupDialog } from './PopupDialog';
import { formatWeight, type WeightUnit } from './weightUnits';
import './warmupOnlyFinishDialog.css';

type LoggedWarmup = {
  key: string;
  completed: boolean;
  weight_kg: number | null;
  reps: number | null;
};
export type WarmupOnlyMovement = {
  key: string;
  name: string;
  iconUrl: string;
  sets: LoggedWarmup[];
};

function setLabel(item: LoggedWarmup, unit: WeightUnit, position: number) {
  const weight = item.weight_kg !== null ? formatWeight(item.weight_kg, unit) : null;
  if (weight && item.reps !== null) return `${weight} × ${item.reps}`;
  if (item.reps !== null) return `${item.reps} reps`;
  return weight ?? `Set ${position}`;
}

/** Reminds the user, before finishing, which exercises were logged with only warm-up sets. */
export function WarmupOnlyFinishDialog({
  movements,
  weightUnit,
  saving,
  onKeepWorkingOut,
  onFinishAnyway,
}: {
  movements: WarmupOnlyMovement[];
  weightUnit: WeightUnit;
  saving: boolean;
  onKeepWorkingOut: () => void;
  onFinishAnyway: () => void;
}) {
  return (
    <PopupDialog
      title="No working sets"
      kicker="BEFORE YOU FINISH"
      className="warmup-only-finish-dialog"
      onClose={onKeepWorkingOut}
    >
      <div className="warmup-only-movements">
        {movements.map((movement) => (
          <section key={movement.key} aria-label={movement.name}>
            <h3>
              <img src={movement.iconUrl} alt="" />
              {movement.name}
            </h3>
            <ul className="warmup-only-sets">
              {movement.sets
                .filter((item) => item.completed)
                .map((item, index) => (
                  <li key={item.key} className="warmup-only-set">
                    <b className="warmup-only-badge" aria-hidden="true">
                      W
                    </b>
                    <span className="sr-only">Warm-up: </span>
                    {setLabel(item, weightUnit, index + 1)}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="popup-dialog-actions warmup-only-actions">
        <button type="button" autoFocus onClick={onKeepWorkingOut}>
          Keep working out
        </button>
        <button
          type="button"
          className="popup-primary-action"
          disabled={saving}
          onClick={onFinishAnyway}
        >
          Finish anyway
        </button>
      </div>
    </PopupDialog>
  );
}
