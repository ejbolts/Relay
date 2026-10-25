import { useState } from 'react';
import { api } from './api';
import { PopupDialog } from './PopupDialog';
import { dateRangeForDates, TIME_RANGE_OPTIONS, type TimeRange } from './dateRanges';
import { localDate } from './utils';

function downloadCsv(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export function DataExportDialog({
  workoutDates,
  bodyweightDates,
  onClose,
}: {
  workoutDates: string[];
  bodyweightDates: string[];
  onClose: () => void;
}) {
  const [workouts, setWorkouts] = useState(true);
  const [bodyweight, setBodyweight] = useState(false);
  const [timeFrame, setTimeFrame] = useState<TimeRange>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const dates = [...(workouts ? workoutDates : []), ...(bodyweight ? bodyweightDates : [])];
  const range = dateRangeForDates(dates, timeFrame);

  function close() {
    if (!busy) onClose();
  }

  async function save() {
    if (busy || (!workouts && !bodyweight)) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      // Prepare every selected file before downloading, so a failed request creates no partial export.
      const [workoutCsv, bodyCsv] = await Promise.all([
        workouts ? api.exportWorkouts(range) : null,
        bodyweight ? api.exportBodyMeasurements(range) : null,
      ]);
      const suffix = range.start_date ? `${range.start_date}-to-${range.end_date}` : localDate();
      if (workoutCsv) downloadCsv(workoutCsv, `gym-workouts-${suffix}.csv`);
      if (bodyCsv) downloadCsv(bodyCsv, `body-weight-${suffix}.csv`);
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not export your data. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function changeSelection(change: () => void) {
    change();
    setDone(false);
    setError(null);
  }

  return (
    <PopupDialog title="Export Relay data" kicker="CSV EXPORT" onClose={close}>
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
              <strong>Workout history</strong>
              <small>
                Completed sets, exercise names, weights, reps, warmups and session names.
              </small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={bodyweight}
              onChange={(event) => changeSelection(() => setBodyweight(event.target.checked))}
            />
            <span>
              <strong>Bodyweight check-ins</strong>
              <small>Date, weight, body-fat percentage and notes.</small>
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
          <small>
            {range.start_date && range.end_date
              ? `${range.start_date} – ${range.end_date} · ends at your latest selected entry`
              : dates.length
                ? 'All saved entries'
                : 'No saved entries — exports an empty CSV template'}
          </small>
        </div>
        <p className="data-export-note">
          {workouts && bodyweight
            ? 'Downloads two CSV files: workout history and bodyweight check-ins.'
            : bodyweight
              ? 'Downloads one bodyweight CSV file.'
              : workouts
                ? 'Downloads one workout CSV file.'
                : 'Select at least one type of data.'}{' '}
          Photos, videos, supersets, goals, RPE and workout notes are excluded.
        </p>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="workout-import-totals">
            {workouts && bodyweight ? 'Both CSV files downloaded.' : 'CSV downloaded.'}
          </p>
        )}
        <div className="popup-dialog-actions">
          <button type="button" disabled={busy} onClick={close}>
            {done ? 'Done' : 'Cancel'}
          </button>
          <button
            type="button"
            className="popup-primary-action"
            disabled={busy || (!workouts && !bodyweight)}
            onClick={() => void save()}
          >
            {busy ? 'Preparing…' : done ? 'Download again' : 'Download CSV'}
          </button>
        </div>
      </div>
    </PopupDialog>
  );
}
