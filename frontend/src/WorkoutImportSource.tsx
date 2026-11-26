import type { WorkoutImportOptions } from './types';
import {
  IMPORT_SOURCE_HINTS,
  IMPORT_SOURCES,
  STRONG_DISTANCE_UNITS,
  STRONG_UNITS_NOTE,
  STRONG_WEIGHT_UNITS,
} from './workoutImport';
import './workoutImportSource.css';

const ICONS: Record<WorkoutImportOptions['source'], string> = {
  strengthlevel: '/import-apps/strengthlevel.png',
  hevy: '/import-apps/hevy.png',
  strong: '/import-apps/strong.png',
  gym: '/icon-192.png',
};

export const IMPORT_APPS = IMPORT_SOURCES.map((app) => ({ ...app, icon: ICONS[app.id] }));

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
        {IMPORT_SOURCE_HINTS[value.source]}
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
              {STRONG_WEIGHT_UNITS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
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
              {STRONG_DISTANCE_UNITS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
          <small>{STRONG_UNITS_NOTE}</small>
        </div>
      )}
    </div>
  );
}
