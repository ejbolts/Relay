import { useRef } from 'react';
import { PopupDialog } from './PopupDialog';
import { useWeightUnit } from './trainingPreferencesContext';
import { downloadWorkoutCsvTemplate } from './workoutCsvTemplateDownload';
import { WorkoutImportSource } from './WorkoutImportSource';
import type { WorkoutImportOptions } from './types';
import { IMPORT_FILE_TYPES, IMPORT_GUIDE_INTRO } from './workoutImport';
import './workoutCsvGuide.css';

/** A quick guide to choosing the source app and its original CSV export. */
export function WorkoutCsvGuide({
  onClose,
  onFileSelected,
  options,
  onOptionsChange,
}: {
  onClose: () => void;
  onFileSelected: (file: File, options: WorkoutImportOptions) => void;
  options: WorkoutImportOptions;
  onOptionsChange: (options: WorkoutImportOptions) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const unit = useWeightUnit();

  return (
    <PopupDialog
      title="Import guide"
      kicker="WORKOUTS & BODYWEIGHT"
      className="workout-csv-guide"
      onClose={onClose}
      actions={
        <>
          <button
            type="button"
            className="popup-tertiary-action workout-csv-guide-close"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="popup-primary-action"
            onClick={() => input.current?.click()}
          >
            ↑ Choose CSV file
          </button>
        </>
      }
    >
      <div className="workout-csv-guide-body">
        <p>{IMPORT_GUIDE_INTRO}</p>
        <WorkoutImportSource value={options} onChange={onOptionsChange} />
        <p className="workout-csv-guide-note">
          Review the totals and warnings, then choose <strong>Save import</strong>. Nothing is saved
          until then. Existing workouts and bodyweight check-ins are kept.
        </p>
        {options.source === 'gym' && (
          <button
            type="button"
            className="csv-guide-link workout-csv-guide-template"
            onClick={() => downloadWorkoutCsvTemplate(unit)}
          >
            Using your own spreadsheet? Download the template
          </button>
        )}
      </div>
      <input
        ref={input}
        className="sr-only"
        aria-label="Workout CSV file"
        type="file"
        accept={IMPORT_FILE_TYPES.join(',')}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) onFileSelected(file, options);
        }}
      />
    </PopupDialog>
  );
}
