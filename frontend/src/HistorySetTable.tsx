import { Fragment } from 'react';
import { isAllTimeRecord, recordBadgeLabel, recordScopeLabel } from './recordScope';
import { relativeStrength } from './relativeStrength';
import { SET_KINDS, setKindOf, setNumberLabels } from './setFieldValues';
import { useWeightUnit } from './trainingPreferencesContext';
import type { MachinePhoto, PersonalRecord, TrackedSet } from './types';
import { formatWeight } from './weightUnits';
import './historySetTable.css';

/** A cardio set has no weight or reps to put in their columns, so its result spans both. */
function spansResult(item: TrackedSet): boolean {
  return (
    item.weight_kg === null &&
    (Boolean(item.duration_seconds) ||
      item.distance_km !== null ||
      item.incline_percent !== null ||
      item.speed_kph !== null)
  );
}

/**
 * A saved workout's sets laid out as they are while logging: one row per set under Set, Weight,
 * Reps and RPE, with the set type in the set-number square.
 */
export function HistorySetTable({
  bodyweight = null,
  sets,
  personalRecords,
  machinePhotos = [],
  ratioColumn = false,
  recordColumn = false,
  formatSet,
  recordLabel,
}: {
  bodyweight?: number | null;
  sets: TrackedSet[];
  personalRecords: PersonalRecord[];
  machinePhotos?: MachinePhoto[];
  /**
   * Keep the bodyweight-ratio or record column even when none of these sets fills it, so every
   * exercise in one workout lines up.
   */
  ratioColumn?: boolean;
  recordColumn?: boolean;
  /** The one-line result of a set that does not fit the Weight and Reps columns. */
  formatSet: (item: TrackedSet) => string;
  recordLabel: (type: PersonalRecord['record_type']) => string;
}) {
  const weightUnit = useWeightUnit();
  const numbers = setNumberLabels(sets);
  const ratios = sets.map((item) =>
    relativeStrength(item.weight_kg, item.bodyweight_kg ?? bodyweight),
  );
  const records = sets.map((item) => personalRecords.filter((record) => record.set_id === item.id));
  const resultOnly = sets.every(spansResult);
  // A cardio exercise has no lifts to line up with, so it never borrows a lifting column.
  const showRatio = ratios.some((ratio) => ratio !== null) || (ratioColumn && !resultOnly);
  const showRecords = records.some((list) => list.length > 0) || (recordColumn && !resultOnly);
  const columns = 4 + (showRatio ? 1 : 0) + (showRecords ? 1 : 0);

  return (
    <div className="history-set-table">
      <table className="num">
        <thead>
          <tr>
            <th scope="col">Set</th>
            {resultOnly ? (
              <th scope="col" colSpan={2} className="history-set-lead">
                Result
              </th>
            ) : (
              <>
                <th scope="col" className="history-set-lead">
                  Weight
                </th>
                <th scope="col" className="history-set-reps">
                  Reps
                </th>
              </>
            )}
            <th scope="col" className="history-set-rpe">
              RPE
            </th>
            {showRatio && (
              <th scope="col" className="history-set-ratio">
                × BW
              </th>
            )}
            {showRecords && (
              <th scope="col" className="history-set-record">
                <span className="sr-only">Record</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {sets.map((item, index) => {
            const kind = setKindOf(item);
            const kindLabel = SET_KINDS.find((option) => option.kind === kind)?.label;
            const machine =
              machinePhotos.length > 1
                ? (machinePhotos.find((photo) => photo.id === item.machine_photo_id)?.caption ??
                  'Machine not assigned')
                : null;
            return (
              <Fragment key={item.id}>
                <tr data-set-type={kind}>
                  <td>
                    <span className="history-set-number" title={kindLabel}>
                      {kind === 'normal' ? (
                        numbers[index]
                      ) : (
                        <>
                          <span aria-hidden="true">{numbers[index]}</span>
                          <span className="sr-only">{kindLabel}</span>
                        </>
                      )}
                    </span>
                  </td>
                  {spansResult(item) ? (
                    <td colSpan={2} className="history-set-lead history-set-result">
                      {formatSet(item)}
                    </td>
                  ) : (
                    <>
                      <td className="history-set-lead">
                        {item.weight_kg === null ? (
                          '–'
                        ) : item.weight_kg === 0 && item.reps !== null ? (
                          // A bodyweight set is saved at 0 kg; its reps are what matter.
                          <abbr title="Bodyweight">BW</abbr>
                        ) : (
                          formatWeight(item.weight_kg, weightUnit)
                        )}
                      </td>
                      <td className="history-set-reps">{item.reps ?? '–'}</td>
                    </>
                  )}
                  <td className="history-set-rpe" data-rpe={item.rpe ?? undefined}>
                    {item.rpe ?? '–'}
                  </td>
                  {showRatio && (
                    <td className="history-set-ratio">
                      {ratios[index] !== null && `${ratios[index].toFixed(2)}×`}
                    </td>
                  )}
                  {showRecords && (
                    <td className="history-set-record">
                      {records[index].length > 0 && (
                        <strong
                          className="pr-badge"
                          title={records[index]
                            .map(
                              (record) =>
                                `${recordScopeLabel(record)} ${recordLabel(record.record_type)}`,
                            )
                            .join(', ')}
                        >
                          {records[index].some(isAllTimeRecord) ? (
                            <>
                              <span className="sr-only">All-time </span>PR
                            </>
                          ) : (
                            recordBadgeLabel(records[index])
                          )}
                        </strong>
                      )}
                    </td>
                  )}
                </tr>
                {(machine || item.notes) && (
                  <tr className="history-set-extra" data-set-type={kind}>
                    <td />
                    <td colSpan={columns - 1}>
                      {machine && <span className="history-set-machine">{machine}</span>}
                      {item.notes && <span className="history-set-note">{item.notes}</span>}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
