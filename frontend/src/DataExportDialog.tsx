import { useState } from 'react';
import { api } from './api';
import { PopupDialog } from './PopupDialog';
import { dateRangeForDates, TIME_RANGE_OPTIONS, type TimeRange } from './dateRanges';
import { downloadFile as downloadCsv } from './downloadFile';
import { localDate } from './utils';
import {
  EXPORT_CHOICES,
  EXPORT_EXCLUDED,
  exportFileNames,
  exportFilesNote,
  exportRangeLabel,
} from './dataExport';

export function DataExportDialog({
  workoutDates,
  bodyweightDates,
  onClose,
  onExported,
}: {
  workoutDates: string[];
  bodyweightDates: string[];
  onClose: () => void;
  /** Called after the files download, with a confirmation for the toast. */
  onExported: (message: string) => void;
}) {
  const [workouts, setWorkouts] = useState(true);
  const [bodyweight, setBodyweight] = useState(false);
  const [timeFrame, setTimeFrame] = useState<TimeRange>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dates = [...(workouts ? workoutDates : []), ...(bodyweight ? bodyweightDates : [])];
  const range = dateRangeForDates(dates, timeFrame);

  async function save() {
    if (busy || (!workouts && !bodyweight)) return;
    setBusy(true);
    setError(null);
    try {
      // Prepare every selected file before downloading, so a failed request creates no partial export.
      const [workoutCsv, bodyCsv] = await Promise.all([
        workouts ? api.exportWorkouts(range) : null,
        bodyweight ? api.exportBodyMeasurements(range) : null,
      ]);
      const names = exportFileNames(range, localDate());
      if (workoutCsv) downloadCsv(workoutCsv, names.workouts);
      if (bodyCsv) downloadCsv(bodyCsv, names.bodyweight);
      setBusy(false);
      onExported(workoutCsv && bodyCsv ? 'Both CSV files downloaded.' : 'CSV downloaded.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not export your data. Try again.');
      setBusy(false);
    }
  }

  function changeSelection(change: () => void) {
    change();
    setError(null);
  }

  return (
    <PopupDialog
      title="Export Relay data"
      busy={busy}
      onClose={onClose}
      actions={
        <>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="popup-primary-action"
            disabled={busy || (!workouts && !bodyweight)}
            onClick={() => void save()}
          >
            {busy ? 'Preparing…' : 'Download CSV'}
          </button>
        </>
      }
    >
      <div className="data-export-dialog">
        <p>Choose what to export.</p>
        <fieldset disabled={busy} className="data-export-choices">
          <legend className="sr-only">Data to export</legend>
          <label>
            <input
              type="checkbox"
              checked={workouts}
              onChange={(event) => changeSelection(() => setWorkouts(event.target.checked))}
            />
            <span>
              <strong>{EXPORT_CHOICES.workouts.label}</strong>
              <small>{EXPORT_CHOICES.workouts.detail}</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={bodyweight}
              onChange={(event) => changeSelection(() => setBodyweight(event.target.checked))}
            />
            <span>
              <strong>{EXPORT_CHOICES.bodyweight.label}</strong>
              <small>{EXPORT_CHOICES.bodyweight.detail}</small>
            </span>
          </label>
        </fieldset>
        <div className="export-time-frame">
          <label className="chart-option-field">
            <span>Export time frame</span>
            <select
              aria-label="Export time frame"
              value={timeFrame}
              disabled={busy}
              onChange={(event) =>
                changeSelection(() => setTimeFrame(event.target.value as TimeRange))
              }
            >
              {TIME_RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <small>{exportRangeLabel(range, dates)}</small>
        </div>
        <p className="data-export-note">
          {exportFilesNote(workouts, bodyweight)} {EXPORT_EXCLUDED}
        </p>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
      </div>
    </PopupDialog>
  );
}
