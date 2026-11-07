import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { machineDate, machineUsedShort } from './machineHistory';
import { motionReduced } from './motion';
import { localDate } from './utils';
import type { Exercise, MachinePhotoUsage } from './types';
import './exerciseMachinePicker.css';

const PHOTO_TYPES = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

/** A swipeable row of an exercise's saved machines inside the exercise picker. */
export function ExerciseMachineStrip({
  exercise,
  machines,
  chosenId,
  lastUsedId,
  onToggle,
  onAddMachine,
}: {
  exercise: Exercise;
  machines: MachinePhotoUsage[];
  /** The machine checked for this exercise; `null` shows the baseline exercise. */
  chosenId: string | null;
  lastUsedId: string | null;
  onToggle: (machineId: string) => void;
  onAddMachine: (file: File, caption: string) => Promise<void>;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const [pending, setPending] = useState<{ file: File; previewUrl: string } | null>(null);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = localDate();

  const updateEdges = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    const start = rail.scrollLeft <= 2;
    const end = rail.scrollLeft >= max - 2;
    setEdges((current) =>
      current.start === start && current.end === end ? current : { start, end },
    );
  }, []);

  useEffect(() => {
    updateEdges();
    const rail = railRef.current;
    if (!rail || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [updateEdges, machines.length]);

  useEffect(
    () => () => {
      if (pending) URL.revokeObjectURL(pending.previewUrl);
    },
    [pending],
  );

  function scrollRail(direction: -1 | 1) {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.querySelector<HTMLElement>('.exercise-machine-card');
    const step = (card?.offsetWidth ?? 104) + 8;
    rail.scrollBy?.({ left: direction * step, behavior: motionReduced() ? 'auto' : 'smooth' });
  }

  function stagePhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setCaption('');
    setPending({ file, previewUrl: URL.createObjectURL(file) });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!pending || saving) return;
    const name = caption.trim();
    if (!name) {
      setError('Enter the machine name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onAddMachine(pending.file, name);
      setPending(null);
      setCaption('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this machine.');
    } finally {
      setSaving(false);
    }
  }

  const overflowing = !(edges.start && edges.end);

  return (
    <div className="exercise-machine-body">
      <div className="exercise-machine-heading">
        <strong>
          Machines <span>{machines.length}</span>
        </strong>
        {overflowing && (
          <div className="exercise-machine-arrows">
            <button
              type="button"
              aria-label={`Previous machines for ${exercise.name}`}
              disabled={edges.start}
              onClick={() => scrollRail(-1)}
            >
              <Icon name="chevron-left" />
            </button>
            <button
              type="button"
              aria-label={`More machines for ${exercise.name}`}
              disabled={edges.end}
              onClick={() => scrollRail(1)}
            >
              <Icon name="chevron-right" />
            </button>
          </div>
        )}
      </div>
      <div
        className="exercise-machine-rail"
        ref={railRef}
        role="region"
        aria-label={`Machines for ${exercise.name}`}
        tabIndex={0}
        onScroll={updateEdges}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            scrollRail(event.key === 'ArrowLeft' ? -1 : 1);
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const rail = event.currentTarget;
            rail.scrollTo?.({
              left: event.key === 'Home' ? 0 : rail.scrollWidth,
              behavior: motionReduced() ? 'auto' : 'smooth',
            });
          }
        }}
      >
        {machines.map((machine) => {
          const chosen = machine.id === chosenId;
          return (
            <button
              type="button"
              key={machine.id}
              className="exercise-machine-card"
              data-machine-id={machine.id}
              aria-pressed={chosen}
              onClick={() => onToggle(machine.id)}
            >
              <span className="exercise-machine-thumb">
                <img src={machine.thumbnail_url} alt="" loading="lazy" />
                {machine.id === lastUsedId && (
                  <span className="exercise-machine-badge">Last used</span>
                )}
                {chosen && (
                  <span className="exercise-machine-check" aria-hidden="true">
                    <Icon name="check" />
                  </span>
                )}
              </span>
              <strong title={machine.caption}>{machine.caption}</strong>
              <small
                title={
                  machine.last_used_date
                    ? `Last used ${machineDate(machine.last_used_date)}`
                    : undefined
                }
              >
                {machineUsedShort(machine.last_used_date, today)}
              </small>
            </button>
          );
        })}
        <label className="exercise-machine-card exercise-machine-add">
          <span className="exercise-machine-add-icon" aria-hidden="true">
            <Icon name="plus" />
          </span>
          <strong>Add machine</strong>
          <input
            className="sr-only"
            type="file"
            accept={PHOTO_TYPES}
            aria-label={`Add machine for ${exercise.name}`}
            onChange={(event) => {
              stagePhoto(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
      </div>
      {pending && (
        <span
          className="exercise-machine-add-layer"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            // Escape closes this prompt, not the exercise picker beneath it.
            if (event.key === 'Escape') event.stopPropagation();
          }}
        >
          <PopupDialog
            title="Add machine"
            kicker={exercise.name.toUpperCase()}
            className="exercise-machine-add-dialog"
            onClose={() => {
              if (!saving) setPending(null);
            }}
          >
            <form className="exercise-machine-add-form" onSubmit={(event) => void save(event)}>
              <img src={pending.previewUrl} alt="New machine preview" />
              <label>
                Machine name
                <input
                  autoFocus
                  value={caption}
                  maxLength={160}
                  disabled={saving}
                  placeholder="Machine name"
                  aria-invalid={Boolean(error)}
                  onChange={(event) => {
                    setCaption(event.target.value);
                    setError(null);
                  }}
                />
              </label>
              {error && (
                <p role="alert" className="inline-error">
                  {error}
                </p>
              )}
              <footer className="popup-dialog-actions">
                <button type="button" disabled={saving} onClick={() => setPending(null)}>
                  Cancel
                </button>
                <button type="submit" className="popup-primary-action" disabled={saving}>
                  {saving ? 'Saving…' : 'Save machine'}
                </button>
              </footer>
            </form>
          </PopupDialog>
        </span>
      )}
    </div>
  );
}
