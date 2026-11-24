import { Icon } from './Icon';
import {
  NO_SHARED_WORKOUT_FILTERS,
  sharedWorkoutFilterCount as activeFilterCount,
  sharedWorkoutFilterLabel,
  sharedWorkoutTypeChoices,
  sharedWorkoutTypeValue,
  withSharedWorkoutType,
} from './sharedHistoryFilters';
import type { SharedWorkoutFilters as Filters, SharedWorkoutFilterOptions } from './types';

/** The filter button beside a profile's Workouts title, with the number of filters set. */
export function SharedWorkoutFilterToggle({
  filters,
  open,
  controls,
  onToggle,
}: {
  filters: Filters;
  open: boolean;
  controls: string;
  onToggle: (open: boolean) => void;
}) {
  const active = activeFilterCount(filters);
  return (
    <button
      type="button"
      className={`shared-workout-filter-toggle${active > 0 ? ' is-filtered' : ''}`}
      aria-label={sharedWorkoutFilterLabel(active)}
      aria-expanded={open}
      aria-controls={controls}
      onClick={() => onToggle(!open)}
    >
      <Icon name="filter" />
      {active > 0 && <span aria-hidden="true">{active}</span>}
    </button>
  );
}

export function SharedWorkoutFilters({
  id,
  filters,
  options,
  open,
  onChange,
}: {
  id: string;
  filters: Filters;
  options: SharedWorkoutFilterOptions;
  open: boolean;
  onChange: (next: Filters) => void;
}) {
  const active = activeFilterCount(filters);
  return (
    <div className="shared-workout-filters" id={id} hidden={!open}>
      <div className="shared-workout-filter-fields">
        <label>
          Workout type
          <select
            aria-label="Workout type"
            value={sharedWorkoutTypeValue(filters)}
            onChange={(event) => onChange(withSharedWorkoutType(filters, event.target.value))}
          >
            {sharedWorkoutTypeChoices(options).map((choice) => (
              <option value={choice.value} key={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Exercise
          <select
            aria-label="Exercise"
            value={filters.exercise_id}
            onChange={(event) => onChange({ ...filters, exercise_id: event.target.value })}
          >
            <option value="">All exercises</option>
            {options.exercises.map((exercise) => (
              <option value={exercise.id} key={exercise.id}>
                {exercise.name}
              </option>
            ))}
          </select>
        </label>
        {options.machines.length > 0 && (
          <label>
            Machine
            <select
              aria-label="Machine"
              value={filters.machine_photo_id}
              onChange={(event) => onChange({ ...filters, machine_photo_id: event.target.value })}
            >
              <option value="">All shared machines</option>
              {options.machines.map((machine) => (
                <option value={machine.id} key={machine.id}>
                  {machine.caption}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          From
          <input
            aria-label="From"
            type="date"
            value={filters.start_date}
            onChange={(event) => onChange({ ...filters, start_date: event.target.value })}
          />
        </label>
        <label>
          To
          <input
            aria-label="To"
            type="date"
            value={filters.end_date}
            onChange={(event) => onChange({ ...filters, end_date: event.target.value })}
          />
        </label>
        {active > 0 && (
          <button
            className="pulse-button link small"
            type="button"
            onClick={() => onChange(NO_SHARED_WORKOUT_FILTERS)}
          >
            Reset filters
          </button>
        )}
      </div>
    </div>
  );
}
