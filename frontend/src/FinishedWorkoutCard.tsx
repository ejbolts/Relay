import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { Icon, type IconName } from './Icon';
import { RepRangeDialog } from './RepRangeDialog';
import { activeRoutineWithout } from './routineRepRange';
import { formatVolume } from './trainingSummary';
import { formatWeight } from './weightUnits';
import { useWeightUnit } from './trainingPreferencesContext';
import { useWorkoutShareReminder } from './useWorkoutShareReminder';
import type { FinishSummary } from './finishSummary';
import type { Routine } from './types';
import './weeklyReview.css';
import './finishedWorkout.css';

function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ''}`;
}

/** How long "Workout saved" stays up after finishing, with its Undo and Share. */
export const WORKOUT_SAVED_TOAST_MS = 6000;

function Delta({ value, label }: { value: number; label: string }) {
  if (!value) return null;
  return (
    <span className={`weekly-delta ${value > 0 ? 'is-good' : 'is-neutral'}`}>
      {value > 0 ? '+' : '−'}
      {label}
    </span>
  );
}

/**
 * Home's record of the workout just finished. It is built on the device, so it is there the
 * moment the workout closes, and it points at the one or two things worth doing next.
 */
export function FinishedWorkoutCard({
  summary,
  records = [],
  onDismiss,
  onOpenWorkout,
  onCompareMachines,
  onNotice,
  onShare,
  onUndo,
}: {
  summary: FinishSummary;
  /** Records this workout set, known once it has synced. */
  records?: { id: string; exercise: string; detail: string }[];
  onDismiss: () => void;
  onOpenWorkout: () => void;
  onCompareMachines: (exerciseId: string) => void;
  onNotice: (message: string) => void;
  /** Opens the share card; available once the workout has saved. */
  onShare?: () => void;
  /** Resumes the workout just finished; available once it has saved. */
  onUndo?: () => void;
}) {
  const unit = useWeightUnit();
  const [shareReminder] = useWorkoutShareReminder();
  // A workout finished moments ago gets a brief "Workout saved" with Undo (and Share, when the
  // sharing reminder is on); returning to Home later shows the card alone.
  const [savedToast, setSavedToast] = useState(
    () => Date.now() - summary.finishedAt < WORKOUT_SAVED_TOAST_MS,
  );
  useEffect(() => {
    if (!savedToast) return;
    const timer = window.setTimeout(() => setSavedToast(false), WORKOUT_SAVED_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [savedToast]);
  const [machineExerciseId, setMachineExerciseId] = useState<string | null>(null);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [rangeFor, setRangeFor] = useState<FinishSummary['plateaus'][number] | null>(null);
  const [rangeSaved, setRangeSaved] = useState<string[]>([]);
  const machineChange = summary.machineChanges[0];
  const plateauIds = summary.plateaus.map((item) => item.exerciseId).join(',');

  // Comparing machines is only worth offering while their weights are not yet being compared.
  useEffect(() => {
    if (!machineChange) return;
    let cancelled = false;
    void api
      .getWeightMapping(machineChange.exerciseId)
      .then((mapping) => {
        if (!cancelled && !mapping.enabled && mapping.machines.length > 1)
          setMachineExerciseId(machineChange.exerciseId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [machineChange]);

  // A rep range can only be set on an exercise the active split plans without one.
  useEffect(() => {
    if (!plateauIds) return;
    let cancelled = false;
    void Promise.all([api.getTrainingSplit(), api.routines.list()])
      .then(([split, routines]) => {
        if (cancelled) return;
        setRoutine(routines.find((item) => item.id === split?.routine_id) ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [plateauIds]);

  const plateau = summary.plateaus.find(
    (item) =>
      !rangeSaved.includes(item.exerciseId) && activeRoutineWithout(routine, item.exerciseId),
  );
  const steps: {
    key: string;
    icon: IconName;
    name: string;
    detail: string;
    action: string;
    run: () => void;
  }[] = [];
  if (machineChange && machineExerciseId === machineChange.exerciseId)
    steps.push({
      key: 'machines',
      icon: 'trend',
      name: machineChange.exerciseName,
      detail: 'Different machine from last time',
      action: 'Compare machines',
      run: () => onCompareMachines(machineChange.exerciseId),
    });
  if (plateau)
    steps.push({
      key: 'range',
      icon: 'up',
      name: plateau.exerciseName,
      detail: `${formatWeight(plateau.weightKg, unit)} × ${plateau.reps}, three sessions running`,
      action: 'Set rep range',
      run: () => setRangeFor(plateau),
    });

  const previous = summary.previous;
  const setChange = previous ? summary.sets - previous.sets : 0;
  const volumeChange = previous ? summary.volumeKg - previous.volumeKg : 0;

  return (
    <section className="pulse-card finished-workout" aria-labelledby="finished-workout-title">
      <header>
        <div>
          <p className="section-kicker">WORKOUT FINISHED</p>
          <h2 id="finished-workout-title">{summary.name}</h2>
        </div>
        <div className="finished-workout-header-actions">
          <button
            type="button"
            className="icon-button-pulse finished-workout-share"
            aria-label="Share workout"
            disabled={!onShare}
            onClick={onShare}
          >
            <Icon name="share" />
          </button>
          <button
            type="button"
            className="icon-button-pulse finished-workout-close"
            aria-label="Dismiss workout summary"
            onClick={onDismiss}
          >
            <Icon name="close" />
          </button>
        </div>
      </header>
      <dl className="weekly-review-stats">
        <div>
          <dt>Time</dt>
          <dd>{summary.durationMinutes ? minutesLabel(summary.durationMinutes) : '–'}</dd>
        </div>
        <div>
          <dt>Sets</dt>
          <dd>
            {summary.sets || '–'}
            <Delta value={setChange} label={String(Math.abs(setChange))} />
          </dd>
        </div>
        <div>
          <dt>Volume</dt>
          <dd>
            {summary.volumeKg > 0 ? formatVolume(summary.volumeKg, unit) : '–'}
            <Delta value={volumeChange} label={formatVolume(Math.abs(volumeChange), unit)} />
          </dd>
        </div>
      </dl>
      {records.length > 0 && (
        <ul className="finished-workout-records" aria-label="New records">
          {records.map((record) => (
            <li key={record.id}>
              <span aria-hidden="true">
                <Icon name="trophy" />
              </span>
              <strong>{record.exercise}</strong>
              <small>{record.detail}</small>
            </li>
          ))}
        </ul>
      )}
      {steps.length > 0 && (
        <ul className="finished-workout-steps">
          {steps.map((step) => (
            <li key={step.key}>
              <button type="button" onClick={step.run}>
                <span className="finished-workout-step-icon" aria-hidden="true">
                  <Icon name={step.icon} />
                </span>
                <span className="finished-workout-step-copy">
                  <strong>{step.name}</strong>
                  <small>{step.detail}</small>
                  <span className="finished-workout-step-action">{step.action}</span>
                </span>
                <Icon name="chevron-right" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="text-button finished-workout-open" onClick={onOpenWorkout}>
        View workout
      </button>
      {savedToast &&
        createPortal(
          <div
            className="undo-toast top-toast workout-saved-toast"
            role="status"
            style={{ '--undo-toast-duration': `${WORKOUT_SAVED_TOAST_MS}ms` } as CSSProperties}
          >
            <span>Workout saved</span>
            {shareReminder && onShare && (
              <button
                className="undo-toast-action"
                type="button"
                onClick={() => {
                  setSavedToast(false);
                  onShare();
                }}
              >
                Share
              </button>
            )}
            {onUndo && (
              <button
                className="undo-toast-action"
                type="button"
                onClick={() => {
                  setSavedToast(false);
                  onUndo();
                }}
              >
                Undo
              </button>
            )}
            <button
              type="button"
              className="undo-toast-close"
              aria-label="Dismiss workout saved notification"
              onClick={() => setSavedToast(false)}
            >
              <Icon name="close" />
            </button>
          </div>,
          document.body,
        )}
      {rangeFor && routine && (
        <RepRangeDialog
          exerciseId={rangeFor.exerciseId}
          exerciseName={rangeFor.exerciseName}
          reps={rangeFor.reps}
          routine={routine}
          onClose={() => setRangeFor(null)}
          onSaved={(saved) => {
            setRoutine(saved);
            setRangeSaved((current) => [...current, rangeFor.exerciseId]);
            setRangeFor(null);
            onNotice('Rep range saved.');
          }}
        />
      )}
    </section>
  );
}
