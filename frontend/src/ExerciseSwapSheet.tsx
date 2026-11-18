import { useMemo, useState } from 'react';
import { exerciseIconFor } from './exerciseIcons';
import { formatLastDone } from './exerciseLastDone';
import {
  rankSwapAlternatives,
  SAME_MUSCLES_MATCH,
  swapMuscleCreditList,
  swapMuscleCredits,
  type SwapAlternative,
} from './exerciseSwap';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import type { Exercise } from './types';
import { localDate } from './utils';
import './exerciseSwap.css';

const ALL_EQUIPMENT = 'All';

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function MuscleChips({ original, alternative }: { original: Exercise; alternative: Exercise }) {
  const trained = swapMuscleCreditList(alternative);
  const trainedKeys = swapMuscleCredits(alternative);
  const missing = swapMuscleCreditList(original).filter(
    ({ muscle }) => !trainedKeys.has(muscle.toLowerCase()),
  );
  if (!trained.length) return null;
  return (
    <span className="exercise-swap-muscles">
      {trained.map(({ muscle, sets }) => (
        <span key={muscle} className={sets >= 1 ? 'full' : 'partial'}>
          {muscle}
          {sets < 1 && (
            <>
              <span aria-hidden="true"> ½</span>
              <span className="sr-only"> (half set)</span>
            </>
          )}
        </span>
      ))}
      {missing.map(({ muscle }) => (
        <span key={muscle} className="missing">
          <span className="sr-only">Not </span>
          {muscle}
        </span>
      ))}
    </span>
  );
}

/** Pick a replacement for an exercise mid-workout, ranked by its muscle-credit overlap. */
export function ExerciseSwapSheet({
  exercise,
  plannedSetCount,
  loggedSetCount,
  exercises,
  excludedIds,
  recentExerciseIds,
  lastDoneDates,
  onChoose,
  onBrowseAll,
  onClose,
}: {
  exercise: Exercise;
  plannedSetCount: number;
  loggedSetCount: number;
  exercises: Exercise[];
  excludedIds: string[];
  recentExerciseIds: string[];
  lastDoneDates?: ReadonlyMap<string, string>;
  onChoose: (exercise: Exercise) => void;
  onBrowseAll: () => void;
  onClose: () => void;
}) {
  const [today] = useState(localDate);
  const [equipment, setEquipment] = useState(ALL_EQUIPMENT);
  const alternatives = useMemo(
    () => rankSwapAlternatives(exercise, exercises, { excludedIds, recentExerciseIds }),
    [exercise, exercises, excludedIds, recentExerciseIds],
  );
  const equipmentOptions = useMemo(
    () => [...new Set(alternatives.map((item) => item.equipment))].sort(),
    [alternatives],
  );
  const shown = alternatives.filter(
    (item) => equipment === ALL_EQUIPMENT || item.equipment === equipment,
  );
  const cardio = exercise.kind === 'cardio';
  const groups: { label: string; items: SwapAlternative[] }[] = cardio
    ? [{ label: 'Other cardio', items: shown }]
    : [
        {
          label: 'Same muscles',
          items: shown.filter((item) => (item.match ?? 0) >= SAME_MUSCLES_MATCH),
        },
        {
          label: 'Close match',
          items: shown.filter((item) => (item.match ?? 0) < SAME_MUSCLES_MATCH),
        },
      ];
  const carry = [
    plannedSetCount ? `${plural(plannedSetCount, 'planned set')} move across` : null,
    loggedSetCount
      ? `${plural(loggedSetCount, 'logged set')} ${loggedSetCount === 1 ? 'stays' : 'stay'}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <PopupDialog
      title={`Swap ${exercise.name}`}
      className="exercise-swap-sheet"
      closeLabel={<Icon name="close" />}
      swipeToDismiss
      onClose={onClose}
    >
      <div className="exercise-swap-body">
        {carry && <p className="exercise-swap-carry">{carry}</p>}
        {equipmentOptions.length > 1 && (
          <div className="exercise-swap-filters" role="group" aria-label="Equipment">
            {[ALL_EQUIPMENT, ...equipmentOptions].map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={equipment === option}
                onClick={() => setEquipment(option)}
              >
                {option}
              </button>
            ))}
          </div>
        )}
        {groups.map(
          (group) =>
            group.items.length > 0 && (
              <section key={group.label} aria-label={group.label}>
                <h3 className="exercise-swap-group">{group.label}</h3>
                <ul className="exercise-swap-list">
                  {group.items.map(({ exercise: alternative, match, equipment: kit }) => {
                    const lastDone = lastDoneDates?.get(alternative.id);
                    return (
                      <li key={alternative.id}>
                        <button
                          type="button"
                          className="exercise-swap-option"
                          onClick={() => onChoose(alternative)}
                        >
                          <span className="exercise-icon" aria-hidden="true">
                            <img src={exerciseIconFor(alternative)} alt="" />
                          </span>
                          <span className="exercise-swap-copy">
                            <span className="exercise-swap-title">
                              <strong>{alternative.name}</strong>
                              {match !== null && (
                                <span
                                  className={`exercise-swap-match ${match >= SAME_MUSCLES_MATCH ? 'same' : 'close'}`}
                                >
                                  {match}%<span className="sr-only"> muscle match</span>
                                </span>
                              )}
                            </span>
                            <small className="exercise-swap-meta">
                              <span>{kit}</span>
                              {lastDone && (
                                <span>
                                  <Icon name="calendar" />
                                  <span className="sr-only">Last done </span>
                                  {formatLastDone(lastDone, today)}
                                </span>
                              )}
                            </small>
                            <MuscleChips original={exercise} alternative={alternative} />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ),
        )}
        {!shown.length && (
          <p className="exercise-swap-empty">
            {alternatives.length ? 'No matches with this equipment' : 'No close alternatives'}
          </p>
        )}
        <button type="button" className="exercise-swap-browse" onClick={onBrowseAll}>
          <Icon name="search" />
          Browse all exercises
        </button>
      </div>
    </PopupDialog>
  );
}
