import { useRef, useState } from 'react';
import { api } from './api';
import { PopupDialog } from './PopupDialog';
import { WorkoutCsvGuide } from './WorkoutCsvGuide';
import { WorkoutImportSource } from './WorkoutImportSource';
import { ImportBatchHistory } from './ImportBatchHistory';
import './importReview.css';
import { useWeightUnit } from './trainingPreferencesContext';
import type { CsvImportPreview, WorkoutImportOptions } from './types';
import {
  defaultImportOptions,
  IMPORT_FILE_TYPES,
  IMPORT_SAFETY_NOTE,
  importAddsAnything,
  importReviewTotals,
  importSourceSummary,
  mappedExerciseId,
  mappingChoices,
  REVIEW_SESSION_LIMIT,
  reviewSessionAction,
  reviewSessionDetails,
  reviewSessionsOverflow,
  withExerciseMapping,
} from './workoutImport';

export function WorkoutImportReview({
  fileName,
  preview,
  saving,
  error,
  onCancel,
  onSave,
  options,
  reviewing = false,
  reviewStale = false,
  onMappingChange,
  onUpdateReview,
}: {
  fileName: string;
  preview: CsvImportPreview;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
  options?: WorkoutImportOptions;
  reviewing?: boolean;
  reviewStale?: boolean;
  onMappingChange?: (name: string, id: string) => void;
  /** Tries the review again after a mapping's update failed. */
  onUpdateReview?: () => void;
}) {
  const exercises = preview.available_exercises ?? [];
  const totals = importReviewTotals(preview);
  const overflow = reviewSessionsOverflow(preview.sessions.length);
  return (
    <PopupDialog
      title="Review import"
      busy={saving}
      onClose={onCancel}
      actions={
        <>
          <button type="button" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="popup-primary-action"
            disabled={saving || reviewing || reviewStale || !importAddsAnything(preview)}
            onClick={onSave}
          >
            {saving ? 'Saving…' : 'Save import'}
          </button>
        </>
      }
    >
      <div className="workout-import-review">
        <p className="workout-import-filename">{fileName}</p>
        {options && <p>{importSourceSummary(options)}</p>}
        {!!preview.exercise_matches?.length && onMappingChange && (
          <details className="import-mapping" open>
            <summary>Exercise mapping ({preview.exercise_matches.length})</summary>
            {preview.exercise_matches.map((match) => {
              const { best, rest } = mappingChoices(match.incoming_name, exercises);
              return (
                <label key={match.incoming_name}>
                  <span>{match.incoming_name}</span>
                  <select
                    aria-label={`Map ${match.incoming_name}`}
                    disabled={saving || reviewing}
                    value={mappedExerciseId(options, match)}
                    onChange={(event) => onMappingChange(match.incoming_name, event.target.value)}
                  >
                    <option value="">Automatic match / new exercise</option>
                    {best.length > 0 && (
                      <optgroup label="Best matches">
                        {best.map((exercise) => (
                          <option key={exercise.id} value={exercise.id}>
                            {exercise.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="All exercises">
                      {rest.map((exercise) => (
                        <option key={exercise.id} value={exercise.id}>
                          {exercise.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>
              );
            })}
            {reviewStale && !reviewing && onUpdateReview && (
              <button type="button" className="profile-secondary" onClick={onUpdateReview}>
                Try again
              </button>
            )}
          </details>
        )}
        {reviewing && (
          <p className="workout-import-totals" role="status">
            Updating…
          </p>
        )}
        {!reviewing && totals.sessions && (
          <p>
            <span className="workout-import-totals">
              <strong>{totals.sessions.added}</strong> and <strong>{totals.sessions.sets}</strong>{' '}
              will be added.
            </span>
            {totals.sessions.skipped && <> {totals.sessions.skipped}</>}
          </p>
        )}
        {!reviewing && totals.bodyweight && (
          <p>
            <span className="workout-import-totals">
              <strong>{totals.bodyweight.added}</strong> will be added.
            </span>{' '}
            {totals.bodyweight.kept}
          </p>
        )}
        {totals.newExercises && <p>{totals.newExercises}</p>}
        <p className="workout-import-safety">{IMPORT_SAFETY_NOTE}</p>
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
          {preview.sessions.slice(0, REVIEW_SESSION_LIMIT).map((session, index) => (
            <li key={index}>
              <div>
                <strong>{session.name}</strong>
                <span>{reviewSessionAction(session)}</span>
              </div>
              <small>{reviewSessionDetails(session)}</small>
            </li>
          ))}
        </ul>
        {overflow && <p>{overflow}</p>}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
      </div>
    </PopupDialog>
  );
}
export function WorkoutCsvImport({
  onImport,
  guideOpen = false,
  onGuideOpenChange,
  onSourceChange,
  onUndoImport,
}: {
  onImport: (file: File, options?: WorkoutImportOptions) => Promise<void>;
  /** The CSV guide's recommendations, opened from onboarding or Settings. */
  guideOpen?: boolean;
  onGuideOpenChange?: (open: boolean) => void;
  onSourceChange?: (source: WorkoutImportOptions['source']) => void;
  onUndoImport?: (id: string) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<{
    file: File;
    preview: CsvImportPreview;
    options: WorkoutImportOptions;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [reviewStale, setReviewStale] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unit = useWeightUnit();
  const [options, setOptions] = useState<WorkoutImportOptions>(defaultImportOptions(unit));
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
      setReviewStale(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not review that CSV file.');
    } finally {
      setPreviewing(false);
    }
  }
  function cancel() {
    if (saving || previewing) return;
    setReview(null);
    setError(null);
  }
  async function save() {
    if (!review || saving || previewing || reviewStale || !importAddsAnything(review.preview))
      return;
    setError(null);
    setSaving(true);
    try {
      await onImport(review.file, review.options);
      setReview(null);
      setHistoryRevision(historyRevision + 1);
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
        accept={IMPORT_FILE_TYPES.join(',')}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void selectFile(file);
        }}
      />
      <button
        type="button"
        className="pulse-button secondary"
        disabled={previewing || saving}
        onClick={() => input.current?.click()}
      >
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
      {onUndoImport && <ImportBatchHistory key={historyRevision} onUndo={onUndoImport} />}
      {review && (
        <WorkoutImportReview
          reviewing={previewing}
          reviewStale={reviewStale}
          onMappingChange={(name, id) => {
            const mapped = withExerciseMapping(review.options, name, id);
            setReview({ ...review, options: mapped });
            // Save stays off until the refreshed review arrives; a failure keeps it off.
            setReviewStale(true);
            setError(null);
            void selectFile(review.file, mapped);
          }}
          onUpdateReview={() => void selectFile(review.file, review.options)}
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
