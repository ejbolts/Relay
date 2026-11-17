import { setKindOf, setNumberLabels, type SetKind } from './setFieldValues';
import { useWeightUnit } from './trainingPreferencesContext';
import type { MachinePhoto, PersonalRecord, TrackedSet } from './types';
import './sharedWorkout.css';
import { bodyweightContext } from './relativeStrength';

type FormatSet = (item: TrackedSet) => string;

const KIND_TAGS: Record<SetKind, string | null> = {
  normal: null,
  warmup: 'Warm-up',
  drop: 'Drop',
  failure: 'Attempted',
};

/** The effort colour the logger uses for this RPE. */
function rpeColour(rpe: number): string {
  if (rpe <= 6) return 'var(--rpe-low)';
  return `var(--rpe-${String(Math.min(rpe, 10)).replace('.', '-')})`;
}

/** One exercise's sets: warm-ups on one line, then numbered working sets with effort and records. */
export function SharedSetList({
  sets,
  personalRecords,
  machinePhotos = [],
  formatSet,
  describeRecord,
}: {
  sets: TrackedSet[];
  personalRecords: PersonalRecord[];
  machinePhotos?: MachinePhoto[];
  formatSet: FormatSet;
  /** Names a record for the badge's tooltip, such as “All-time Weight PR”. */
  describeRecord?: (record: PersonalRecord) => string;
}) {
  const weightUnit = useWeightUnit();
  const completed = sets.filter((item) => item.completed);
  const labels = setNumberLabels(completed);
  const rows = completed.map((item, index) => ({
    item,
    label: labels[index],
    kind: setKindOf(item),
  }));
  const warmups = rows.filter((row) => row.kind === 'warmup');
  const working = rows.filter((row) => row.kind !== 'warmup');
  const machineOf = (item: TrackedSet) =>
    machinePhotos.length > 1
      ? (machinePhotos.find((photo) => photo.id === item.machine_photo_id)?.caption ??
        'Machine not assigned')
      : null;

  return (
    <div className="shared-set-list">
      {warmups.length > 0 && (
        <p className="shared-set-warmups">
          <b>Warm-up</b>
          <span className="num">{warmups.map((row) => formatSet(row.item)).join(' · ')}</span>
        </p>
      )}
      {working.length > 0 && (
        <ol>
          {working.map(({ item, label, kind }) => {
            const earned = personalRecords.filter((record) => record.set_id === item.id);
            const allTime = earned.some((record) => record.scope !== 'block');
            const machine = machineOf(item);
            const tag = KIND_TAGS[kind];
            return (
              <li
                key={item.id}
                data-set-type={kind}
                className={earned.length ? 'is-record' : undefined}
              >
                <span className="shared-set-number" aria-label={`Set ${label}`}>
                  {label}
                </span>
                <span className="shared-set-result num">{formatSet(item)}</span>
                <span className="shared-set-notes">
                  {item.rpe !== null && (
                    <span className="num" style={{ color: rpeColour(item.rpe) }}>
                      RPE {item.rpe}
                    </span>
                  )}
                  {tag && <em>{tag}</em>}
                  {earned.length > 0 && (
                    <strong
                      className="pr-badge"
                      title={describeRecord ? earned.map(describeRecord).join(', ') : undefined}
                    >
                      {allTime ? 'PR' : 'Block PR'}
                    </strong>
                  )}
                </span>
                {item.bodyweight_kg != null && (
                  <small className="shared-set-detail num">
                    {bodyweightContext(item.weight_kg, item.bodyweight_kg, weightUnit)}
                  </small>
                )}
                {(machine || item.notes) && (
                  <small className="shared-set-detail">
                    {[machine, item.notes].filter(Boolean).join(' · ')}
                  </small>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {warmups
        .filter((row) => row.item.notes)
        .map((row) => (
          <small key={row.item.id} className="shared-set-detail">
            Warm-up: {row.item.notes}
          </small>
        ))}
    </div>
  );
}
