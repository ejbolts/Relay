import { useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { ExerciseEquipmentFilter } from './ExerciseEquipmentFilter';
import { ExerciseCustomFilter } from './ExerciseCustomFilter';
import { exerciseEquipment } from './exerciseEquipment';
import { exerciseSearchScore } from './exerciseSearch';
import type { Exercise, ExerciseLibrarySummary } from './types';
import { useWeightUnit } from './trainingPreferencesContext';
import { formatWeightNumber, weightFromKg } from './weightUnits';
import type { ExerciseLibraryState } from './useExerciseLibrary';

const sorts = ['Recent first', 'A–Z', 'Most improved'] as const;
function Sparkline({ summary }: { summary: ExerciseLibrarySummary | undefined }) {
  const values = summary?.trend.map((p) => p.estimated_1rm) ?? [];
  if (values.length < 2) return <span className="exercise-list-spark" aria-hidden="true" />;
  const minimum = Math.min(...values),
    span = Math.max(...values) - minimum || 1;
  const points = values
    .map(
      (value, i) => `${2 + (i / (values.length - 1)) * 56},${24 - ((value - minimum) / span) * 20}`,
    )
    .join(' ');
  return (
    <svg
      className={`exercise-list-spark ${(summary?.change_kg ?? 0) > 0 ? 'up' : (summary?.change_kg ?? 0) < 0 ? 'down' : ''}`}
      viewBox="0 0 60 28"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ExerciseLibraryList({
  exercises,
  library,
  onOpen,
  onCreate,
}: {
  exercises: Exercise[];
  library: ExerciseLibraryState;
  onOpen: (id: string) => void;
  onCreate?: () => void;
}) {
  const weightUnit = useWeightUnit();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('All');
  const [equipment, setEquipment] = useState('');
  const [customOnly, setCustomOnly] = useState(false);
  const [sort, setSort] = useState(0);
  const { summaries, loading, error, retry } = library;
  const input = useRef<HTMLInputElement>(null);
  const byId = useMemo(
    () => new Map(summaries?.map((item) => [item.exercise_id, item])),
    [summaries],
  );
  const muscles = [
    ...new Set(exercises.map((exercise) => exercise.muscle_group).filter(Boolean)),
  ].sort();
  const list = exercises
    .filter(
      (exercise) =>
        (!customOnly || exercise.is_custom) &&
        (muscle === 'All' || exercise.muscle_group === muscle) &&
        (!equipment || exerciseEquipment(exercise.equipment) === equipment) &&
        exerciseSearchScore(exercise, query) !== null,
    )
    .sort((a, b) => {
      const first = byId.get(a.id),
        second = byId.get(b.id);
      if (sort === 1) return a.name.localeCompare(b.name);
      if (sort === 2) {
        const change = (second?.change_percent ?? -Infinity) - (first?.change_percent ?? -Infinity);
        if (change && !Number.isNaN(change)) return change;
      } else {
        const recent = (second?.last_date ?? '').localeCompare(first?.last_date ?? '');
        if (recent) return recent;
      }
      return a.name.localeCompare(b.name);
    });
  return (
    <section className="exercise-list-library" aria-label="Exercise library">
      <div className="exercise-list-toolbar">
        <label className="exercise-list-search">
          <Icon name="search" />
          <input
            ref={input}
            type="search"
            aria-label="Search exercises"
            placeholder="Search exercises"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                input.current?.focus();
              }}
            >
              <Icon name="close" />
            </button>
          )}
        </label>
        {onCreate && (
          <button
            type="button"
            className="exercise-library-add"
            aria-label="Add exercise"
            title="Add exercise"
            aria-haspopup="dialog"
            onClick={onCreate}
          >
            <Icon name="plus" />
          </button>
        )}
      </div>
      <div className="exercise-library-equipment">
        <ExerciseEquipmentFilter exercises={exercises} value={equipment} onChange={setEquipment} />
      </div>
      <div className="exercise-library-filter-row">
        <ExerciseCustomFilter active={customOnly} onChange={setCustomOnly} />
        <div className="exercise-muscle-filters" role="group" aria-label="Muscle group">
          {['All', ...muscles].map((name) => (
            <button
              type="button"
              key={name}
              aria-pressed={muscle === name}
              onClick={() => setMuscle(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="exercise-list-meta">
        <span>
          {list.length} {list.length === 1 ? 'lift' : 'lifts'} · Est. 1RM, 8 wk
        </span>
        <button
          type="button"
          className="text-link"
          aria-label={`Sort exercises: ${sorts[sort]}`}
          onClick={() => setSort((value) => (value + 1) % sorts.length)}
        >
          {sorts[sort]}
          <Icon name="chevron-down" />
        </button>
      </div>
      {loading && summaries === null && (
        <p className="exercise-list-status" role="status">
          Loading trends…
        </p>
      )}
      {error && (
        <div className="exercise-progress-error" role="alert">
          Could not load exercise trends.{' '}
          <button type="button" className="text-link" onClick={retry}>
            Retry
          </button>
        </div>
      )}
      {!list.length && (
        <p className="exercise-list-status" role="status">
          {exercises.length
            ? 'No exercises match your search and filters.'
            : 'No strength exercises yet.'}
        </p>
      )}
      <ul className="exercise-list-rows">
        {list.map((exercise) => {
          const summary = byId.get(exercise.id),
            change = summary?.change_kg;
          return (
            <li key={exercise.id}>
              <button
                type="button"
                data-exercise-id={exercise.id}
                onClick={() => onOpen(exercise.id)}
              >
                <span className="exercise-list-icon" aria-hidden="true">
                  {exercise.name
                    .split(/\s+/)
                    .map((word) => word[0])
                    .slice(0, 2)
                    .join('')}
                </span>
                <span className="exercise-list-copy">
                  <strong>{exercise.name}</strong>
                  <small>
                    {[
                      exercise.muscle_group,
                      exercise.equipment,
                      summary
                        ? new Date(`${summary.last_date}T12:00:00`).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                          })
                        : loading || error
                          ? null
                          : 'Not trained',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </span>
                <Sparkline summary={summary} />
                <span className="exercise-list-value">
                  <b>
                    {summary?.latest_estimated_1rm == null ? (
                      '—'
                    ) : (
                      <>
                        {formatWeightNumber(summary.latest_estimated_1rm, weightUnit, 1)}{' '}
                        <small>{weightUnit}</small>
                      </>
                    )}
                  </b>
                  {change != null && (
                    <small className={change > 0 ? 'up' : change < 0 ? 'down' : ''}>
                      {change > 0 ? '+' : change < 0 ? '−' : ''}
                      {Number(weightFromKg(Math.abs(change), weightUnit).toFixed(1))}
                    </small>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
