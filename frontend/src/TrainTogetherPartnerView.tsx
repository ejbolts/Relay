import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api, isConnectionFailure } from './api';
import { Icon } from './Icon';
import { motionReduced } from './motion';
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
import {
  formatWeightNumber,
  weightInputKg,
  weightInputValue,
  weightUnitName,
  type WeightUnit,
} from './weightUnits';
import type { ActiveWorkoutDraft, StoredDraftMovement, StoredDraftSet } from './workoutDraft';
import { activeElapsedSeconds, draftPause } from './workoutPause';

const MAX_PARTNER_WEIGHT_KG = 10_000;
const MAX_PARTNER_REPS = 10_000;

type NumericParseResult =
  | { kind: 'valid'; value: number | null }
  | { kind: 'incomplete' }
  | { kind: 'invalid'; message: string };

function parsePartnerWeightInput(
  raw: string,
  unit: WeightUnit,
  originalKg: number | null,
): NumericParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { kind: 'valid', value: null };
  if (/^\d*[.,]$/.test(trimmed)) return { kind: 'incomplete' };
  if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(trimmed)) {
    return {
      kind: 'invalid',
      message: `Enter a weight between 0 and ${formatWeightNumber(MAX_PARTNER_WEIGHT_KG, unit, 0)} ${unit}.`,
    };
  }
  const kg = weightInputKg(trimmed, unit, originalKg);
  if (kg === null || !Number.isFinite(kg) || kg < 0 || kg > MAX_PARTNER_WEIGHT_KG) {
    return {
      kind: 'invalid',
      message: `Weight must be between 0 and ${formatWeightNumber(MAX_PARTNER_WEIGHT_KG, unit, 0)} ${unit}.`,
    };
  }
  return { kind: 'valid', value: kg };
}

function parsePartnerRepsInput(raw: string): NumericParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { kind: 'valid', value: null };
  if (!/^\d+$/.test(trimmed)) {
    return {
      kind: 'invalid',
      message: `Reps must be a whole number between 0 and ${MAX_PARTNER_REPS.toLocaleString('en-US')}.`,
    };
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_PARTNER_REPS) {
    return {
      kind: 'invalid',
      message: `Reps must be a whole number between 0 and ${MAX_PARTNER_REPS.toLocaleString('en-US')}.`,
    };
  }
  return { kind: 'valid', value: parsed };
}

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
  pendingSync,
  onUpdate,
  onRemove,
}: {
  set: StoredDraftSet;
  label: string;
  warmup: boolean;
  exerciseName: string;
  weightUnit: WeightUnit;
  pendingSync: boolean;
  onUpdate: (patch: Partial<Omit<StoredDraftSet, 'key'>>) => void;
  onRemove: () => void;
}) {
  const [weightFocused, setWeightFocused] = useState(false);
  const [repsFocused, setRepsFocused] = useState(false);
  const [weightText, setWeightText] = useState(() => weightInputValue(set.weight_kg, weightUnit));
  const [repsText, setRepsText] = useState(() => (set.reps === null ? '' : String(set.reps)));
  const [weightError, setWeightError] = useState<string | null>(null);
  const [repsError, setRepsError] = useState<string | null>(null);
  const errorId = useId();

  // Keep input text in sync with remote updates when not focused and not holding invalid local input.
  useEffect(() => {
    if (!weightFocused) {
      setWeightText(weightInputValue(set.weight_kg, weightUnit));
      setWeightError(null);
    }
  }, [set.weight_kg, weightUnit, weightFocused]);

  useEffect(() => {
    if (!repsFocused) {
      setRepsText(set.reps === null ? '' : String(set.reps));
      setRepsError(null);
    }
  }, [set.reps, repsFocused]);

  const localDone = set.completed === true;
  const isSavedDone = localDone && !pendingSync;

  const rowClass = [
    'tt-partner-set-row',
    pendingSync ? 'is-pending' : isSavedDone ? 'is-done' : '',
    warmup ? 'is-warmup' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const fieldError = weightError ?? repsError;

  return (
    <div className="tt-partner-set-entry">
      <div className={rowClass} data-set-key={set.key}>
        <span className="tt-partner-set-num num" aria-label={warmup ? 'Warm-up set' : `Set ${label}`}>
          {label}
        </span>
        <input
          type="text"
          inputMode="decimal"
          className={`tt-partner-input num${weightError ? ' is-invalid' : ''}`}
          value={weightText}
          placeholder="–"
          aria-label={`${exerciseName} set ${label} weight in ${weightUnitName(weightUnit)}`}
          aria-invalid={weightError ? true : undefined}
          aria-describedby={weightError ? errorId : undefined}
          onFocus={() => setWeightFocused(true)}
          onBlur={() => {
            setWeightFocused(false);
            const checked = parsePartnerWeightInput(weightText, weightUnit, set.weight_kg);
            if (checked.kind === 'valid') {
              setWeightError(null);
              setWeightText(weightInputValue(checked.value, weightUnit));
            } else if (checked.kind === 'incomplete') {
              setWeightError(
                `Enter a weight between 0 and ${formatWeightNumber(MAX_PARTNER_WEIGHT_KG, weightUnit, 0)} ${weightUnit}.`,
              );
            } else {
              setWeightError(checked.message);
            }
          }}
          onChange={(event) => {
            const next = event.target.value;
            setWeightText(next);
            const checked = parsePartnerWeightInput(next, weightUnit, set.weight_kg);
            if (checked.kind === 'valid') {
              setWeightError(null);
              if (checked.value !== set.weight_kg) onUpdate({ weight_kg: checked.value });
            } else if (checked.kind === 'incomplete') {
              setWeightError(null);
            } else {
              setWeightError(checked.message);
            }
          }}
        />
        <input
          type="text"
          inputMode="numeric"
          className={`tt-partner-input num${repsError ? ' is-invalid' : ''}`}
          value={repsText}
          placeholder="–"
          aria-label={`${exerciseName} set ${label} reps`}
          aria-invalid={repsError ? true : undefined}
          aria-describedby={repsError ? errorId : undefined}
          onFocus={() => setRepsFocused(true)}
          onBlur={() => {
            setRepsFocused(false);
            const checked = parsePartnerRepsInput(repsText);
            if (checked.kind === 'valid') {
              setRepsError(null);
              setRepsText(checked.value === null ? '' : String(checked.value));
            } else if (checked.kind === 'invalid') {
              setRepsError(checked.message);
            }
          }}
          onChange={(event) => {
            const next = event.target.value;
            setRepsText(next);
            const checked = parsePartnerRepsInput(next);
            if (checked.kind === 'valid') {
              setRepsError(null);
              if (checked.value !== set.reps) onUpdate({ reps: checked.value });
            } else if (checked.kind === 'invalid') {
              setRepsError(checked.message);
            }
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
          className={`tt-partner-tick${pendingSync ? ' is-pending' : isSavedDone ? ' is-done' : ''}`}
          aria-label={
            pendingSync
              ? `Saving ${exerciseName} set ${label}`
              : isSavedDone
                ? `Mark ${exerciseName} set ${label} incomplete`
                : `Complete ${exerciseName} set ${label}`
          }
          aria-pressed={pendingSync ? 'mixed' : isSavedDone ? true : false}
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
      {fieldError && (
        <p id={errorId} className="tt-partner-field-error" role="alert">
          {fieldError}
        </p>
      )}
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
  const bannerRef = useRef<HTMLDivElement>(null);

  const name = memberName(partner);
  const draft = syncState?.draft ?? partner.workout?.draft ?? null;
  const pause = draftPause(draft);
  const paused = Boolean(draft && pause.pausedAt !== null);
  const now = useNow(Boolean(draft) && !paused, 1000);
  const vars = partnerCssVars(palette) as CSSProperties;

  // Move focus into the partner banner on entry so screen readers announce whose sets are edited.
  useEffect(() => {
    bannerRef.current?.focus({ preventScroll: true });
  }, [partner.user_id]);

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

  const savedDraft = acknowledgedDraft === undefined ? draft : acknowledgedDraft;
  const sessionElapsed = draft ? activeElapsedSeconds(draft.startedAt, pause, now) : 0;
  const elapsedSeconds = !draft
    ? 0
    : draft.durationOverrideMinutes != null
      ? draft.durationOverrideMinutes * 60
      : (draft.previousDurationMinutes ?? 0) * 60 + sessionElapsed;
  const totalDoneSets = (savedDraft?.movements ?? []).reduce(
    (sum, movement) => sum + movement.sets.filter((s) => s.completed === true).length,
    0,
  );
  const workoutTitle = draft?.name?.trim() || 'workout';
  const showOfflineBar = syncState?.status === 'failed' && isConnectionFailure(syncState.error);
  const refusalMessage =
    syncState?.status === 'failed' && !showOfflineBar
      ? syncState.error instanceof Error
        ? syncState.error.message
        : 'That change could not be saved.'
      : null;

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
        <div
          ref={bannerRef}
          tabIndex={-1}
          className="tt-partner-banner"
          role="region"
          aria-label={loggingForLabel(name)}
        >
          <TrainTogetherAvatar person={partner} size="md" palette={palette} variant="solid" />
          <strong className="tt-partner-banner-label">{loggingForLabel(name)}</strong>
          <button type="button" className="tt-back-mine-btn" onClick={onBackToMine}>
            <Icon name="chevron-left" />
            <span>Back to mine</span>
          </button>
        </div>

        {showOfflineBar && (
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
        {refusalMessage && (
          <div className="tt-partner-offline-bar" role="alert">
            <span className="tt-partner-offline-copy">
              <span>{refusalMessage}</span>
            </span>
          </div>
        )}

        <header className="tt-partner-header">
          <h1>{`${name}’s ${workoutTitle}`}</h1>
          <div className="tt-partner-meta num">
            <span className={`tt-partner-live${paused ? ' is-paused' : ''}`}>
              <span className="tt-partner-live-dot" aria-hidden="true" />
              {paused ? `Paused ${formatElapsed(elapsedSeconds)}` : `Live ${formatElapsed(elapsedSeconds)}`}
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
                const canRemoveMovement = Boolean(viewerAddedMovementKeys?.has(movement.key));
                const ackMovement = ackMovementByKey.get(movement.key);
                const savedSets =
                  acknowledgedDraft === undefined ? movement.sets : (ackMovement?.sets ?? []);
                const doneCount = savedSets.filter((s) => s.completed === true).length;

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
                          onClick={() => {
                            const at = Date.now();
                            void onEdit((current) =>
                              removePartnerMovement(current, movement.key, at),
                            );
                          }}
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
                            const pendingSync =
                              acknowledgedDraft !== undefined &&
                              (!ackSet ||
                                ackSet.completed !== set.completed ||
                                (ackSet.weight_kg ?? null) !== (set.weight_kg ?? null) ||
                                (ackSet.reps ?? null) !== (set.reps ?? null));
                            return (
                              <PartnerSetRow
                                key={set.key}
                                set={set}
                                label={label}
                                warmup={warmup}
                                exerciseName={exerciseName}
                                weightUnit={weightUnit}
                                pendingSync={pendingSync}
                                onUpdate={(patch) => {
                                  const at = Date.now();
                                  void onEdit((current) =>
                                    updatePartnerSet(current, movement.key, set.key, patch, at),
                                  );
                                }}
                                onRemove={() => {
                                  const at = Date.now();
                                  void onEdit((current) =>
                                    removePartnerSet(current, movement.key, set.key, at),
                                  );
                                }}
                              />
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          className="tt-partner-add-set"
                          onClick={() => {
                            const newSetKey = crypto.randomUUID();
                            const at = Date.now();
                            void onEdit((current) =>
                              addPartnerSet(current, movement.key, newSetKey, at),
                            );
                          }}
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
                const target = [
                  ...document.querySelectorAll<HTMLElement>('[data-partner-exercise-id]'),
                ].find((card) => card.dataset.partnerExerciseId === exercise.id);
                target?.scrollIntoView?.({
                  behavior: motionReduced() ? 'auto' : 'smooth',
                  block: 'center',
                });
                target?.focus?.({ preventScroll: true });
              });
              return;
            }
            onRegisterExercises([exercise]);
            const movementKey = crypto.randomUUID();
            const setKey = crypto.randomUUID();
            const at = Date.now();
            void onEdit(
              (current) => addPartnerMovement(current, exercise.id, { movementKey, setKey }, at),
              { movementKey, exercise },
            );
          }}
        />
      )}
    </div>
  );
}
