import { useEffect, useState } from 'react';
import { api } from './api';
import { Icon } from './Icon';
import { filterMachines, machineDate, machineLastUsedLabel, timeSince } from './machineHistory';
import { PopupDialog } from './PopupDialog';
import type { MachinePhoto, MachinePhotoUsage } from './types';

/** The machine History is filtered by, with its exercise for display. */
export type MachineFilter = { photo: MachinePhoto; exerciseName: string };

const SEARCH_THRESHOLD = 6;

/** Choose one saved machine photo to list only the workouts that pinned it. */
export function MachineFilterPicker({
  today,
  onSelect,
  onClose,
}: {
  today: string;
  onSelect: (filter: MachineFilter) => void;
  onClose: () => void;
}) {
  const [machines, setMachines] = useState<MachinePhotoUsage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    api
      .listAllMachinePhotos()
      .then((items) => {
        if (active) setMachines(items);
      })
      .catch((loadError: unknown) => {
        if (active)
          setError(
            loadError instanceof Error ? loadError.message : 'Could not load your machines.',
          );
      });
    return () => {
      active = false;
    };
  }, []);

  const visible = machines ? filterMachines(machines, query) : [];

  return (
    <PopupDialog
      title="Filter by machine"
      kicker="History"
      className="machine-filter-dialog"
      onClose={onClose}
    >
      <p className="machine-filter-intro">
        Show only workouts where you pinned this machine’s photo, newest first.
      </p>
      {machines && machines.length > SEARCH_THRESHOLD && (
        <label className="machine-filter-search">
          <Icon name="search" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search machines or exercises"
            aria-label="Search machines"
          />
        </label>
      )}
      {error && (
        <p className="machine-filter-message" role="alert">
          {error}
        </p>
      )}
      {!machines && !error && (
        <p className="machine-filter-message" role="status">
          Loading machines…
        </p>
      )}
      {machines && machines.length === 0 && (
        <p className="machine-filter-message">
          No saved machine photos yet. While logging an exercise, open Equipment photo and use Take
          photo or Choose photo to save one.
        </p>
      )}
      {machines && machines.length > 0 && visible.length === 0 && (
        <p className="machine-filter-message">No machines match “{query.trim()}”.</p>
      )}
      {visible.length > 0 && (
        <ul className="machine-filter-list" aria-label="Saved machines">
          {visible.map((machine) => (
            <li key={machine.id}>
              <button
                type="button"
                onClick={() => onSelect({ photo: machine, exerciseName: machine.exercise_name })}
              >
                <img src={machine.thumbnail_url} alt="" loading="lazy" />
                <span>
                  <strong>{machine.caption}</strong>
                  <small>{machine.exercise_name}</small>
                  <small className={machine.last_used_date ? '' : 'unused'}>
                    {machineLastUsedLabel(machine.last_used_date, today)}
                  </small>
                </span>
                {machine.workout_count > 0 && (
                  <b className="num" aria-label={`${machine.workout_count} workouts`}>
                    {machine.workout_count}×
                  </b>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </PopupDialog>
  );
}

/** Summary of the active machine filter: when it was last used and how often. */
export function MachineFilterBanner({
  filter,
  workoutDates,
  loading,
  error,
  today,
  onChange,
  onClear,
}: {
  filter: MachineFilter;
  /** Newest first; null until the machine's workouts have loaded. */
  workoutDates: string[] | null;
  loading: boolean;
  error: string | null;
  today: string;
  onChange: () => void;
  onClear: () => void;
}) {
  const lastUsed = workoutDates?.[0] ?? null;
  const count = workoutDates?.length ?? 0;
  return (
    <section className="machine-filter-banner pulse-card" aria-label="Machine filter">
      <img src={filter.photo.thumbnail_url} alt={filter.photo.caption} />
      <div className="machine-filter-copy">
        <p className="machine-filter-eyebrow">
          <Icon name="filter" /> Filtered by machine
        </p>
        <h2>{filter.photo.caption}</h2>
        <p>{filter.exerciseName}</p>
        <p className="machine-filter-last" role="status">
          {error
            ? error
            : workoutDates === null || (loading && !lastUsed)
              ? 'Finding your sessions…'
              : lastUsed
                ? `Last used ${machineDate(lastUsed)} · ${timeSince(lastUsed, today)} · ${count} ${count === 1 ? 'workout' : 'workouts'}`
                : 'No saved workouts use this machine yet.'}
        </p>
      </div>
      <div className="machine-filter-actions">
        <button type="button" onClick={onChange}>
          Change
        </button>
        <button type="button" className="machine-filter-clear" onClick={onClear}>
          <Icon name="close" />
          Close
        </button>
      </div>
    </section>
  );
}
