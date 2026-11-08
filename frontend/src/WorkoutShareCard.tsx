import { useEffect, useMemo, useState } from 'react';
import type { TrackedWorkout } from './types';
import { PopupDialog } from './PopupDialog';
import { NotificationDialog } from './NotificationDialog';
import { useWeightUnit } from './trainingPreferencesContext';
import {
  downloadWorkoutCard,
  defaultWorkoutCardStats,
  workoutCardPng,
  workoutCardPreview,
  workoutCardStats,
  workoutCardSvg,
  type WorkoutCardStat,
  type WorkoutCardStyle,
  type WorkoutCardLayout,
} from './workoutCard';
import './workoutShareCard.css';
import { useWorkoutShareReminder } from './useWorkoutShareReminder';
import { WorkoutShareReminderSetting } from './WorkoutShareReminderSetting';

export function WorkoutShareCard({
  workout,
  records,
  onClose,
}: {
  workout: TrackedWorkout;
  records: number;
  onClose: () => void;
}) {
  const unit = useWeightUnit();
  const [style, setStyle] = useState<WorkoutCardStyle>('midnight');
  const [selected, setSelected] = useState<WorkoutCardStat[]>(() =>
    defaultWorkoutCardStats(workout),
  );
  const [layout, setLayout] = useState<WorkoutCardLayout>('portrait');
  const [showDate, setShowDate] = useState(true);
  const [prepared, setPrepared] = useState<{ svg: string; file: File } | null>(null);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<'share' | 'copy' | null>(null);
  const busy = action !== null;
  const [message, setMessage] = useState<string | null>(null);
  const stats = workoutCardStats(workout, unit, records);
  const svg = workoutCardSvg({
    workout,
    stats: stats.filter((stat) => selected.includes(stat.id)),
    style,
    showDate,
    layout,
  });
  const preview = useMemo(() => workoutCardPreview(svg), [svg]);
  const file = prepared?.svg === svg ? prepared.file : null;
  const canShare = Boolean(
    file && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] }),
  );
  const canCopy =
    typeof navigator.clipboard?.write === 'function' && typeof ClipboardItem === 'function';

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void workoutCardPng(svg)
      .then((blob) => {
        if (!cancelled)
          setPrepared({
            svg,
            file: new File([blob], `relay-workout-${workout.workout_date}.png`, {
              type: 'image/png',
            }),
          });
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : 'Could not prepare the card. Try again.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [svg, retry, workout.workout_date]);

  async function share() {
    if (!file || busy) return;
    setAction('share');
    setError(null);
    setMessage(null);
    try {
      await navigator.share({ files: [file] });
      setMessage('Card shared');
    } catch (reason) {
      if (!(
        reason &&
        typeof reason === 'object' &&
        'name' in reason &&
        reason.name === 'AbortError'
      ))
        setError('Could not share the card. Download the PNG instead.');
    } finally {
      setAction(null);
    }
  }

  async function copy() {
    if (!file || busy || !canCopy) return;
    setAction('copy');
    setError(null);
    setMessage(null);
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': file })]);
      setMessage('Card copied');
    } catch {
      setError('Could not copy the image. Download the PNG instead.');
    } finally {
      setAction(null);
    }
  }

  return (
    <>
      <PopupDialog title="Share workout" className="workout-share-dialog" onClose={onClose}>
        <div className="workout-share-layout">
          <div className="workout-share-preview">
            <img src={preview} alt="Workout card preview" width="1080" />
          </div>
          <div className="workout-share-controls">
            <fieldset disabled={busy} className="workout-share-styles">
              <legend>Card style</legend>
              {(['midnight', 'paper'] as const).map((option) => (
                <label key={option} data-style={option}>
                  <input
                    type="radio"
                    name="workout-card-style"
                    value={option}
                    checked={style === option}
                    onChange={() => setStyle(option)}
                  />
                  <span>{option === 'midnight' ? 'Midnight' : 'Paper'}</span>
                </label>
              ))}
            </fieldset>
            <fieldset disabled={busy} className="workout-share-styles">
              <legend>Layout</legend>
              {(['portrait', 'compact'] as const).map((option) => (
                <label key={option}>
                  <input
                    type="radio"
                    name="workout-card-layout"
                    checked={layout === option}
                    onChange={() => setLayout(option)}
                  />
                  <span>{option === 'portrait' ? 'Portrait' : 'Compact'}</span>
                </label>
              ))}
            </fieldset>
            <fieldset disabled={busy} className="workout-share-stats">
              <legend>Include stats</legend>
              {stats.map((stat) => (
                <label key={stat.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(stat.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, stat.id]
                          : current.filter((id) => id !== stat.id),
                      )
                    }
                  />
                  <span>{stat.label}</span>
                  <small>{stat.value}</small>
                </label>
              ))}
            </fieldset>
            <label className="workout-share-date">
              <input
                type="checkbox"
                checked={showDate}
                disabled={busy}
                onChange={(event) => setShowDate(event.target.checked)}
              />
              Workout date
            </label>
            <WorkoutShareReminderSetting />
          </div>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}{' '}
            {!file && (
              <button type="button" onClick={() => setRetry((value) => value + 1)}>
                Retry
              </button>
            )}
          </p>
        )}
        <div className="popup-dialog-actions">
          <button
            type="button"
            disabled={!file || busy || !canCopy}
            title={canCopy ? undefined : 'Image copying is unavailable in this browser'}
            onClick={() => void copy()}
          >
            {action === 'copy' ? 'Copying…' : 'Copy image'}
          </button>
          <button
            type="button"
            className={canShare ? undefined : 'popup-primary-action'}
            disabled={!file || busy}
            onClick={() => {
              if (file) {
                downloadWorkoutCard(file);
                setMessage('Card downloaded');
              }
            }}
          >
            {!file && !error ? 'Preparing…' : 'Download PNG'}
          </button>
          {canShare && (
            <button
              type="button"
              className="popup-primary-action"
              disabled={busy}
              onClick={() => void share()}
            >
              {action === 'share' ? 'Sharing…' : 'Share image'}
            </button>
          )}
        </div>
        {message && (
          <NotificationDialog message={message} onClose={() => setMessage(null)} portal={false} />
        )}
      </PopupDialog>
    </>
  );
}

export function WorkoutSharePrompt({
  workout,
  records,
  onClose,
}: {
  workout: TrackedWorkout;
  records: number;
  onClose: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [enabled] = useWorkoutShareReminder();
  useEffect(() => {
    if (!enabled && !sharing) onClose();
  }, [enabled, sharing, onClose]);
  if (sharing) return <WorkoutShareCard workout={workout} records={records} onClose={onClose} />;
  if (!enabled) return null;
  return (
    <NotificationDialog
      message="Workout saved"
      durationMs={3000}
      countdown
      onClose={onClose}
      action={{ label: 'Share card', onClick: () => setSharing(true) }}
    />
  );
}
