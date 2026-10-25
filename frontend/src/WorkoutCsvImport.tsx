import { useRef, useState } from 'react';
import { api } from './api';
import { PopupDialog } from './PopupDialog';
import { WorkoutCsvGuide } from './WorkoutCsvGuide';
import { WorkoutImportSource } from './WorkoutImportSource';
import { useWeightUnit } from './trainingPreferencesContext';
import type { CsvImportPreview, WorkoutImportOptions } from './types';

export function WorkoutImportReview({
  fileName,
  preview,
  saving,
  error,
  onCancel,
  onSave,
  options,
}: {
  fileName: string;
  preview: CsvImportPreview;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
  options?: WorkoutImportOptions;
}) {
  return (
    <PopupDialog title="Review import" kicker="CSV IMPORT" onClose={onCancel}>
      <div className="workout-import-review">
        <p className="workout-import-filename">{fileName}</p>
        {options && (
          <p>
            {options.source === 'gym'
              ? 'Relay / spreadsheet'
              : options.source === 'strengthlevel'
                ? 'Strength Level'
                : options.source === 'hevy'
                  ? 'Hevy'
                  : 'Strong'}
            {options.source === 'strong'
              ? ` · Workout units: ${options.weight_unit}, ${options.distance_unit}. Measurement units come from the file.`
              : ''}
          </p>
        )}
        {(preview.sessions.length > 0 ||
          !(
            (preview.body_measurements_to_create ?? 0) + (preview.body_measurements_to_skip ?? 0)
          )) && (
          <p>
            <span className="workout-import-totals">
              <strong>
                {preview.workouts_to_create}{' '}
                {preview.workouts_to_create === 1 ? 'session' : 'sessions'}
              </strong>{' '}
              and{' '}
              <strong>
                {preview.sets_to_import} {preview.sets_to_import === 1 ? 'set' : 'sets'}
              </strong>{' '}
              will be added.
            </span>
            {preview.workouts_to_skip > 0 && (
              <>
                {' '}
                {preview.workouts_to_skip} identical existing{' '}
                {preview.workouts_to_skip === 1 ? 'session' : 'sessions'} will be skipped.
              </>
            )}
          </p>
        )}
        {(preview.body_measurements_to_create ?? 0) + (preview.body_measurements_to_skip ?? 0) >
          0 && (
          <p>
            <span className="workout-import-totals">
              <strong>
                {preview.body_measurements_to_create ?? 0} body-weight{' '}
                {preview.body_measurements_to_create === 1 ? 'check-in' : 'check-ins'}
              </strong>{' '}
              will be added.
            </span>{' '}
            {preview.body_measurements_to_skip ?? 0} existing{' '}
            {preview.body_measurements_to_skip === 1 ? 'date' : 'dates'} will be kept.
          </p>
        )}
        {preview.sessions.length > 0 && (
          <p>
            {preview.new_exercises.length
              ? `New exercises: ${preview.new_exercises.join(', ')}.`
              : 'No new exercises.'}
          </p>
        )}
        <p className="workout-import-safety">
          Nothing is saved until you choose Save import. Existing workouts and body-weight check-ins
          are kept. Missing body-weight dates may be added from this file. Duplicates and save
          limits are checked again when saving.
        </p>
        {preview.warnings.length > 0 && (
          <details className="workout-import-warnings" open>
            <summary>Warnings ({preview.warnings.length})</summary>
            <ul>
              {preview.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </details>
        )}
        <ul className="workout-import-sessions" aria-label="Sessions in this file">
          {preview.sessions.slice(0, 50).map((session, index) => (
            <li key={index}>
              <div>
                <strong>{session.name}</strong>
                <span>{session.duplicate ? 'Skip duplicate' : 'Add session'}</span>
              </div>
              <small>
                {session.workout_date} · {session.sets} {session.sets === 1 ? 'set' : 'sets'} ·{' '}
                {session.exercises.join(', ')}
              </small>
            </li>
          ))}
        </ul>
        {preview.sessions.length > 50 && (
          <p>
            Showing the first 50 of {preview.sessions.length} sessions. Totals include all rows.
          </p>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="popup-dialog-actions">
          <button type="button" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="popup-primary-action"
            disabled={
              saving || (preview.workouts_to_create === 0 && !preview.body_measurements_to_create)
            }
            onClick={onSave}
          >
            {saving ? 'Saving…' : 'Save import'}
          </button>
        </div>
      </div>
    </PopupDialog>
  );
}

export function WorkoutCsvImport({
  onImport,
  guideOpen = false,
  onGuideOpenChange,
  onSourceChange,
}: {
  onImport: (file: File, options?: WorkoutImportOptions) => Promise<void>;
  /** The CSV guide's recommendations, opened from onboarding or Settings. */
  guideOpen?: boolean;
  onGuideOpenChange?: (open: boolean) => void;
  onSourceChange?: (source: WorkoutImportOptions['source']) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<{
    file: File;
    preview: CsvImportPreview;
    options: WorkoutImportOptions;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unit = useWeightUnit();
  const [options, setOptions] = useState<WorkoutImportOptions>({
    source: 'gym',
    weight_unit: unit,
    distance_unit: 'km',
  });

  function changeOptions(value: WorkoutImportOptions) {
    setOptions(value);
    setError(null);
    onSourceChange?.(value.source);
  }

  async function selectFile(file: File, selected = options) {
    setError(null);
    setPreviewing(true);
    try {
      const preview = await api.previewWorkoutImport(file, selected);
      setReview({ file, preview, options: selected });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not review that CSV file.');
    } finally {
      setPreviewing(false);
    }
  }

  function cancel() {
    if (saving) return;
    setReview(null);
    setError(null);
  }

  async function save() {
    if (
      !review ||
      saving ||
      (review.preview.workouts_to_create === 0 && !review.preview.body_measurements_to_create)
    )
      return;
    setError(null);
    setSaving(true);
    try {
      await onImport(review.file, review.options);
      setReview(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that import.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <WorkoutImportSource
        value={options}
        onChange={changeOptions}
        disabled={previewing || saving}
      />
      <input
        ref={input}
        className="sr-only"
        aria-label="Workout CSV file"
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void selectFile(file);
        }}
      />
      <button type="button" disabled={previewing || saving} onClick={() => input.current?.click()}>
        {previewing ? 'Reviewing…' : '↑ Choose CSV file'}
      </button>
      {error && !review && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {error && !review && onGuideOpenChange && (
        <button type="button" className="csv-guide-link" onClick={() => onGuideOpenChange(true)}>
          See what the CSV should look like
        </button>
      )}
      {guideOpen && onGuideOpenChange && (
        <WorkoutCsvGuide
          options={options}
          onOptionsChange={changeOptions}
          onClose={() => onGuideOpenChange(false)}
          onFileSelected={(file, selected) => {
            onGuideOpenChange(false);
            void selectFile(file, selected);
          }}
        />
      )}
      {review && (
        <WorkoutImportReview
          options={review.options}
          fileName={review.file.name}
          preview={review.preview}
          saving={saving}
          error={error}
          onCancel={cancel}
          onSave={() => void save()}
        />
      )}
    </>
  );
}
