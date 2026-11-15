import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { downloadFile, workoutExportFileName } from './downloadFile';
import { Icon } from './Icon';
import type { TrackedWorkout } from './types';
import './workoutShareMenu.css';

const NOTICE_MS = 4000;

/** One Share button for a saved workout: its share card, or its sets as a CSV file. */
export function WorkoutShareMenu({
  workout,
  onShareCard,
}: {
  workout: TrackedWorkout;
  onShareCard: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLSpanElement>(null);
  const menuId = useId();
  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(false), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  async function exportWorkout() {
    close();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(false);
    try {
      downloadFile(await api.exportWorkout(workout.id), workoutExportFileName(workout));
      setNotice(true);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'Could not export this workout. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <span
        ref={root}
        className="workout-share-menu"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
          }
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          if (!open) {
            setOpen(true);
            return;
          }
          const buttons = items();
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }}
      >
        <button
          ref={trigger}
          type="button"
          className="workout-share-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          disabled={busy}
          onClick={() => setOpen((value) => !value)}
        >
          {busy ? 'Exporting…' : 'Share'}
          <Icon name="chevron-down" />
        </button>
        {open && (
          <span
            ref={menu}
            id={menuId}
            className="workout-share-options"
            role="menu"
            aria-label="Share workout"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                onShareCard();
              }}
            >
              <Icon name="share" />
              Share card
            </button>
            <button type="button" role="menuitem" onClick={() => void exportWorkout()}>
              <Icon name="download" />
              Export CSV
            </button>
          </span>
        )}
      </span>
      {error && (
        <p className="inline-error workout-export-error" role="alert">
          {error}
        </p>
      )}
      {notice &&
        createPortal(
          <div
            className="undo-toast top-toast"
            role="status"
            style={{ '--undo-toast-duration': `${NOTICE_MS}ms` } as CSSProperties}
          >
            <span>Workout exported</span>
            <button
              type="button"
              className="undo-toast-close"
              aria-label="Dismiss export notification"
              onClick={() => setNotice(false)}
            >
              <Icon name="close" />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
