import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api } from './api';
import { CreateExerciseDialog } from './CreateExerciseDialog';
import { ExerciseEquipmentFilter } from './ExerciseEquipmentFilter';
import { exerciseEquipment } from './exerciseEquipment';
import { ExerciseIcon } from './ExerciseIcon';
import { formatLastDone } from './exerciseLastDone';
import {
  lastUsedMachineId,
  machinesByExercise,
  resolveMachineChoices,
  toggledMachineChoice,
  type ExerciseMachineChoices,
} from './exerciseMachineChoices';
import { ExerciseMachineStrip } from './ExerciseMachineStrip';
import { ExerciseMuscleHelp } from './ExerciseMuscleHelp';
import { rankExerciseSearchMatches } from './exerciseSearch';
import { FuzzyHighlightedText } from './FuzzyHighlightedText';
import { Icon } from './Icon';
import { motionReduced } from './motion';
import { optimisePhoto } from './photoOptimise';
import { PopupDialog } from './PopupDialog';
import { CATEGORY_LABELS } from './trainingSummary';
import type { Exercise, ExerciseCreateInput, MachinePhotoUsage, WorkoutCategory } from './types';
import { itemsInSelectionOrder, localDate } from './utils';
import { supersetGroupName } from './workoutSupersets';
import './exercisePicker.css';

function titleCase(text: string): string {
  return text.replace(
    /(^|\s)(\p{L})/gu,
    (_, space: string, letter: string) => `${space}${letter.toUpperCase()}`,
  );
}

export function ExercisePicker({
  exercises,
  excludedIds,
  recentExerciseIds,
  lastDoneDates,
  onFavoriteChange,
  onCreateExercise,
  singleSelect = false,
  workoutCategory,
  onChoose,
  onCreateSuperset,
  onClose,
}: {
  exercises: Exercise[];
  excludedIds: string[];
  /** The workout's type, which an exercise created from a search starts in. */
  workoutCategory?: WorkoutCategory;
  recentExerciseIds: string[];
  /** Each exercise's latest workout date, shown beside its tags. */
  lastDoneDates?: ReadonlyMap<string, string>;
  onFavoriteChange: (exerciseId: string, isFavorite: boolean) => Promise<void>;
  onCreateExercise: (input: ExerciseCreateInput) => Promise<Exercise>;
  singleSelect?: boolean;
  onChoose: (exercises: Exercise[], machineChoices: ExerciseMachineChoices) => void;
  onCreateSuperset?: (exercises: Exercise[], machineChoices: ExerciseMachineChoices) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [today] = useState(localDate);
  const [savedMachines, setSavedMachines] = useState<ReadonlyMap<string, MachinePhotoUsage[]>>(
    () => new Map(),
  );
  // Only choices the user made; selected exercises otherwise preselect their last-used machine.
  const [machineChoices, setMachineChoices] = useState<ExerciseMachineChoices>({});
  const [openMachinesId, setOpenMachinesId] = useState<string | null>(null);
  const [bodyPart, setBodyPart] = useState<WorkoutCategory | 'all'>('all');
  const [customOnly, setCustomOnly] = useState(false);
  const [equipment, setEquipment] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [favoriteSavingIds, setFavoriteSavingIds] = useState<string[]>([]);
  const [createExerciseOpen, setCreateExerciseOpen] = useState(false);
  // Created from a search with no match: named after it, in the workout's type.
  const [createFromSearch, setCreateFromSearch] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [viewport, setViewport] = useState(() => {
    const visualViewport = window.visualViewport;
    return {
      height: visualViewport?.height ?? window.innerHeight,
      top: visualViewport?.offsetTop ?? 0,
      keyboardVisible: false,
    };
  });
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const initialViewportHeightRef = useRef(window.visualViewport?.height ?? window.innerHeight);
  const query = search.trim();
  const available = exercises.filter(
    (exercise) =>
      !exercise.hidden &&
      !excludedIds.includes(exercise.id) &&
      (!customOnly || exercise.is_custom) &&
      (bodyPart === 'all' || exercise.category === bodyPart) &&
      (!equipment || exerciseEquipment(exercise.equipment) === equipment),
  );
  const recent = recentExerciseIds
    .slice(0, 10)
    .map((id) => available.find((exercise) => exercise.id === id))
    .filter((exercise): exercise is Exercise => Boolean(exercise));
  const sections: Array<{ title: string; exercises: Exercise[] }> = [];

  if (query) {
    sections.push({
      title: 'Search results',
      exercises: rankExerciseSearchMatches(available, query, recentExerciseIds),
    });
  } else {
    const scoped = available;
    const favorites = scoped.filter((exercise) => exercise.is_favorite);
    const favoriteIds = new Set(favorites.map((exercise) => exercise.id));
    const recentlyUsed = recent.filter(
      (exercise) => scoped.some((item) => item.id === exercise.id) && !favoriteIds.has(exercise.id),
    );
    const featuredIds = new Set([
      ...favorites.map((exercise) => exercise.id),
      ...recentlyUsed.map((exercise) => exercise.id),
    ]);
    if (favorites.length) sections.push({ title: 'Favorites', exercises: favorites });
    if (recentlyUsed.length) sections.push({ title: 'Recently used', exercises: recentlyUsed });
    sections.push({
      title: bodyPart === 'all' ? 'All exercises' : `${CATEGORY_LABELS[bodyPart]} exercises`,
      exercises: scoped.filter((exercise) => !featuredIds.has(exercise.id)),
    });
  }
  const visibleExerciseCount = sections.reduce(
    (count, section) => count + section.exercises.length,
    0,
  );
  const resolvedMachineChoices = resolveMachineChoices(selectedIds, savedMachines, machineChoices);

  function addToSelection(exerciseId: string) {
    setSelectedIds((current) => (singleSelect ? [exerciseId] : [...current, exerciseId]));
  }

  function toggleExercise(exercise: Exercise) {
    const wasSelected = selectedIds.includes(exercise.id);
    setSelectedIds((current) =>
      current.includes(exercise.id)
        ? current.filter((id) => id !== exercise.id)
        : singleSelect
          ? [exercise.id]
          : [...current, exercise.id],
    );
    if (wasSelected) {
      setMachineChoices((current) => {
        const next = { ...current };
        delete next[exercise.id];
        return next;
      });
      if (openMachinesId === exercise.id) setOpenMachinesId(null);
    } else {
      if (singleSelect) setMachineChoices({});
      if (savedMachines.get(exercise.id)?.length) setOpenMachinesId(exercise.id);
    }
    searchRef.current?.blur();
  }

  /** Records a machine for an exercise, picking the exercise too when it was not selected. */
  function recordMachineChoice(exercise: Exercise, machineId: string | null) {
    const selected = selectedIds.includes(exercise.id);
    setMachineChoices((current) =>
      singleSelect && !selected
        ? { [exercise.id]: machineId }
        : { ...current, [exercise.id]: machineId },
    );
    if (!selected) addToSelection(exercise.id);
  }

  /** Tapping the chosen machine again returns to the baseline exercise. */
  function chooseMachine(exercise: Exercise, machineId: string) {
    const selected = selectedIds.includes(exercise.id);
    recordMachineChoice(
      exercise,
      selected
        ? toggledMachineChoice(resolvedMachineChoices[exercise.id] ?? null, machineId)
        : machineId,
    );
  }

  async function addMachine(exercise: Exercise, file: File, caption: string) {
    const upload = await optimisePhoto(file);
    const photo = await api.uploadMachinePhoto(exercise.id, upload, caption);
    setSavedMachines((current) => {
      const next = new Map(current);
      next.set(exercise.id, [
        ...(current.get(exercise.id) ?? []),
        { ...photo, exercise_name: exercise.name, workout_count: 0, last_used_date: null },
      ]);
      return next;
    });
    recordMachineChoice(exercise, photo.id);
  }

  async function toggleFavorite(exercise: Exercise) {
    if (favoriteSavingIds.includes(exercise.id)) return;
    setFavoriteSavingIds((current) => [...current, exercise.id]);
    setPickerError(null);
    try {
      await onFavoriteChange(exercise.id, !exercise.is_favorite);
    } catch (error) {
      setPickerError(error instanceof Error ? error.message : 'Could not update this favorite.');
    } finally {
      setFavoriteSavingIds((current) => current.filter((id) => id !== exercise.id));
    }
  }

  function renderExercise(exercise: Exercise) {
    const selected = selectedIds.includes(exercise.id);
    const machines = savedMachines.get(exercise.id) ?? [];
    const hasMachines = machines.length > 0;
    const machinesOpen = hasMachines && openMachinesId === exercise.id;
    const chosenMachineId = selected ? (resolvedMachineChoices[exercise.id] ?? null) : null;
    const chosenMachine = machines.find((machine) => machine.id === chosenMachineId);
    const machinePanelId = `exercise-machines-${exercise.id}`;
    const lastDone = lastDoneDates?.get(exercise.id);
    return (
      <div
        className={`exercise-option ${selected ? 'selected' : ''} ${hasMachines ? 'has-machines' : ''} ${machinesOpen ? 'machines-open' : ''}`}
        key={exercise.id}
        data-exercise-id={exercise.id}
      >
        <button
          type="button"
          className="exercise-option-select"
          aria-pressed={selected}
          onClick={() => toggleExercise(exercise)}
        >
          <ExerciseIcon exercise={exercise} />
          <span className="exercise-option-copy">
            <strong>
              <FuzzyHighlightedText value={exercise.name} query={query} />
            </strong>
            {exercise.is_custom && <small className="custom-exercise-label">Custom</small>}
            <small className="exercise-option-tags">
              <em>{exercise.muscle_group}</em>
              {exercise.equipment && <em>{exercise.equipment}</em>}
              {lastDone && (
                <em className="exercise-option-last-done">
                  <Icon name="calendar" />
                  <span className="sr-only">Last done </span>
                  {formatLastDone(lastDone, today)}
                </em>
              )}
            </small>
            {selected && hasMachines && (
              <small className="exercise-option-machine">
                {chosenMachine?.caption ?? 'Baseline exercise'}
              </small>
            )}
          </span>
          {selected && <b className="exercise-option-selected">✓</b>}
        </button>
        <ExerciseMuscleHelp exercise={exercise} />
        {hasMachines && (
          <button
            type="button"
            className="exercise-machine-toggle"
            aria-label={`${machinesOpen ? 'Hide' : 'Show'} machines for ${exercise.name}`}
            aria-expanded={machinesOpen}
            aria-controls={machinePanelId}
            onClick={() => setOpenMachinesId(machinesOpen ? null : exercise.id)}
          >
            <Icon name="chevron-down" />
          </button>
        )}
        <button
          type="button"
          className={`exercise-favorite-button ${exercise.is_favorite ? 'active' : ''}`}
          aria-label={`${exercise.is_favorite ? 'Remove' : 'Add'} ${exercise.name} ${exercise.is_favorite ? 'from' : 'to'} favorites`}
          aria-pressed={exercise.is_favorite}
          disabled={favoriteSavingIds.includes(exercise.id)}
          onClick={() => void toggleFavorite(exercise)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 3h12v18l-6-4-6 4V3Z" />
          </svg>
        </button>
        {hasMachines && (
          <div className="exercise-machine-accordion" id={machinePanelId} inert={!machinesOpen}>
            <div className="exercise-machine-clip">
              <ExerciseMachineStrip
                exercise={exercise}
                machines={machines}
                chosenId={chosenMachineId}
                lastUsedId={lastUsedMachineId(machines)}
                onToggle={(machineId) => chooseMachine(exercise, machineId)}
                onAddMachine={(file, caption) => addMachine(exercise, file, caption)}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [search, bodyPart, equipment, customOnly]);

  useEffect(() => {
    let active = true;
    api.listAllMachinePhotos().then(
      (machines) => {
        if (active) setSavedMachines(machinesByExercise(machines));
      },
      // Without saved machines the picker still adds exercises; the logger offers machines.
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // Once the strip has opened, keep the exercise and its machines in view.
    if (!openMachinesId) return;
    const timer = window.setTimeout(
      () => {
        const list = listRef.current;
        const row = [...(list?.querySelectorAll<HTMLElement>('[data-exercise-id]') ?? [])].find(
          (item) => item.dataset.exerciseId === openMachinesId,
        );
        if (!list || !row) return;
        const listBox = list.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        const overflow = Math.min(rowBox.bottom - listBox.bottom, rowBox.top - listBox.top);
        if (overflow > 0) {
          list.scrollTo?.({
            top: list.scrollTop + overflow + 8,
            behavior: motionReduced() ? 'auto' : 'smooth',
          });
        }
      },
      motionReduced() ? 0 : 380,
    );
    return () => window.clearTimeout(timer);
  }, [openMachinesId]);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    const updateViewport = () => {
      const height = visualViewport?.height ?? window.innerHeight;
      const top = visualViewport?.offsetTop ?? 0;
      setViewport({
        height,
        top,
        keyboardVisible: initialViewportHeightRef.current - height > 100,
      });
    };

    updateViewport();
    visualViewport?.addEventListener('resize', updateViewport);
    visualViewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      visualViewport?.removeEventListener('resize', updateViewport);
      visualViewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  // A tall sheet: most of the screen, or the whole visible area above the keyboard.
  const pickerHeight = viewport.keyboardVisible
    ? Math.max(280, viewport.height - 24)
    : Math.min(704, viewport.height - 32);
  const viewportStyle = {
    '--exercise-picker-viewport-top': `${viewport.top}px`,
    '--exercise-picker-viewport-height': `${viewport.height}px`,
    '--exercise-picker-height': `${pickerHeight}px`,
  } as CSSProperties;

  return (
    <>
      <PopupDialog
        variant="sheet"
        size="tall"
        title={singleSelect ? 'Switch exercise' : 'Select exercise'}
        className={`exercise-picker${viewport.keyboardVisible ? ' keyboard-visible' : ''}`}
        style={viewportStyle}
        onClose={onClose}
      >
        <label className="exercise-search-wrap">
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            className="exercise-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search…"
          />
        </label>
        <div className="exercise-filter-selects">
          <select
            aria-label="Body part"
            value={bodyPart}
            onChange={(event) => setBodyPart(event.target.value as WorkoutCategory | 'all')}
          >
            <option value="all">Body part</option>
            {(
              [
                'push',
                'pull',
                'lower',
                'upper',
                'full_body',
                'cardio',
                'other',
              ] as WorkoutCategory[]
            ).map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
          <ExerciseEquipmentFilter
            exercises={exercises}
            value={equipment}
            onChange={setEquipment}
            customOnly={customOnly}
            onCustomOnlyChange={setCustomOnly}
          />
          <button
            type="button"
            className="create-exercise-trigger"
            aria-label="Create new exercise"
            aria-haspopup="dialog"
            onClick={() => {
              setCreateFromSearch(false);
              setCreateExerciseOpen(true);
            }}
          >
            +
          </button>
        </div>
        <div className="exercise-list" ref={listRef}>
          {sections.map(
            (section) =>
              section.exercises.length > 0 && (
                <section className="exercise-list-section" key={section.title}>
                  <h3>{section.title}</h3>
                  {section.exercises.map(renderExercise)}
                </section>
              ),
          )}
          {!visibleExerciseCount && (
            <div className="exercise-picker-empty">
              <p className="muted-empty">No exercises match that search.</p>
              {query && (
                <button
                  type="button"
                  className="exercise-picker-create"
                  aria-haspopup="dialog"
                  onClick={() => {
                    setCreateFromSearch(true);
                    setCreateExerciseOpen(true);
                  }}
                >
                  Create “{titleCase(query)}”
                </button>
              )}
            </div>
          )}
          {pickerError && <p className="inline-error">{pickerError}</p>}
        </div>
        <div className={`exercise-picker-actions ${singleSelect ? 'single-action' : ''}`}>
          {!singleSelect && (
            <button
              className="create-superset-button"
              type="button"
              disabled={selectedIds.length < 2}
              onClick={() =>
                onCreateSuperset?.(
                  itemsInSelectionOrder(exercises, selectedIds),
                  resolvedMachineChoices,
                )
              }
            >
              Add{' '}
              {selectedIds.length > 2
                ? supersetGroupName(selectedIds.length).toLowerCase()
                : 'superset'}
            </button>
          )}
          <button
            className="add-selected-button"
            type="button"
            disabled={!selectedIds.length}
            onClick={() =>
              onChoose(itemsInSelectionOrder(exercises, selectedIds), resolvedMachineChoices)
            }
          >
            {singleSelect ? (
              'Swap exercise'
            ) : (
              <>
                <span>Add selected exercises</span> <b>{selectedIds.length}</b>
              </>
            )}
          </button>
        </div>
      </PopupDialog>
      {createExerciseOpen && (
        <CreateExerciseDialog
          exercises={exercises}
          categoryLabels={CATEGORY_LABELS}
          initialName={createFromSearch ? titleCase(query) : query}
          initialCategory={
            bodyPart !== 'all' ? bodyPart : createFromSearch ? (workoutCategory ?? '') : ''
          }
          viewportHeight={viewport.height}
          viewportTop={viewport.top}
          onCreate={onCreateExercise}
          onCreated={(exercise) => {
            setCreateExerciseOpen(false);
            setPickerError(null);
            setBodyPart('all');
            setCustomOnly(false);
            setEquipment('');
            setSearch(exercise.name);
            setSelectedIds((current) =>
              singleSelect ? [exercise.id] : [...new Set([...current, exercise.id])],
            );
          }}
          onClose={() => setCreateExerciseOpen(false)}
        />
      )}
    </>
  );
}
