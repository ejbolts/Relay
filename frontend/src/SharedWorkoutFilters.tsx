import { Icon } from './Icon';
import { CATEGORY_LABELS } from './trainingSummary';
import type {
  SharedWorkoutFilters as Filters,
  SharedWorkoutFilterOptions,
  WorkoutCategory,
} from './types';

/** How many workout filters are set. */
function activeFilterCount(filters: Filters) {
  return Object.values(filters).filter(Boolean).length;
}

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
      aria-label={active > 0 ? `Filter workouts, ${active} set` : 'Filter workouts'}
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
            value={filters.workout_type_id ? `custom:${filters.workout_type_id}` : filters.category}
            onChange={(event) => {
              const value = event.target.value;
              if (value.startsWith('custom:')) {
                onChange({ ...filters, category: '', workout_type_id: value.slice(7) });
              } else {
                const next = { ...filters, category: value as WorkoutCategory | '' };
                delete next.workout_type_id;
                onChange(next);
              }
            }}
          >
            <option value="">All types</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
            {options.workout_types
              ?.filter((type) => type.is_custom)
              .map((type) => (
                <option value={`custom:${type.id}`} key={type.id}>
                  {type.name}
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
            onClick={() =>
              onChange({
                category: '',
                exercise_id: '',
                machine_photo_id: '',
                start_date: '',
                end_date: '',
              })
            }
          >
            Reset filters
          </button>
        )}
      </div>
    </div>
  );
}
