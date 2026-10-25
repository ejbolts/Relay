import type { WorkoutImportOptions } from './types';
import './workoutImportSource.css';

export const IMPORT_APPS = [
  { id: 'strengthlevel', name: 'Strength Level', icon: '/import-apps/strengthlevel.png' },
  { id: 'hevy', name: 'Hevy', icon: '/import-apps/hevy.png' },
  { id: 'strong', name: 'Strong', icon: '/import-apps/strong.png' },
  { id: 'gym', name: 'Relay', icon: '/icon-192.png' },
] as const;

export function WorkoutImportSource({
  value,
  onChange,
  disabled = false,
}: {
  value: WorkoutImportOptions;
  onChange: (options: WorkoutImportOptions) => void;
  disabled?: boolean;
}) {
  return (
    <div className="workout-import-source">
      <p className="workout-import-source-heading">Bring your history from</p>
      <div className="workout-import-apps" role="group" aria-label="Import from app">
        {IMPORT_APPS.map((app) => (
          <button
            key={app.id}
            type="button"
            aria-pressed={value.source === app.id}
            disabled={disabled}
            onClick={() => onChange({ ...value, source: app.id })}
          >
            <img src={app.icon} alt="" width="40" height="40" />
            <span>{app.name}</span>
          </button>
        ))}
      </div>
      <p className="workout-import-source-hint" aria-live="polite">
        {value.source === 'strengthlevel' &&
          'Choose your original Strength Level CSV. Weights, reps, warmups and body weight are read directly. Rows on the same date form one workout.'}
        {value.source === 'hevy' &&
          'Choose your original Hevy workout CSV. Workout names, sessions, notes, RPE and timed sets are kept.'}
        {value.source === 'strong' &&
          'Choose a Strong workout or measurement CSV. Rest-timer rows are skipped. Body weights add missing check-ins without replacing yours.'}
        {value.source === 'gym' &&
          'Choose a Relay or Gym Logger workout or bodyweight CSV, or a spreadsheet using the template columns. Review before saving; existing check-ins are kept.'}
      </p>
      {value.source === 'strong' && (
        <div className="workout-import-units">
          <label>
            Workout weights in file
            <select
              value={value.weight_unit}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...value, weight_unit: event.target.value as 'kg' | 'lb' })
              }
            >
              <option value="kg">Kilograms (kg)</option>
              <option value="lb">Pounds (lb)</option>
            </select>
          </label>
          <label>
            Distances in file
            <select
              value={value.distance_unit}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...value, distance_unit: event.target.value as 'km' | 'mi' })
              }
            >
              <option value="km">Kilometres (km)</option>
              <option value="mi">Miles (mi)</option>
            </select>
          </label>
          <small>Match Strong’s export settings. Measurement files include their own units.</small>
        </div>
      )}
    </div>
  );
}
