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
      <span className="set-insert-dot" aria-hidden="true">
        +
      </span>
    </button>
  );
}

/** An insert point on its own line, used where no rest divider sits between the sets. */
export function SetInsertRow(props: { beforeSet: number; onInsert: () => void }) {
  return (
    <div className="set-insert-row">
      <SetInsertButton {...props} />
      <i aria-hidden="true" />
    </div>
  );
}
