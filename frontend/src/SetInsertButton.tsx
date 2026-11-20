import { Icon } from './Icon';
import { RestTimeSelect } from './RestTimeSelect';
import './setInsertButton.css';

/** Adds a set at this point in the list: before the first set, or between two sets. */
export function SetInsertButton({
  beforeSet,
  onInsert,
}: {
  /** Number of the set the new set goes before (1 for the start of the list). */
  beforeSet: number;
  onInsert: () => void;
}) {
  return (
    <button
      type="button"
      className="set-insert-button"
      aria-label={beforeSet === 1 ? 'Add set at start' : `Add set before set ${beforeSet}`}
      title={beforeSet === 1 ? 'Add set at start' : `Add set before set ${beforeSet}`}
      onClick={onInsert}
    >
      {/* Drawn in CSS: a text "+" sits off-centre in the circle. */}
      <span className="set-insert-dot" aria-hidden="true" />
    </button>
  );
}

/**
 * An insert point on its own line, used where no rest divider sits between the sets. Between two
 * sets it can also offer to add the rest after the set above, picked from a menu of rest times.
 */
export function SetInsertRow({
  beforeSet,
  onInsert,
  onAddRest,
  suggestedRest,
}: {
  beforeSet: number;
  onInsert: () => void;
  onAddRest?: (seconds: number) => void;
  /** Where the menu's Custom time starts, usually the nearest rest in the exercise. */
  suggestedRest?: number;
}) {
  return (
    <div className="set-insert-row">
      <SetInsertButton beforeSet={beforeSet} onInsert={onInsert} />
      <i aria-hidden="true" />
      {onAddRest && (
        <>
          {/* The pill is drawn under a transparent select, so a tap opens the system's menu. */}
          <label className="set-add-rest">
            <span aria-hidden="true">
              <Icon name="bell" />
              Rest
            </span>
            <RestTimeSelect
              seconds={null}
              label={`Add rest after set ${beforeSet - 1}`}
              placeholder="Rest"
              customStart={suggestedRest}
              onChange={onAddRest}
            />
          </label>
          <i aria-hidden="true" />
        </>
      )}
    </div>
  );
}
