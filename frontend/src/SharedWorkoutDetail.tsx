import { isAllTimeRecord, recordBadgeLabel } from './recordScope';
import { setKindOf, setNumberLabels, type SetKind } from './setFieldValues';
import { useWeightUnit } from './trainingPreferencesContext';
import type { MachinePhoto, PersonalRecord, TrackedSet } from './types';
import './sharedWorkout.css';
import { bodyweightContext } from './relativeStrength';

type FormatSet = (item: TrackedSet) => string;

/** Spoken in place of the W, D or A in the set-number circle. */
const KIND_NAMES: Record<SetKind, string> = {
  normal: 'Working set',
  warmup: 'Warm-up',
  drop: 'Drop set',
  failure: 'Attempted',
};

/** The effort colour the logger uses for this RPE. */
function rpeColour(rpe: number): string {
  if (rpe <= 6) return 'var(--rpe-low)';
  return `var(--rpe-${String(Math.min(rpe, 10)).replace('.', '-')})`;
}

/** One exercise's sets in order. The set-number circle carries the type: W, D or A. */
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
  const machineOf = (item: TrackedSet) =>
    machinePhotos.length > 1
      ? (machinePhotos.find((photo) => photo.id === item.machine_photo_id)?.caption ??
        'Machine not assigned')
      : null;

  if (!completed.length) return null;
  return (
    <div className="shared-set-list">
      <ol>
        {completed.map((item, index) => {
          const kind = setKindOf(item);
          const label = labels[index];
          const earned = personalRecords.filter((record) => record.set_id === item.id);
          const allTime = earned.some(isAllTimeRecord);
          const machine = machineOf(item);
          return (
            <li
              key={item.id}
              data-set-type={kind}
              className={earned.length ? 'is-record' : undefined}
            >
              <span
                className="shared-set-number"
                aria-label={kind === 'normal' ? `Set ${label}` : KIND_NAMES[kind]}
              >
                {label}
              </span>
              <span className="shared-set-result num">{formatSet(item)}</span>
              <span className="shared-set-notes">
                {item.rpe !== null && (
                  <span className="num" style={{ color: rpeColour(item.rpe) }}>
                    RPE {item.rpe}
                  </span>
                )}
                {earned.length > 0 && (
                  <strong
                    className="pr-badge"
                    title={describeRecord ? earned.map(describeRecord).join(', ') : undefined}
                  >
                    {allTime ? 'PR' : recordBadgeLabel(earned)}
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
    </div>
  );
}
