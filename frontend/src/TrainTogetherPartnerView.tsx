import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api } from './api';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { useNow } from './presence';
import {
  addPartnerMovement,
  addPartnerSet,
  loggingForLabel,
  memberName,
  removePartnerMovement,
  removePartnerSet,
  updatePartnerSet,
  type PartnerSyncState,
  type TrainExercise,
  type TrainMember,
} from './trainTogether';
import { TrainTogetherAvatar } from './TrainTogetherAvatar';
import { partnerCssVars, type PartnerPalette } from './trainTogetherTheme';
import { numberOrNull } from './appShared';
import { weightInputKg, weightInputValue, weightUnitName, type WeightUnit } from './weightUnits';
import type { ActiveWorkoutDraft, StoredDraftMovement, StoredDraftSet } from './workoutDraft';

function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function setBadgeLabel(sets: StoredDraftSet[], index: number): { label: string; warmup: boolean } {
  const item = sets[index];
  const warmup = item.set_type === 'warmup' || item.warmup === true;
  if (warmup) return { label: 'W', warmup: true };
  if (item.set_type === 'drop') return { label: 'D', warmup: false };
  if (item.failed) return { label: 'A', warmup: false };
  let working = 0;
  for (let i = 0; i <= index; i += 1) {
    const s = sets[i];
    if (s.set_type !== 'warmup' && s.warmup !== true) working += 1;
  }
  return { label: String(working), warmup: false };
}

function formatCardioSet(item: StoredDraftSet): string {
  const parts: string[] = [];
  if (item.duration_seconds && item.duration_seconds > 0) {
    parts.push(`${Math.max(1, Math.round(item.duration_seconds / 60))} min`);
  }
  if (item.distance_km && item.distance_km > 0) {
    parts.push(`${Number(item.distance_km.toFixed(1))} km`);
  }
  return parts.join(' · ') || 'Logged';
}

function PartnerSetRow({
  set,
  label,
  warmup,
  exerciseName,
  weightUnit,
  acknowledgedDone,
  onUpdate,
  onRemove,
}: {
  set: StoredDraftSet;
  label: string;
  warmup: boolean;
  exerciseName: string;
  weightUnit: WeightUnit;
  acknowledgedDone: boolean;
  onUpdate: (patch: Partial<Omit<StoredDraftSet, 'key'>>) => void;
  onRemove: () => void;
}) {
  const [weightFocused, setWeightFocused] = useState(false);
  const [repsFocused, setRepsFocused] = useState(false);
  const [weightText, setWeightText] = useState(() => weightInputValue(set.weight_kg, weightUnit));
  const [repsText, setRepsText] = useState(() => (set.reps === null ? '' : String(set.reps)));

  // Keep input text in sync with remote updates only while that field is NOT being typed in.
  useEffect(() => {
    if (!weightFocused) {
      setWeightText(weightInputValue(set.weight_kg, weightUnit));
    }
  }, [set.weight_kg, weightUnit, weightFocused]);

  useEffect(() => {
    if (!repsFocused) {
      setRepsText(set.reps === null ? '' : String(set.reps));
    }
  }, [set.reps, repsFocused]);

  const localDone = set.completed === true;
  const pendingDone = localDone && !acknowledgedDone;

  const rowClass = [
    'tt-partner-set-row',
    acknowledgedDone ? 'is-done' : pendingDone ? 'is-pending' : '',
    warmup ? 'is-warmup' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rowClass} data-set-key={set.key}>
      <span className="tt-partner-set-num num" aria-label={warmup ? 'Warm-up set' : `Set ${label}`}>
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        className="tt-partner-input num"
        value={weightText}
        placeholder="–"
        aria-label={`${exerciseName} set ${label} weight in ${weightUnitName(weightUnit)}`}
        onFocus={() => setWeightFocused(true)}
        onBlur={() => {
          setWeightFocused(false);
          setWeightText(weightInputValue(set.weight_kg, weightUnit));
        }}
        onChange={(event) => {
          const next = event.target.value;
          setWeightText(next);
          if (next.trim() === '') {
            onUpdate({ weight_kg: null });
            return;
          }
          const kg = weightInputKg(next, weightUnit, set.weight_kg);
          if (kg !== null) onUpdate({ weight_kg: kg });
        }}
      />
      <input
        type="text"
        inputMode="numeric"
        className="tt-partner-input num"
        value={repsText}
        placeholder="–"
        aria-label={`${exerciseName} set ${label} reps`}
        onFocus={() => setRepsFocused(true)}
        onBlur={() => {
          setRepsFocused(false);
          setRepsText(set.reps === null ? '' : String(set.reps));
        }}
        onChange={(event) => {
          const next = event.target.value;
          setRepsText(next);
          if (next.trim() === '') {
            onUpdate({ reps: null });
            return;
          }
          const parsed = numberOrNull(next);
          if (parsed !== null && parsed >= 0) onUpdate({ reps: Math.round(parsed) });
        }}
      />
      <span
        className="tt-partner-rpe num"
        aria-label={set.rpe !== null ? `RPE ${set.rpe}` : undefined}
      >
        {set.rpe !== null ? set.rpe : '–'}
      </span>
      <button
        type="button"
        className={`tt-partner-tick${acknowledgedDone ? ' is-done' : pendingDone ? ' is-pending' : ''}`}
        aria-label={
          acknowledgedDone
            ? `Mark ${exerciseName} set ${label} incomplete`
            : pendingDone
              ? `Saving ${exerciseName} set ${label}`
              : `Complete ${exerciseName} set ${label}`
        }
        aria-pressed={acknowledgedDone ? true : pendingDone ? 'mixed' : false}
        onClick={() => onUpdate({ completed: !localDone })}
      >
        <Icon name="check" />
      </button>
      <button
        type="button"
        className="tt-partner-remove-set"
        aria-label={`Remove set ${label} from ${exerciseName}`}
        onClick={onRemove}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}

function PartnerExercisePicker({
  partnerId,
  partnerName,
  existingExerciseIds,
  onSelect,
  onClose,
}: {
  partnerId: string;
  partnerName: string;
  existingExerciseIds: ReadonlySet<string>;
  onSelect: (exercise: TrainExercise) => void;
  onClose: () => void;
}) {
  const [exercises, setExercises] = useState<TrainExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void api.trainTogether
      .partnerExercises(partnerId)
      .then((list) => {
        if (!cancelled) setExercises(list);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error ? reason.message : `Could not load ${partnerName}'s exercises.`,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [partnerId, partnerName]);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!exercises) return [];
    if (!query) return exercises;
    return exercises.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.muscle_group.toLowerCase().includes(query) ||
        (item.equipment?.toLowerCase().includes(query) ?? false),
    );
  }, [exercises, query]);

  return (
    <PopupDialog
      variant="sheet"
      size="tall"
      title={`Add exercise for ${partnerName}`}
      className="tt-partner-picker"
      onClose={onClose}
    >
      <div className="tt-partner-picker-body">
        <label className="tt-partner-picker-search">
          <Icon name="search" />
          <input
            type="search"
            value={search}
            placeholder={`Search ${partnerName}’s exercises…`}
            aria-label={`Search ${partnerName}'s exercises`}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : exercises === null ? (
          <p className="tt-partner-picker-status" role="status">
            Loading exercises…
          </p>
        ) : filtered.length === 0 ? (
          <p className="tt-partner-picker-status">No matching exercises.</p>
        ) : (
          <ul className="tt-partner-picker-list">
            {filtered.map((exercise) => {
              const alreadyIn = existingExerciseIds.has(exercise.id);
              return (
                <li key={exercise.id}>
                  <button
                    type="button"
                    className={`tt-partner-picker-item${alreadyIn ? ' is-in-workout' : ''}`}
                    onClick={() => onSelect(exercise)}
                  >
                    <strong>
                      {exercise.name}
                      {alreadyIn && <span className="tt-partner-in-tag">In workout</span>}
                    </strong>
                    <small>
                      {[exercise.muscle_group, exercise.equipment].filter(Boolean).join(' · ')}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PopupDialog>
  );
}

/**
 * Option A Partner Mode ("Logging for {Name}"): perimeter accent frame, solid sticky banner with
 * "Back to mine", tinted partner header (no Rest / ⋯ / Finish), offline/retry bar, and dedicated
 * partner movement cards.
 */
export function TrainTogetherPartnerView({
  partner,
  palette,
  syncState,
  acknowledgedDraft,
  extraExercises,
  viewerAddedMovementKeys,
  weightUnit,
  onEdit,
  onRetry,
  onRegisterExercises,
  onBackToMine,
}: {
  partner: TrainMember;
  palette: PartnerPalette;
  syncState?: PartnerSyncState;
  acknowledgedDraft?: ActiveWorkoutDraft | null;
  extraExercises?: ReadonlyMap<string, TrainExercise>;
  viewerAddedMovementKeys?: ReadonlySet<string>;
  weightUnit: WeightUnit;
  onEdit: (
    change: (draft: ActiveWorkoutDraft) => ActiveWorkoutDraft,
    addedExercise?: { movementKey: string; exercise: TrainExercise },
  ) => Promise<void>;
  onRetry: () => Promise<void>;
  onRegisterExercises: (exercises: TrainExercise[]) => void;
  onBackToMine: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const now = useNow(true, 1000);

  const name = memberName(partner);
  const draft = syncState?.draft ?? partner.workout?.draft ?? null;
  const vars = partnerCssVars(palette) as CSSProperties;

  const exerciseLookup = useMemo(() => {
    const map = new Map<string, TrainExercise>();
    for (const item of partner.workout?.exercises ?? []) map.set(item.id, item);
    for (const item of syncState?.exercises ?? []) map.set(item.id, item);
    if (extraExercises) {
      for (const [id, item] of extraExercises.entries()) map.set(id, item);
    }
    return map;
  }, [partner.workout?.exercises, syncState?.exercises, extraExercises]);

  const ackMovementByKey = useMemo(() => {
    const map = new Map<string, StoredDraftMovement>();
    for (const m of acknowledgedDraft?.movements ?? []) map.set(m.key, m);
    return map;
  }, [acknowledgedDraft]);

  const elapsedSeconds = draft
    ? Math.max(0, Math.floor((now - draft.startedAt - (draft.pausedMs ?? 0)) / 1000))
    : 0;
  const totalDoneSets = (draft?.movements ?? []).reduce(
    (sum, movement) => sum + movement.sets.filter((s) => s.completed === true).length,
    0,
  );
  const workoutTitle = draft?.name?.trim() || 'workout';
  const showFailedBar = syncState?.status === 'failed';

  const existingExerciseIds = useMemo(
    () => new Set((draft?.movements ?? []).map((m) => m.exerciseId)),
    [draft],
  );

  async function handleRetry() {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="tt-partner-view" style={vars}>
      <div className="tt-partner-frame-overlay" aria-hidden="true" />
      <div className="tt-partner-sticky-top">
        <div className="tt-partner-banner" role="region" aria-label={loggingForLabel(name)}>
          <TrainTogetherAvatar person={partner} size="md" palette={palette} variant="solid" />
          <strong className="tt-partner-banner-label">{loggingForLabel(name)}</strong>
          <button type="button" className="tt-back-mine-btn" onClick={onBackToMine}>
            <Icon name="chevron-left" />
            <span>Back to mine</span>
          </button>
        </div>

        {showFailedBar && (
          <div className="tt-partner-offline-bar" role="alert">
            <span className="tt-partner-offline-copy">
              <Icon name="cloud-off" />
              <span>Offline · Unsent change</span>
            </span>
            <button
              type="button"
              className="tt-partner-retry-btn"
              disabled={retrying}
              onClick={() => void handleRetry()}
            >
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}

        <header className="tt-partner-header">
          <h1>{`${name}’s ${workoutTitle}`}</h1>
          <div className="tt-partner-meta num">
            <span className="tt-partner-live">
              <span className="tt-partner-live-dot" aria-hidden="true" />
              Live {formatElapsed(elapsedSeconds)}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {totalDoneSets} {totalDoneSets === 1 ? 'set' : 'sets'}
            </span>
          </div>
        </header>
      </div>

      <div className="tt-partner-body">
        {!draft ? (
          <div className="tt-partner-empty pulse-card">
            <p>{name} has no workout open.</p>
            <button
              type="button"
              className="pulse-button secondary tt-full-btn"
              onClick={onBackToMine}
            >
              Back to mine
            </button>
          </div>
        ) : (
          <>
            <div className="tt-partner-movements">
              {draft.movements.map((movement, movementIndex) => {
                const exercise = exerciseLookup.get(movement.exerciseId) ?? null;
                const exerciseName = exercise?.name ?? 'Exercise';
                const isCardio = exercise?.kind === 'cardio';
                const doneCount = movement.sets.filter((s) => s.completed === true).length;
                const canRemoveMovement = Boolean(viewerAddedMovementKeys?.has(movement.key));
                const ackMovement = ackMovementByKey.get(movement.key);

                return (
                  <article
                    className="tt-partner-card"
                    key={movement.key}
                    data-partner-exercise-id={movement.exerciseId}
                    tabIndex={-1}
                  >
                    <header className="tt-partner-card-head">
                      <span className="tt-partner-ex-badge" aria-hidden="true">
                        <Icon name={isCardio ? 'pulse' : 'pulse'} />
                        <b>{movementIndex + 1}</b>
                      </span>
                      <div className="tt-partner-card-copy">
                        <h2>{exerciseName}</h2>
                        <p className="num">
                          {isCardio
                            ? `${name}’s cardio · read-only`
                            : `${name}’s sets · ${doneCount} done`}
                        </p>
                      </div>
                      {canRemoveMovement && (
                        <button
                          type="button"
                          className="tt-partner-remove-ex"
                          aria-label={`Remove ${exerciseName} from ${name}'s workout`}
                          onClick={() =>
                            void onEdit((current) =>
                              removePartnerMovement(current, movement.key, Date.now()),
                            )
                          }
                        >
                          <Icon name="trash" />
                        </button>
                      )}
                    </header>

                    {isCardio ? (
                      <div className="tt-partner-cardio">
                        {movement.sets.filter((s) => s.completed === true).length > 0 ? (
                          <ul className="tt-partner-cardio-list num">
                            {movement.sets
                              .filter((s) => s.completed === true)
                              .map((s, idx) => (
                                <li key={s.key}>
                                  <span>Set {idx + 1}</span>
                                  <strong>{formatCardioSet(s)}</strong>
                                </li>
                              ))}
                          </ul>
                        ) : (
                          <p className="tt-partner-cardio-empty">No cardio sets logged yet.</p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="tt-partner-set-cols" aria-hidden="true">
                          <span>Set</span>
                          <span>Weight ({weightUnit})</span>
                          <span>Reps</span>
                          <span>RPE</span>
                          <span />
                          <span />
                        </div>
                        <div className="tt-partner-sets">
                          {movement.sets.map((set, setIndex) => {
                            const { label, warmup } = setBadgeLabel(movement.sets, setIndex);
                            const ackSet = ackMovement?.sets.find((s) => s.key === set.key);
                            const acknowledgedDone =
                              set.completed === true && ackSet?.completed === true;
                            return (
                              <PartnerSetRow
                                key={set.key}
                                set={set}
                                label={label}
                                warmup={warmup}
                                exerciseName={exerciseName}
                                weightUnit={weightUnit}
                                acknowledgedDone={acknowledgedDone}
                                onUpdate={(patch) =>
                                  void onEdit((current) =>
                                    updatePartnerSet(
                                      current,
                                      movement.key,
                                      set.key,
                                      patch,
                                      Date.now(),
                                    ),
                                  )
                                }
                                onRemove={() =>
                                  void onEdit((current) =>
                                    removePartnerSet(current, movement.key, set.key, Date.now()),
                                  )
                                }
                              />
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          className="tt-partner-add-set"
                          onClick={() =>
                            void onEdit((current) =>
                              addPartnerSet(current, movement.key, crypto.randomUUID(), Date.now()),
                            )
                          }
                        >
                          + Add set
                        </button>
                      </>
                    )}
                  </article>
                );
              })}
            </div>

            <button type="button" className="tt-partner-add-ex" onClick={() => setPickerOpen(true)}>
              + Add exercise for {name}
            </button>
          </>
        )}
      </div>

      {pickerOpen && (
        <PartnerExercisePicker
          partnerId={partner.user_id}
          partnerName={name}
          existingExerciseIds={existingExerciseIds}
          onClose={() => setPickerOpen(false)}
          onSelect={(exercise) => {
            setPickerOpen(false);
            if (existingExerciseIds.has(exercise.id)) {
              window.requestAnimationFrame(() => {
                const target = document.querySelector<HTMLElement>(
                  `[data-partner-exercise-id="${CSS.escape(exercise.id)}"]`,
                );
                target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
                target?.focus?.({ preventScroll: true });
              });
              return;
            }
            onRegisterExercises([exercise]);
            const movementKey = crypto.randomUUID();
            const setKey = crypto.randomUUID();
            void onEdit(
              (current) =>
                addPartnerMovement(current, exercise.id, { movementKey, setKey }, Date.now()),
              { movementKey, exercise },
            );
          }}
        />
      )}
    </div>
  );
}
