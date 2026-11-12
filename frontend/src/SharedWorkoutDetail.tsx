import type { CSSProperties } from 'react';
import { Icon } from './Icon';
import { setKindOf, setNumberLabels, type SetKind } from './setFieldValues';
import { workingSets, workoutVolumeKg } from './trainingSummary';
import { useWeightUnit } from './trainingPreferencesContext';
import type { MachinePhoto, PersonalRecord, TrackedSet, TrackedWorkout } from './types';
import { formatMinutesDuration, formatWorkoutTimeRange } from './utils';
import { formatWeight } from './weightUnits';
import './sharedWorkout.css';

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

function completedSets(workout: TrackedWorkout): TrackedSet[] {
  return workout.movements.flatMap((movement) => movement.sets).filter((item) => item.completed);
}

/** Sets that earned a weight or reps record, in the order they were lifted. */
function recordSets(workout: TrackedWorkout, personalRecords: PersonalRecord[]) {
  const earned = new Set(
    personalRecords
      .filter(
        (record) =>
          record.workout_id === workout.id &&
          (record.record_type === 'weight' || record.record_type === 'reps_at_weight'),
      )
      .map((record) => record.set_id),
  );
  return workout.movements.flatMap((movement) =>
    movement.sets
      .filter((item) => earned.has(item.id))
      .map((item) => ({ item, exercise: movement.exercise.name })),
  );
}

/** A shared workout's totals, with the records it set called out above the exercises. */
export function SharedWorkoutSummary({
  workout,
  personalRecords,
  formatSet,
}: {
  workout: TrackedWorkout;
  personalRecords: PersonalRecord[];
  formatSet: FormatSet;
}) {
  const weightUnit = useWeightUnit();
  const completed = completedSets(workout);
  const working = workingSets(workout).length;
  const warmups = completed.filter((item) => setKindOf(item) === 'warmup').length;
  const reps = completed.reduce((total, item) => total + (item.reps ?? 0), 0);
  const volume = workoutVolumeKg(workout);
  const records = recordSets(workout, personalRecords);
  const when =
    workout.start_time && workout.end_time
      ? formatWorkoutTimeRange(workout.start_time, workout.end_time)
      : null;

  return (
    <>
      <dl className="shared-session-stats" aria-label="Workout totals">
        <div>
          <dt>Time</dt>
          <dd className="num">{formatMinutesDuration(workout.duration_minutes)}</dd>
          {when && <small>{when}</small>}
        </div>
        <div>
          <dt>Sets</dt>
          <dd className="num">{working || completed.length}</dd>
          {working > 0 && warmups > 0 && <small>+{warmups} warm-up</small>}
        </div>
        <div>
          <dt>Reps</dt>
          <dd className="num">{reps || '–'}</dd>
        </div>
        <div>
          <dt>Volume</dt>
          <dd className="num">{volume ? formatWeight(volume, weightUnit, 0) : '–'}</dd>
        </div>
      </dl>
      {records.length > 0 && (
        <section className="shared-session-records" aria-label="Personal records">
          <h3>
            <Icon name="trophy" />
            {records.length} {records.length === 1 ? 'personal record' : 'personal records'}
          </h3>
          <ul>
            {records.map(({ item, exercise }) => (
              <li key={item.id}>
                <span>{exercise}</span>
                <b className="num">{formatSet(item)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** What one set is measured by, so its bar compares like with like within the exercise. */
function loadOf(sets: TrackedSet[]): ((item: TrackedSet) => number) | null {
  if (sets.some((item) => (item.weight_kg ?? 0) > 0)) return (item) => item.weight_kg ?? 0;
  if (sets.some((item) => (item.reps ?? 0) > 0)) return (item) => item.reps ?? 0;
  if (sets.some((item) => (item.duration_seconds ?? 0) > 0))
    return (item) => item.duration_seconds ?? 0;
  return null;
}

/**
 * One exercise's sets in a shared workout: warm-ups on a single quiet line, then each working set
 * on its own row with a bar for its load against the exercise's heaviest set.
 */
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
  const completed = sets.filter((item) => item.completed);
  const labels = setNumberLabels(completed);
  const rows = completed.map((item, index) => ({
    item,
    label: labels[index],
    kind: setKindOf(item),
  }));
  const warmups = rows.filter((row) => row.kind === 'warmup');
  const working = rows.filter((row) => row.kind !== 'warmup');
  const load = loadOf(completed);
  const heaviest = load ? Math.max(...completed.map(load)) : 0;
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
                {load && heaviest > 0 ? (
                  <span
                    className="shared-set-bar"
                    aria-hidden="true"
                    style={
                      {
                        '--shared-set-load': `${Math.max(Math.round((load(item) / heaviest) * 100), 6)}%`,
                      } as CSSProperties
                    }
                  />
                ) : (
                  <span />
                )}
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
